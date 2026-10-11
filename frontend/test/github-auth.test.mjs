import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
test('connector confirmation and redirect are fenced by the current wallet lifecycle', async () => {
  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { AccountClient } = await vite.ssrLoadModule(
      '/src/production/account-client.ts'
    );
    const address = '0x' + '11'.repeat(20),
      session = {
        account: {
          address,
          displayName: '',
          locale: 'en-GB',
          notificationPreferences: { inApp: true, email: false },
          createdAt: 1,
          updatedAt: 1,
        },
        csrfToken: 'ab'.repeat(32),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
    let release, record;
    const client = new AccountClient(
      31337,
      '0x' + 'ab'.repeat(20),
      async (path, init = {}) => {
        if (path === '/api/account')
          return new Response(JSON.stringify(session));
        if (path.includes('/connectors/')) {
          record = init;
          return new Promise((r) => {
            release = () =>
              r(
                new Response(
                  JSON.stringify({
                    authorizeUrl:
                      'https://github.com/login/oauth/authorize?client_id=fixture',
                  })
                )
              );
          });
        }
        return new Response(null, { status: 204 });
      }
    );
    await client.setWallet({ address }, true);
    const pending = client.githubConnector('/connect', 'POST');
    await new Promise((r) => setImmediate(r));
    assert.equal(record.headers['x-csrf-token'], session.csrfToken);
    await client.setWallet(null, false);
    release();
    assert.equal(await pending, null);
  } finally {
    await vite.close();
  }
});
import React from 'react';
import { act, create } from 'react-test-renderer';
test('disabled private GitHub UI shows scope and does not request consent', async () => {
  let calls = 0;
  globalThis.__githubFixture = {
    state: {
      session: { account: { address: '0x' + '11'.repeat(20) } },
      loading: false,
    },
    client: {
      githubConnector: async () => {
        calls++;
        return {
          providerConfigured: false,
          id: null,
          status: 'disconnected',
          repositories: [],
          revocationPending: false,
        };
      },
    },
  };
  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: 'auth-fixture',
        enforce: 'pre',
        transform(code, id) {
          if (id.replaceAll('\\', '/').endsWith('/production/account.tsx'))
            return 'export const useAccount=()=>globalThis.__githubFixture;';
        },
      },
    ],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  let renderer;
  try {
    const { default: GithubConnection } = await vite.ssrLoadModule(
      '/src/production/GithubConnection.tsx'
    );
    await act(async () => {
      renderer = create(React.createElement(GithubConnection));
    });
    assert.match(
      JSON.stringify(renderer.toJSON()),
      /read-only|selected repositories/
    );
    assert.equal(
      renderer.root
        .findAllByType('button')
        .find((b) => b.children.join('') === 'Connect GitHub').props.disabled,
      true
    );
    assert.equal(calls, 1);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    delete globalThis.__githubFixture;
    await vite.close();
  }
});
test('outstanding cleanup guidance does not mislabel a newer connected authorization', async () => {
  globalThis.__githubFixture = {
    state: {
      session: { account: { address: '0x' + '11'.repeat(20) } },
      loading: false,
    },
    client: {
      githubConnector: async () => ({
        providerConfigured: true,
        id: 'a'.repeat(64),
        status: 'connected',
        login: 'octocat',
        repositories: [],
        revocationPending: true,
      }),
    },
  };
  const vite = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: 'cleanup-fixture',
        enforce: 'pre',
        transform(code, id) {
          if (id.replaceAll('\\', '/').endsWith('/production/account.tsx'))
            return 'export const useAccount=()=>globalThis.__githubFixture;';
        },
      },
    ],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  let renderer;
  try {
    const { default: GithubConnection } = await vite.ssrLoadModule(
      '/src/production/GithubConnection.tsx'
    );
    await act(async () => {
      renderer = create(React.createElement(GithubConnection));
    });
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /GitHub revocation could not be confirmed/);
    assert.doesNotMatch(text, /Local access is disabled|requires reconnecting/);
    assert.equal(
      renderer.root
        .findAllByType('a')
        .some(
          (a) =>
            a.props.href === 'https://github.com/settings/apps/authorizations'
        ),
      true
    );
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    delete globalThis.__githubFixture;
    await vite.close();
  }
});
