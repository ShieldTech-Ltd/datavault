// Isolated workerd/R2 smoke. No deployment, account bindings or external calls.
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir = await mkdtemp(join(tmpdir(), 'dv-document-workerd-'));
let mf;
try {
  const outfile = join(dir, 'worker.mjs');
  await build({ stdin: { contents: `
    import {storeCollection,retrievePassages} from './src/lib/r2.ts';
    import {decodeCollectionText} from '../shared/document-text.ts';
    import {keccak256,toBytes} from 'viem';
    export default {async fetch(req,env){
      const start=Date.now();
      const content=decodeCollectionText(new Uint8Array(await req.arrayBuffer()),'reviewed.md');
      const hash=keccak256(toBytes(content));
      await storeCollection('local-size-smoke',content,hash,env);
      const stored=Date.now();
      const result=await retrievePassages('local-size-smoke','orbital',hash,env);
      return Response.json({bytes:toBytes(content).length,ingestionMs:stored-start,retrievalMs:Date.now()-stored,
        passages:result.passages.length,maxChars:Math.max(...result.passages.map(p=>p.length)),hash:result.contentHash});
    }};`, resolveDir: resolve('.'), sourcefile: 'document-size-smoke.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', outfile });
  mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: outfile, compatibilityDate: '2024-10-01', r2Buckets: ['COLLECTION_STORE'] });
  const content = 'Evidence about orbital mechanics.\n\n'.repeat(64000).slice(0,2097152).padEnd(2097152,'x');
  const response = await mf.dispatchFetch('http://localhost/probe', { method:'POST', body:content });
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.bytes,2097152); assert.equal(result.passages,4); assert.ok(result.maxChars<=1600);
  console.log(JSON.stringify(result));
} finally {
  await mf?.dispose();
  await rm(dir,{recursive:true,force:true});
}
