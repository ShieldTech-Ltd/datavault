import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('late key creation discards secret and attempts original CSRF revoke after wallet change',async()=>{
 const cacheDir=mkdtempSync(join(tmpdir(),'dv-keys-test-'));
 const vite=await createServer({cacheDir,configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{const {AccountClient}=await vite.ssrLoadModule('/src/production/account-client.ts');
 const address='0x'+'11'.repeat(20),csrf='ab'.repeat(32),session={account:{address,displayName:'',locale:'en-GB',notificationPreferences:{inApp:true,email:false},createdAt:1,updatedAt:1},csrfToken:csrf,expiresAt:new Date(Date.now()+86400000).toISOString()};let release;const revokes=[];
 const client=new AccountClient(31337,'0x'+'ab'.repeat(20),async(path,init={})=>{if(path==='/api/account')return new Response(JSON.stringify(session));if(path==='/api/account/api-keys'&&init.method==='POST')return await new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({secret:'dv_'+'aa'.repeat(32),key:{id:'bb'.repeat(32)}})));});if(init.method==='DELETE')revokes.push({path,csrf:init.headers['x-csrf-token']});return new Response(null,{status:204});});
 await client.setWallet({address},true);const pending=client.createApiKey({name:'test',collectionIds:['id'],expiresInDays:1,scopes:['collections:read']});await new Promise(resolve=>setImmediate(resolve));await client.setWallet(null,false);release();assert.equal(await pending,null);assert.deepEqual(revokes,[{path:'/api/account/api-keys/'+'bb'.repeat(32),csrf}]);
 }finally{await vite.close();rmSync(cacheDir,{recursive:true,force:true});}
});
