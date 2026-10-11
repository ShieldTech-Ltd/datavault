import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "./account";
import type { WebsiteImportJob } from "./account-client";
export default function WebsiteImport({
  onReviewed,
  onInvalidated,
}: {
  onReviewed: (name: string, text: string) => void;
  onInvalidated: () => void;
}) {
  const { client, state } = useAccount();
  const address = state.session?.account.address;
  const [urls, setUrls] = useState(""),
    [permission, setPermission] = useState(false),
    [available, setAvailable] = useState(false),
    [hosts, setHosts] = useState<string[]>([]);
  const [jobs, setJobs] = useState<WebsiteImportJob[]>([]),
    [job, setJob] = useState<WebsiteImportJob | null>(null),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [name, setName] = useState("Website knowledge"),
    [notice, setNotice] = useState("");
  const previewEpoch = useRef(0);
  function invalidatePreview() {
    previewEpoch.current++;
    setText("");
  }
  const identity = useRef(address),
    epoch = useRef(0);
  if (identity.current !== address) {
    identity.current = address;
    epoch.current++;
  }
  const generation = epoch.current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () => mounted.current && epoch.current === generation;
  useEffect(() => {
    setJob(null);
    invalidatePreview();
    setJobs([]);
    setBusy(false);
    setNotice("");
    setPermission(false);
    setAvailable(false);
    setHosts([]);
    onInvalidated();
    if (!address) return;
    let alive = true;
    void client.websiteImport().then((result) => {
      if (alive && result?.jobs) {
        setAvailable(result.available === true);
        setHosts(result.approvedHosts ?? []);
        setJobs(result.jobs);
        setJob(
          (previous) =>
            previous ??
            result.jobs!.find((j) =>
              ["queued", "running"].includes(j.status),
            ) ??
            null,
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [address, client]);
  useEffect(() => {
    if (
      !address ||
      (!busy && !["queued", "running"].includes(job?.status ?? ""))
    )
      return;
    let alive = true;
    const timer = setInterval(() => {
      void client.websiteImport().then((result) => {
        if (alive && result?.jobs) {
          setAvailable(result.available === true);
          setHosts(result.approvedHosts ?? []);
          setJobs(result.jobs);
          setJob((previous) =>
            previous
              ? (result.jobs!.find((j) => j.id === previous.id) ?? previous)
              : (result.jobs!.find((j) =>
                  ["queued", "running"].includes(j.status),
                ) ?? null),
          );
        }
      });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [address, client, busy, job?.status]);
  async function start() {
    if (busy || !available || !permission) return;
    setBusy(true);
    invalidatePreview();
    setNotice("Fetching only your selected pages.");
    const result = await client.websiteImport("", "POST", {
      urls: urls
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
      permissionAccepted: permission,
    });
    if (!current()) return;
    setBusy(false);
    if (result) {
      invalidatePreview();
      setJob(result);
      setJobs((previous) =>
        [result, ...previous.filter((j) => j.id !== result.id)].slice(0, 100),
      );
      setNotice(
        result.status === "review_ready"
          ? "Private draft ready. Preview and review before registration."
          : "Check job status below.",
      );
    } else
      setNotice(
        client.state.error ||
          "Import unavailable. Check approved HTTPS pages without queries and confirm your permission.",
      );
  }
  async function command(action: "run" | "cancel") {
    if (!job) return;
    if (action === "cancel") invalidatePreview();
    setBusy(true);
    const result = await client.websiteImport(
      job.id + "/" + action,
      "POST",
      {},
    );
    if (!current()) return;
    setBusy(false);
    if (result) {
      invalidatePreview();
      setJob(result);
      setJobs((previous) =>
        [result, ...previous.filter((j) => j.id !== result.id)].slice(0, 100),
      );
      if (action === "cancel") {
        setText("");
        onInvalidated();
      }
    } else setNotice(client.state.error);
  }
  async function preview() {
    if (!job) return;
    const previewGeneration = ++previewEpoch.current;
    const result = await client.websiteDraft(job.id);
    if (
      current() &&
      previewEpoch.current === previewGeneration &&
      result !== null
    ) {
      setText(result);
      setName("Website knowledge");
    } else if (
      current() &&
      previewEpoch.current === previewGeneration &&
      result === null
    )
      setNotice(client.state.error);
  }
  async function download() {
    if (!job) return;
    const previewGeneration = previewEpoch.current;
    const result = await client.websiteDraft(job.id, true);
    if (!current() || previewEpoch.current !== previewGeneration) return;
    if (result === null) {
      setNotice(client.state.error);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([result], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "website-import.md";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!address)
    return (
      <div className="dv-source-text">
        <p>
          Sign in with the publishing owner wallet to import selected approved
          website pages.
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
    <div className="dv-source-text dv-website-import" style={{ minWidth: 0, maxWidth: "100%" }}>
      <p>
        Import up to five selected pages from approved public hosts. Imports
        stay private for 24 hours until you review and confirm registration.
        Pages are fetched once per attempt, without crawling or executing
        scripts.
      </p>
      {!available ? (
        <p role="status">
          Website imports are unavailable. Ask the operator to approve the
          public domains you need.
        </p>
      ) : (
        <p style={{ overflowWrap: "anywhere" }}>
          Approved hosts: {hosts.join(", ")}
        </p>
      )}
      <label>
        Selected HTTPS page URLs, one per line
        <textarea
          value={urls}
          maxLength={10250}
          rows={3}
          disabled={!available}
          onChange={(e) => {
            setUrls(e.target.value);
            setPermission(false);
          }}
        />
      </label>
      <p>
        Use final page URLs without query strings. Redirects, authenticated
        pages and unapproved domains are unavailable.
      </p>
      <label>
        <input
          type="checkbox"
          checked={permission}
          disabled={!available}
          onChange={(e) => setPermission(e.target.checked)}
        />{" "}
        I own these pages or have permission to import their content and make it
        available through this collection.
      </label>
      <button
        type="button"
        className="dv-button secondary"
        disabled={busy || !available || !permission || !urls.trim()}
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
              invalidatePreview();
              setJob(jobs.find((j) => j.id === e.target.value) ?? null);
              onInvalidated();
            }}
          >
            <option value="">Choose a private import</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.urls[0]} ({j.status})
              </option>
            ))}
          </select>
        </label>
      )}
      {job && (
        <section aria-label="Website import status">
          <p>Status: {job.status}</p>
          <p style={{ overflowWrap: "anywhere" }}>
            Selected pages: {job.urls.join(", ")}
            <br />
            Fetched: {job.provenance.map((p) => p.fetchedAt).join(", ")}
            <br />
            Draft expires: {new Date(job.expiresAt).toLocaleString()}
          </p>
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
                disclosure in the registration form. Wallet signing and on-chain
                confirmation publish a new immutable collection. Failed
                registration leaves this draft recoverable.
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
