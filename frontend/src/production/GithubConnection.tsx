import { useEffect, useRef, useState } from 'react';
import { useAccount } from './account';
import type { GithubConnectionStatus } from './account-client';
export default function GithubConnection() {
  const { client, state } = useAccount(),
    address = state.session?.account.address;
  const [connection, setConnection] = useState<GithubConnectionStatus | null>(
      null
    ),
    [busy, setBusy] = useState(false);
  const owner = useRef(address);
  owner.current = address;
  useEffect(() => {
    setConnection(null);
    setBusy(false);
    if (!address) return;
    let alive = true;
    void client.githubConnector().then((value) => {
      if (alive) setConnection(value);
    });
    return () => {
      alive = false;
    };
  }, [client, address]);
  async function action(
    kind: 'connect' | 'confirm' | 'disconnect' | 'refresh'
  ) {
    if (busy) return;
    const account = address;
    setBusy(true);
    const result = await client.githubConnector(
      kind === 'connect' ? '/connect' : kind === 'confirm' ? '/confirm' : '',
      kind === 'disconnect' ? 'DELETE' : kind === 'refresh' ? 'GET' : 'POST'
    );
    if (owner.current !== account) return;
    setBusy(false);
    if (!result) return;
    if (kind === 'connect' && result.authorizeUrl) {
      window.location.assign(result.authorizeUrl);
      return;
    }
    setConnection(result);
  }
  return (
    <section
      aria-label="GitHub connection"
      style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}
    >
      <h3>Private GitHub connection</h3>
      <p>
        Authorize a read-only GitHub App for selected repositories. Only
        contents and repository metadata can be read. You choose the files for
        each import.
      </p>
      {!address ? (
        <p>Sign in to your account to manage GitHub.</p>
      ) : (
        <>
          {!connection ? (
            <p>
              Connection status unavailable.{' '}
              <button
                className="dv-button secondary"
                disabled={busy}
                onClick={() => void action('refresh')}
              >
                Refresh GitHub status
              </button>
            </p>
          ) : (
            <>
              <p>
                Status: {connection.status.replace('_', ' ')}
                {connection.login ? ` (${connection.login})` : ''}
              </p>
              {!connection.providerConfigured && (
                <p>
                  Private GitHub is unavailable until the provider is
                  configured.
                </p>
              )}
              {connection.status === 'pending' && (
                <>
                  <p>
                    Confirm this connection for wallet{' '}
                    <span className="dv-account-address">{address}</span>.
                    Pending permission expires in five minutes and cannot import
                    files.
                  </p>
                  <button
                    className="dv-button"
                    disabled={busy || state.loading}
                    onClick={() => void action('confirm')}
                  >
                    Confirm GitHub connection
                  </button>
                </>
              )}
              {['disconnected', 'needs_reconnect'].includes(
                connection.status
              ) && (
                <button
                  className="dv-button secondary"
                  disabled={
                    busy || state.loading || !connection.providerConfigured
                  }
                  onClick={() => void action('connect')}
                >
                  Connect GitHub
                </button>
              )}
              {connection.status !== 'disconnected' && (
                <button
                  className="dv-button secondary"
                  disabled={busy || state.loading}
                  onClick={() => void action('disconnect')}
                >
                  Disconnect GitHub
                </button>
              )}
              {connection.revocationPending && (
                <p>
                  Local access is disabled or requires reconnecting. GitHub
                  revocation could not be confirmed. Review and revoke the app
                  in{' '}
                  <a
                    href="https://github.com/settings/apps/authorizations"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub authorized apps
                  </a>
                  .
                </p>
              )}
              <p>
                Disconnect cancels private import drafts. Already confirmed
                collections and paid answer recovery remain available.
              </p>
            </>
          )}
          {state.error && <p role="alert">{state.error}</p>}
        </>
      )}
    </section>
  );
}
