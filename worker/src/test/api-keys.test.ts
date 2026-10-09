import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import { digest } from '../lib/account-session';
import type { Env } from '../lib/types';
vi.mock('../lib/chain-identity',()=>({rpcMatchesConfiguredChain:vi.fn(async()=>true)}));
vi.mock('../lib/policy',()=>({getOnChainCollection:vi.fn(async()=>({owner:'0x'+'11'.repeat(20)}))}));
import { rpcMatchesConfiguredChain } from '../lib/chain-identity';
import { getOnChainCollection } from '../lib/policy';
const address='0x'+'11'.repeat(20),contract='0x'+'ab'.repeat(20),id='0x'+'cd'.repeat(32),token='aa'.repeat(32),csrf='bb'.repeat(32);
let store:ReturnType<typeof sqliteD1>,env:Env;
beforeEach(async()=>{vi.spyOn(Date,'now').mockReturnValue(1791540000000);store=sqliteD1();env={DB:store.db,CHAIN_ID:'10143',CONTRACT_ADDRESS:contract} as Env;
vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(true);vi.mocked(getOnChainCollection).mockResolvedValue({owner:address} as any);
store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all('alice',address,10143,contract,Date.now(),Date.now());
store.sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)').all(await digest(token),'alice',csrf,Date.now()+100000,Date.now());
store.sqlite.prepare("INSERT INTO collections(collection_id,owner_address,collection_name,content_hash,created_at,status,chain_id,contract_address) VALUES(?,?,?,?,?,'confirmed',?,?)").all(id,address,'Guide',id,Date.now(),10143,contract);
});afterEach(()=>{store.close();vi.restoreAllMocks();});
const input=()=>({name:'Integration',collectionIds:[id],expiresInDays:30,scopes:['collections:read']});
const call=(path='account/api-keys',method='GET',body?:unknown,headers:Record<string,string>={})=>worker.fetch(new Request('https://vault.example/api/'+path,{method,headers:{Origin:'https://vault.example','Content-Type':'application/json',Cookie:'dv_session='+token,'x-csrf-token':csrf,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
const create=async()=>await (await call('account/api-keys','POST',input())).json() as any;
it('requires account session, CSRF, strict scope/ID uniqueness and live deployment ownership',async()=>{
expect((await call('account/api-keys','POST',input(),{Cookie:''})).status).toBe(401);
expect((await call('account/api-keys','POST',input(),{'x-csrf-token':''})).status).toBe(403);
for(const body of [{...input(),scopes:['collections:read','collections:read']},{...input(),collectionIds:[id,id]},{...input(),scopes:['query:execute']},{...input(),extra:true},{...input(),expiresInDays:91}])expect((await call('account/api-keys','POST',body)).status).toBe(400);
vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(false);expect((await call('account/api-keys','POST',input())).status).toBe(503);
vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(true);vi.mocked(getOnChainCollection).mockResolvedValue({owner:contract} as any);expect((await call('account/api-keys','POST',input())).status).toBe(403);
store.sqlite.prepare('UPDATE collections SET chain_id=1').all();expect((await call('account/api-keys','POST',input())).status).toBe(403);
});
it('returns secret once, atomically caps concurrent keys and excludes revoked/expired keys',async()=>{
const key=await create();expect(key.secret).toMatch(/^dv_[a-f0-9]{64}$/);
const listed=await (await call()).json() as any;expect(listed.keys[0].status).toBe('active');expect(JSON.stringify(listed)).not.toContain(key.secret);
const saved=store.sqlite.prepare('SELECT * FROM developer_keys').all()[0];expect(saved.secret_hash).toBe(await digest(key.secret));expect(JSON.stringify(saved)).not.toContain(key.secret);
const responses=await Promise.all(Array.from({length:6},()=>call('account/api-keys','POST',input())));expect(responses.filter(r=>r.status===201)).toHaveLength(4);expect(responses.filter(r=>r.status===409)).toHaveLength(2);
expect((await call('account/api-keys/'+key.key.id,'DELETE',{})).status).toBe(200);expect((await call('account/api-keys','POST',input())).status).toBe(201);
store.sqlite.prepare('UPDATE developer_keys SET expires_at=0 WHERE revoked_at IS NULL').all();expect((await call('account/api-keys','POST',input())).status).toBe(201);
});
it('exposes only allowed owned metadata, denies ambiguous credentials and keeps paid auth intact',async()=>{
const key=await create(),auth={Authorization:'Bearer '+key.secret,Cookie:''};
store.sqlite.prepare("INSERT INTO collection_metadata(chain_id,contract_address,collection_id,description,category,visibility,updated_at) VALUES(?,?,?,?,?,'unlisted',?)").all(10143,contract,id,'Private description','Research',Date.now());
const response=await call('developer/collections','GET',undefined,auth);expect(response.status).toBe(200);const data=await response.json() as any;expect(data.collections).toHaveLength(1);expect(data.collections[0].visibility).toBe('unlisted');expect(JSON.stringify(data)).not.toContain(address);expect(JSON.stringify(data)).not.toContain('content_hash');
for(const path of ['developer/collections?key='+key.secret,'developer/collections?collectionId=other'])expect((await call(path,'GET',undefined,auth)).status).toBe(400);
expect((await call('developer/collections','GET',undefined,{...auth,Authorization:auth.Authorization+', '+auth.Authorization})).status).toBe(401);
expect((await call('account/api-keys','GET',undefined,auth)).status).toBe(401);
env.MODEL_PROVIDER='openai';env.MODEL_API_KEY='test-only';env.SETTLEMENT_PRIVATE_KEY='0x'+Array.from({length:32},(_,n)=>(n+1).toString(16).padStart(2,'0')).join('');
expect((await call('queries/execute','POST',{requestId:id,collectionId:id,question:'test question',openTxHash:id},auth)).status).toBe(401);
expect((await call('queries/'+id+'/answer','GET',undefined,auth)).status).toBe(401);
vi.mocked(getOnChainCollection).mockResolvedValue({owner:contract} as any);expect((await call('developer/collections','GET',undefined,auth)).status).toBe(403);
vi.mocked(getOnChainCollection).mockResolvedValue({owner:address} as any);await call('account/api-keys/'+key.key.id,'DELETE',{});expect((await call('developer/collections','GET',undefined,auth)).status).toBe(401);
});
it('enforces exact atomic quota and records successful/rejected/provider failure usage separately',async()=>{
env.DEVELOPER_RATE_LIMIT='10';const key=await create(),auth={Authorization:'Bearer '+key.secret};
const results=await Promise.all(Array.from({length:13},()=>call('developer/collections','GET',undefined,auth)));expect(results.filter(r=>r.status===200)).toHaveLength(10);expect(results.filter(r=>r.status===429)).toHaveLength(3);
expect(Number(results.find(r=>r.status===429)!.headers.get('Retry-After'))).toBeGreaterThan(0);
const usage=await (await call('account/api-keys/usage')).json() as any;expect(usage.daily[0].accepted).toBe(10);expect(usage.daily[0].rejected).toBe(3);expect(usage.minute[0].claimed).toBe(10);
});
it('fails closed on expired, wrong deployment, wrong scope and future workspace keys',async()=>{
const key=await create(),auth={Authorization:'Bearer '+key.secret,Cookie:''};
for(const [column,value,status] of [['expires_at',0,401],['chain_id',1,401],['scopes','["query:execute"]',403],['workspace_id','future',403]] as const){
 const previous=store.sqlite.prepare('SELECT '+column+' AS value FROM developer_keys WHERE id=?').all(key.key.id)[0].value;
 store.sqlite.prepare('UPDATE developer_keys SET '+column+'=? WHERE id=?').all(value,key.key.id);expect((await call('developer/collections','GET',undefined,auth)).status).toBe(status);
 store.sqlite.prepare('UPDATE developer_keys SET '+column+'=? WHERE id=?').all(previous,key.key.id);
}
store.sqlite.prepare('DELETE FROM account_sessions').all();expect((await call('developer/collections','GET',undefined,auth)).status).toBe(200);
});
it('records chain and ownership failures without accepted counts and limits private retained usage',async()=>{
const key=await create(),auth={Authorization:'Bearer '+key.secret};
vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(false);expect((await call('developer/collections','GET',undefined,auth)).status).toBe(503);
vi.mocked(rpcMatchesConfiguredChain).mockResolvedValue(true);vi.mocked(getOnChainCollection).mockRejectedValue(new Error('rpc'));expect((await call('developer/collections','GET',undefined,auth)).status).toBe(503);
vi.mocked(getOnChainCollection).mockResolvedValue({owner:contract} as any);expect((await call('developer/collections','GET',undefined,auth)).status).toBe(403);
store.sqlite.prepare('INSERT INTO developer_key_daily(key_id,timestamp,accepted) VALUES(?,?,99)').all(key.key.id,1);
const usage=await (await call('account/api-keys/usage')).json() as any;expect(usage.daily).toHaveLength(1);expect(usage.daily[0]).toMatchObject({accepted:0,chainUnavailable:2,ownershipDenied:1});expect(usage.minute[0].claimed).toBe(3);
store.sqlite.prepare('INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,?,?)').all('bob',contract,10143,contract,Date.now(),Date.now());
store.sqlite.prepare('UPDATE developer_keys SET account_id=?').all('bob');expect((await call('account/api-keys/'+key.key.id,'DELETE',{})).status).toBe(404);expect((await (await call('account/api-keys/usage')).json() as any).daily).toEqual([]);
});
