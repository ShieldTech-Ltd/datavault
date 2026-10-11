import type {Env} from './types';
import {digest,randomToken,type AccountRow} from './account-session';
export const GITHUB_API_VERSION='2026-03-10';
const MAX_RESPONSE=2_000_000,MAX_TEXT=500_000,TTL=86_400_000,LEASE=120_000;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
type Selection={repository:string;ref:string;paths:string[]};
type Job={id:string;account_id:string;repository:string;ref:string;paths:string;commit_sha:string|null;status:string;idempotency_key:string;attempts:number;lease_token:string|null;lease_expires_at:number|null;draft_key:string|null;content_digest:string|null;error:string|null;created_at:number;expires_at:number};
function selection(v:any):v is Selection {
 return Boolean(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every(k=>['repository','ref','paths'].includes(k)) &&
 typeof v.repository==='string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(v.repository) &&
 typeof v.ref==='string' && v.ref.length<=100 && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(v.ref) && !v.ref.includes('..') && !v.ref.includes('//') && !v.ref.endsWith('/') &&
 Array.isArray(v.paths) && v.paths.length>0 && v.paths.length<=10 && new Set(v.paths).size===v.paths.length && v.paths.every((p:unknown)=>typeof p==='string' && p.length<=240 && /^[a-zA-Z0-9_ .\-/]+\.(md|txt)$/i.test(p) && p.split('/').every(s=>s.length>0 && s!=='.' && s!=='..' && s.trim()===s)));
}
const metadata=(j:Job)=>({id:j.id,repository:j.repository,ref:j.ref,paths:JSON.parse(j.paths),commitSha:j.commit_sha,status:j.status,attempts:j.attempts,contentDigest:j.content_digest,error:j.error,createdAt:j.created_at,expiresAt:j.expires_at});
async function owned(env:Env,account:AccountRow,id:string){return env.DB.prepare('SELECT * FROM github_import_jobs WHERE id=? AND account_id=?').bind(id,account.account_id).first<Job>();}
export async function githubImportMetadata(env:Env,account:AccountRow){return (await env.DB.prepare('SELECT * FROM github_import_jobs WHERE account_id=? ORDER BY created_at DESC LIMIT 100').bind(account.account_id).all<Job>()).results.map(metadata);}
async function recoverExhaustedLeases(env:Env,id:string|null=null){
 const now=Date.now();
 // Fence crashed final attempts and release the inflight slot. Keep tracked objects for expiry.
 await env.DB.prepare("UPDATE github_import_jobs SET status='failed',lease_token=NULL,lease_expires_at=NULL,error='GitHub import failed. Check public repository, ref and selected text paths, then retry.' WHERE id IN (SELECT id FROM github_import_jobs WHERE status='running' AND attempts>=3 AND lease_expires_at<=? AND expires_at>? AND (? IS NULL OR id=?) ORDER BY lease_expires_at LIMIT 20)").bind(now,now,id,id).run();
}
export async function cleanupGithubImports(env:Env){
 await recoverExhaustedLeases(env);
 const rows=(await env.DB.prepare("SELECT * FROM github_import_jobs WHERE expires_at<=? AND (status!='expired' OR draft_key IS NOT NULL) ORDER BY expires_at LIMIT 20").bind(Date.now()).all<Job>()).results;
 for(const j of rows){await env.DB.prepare("UPDATE github_import_jobs SET status='expired',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND expires_at<=?").bind(j.id,Date.now()).run();if(j.draft_key)await env.COLLECTION_STORE.delete(j.draft_key);await env.DB.prepare('UPDATE github_import_jobs SET draft_key=NULL WHERE id=?').bind(j.id).run();}
}
// workerd supports manual, not error. Every redirect is rejected before body reads.
// Fixed origin only, no credentials and no recursive tree or download URL traversal.
async function githubJson(path:string,budget:{bytes:number},signal:AbortSignal):Promise<any>{
 const response=await fetch('https://api.github.com'+path,{redirect:'manual',signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':GITHUB_API_VERSION,'User-Agent':'DataVault-public-import'}});
 if(!response.ok || response.status>=300 || !response.body)throw Error('provider');
 const length=response.headers.get('Content-Length');if(length && (!/^\d+$/.test(length)||Number(length)>MAX_RESPONSE-budget.bytes))throw Error('size');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;budget.bytes+=part.value.byteLength;if(budget.bytes>MAX_RESPONSE)throw Error('size');chunks.push(part.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
}
async function active(env:Env,id:string,token:string){return env.DB.prepare("SELECT id FROM github_import_jobs WHERE id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND expires_at>?").bind(id,token,Date.now(),Date.now()).first();}
export async function runGithubImport(env:Env,id:string):Promise<void>{
 await recoverExhaustedLeases(env,id);
 const token=randomToken(),now=Date.now();
 const claim=await env.DB.prepare("UPDATE github_import_jobs SET status='running',lease_token=?,lease_expires_at=?,attempts=attempts+1,error=NULL WHERE id=? AND expires_at>? AND attempts<3 AND (status IN ('queued','failed') OR (status='running' AND lease_expires_at<=?)) AND NOT EXISTS(SELECT 1 FROM github_import_jobs x WHERE x.account_id=github_import_jobs.account_id AND x.id!=github_import_jobs.id AND (x.status IN ('queued','running') OR (x.status='review_ready' AND x.idempotency_key=github_import_jobs.idempotency_key)))").bind(token,now+LEASE,id,now,now).run();
 if(claim.meta.changes!==1)return;
 const j=await env.DB.prepare('SELECT * FROM github_import_jobs WHERE id=?').bind(id).first<Job>();if(!j)return;
 const key=`private-import-drafts/${j.account_id}/${id}/${token}.md`,controller=new AbortController();
 // Whole bounded import has one ten-second deadline, including streamed bodies.
 const timer=setTimeout(()=>controller.abort(),10_000);let written=false;
 try{
  const repo=j.repository.split('/').map(encodeURIComponent).join('/'),budget={bytes:0};let sha=j.commit_sha;
  if(!sha){const commit=await githubJson(`/repos/${repo}/commits/${encodeURIComponent(j.ref)}`,budget,controller.signal);if(typeof commit.sha!=='string'||!/^[a-f0-9]{40}$/.test(commit.sha))throw Error('commit');sha=commit.sha;
   await env.DB.prepare("UPDATE github_import_jobs SET commit_sha=? WHERE id=? AND lease_token=? AND status='running'").bind(sha,id,token).run();}
  const paths=JSON.parse(j.paths) as string[],parts:string[]=[];
  for(const path of paths){if(!await active(env,id,token))return;const file=await githubJson(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${sha}`,budget,controller.signal);
   if(file.type!=='file'||file.path!==path||file.encoding!=='base64'||typeof file.content!=='string'||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_TEXT||file.submodule_git_url||file.target)throw Error('file');
   const encoded=file.content.replace(/\s/g,'');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('encoding');
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(bytes.byteLength!==file.size)throw Error('size');
   const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)||!text.trim())throw Error('binary');
   parts.push(paths.length>1?`## ${path}\n\n${text}`:text);if(new TextEncoder().encode(parts.join('\n\n')).byteLength>MAX_TEXT)throw Error('size');
  }
  if(controller.signal.aborted)throw Error('timeout');
  if(!await active(env,id,token))return;
  const text=parts.join('\n\n'),hash=await digest(text);
  // Persist the eventual object before writing it so expiry also cleans crash leftovers.
  const track=await env.DB.prepare("UPDATE github_import_jobs SET draft_key=? WHERE id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND expires_at>?").bind(key,id,token,Date.now(),Date.now()).run();
  if(track.meta.changes!==1)return;
  if(j.draft_key && j.draft_key!==key)await env.COLLECTION_STORE.delete(j.draft_key);
  await env.COLLECTION_STORE.put(key,text,{httpMetadata:{contentType:'text/markdown; charset=utf-8'},customMetadata:{repository:j.repository,commitSha:sha!,paths:j.paths,contentDigest:hash,expiresAt:String(j.expires_at)}});written=true;
  const finish=await env.DB.prepare("UPDATE github_import_jobs SET status='review_ready',draft_key=?,content_digest=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND expires_at>?").bind(key,hash,id,token,Date.now(),Date.now()).run();if(finish.meta.changes!==1)await env.COLLECTION_STORE.delete(key);
 }catch{
  if(written)await env.COLLECTION_STORE.delete(key);
  await env.DB.prepare("UPDATE github_import_jobs SET status='failed',error='GitHub import failed. Check public repository, ref and selected text paths, then retry.',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='running' AND lease_token=?").bind(id,token).run();
 }finally{clearTimeout(timer);}
}
export async function handleGithubImports(request:Request,env:Env,account:AccountRow):Promise<Response|null>{
 const url=new URL(request.url),match=/^\/api\/account\/imports\/github(?:\/([a-f0-9]{64})(?:\/(draft|cancel|run))?)?$/.exec(url.pathname);if(!match)return null;
 await cleanupGithubImports(env);const id=match[1],action=match[2];
 if(request.method==='GET'&&!id)return json({jobs:await githubImportMetadata(env,account),dispatch:'bounded_inline',publicOnly:true});
 if(request.method==='POST'&&!id){
  let input:any;try{if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw 0;input=await request.json();}catch{return json({error:'Invalid GitHub import selection.'},400);}
  if(!selection(input))return json({error:'Select 1 to 10 distinct relative Markdown or TXT files from a public owner/repository and bounded ref.'},400);
  const now=Date.now(),key=await digest(JSON.stringify({repository:input.repository.toLowerCase(),ref:input.ref,paths:[...input.paths].sort()}));
  const existing=await env.DB.prepare("SELECT * FROM github_import_jobs WHERE account_id=? AND idempotency_key=? AND status IN ('queued','running','review_ready') AND expires_at>?").bind(account.account_id,key,now).first<Job>();if(existing)return json(metadata(existing));
  const jobId=randomToken();
  try{const inserted=await env.DB.prepare("INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at) SELECT ?,?,?,?,?,'queued',?,?,? WHERE (SELECT COUNT(*) FROM github_import_jobs WHERE account_id=? AND created_at>?)<20 AND NOT EXISTS(SELECT 1 FROM github_import_jobs WHERE account_id=? AND status IN ('queued','running'))").bind(jobId,account.account_id,input.repository,input.ref,JSON.stringify(input.paths),key,now,now+TTL,account.account_id,now-TTL,account.account_id).run();if(inserted.meta.changes!==1)return json({error:'Maximum one inflight import and 20 jobs per rolling day.'},429);}catch{return json({error:'Maximum one inflight import and 20 jobs per rolling day.'},429);}
  await runGithubImport(env,jobId);return json(metadata((await owned(env,account,jobId))!),201);
 }
 if(!id)return json({error:'Not found'},404);let job=await owned(env,account,id);if(!job)return json({error:'Import not found.'},404);
 if(request.method==='GET'&&!action)return json(metadata(job));
 if(request.method==='GET'&&action==='draft'){
  if(job.status!=='review_ready'||job.expires_at<=Date.now()||!job.draft_key)return json({error:'Private draft is unavailable.'},409);
  const object=await env.COLLECTION_STORE.get(job.draft_key);if(!object)return json({error:'Private draft is unavailable.'},409);
  const text=await object.text();job=await owned(env,account,id);if(!job||job.status!=='review_ready'||job.expires_at<=Date.now()||new TextEncoder().encode(text).byteLength>MAX_TEXT)return json({error:'Private draft is unavailable.'},409);
  return new Response(text,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Disposition':url.searchParams.get('download')==='1'?'attachment; filename="github-import.md"':'inline','X-Content-Type-Options':'nosniff'}});
 }
 if(request.method==='POST'&&(action==='cancel'||action==='run')){
  try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw 0;}catch{return json({error:'Empty JSON object required.'},400);}
  if(action==='cancel'){await env.DB.prepare("UPDATE github_import_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND account_id=? AND status!='expired'").bind(id,account.account_id).run();if(job.draft_key)await env.COLLECTION_STORE.delete(job.draft_key);await env.DB.prepare('UPDATE github_import_jobs SET draft_key=NULL WHERE id=?').bind(id).run();}
  else await runGithubImport(env,id);
  return json(metadata((await owned(env,account,id))!));
 }
 return json({error:'Not found'},404);
}
