import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

test('Worker production assets preserve deployment identity and exclude the sample dashboard', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'datavault-production-build-'));
  const identity = {
    VITE_CONTRACT_ADDRESS: '0x1111111111111111111111111111111111111111',
    VITE_CHAIN_ID: '10143',
    VITE_CHAIN_RPC_URL: 'https://rpc.example.test',
  };
  const previous = Object.fromEntries(Object.keys(identity).map(key => [key, process.env[key]]));
  Object.assign(process.env, identity);
  try {
    await build({ build: { outDir, emptyOutDir: true }, logLevel: 'silent' });
    const manifest = JSON.parse(await readFile(join(outDir, 'release-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.contractAddress, '0x1111111111111111111111111111111111111111');
    assert.equal(manifest.chainId, '10143');
    assert.equal(manifest.rpcUrl, 'https://rpc.example.test');
    const files = await readdir(outDir);
    assert.ok(!files.includes('_redirects'), 'Do not replace Worker API routes with a Pages SPA fallback');
    assert.ok(files.includes('_headers'), 'Worker assets must retain security headers');
    const assetFiles = await readdir(join(outDir, 'assets'));
    const javascript = (await Promise.all(assetFiles.filter(name => name.endsWith('.js'))
      .map(name => readFile(join(outDir, 'assets', name), 'utf8')))).join('\n');
    assert.doesNotMatch(javascript, /dv_new_sk_|Local UI preview\. Figures|New query answered on Cybersecurity Notes/);
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /modulepreload[^>]*charts/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(outDir, { recursive: true, force: true });
  }
});
