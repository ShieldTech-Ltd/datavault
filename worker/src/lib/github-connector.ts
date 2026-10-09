import type { Env } from "./types";
import { connectorFetch, connectorKeyValid } from "./connector-security";
import {
  connectorLifecycle,
  IssuedCredentialError,
  type Repository,
  type ConnectorCredential,
} from "./connector-lifecycle";
export type { Connector } from "./connector-lifecycle";
export type GithubCredential = ConnectorCredential;
const headers = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: "Bearer " + token,
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "DataVault-readonly-connector",
});
export function githubConfigured(env: Env) {
  try {
    return Boolean(
      /^[1-9]\d*$/.test(env.GITHUB_APP_ID ?? "") &&
        /^Iv[\w.]+$/.test(env.GITHUB_CLIENT_ID ?? "") &&
        env.GITHUB_CLIENT_SECRET &&
        connectorKeyValid(env) &&
        env.CONNECTOR_ORIGIN &&
        new URL(env.CONNECTOR_ORIGIN).origin === env.CONNECTOR_ORIGIN &&
        new URL(env.CONNECTOR_ORIGIN).protocol === "https:",
    );
  } catch {
    return false;
  }
}
function readOnly(p: any) {
  return (
    p &&
    typeof p === "object" &&
    !Array.isArray(p) &&
    p.contents === "read" &&
    Object.keys(p).every(
      (k) => ["contents", "metadata"].includes(k) && p[k] === "read",
    )
  );
}
function credential(v: any): GithubCredential {
  try {
    return validatedCredential(v);
  } catch {
    if (
      typeof v?.access_token === "string" &&
      /^ghu_[A-Za-z0-9_-]+$/.test(v.access_token) &&
      v.access_token.length <= 4096
    )
      throw new IssuedCredentialError(v.access_token);
    throw Error("Provider credential");
  }
}
function validatedCredential(v: any): GithubCredential {
  if (
    !v ||
    typeof v.access_token !== "string" ||
    !/^ghu_[A-Za-z0-9_-]+$/.test(v.access_token) ||
    v.token_type !== "bearer" ||
    v.scope !== ""
  )
    throw Error("Token kind");
  if (
    v.expires_in !== undefined &&
    (!Number.isSafeInteger(v.expires_in) ||
      v.expires_in <= 0 ||
      v.expires_in > 28800 ||
      typeof v.refresh_token !== "string" ||
      !/^ghr_[A-Za-z0-9_-]+$/.test(v.refresh_token) ||
      !Number.isSafeInteger(v.refresh_token_expires_in) ||
      v.refresh_token_expires_in <= 0)
  )
    throw Error("Token expiry");
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
  "Basic " + btoa(env.GITHUB_CLIENT_ID + ":" + env.GITHUB_CLIENT_SECRET);
async function grant(
  env: Env,
  token: string,
): Promise<{ repositories: Repository[]; login: string }> {
  const check = await connectorFetch(
    `https://api.github.com/applications/${encodeURIComponent(
      env.GITHUB_CLIENT_ID!,
    )}/token`,
    {
      method: "POST",
      headers: {
        ...headers(token),
        Authorization: basic(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
    },
  );
  if (check?.app?.client_id !== env.GITHUB_CLIENT_ID)
    throw Error("App identity");
  const user = await connectorFetch("https://api.github.com/user", {
    headers: headers(token),
  });
  if (
    typeof user.login !== "string" ||
    !/^[a-zA-Z0-9-]{1,39}$/.test(user.login)
  )
    throw Error("User");
  const installations = await connectorFetch(
    "https://api.github.com/user/installations?per_page=100",
    { headers: headers(token) },
  );
  if (
    !Number.isSafeInteger(installations.total_count) ||
    installations.total_count < 1 ||
    installations.total_count > 100 ||
    !Array.isArray(installations.installations) ||
    installations.installations.length !== installations.total_count
  )
    throw Error("Installations");
  const slug = installations.installations[0]?.app_slug;
  if (typeof slug !== "string" || !/^[a-zA-Z0-9-]+$/.test(slug))
    throw Error("App identity");
  const app = await connectorFetch("https://api.github.com/apps/" + slug, {
    headers: headers(token),
  });
  if (
    app.id !== Number(env.GITHUB_APP_ID) ||
    app.client_id !== env.GITHUB_CLIENT_ID ||
    !readOnly(app.permissions)
  )
    throw Error("App permissions");
  const repositories: Repository[] = [];
  for (const installation of installations.installations) {
    if (
      installation.app_id !== Number(env.GITHUB_APP_ID) ||
      installation.app_slug !== slug ||
      installation.repository_selection !== "selected" ||
      !readOnly(installation.permissions) ||
      !Number.isSafeInteger(installation.id) ||
      installation.id <= 0
    )
      throw Error("Installation permissions");
    const result = await connectorFetch(
      `https://api.github.com/user/installations/${installation.id}/repositories?per_page=100`,
      { headers: headers(token) },
    );
    if (
      !Number.isSafeInteger(result.total_count) ||
      result.total_count > 100 ||
      result.total_count < 0 ||
      !Array.isArray(result.repositories) ||
      result.repositories.length !== result.total_count
    )
      throw Error("Repositories");
    for (const r of result.repositories) {
      if (
        !Number.isSafeInteger(r.id) ||
        r.id <= 0 ||
        typeof r.full_name !== "string" ||
        !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(r.full_name)
      )
        throw Error("Repository");
      repositories.push({
        id: r.id,
        name: r.full_name,
        installationId: installation.id,
      });
    }
    if (repositories.length > 100) throw Error("Selection limit");
  }
  if (!repositories.length) throw Error("No selected repositories");
  return { repositories, login: user.login };
}
async function revoke(env: Env, token: string) {
  await connectorFetch(
    `https://api.github.com/applications/${encodeURIComponent(
      env.GITHUB_CLIENT_ID!,
    )}/token`,
    {
      method: "DELETE",
      headers: {
        ...headers(token),
        Authorization: basic(env),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
    },
  );
}

const lifecycle = connectorLifecycle({
  provider: "github",
  label: "GitHub",
  cleanupMessage:
    " GitHub revocation could not be confirmed. Review and revoke the app at https://github.com/settings/apps/authorizations.",
  origin: (env) => env.CONNECTOR_ORIGIN,
  configured: githubConfigured,
  headers,
  selected: (repositories, repository) =>
    repositories.some((r) => r.name.toLowerCase() === repository.toLowerCase()),
  grant: (env, token) => grant(env, token.access),
  revoke,
  authorize(env, state, challenge, callback) {
    const url = new URL("https://github.com/login/oauth/authorize");
    for (const [k, v] of Object.entries({
      client_id: env.GITHUB_CLIENT_ID!,
      redirect_uri: callback,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }))
      url.searchParams.set(k, v);
    return url;
  },
  async exchange(env, code, verifier, callback) {
    return credential(
      await connectorFetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID!,
          client_secret: env.GITHUB_CLIENT_SECRET!,
          code,
          redirect_uri: callback,
          code_verifier: verifier,
        }),
      }),
    );
  },
  async refresh(env, token) {
    return credential(
      await connectorFetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID!,
          client_secret: env.GITHUB_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: token,
        }),
      }),
    );
  },
});
export const githubConnectionMetadata = lifecycle.metadata,
  handleGithubCallback = lifecycle.callback,
  handleGithubConnector = lifecycle.handle,
  githubImportConnection = lifecycle.connection,
  githubCredentialHeader = lifecycle.headers,
  githubCredentialRejected = lifecycle.rejected,
  GithubConnectionError = lifecycle.ConnectionError;
