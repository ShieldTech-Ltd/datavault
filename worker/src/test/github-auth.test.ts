import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import { digest } from '../lib/account-session';
import type { Env } from '../lib/types';
import {githubCredentialHeader} from '../lib/github-connector';
it('fences existing GitHub credentials when provider configuration is removed',async()=>{
  const id=await connected();env.GITHUB_CLIENT_SECRET=undefined;
  await expect(githubCredentialHeader(env,id,'a1',1)).rejects.toThrow();
});
it('revokes a newly issued GitHub access token when companion response validation fails', async()=>{
  const s=await start();
  vi.mocked(fetch).mockImplementation(async(url:any,init:any)=>{
    if(init.method==='DELETE')return new Response(null,{status:204});
    if(String(url).includes('/access_token'))return new Response(JSON.stringify({...tokenResponse,refresh_token_expires_in:-1}));
    return provider(url,init);
  });
  expect((await callback(s.state,s.cookie)).status).toBe(400);
  expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(true);
});
it('preserves expired pending GitHub cleanup uncertainty through replacement', async()=>{
  const s=await start();vi.mocked(fetch).mockImplementation(provider);
  expect((await callback(s.state,s.cookie)).status).toBe(303);
  await env.DB.prepare("UPDATE account_connectors SET pending_expires_at=1 WHERE provider='github'").run();
  await request();
  const next=await start();expect((await callback(next.state,next.cookie)).status).toBe(303);
  expect(await (await request()).json()).toMatchObject({status:'pending',revocationPending:true});
});
let store: ReturnType<typeof sqliteD1>, env: Env;
const csrf = 'c'.repeat(64);
const request = (
  suffix = '',
  method = 'GET',
  body?: unknown,
  owner = 1,
  extraCookie = ''
) =>
  worker.fetch(
    new Request(
      'https://vault.example/api/account/connectors/github' + suffix,
      {
        method,
        headers: {
          Origin: 'https://vault.example',
          Cookie: 'dv_session=' + String(owner).repeat(64) + '; ' + extraCookie,
          'x-csrf-token': csrf,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    ),
    env
  );
beforeEach(async () => {
  store = sqliteD1();
  env = {
    DB: store.db,
    CHAIN_ID: '10143',
    CONTRACT_ADDRESS: '0x' + 'ab'.repeat(20),
  } as Env;
  for (let n = 1; n <= 2; n++) {
    await env.DB.prepare(
      'INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)'
    )
      .bind('a' + n, '0x' + String(n).repeat(40), 10143, env.CONTRACT_ADDRESS)
      .run();
    await env.DB.prepare(
      'INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,1)'
    )
      .bind(
        await digest(String(n).repeat(64)),
        'a' + n,
        csrf,
        Date.now() + 1000000
      )
      .run();
  }
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  store.close();
});
it('reports disabled connector and prevents authorization without complete configuration', async () => {
  const r = await request();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    providerConfigured: false,
    status: 'disconnected',
  });
  expect((await request('/connect', 'POST', {})).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it('disconnect shares the real Worker account mutation quota', async () => {
  // Seed earlier admissions to avoid 20 serial rounds of SQLite subprocess I/O.
  // The actual Worker must share the account bucket and enforce requests 20/21.
  await env.DB.prepare(
    'INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,18)'
  )
    .bind('account:local', Math.floor(Date.now() / 1000))
    .run();
  const profile = await worker.fetch(
    new Request('https://vault.example/api/account', {
      method: 'PATCH',
      headers: {
        Origin: 'https://vault.example',
        Cookie: 'dv_session=' + '1'.repeat(64),
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: 'Quota fixture' }),
    }),
    env
  );
  expect(profile.status).toBe(200);
  expect((await request('', 'DELETE', {})).status).toBe(200);
  const rejected = await request('', 'DELETE', {});
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get('Retry-After')).toBe('60');
  expect(
    store.sqlite.prepare('SELECT count FROM rate_limits WHERE key=?')
      .all('account:local')
  ).toEqual([{ count: 20 }]);
});

function configure() {
  Object.assign(env, {
    GITHUB_APP_ID: '123',
    GITHUB_CLIENT_ID: 'Iv1.fixture',
    GITHUB_CLIENT_SECRET: 'client-secret',
    CONNECTOR_TOKEN_KEY: 'ab'.repeat(32),
    CONNECTOR_ORIGIN: 'https://vault.example',
  });
}
const tokenResponse = {
  access_token: 'ghu_private-token',
  token_type: 'bearer',
  scope: '',
  expires_in: 28800,
  refresh_token: 'ghr_refresh-secret',
  refresh_token_expires_in: 15897600,
};
const provider = async (url: any, init: any) => {
  expect(init.redirect).toBe('manual');
  const p = String(url);
  return new Response(
    JSON.stringify(
      p.includes('/access_token')
        ? tokenResponse
        : p.includes('/token')
        ? {
            app: {
              client_id: 'Iv1.fixture',
              name: 'Vault Read',
              url: 'https://example.test',
            },
          }
        : p.includes('/apps/vault-read')
        ? {
            id: 123,
            client_id: 'Iv1.fixture',
            permissions: { contents: 'read', metadata: 'read' },
          }
        : p.includes('/repositories')
        ? {
            total_count: 1,
            repositories: [{ id: 7, full_name: 'owner/private' }],
          }
        : p.includes('/user/installations')
        ? {
            total_count: 1,
            installations: [
              {
                id: 9,
                app_id: 123,
                app_slug: 'vault-read',
                repository_selection: 'selected',
                permissions: { contents: 'read', metadata: 'read' },
              },
            ],
          }
        : { login: 'octocat', id: 42 }
    )
  );
};
async function start() {
  configure();
  vi.mocked(fetch).mockImplementation(provider);
  const r = await request('/connect', 'POST', {});
  expect(r.status).toBe(200);
  const data = (await r.json()) as any;
  const url = new URL(data.authorizeUrl);
  expect(url.origin + url.pathname).toBe(
    'https://github.com/login/oauth/authorize'
  );
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
  expect(url.searchParams.has('scope')).toBe(false);
  return {
    state: url.searchParams.get('state')!,
    cookie: r.headers.get('set-cookie')!.split(';')[0],
  };
}
const callback = (state: string, browser: string, owner = 1) =>
  worker.fetch(
    new Request(
      'https://vault.example/api/connectors/github/callback?code=provider-code&state=' +
        state,
      {
        headers: {
          Cookie: 'dv_session=' + String(owner).repeat(64) + '; ' + browser,
        },
      }
    ),
    env
  );
it('binds PKCE authorization to browser and session, consumes once, encrypts credentials and requires explicit confirmation', async () => {
  const s = await start();
  expect((await callback(s.state, s.cookie, 2)).status).toBe(400);
  expect(
    (await callback(s.state, 'dv_connector_browser=' + 'f'.repeat(64))).status
  ).toBe(400);
  expect((await callback(s.state, s.cookie)).status).toBe(303);
  expect((await callback(s.state, s.cookie)).status).toBe(400);
  const pending = (await (await request()).json()) as any;
  expect(pending.status).toBe('pending');
  expect(pending.repositories).toEqual([]);
  const raw = JSON.stringify(
    store.sqlite.prepare('SELECT * FROM account_connectors').all()
  );
  expect(raw).not.toContain('ghu_private-token');
  expect(raw).not.toContain('ghr_refresh-secret');
  expect(raw).not.toContain('provider-code');
  expect((await request('/confirm', 'POST', {}, 2, s.cookie)).status).toBe(409);
  expect((await request('/confirm', 'POST', {}, 1, s.cookie)).status).toBe(200);
  const current = (await (await request()).json()) as any;
  expect(current.status).toBe('connected');
  expect(current.repositories).toEqual([
    { id: 7, name: 'owner/private', installationId: 9 },
  ]);
  expect(JSON.stringify(current)).not.toContain('ghu_');
});
it.each(['expired', 'deployment', 'session'])(
  'rejects %s authorization state without contacting provider',
  async (kind) => {
    const s = await start();
    vi.mocked(fetch).mockClear();
    if (kind === 'expired')
      await env.DB.prepare(
        'UPDATE connector_oauth_states SET expires_at=1'
      ).run();
    if (kind === 'deployment') env.CONTRACT_ADDRESS = '0x' + 'cd'.repeat(20);
    if (kind === 'session')
      await env.DB.prepare(
        "DELETE FROM account_sessions WHERE account_id='a1'"
      ).run();
    expect((await callback(s.state, s.cookie)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  }
);
it.each(['wrong-app', 'write', 'all-repos', 'redirect'])(
  'fails closed for %s provider authorization',
  async (kind) => {
    const s = await start();
    vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
      const r = await provider(url, init),
        v = (await r.json()) as any;
      if (kind === 'redirect')
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://evil.test' },
        });
      if (kind === 'wrong-app' && v.app) v.app.client_id = 'wrong-client';
      if (kind === 'write' && v.permissions) v.permissions.contents = 'write';
      if (kind === 'all-repos' && v.installations)
        v.installations[0].repository_selection = 'all';
      return new Response(JSON.stringify(v));
    });
    expect((await callback(s.state, s.cookie)).status).toBe(400);
    expect(((await (await request()).json()) as any).status).toBe(
      'disconnected'
    );
  }
);
import { openConnector, sealConnector, connectorDeployment } from '../lib/connector-security';
it('authenticates encryption version, owner, provider and deployment', async () => {
  configure();
  const value = await sealConnector(env, 'a1', 'github', { token: 'secret' });
  expect(await openConnector(env, 'a1', 'github', value)).toEqual({
    token: 'secret',
  });
  for (const [account, provider] of [
    ['a2', 'github'],
    ['a1', 'notion'],
  ])
    await expect(
      openConnector(env, account, provider, value)
    ).rejects.toThrow();
  await expect(
    openConnector(env, 'a1', 'github', value.replace('v1.', 'v2.'))
  ).rejects.toThrow();
  env.CONTRACT_ADDRESS = '0x' + 'cd'.repeat(20);
  await expect(openConnector(env, 'a1', 'github', value)).rejects.toThrow();
});
async function connected() {
  const s = await start();
  expect((await callback(s.state, s.cookie)).status).toBe(303);
  expect((await request('/confirm', 'POST', {}, 1, s.cookie)).status).toBe(200);
  return ((await (await request()).json()) as any).id as string;
}
const objects = new Map<string, string>();
function bucket() {
  objects.clear();
  env.COLLECTION_STORE = {
    put: async (k: string, v: string) => objects.set(k, v),
    get: async (k: string) =>
      objects.has(k) ? { text: async () => objects.get(k) } : null,
    delete: async (k: string) => objects.delete(k),
  } as any;
}
const importRequest = (connectionId: string, owner = 1) =>
  worker.fetch(
    new Request('https://vault.example/api/account/imports/github', {
      method: 'POST',
      headers: {
        Origin: 'https://vault.example',
        Cookie: 'dv_session=' + String(owner).repeat(64),
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connectionId,
        repository: 'owner/private',
        ref: 'main',
        paths: ['README.md'],
      }),
    }),
    env
  );
