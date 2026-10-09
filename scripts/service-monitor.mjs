import {readFile,writeFile,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function validateMonitorOrigin(value,chainId){
 const url=new URL(value);
 const local=url.protocol==='http:'&&chainId==='31337'&&['localhost','127.0.0.1'].includes(url.hostname);
 if((url.protocol!=='https:'&&!local)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Configure a fixed HTTPS origin (local loopback only for chain 31337)');
 return url.origin;
}
export async function monitorOnce({origin,chainId,secret,spool,now=Date.now(),fetcher=fetch}){
 origin=validateMonitorOrigin(origin,chainId);
 if(typeof secret!=='string'||!secret.length)throw Error('Monitor secret required');
 let saved={origin,samples:[]};
 try{saved=JSON.parse(await readFile(spool,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Invalid monitor spool');}
 if(saved.origin!==origin||!Array.isArray(saved.samples))throw Error('Monitor spool origin mismatch');
 const timestamp=Math.floor(now/300000)*300000;
 let status='down';
 try{const response=await fetcher(origin+'/api/health',{redirect:'error',signal:AbortSignal.timeout(15000)});status=response.ok?'up':'down';}catch{}
 const samples=new Map(saved.samples.filter(s=>Number.isSafeInteger(s.timestamp)&&s.timestamp>=timestamp-86400000&&['up','down'].includes(s.status)&&s.component==='worker_api').map(s=>[s.timestamp,s]));
 if(!samples.has(timestamp))samples.set(timestamp,{component:'worker_api',timestamp,status});
 saved.samples=[...samples.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-289);
 const persist=async()=>{await writeFile(spool+'.tmp',JSON.stringify(saved),{mode:0o600});await rename(spool+'.tmp',spool);};
 // Persist before network submission. A restart can safely repeat an accepted interval.
 await persist();
 while(saved.samples.length){
 const batch=saved.samples.slice(0,50);
 try{
 const response=await fetcher(origin+'/api/status/observations',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({samples:batch})});
 // Duplicate intervals from a lost acknowledgement are retried individually, never discarded as a batch.
 if(response.status===409&&batch.length>1){
 for(const sample of batch){const retry=await fetcher(origin+'/api/status/observations',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({samples:[sample]})});if(!retry.ok&&retry.status!==409)return {queued:saved.samples.length};saved.samples=saved.samples.filter(s=>s.timestamp!==sample.timestamp);await persist();}
 continue;
 }
 if(!response.ok&&response.status!==409)break;
 if(response.ok){const accepted=await response.json();if(accepted.accepted!==batch.length)break;}
 saved.samples=saved.samples.slice(batch.length);await persist();
 }catch{break;}
 }
 return {queued:saved.samples.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await monitorOnce({origin:process.env.DV_MONITOR_ORIGIN,chainId:process.env.DV_MONITOR_CHAIN_ID,secret:process.env.DV_MONITOR_SECRET,spool:process.env.DV_MONITOR_SPOOL??'datavault-monitor-spool.json'});console.log(JSON.stringify(result));if(result.queued)process.exitCode=1;}catch{console.error('Monitor configuration or spool unavailable');process.exitCode=1;}
}
