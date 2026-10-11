import type { Env } from './types';
import type { AccountRow } from './account-session';
const RETENTION = 30 * 86_400_000;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function savedItems(env:Env,account:AccountRow,kind:'bookmarks'|'saved-questions',limit:number|null=50,cursor=Number.MAX_SAFE_INTEGER) {
  const table=kind==='bookmarks'?'account_bookmarks':'account_saved_questions';
  return (await env.DB.prepare(`SELECT s.id,s.collection_id AS collectionId,c.collection_name AS collectionName,s.created_at AS createdAt ${kind==='saved-questions'?',s.question,s.expires_at AS expiresAt':''}
    FROM ${table} s JOIN collections c ON c.collection_id=s.collection_id WHERE s.account_id=? AND s.id<?
    AND c.status='confirmed' AND c.chain_id=? AND c.contract_address=? ${kind==='saved-questions'?'AND s.expires_at > ?':''} ORDER BY s.id DESC ${limit===null?'':'LIMIT ?'}`)
    .bind(account.account_id,cursor,account.chain_id,account.contract_address,...(kind==='saved-questions'?[Date.now()]:[]),...(limit===null?[]:[limit])).all()).results;
}
export async function handleSavedItems(request:Request,env:Env,account:AccountRow):Promise<Response|null> {
  const url=new URL(request.url),match=/^\/api\/account\/(bookmarks|saved-questions)(?:\/([1-9][0-9]*))?$/.exec(url.pathname);
  if(!match)return null;
  const kind=match[1] as 'bookmarks'|'saved-questions',id=match[2],table=kind==='bookmarks'?'account_bookmarks':'account_saved_questions';
  // Small bounded cleanup batches keep expired questions out of every read and export immediately.
  await env.DB.prepare('DELETE FROM account_saved_questions WHERE id IN (SELECT id FROM account_saved_questions WHERE expires_at <= ? ORDER BY expires_at LIMIT 100)').bind(Date.now()).run();
  if(request.method==='GET'&&!id){
    const raw=url.searchParams.get('limit')??'20',cursor=url.searchParams.get('cursor');
    if(!/^[1-9][0-9]*$/.test(raw)||Number(raw)>50||(cursor!==null&&(!/^[1-9][0-9]*$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))))return json({error:'Invalid pagination'},400);
    const rows=await savedItems(env,account,kind,Number(raw)+1,cursor===null?Number.MAX_SAFE_INTEGER:Number(cursor)),items=rows.slice(0,Number(raw));
    return json({items,nextCursor:rows.length>Number(raw)?String((items.at(-1) as {id:number}).id):null,retentionDays:kind==='saved-questions'?30:null});
  }
  if(request.method==='DELETE'&&id){
    try{if(!(request.headers.get('Content-Type')??'').toLowerCase().startsWith('application/json'))throw 0;const input=await request.json();if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw 0;}catch{return json({error:'Deletion accepts only an empty JSON object.'},400);}
    if(!Number.isSafeInteger(Number(id)))return json({error:'Invalid item ID'},400);
    await env.DB.prepare(`DELETE FROM ${table} WHERE account_id=? AND id=?`).bind(account.account_id,Number(id)).run();return json({deleted:true});
  }
  if(request.method==='POST'&&!id){
    let input:any;try{if(!(request.headers.get('Content-Type')??'').toLowerCase().startsWith('application/json'))throw 0;input=await request.json();}catch{return json({error:'Invalid JSON'},400);}
    const fields=kind==='bookmarks'?['collectionId']:['collectionId','question','optIn'];
    if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!fields.includes(key))||typeof input.collectionId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(input.collectionId)||(kind==='saved-questions'&&(input.optIn!==true||typeof input.question!=='string'||!input.question.trim()||input.question.length>1000)))return json({error:'A confirmed collection and explicit per-save question opt-in are required.'},400);
    const collection=input.collectionId.toLowerCase();
    if(!await env.DB.prepare("SELECT collection_id FROM collections WHERE collection_id=? AND status='confirmed' AND chain_id=? AND contract_address=?").bind(collection,account.chain_id,account.contract_address).first())return json({error:'Confirmed collection not found in this deployment.'},404);
    const now=Date.now();
    if(kind==='bookmarks')await env.DB.prepare('INSERT INTO account_bookmarks(account_id,collection_id,created_at) VALUES(?,?,?) ON CONFLICT(account_id,collection_id) DO NOTHING').bind(account.account_id,collection,now).run();
    else {
      // The count and insert are one SQLite statement, so concurrent saves cannot exceed the cap.
      const inserted=await env.DB.prepare(`INSERT INTO account_saved_questions(account_id,collection_id,question,created_at,expires_at)
        SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM account_saved_questions WHERE account_id=? AND expires_at>?)<50`)
        .bind(account.account_id,collection,input.question,now,now+RETENTION,account.account_id,now).run();
      if(inserted.meta.changes!==1)return json({error:'Saved question limit is 50 active questions. Delete an item first.'},409);
    }
    return json({saved:true,retentionDays:kind==='saved-questions'?30:null},201);
  }
  return json({error:'Not found'},404);
}
