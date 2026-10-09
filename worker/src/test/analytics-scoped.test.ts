import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { sqliteD1 } from './sqlite-d1';
import type { Env } from '../lib/types';
vi.mock('../lib/chain-identity',()=>({rpcMatchesConfiguredChain:vi.fn(async()=>true)}));
import { handleMarketplaceAnalytics,handleOwnerAnalytics } from '../routes/analytics';
const owner=privateKeyToAccount(('0x'+'37'.repeat(32)) as `0x${string}`), contract='0x'+'ab'.repeat(20),id='0x'+'cd'.repeat(32),unlisted='0x'+'ef'.repeat(32),time=Date.parse('2026-10-08');
let store:ReturnType<typeof sqliteD1>,env:Env;
beforeEach(()=>{store=sqliteD1();env={DB:store.db,CHAIN_ID:'10143',CONTRACT_ADDRESS:contract} as Env;for(const collection of [id,unlisted])store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)").all(collection,owner.address.toLowerCase(),' \t=Guide,"quote"',collection,time,10143,contract);
store.sqlite.prepare("INSERT INTO collection_metadata(chain_id,contract_address,collection_id,visibility,updated_at) VALUES(?,?,?,'unlisted',?)").all(10143,contract,unlisted,time);
});
afterEach(()=>store.close());
function add(n:number,collection=id,outcome='settled',created=time,settled:number|null=time,amount:string|null='9007199254740993000') {store.sqlite.prepare('INSERT INTO queries(request_id,collection_id,buyer_address,policy_version,created_at,settled_at,outcome,amount_wei,chain_id,contract_address) VALUES(?,?,?,?,?,?,?,?,?,?)').all('0x'+n.toString(16).padStart(64,'0'),collection,owner.address.toLowerCase(),1,created,settled,outcome,amount,10143,contract);}
async function signed(exportCsv=false){const timestamp=Date.now(),signature=await owner.signMessage({message:`datavault-owner-summary:10143:${contract}:${owner.address.toLowerCase()}:${timestamp}`});return new Request(`https://v/api/owner/analytics${exportCsv?'/export':''}?address=${owner.address}&start=2026-10-08&end=2026-10-09`,{headers:{'x-signature':signature,'x-timestamp':String(timestamp)}});}
it('uses exact UTC exclusive window, public visibility and failure creation date in real SQL',async()=>{
add(1);add(2);add(3,unlisted);add(4,id,'settled',time,Date.parse('2026-10-09'));add(5,id,'failed',time,null,null);add(6,id,'refunded',Date.parse('2026-10-09'),null,null);
const data=await (await handleMarketplaceAnalytics(env,new Request('https://v/api?start=2026-10-08&end=2026-10-09'))).json() as any;
expect(data.paidQueries).toBe(2);expect(data.recordedRevenueWei).toBe('18014398509481986000');expect(data.failedQueries).toBe(1);expect(data.refundedQueries).toBe(0);expect(data.daily).toHaveLength(1);expect(data.recentActivity).toHaveLength(2);
const owned=await (await handleOwnerAnalytics(await signed(),env)).json() as any;expect(owned.paidQueries).toBe(3);
const response=await handleOwnerAnalytics(await signed(true),env);expect(response.headers.get('content-type')).toContain('text/csv');const text=await response.text();expect(text).toContain('9007199254740993000');expect(text).toContain("' \t=Guide,\"\"quote\"\"");expect(text.split('\r\n')).toHaveLength(5);expect(text).not.toContain('buyer_address');
});
it('fails visibly for10001 records rather than truncating public summary or owner CSV',async()=>{
const overflow={...env,DB:{prepare:()=>({bind:()=>({all:async()=>({results:Array.from({length:10001},()=>({}))})})})}} as unknown as Env;
expect((await handleMarketplaceAnalytics(overflow)).status).toBe(503);const exported=await handleOwnerAnalytics(await signed(true),overflow);expect(exported.status).toBe(503);expect(await exported.text()).toContain('aggregation limit');
});
