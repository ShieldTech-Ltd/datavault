import { transactionExplorerUrl } from "../lib/network";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useWallet } from "../lib/wallet";
import { useAccount } from "./account";
import { apiJson, type RevisionHistory } from "./api";
import { linkConfirmedRevision } from "./collection-revisions";
import OwnerDashboard from "../components/OwnerDashboard";
const chainId = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
export default function CollectionVersions({
  collectionId,
  ownerAddress,
  publish = false,
}: {
  collectionId: string;
  ownerAddress: string;
  publish?: boolean;
}) {
  const { primaryWallet, correctNetwork } = useWallet(),
    { state, client } = useAccount();
  const [storedHistory, setHistory] = useState<RevisionHistory | null>(null),
    [loadedFor, setLoadedFor] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState(false),
    [publishedId, setPublishedId] = useState(""),
    [retryId, setRetryId] = useState(""),
    [pending, setPending] = useState(false);
  const [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  const identity = `${primaryWallet?.address ?? ""}:${
    state.session?.account.address ?? ""
  }:${collectionId}:${correctNetwork}`;
  const history = loadedFor === identity ? storedHistory : null;
  const identityRef = useRef(identity);
  const epoch = useRef(0);
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    epoch.current++;
  }
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setHistory(null);
    setPage(0);
    setMessage("");
    setPublishedId("");
    setRetryId("");
    setEditing(false);
    setPending(false);
  }, [identity]);
  useEffect(() => {
    let current = true;
    const captured = identity;
    void apiJson<RevisionHistory>(
      `/api/collections/${collectionId}/revisions?limit=50&cursor=${page}`,
      { credentials: "same-origin" }
    )
      .then((value) => {
        if (current && identityRef.current === captured) {
          setHistory(value);
          setLoadedFor(captured);
        }
      })
      .catch(() => {
        if (current && identityRef.current === captured)
          setMessage("Collection history unavailable.");
      });
    return () => {
      current = false;
    };
  }, [identity, collectionId, page, refresh]);
  const owner = state.session?.account.address === ownerAddress.toLowerCase();
  async function link(newId: string) {
    const captured = identity,
      generation = epoch.current,
      session = state.session;
    if (!primaryWallet || !session || !owner) return;
    setPending(true);
    setMessage("Linking the confirmed collection...");
    setPublishedId(newId);
    try {
      const wallet = await primaryWallet.getWalletClient();
      await linkConfirmedRevision({
        wallet,
        chainId,
        owner: ownerAddress,
        parentId: collectionId,
        newId,
        csrfToken: session.csrfToken,
        isCurrent: () =>
          alive.current &&
          identityRef.current === captured &&
          epoch.current === generation,
      });
      if (
        alive.current &&
        identityRef.current === captured &&
        epoch.current === generation
      ) {
        setMessage(
          "New revision linked. The old collection policy remains unchanged."
        );
        setRefresh((v) => v + 1);
        setEditing(false);
        setPublishedId("");
        setRetryId("");
      }
    } catch (error) {
      if (
        alive.current &&
        identityRef.current === captured &&
        epoch.current === generation
      )
        setMessage(
          error instanceof Error
            ? error.message
            : "The new collection was published but not linked. Retry the link."
        );
    } finally {
      if (
        alive.current &&
        identityRef.current === captured &&
        epoch.current === generation
      )
        setPending(false);
    }
  }
  return (
    <section className="dv-panel dv-collection-settings">
      <h3>Collection versions</h3>
      {history?.newerUnlistedRevision && (
        <p>A newer unlisted revision exists.</p>
      )}
      {history?.currentCollectionId &&
        history.currentCollectionId !== collectionId && (
          <Link to={`/collections/${history.currentCollectionId}`}>
            View current revision
          </Link>
        )}
      {history && (
        <ol>
          {history.versions.map((v) => (
            <li key={v.collectionId}>
              <Link to={`/collections/${v.collectionId}`}>
                Version {v.ordinal}: {v.name}
              </Link>{" "}
              {history.currentCollectionId === v.collectionId && (
                <span>(Current)</span>
              )}{" "}
              <Link to={`/query?collection=${v.collectionId}`}>
                Query / recover paid request
              </Link>
              {transactionExplorerUrl(v.registrationTxHash) && (
                <a
                  href={transactionExplorerUrl(v.registrationTxHash)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  Registration receipt
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
      {history?.nextCursor !== null && history?.nextCursor !== undefined && (
        <button
          className="dv-button secondary"
          onClick={() => setPage(history.nextCursor!)}
        >
          Next versions
        </button>
      )}
      {page > 0 && (
        <button className="dv-button secondary" onClick={() => setPage(0)}>
          First versions
        </button>
      )}
      {publish && (
        <>
          <p>
            Changed content is a new paid contract registration with a new
            collection ID. It starts as a public publication, even if the old
            collection is unlisted. You can change its visibility after
            publication.
          </p>
          <p>
            Old content and paid answer recovery stay tied to the old ID.
            Publishing never automatically pauses old versions.
          </p>
          <Link to={`/manage?collection=${collectionId}`}>
            Old revision policy controls
          </Link>
          <p>
            If you choose to pause the old policy, outstanding quotes and
            requests may be affected.
          </p>
          {!state.session ? (
            <button
              className="dv-button secondary"
              onClick={() => void client.signIn()}
              disabled={state.loading}
            >
              Sign in to publish a revision
            </button>
          ) : !owner ? (
            <p>Sign in with the collection owner wallet.</p>
          ) : (
            <>
              {!editing &&
                !publishedId &&
                (!history?.currentCollectionId ||
                  history.currentCollectionId === collectionId) && (
                  <button
                    className="dv-button"
                    onClick={() => setEditing(true)}
                  >
                    Publish new revision
                  </button>
                )}
              {editing && !publishedId && (
                <>
                  <button
                    className="dv-button secondary"
                    onClick={() => setEditing(false)}
                  >
                    Cancel new revision
                  </button>
                  <OwnerDashboard
                    revisionParent={collectionId}
                    onConfirmed={(newId) => link(newId)}
                  />
                </>
              )}
              {publishedId && (
                <div role="status">
                  <p>Original collection: {collectionId}</p>
                  <p>
                    Published collection:{" "}
                    <Link to={`/collections/${publishedId}`}>
                      {publishedId}
                    </Link>
                  </p>
                  <button
                    className="dv-button"
                    disabled={pending}
                    onClick={() => void link(publishedId)}
                  >
                    Retry revision link
                  </button>
                </div>
              )}
              <details>
                <summary>
                  Already published a new collection? Retry its revision link
                </summary>
                <form
                  className="dv-collection-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void link(retryId);
                  }}
                >
                  <label>
                    Confirmed new collection ID
                    <input
                      aria-label="Confirmed new collection ID"
                      value={retryId}
                      onChange={(e) => setRetryId(e.target.value)}
                      pattern="0x[0-9a-fA-F]{64}"
                      required
                    />
                  </label>
                  <button className="dv-button secondary" disabled={pending}>
                    Link confirmed collection
                  </button>
                </form>
              </details>
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
