import type { Env } from './types';
import {
  deployment,
  digest,
  randomToken,
  type AccountSession,
} from './account-session';
const encoder = new TextEncoder();
export function connectorDeployment(env: Env) {
  const d = deployment(env);
  return `${d.chainId}:${d.contract}`;
}
export function connectorKeyValid(env: Env) {
  return /^[a-f0-9]{64}$/i.test(env.CONNECTOR_TOKEN_KEY ?? '');
}
const base64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const unbase64 = (v: string) =>
  Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function key(env: Env) {
  if (!connectorKeyValid(env)) throw Error('Connector key unavailable');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(env.CONNECTOR_TOKEN_KEY!.match(/../g)!, (v) =>
      parseInt(v, 16)
    ),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}
const aad = (env: Env, account: string, provider: string) =>
  encoder.encode(
    JSON.stringify(['v1', account, connectorDeployment(env), provider])
  );
export async function sealConnector(
  env: Env,
  account: string,
  provider: string,
  value: unknown
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(env, account, provider) },
    await key(env),
    encoder.encode(JSON.stringify(value))
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function openConnector<T>(
  env: Env,
  account: string,
  provider: string,
  value: string
): Promise<T> {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1')
    throw Error('Credential version');
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: unbase64(parts[1]),
      additionalData: aad(env, account, provider),
    },
    await key(env),
    unbase64(parts[2])
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function pkceChallenge(verifier: string) {
  return base64(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(verifier))
    )
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
// Bounded streamed bodies and a deadline also cover chunked provider responses.
export async function connectorFetch(
  url: string,
  init: RequestInit = {},
  limit = 1_000_000,
  budget?: { bytes: number; max: number }
): Promise<any> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !['github.com', 'api.github.com', 'api.notion.com'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    throw Error('Provider origin');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!r.ok || r.status >= 300)
      throw Error(`Provider ${(r.status === 401 || r.status === 403) ? 'revoked' : 'rejected'}`);
    if (r.status === 204) return null;
    if (!r.body) throw Error('Provider body');
    const reader = r.body.getReader();
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const p = await reader.read();
        if (p.done) break;
        length += p.value.byteLength;
        if (budget) { budget.bytes += p.value.byteLength; if (budget.bytes > budget.max) throw Error("Provider size"); }
        if (length > limit) throw Error('Provider size');
        chunks.push(p.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    );
  } finally {
    clearTimeout(timer);
  }
}

// Shared five-minute state lifecycle for account connectors. Providers choose a fixed callback.
export async function issueConnectorState(
  env: Env,
  session: AccountSession,
  provider: string
) {
  const state = randomToken(),
    browser = randomToken(),
    verifier = randomToken();
  await env.DB.prepare(
    'DELETE FROM connector_oauth_states WHERE account_id=? AND provider=?'
  )
    .bind(session.account.account_id, provider)
    .run();
  await env.DB.prepare(
    'INSERT INTO connector_oauth_states(state_hash,account_id,provider,deployment,session_hash,browser_hash,verifier,expires_at) VALUES(?,?,?,?,?,?,?,?)'
  )
    .bind(
      await digest(state),
      session.account.account_id,
      provider,
      connectorDeployment(env),
      session.tokenHash,
      await digest(browser),
      await sealConnector(
        env,
        session.account.account_id,
        provider + ':pkce',
        verifier
      ),
      Date.now() + 300000
    )
    .run();
  return { state, browser, challenge: await pkceChallenge(verifier) };
}
export async function consumeConnectorState(
  env: Env,
  session: AccountSession,
  provider: string,
  state: string,
  browser: string
) {
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser))
    return null;
  const hash = await digest(state),
    now = Date.now();
  const row = await env.DB.prepare(
    'SELECT verifier FROM connector_oauth_states WHERE state_hash=? AND account_id=? AND provider=? AND deployment=? AND session_hash=? AND browser_hash=? AND consumed_at IS NULL AND expires_at>?'
  )
    .bind(
      hash,
      session.account.account_id,
      provider,
      connectorDeployment(env),
      session.tokenHash,
      await digest(browser),
      now
    )
    .first<{ verifier: string }>();
  if (!row) return null;
  const claim = await env.DB.prepare(
    'UPDATE connector_oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?'
  )
    .bind(now, hash, now)
    .run();
  if (claim.meta.changes !== 1) return null;
  return openConnector<string>(
    env,
    session.account.account_id,
    provider + ':pkce',
    row.verifier
  );
}
