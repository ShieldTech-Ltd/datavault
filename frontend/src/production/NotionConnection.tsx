import { useEffect, useRef, useState } from "react";
import { useAccount } from "./account";
import type { NotionConnectionStatus } from "./account-client";

export default function NotionConnection() {
  const { client, state } = useAccount(),
    address = state.session?.account.address;
  const [connection, setConnection] = useState<NotionConnectionStatus | null>(
      null,
    ),
    [busy, setBusy] = useState(false);
  const identity = useRef(address),
    generation = useRef(0),
    mounted = useRef(true);
  if (identity.current !== address) {
    identity.current = address;
    generation.current++;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setConnection(null);
    setBusy(false);
    if (!address) return;
    let alive = true;
    void client.notionConnector().then((v) => {
      if (alive) setConnection(v);
    });
    return () => {
      alive = false;
    };
  }, [client, address]);
  async function action(
    kind: "connect" | "confirm" | "disconnect" | "status" | "rotate",
  ) {
    if (busy) return;
    const epoch = generation.current;
    setBusy(true);
    const result = await client.notionConnector(
      kind === "connect"
        ? "/connect"
        : kind === "confirm"
          ? "/confirm"
          : kind === "rotate"
            ? "/refresh"
            : "",
      kind === "disconnect" ? "DELETE" : kind === "status" ? "GET" : "POST",
    );
    if (!mounted.current || generation.current !== epoch) return;
    setBusy(false);
    if (!result) return;
    if (kind === "connect" && result.authorizeUrl) {
      window.location.assign(result.authorizeUrl);
      return;
    }
    setConnection(result);
  }
  return (
    <section
      aria-label="Notion connection"
      style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}
    >
      <h3>Notion connection</h3>
      <p>
        Select only the pages you permit DataVault to read in Notion consent.
        Confirm the connection for your current wallet, then choose up to five
        pages for each import.
      </p>
      {!address ? (
        <p>Sign in to manage your Notion connection.</p>
      ) : (
        <>
          {!connection ? (
            <button
              type="button"
              className="dv-button secondary"
              disabled={busy}
              onClick={() => void action("status")}
            >
              Refresh Notion status
            </button>
          ) : (
            <>
              <p>
                Status: {connection.status.replace("_", " ")}
                {connection.login ? ` (${connection.login})` : ""}
              </p>
              {!connection.providerConfigured && (
                <p>Notion is unavailable until the provider is configured.</p>
              )}
              {connection.status === "pending" && (
                <>
                  <p>
                    Confirm this connection for wallet{" "}
                    <span className="dv-account-address">{address}</span>.
                    Pending permission expires in five minutes and cannot import
                    pages.
                  </p>
                  <button
                    type="button"
                    className="dv-button"
                    disabled={busy || state.loading}
                    onClick={() => void action("confirm")}
                  >
                    Confirm Notion connection
                  </button>
                </>
              )}
              {["disconnected", "needs_reconnect"].includes(
                connection.status,
              ) && (
                <button
                  type="button"
                  className="dv-button secondary"
                  disabled={
                    busy || state.loading || !connection.providerConfigured
                  }
                  onClick={() => void action("connect")}
                >
                  Connect Notion
                </button>
              )}
              {connection.status !== "disconnected" && (
                <button
                  type="button"
                  className="dv-button secondary"
                  disabled={busy || state.loading}
                  onClick={() => void action("disconnect")}
                >
                  Disconnect Notion
                </button>
              )}
              {connection.status === "connected" && (
                <button
                  type="button"
                  className="dv-button secondary"
                  disabled={busy || state.loading}
                  onClick={() => void action("rotate")}
                >
                  Rotate Notion authorization
                </button>
              )}
              {connection.revocationPending && (
                <p>
                  Notion revocation could not be confirmed for an earlier
                  authorization. Remove that connection in your Notion workspace
                  connection settings.
                </p>
              )}
              <p>
                Disconnect cancels private import drafts. Published collections
                remain available. Rotating authorization invalidates drafts made
                with the previous credential.
              </p>
            </>
          )}
          {state.error && <p role="alert">{state.error}</p>}
        </>
      )}
    </section>
  );
}
