import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';
import assert from 'node:assert/strict';
const network = createFetchMock();
network.disableNetConnect();
network
  .get('https://api.notion.com')
  .intercept({ path: '/ok' })
  .reply(200, { ok: true });
for (const status of [300, 301, 302, 303, 307, 308])
  network
    .get('https://api.notion.com')
    .intercept({ path: '/redirect' + status })
    .reply(status, '', {
      headers: { location: 'https://untrusted.example/secret' },
    });
const bundle = await build({
  stdin: {
    contents: `import {connectorFetch,sealConnector,openConnector} from './src/lib/connector-security.ts';export default {async fetch(request){const path=new URL(request.url).pathname;try{if(path==='/crypto'){const env={CHAIN_ID:'31337',CONTRACT_ADDRESS:'0x'+'ab'.repeat(20),CONNECTOR_TOKEN_KEY:'12'.repeat(32)};const sealed=await sealConnector(env,'fixture','notion',{secret:'fixture-only'});const value=await openConnector(env,'fixture','notion',sealed);return Response.json({ok:value.secret==='fixture-only',encrypted:!sealed.includes('fixture-only')});}return Response.json(await connectorFetch('https://api.notion.com'+path));}catch{return new Response('rejected',{status:400});}}}`,
    resolveDir: process.cwd(),
    sourcefile: 'notion-auth-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
});
const mf = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: '2024-10-01',
  fetchMock: network,
});
try {
  assert.deepEqual(await (await mf.dispatchFetch('http://runtime/ok')).json(), {
    ok: true,
  });
  assert.deepEqual(
    await (await mf.dispatchFetch('http://runtime/crypto')).json(),
    { ok: true, encrypted: true }
  );
  for (const status of [300, 301, 302, 303, 307, 308])
    assert.equal(
      (await mf.dispatchFetch('http://runtime/redirect' + status)).status,
      400
    );
  network.assertNoPendingInterceptors();
  console.log(
    'Actual workerd: bounded provider JSON, AES-GCM and six no-follow redirects passed. Outbound network disabled.'
  );
} finally {
  await mf.dispose();
  await network.close();
}
