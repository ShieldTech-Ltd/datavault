import type { Env } from './types';
import {
  cookie,
  digest,
  randomToken,
  readSession,
  setCookie,
  type AccountSession,
  type AccountRow,
} from './account-session';
import {
  connectorDeployment,
  connectorFetch,
  connectorKeyValid,
  openConnector,
  issueConnectorState,
  consumeConnectorState,
  sealConnector,
} from './connector-security';
const CALLBACK = '/api/connectors/github/callback',
  BROWSER = 'dv_connector_browser',
  TTL = 300000;
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {}
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
const headers = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + token,
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'DataVault-readonly-connector',
});
type Repository = { id: number; name: string; installationId: number };
export type GithubCredential = {
  access: string;
  refresh: string | null;
  expires: number | null;
  refreshExpires: number | null;
};
export type Connector = {
  id: string;
  account_id: string;
  deployment: string;
  status: string;
  credential: string | null;
  credential_version: number;
  repositories: string;
  login: string | null;
  session_hash: string | null;
  browser_hash: string | null;
  pending_expires_at: number | null;
  refresh_lease: string | null;
  refresh_expires_at: number | null;
  revocation_pending: number;
};
export function githubConfigured(env: Env) {
  try {
    return Boolean(
      /^[1-9]\d*$/.test(env.GITHUB_APP_ID ?? '') &&
        /^Iv[\w.]+$/.test(env.GITHUB_CLIENT_ID ?? '') &&
        env.GITHUB_CLIENT_SECRET &&
        connectorKeyValid(env) &&
        env.CONNECTOR_ORIGIN &&
        new URL(env.CONNECTOR_ORIGIN).origin === env.CONNECTOR_ORIGIN &&
        new URL(env.CONNECTOR_ORIGIN).protocol === 'https:'
    );
  } catch {
    return false;
  }
}
async function own(env: Env, account: AccountRow) {
  return env.DB.prepare(
    "SELECT * FROM account_connectors WHERE account_id=? AND provider='github' AND deployment=?"
  )
    .bind(account.account_id, connectorDeployment(env))
    .first<Connector>();
}
export async function githubConnectionMetadata(env: Env, account: AccountRow) {
  await expirePending(env);
  const row = await own(env, account);
  return {
    providerConfigured: githubConfigured(env),
    id: row?.id ?? null,
    status: row?.status ?? 'disconnected',
    login: row?.status === 'connected' ? row.login : null,
    repositories:
      row?.status === 'connected' ? JSON.parse(row.repositories) : [],
    revocationPending: Boolean(row?.revocation_pending),
  };
}
async function expirePending(env: Env) {
  await env.DB.prepare('DELETE FROM connector_oauth_states WHERE expires_at<=?')
    .bind(Date.now())
    .run();
  await env.DB.prepare(
    "UPDATE account_connectors SET status='disconnected',credential=NULL,repositories='[]',credential_version=credential_version+1,revocation_pending=1 WHERE status='pending' AND pending_expires_at<=?"
  )
    .bind(Date.now())
    .run();
}
function readOnly(p: any) {
  return (
    p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    p.contents === 'read' &&
    Object.keys(p).every(
      (k) => ['contents', 'metadata'].includes(k) && p[k] === 'read'
    )
  );
}
function credential(v: any): GithubCredential {
  if (
    !v ||
    typeof v.access_token !== 'string' ||
    !/^ghu_[A-Za-z0-9_-]+$/.test(v.access_token) ||
    v.token_type !== 'bearer' ||
    v.scope !== ''
  )
    throw Error('Token kind');
  if (
    v.expires_in !== undefined &&
    (!Number.isSafeInteger(v.expires_in) ||
      v.expires_in <= 0 ||
      v.expires_in > 28800 ||
      typeof v.refresh_token !== 'string' ||
      !/^ghr_[A-Za-z0-9_-]+$/.test(v.refresh_token) ||
      !Number.isSafeInteger(v.refresh_token_expires_in) ||
      v.refresh_token_expires_in <= 0)
  )
    throw Error('Token expiry');
  return {
    access: v.access_token,
    refresh: v.expires_in === undefined ? null : v.refresh_token,
    expires:
      v.expires_in === undefined ? null : Date.now() + v.expires_in * 1000,
    refreshExpires:
      v.expires_in === undefined
        ? null
        : Date.now() + v.refresh_token_expires_in * 1000,
  };
}
const basic = (env: Env) =>
  'Basic ' + btoa(env.GITHUB_CLIENT_ID + ':' + env.GITHUB_CLIENT_SECRET);
