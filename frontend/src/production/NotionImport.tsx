import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "./account";
import type { NotionImportJob } from "./account-client";

export default function NotionImport({
  onReviewed,
  onInvalidated,
}: {
  onReviewed: (name: string, text: string) => void;
  onInvalidated: () => void;
}) {
  const { client, state } = useAccount(),
    address = state.session?.account.address;
  const [pages, setPages] = useState(""),
    [permission, setPermission] = useState(false),
    [available, setAvailable] = useState(false);
  const [jobs, setJobs] = useState<NotionImportJob[]>([]),
    [job, setJob] = useState<NotionImportJob | null>(null),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [name, setName] = useState("Notion knowledge"),
    [notice, setNotice] = useState("");
  const identity = useRef(address),
    epoch = useRef(0),
    previewEpoch = useRef(0),
    mounted = useRef(true);
  if (identity.current !== address) {
    identity.current = address;
    epoch.current++;
  }
  const generation = epoch.current;
  const current = () => mounted.current && generation === epoch.current;
  const invalidate = () => {
    previewEpoch.current++;
    setText("");
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setJob(null);
    setJobs([]);
    invalidate();
    setBusy(false);
    setPermission(false);
    setAvailable(false);
    setNotice("");
    setPages("");
    onInvalidated();
    if (!address) return;
    let alive = true;
    void client.notionImport().then((result) => {
      if (alive && result?.jobs) {
        setAvailable(result.available === true);
        setJobs(result.jobs);
        setJob(
          result.jobs.find((j) => ["queued", "running"].includes(j.status)) ??
            null,
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [client, address]);
  useEffect(() => {
    if (
      !address ||
      (!busy && !["queued", "running"].includes(job?.status ?? ""))
    )
      return;
    let alive = true;
    const timer = setInterval(() => {
      void client.notionImport().then((result) => {
        if (alive && result?.jobs) {
          setAvailable(result.available === true);
          setJobs(result.jobs);
          setJob((previous) =>
            previous
              ? (result.jobs!.find((j) => j.id === previous.id) ?? previous)
              : null,
          );
        }
      });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client, address, busy, job?.status]);
  function accept(result: NotionImportJob | null) {
    setBusy(false);
    if (!result) {
      setNotice(client.state.error);
      return;
    }
    invalidate();
    setJob(result);
    setJobs((previous) =>
      [result, ...previous.filter((j) => j.id !== result.id)].slice(0, 100),
    );
    setNotice(
      result.status === "review_ready"
        ? "Private draft ready. Preview and review before registration."
        : "Check job status below.",
    );
  }
  async function start() {
    if (busy || !available || !permission) return;
    setBusy(true);
    invalidate();
    const result = await client.notionImport("", "POST", {
      pageIds: pages
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
    });
    if (current()) accept(result);
  }
  async function command(action: "cancel" | "run") {
    if (!job || busy) return;
    setBusy(true);
    invalidate();
    const result = await client.notionImport(job.id + "/" + action, "POST", {});
    if (current()) {
      accept(result);
      if (action === "cancel") onInvalidated();
    }
  }
  async function preview() {
    if (!job) return;
    const version = ++previewEpoch.current;
    const value = await client.notionDraft(job.id);
    if (current() && version === previewEpoch.current) {
      if (value !== null) {
        setText(value);
        setName(job.provenance[0]?.title || "Notion knowledge");
      } else setNotice(client.state.error);
    }
  }
  async function download() {
    if (!job) return;
    const version = previewEpoch.current;
    const value = await client.notionDraft(job.id, true);
    if (!current() || version !== previewEpoch.current) return;
    if (value === null) {
      setNotice(client.state.error);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([value], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "notion-import.md";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!address)
    return (
      <div className="dv-source-text">
        <p>
          Sign in with the publishing owner wallet to import selected Notion
          pages.
        </p>
        <button
          type="button"
          className="dv-button secondary"
          disabled={state.loading}
          onClick={() => void client.signIn()}
        >
          Sign in to import
        </button>
        <Link to="/settings">Account settings</Link>
        {state.error && <p role="alert">{state.error}</p>}
      </div>
    );
  return (
    <div
      className="dv-source-text dv-website-import"
      style={{ minWidth: 0, maxWidth: "100%" }}
    >
      <p>
        Import up to five selected Notion pages shared with your connection.
        Drafts stay private for 24 hours. Supported text is copied. Files,
        embeds, linked pages and some formatting are omitted.
      </p>
      {!available && (
        <p role="status">
          Notion imports are unavailable. Configure and confirm a connection in
          account settings.
        </p>
      )}
      <Link to="/settings">Manage Notion connection</Link>
      <label>
        Selected Notion page UUIDs, one per line
        <textarea
          rows={4}
          value={pages}
          maxLength={200}
          onChange={(e) => setPages(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={permission}
          onChange={(e) => setPermission(e.target.checked)}
        />{" "}
        I have permission to import these pages and make the reviewed content
        available through this collection.
      </label>
      <button
        type="button"
        className="dv-button secondary"
        disabled={busy || !available || !permission || !pages.trim()}
        onClick={() => void start()}
      >
        {busy ? "Import in progress" : "Import selected pages"}
      </button>
      <p role="status">{notice}</p>
      {jobs.length > 0 && (
        <label>
          Recover an import
          <select
            value={job?.id ?? ""}
            onChange={(e) => {
              invalidate();
              setJob(jobs.find((j) => j.id === e.target.value) ?? null);
              onInvalidated();
            }}
          >
            <option value="">Choose a private import</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.pageIds[0]} ({j.status})
              </option>
            ))}
          </select>
        </label>
      )}
      {job && (
        <section aria-label="Notion import status">
          <p>Status: {job.status}</p>
          <p style={{ overflowWrap: "anywhere" }}>
            Selected pages: {job.pageIds.join(", ")}
            <br />
            Draft expires: {new Date(job.expiresAt).toLocaleString()}
          </p>
          {job.provenance.map((p) => (
            <p key={p.pageId} style={{ overflowWrap: "anywhere" }}>
              {p.title}, extracted {p.extractedAt}, API {p.apiVersion}.
              Coverage: selected text only ({p.blocks} blocks). Omitted block
              types:{" "}
              {Object.entries(p.unsupported)
                .map(([type, count]) => `${type}: ${count}`)
                .join(", ") || "none reported"}
              .
            </p>
          ))}
          {job.error && <p role="alert">{job.error}</p>}
          {["queued", "running", "failed"].includes(job.status) && (
            <button
              type="button"
              className="dv-button secondary"
              disabled={busy || job.attempts >= 3}
              onClick={() => void command("run")}
            >
              Retry or resume import
            </button>
          )}
          {!["cancelled", "expired"].includes(job.status) && (
            <button
              type="button"
              className="dv-button secondary"
              disabled={busy}
              onClick={() => void command("cancel")}
            >
              Cancel import
            </button>
          )}
          {job.status === "review_ready" && (
            <>
              <button
                type="button"
                className="dv-button secondary"
                onClick={() => void preview()}
              >
                Preview private draft
              </button>
              <button
                type="button"
                className="dv-button secondary"
                onClick={() => void download()}
              >
                Download private draft
              </button>
            </>
          )}
          {text && job.status === "review_ready" && (
            <>
              <label>
                Collection name
                <input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Review and edit imported text
                <textarea
                  value={text}
                  rows={8}
                  maxLength={500000}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <p>
                Review the source and name, then set your price and accept the
                disclosure in registration. The current owner wallet must sign
                and confirm publication.
              </p>
              <button
                type="button"
                className="dv-button"
                disabled={
                  !name.trim() ||
                  !text.trim() ||
                  new TextEncoder().encode(text).byteLength > 500000
                }
                onClick={() => onReviewed(name, text)}
              >
                Use reviewed draft in registration
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
