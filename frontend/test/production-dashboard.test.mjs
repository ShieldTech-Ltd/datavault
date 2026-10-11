import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

test('dashboard deep links expose real task states instead of sample business records', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    const { WalletProvider } = await vite.ssrLoadModule('/src/lib/wallet.tsx');
    const routes = [
      ['/', 'Your Knowledge'],
      ['/collections', 'Your collections'], ['/marketplace', 'Knowledge marketplace'],
      ['/earnings', 'Owner earnings'], ['/transactions', 'Your paid requests'],
      ['/analytics', 'Recorded analytics'], ['/api-access', 'Signed API access'],
      ['/settings', 'Workspace settings'], ['/collections/0x' + 'ab'.repeat(32), 'Collection details'],
    ];
    for (const [pathname, heading] of routes) {
      globalThis.window = { location: { pathname, search: '' } };
      const html = renderToString(React.createElement(WalletProvider, null, React.createElement(App)));
      assert.ok(html.includes(heading), `${pathname} does not open its production view`);
      assert.doesNotMatch(html, /Generate API Key|Upgrade Now|Payout of 0\.88|Cybersecurity Notes|648 queries/);
    }
  } finally { delete globalThis.window; await vite.close(); }
});

test('API failure cannot masquerade as an empty successful workspace', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch;
  try {
    const { apiJson } = await vite.ssrLoadModule('/src/production/api.ts');
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Current deployment is unavailable.' }), { status: 503 });
    await assert.rejects(apiJson('/api/collections'), /unavailable/i);
    globalThis.fetch = async () => new Response('<html>not an API</html>', { status: 200 });
    await assert.rejects(apiJson('/api/collections'), /response/i);
    globalThis.fetch = async () => new Response(JSON.stringify({ collections: 'corrupt', hasMore: false }), { status: 200 });
    await assert.rejects(apiJson('/api/collections'), /response/i);
    globalThis.fetch = async () => new Response(JSON.stringify({ collections: [], hasMore: false, offset: 0, limit: 24 }), { status: 200 });
    assert.deepEqual(await apiJson('/api/collections'), { collections: [], hasMore: false, offset: 0, limit: 24 });
  } finally { globalThis.fetch = originalFetch; await vite.close(); }
});