async function grant(
  env: Env,
  token: string
): Promise<{ repositories: Repository[]; login: string }> {
  const check = await connectorFetch(
    `https://api.github.com/applications/${encodeURIComponent(
      env.GITHUB_CLIENT_ID!
    )}/token`,
    {
      method: 'POST',
      headers: {
        ...headers(token),
        Authorization: basic(env),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    }
  );
  if (check?.app?.client_id !== env.GITHUB_CLIENT_ID)
    throw Error('App identity');
  const user = await connectorFetch('https://api.github.com/user', {
    headers: headers(token),
  });
  if (
    typeof user.login !== 'string' ||
    !/^[a-zA-Z0-9-]{1,39}$/.test(user.login)
  )
    throw Error('User');
  const installations = await connectorFetch(
    'https://api.github.com/user/installations?per_page=100',
    { headers: headers(token) }
  );
  if (
    !Number.isSafeInteger(installations.total_count) ||
    installations.total_count < 1 ||
    installations.total_count > 100 ||
    !Array.isArray(installations.installations) ||
    installations.installations.length !== installations.total_count
  )
    throw Error('Installations');
  const slug = installations.installations[0]?.app_slug;
  if (typeof slug !== 'string' || !/^[a-zA-Z0-9-]+$/.test(slug))
    throw Error('App identity');
  const app = await connectorFetch('https://api.github.com/apps/' + slug, {
    headers: headers(token),
  });
  if (
    app.id !== Number(env.GITHUB_APP_ID) ||
    app.client_id !== env.GITHUB_CLIENT_ID ||
    !readOnly(app.permissions)
  )
    throw Error('App permissions');
  const repositories: Repository[] = [];
  for (const installation of installations.installations) {
    if (
      installation.app_id !== Number(env.GITHUB_APP_ID) ||
      installation.app_slug !== slug ||
      installation.repository_selection !== 'selected' ||
      !readOnly(installation.permissions) ||
      !Number.isSafeInteger(installation.id) ||
      installation.id <= 0
    )
      throw Error('Installation permissions');
    const result = await connectorFetch(
      `https://api.github.com/user/installations/${installation.id}/repositories?per_page=100`,
      { headers: headers(token) }
    );
    if (
      !Number.isSafeInteger(result.total_count) ||
      result.total_count > 100 ||
      result.total_count < 0 ||
      !Array.isArray(result.repositories) ||
      result.repositories.length !== result.total_count
    )
      throw Error('Repositories');
    for (const r of result.repositories) {
      if (
        !Number.isSafeInteger(r.id) ||
        r.id <= 0 ||
        typeof r.full_name !== 'string' ||
        !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(r.full_name)
      )
        throw Error('Repository');
      repositories.push({
        id: r.id,
        name: r.full_name,
        installationId: installation.id,
      });
    }
    if (repositories.length > 100) throw Error('Selection limit');
  }
  if (!repositories.length) throw Error('No selected repositories');
  return { repositories, login: user.login };
}
async function revoke(env: Env, token: string) {
  await connectorFetch(
    `https://api.github.com/applications/${encodeURIComponent(
      env.GITHUB_CLIENT_ID!
    )}/token`,
    {
      method: 'DELETE',
      headers: {
        ...headers(token),
        Authorization: basic(env),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    }
  );
}
export async function handleGithubCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const deny = () =>
    json(
      {
        error:
          'GitHub authorization rejected. Return to Settings and reconnect.',
      },
      400
    );
  if (!githubConfigured(env)) return deny();
  const url = new URL(request.url);
  if (
    url.origin + url.pathname !== env.CONNECTOR_ORIGIN + CALLBACK ||
    url.searchParams.size !== 2 ||
    url.searchParams.getAll('state').length !== 1 ||
    url.searchParams.getAll('code').length !== 1
  )
    return deny();
  const state = url.searchParams.get('state'),
    code = url.searchParams.get('code'),
    browser = cookie(request, BROWSER),
    session = await readSession(request, env);
  if (
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !code ||
    code.length > 256 ||
    !browser ||
    !session
  )
    return deny();
  const hash = await digest(state),
    browserHash = await digest(browser),
    dep = connectorDeployment(env),
    now = Date.now();
  let token: GithubCredential | null = null;
  try {
    const verifier = await consumeConnectorState(
      env,
      session,
      'github',
      state,
      browser
    );
    if (!verifier) return deny();
    token = credential(
      await connectorFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID!,
          client_secret: env.GITHUB_CLIENT_SECRET!,
          code,
          redirect_uri: env.CONNECTOR_ORIGIN + CALLBACK,
          code_verifier: verifier,
        }),
      })
    );
    const access = await grant(env, token.access),
      encrypted = await sealConnector(
        env,
        session.account.account_id,
        'github',
        token
      );
    // Recheck the live session after external I/O. Pending capability is never importable.
    const current = await readSession(request, env);
    if (!current || current.tokenHash !== session.tokenHash)
      throw Error('Session changed');
    const inserted = await env.DB.prepare(
      "INSERT INTO account_connectors(id,account_id,provider,deployment,status,credential,repositories,login,session_hash,browser_hash,pending_expires_at,created_at,updated_at) SELECT ?,?,'github',?,'pending',?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_sessions WHERE token_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM connector_oauth_states WHERE state_hash=? AND consumed_at IS NOT NULL AND expires_at>?) ON CONFLICT(account_id,provider,deployment) DO UPDATE SET status='pending',credential=excluded.credential,repositories=excluded.repositories,login=excluded.login,session_hash=excluded.session_hash,browser_hash=excluded.browser_hash,pending_expires_at=excluded.pending_expires_at,credential_version=account_connectors.credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=0,updated_at=excluded.updated_at WHERE account_connectors.status IN ('disconnected','needs_reconnect')"
    )
      .bind(
        randomToken(),
        session.account.account_id,
        dep,
        encrypted,
        JSON.stringify(access.repositories),
        access.login,
        session.tokenHash,
        browserHash,
        Date.now() + TTL,
        now,
        now,
        session.tokenHash,
        Date.now(),
        hash,
        Date.now()
      )
      .run();
    if (inserted.meta.changes !== 1) throw Error('Connection already exists');
    return new Response(null, {
      status: 303,
      headers: {
        Location: env.CONNECTOR_ORIGIN + '/settings?github=confirm',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    if (token)
      try {
        await revoke(env, token.access);
      } catch {
        /* No local capability exists; the user can revoke in GitHub settings. */
      }
    return deny();
  }
}
export async function handleGithubConnector(
  request: Request,
  env: Env,
  session: AccountSession
): Promise<Response | null> {
  const path = new URL(request.url).pathname,
    base = '/api/account/connectors/github';
  if (path !== base && !path.startsWith(base + '/')) return null;
  await expirePending(env);
  if (path === base && request.method === 'GET')
    return json(await githubConnectionMetadata(env, session.account));
  if (!['POST', 'DELETE'].includes(request.method))
    return json({ error: 'Not found' }, 404);
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    )
      throw 0;
  } catch {
    return json({ error: 'Empty JSON object required.' }, 400);
  }
  if (path === base && request.method === 'DELETE') {
    const row = await own(env, session.account);
    if (row) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE account_connectors SET status='disconnected',credential=NULL,repositories='[]',credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=CASE WHEN credential IS NULL THEN revocation_pending ELSE 1 END WHERE id=?"
        ).bind(row.id),
        env.DB.prepare(
          "UPDATE github_import_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE connection_id=? AND status!='expired'"
        ).bind(row.id),
        env.DB.prepare(
          "DELETE FROM connector_oauth_states WHERE account_id=? AND provider='github'"
        ).bind(session.account.account_id),
      ]);
      const jobs = await env.DB.prepare(
        'SELECT draft_key FROM github_import_jobs WHERE connection_id=? AND draft_key IS NOT NULL'
      )
        .bind(row.id)
        .all<{ draft_key: string }>();
      for (const j of jobs.results)
        await env.COLLECTION_STORE.delete(j.draft_key);
      await env.DB.prepare(
        'UPDATE github_import_jobs SET draft_key=NULL WHERE connection_id=?'
      )
        .bind(row.id)
        .run();
      if (row.credential && githubConfigured(env))
        try {
          const token = await openConnector<GithubCredential>(
            env,
            row.account_id,
            'github',
            row.credential
          );
          await revoke(env, token.access);
          await env.DB.prepare(
            'UPDATE account_connectors SET revocation_pending=0 WHERE id=? AND credential_version=?'
          )
            .bind(row.id, row.credential_version + 1)
            .run();
        } catch {
          /* Local revocation succeeds even if GitHub is unavailable. */
        }
    } else
      await env.DB.prepare(
        "DELETE FROM connector_oauth_states WHERE account_id=? AND provider='github'"
      )
        .bind(session.account.account_id)
        .run();
    return json(await githubConnectionMetadata(env, session.account));
  }
  if (!githubConfigured(env))
    return json({ error: 'Private GitHub is not configured.' }, 503);
  if (path === base + '/connect' && request.method === 'POST') {
    if (request.headers.get('Origin') !== env.CONNECTOR_ORIGIN)
      return json({ error: 'Connector origin rejected.' }, 403);
    const previous = await own(env, session.account);
    if (previous && ['pending', 'connected'].includes(previous.status))
      return json({ error: 'Disconnect the current connection first.' }, 409);
    const { state, browser, challenge } = await issueConnectorState(
      env,
      session,
      'github'
    );
    const authorize = new URL('https://github.com/login/oauth/authorize');
    for (const [k, v] of Object.entries({
      client_id: env.GITHUB_CLIENT_ID!,
      redirect_uri: env.CONNECTOR_ORIGIN + CALLBACK,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }))
      authorize.searchParams.set(k, v);
    return json({ authorizeUrl: authorize.href }, 200, {
      'Set-Cookie': setCookie(request, BROWSER, browser, TTL / 1000),
    });
  }
  if (path === base + '/confirm' && request.method === 'POST') {
    const browser = cookie(request, BROWSER);
    if (!browser) return json({ error: 'Confirmation expired.' }, 409);
    const result = await env.DB.prepare(
      "UPDATE account_connectors SET status='connected',pending_expires_at=NULL,session_hash=NULL,browser_hash=NULL,updated_at=? WHERE account_id=? AND provider='github' AND deployment=? AND status='pending' AND pending_expires_at>? AND session_hash=? AND browser_hash=?"
    )
      .bind(
        Date.now(),
        session.account.account_id,
        connectorDeployment(env),
        Date.now(),
        session.tokenHash,
        await digest(browser)
      )
      .run();
    if (result.meta.changes !== 1)
      return json({ error: 'Confirmation expired.' }, 409);
    return json(await githubConnectionMetadata(env, session.account), 200, {
      'Set-Cookie': setCookie(request, BROWSER, '', 0),
    });
  }
  return json({ error: 'Not found' }, 404);
}
export class GithubConnectionError extends Error {
  constructor(public status: number) {
    super(
      'GitHub connection unavailable. Reconnect or retry after the current operation.'
    );
  }
}
async function reconnect(env: Env, row: Connector) {
  await env.DB.prepare(
    "UPDATE account_connectors SET status='needs_reconnect',credential=NULL,credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=1 WHERE id=? AND credential_version=? AND status='connected'"
  )
    .bind(row.id, row.credential_version)
    .run();
}
export async function githubImportConnection(
  env: Env,
  account: AccountRow,
  id: string,
  repository: string
): Promise<Connector> {
  if (!githubConfigured(env)) throw new GithubConnectionError(403);
  let row = await own(env, account);
  if (
    !row ||
    row.id !== id ||
    row.status !== 'connected' ||
    !row.credential ||
    !(JSON.parse(row.repositories) as Repository[]).some(
      (r) => r.name.toLowerCase() === repository.toLowerCase()
    )
  )
    throw new GithubConnectionError(403);
  if (row.refresh_lease) {
    if (row.refresh_expires_at! > Date.now())
      throw new GithubConnectionError(409);
    await reconnect(env, row);
    throw new GithubConnectionError(403);
  }
  let value: GithubCredential;
  try {
    value = await openConnector<GithubCredential>(
      env,
      row.account_id,
      'github',
      row.credential
    );
  } catch {
    await reconnect(env, row);
    throw new GithubConnectionError(403);
  }
  if (value.expires !== null && value.expires < Date.now() + 60000) {
    if (
      !value.refresh ||
      !value.refreshExpires ||
      value.refreshExpires <= Date.now()
    ) {
      await reconnect(env, row);
      throw new GithubConnectionError(403);
    }
    const lease = randomToken(),
      version = row.credential_version;
    const claim = await env.DB.prepare(
      "UPDATE account_connectors SET refresh_lease=?,refresh_expires_at=? WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL"
    )
      .bind(lease, Date.now() + 120000, row.id, version)
      .run();
    if (claim.meta.changes !== 1) throw new GithubConnectionError(409);
    let rotated: GithubCredential | null = null;
    try {
      rotated = credential(
        await connectorFetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: env.GITHUB_CLIENT_ID!,
            client_secret: env.GITHUB_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: value.refresh,
          }),
        })
      );
      const access = await grant(env, rotated.access);
      const encrypted = await sealConnector(
        env,
        row.account_id,
        'github',
        rotated
      );
      const saved = await env.DB.prepare(
        "UPDATE account_connectors SET credential=?,repositories=?,credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,updated_at=? WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease=? AND refresh_expires_at>?"
      )
        .bind(
          encrypted,
          JSON.stringify(access.repositories),
          Date.now(),
          row.id,
          version,
          lease,
          Date.now()
        )
        .run();
      if (saved.meta.changes !== 1) throw Error('Refresh fenced');
      row = (await own(env, account))!;
    } catch {
      await reconnect(env, row);
      if (rotated)
        try {
          await revoke(env, rotated.access);
        } catch {
          /* Manual revocation remains available. */
        }
      throw new GithubConnectionError(403);
    }
  }
  try {
    const currentToken = await openConnector<GithubCredential>(
      env,
      row.account_id,
      'github',
      row.credential!
    );
    const currentGrant = await grant(env, currentToken.access);
    if (
      !currentGrant.repositories.some(
        (r) => r.name.toLowerCase() === repository.toLowerCase()
      )
    )
      throw Error('Selection removed');
    const current = await own(env, account);
    if (
      !current ||
      current.status !== 'connected' ||
      current.credential_version !== row.credential_version ||
      current.refresh_lease
    )
      throw Error('Credential changed');
  } catch {
    await reconnect(env, row);
    throw new GithubConnectionError(403);
  }
  if (
    !(JSON.parse(row.repositories) as Repository[]).some(
      (r) => r.name.toLowerCase() === repository.toLowerCase()
    )
  )
    throw new GithubConnectionError(403);
  return row;
}
export async function githubCredentialHeader(
  env: Env,
  id: string,
  accountId: string,
  version: number
) {
  const row = await env.DB.prepare(
    "SELECT * FROM account_connectors WHERE id=? AND account_id=? AND deployment=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL"
  )
    .bind(id, accountId, connectorDeployment(env), version)
    .first<Connector>();
  if (!row?.credential) throw new GithubConnectionError(403);
  const token = await openConnector<GithubCredential>(
    env,
    row.account_id,
    'github',
    row.credential
  );
  if (token.expires !== null && token.expires <= Date.now())
    throw new GithubConnectionError(403);
  if (
    !(await env.DB.prepare(
      "SELECT id FROM account_connectors WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL"
    )
      .bind(row.id, version)
      .first())
  )
    throw new GithubConnectionError(403);
  return headers(token.access);
}
export async function githubCredentialRejected(
  env: Env,
  id: string,
  version: number
) {
  const row = await env.DB.prepare(
    'SELECT * FROM account_connectors WHERE id=? AND credential_version=?'
  )
    .bind(id, version)
    .first<Connector>();
  if (row) await reconnect(env, row);
}