function importProvider() {
  vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
    if (String(url).includes('/repos/')) {
      expect(init.headers.Authorization).toMatch(/^Bearer ghu_/);
      return new Response(
        JSON.stringify(
          String(url).includes('/commits/')
            ? { sha: 'a'.repeat(40) }
            : {
                type: 'file',
                path: 'README.md',
                encoding: 'base64',
                content: btoa('private text'),
                size: 12,
              }
        )
      );
    }
    return provider(url, init);
  });
}
it('creates a fresh same-selection draft after refresh while preserving the old credential fence',async()=>{
 configure();bucket();const connectionId='ab'.repeat(32),oldId='cd'.repeat(32),oldKey='private-import-drafts/a1/'+oldId+'/old.md';
 const credential=await sealConnector(env,'a1','github',{access:'ghu_old',refresh:'ghr_old',expires:1,refreshExpires:Date.now()+86400000});
 await env.DB.prepare("INSERT INTO account_connectors(id,account_id,provider,deployment,status,credential,repositories,created_at,updated_at) VALUES(?,'a1','github',?,'connected',?,'[{\"id\":7,\"name\":\"owner/private\",\"installationId\":9}]',1,1)").bind(connectionId,connectorDeployment(env),credential).run();
 const key=await digest(JSON.stringify({connectionId,credentialVersion:1,repository:'owner/private',ref:'main',paths:['README.md']}));
 await env.DB.prepare("INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at,connection_id,credential_version,draft_key) VALUES(?,'a1','owner/private','main','[\"README.md\"]','review_ready',?,?,?,?,1,?)").bind(oldId,key,Date.now(),Date.now()+86400000,connectionId,oldKey).run();objects.set(oldKey,'older private source');
 importProvider();const response=await importRequest(connectionId),job=await response.json() as any;expect(response.status).toBe(201);expect(job.id).not.toBe(oldId);expect(job.status).toBe('review_ready');
 const draft=(id:string)=>worker.fetch(new Request('https://vault.example/api/account/imports/github/'+id+'/draft',{headers:{Cookie:'dv_session='+'1'.repeat(64)}}),env);
 expect((await draft(oldId)).status).toBe(409);expect(await (await draft(job.id)).text()).toBe('private text');expect(objects.get(oldKey)).toBe('older private source');expect(store.sqlite.prepare('SELECT credential_version FROM github_import_jobs ORDER BY credential_version').all()).toEqual([{credential_version:1},{credential_version:2}]);
});
it('private imports require own confirmed selected connection and are fenced by disconnect', async () => {
  bucket();
  const id = await connected();
  importProvider();
  expect((await importRequest(id, 2)).status).toBe(403);
  const r = await importRequest(id);
  expect(r.status).toBe(201);
  const job = (await r.json()) as any;
  expect(job.status).toBe('review_ready');
  expect(JSON.stringify(job)).not.toContain('private text');
  expect(objects.size).toBe(1);
  expect((await request('', 'DELETE', {})).status).toBe(200);
  expect(objects.size).toBe(0);
  expect(
    store.sqlite.prepare('SELECT status FROM github_import_jobs').all()
  ).toEqual([{ status: 'cancelled' }]);
  expect((await importRequest(id)).status).toBe(403);
});
it('rotates expired credentials under an exclusive lease and preserves fenced imports', async () => {
  bucket();
  const id = await connected();
  const row = store.sqlite
    .prepare('SELECT * FROM account_connectors')
    .all()[0] as any;
  const token = await openConnector<any>(env, 'a1', 'github', row.credential);
  token.expires = 1;
  await env.DB.prepare('UPDATE account_connectors SET credential=?')
    .bind(await sealConnector(env, 'a1', 'github', token))
    .run();
  let release!: (r: Response) => void;
  importProvider();
  const prior = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((url: any, init: any) =>
    String(url).includes('/access_token')
      ? new Promise((r) => {
          release = r;
        })
      : prior(url, init)
  );
  const pending = importRequest(id);
  await vi.waitFor(
    () =>
      expect(
        release,
        'refresh request reached the controlled response barrier'
      ).toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  expect((await importRequest(id)).status).toBe(409);
  release(
    new Response(
      JSON.stringify({
        ...tokenResponse,
        access_token: 'ghu_rotated',
        refresh_token: 'ghr_rotated',
      })
    )
  );
  const r = await pending;
  expect(r.status).toBe(201);
  expect(((await r.json()) as any).status).toBe('review_ready');
  const refreshed = store.sqlite
    .prepare('SELECT * FROM account_connectors')
    .all()[0] as any;
  expect(refreshed.credential_version).toBe(2);
  expect(
    (await openConnector<any>(env, 'a1', 'github', refreshed.credential))
      .refresh
  ).toBe('ghr_rotated');
});
it('does not restore capability when disconnect wins the provider exchange race', async () => {
  bucket();
  const s = await start();
  let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementation((url: any, init: any) =>
    String(url).includes('/access_token')
      ? new Promise((r) => {
          release = r;
        })
      : provider(url, init)
  );
  const pending = callback(s.state, s.cookie);
  await vi.waitFor(
    () =>
      expect(
        release,
        'provider request reached the controlled response barrier'
      ).toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  await request('', 'DELETE', {});
  release(new Response(JSON.stringify(tokenResponse)));
  expect((await pending).status).toBe(400);
  expect(((await (await request()).json()) as any).status).toBe('disconnected');
});
it('accepts the documented token-check shape without invented app id or slug fields', async () => {
  const s = await start();
  vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
    const r = await provider(url, init),
      v = (await r.json()) as any;
    if (v.app)
      v.app = {
        client_id: 'Iv1.fixture',
        name: 'Vault Read',
        url: 'https://example.test',
      };
    if (v.installations) v.installations[0].app_slug = 'vault-read';
    return new Response(JSON.stringify(v));
  });
  expect((await callback(s.state, s.cookie)).status).toBe(303);
});
it('rejects pending, expired confirmation and callback parameter tampering without secret exports', async () => {
  const s = await start();
  const tampered = await worker.fetch(
    new Request(
      'https://vault.example/api/connectors/github/callback?code=provider-code&state=' +
        s.state +
        '&redirect_uri=https://evil.test',
      { headers: { Cookie: 'dv_session=' + '1'.repeat(64) + '; ' + s.cookie } }
    ),
    env
  );
  expect(tampered.status).toBe(400);
  expect((await callback(s.state, s.cookie)).status).toBe(303);
  const row = store.sqlite
    .prepare('SELECT * FROM account_connectors')
    .all()[0] as any;
  expect((await importRequest(row.id)).status).toBe(403);
  await env.DB.prepare(
    'UPDATE account_connectors SET pending_expires_at=1'
  ).run();
  expect((await request('/confirm', 'POST', {}, 1, s.cookie)).status).toBe(409);
  expect(
    store.sqlite
      .prepare(
        'SELECT credential,status,revocation_pending FROM account_connectors'
      )
      .all()
  ).toEqual([
    { credential: null, status: 'disconnected', revocation_pending: 1 },
  ]);
});
it('refuses changed write permissions before a new private import', async () => {
  bucket();
  const id = await connected();
  importProvider();
  const previous = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
    const response = await previous(url, init);
    if (String(url).includes('/apps/vault-read')) {
      const v = (await response.json()) as any;
      v.permissions.contents = 'write';
      return new Response(JSON.stringify(v));
    }
    return response;
  });
  expect((await importRequest(id)).status).toBe(403);
  expect(objects.size).toBe(0);
});
it('revoked token fails safely without falling back to operator credentials', async () => {
  bucket();
  const id = await connected();
  (env as any).GITHUB_TOKEN = 'operator-private-pat';
  vi.mocked(fetch).mockImplementation(async (_url: any, init: any) => {
    expect(JSON.stringify(init)).not.toContain('operator-private-pat');
    return new Response('private error ghu_secret', { status: 401 });
  });
  const r = await importRequest(id);
  expect(r.status).toBe(403);
  expect(await r.text()).not.toContain('ghu_secret');
  expect(((await (await request()).json()) as any).status).toBe(
    'needs_reconnect'
  );
  expect(objects.size).toBe(0);
});
it('disconnect fences an inflight private content request and reports remote revocation failure', async () => {
  bucket();
  const id = await connected();
  importProvider();
  const previous = vi.mocked(fetch).getMockImplementation()!;
  let release!: (r: Response) => void;
  vi.mocked(fetch).mockImplementation((url: any, init: any) =>
    String(url).includes('/contents/')
      ? new Promise((r) => {
          release = r;
        })
      : init.method === 'DELETE'
      ? Promise.resolve(new Response('secret', { status: 503 }))
      : previous(url, init)
  );
  const pending = importRequest(id);
  await vi.waitFor(
    () =>
      expect(
        release,
        'provider request reached the controlled response barrier'
      ).toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  const r = await request('', 'DELETE', {});
  expect(await r.json()).toMatchObject({
    status: 'disconnected',
    revocationPending: true,
  });
  release(
    new Response(
      JSON.stringify({
        type: 'file',
        path: 'README.md',
        encoding: 'base64',
        content: btoa('private text'),
        size: 12,
      })
    )
  );
  await pending;
  expect(objects.size).toBe(0);
  expect(
    store.sqlite.prepare('SELECT status FROM github_import_jobs').all()
  ).toEqual([{ status: 'cancelled' }]);
});
it('keeps existing public idempotency keys compatible after migration', async () => {
  bucket();
  const key = await digest(
    JSON.stringify({
      repository: 'owner/private',
      ref: 'main',
      paths: ['README.md'],
    })
  );
  await env.DB.prepare(
    "INSERT INTO github_import_jobs(id,account_id,repository,ref,paths,status,idempotency_key,created_at,expires_at) VALUES(?,'a1','owner/private','main','[\"README.md\"]','review_ready',?,?,?)"
  )
    .bind('a'.repeat(64), key, Date.now(), Date.now() + 60000)
    .run();
  const r = await worker.fetch(
    new Request('https://vault.example/api/account/imports/github', {
      method: 'POST',
      headers: {
        Origin: 'https://vault.example',
        Cookie: 'dv_session=' + '1'.repeat(64),
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repository: 'owner/private',
        ref: 'main',
        paths: ['README.md'],
      }),
    }),
    env
  );
  expect(r.status).toBe(200);
  expect(((await r.json()) as any).id).toBe('a'.repeat(64));
  expect(fetch).not.toHaveBeenCalled();
});

