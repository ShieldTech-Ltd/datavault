import { beforeEach, afterEach, it, expect, vi } from "vitest";
import worker from "../index";
import { sqliteD1 } from "./sqlite-d1";
import { digest } from "../lib/account-session";
import { openConnector } from "../lib/connector-security";
import type { Env } from "../lib/types";
let store: ReturnType<typeof sqliteD1>, env: Env;
const csrf = "c".repeat(64);
const request = (suffix = "", method = "GET", body?: unknown) =>
  worker.fetch(
    new Request(
      "https://vault.example/api/account/connectors/notion" + suffix,
      {
        method,
        headers: {
          Origin: "https://vault.example",
          Cookie: "dv_session=" + "1".repeat(64),
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    env,
  );
beforeEach(async () => {
  store = sqliteD1();
  env = {
    DB: store.db,
    CHAIN_ID: "10143",
    CONTRACT_ADDRESS: "0x" + "ab".repeat(20),
  } as Env;
  await env.DB.prepare(
    "INSERT INTO accounts(account_id,address,chain_id,contract_address,created_at,updated_at) VALUES(?,?,?,?,1,1)",
  )
    .bind("a1", "0x" + "1".repeat(40), 10143, env.CONTRACT_ADDRESS)
    .run();
  await env.DB.prepare(
    "INSERT INTO account_sessions(token_hash,account_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,1)",
  )
    .bind(await digest("1".repeat(64)), "a1", csrf, Date.now() + 1000000)
    .run();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  store.close();
});
it("reports disabled Notion without granting private import capability", async () => {
  const r = await request();
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    providerConfigured: false,
    status: "disconnected",
  });
  expect((await request("/connect", "POST", {})).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
function configure() {
  Object.assign(env, {
    NOTION_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
    NOTION_CLIENT_SECRET: "notion-client-secret",
    PUBLIC_ORIGIN: "https://vault.example",
    CONNECTOR_TOKEN_KEY: "ab".repeat(32),
  });
}
const token = {
  access_token: "ntn_fixture_private",
  refresh_token: "ntn_fixture_refresh",
  token_type: "bearer",
  bot_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  workspace_name: "Selected workspace",
};
async function begin() {
  const r = await request("/connect", "POST", {});
  expect(r.status).toBe(200);
  const v = (await r.json()) as any;
  return {
    state: new URL(v.authorizeUrl).searchParams.get("state"),
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    url: new URL(v.authorizeUrl),
  };
}
async function callback(state: string | null, cookie: string, owner = "1") {
  return worker.fetch(
    new Request(
      "https://vault.example/api/connectors/notion/callback?state=" +
        state +
        "&code=fixture-code",
      { headers: { Cookie: "dv_session=" + owner.repeat(64) + "; " + cookie } },
    ),
    env,
  );
}
const provider = async (url: any, init: any) => {
  expect(new URL(url).hostname).toBe("api.notion.com");
  expect(init.redirect).toBe("manual");
  expect(init.headers["Notion-Version"]).toBe("2026-03-11");
  return new Response(
    JSON.stringify(
      String(url).endsWith("/introspect")
        ? { active: true }
        : String(url).endsWith("/revoke")
          ? { request_id: "fixture" }
          : token,
    ),
  );
};
it("uses selected-page consent, encrypted pending token and CSRF confirmation before capability", async () => {
  configure();
  vi.mocked(fetch).mockImplementation(provider);
  const b = await begin();
  expect(b.url.origin + b.url.pathname).toBe(
    "https://api.notion.com/v1/oauth/authorize",
  );
  expect(b.url.searchParams.get("owner")).toBe("user");
  expect(b.url.searchParams.get("redirect_uri")).toBe(
    "https://vault.example/api/connectors/notion/callback",
  );
  expect((await callback(b.state, b.cookie)).status).toBe(303);
  let row = store.sqlite
    .prepare("SELECT * FROM account_connectors WHERE provider='notion'")
    .all()[0];
  expect(row.status).toBe("pending");
  expect(row.credential).not.toContain(token.access_token);
  expect(JSON.stringify(await (await request()).json())).not.toContain(
    token.access_token,
  );
  expect((await request("/confirm", "POST", {})).status).toBe(409);
  const r = await worker.fetch(
    new Request("https://vault.example/api/account/connectors/notion/confirm", {
      method: "POST",
      headers: {
        Origin: "https://vault.example",
        Cookie: "dv_session=" + "1".repeat(64) + "; " + b.cookie,
        "x-csrf-token": csrf,
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(((await r.json()) as any).status).toBe("connected");
  expect((await callback(b.state, b.cookie)).status).toBe(400);
});
it("rejects wrong browser before any token exchange", async () => {
  configure();
  const b = await begin();
  expect((await callback(b.state, "dv_notion_browser=wrong")).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
async function connected() {
  configure();
  vi.mocked(fetch).mockImplementation(provider);
  const b = await begin();
  expect((await callback(b.state, b.cookie)).status).toBe(303);
  await env.DB.prepare(
    "UPDATE account_connectors SET status='connected',pending_expires_at=NULL,session_hash=NULL,browser_hash=NULL WHERE provider='notion'",
  ).run();
  return b;
}
it.each(["account", "deployment", "expired", "logout"])(
  "rejects callback bound to changed %s",
  async (mode) => {
    configure();
    const b = await begin();
    if (mode === "deployment") env.CONTRACT_ADDRESS = "0x" + "cd".repeat(20);
    if (mode === "expired")
      await env.DB.prepare(
        "UPDATE connector_oauth_states SET expires_at=1",
      ).run();
    if (mode === "logout")
      await env.DB.prepare("DELETE FROM account_sessions").run();
    expect(
      (await callback(b.state, b.cookie, mode === "account" ? "2" : "1"))
        .status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("requires session CSRF and applies the common account mutation quota", async () => {
  configure();
  const bad = await worker.fetch(
    new Request("https://vault.example/api/account/connectors/notion/connect", {
      method: "POST",
      headers: {
        Origin: "https://vault.example",
        Cookie: "dv_session=" + "1".repeat(64),
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    env,
  );
  expect(bad.status).toBe(403);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO rate_limits(key,window_start,count) VALUES(?,?,20)",
  )
    .bind("account:local", Math.floor(Date.now() / 1000))
    .run();
  expect((await request("", "DELETE", {})).status).toBe(429);
});
it("rotates the encrypted pair under an exclusive lease without inventing expiry", async () => {
  await connected();
  let during = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/token")) {
      const row = store.sqlite
        .prepare("SELECT * FROM account_connectors WHERE provider='notion'")
        .all()[0];
      expect(row.refresh_lease).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toEqual({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      });
      during = (await request("/refresh", "POST", {})).status;
      return new Response(
        JSON.stringify({
          ...token,
          access_token: "ntn_rotated",
          refresh_token: "ntn_rotated_refresh",
        }),
      );
    }
    return provider(url, init);
  });
  expect((await request("/refresh", "POST", {})).status).toBe(200);
  expect(during).toBe(409);
  const row = store.sqlite
    .prepare("SELECT * FROM account_connectors WHERE provider='notion'")
    .all()[0];
  expect(row.credential_version).toBe(2);
  expect(row.refresh_lease).toBeNull();
  expect(
    await openConnector(env, "a1", "notion", row.credential),
  ).toMatchObject({
    access: "ntn_rotated",
    refresh: "ntn_rotated_refresh",
    expires: null,
    refreshExpires: null,
  });
});
it("revokes locally first and retains remote cleanup uncertainty", async () => {
  await connected();
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/revoke")) {
      expect(JSON.parse(String(init?.body))).toEqual({
        token: token.access_token,
      });
      expect(
        store.sqlite
          .prepare(
            "SELECT credential FROM account_connectors WHERE provider='notion'",
          )
          .all()[0].credential,
      ).toBeNull();
      return new Response("{}", { status: 503 });
    }
    return provider(url, init);
  });
  const r = await request("", "DELETE", {});
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    status: "disconnected",
    revocationPending: true,
  });
  expect(
    store.sqlite
      .prepare(
        "SELECT * FROM connector_cleanup_obligations WHERE provider='notion'",
      )
      .all(),
  ).toHaveLength(1);
});
it("records and revokes an issued token when its response metadata is invalid", async () => {
  configure();
  const b = await begin();
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    String(url).endsWith("/token")
      ? new Response(JSON.stringify({ ...token, refresh_token: 7 }))
      : provider(url, init),
  );
  expect((await callback(b.state, b.cookie)).status).toBe(400);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([url]) => String(url).endsWith("/revoke")),
  ).toBe(true);
});
it("retains expired pending cleanup uncertainty through replacement", async () => {
  configure();
  vi.mocked(fetch).mockImplementation(provider);
  const b = await begin();
  await callback(b.state, b.cookie);
  await env.DB.prepare(
    "UPDATE account_connectors SET pending_expires_at=1",
  ).run();
  await request();
  const next = await begin();
  await callback(next.state, next.cookie);
  expect(await (await request()).json()).toMatchObject({
    status: "pending",
    revocationPending: true,
  });
});
it.each(["denied", "duplicate", "callback"])(
  "rejects %s consent response before exchange",
  async (mode) => {
    configure();
    const b = await begin();
    const url =
      mode === "denied"
        ? "https://vault.example/api/connectors/notion/callback?state=" +
          b.state +
          "&error=access_denied"
        : mode === "duplicate"
          ? "https://vault.example/api/connectors/notion/callback?state=" +
            b.state +
            "&state=" +
            b.state +
            "&code=x"
          : "https://other.example/api/connectors/notion/callback?state=" +
            b.state +
            "&code=x";
    const r = await worker.fetch(
      new Request(url, {
        headers: { Cookie: "dv_session=" + "1".repeat(64) + "; " + b.cookie },
      }),
      env,
    );
    expect(r.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("cannot restore Notion capability when disconnect wins a rotation race", async () => {
  await connected();
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/token")) {
      expect((await request("", "DELETE", {})).status).toBe(200);
      return new Response(
        JSON.stringify({
          ...token,
          access_token: "ntn_late",
          refresh_token: "ntn_late_refresh",
        }),
      );
    }
    if (String(url).endsWith("/revoke"))
      return new Response("{}", { status: 503 });
    return provider(url, init);
  });
  expect((await request("/refresh", "POST", {})).status).toBe(409);
  const row = store.sqlite.prepare("SELECT * FROM account_connectors").all()[0];
  expect(row.status).toBe("disconnected");
  expect(row.credential).toBeNull();
  expect(
    store.sqlite.prepare("SELECT * FROM connector_cleanup_obligations").all(),
  ).toHaveLength(2);
  expect(await (await request()).json()).toMatchObject({
    revocationPending: true,
  });
});
it("requires reconnect when the documented nullable refresh token is absent", async () => {
  configure();
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    String(url).endsWith("/token")
      ? new Response(JSON.stringify({ ...token, refresh_token: null }))
      : provider(url, init),
  );
  const b = await begin();
  expect((await callback(b.state, b.cookie)).status).toBe(303);
  await env.DB.prepare(
    "UPDATE account_connectors SET status='connected'",
  ).run();
  expect((await request("/refresh", "POST", {})).status).toBe(409);
  expect(await (await request()).json()).toMatchObject({
    status: "needs_reconnect",
  });
});
