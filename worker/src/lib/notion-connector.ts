import type { Env } from "./types";
import {
  connectorLifecycle,
  IssuedCredentialError,
  type ConnectorCredential,
} from "./connector-lifecycle";
import { connectorFetch, connectorKeyValid } from "./connector-security";
export const NOTION_API_VERSION = "2026-03-11";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const secret = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 4096 &&
  !/[\s\x00-\x1f\x7f]/.test(v);
export function notionConfigured(env: Env) {
  try {
    return Boolean(
      uuid.test(env.NOTION_CLIENT_ID ?? "") &&
        env.NOTION_CLIENT_SECRET &&
        connectorKeyValid(env) &&
        env.PUBLIC_ORIGIN &&
        new URL(env.PUBLIC_ORIGIN).origin === env.PUBLIC_ORIGIN &&
        new URL(env.PUBLIC_ORIGIN).protocol === "https:",
    );
  } catch {
    return false;
  }
}
const headers = (token: string) => ({
  "Notion-Version": NOTION_API_VERSION,
  Authorization: "Bearer " + token,
  "Content-Type": "application/json",
});
async function oauth(
  env: Env,
  path: "token" | "revoke" | "introspect",
  body: unknown,
) {
  return connectorFetch("https://api.notion.com/v1/oauth/" + path, {
    method: "POST",
    headers: {
      ...headers(""),
      Authorization:
        "Basic " + btoa(env.NOTION_CLIENT_ID + ":" + env.NOTION_CLIENT_SECRET),
    },
    body: JSON.stringify(body),
  });
}
function credential(v: any): ConnectorCredential {
  if (
    !v ||
    !secret(v.access_token) ||
    v.token_type !== "bearer" ||
    !(v.refresh_token === null || secret(v.refresh_token)) ||
    !uuid.test(v.bot_id) ||
    !uuid.test(v.workspace_id) ||
    (v.workspace_name !== null &&
      (typeof v.workspace_name !== "string" || v.workspace_name.length > 512))
  ) {
    if (secret(v?.access_token))
      throw new IssuedCredentialError(v.access_token);
    throw Error("Provider credential");
  }
  // Current Notion token responses document no expiry. Do not infer a lifetime.
  return {
    access: v.access_token,
    refresh: v.refresh_token,
    expires: null,
    refreshExpires: null,
    workspaceName: v.workspace_name || "Notion workspace",
    workspaceId: v.workspace_id,
    botId: v.bot_id,
  };
}
const lifecycle = connectorLifecycle({
  provider: "notion",
  label: "Notion",
  cleanupMessage:
    " Notion revocation could not be confirmed. Remove the connection in your Notion workspace settings.",
  origin: (env) => env.PUBLIC_ORIGIN,
  configured: notionConfigured,
  headers,
  selected: () => true,
  authorize(env, state, _challenge, callback) {
    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    for (const [k, v] of Object.entries({
      client_id: env.NOTION_CLIENT_ID!,
      owner: "user",
      response_type: "code",
      redirect_uri: callback,
      state,
    }))
      url.searchParams.set(k, v);
    return url;
  },
  async exchange(env, code, _verifier, callback) {
    return credential(
      await oauth(env, "token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: callback,
      }),
    );
  },
  async refresh(env, refresh_token) {
    return credential(
      await oauth(env, "token", { grant_type: "refresh_token", refresh_token }),
    );
  },
  async grant(env, token) {
    const value = await oauth(env, "introspect", { token: token.access });
    if (value?.active !== true) throw Error("Provider revoked");
    return {
      repositories: [],
      login: token.workspaceName || "Notion workspace",
    };
  },
  async revoke(env, token) {
    await oauth(env, "revoke", { token });
  },
});
export const notionConnectionMetadata = lifecycle.metadata,
  handleNotionCallback = lifecycle.callback,
  handleNotionConnector = lifecycle.handle,
  notionImportConnection = lifecycle.connection,
  notionCredentialHeader = lifecycle.headers,
  notionCredentialRejected = lifecycle.rejected,
  NotionConnectionError = lifecycle.ConnectionError;