it('bounds disconnect bodies in the actual Worker before parsing JSON', async () => {
  const r = await worker.fetch(
    new Request('https://vault.example/api/account/connectors/github', {
      method: 'DELETE',
      headers: {
        Origin: 'https://vault.example',
        Cookie: 'dv_session=' + '1'.repeat(64),
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ padding: 'x'.repeat(9000) }),
    }),
    env
  );
  expect(r.status).toBe(413);
});
it.each([204, 503])(
  'records callback cleanup uncertainty only when remote cleanup is unconfirmed (%s)',
  async (status) => {
    const s = await start();
    vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
      if (init.method === 'DELETE') return new Response(null, { status });
      const response = await provider(url, init),
        value = (await response.json()) as any;
      if (String(url).includes('/apps/vault-read'))
        value.permissions.contents = 'write';
      return new Response(JSON.stringify(value));
    });
    const response = await callback(s.state, s.cookie);
    expect(response.status).toBe(400);
    if (status === 503)
      expect(await response.text()).toContain(
        'https://github.com/settings/apps/authorizations'
      );
    const metadata = (await (await request()).json()) as any;
    expect(metadata).toMatchObject({
      status: 'disconnected',
      revocationPending: status === 503,
    });
    expect(
      ((await (await request('', 'GET', undefined, 2)).json()) as any)
        .revocationPending
    ).toBe(false);
    const exported = await worker.fetch(
      new Request('https://vault.example/api/account/export', {
        headers: { Cookie: 'dv_session=' + '1'.repeat(64) },
      }),
      env
    );
    expect(exported.status).toBe(200);
    const data = (await exported.json()) as any;
    expect(data.githubConnection.revocationPending).toBe(status === 503);
    expect(JSON.stringify(data)).not.toMatch(
      /ghu_|ghr_|client-secret|provider-code/
    );
  }
);
it('records callback cleanup failure when disconnect wins the exchange race', async () => {
  const s = await start();
  let exchange!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation((url: any, init: any) =>
    String(url).includes('/access_token')
      ? new Promise((resolve) => {
          exchange = resolve;
        })
      : init.method === 'DELETE'
      ? Promise.resolve(new Response(null, { status: 503 }))
      : provider(url, init)
  );
  const pending = callback(s.state, s.cookie);
  await vi.waitFor(
    () => expect(exchange, 'callback exchange arrived').toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  await request('', 'DELETE', {});
  exchange(new Response(JSON.stringify(tokenResponse)));
  expect((await pending).status).toBe(400);
  expect(await (await request()).json()).toMatchObject({
    status: 'disconnected',
    revocationPending: true,
  });
});
it.each([204, 503])(
  'tracks rotated-token cleanup independently after disconnect (%s)',
  async (status) => {
    bucket();
    const id = await connected(),
      row = store.sqlite
        .prepare('SELECT * FROM account_connectors')
        .all()[0] as any;
    const value = await openConnector<any>(env, 'a1', 'github', row.credential);
    value.expires = 1;
    await env.DB.prepare('UPDATE account_connectors SET credential=?')
      .bind(await sealConnector(env, 'a1', 'github', value))
      .run();
    let exchange!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation((url: any, init: any) => {
      if (String(url).includes('/access_token'))
        return new Promise((resolve) => {
          exchange = resolve;
        });
      if (init.method === 'DELETE')
        return Promise.resolve(
          new Response(null, {
            status:
              JSON.parse(init.body).access_token === 'ghu_rotated'
                ? status
                : 204,
          })
        );
      return provider(url, init);
    });
    const pending = importRequest(id);
    await vi.waitFor(
      () => expect(exchange, 'refresh exchange arrived').toBeTypeOf('function'),
      { timeout: 5000, interval: 10 }
    );
    expect(await (await request('', 'DELETE', {})).json()).toMatchObject({
      status: 'disconnected',
      revocationPending: false,
    });
    exchange(
      new Response(
        JSON.stringify({
          ...tokenResponse,
          access_token: 'ghu_rotated',
          refresh_token: 'ghr_rotated',
        })
      )
    );
    expect((await pending).status).toBe(403);
    expect(await (await request()).json()).toMatchObject({
      status: 'disconnected',
      revocationPending: status === 503,
    });
    expect(
      store.sqlite.prepare('SELECT credential FROM account_connectors').all()
    ).toEqual([{ credential: null }]);
  }
);
it('late successful old-token revocation cannot clear a newer rotated-token cleanup failure', async () => {
  bucket();
  const id = await connected(),
    row = store.sqlite
      .prepare('SELECT * FROM account_connectors')
      .all()[0] as any;
  const value = await openConnector<any>(env, 'a1', 'github', row.credential);
  value.expires = 1;
  await env.DB.prepare('UPDATE account_connectors SET credential=?')
    .bind(await sealConnector(env, 'a1', 'github', value))
    .run();
  let exchange!: (response: Response) => void,
    oldRevoke!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation((url: any, init: any) => {
    if (String(url).includes('/access_token'))
      return new Promise((resolve) => {
        exchange = resolve;
      });
    if (init.method === 'DELETE')
      return JSON.parse(init.body).access_token === 'ghu_rotated'
        ? Promise.resolve(new Response(null, { status: 503 }))
        : new Promise((resolve) => {
            oldRevoke = resolve;
          });
    return provider(url, init);
  });
  const pending = importRequest(id);
  await vi.waitFor(
    () => expect(exchange, 'refresh exchange arrived').toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  const disconnect = request('', 'DELETE', {});
  await vi.waitFor(
    () =>
      expect(oldRevoke, 'old token revocation arrived').toBeTypeOf('function'),
    { timeout: 5000, interval: 10 }
  );
  exchange(
    new Response(
      JSON.stringify({
        ...tokenResponse,
        access_token: 'ghu_rotated',
        refresh_token: 'ghr_rotated',
      })
    )
  );
  expect((await pending).status).toBe(403);
  oldRevoke(new Response(null, { status: 204 }));
  expect(await (await disconnect).json()).toMatchObject({
    status: 'disconnected',
    revocationPending: true,
  });
  expect(await (await request()).json()).toMatchObject({
    status: 'disconnected',
    revocationPending: true,
  });
});
it('retains old cleanup uncertainty through a newer connection without exposing secrets', async () => {
  const s = await start();
  vi.mocked(fetch).mockImplementation(async (url: any, init: any) => {
    if (init.method === 'DELETE') return new Response(null, { status: 503 });
    const r = await provider(url, init),
      v = (await r.json()) as any;
    if (String(url).includes('/apps/vault-read'))
      v.permissions.contents = 'write';
    return new Response(JSON.stringify(v));
  });
  expect((await callback(s.state, s.cookie)).status).toBe(400);
  await env.DB.prepare(
    'UPDATE connector_cleanup_obligations SET created_at=1'
  ).run();
  const id = await connected();
  expect(await (await request()).json()).toMatchObject({
    id,
    status: 'connected',
    revocationPending: true,
  });
  const raw = JSON.stringify(
    store.sqlite.prepare('SELECT * FROM connector_cleanup_obligations').all()
  );
  expect(raw).not.toMatch(/ghu_|ghr_|provider-code|client-secret/);
  expect(
    store.sqlite
      .prepare('SELECT created_at FROM connector_cleanup_obligations')
      .all()
  ).toEqual([{ created_at: 1 }]);
});
