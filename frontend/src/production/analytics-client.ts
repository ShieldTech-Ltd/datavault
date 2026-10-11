import { ownerSummaryMessage } from '../../../shared/api';
import type { AccountWallet } from './account-client';
import { apiJson, type Analytics } from './api';
export type DateWindow = {start:string;end:string};
export function defaultDateWindow(now=Date.now()):DateWindow {
  const end=Math.floor(now/86400000)*86400000+86400000;
  return {start:new Date(end-30*86400000).toISOString().slice(0,10),end:new Date(end).toISOString().slice(0,10)};
}
export const windowQuery=(window:DateWindow)=>`start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`;
export class SignedAnalyticsClient {
  constructor(private chainId:number,private contract:string,private network:typeof fetch=(...args)=>fetch(...args)){}
  async read(wallet:AccountWallet,window:DateWindow,current:()=>boolean,exportCsv=false):Promise<Analytics|Blob|null> {
    const client=await wallet.getWalletClient();
    if(await client.getChainId()!==this.chainId)throw new Error('Switch to the deployment network first.');
    if(!current())return null;
    const address=wallet.address.toLowerCase(),timestamp=Date.now();
    const signature=await client.signMessage({message:ownerSummaryMessage(this.chainId,this.contract,address,timestamp)});
    const latest=await wallet.getWalletClient();
    if(await latest.getChainId()!==this.chainId||!current())return null;
    const path=`/api/owner/analytics${exportCsv?'/export':''}?address=${address}&${windowQuery(window)}`;
    const response=await this.network(path,{headers:{'x-signature':signature,'x-timestamp':String(timestamp)},cache:'no-store'});
    if(!current())return null;
    if(!response.ok)throw new Error(response.status===503?'Analytics exceeds the 10,000-record exact aggregation limit or the deployment is unavailable. Choose a smaller window and retry.':response.status===400?'Use valid UTC dates with an exclusive end, from 1 to 90 days.':'Wallet authorization or analytics service unavailable. Retry.');
    if(exportCsv){if(!response.headers.get('Content-Type')?.startsWith('text/csv'))throw new Error('Invalid export response.');const blob=await response.blob();return current()?blob:null;}
    const value=await response.json();
    if(value.ownerAddress!==address||value.windowStart!==window.start+'T00:00:00.000Z'||value.windowEnd!==window.end+'T00:00:00.000Z')throw new Error('Analytics response does not match this wallet and window.');
    const validated=await apiJson<Analytics>(path,undefined,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));
    return current()?validated:null;
  }
}
