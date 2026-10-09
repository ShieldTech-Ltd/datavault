import type { Env } from "./types";
import {
  cookie,
  digest,
  randomToken,
  readSession,
  setCookie,
  type AccountSession,
  type AccountRow,
} from "./account-session";
import {
  connectorDeployment,
  openConnector,
  issueConnectorState,
  consumeConnectorState,
  sealConnector,
} from "./connector-security";
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export type Repository = { id: number; name: string; installationId: number };
export type ConnectorCredential = {
  access: string;
  refresh: string | null;
  expires: number | null;
  refreshExpires: number | null;
  workspaceName?: string;
  workspaceId?: string;
  botId?: string;
};
// Carries an issued token only within this request when later response validation
// fails. Route responses and logs never serialize this private value.
export class IssuedCredentialError extends Error {
  constructor(readonly access: string) {
    super("Provider credential rejected");
  }
}
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
export interface ConnectorAdapter {
  provider: "github" | "notion";
  label: string;
  cleanupMessage: string;
  origin(env: Env): string | undefined;
  configured(env: Env): boolean;
  authorize(env: Env, state: string, challenge: string, callback: string): URL;
  exchange(
    env: Env,
    code: string,
    verifier: string,
    callback: string,
  ): Promise<ConnectorCredential>;
  refresh(env: Env, token: string): Promise<ConnectorCredential>;
  grant(
    env: Env,
    token: ConnectorCredential,
  ): Promise<{ repositories: Repository[]; login: string }>;
  revoke(env: Env, token: string): Promise<void>;
  selected(repositories: Repository[], selection: string): boolean;
  headers(token: string): Record<string, string>;
}
export function connectorLifecycle(adapter: ConnectorAdapter) {
  const CALLBACK = "/api/connectors/" + adapter.provider + "/callback",
    BROWSER =
      adapter.provider === "github"
        ? "dv_connector_browser"
        : "dv_notion_browser",
    TTL = 300000;
  const origin = adapter.origin;
  async function own(env: Env, account: AccountRow) {
    return env.DB.prepare(
      `SELECT * FROM account_connectors WHERE account_id=? AND provider='${adapter.provider}' AND deployment=?`,
    )
      .bind(account.account_id, connectorDeployment(env))
      .first<Connector>();
  }
  async function connectionMetadata(env: Env, account: AccountRow) {
    await expirePending(env);
    const row = await own(env, account);
    const cleanupPending = await env.DB.prepare(
      `SELECT id FROM connector_cleanup_obligations WHERE account_id=? AND provider='${adapter.provider}' AND deployment=? LIMIT 1`,
    )
      .bind(account.account_id, connectorDeployment(env))
      .first();
    return {
      providerConfigured: adapter.configured(env),
      id: row?.id ?? null,
      status: row?.status ?? "disconnected",
      login: row?.status === "connected" ? row.login : null,
      repositories:
        row?.status === "connected" ? JSON.parse(row.repositories) : [],
      revocationPending: Boolean(row?.revocation_pending || cleanupPending),
    };
  }
  async function expirePending(env: Env) {
    await env.DB.prepare(
      "DELETE FROM connector_oauth_states WHERE expires_at<=?",
    )
      .bind(Date.now())
      .run();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO connector_cleanup_obligations(id,account_id,provider,deployment,created_at) SELECT lower(hex(randomblob(32))),account_id,provider,deployment,? FROM account_connectors WHERE status='pending' AND pending_expires_at<=? AND credential IS NOT NULL",
      ).bind(now, now),
      env.DB.prepare(
        "UPDATE account_connectors SET status='disconnected',credential=NULL,repositories='[]',credential_version=credential_version+1,revocation_pending=1 WHERE status='pending' AND pending_expires_at<=?",
      ).bind(now),
    ]);
  }
  // Every remote cleanup owns an independent durable obligation. Successful cleanup
  // can remove only its own record, including when a newer connection already exists.
  async function trackedRevoke(
    env: Env,
    accountId: string,
    token: string,
  ): Promise<boolean> {
    const id = randomToken();
    await env.DB.prepare(
      `INSERT INTO connector_cleanup_obligations(id,account_id,provider,deployment,created_at) VALUES(?,?,'${adapter.provider}',?,?)`,
    )
      .bind(id, accountId, connectorDeployment(env), Date.now())
      .run();
    try {
      await adapter.revoke(env, token);
      await env.DB.prepare(
        "DELETE FROM connector_cleanup_obligations WHERE id=? AND account_id=? AND deployment=?",
      )
        .bind(id, accountId, connectorDeployment(env))
        .run();
      return true;
    } catch {
      return false;
    }
  }
  async function handleCallback(request: Request, env: Env): Promise<Response> {
    const deny = (cleanupPending = false) =>
      json(
        {
          error:
            adapter.label +
            " authorization rejected. Return to Settings and reconnect." +
            (cleanupPending ? adapter.cleanupMessage : ""),
        },
        400,
      );
    if (!adapter.configured(env)) return deny();
    const url = new URL(request.url);
    if (
      url.origin + url.pathname !== origin(env) + CALLBACK ||
      url.searchParams.size !== 2 ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("code").length !== 1
    )
      return deny();
    const state = url.searchParams.get("state"),
      code = url.searchParams.get("code"),
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
    let token: ConnectorCredential | null = null;
    try {
      const verifier = await consumeConnectorState(
        env,
        session,
        adapter.provider,
        state,
        browser,
      );
      if (!verifier) return deny();
      token = await adapter.exchange(
        env,
        code,
        verifier,
        origin(env) + CALLBACK,
      );
      const access = await adapter.grant(env, token),
        encrypted = await sealConnector(
          env,
          session.account.account_id,
          adapter.provider,
          token,
        );
      // Recheck the live session after external I/O. Pending capability is never importable.
      const current = await readSession(request, env);
      if (!current || current.tokenHash !== session.tokenHash)
        throw Error("Session changed");
      const inserted = await env.DB.prepare(
        `INSERT INTO account_connectors(id,account_id,provider,deployment,status,credential,repositories,login,session_hash,browser_hash,pending_expires_at,created_at,updated_at) SELECT ?,?,'${adapter.provider}',?,'pending',?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_sessions WHERE token_hash=? AND expires_at>?) AND EXISTS(SELECT 1 FROM connector_oauth_states WHERE state_hash=? AND consumed_at IS NOT NULL AND expires_at>?) ON CONFLICT(account_id,provider,deployment) DO UPDATE SET status='pending',credential=excluded.credential,repositories=excluded.repositories,login=excluded.login,session_hash=excluded.session_hash,browser_hash=excluded.browser_hash,pending_expires_at=excluded.pending_expires_at,credential_version=account_connectors.credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=0,updated_at=excluded.updated_at WHERE account_connectors.status IN ('disconnected','needs_reconnect')`,
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
          Date.now(),
        )
        .run();
      if (inserted.meta.changes !== 1) throw Error("Connection already exists");
      return new Response(null, {
        status: 303,
        headers: {
          Location: origin(env) + "/settings?" + adapter.provider + "=confirm",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    } catch (error) {
      const issued =
        token?.access ??
        (error instanceof IssuedCredentialError ? error.access : null);
      const cleanupPending = issued
        ? !(await trackedRevoke(env, session.account.account_id, issued))
        : false;
      return deny(cleanupPending);
    }
  }
  async function handleConnector(
    request: Request,
    env: Env,
    session: AccountSession,
  ): Promise<Response | null> {
    const path = new URL(request.url).pathname,
      base = "/api/account/connectors/" + adapter.provider;
    if (path !== base && !path.startsWith(base + "/")) return null;
    await expirePending(env);
    if (path === base && request.method === "GET")
      return json(await connectionMetadata(env, session.account));
    if (!["POST", "DELETE"].includes(request.method))
      return json({ error: "Not found" }, 404);
    try {
      const body = await request.json();
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).length
      )
        throw 0;
    } catch {
      return json({ error: "Empty JSON object required." }, 400);
    }
    if (path === base && request.method === "DELETE") {
      const row = await own(env, session.account);
      if (row) {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE account_connectors SET status='disconnected',credential=NULL,repositories='[]',credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=CASE WHEN credential IS NULL THEN revocation_pending ELSE 1 END WHERE id=?",
          ).bind(row.id),
          env.DB.prepare(
            "UPDATE github_import_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL WHERE connection_id=? AND status!='expired'",
          ).bind(row.id),
          env.DB.prepare(
            `DELETE FROM connector_oauth_states WHERE account_id=? AND provider='${adapter.provider}'`,
          ).bind(session.account.account_id),
        ]);
        const jobs = await env.DB.prepare(
          "SELECT draft_key FROM github_import_jobs WHERE connection_id=? AND draft_key IS NOT NULL",
        )
          .bind(row.id)
          .all<{ draft_key: string }>();
        for (const j of jobs.results)
          await env.COLLECTION_STORE.delete(j.draft_key);
        await env.DB.prepare(
          "UPDATE github_import_jobs SET draft_key=NULL WHERE connection_id=?",
        )
          .bind(row.id)
          .run();
        if (row.credential && adapter.configured(env))
          try {
            const token = await openConnector<ConnectorCredential>(
              env,
              row.account_id,
              adapter.provider,
              row.credential,
            );
            if (!(await trackedRevoke(env, row.account_id, token.access)))
              throw Error("Cleanup unconfirmed");
            await env.DB.prepare(
              "UPDATE account_connectors SET revocation_pending=0 WHERE id=? AND credential_version=?",
            )
              .bind(row.id, row.credential_version + 1)
              .run();
          } catch {
            /* Local revocation succeeds even if GitHub is unavailable. */
          }
      } else
        await env.DB.prepare(
          `DELETE FROM connector_oauth_states WHERE account_id=? AND provider='${adapter.provider}'`,
        )
          .bind(session.account.account_id)
          .run();
      return json(await connectionMetadata(env, session.account));
    }
    if (!adapter.configured(env))
      return json(
        {
          error:
            (adapter.provider === "github" ? "Private GitHub" : adapter.label) +
            " is not configured.",
        },
        503,
      );
    if (path === base + "/connect" && request.method === "POST") {
      if (request.headers.get("Origin") !== origin(env))
        return json({ error: "Connector origin rejected." }, 403);
      const previous = await own(env, session.account);
      if (previous && ["pending", "connected"].includes(previous.status))
        return json({ error: "Disconnect the current connection first." }, 409);
      const { state, browser, challenge } = await issueConnectorState(
        env,
        session,
        adapter.provider,
      );
      const authorize = adapter.authorize(
        env,
        state,
        challenge,
        origin(env) + CALLBACK,
      );
      return json({ authorizeUrl: authorize.href }, 200, {
        "Set-Cookie": setCookie(request, BROWSER, browser, TTL / 1000),
      });
    }
    if (
      adapter.provider === "notion" &&
      path === base + "/refresh" &&
      request.method === "POST"
    ) {
      const row = await own(env, session.account);
      if (!row) return json({ error: "Connection unavailable." }, 409);
      try {
        await importConnection(env, session.account, row.id, "", true);
      } catch {
        return json(
          { error: "Connection refresh unavailable. Reconnect or retry." },
          409,
        );
      }
      return json(await connectionMetadata(env, session.account));
    }
    if (path === base + "/confirm" && request.method === "POST") {
      const browser = cookie(request, BROWSER);
      if (!browser) return json({ error: "Confirmation expired." }, 409);
      const result = await env.DB.prepare(
        `UPDATE account_connectors SET status='connected',pending_expires_at=NULL,session_hash=NULL,browser_hash=NULL,updated_at=? WHERE account_id=? AND provider='${adapter.provider}' AND deployment=? AND status='pending' AND pending_expires_at>? AND session_hash=? AND browser_hash=?`,
      )
        .bind(
          Date.now(),
          session.account.account_id,
          connectorDeployment(env),
          Date.now(),
          session.tokenHash,
          await digest(browser),
        )
        .run();
      if (result.meta.changes !== 1)
        return json({ error: "Confirmation expired." }, 409);
      return json(await connectionMetadata(env, session.account), 200, {
        "Set-Cookie": setCookie(request, BROWSER, "", 0),
      });
    }
    return json({ error: "Not found" }, 404);
  }
  class ConnectionError extends Error {
    constructor(public status: number) {
      super(
        adapter.label +
          " connection unavailable. Reconnect or retry after the current operation.",
      );
    }
  }
  async function reconnect(env: Env, row: Connector) {
    await env.DB.prepare(
      "UPDATE account_connectors SET status='needs_reconnect',credential=NULL,credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,revocation_pending=1 WHERE id=? AND credential_version=? AND status='connected'",
    )
      .bind(row.id, row.credential_version)
      .run();
  }
  async function importConnection(
    env: Env,
    account: AccountRow,
    id: string,
    repository: string,
    forceRefresh = false,
  ): Promise<Connector> {
    if (!adapter.configured(env)) throw new ConnectionError(403);
    let row = await own(env, account);
    if (
      !row ||
      row.id !== id ||
      row.status !== "connected" ||
      !row.credential ||
      !adapter.selected(JSON.parse(row.repositories), repository)
    )
      throw new ConnectionError(403);
    if (row.refresh_lease) {
      if (row.refresh_expires_at! > Date.now()) throw new ConnectionError(409);
      await reconnect(env, row);
      throw new ConnectionError(403);
    }
    let value: ConnectorCredential;
    try {
      value = await openConnector<ConnectorCredential>(
        env,
        row.account_id,
        adapter.provider,
        row.credential,
      );
    } catch {
      await reconnect(env, row);
      throw new ConnectionError(403);
    }
    if (
      forceRefresh ||
      (value.expires !== null && value.expires < Date.now() + 60000)
    ) {
      if (
        !value.refresh ||
        (value.refreshExpires !== null && value.refreshExpires <= Date.now())
      ) {
        await reconnect(env, row);
        throw new ConnectionError(403);
      }
      const lease = randomToken(),
        version = row.credential_version;
      const claim = await env.DB.prepare(
        "UPDATE account_connectors SET refresh_lease=?,refresh_expires_at=? WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL",
      )
        .bind(lease, Date.now() + 120000, row.id, version)
        .run();
      if (claim.meta.changes !== 1) throw new ConnectionError(409);
      let rotated: ConnectorCredential | null = null;
      try {
        rotated = await adapter.refresh(env, value.refresh);
        const access = await adapter.grant(env, rotated);
        const encrypted = await sealConnector(
          env,
          row.account_id,
          adapter.provider,
          rotated,
        );
        const saved = await env.DB.prepare(
          "UPDATE account_connectors SET credential=?,repositories=?,credential_version=credential_version+1,refresh_lease=NULL,refresh_expires_at=NULL,updated_at=? WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease=? AND refresh_expires_at>?",
        )
          .bind(
            encrypted,
            JSON.stringify(access.repositories),
            Date.now(),
            row.id,
            version,
            lease,
            Date.now(),
          )
          .run();
        if (saved.meta.changes !== 1) throw Error("Refresh fenced");
        row = (await own(env, account))!;
      } catch (error) {
        await reconnect(env, row);
        const issued =
          rotated?.access ??
          (error instanceof IssuedCredentialError ? error.access : null);
        if (issued) await trackedRevoke(env, row.account_id, issued);
        throw new ConnectionError(403);
      }
    }
    try {
      const currentToken = await openConnector<ConnectorCredential>(
        env,
        row.account_id,
        adapter.provider,
        row.credential!,
      );
      const currentGrant = await adapter.grant(env, currentToken);
      if (!adapter.selected(currentGrant.repositories, repository))
        throw Error("Selection removed");
      const current = await own(env, account);
      if (
        !current ||
        current.status !== "connected" ||
        current.credential_version !== row.credential_version ||
        current.refresh_lease
      )
        throw Error("Credential changed");
    } catch {
      await reconnect(env, row);
      throw new ConnectionError(403);
    }
    if (!adapter.selected(JSON.parse(row.repositories), repository))
      throw new ConnectionError(403);
    return row;
  }
  async function credentialHeader(
    env: Env,
    id: string,
    accountId: string,
    version: number,
  ) {
    if (!adapter.configured(env)) throw new ConnectionError(403);
    const row = await env.DB.prepare(
      "SELECT * FROM account_connectors WHERE id=? AND account_id=? AND deployment=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL",
    )
      .bind(id, accountId, connectorDeployment(env), version)
      .first<Connector>();
    if (!row?.credential) throw new ConnectionError(403);
    const token = await openConnector<ConnectorCredential>(
      env,
      row.account_id,
      adapter.provider,
      row.credential,
    );
    if (token.expires !== null && token.expires <= Date.now())
      throw new ConnectionError(403);
    if (
      !(await env.DB.prepare(
        "SELECT id FROM account_connectors WHERE id=? AND status='connected' AND credential_version=? AND refresh_lease IS NULL",
      )
        .bind(row.id, version)
        .first())
    )
      throw new ConnectionError(403);
    return adapter.headers(token.access);
  }
  async function credentialRejected(env: Env, id: string, version: number) {
    const row = await env.DB.prepare(
      "SELECT * FROM account_connectors WHERE id=? AND credential_version=?",
    )
      .bind(id, version)
      .first<Connector>();
    if (row) await reconnect(env, row);
  }
  return {
    metadata: connectionMetadata,
    callback: handleCallback,
    handle: handleConnector,
    connection: importConnection,
    headers: credentialHeader,
    rejected: credentialRejected,
    ConnectionError,
  };
}
