import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ApiKey } from "@/lib/mockData";

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  padding: "1.25rem",
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  color: "var(--text)",
  outline: "none",
  fontSize: "0.82rem",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--text-2)",
  display: "block",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg,#7c3aed,#6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.85rem",
};

const codeBlockStyle: React.CSSProperties = {
  background: "#0d1117",
  color: "#e2e8f0",
  borderRadius: 10,
  padding: "1rem",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  overflowX: "auto",
  whiteSpace: "pre",
};

const CURL_EXAMPLE = `curl -X POST "https://YOUR_WORKER_ORIGIN/api/queries/execute" \\
  -H "x-signature: SIGNED_EXECUTION_MESSAGE" \\
  -H "x-timestamp: UNIX_MILLISECONDS" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requestId": "0x...",
    "collectionId": "0x...",
    "question": "What is parallel execution?",
    "openTxHash": "0x..."
  }'`;

const RESPONSE_EXAMPLE = `{
  "answer": "Monad achieves throughput via...",
  "citedPassageIds": ["passage-001", "passage-002"],
  "requestId": "0xabcd...",
  "outcome": "settled"
}`;

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  setTimeout(onDone, 2500);
  return (
    <div style={{
      position: "fixed", top: 20, right: 20,
      background: "#059669", color: "white", borderRadius: 10,
      padding: "0.65rem 1.1rem", zIndex: 1000, fontWeight: 600, fontSize: "0.85rem",
      boxShadow: "0 4px 16px rgba(5,150,105,0.4)",
      display: "flex", alignItems: "center", gap: "0.5rem",
      animation: "fadeIn 0.2s ease",
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      {message}
    </div>
  );
}

function KeyCard({ apiKey, onRevoke, onEnable }: { apiKey: ApiKey; onRevoke: () => void; onEnable: () => void }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const maskedKey = `${apiKey.key.slice(0, 8)}••••••••••••••••${apiKey.key.slice(-4)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey.key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isActive = apiKey.status === "Active";

  return (
    <div style={cardStyle}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{apiKey.name}</span>
        <span style={{
          fontSize: "0.7rem", fontWeight: 600, padding: "2px 10px", borderRadius: 20,
          background: isActive ? "var(--green-bg)" : "var(--red-bg)",
          color: isActive ? "var(--green)" : "var(--red)",
        }}>
          {apiKey.status}
        </span>
      </div>

      {/* Key value row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-2)" }}>Key</span>
        <code style={{ background: "var(--surface-2)", padding: "0.3rem 0.6rem", borderRadius: 6, fontSize: "0.75rem", color: "var(--text)", flex: 1, fontFamily: "monospace", minWidth: 0, overflowX: "auto" }}>
          {visible ? apiKey.key : maskedKey}
        </code>
        <button
          onClick={() => setVisible((v) => !v)}
          title={visible ? "Hide" : "Show"}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.3rem 0.5rem", cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          {visible ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
        </button>
        <button
          onClick={handleCopy}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.72rem", color: copied ? "var(--green)" : "var(--text-2)", fontWeight: 600 }}
        >
          {copied ? "Copied!" : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          )}
        </button>
        {isActive ? (
          <button
            onClick={onRevoke}
            style={{ background: "none", border: "1px solid var(--red)", borderRadius: 6, padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "0.72rem", color: "var(--red)", fontWeight: 600 }}
          >
            Revoke
          </button>
        ) : (
          <button
            onClick={onEnable}
            style={{ background: "none", border: "1px solid var(--green)", borderRadius: 6, padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "0.72rem", color: "var(--green)", fontWeight: 600 }}
          >
            Enable
          </button>
        )}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.72rem", color: "var(--text-3)" }}>
        <span>Created: {apiKey.created}</span>
        <span>Last Used: {apiKey.lastUsed}</span>
        <span>Requests: {apiKey.requests.toLocaleString()}</span>
      </div>
    </div>
  );
}

interface ModalProps {
  onClose: () => void;
  onSubmit: (name: string) => void;
}

function CreateKeyModal({ onClose, onSubmit }: ModalProps) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState({ read: true, execute: false, manage: false });
  const [expiry, setExpiry] = useState("Never");

  const togglePerm = (k: keyof typeof perms) => setPerms((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius)", padding: "1.5rem", width: 480, maxWidth: "90vw" }}>
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 700 }}>Create New API Key</h3>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Key Name</label>
          <input
            style={inputStyle}
            placeholder="Production Key"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Permissions</label>
          {[
            { key: "read" as const, label: "Read collections" },
            { key: "execute" as const, label: "Execute queries" },
            { key: "manage" as const, label: "Manage collections" },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer", fontSize: "0.82rem", color: "var(--text)" }}>
              <input type="checkbox" checked={perms[key]} onChange={() => togglePerm(key)} style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Expiry</label>
          <select
            style={{ ...inputStyle }}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          >
            <option>Never</option>
            <option>30 days</option>
            <option>90 days</option>
            <option>1 year</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "0.55rem 1.1rem", cursor: "pointer", color: "var(--text-2)", fontWeight: 600, fontSize: "0.85rem" }}>
            Cancel
          </button>
          <button onClick={() => onSubmit(name || "New Key")} style={primaryBtn}>
            Create Key
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApiAccess() {
  const { apiKeys, revokeApiKey, enableApiKey, addApiKey } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [respCopied, setRespCopied] = useState(false);

  const handleCreateKey = (name: string) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const newKey: ApiKey = {
      id: `k${Date.now()}`,
      name,
      key: `dv_new_sk_${Math.random().toString(36).slice(2, 18)}_${Math.random().toString(36).slice(2, 18)}`,
      status: "Active",
      created: dateStr,
      lastUsed: "Never",
      requests: 0,
    };
    addApiKey(newKey);
    setShowModal(false);
    setToast("API key created successfully");
  };

  const copyCode = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ color: "var(--text)", maxWidth: 900 }}>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {showModal && <CreateKeyModal onClose={() => setShowModal(false)} onSubmit={handleCreateKey} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>API Access</h1>
          <p style={{ color: "var(--text-2)", marginTop: 6, fontSize: "0.9rem" }}>
            Manage your API keys and access the DataVault API programmatically.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create New API Key
        </button>
      </div>

      {/* API Documentation */}
      <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>API Documentation</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[
            { label: "DataVault API Reference", desc: "Full REST API reference with endpoints and parameters" },
            { label: "Authentication Guide", desc: "Sign the execution message with the escrow buyer wallet after payment confirms" },
            { label: "Rate Limits & Quotas", desc: "Request limits, quotas and best practices" },
          ].map(({ label, desc }) => (
            <a key={label} href="https://github.com/ShieldTech-Ltd/datavault/blob/master/docs/api-contract.md" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0.6rem 0.75rem", borderRadius: 8, background: "var(--surface-2)", textDecoration: "none", transition: "opacity 0.15s" }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--accent)" }}>{label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 1 }}>{desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* API Keys section */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.85rem" }}>
          API Keys
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 8 }}>({apiKeys.length} keys)</span>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {apiKeys.map((k) => (
            <KeyCard
              key={k.id}
              apiKey={k}
              onRevoke={() => { revokeApiKey(k.id); setToast("API key revoked"); }}
              onEnable={() => { enableApiKey(k.id); setToast("API key enabled"); }}
            />
          ))}
        </div>
      </div>

      {/* Example Request */}
      <div style={{ ...cardStyle, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Example Request</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, background: "var(--surface-3)", padding: "2px 8px", borderRadius: 6, color: "var(--text-2)" }}>cURL</span>
          </div>
          <button
            onClick={() => copyCode(CURL_EXAMPLE, setCodeCopied)}
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "0.72rem", color: codeCopied ? "var(--green)" : "var(--text-2)", fontWeight: 600 }}
          >
            {codeCopied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div style={codeBlockStyle}>{CURL_EXAMPLE}</div>
      </div>

      {/* Response example */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Response Example</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, background: "var(--surface-3)", padding: "2px 8px", borderRadius: 6, color: "var(--text-2)" }}>JSON</span>
          </div>
          <button
            onClick={() => copyCode(RESPONSE_EXAMPLE, setRespCopied)}
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.3rem 0.7rem", cursor: "pointer", fontSize: "0.72rem", color: respCopied ? "var(--green)" : "var(--text-2)", fontWeight: 600 }}
          >
            {respCopied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div style={codeBlockStyle}>{RESPONSE_EXAMPLE}</div>
      </div>
    </div>
  );
}
