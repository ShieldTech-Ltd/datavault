import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {monitorOnce,validateMonitorOrigin} from './service-monitor.mjs';
test('fixed monitor origin rejects credentials, non HTTPS and redirect targets',()=>{
 assert.throws(()=>validateMonitorOrigin('http://example.com','31337'));
 assert.throws(()=>validateMonitorOrigin('https://user:password@example.com','31337'));
 assert.throws(()=>validateMonitorOrigin('https://example.com/path','31337'));
 assert.equal(validateMonitorOrigin('http://127.0.0.1:8787','31337'),'http://127.0.0.1:8787');
});
test('failed target observations persist and are submitted on recovery without secrets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dv-monitor-'));try{
 const spool=join(dir,'spool.json'),calls=[];let down=true;
 const transport=async(url,options)=>{calls.push({url,options});if(down)throw Error('secret-token');return new Response(JSON.stringify({accepted:JSON.parse(options.body).samples.length}),{headers:{'Content-Type':'application/json'}});};
 await monitorOnce({origin:'https://vault.example',chainId:'10143',secret:'secret-token',spool,now:600000,fetcher:transport});
 const stored=await readFile(spool,'utf8');assert.ok(!stored.includes('secret-token'));assert.match(stored,/down/);
 down=false;await monitorOnce({origin:'https://vault.example',chainId:'10143',secret:'secret-token',spool,now:900000,fetcher:async(url,options)=>url.endsWith('/health')?new Response('{}'):transport(url,options)});
 assert.equal(JSON.parse(await readFile(spool,'utf8')).samples.length,0);
 const submitted=calls.at(-1);assert.equal(JSON.parse(submitted.options.body).samples.length,2);assert.equal(submitted.options.redirect,'error');
 }finally{await rm(dir,{recursive:true,force:true});}
});
