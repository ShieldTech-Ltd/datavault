import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
test('settings offers explicit account sign-in while retaining privacy and deployment disclosures', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    const { WalletProvider } = await vite.ssrLoadModule('/src/lib/wallet.tsx');
    globalThis.window = { location: { pathname: '/settings', search: '' } };
    const html = renderToString(React.createElement(WalletProvider, null, React.createElement(App)));
    assert.match(html, /Sign in to account/);
    assert.match(html, /request identifiers for recovery, without plaintext questions/);
    assert.match(html, /Contract/);
    assert.doesNotMatch(html, /Server profiles.*unavailable/);
  } finally { delete globalThis.window; await vite.close(); }
});

test('wallet changes fence delayed hydration and never sign with the switched wallet', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    let module;
    try { module = await vite.ssrLoadModule('/src/production/account-client.ts'); } catch { module = {}; }
    assert.equal(typeof module.AccountClient, 'function', 'Account client must enforce wallet state fencing');
    const { AccountClient } = module;
    const addressA = '0x' + '11'.repeat(20), addressB = '0x' + '22'.repeat(20);
    const profile = address => ({ address, displayName: '', locale: 'en-GB', notificationPreferences: { inApp: true, email: false }, createdAt: 1, updatedAt: 1 });
    const session = address => ({ account: profile(address), csrfToken: 'ab'.repeat(32), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    let release, signed = 0, verifying = 0;
    const requests = [];
    const wallet = address => ({ address, getWalletClient: async () => ({ getChainId: async () => 31337, signMessage: async () => { signed++; return '0x' + '12'.repeat(65); } }) });
    const network = async (url, init) => {
      requests.push(url);
      if (url === '/api/account') return await new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(session(addressA)))); });
      return new Response(null, { status: 204 });
    };
    const client = new AccountClient(31337, '0x' + 'ab'.repeat(20), network);
    const hydration = client.setWallet(wallet(addressA), true);
    await new Promise(resolve => setImmediate(resolve));
    await client.setWallet(null, false);
    release(); await hydration;
    assert.equal(client.state.session, null);
    assert.ok(requests.includes('/api/auth/logout'));
    const signingClient = new AccountClient(31337, '0x' + 'ab'.repeat(20), async url => {
      if (url === '/api/account') return new Response(null, { status: 401 });
      if (url === '/api/auth/challenge') return new Response(JSON.stringify({ message: 'standard issued SIWE', nonce: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString() }));
      if (url === '/api/auth/verify') { verifying++; return new Response(JSON.stringify(session(addressA))); }
      return new Response(null, { status: 204 });
    });
    const changingWallet = wallet(addressA);
    changingWallet.getWalletClient = async () => ({ getChainId: async () => 31337, signMessage: async () => {
      signed++; await signingClient.setWallet(wallet(addressB), true); return '0x' + '12'.repeat(65);
    } });
    await signingClient.setWallet(changingWallet, true);
    await signingClient.signIn();
    assert.equal(verifying, 0, 'A wallet switch during signing must not submit verification');
    assert.equal(signingClient.state.session, null);
    assert.equal(signed, 1);
  } finally { await vite.close(); }
});

