import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "./account";
import { apiJson, type Collection } from "./api";
const categories = [
  "General",
  "Technology",
  "Business",
  "Research",
  "Education",
  "Finance",
  "Legal",
  "Other",
];
export default function CollectionEditor({
  collectionId,
  onChanged,
}: {
  collectionId: string;
  onChanged?: () => void;
}) {
  const { client, state } = useAccount();
  const [item, setItem] = useState<Collection | null>(null),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState("General"),
    [visibility, setVisibility] = useState("public"),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    setItem(null);
    void apiJson<Collection>(`/api/collections/${collectionId}`)
      .then((value) => {
        if (alive) {
          setItem(value);
          setDescription(value.description ?? "");
          setCategory(value.category ?? "General");
          setVisibility(value.visibility ?? "public");
        }
      })
      .catch(() => {
        if (alive) setMessage("Collection settings unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [collectionId]);
  const session = state.session;
  const owner =
    session &&
    item &&
    session.account.address === item.ownerAddress.toLowerCase();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!owner || !session) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/collections/${collectionId}/metadata`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: JSON.stringify({ description, category, visibility }),
        }
      );
      if (!response.ok)
        throw Error(
          "Settings could not be saved. Check account authorization and retry."
        );
      setMessage("Collection settings saved.");
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Settings unavailable."
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="dv-panel dv-collection-settings">
      <h3>Collection settings</h3>
      <p>Metadata changes require account sign-in and no query payment.</p>
      {!session ? (
        <button
          type="button"
          className="dv-button secondary"
          onClick={() => void client.signIn()}
          disabled={state.loading}
        >
          Sign in to edit collection settings
        </button>
      ) : !owner ? (
        <p>Sign in with the collection owner wallet to edit these settings.</p>
      ) : (
        <form className="dv-collection-edit-form" onSubmit={(event) => void save(event)}>
          <label>
            Description
            <textarea
              aria-label="Description"
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Catalogue visibility
            <select
              aria-label="Catalogue visibility"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value)}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </label>
          <p>
            Unlisted collections remain accessible and queryable by ID. They are
            excluded from public catalogue search and public analytics.
          </p>
          <button className="dv-button" disabled={pending}>
            {pending ? "Saving..." : "Save collection settings"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <Link to={`/collections/${collectionId}`}>View collection</Link>
    </section>
  );
}
