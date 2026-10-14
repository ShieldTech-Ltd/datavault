import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('demo setup requires explicit actions and discards a delayed balance from another wallet', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'dv-demo-setup-'));
  const vite = await createServer({ cacheDir, envDir: cacheDir, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent', define: { 'import.meta.env.VITE_CHAIN_ID': JSON.stringify('10143') } });
  const previousWindow = globalThis.window;
  const methods = [], listeners = new Map();
  const owner = '0x' + '11'.repeat(20), buyer = '0x' + '22'.repeat(20);
  let chain = '0x1', instance, originalBalance, client, resolveOld;
  const oldBalance = new Promise(resolve => { resolveOld = resolve; });
  globalThis.window = { ethereum: {
    on: (event, callback) => listeners.set(event, callback), removeListener: event => listeners.delete(event),
    request: async ({method, params}) => {
      methods.push(method);
      if (method === 'eth_accounts') return [];
      if (method === 'eth_chainId') return chain;
      if (method === 'eth_requestAccounts') return [owner];
      if (method === 'wallet_switchEthereumChain') { chain = params[0].chainId; return null; }
      throw new Error('Unexpected wallet action: ' + method);
    },
  } };
  try {
    const { WalletProvider } = await vite.ssrLoadModule('/src/lib/wallet.tsx');
    const { default: Setup } = await vite.ssrLoadModule('/src/production/DemoWalletSetup.tsx');
    client = (await vite.ssrLoadModule('/src/lib/contract.ts')).viemClient;
    originalBalance = client.getBalance;
    client.getBalance = async ({address}) => address === owner ? oldBalance : 2000000000000000000n;
    await act(async () => { instance = renderer.create(React.createElement(WalletProvider, null, React.createElement(Setup))); });
    assert.deepEqual(methods, ['eth_accounts', 'eth_chainId']);
    const click = async label => {
      const button = instance.root.findAllByType('button').find(node => node.children.join('') === label);
      assert.ok(button, 'Missing action ' + label);
      await act(async () => { await button.props.onClick(); });
    };
    await click('Connect wallet to get started');
    assert.equal(methods.filter(method => method === 'eth_requestAccounts').length, 1);
    await click('Switch to Monad Testnet');
    assert.equal(chain, '0x279f');
    await act(async () => { listeners.get('accountsChanged')([buyer]); });
    assert.match(JSON.stringify(instance.toJSON()), /Wallet balance: 2 test MON/);
    await act(async () => { resolveOld(0n); });
    assert.match(JSON.stringify(instance.toJSON()), /Wallet balance: 2 test MON/);
    assert.doesNotMatch(JSON.stringify(instance.toJSON()), /Wallet balance: 0 test MON/);
    assert.ok(instance.root.findAllByType('a').some(node => node.props.href === 'https://faucet.monad.xyz/'));
    assert.ok(!methods.some(method => /sendTransaction|sign/i.test(method)), 'Setup must never pay or sign a query');
  } finally {
    if (instance) await act(async () => instance.unmount());
    if (client) client.getBalance = originalBalance;
    globalThis.window = previousWindow;
    await vite.close(); rmSync(cacheDir,{recursive:true,force:true});
  }
});