test('account profile persists through a fresh client, mutations use CSRF and logout clears state', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { AccountClient } = await vite.ssrLoadModule('/src/production/account-client.ts');
    const address = '0x' + '11'.repeat(20), csrfToken = 'ab'.repeat(32);
    let session = { account: { address, displayName: 'Original', locale: 'en-GB', notificationPreferences: { inApp: true, email: false }, createdAt: 1, updatedAt: 1 }, csrfToken, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    const wallet = { address, getWalletClient: async () => { throw new Error('Hydration must not prompt for a signature'); } };
    const network = async (url, init) => {
      assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
      if (url === '/api/account' && init.method === 'PATCH') {
        assert.equal(init.headers['x-csrf-token'], csrfToken);
        const saved = JSON.parse(init.body); session = { ...session, account: { ...session.account, ...saved, updatedAt: 2 } };
        return new Response(JSON.stringify({ account: session.account }));
      }
      if (url === '/api/account') return new Response(JSON.stringify(session));
      if (url === '/api/account/export') return new Response(JSON.stringify({ account: session.account }), { headers: { 'Content-Type': 'application/json' } });
      if (url === '/api/account/deletion-request') { assert.equal(init.headers['x-csrf-token'], csrfToken); return new Response(JSON.stringify({ requestId: 'cd'.repeat(32), status: 'pending' })); }
      if (url === '/api/auth/logout') { assert.equal(init.headers['x-csrf-token'], csrfToken); return new Response(null, { status: 204 }); }
      throw new Error('Unexpected endpoint');
    };
    const client = new AccountClient(31337, '0x' + 'ab'.repeat(20), network);
    await client.setWallet(wallet, true);
    assert.equal(client.state.session.account.displayName, 'Original');
    assert.equal(await client.save({ displayName: 'Saved profile', locale: 'en-GB', notificationPreferences: { inApp: false, email: false } }), true);
    const fresh = new AccountClient(31337, '0x' + 'ab'.repeat(20), network);
    await fresh.setWallet(wallet, true);
    assert.equal(fresh.state.session.account.displayName, 'Saved profile');
    assert.equal(fresh.state.session.account.notificationPreferences.inApp, false);
    assert.equal(JSON.parse(await (await fresh.exportAccount()).text()).account.displayName, 'Saved profile');
    assert.equal((await fresh.requestDeletion()).status, 'pending');
    await fresh.signOut(); assert.equal(fresh.state.session, null); assert.equal(fresh.state.error, '');
  } finally { await vite.close(); }
});
test('late verification is revoked after a wallet change and failed sign-out can be retried', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { AccountClient } = await vite.ssrLoadModule('/src/production/account-client.ts');
    const address = '0x' + '11'.repeat(20), csrfToken = 'ab'.repeat(32);
    const session = { account: { address, displayName: '', locale: 'en-GB', notificationPreferences: { inApp: true, email: false }, createdAt: 1, updatedAt: 1 }, csrfToken, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    const wallet = { address, getWalletClient: async () => ({ getChainId: async () => 31337, signMessage: async () => '0x' + '12'.repeat(65) }) };
    let release, verifyStarted, logoutCount = 0;
    const started = new Promise(resolve => { verifyStarted = resolve; });
    const client = new AccountClient(31337, '0x' + 'ab'.repeat(20), async (url, init) => {
      if (url === '/api/account') return new Response(null, { status: 401 });
      if (url === '/api/auth/challenge') return new Response(JSON.stringify({ message: 'standard issued SIWE', nonce: 'a'.repeat(64), expiresAt: new Date(Date.now() + 300000).toISOString() }));
      if (url === '/api/auth/verify') { verifyStarted(); return await new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(session))); }); }
      if (url === '/api/auth/logout') { logoutCount++; assert.equal(init.headers['x-csrf-token'], csrfToken); return new Response(null, { status: 204 }); }
    });
    await client.setWallet(wallet, true); const pending = client.signIn(); await started;
    await client.setWallet(null, false); release(); await pending;
    assert.equal(client.state.session, null); assert.equal(logoutCount, 1);
    let first = true;
    const retry = new AccountClient(31337, '0x' + 'ab'.repeat(20), async (url, init) => {
      if (url === '/api/account') return new Response(JSON.stringify(session));
      assert.equal(init.headers['x-csrf-token'], csrfToken, 'Retry must retain the CSRF token to revoke the server cookie');
      if (first) { first = false; return new Response(null, { status: 503 }); }
      return new Response(null, { status: 204 });
    });
    await retry.setWallet(wallet, true); await retry.signOut(); assert.match(retry.state.error, /sign-out failed/);
    await retry.signOut(); assert.equal(retry.state.error, '');
  } finally { await vite.close(); }
});

test('default browser transport calls native fetch with the correct receiver', async () => {
  const vite = await createServer({ optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const original = globalThis.fetch;
  try {
    const { AccountClient } = await vite.ssrLoadModule('/src/production/account-client.ts');
    globalThis.fetch = async function () { if (this !== globalThis) throw new Error('Illegal invocation'); return new Response(null, { status: 401 }); };
    const client = new AccountClient(31337, '0x' + 'ab'.repeat(20));
    await client.setWallet({ address: '0x' + '11'.repeat(20), getWalletClient: async () => {} }, true);
    assert.equal(client.state.error, '');
  } finally { globalThis.fetch = original; await vite.close(); }
});
