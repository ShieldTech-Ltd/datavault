import type { Env } from '../lib/types';
import {deployment,secureTransport} from '../lib/account-session';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
export async function handleStatus(request:Request,env:Env) {
 const {chainId,contract}=deployment(env),now=Date.now(),cadence=300000,end=Math.floor(now/cadence)*cadence,start=end-86400000;
 const path=new URL(request.url).pathname;
 if(path==='/api/health') {
 let d1=false,r2=false;
 try{await env.DB.prepare('SELECT 1').first();d1=true;}catch{}
 try{await env.COLLECTION_STORE.head('__datavault_health_probe__');r2=true;}catch{}
 return json({status:d1&&r2?'up':'down',components:{workerApi:true,d1,r2},model:'not_monitored',payment:'not_monitored'},d1&&r2?200:503);
 }
 if(path==='/api/status/observations') {
 if(!secureTransport(request,env) || !env.MONITOR_SECRET || env.MONITOR_SECRET.length<32 || request.headers.get('Authorization')!==`Bearer ${env.MONITOR_SECRET}`)return json({error:'Unauthorized'},401);
 let input:any;try{input=await request.json();}catch{return json({error:'Invalid observations'},400);}
 if(!input || Object.keys(input).join()!=='samples' || !Array.isArray(input.samples) || !input.samples.length || input.samples.length>50 || input.samples.some((s:any)=>!s || Object.keys(s).sort().join()!=='component,status,timestamp' || s.component!=='worker_api' || !['up','down'].includes(s.status) || !Number.isSafeInteger(s.timestamp) || s.timestamp%cadence!==0 || s.timestamp>now || s.timestamp<start))return json({error:'Invalid observations'},400);
 if(new Set(input.samples.map((s:any)=>s.timestamp)).size!==input.samples.length)return json({error:'Duplicate intervals'},409);
 try{await env.DB.batch(input.samples.map((s:any)=>env.DB.prepare('INSERT INTO service_observations VALUES (?,?,?,?)').bind(chainId,contract,s.timestamp,s.status)));}catch(error){return error instanceof Error && /UNIQUE constraint failed/.test(error.message)?json({error:'Duplicate intervals'},409):json({error:'Observation storage unavailable'},503);}
 await env.DB.prepare('DELETE FROM service_observations WHERE sample_at<?').bind(start-cadence).run();
 return json({accepted:input.samples.length});
 }
 const rows=await env.DB.prepare('SELECT sample_at,status FROM service_observations WHERE chain_id=? AND contract_address=? AND sample_at>=? AND sample_at<? ORDER BY sample_at').bind(chainId,contract,start,end).all<{sample_at:number;status:string}>();
 const n=rows.results.length,coverage=n/288,latest=rows.results.at(-1)?.sample_at??null,sufficient=!!env.MONITOR_SECRET&&env.MONITOR_SECRET.length>=32&&n>=30&&coverage>=.8&&latest!==null&&now-latest<=cadence*2;
 return json({component:'worker_api',monitoring:env.MONITOR_SECRET&&env.MONITOR_SECRET.length>=32?'configured':'disabled',status:sufficient?'observed':'unknown',windowStart:new Date(start).toISOString(),windowEnd:new Date(end).toISOString(),cadenceSeconds:300,expectedSamples:288,validSamples:n,coverage,latestObservation:latest===null?null:new Date(latest).toISOString(),availabilityPercent:sufficient?100*rows.results.filter(r=>r.status==='up').length/n:null,model:'not_monitored',payment:'not_monitored'});
}
