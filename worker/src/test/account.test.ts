import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import worker from '../index';
import { sqliteD1 } from './sqlite-d1';
import type { Env } from '../lib/types';
const alice = privateKeyToAccount('0x' + '11'.repeat(32) as `0x${string}`);
const bob = privateKeyToAccount('0x' + '22'.repeat(32) as `0x${string}`);
const origin = 'https://vault.example';
let store: ReturnType<typeof sqliteD1>, env: Env;
function call(path: string, method = 'GET', body?: unknown, cookie = '', csrf = '', requestOrigin: string | null = origin) {
  return worker.fetch(new Request(origin + '/api/' + path, { method, headers: {
    ...(requestOrigin ? { Origin: requestOrigin } : {}), 'Content-Type': 'application/json', Cookie: cookie, 'x-csrf-token': csrf,
  }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), env);
}
async function challenge(wallet = alice) {
  const response = await call('auth/challenge', 'POST', { address: wallet.address });
  expect(response.status).toBe(200);
  return { ...await response.json() as any, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function login(wallet = alice) {
  const issued = await challenge(wallet);
  const signature = await wallet.signMessage({ message: issued.message });
  const response = await call('auth/verify', 'POST', { message: issued.message, signature }, issued.cookie);
  expect(response.status).toBe(200);
  return { ...await response.json() as any, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
beforeEach(() => { store = sqliteD1(); env = { DB: store.db, CHAIN_ID: '10143', CONTRACT_ADDRESS: '0x' + 'ab'.repeat(20) } as Env; });
afterEach(() => { vi.useRealTimers(); store.close(); });
describe('wallet account sessions', () => {
  it('issues deployment-bound SIWE and a secure opaque session for a real signature', async () => {
    const issued = await challenge();
    expect(issued.message).toContain('vault.example wants you to sign in');
    expect(issued.message).toContain('Chain ID: 10143');
    expect(issued.message).toContain('urn:datavault:10143:0x' + 'ab'.repeat(20));
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeGreaterThan(290000);
    const signed = await alice.signMessage({ message: issued.message });
    const response = await call('auth/verify', 'POST', { message: issued.message, signature: signed }, issued.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const session = await response.json() as any;
    expect(session.account.address).toBe(alice.address.toLowerCase());
    expect(session.account.notificationPreferences).toEqual({ inApp: true, email: false });
    const rows = store.sqlite.prepare('SELECT * FROM account_sessions').all();
    expect(JSON.stringify(rows)).not.toContain(response.headers.get('set-cookie')!.split(';')[0].split('=')[1]);
  });
  it('rejects missing browser binding, invalid signature and altered domain, chain or contract', async () => {
    const issued = await challenge();
    const signature = await alice.signMessage({ message: issued.message });
    expect((await call('auth/verify', 'POST', { message: issued.message, signature })).status).toBe(401);
    expect((await call('auth/verify', 'POST', { message: issued.message, signature: await bob.signMessage({ message: issued.message }) }, issued.cookie)).status).toBe(401);
    for (const message of [issued.message.replace('vault.example', 'evil.example'), issued.message.replace('Chain ID: 10143', 'Chain ID: 1'), issued.message.replace('ab'.repeat(20), 'cd'.repeat(20))]) {
      expect((await call('auth/verify', 'POST', { message, signature: await alice.signMessage({ message }) }, issued.cookie)).status).toBe(401);
    }
  });
  it('atomically consumes a nonce once under concurrent valid verification', async () => {
    const issued = await challenge(); const signature = await alice.signMessage({ message: issued.message });
    const results = await Promise.all([0,1].map(() => call('auth/verify', 'POST', { message: issued.message, signature }, issued.cookie)));
    expect(results.map(r => r.status).sort()).toEqual([200,401]);
    expect((await call('auth/verify', 'POST', { message: issued.message, signature }, issued.cookie)).status).toBe(401);
  });
  it('expires challenges and sessions and clears an expired cookie at logout', async () => {
    const issued = await challenge(); const signature = await alice.signMessage({ message: issued.message });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    expect((await call('auth/verify', 'POST', { message: issued.message, signature }, issued.cookie)).status).toBe(401);
    vi.restoreAllMocks();
    const session = await login();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400001);
    expect((await call('account', 'GET', undefined, session.cookie)).status).toBe(401);
    const logout = await call('auth/logout', 'POST', undefined, session.cookie);
    expect(logout.status).toBe(204); expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    vi.restoreAllMocks();
  });
  it('requires strict same-origin mutations and CSRF, and isolates profile updates and export', async () => {
    const a = await login(), b = await login(bob);
    const patch = { displayName: 'Alice', locale: 'en-GB', notificationPreferences: { inApp: false, email: false } };
    expect((await call('account', 'PATCH', patch, a.cookie)).status).toBe(403);
    expect((await call('account', 'PATCH', patch, a.cookie, a.csrfToken, null)).status).toBe(403);
    env.ALLOWED_ORIGINS = 'https://other.example';
    expect((await call('account', 'PATCH', patch, a.cookie, a.csrfToken, 'https://other.example')).status).toBe(403);
    expect((await call('account', 'PATCH', patch, a.cookie, a.csrfToken)).status).toBe(200);
    expect((await (await call('account', 'GET', undefined, b.cookie)).json() as any).account.displayName).toBe('');
    const exported = await call('account/export', 'GET', undefined, a.cookie);
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    const data = await exported.json() as any;
    expect(data.account.displayName).toBe('Alice'); expect(JSON.stringify(data)).not.toContain(bob.address.toLowerCase());
    expect(JSON.stringify(data)).not.toContain(a.csrfToken);
    expect((await call('auth/logout', 'POST', undefined, a.cookie)).status).toBe(403);
    expect((await call('auth/logout', 'POST', undefined, a.cookie, a.csrfToken, null)).status).toBe(403);
    expect((await call('auth/logout', 'POST', undefined, a.cookie, a.csrfToken)).status).toBe(204);
    expect((await call('account', 'GET', undefined, a.cookie)).status).toBe(401);
  });
  it('rejects malformed and unknown fields, unverified email opt-in and oversized PATCH', async () => {
    const a = await login();
    for (const body of [{ address: bob.address }, { displayName: 'x'.repeat(81) }, { locale: 'xx' }, { notificationPreferences: { email: true, inApp: true } }, { notificationPreferences: { inApp: 1 } }, [], 'invalid']) {
      expect((await call('account', 'PATCH', body, a.cookie, a.csrfToken)).status).toBe(400);
    }
    expect((await call('account', 'PATCH', 'x'.repeat(9000), a.cookie, a.csrfToken)).status).toBe(413);
    expect((await call('auth/challenge', 'POST', { address: alice.address, extra: true })).status).toBe(400);
  });
  it('records an idempotent pending deletion request without destroying profile or payment data', async () => {
    const a = await login();
    const first = await (await call('account/deletion-request', 'POST', {}, a.cookie, a.csrfToken)).json();
    const second = await (await call('account/deletion-request', 'POST', {}, a.cookie, a.csrfToken)).json();
    expect(first).toEqual(second); expect(first).toMatchObject({ status: 'pending' });
    expect((await call('account', 'GET', undefined, a.cookie)).status).toBe(200);
    expect((await (await call('account/export', 'GET', undefined, a.cookie)).json() as any).deletionRequests).toHaveLength(1);
  });
  it('rejects public HTTP authentication and allows non-Secure cookies only for local chain', async () => {
    const request = (url: string) => new Request(url + '/api/auth/challenge', { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify({ address: alice.address }) });
    expect((await worker.fetch(request('http://vault.example'), env)).status).toBe(403);
    expect((await worker.fetch(request('http://localhost:8787'), env)).status).toBe(403);
    env.CHAIN_ID = '31337';
    const local = await worker.fetch(request('http://localhost:8787'), env);
    expect(local.status).toBe(200); expect(local.headers.get('set-cookie')).not.toContain('Secure');
    expect((await call('auth/challenge', 'POST', { address: alice.address }, '', '', null)).status).toBe(403);
  });
});

it('rejects a session cookie on a different chain or contract deployment', async () => {
  const a = await login();
  env.CONTRACT_ADDRESS = '0x' + 'cd'.repeat(20);
  expect((await call('account', 'GET', undefined, a.cookie)).status).toBe(401);
  env.CONTRACT_ADDRESS = '0x' + 'ab'.repeat(20); env.CHAIN_ID = '1';
  expect((await call('account', 'GET', undefined, a.cookie)).status).toBe(401);
});
it('does not allow account cookies to replace signed owner/buyer or paid execution authorization', async () => {
  const a = await login();
  expect((await call('owner/collections?address=' + alice.address, 'GET', undefined, a.cookie)).status).toBe(401);
  expect((await call('buyer/queries?address=' + alice.address, 'GET', undefined, a.cookie)).status).toBe(401);
  Object.assign(env, { SETTLEMENT_PRIVATE_KEY: keccak256(toBytes('datavault-test-operator')), MODEL_API_KEY: 'test-key', MODEL_PROVIDER: 'openai' });
  expect((await call('queries/execute', 'POST', { requestId: '0x' + 'aa'.repeat(32), collectionId: '0x' + 'bb'.repeat(32), question: 'A question', openTxHash: '0x' + 'cc'.repeat(32) }, a.cookie)).status).toBe(401);
});


it('bounds challenge creation with the per-IP auth quota', async () => {
  for (let n = 0; n < 10; n++) expect((await call('auth/challenge', 'POST', { address: alice.address })).status).toBe(200);
  const rejected = await call('auth/challenge', 'POST', { address: alice.address });
  expect(rejected.status).toBe(429); expect(rejected.headers.get('Retry-After')).toBe('60');
  expect(store.sqlite.prepare('SELECT * FROM account_nonces').all()).toHaveLength(10);
});
