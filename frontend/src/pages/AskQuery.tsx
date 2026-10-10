import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  SUGGESTED_QUESTIONS,
  getOwnedCollections,
  getMarketplaceCollections,
  Collection,
} from "@/lib/mockData";

// ─── Types ────────────────────────────────────────────────────
type QueryState = "idle" | "loading" | "answered" | "error";
type ActiveTab = "own" | "market";

interface MockAnswer {
  text: string;
  sources: string[];
  hash: string;
  amount: string;
}

interface HistoryItem {
  requestId: string;
  collectionId: string;
  question: string;
  openTxHash: string;
  buyerAddress: string;
  openedAt: number;
  outcome: string;
}

const STEPS = ["Initiate Payment", "Open Escrow", "Process Query", "Generate Answer"];

// ─── Helpers ──────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function getCollectionName(collectionId: string, all: Collection[]): string {
  return all.find((c) => c.id === collectionId)?.name ?? "Unknown Collection";
}

// ─── Inline style helpers ─────────────────────────────────────
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "1.25rem",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--text-2)",
  marginBottom: "0.5rem",
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
};

const pill = (bg: string, color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.2rem 0.6rem",
  borderRadius: "999px",
  fontSize: "0.75rem",
  fontWeight: 600,
  background: bg,
  color,
});

// ─── Component ────────────────────────────────────────────────
export default function AskQuery() {
  const navigate = useNavigate();
  const allCollections = [...getOwnedCollections(), ...getMarketplaceCollections()];

  const [activeTab, setActiveTab] = useState<ActiveTab>("own");
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [question, setQuestion] = useState("");
  const [queryState, setQueryState] = useState<QueryState>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [mockAnswer, setMockAnswer] = useState<MockAnswer | null>(null);
  const [queryHistory, setQueryHistory] = useState<HistoryItem[]>([]);

  const pickerRef = useRef<HTMLDivElement>(null);

  const visibleCollections = activeTab === "own" ? getOwnedCollections() : getMarketplaceCollections();

  // Close picker on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCollectionPicker(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleAsk() {
    if (!question.trim() || !selectedCollection) return;
    setQueryState("loading");
    setCurrentStep(0);
    setMockAnswer(null);

    for (let i = 0; i <= 3; i++) {
      await new Promise<void>((r) => setTimeout(r, 600));
      setCurrentStep(i);
    }

    const answer: MockAnswer = {
      text: "Monad achieves high throughput through parallel transaction execution, using optimistic concurrency control. Transactions are executed in parallel and any conflicting state writes are detected and resolved, similar to modern parallelized blockchains.\n\nKey points:\n1. Parallel Execution: Monad executes multiple transactions simultaneously across multiple cores, rather than sequentially [1].\n2. Optimistic Concurrency Control: Conflicts are detected after execution, and conflicting transactions are re-executed [2].\n3. High Throughput: This design achieves significantly higher throughput while maintaining EVM compatibility [3].",
      sources: [
        "Monad Whitepaper - Parallel Execution",
        "Monad Docs - Concurrency Model",
        "Monad Blog - High Throughput Architecture",
      ],
      hash: "0x9b2e4f8a7c1d3e5...f9a2c4d7b1e8f3a0",
      amount: selectedCollection.price,
    };

    setMockAnswer(answer);
    setQueryState("answered");

    const newItem: HistoryItem = {
      requestId: `mock-${Date.now()}`,
      collectionId: selectedCollection.id,
      question,
      openTxHash: "0x" + Math.random().toString(16).slice(2),
      buyerAddress: "0xMock",
      openedAt: Date.now(),
      outcome: "settled",
    };

    // Preview history is ephemeral and never touches real payment recovery records.
    setQueryHistory((items) => [newItem, ...items].slice(0, 5));
  }

  function clearHistory() {
    setQueryHistory([]);
  }

  // Parse answer text into intro + key-points
  function renderAnswerText(text: string) {
    const parts = text.split("\n\nKey points:\n");
    const intro = parts[0] ?? "";
    const keyLines = parts[1] ? parts[1].split("\n").filter(Boolean) : [];

    function inlineCitations(line: string) {
      const segments = line.split(/(\[\d+\])/g);
      return segments.map((seg, i) =>
        /^\[\d+\]$/.test(seg) ? (
          <span key={i} style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.8rem" }}>
            {seg}
          </span>
        ) : (
          <span key={i}>{seg}</span>
        )
      );
    }

    return (
      <>
        <p style={{ margin: "0 0 1rem", lineHeight: 1.7, color: "var(--text)" }}>
          {inlineCitations(intro)}
        </p>
        {keyLines.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {keyLines.map((line, i) => {
              const cleaned = line.replace(/^\d+\.\s*/, "");
              return (
                <li key={i} style={{ color: "var(--text)", lineHeight: 1.6 }}>
                  {inlineCitations(cleaned)}
                </li>
              );
            })}
          </ol>
        )}
      </>
    );
  }

  const outcomeColor = (outcome: string): [string, string] => {
    if (outcome === "settled") return ["var(--green-bg)", "var(--green)"];
    if (outcome === "refunded") return ["var(--yellow-bg)", "var(--yellow)"];
    return ["var(--red-bg)", "var(--red)"];
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Ask Your DataVault
        </h1>
        <p style={{ color: "var(--text-2)", marginTop: "0.375rem", fontSize: "0.9375rem" }}>
          Get AI-powered answers from your collections or the marketplace.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "1.5rem" }}>
        {(["own", "market"] as ActiveTab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setActiveTab(t);
              setSelectedCollection(null);
              setShowCollectionPicker(false);
            }}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "var(--radius-sm)",
              border: activeTab === t ? "1px solid var(--accent-bdr)" : "1px solid var(--border)",
              background: activeTab === t ? "var(--accent-bg)" : "var(--surface)",
              color: activeTab === t ? "var(--accent)" : "var(--text-2)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              transition: "all .15s",
            }}
          >
            {t === "own" ? "Your Collections" : "Marketplace"}
          </button>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.65fr", gap: "1.25rem", alignItems: "start" }}>
        {/* ══ LEFT COLUMN ══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Collection selector */}
          <div style={card}>
            <span style={label}>Select Collection</span>
            {selectedCollection ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--accent-bdr)",
                  background: "var(--accent-bg)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedCollection.name}
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedCollection.description}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <span style={pill("var(--accent-bg)", "var(--accent)")}>
                      {selectedCollection.price} per query
                    </span>
                    <span style={pill("var(--green-bg)", "var(--green)")}>
                      ● Available
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowCollectionPicker(true)}
                  style={{
                    flexShrink: 0,
                    padding: "0.4rem 0.8rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--accent-bdr)",
                    background: "var(--surface)",
                    color: "var(--accent)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCollectionPicker(true)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "2px dashed var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Click to choose a collection…
              </button>
            )}

            {/* Picker dropdown */}
            {showCollectionPicker && (
              <div
                ref={pickerRef}
                style={{
                  marginTop: "0.75rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                  boxShadow: "var(--shadow-md)",
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {visibleCollections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => {
                      setSelectedCollection(col);
                      setShowCollectionPicker(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: selectedCollection?.id === col.id ? "var(--accent-bg)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "var(--radius-sm)",
                        background: col.gradient,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {col.name}
                      </div>
                      <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
                        {col.price} · {col.files} files
                      </div>
                    </div>
                    {col.verified && (
                      <span style={pill("var(--accent-bg)", "var(--accent)")}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Question input */}
          <div style={card}>
            <label style={label} htmlFor="q-textarea">Ask a question</label>
            <div style={{ position: "relative" }}>
              <textarea
                id="q-textarea"
                rows={4}
                maxLength={2000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type a question about the knowledge collection..."
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  fontSize: "0.9375rem",
                  resize: "vertical",
                  lineHeight: 1.6,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "0.5rem",
                  right: "0.6rem",
                  fontSize: "0.75rem",
                  color: question.length > 1800 ? "var(--red)" : "var(--text-3)",
                }}
              >
                {question.length}/2000
              </span>
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={handleAsk}
            disabled={!question.trim() || !selectedCollection || queryState === "loading"}
            style={{
              width: "100%",
              padding: "0.9rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background:
                !question.trim() || !selectedCollection
                  ? "var(--surface-3)"
                  : "linear-gradient(135deg,#7c3aed,#6366f1)",
              color:
                !question.trim() || !selectedCollection ? "var(--text-3)" : "#fff",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor:
                !question.trim() || !selectedCollection || queryState === "loading"
                  ? "not-allowed"
                  : "pointer",
              letterSpacing: "0.03em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              opacity: queryState === "loading" ? 0.7 : 1,
              boxShadow: !question.trim() || !selectedCollection ? "none" : "0 4px 14px rgba(124,58,237,0.35)",
            }}
          >
            {queryState === "loading" ? (
              <>
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", animation: "spin 0.8s linear infinite" }} />
                Processing…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Ask DataVault
              </>
            )}
          </button>

          {/* ── Loading state ── */}
          {queryState === "loading" && (
            <div style={{ ...card, background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "3px solid var(--accent-bdr)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.8s linear infinite",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 600, color: "var(--text)" }}>Processing your query…</span>
              </div>

              {/* Stepper */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.25rem" }}>
                {STEPS.map((step, i) => {
                  const done = i < currentStep;
                  const active = i === currentStep;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                      {i < STEPS.length - 1 && (
                        <div
                          style={{
                            position: "absolute",
                            top: 14,
                            left: "calc(50% + 14px)",
                            right: "calc(-50% + 14px)",
                            height: 2,
                            background: done ? "var(--accent)" : "var(--border)",
                            zIndex: 0,
                          }}
                        />
                      )}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: done || active ? "var(--accent)" : "var(--surface-3)",
                          border: active ? "2px solid var(--accent)" : "2px solid transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: done || active ? "#fff" : "var(--text-3)",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          zIndex: 1,
                          position: "relative",
                          animation: active ? "pulse 1s ease-in-out infinite" : "none",
                          flexShrink: 0,
                        }}
                      >
                        {done ? "✓" : i + 1}
                      </div>
                      <span
                        style={{
                          marginTop: "0.4rem",
                          fontSize: "0.7rem",
                          color: done || active ? "var(--accent)" : "var(--text-3)",
                          fontWeight: done || active ? 600 : 400,
                          textAlign: "center",
                          lineHeight: 1.3,
                        }}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Answer state ── */}
          {queryState === "answered" && mockAnswer && (
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Success banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 0.9rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--green-bg)",
                  border: "1px solid var(--green)",
                }}
              >
                <span style={{ color: "var(--green)", fontWeight: 600, fontSize: "0.875rem" }}>
                  ✓ Answer generated successfully
                </span>
                <span style={{ color: "var(--green)", fontSize: "0.8125rem" }}>⏱ 12.4s</span>
              </div>

              {/* Answer text */}
              <div style={{ fontSize: "0.9375rem" }}>
                {renderAnswerText(mockAnswer.text)}
              </div>

              {/* Sources */}
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-3)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Sources
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {mockAnswer.sources.map((src, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>{src}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction receipt */}
              <div
                style={{
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  padding: "0.9rem 1rem",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.875rem", marginBottom: "0.6rem" }}>
                  Transaction Receipt
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.3rem 0.75rem", fontSize: "0.8125rem" }}>
                  <span style={{ color: "var(--text-3)" }}>Hash</span>
                  <span style={{ color: "var(--text)", fontFamily: "monospace" }}>{mockAnswer.hash}</span>
                  <span style={{ color: "var(--text-3)" }}>Amount</span>
                  <span style={{ color: "var(--text)" }}>{mockAnswer.amount}</span>
                  <span style={{ color: "var(--text-3)" }}>Timestamp</span>
                  <span style={{ color: "var(--text)" }}>{new Date().toLocaleString()}</span>
                  <span style={{ color: "var(--text-3)" }}>Status</span>
                  <span style={pill("var(--green-bg)", "var(--green)")}>Settled</span>
                </div>
                <a
                  href="#"
                  style={{
                    display: "inline-block",
                    marginTop: "0.75rem",
                    color: "var(--accent)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT COLUMN ══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Suggested questions */}
          <div style={card}>
            <span style={label}>Suggested Questions</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(q)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color .15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "var(--accent-bdr)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                >
                  <span style={{ color: "var(--accent)", fontSize: "0.7rem", flexShrink: 0 }}>✦</span>
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Query history */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <span style={{ ...label, margin: 0 }}>Query History</span>
              {queryHistory.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {queryHistory.length === 0 ? (
              <div
                style={{
                  padding: "1.5rem",
                  textAlign: "center",
                  color: "var(--text-3)",
                  fontSize: "0.875rem",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                No queries yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {queryHistory.map((item) => {
                  const [bg, color] = outcomeColor(item.outcome);
                  return (
                    <div
                      key={item.requestId}
                      style={{
                        padding: "0.65rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ fontSize: "0.8375rem", color: "var(--text)", fontWeight: 500, marginBottom: "0.3rem", lineHeight: 1.4 }}>
                        {truncate(item.question, 70)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                          {getCollectionName(item.collectionId, allCollections)}
                          {" · "}
                          {timeAgo(item.openedAt)}
                        </span>
                        <span style={pill(bg, color)}>{item.outcome}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Document preview */}
          {selectedCollection && (
            <div style={card}>
              <span style={label}>Document Preview</span>
              <div
                style={{
                  width: "100%",
                  height: 80,
                  borderRadius: "var(--radius-sm)",
                  background: selectedCollection.gradient,
                  marginBottom: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.9)", fontSize: "1.25rem" }}>📚</span>
              </div>
              <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.3rem" }}>
                {selectedCollection.name}
              </div>
              <div style={{ color: "var(--text-2)", fontSize: "0.8375rem", lineHeight: 1.5, marginBottom: "0.75rem" }}>
                {selectedCollection.description}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                <span style={pill("var(--surface-3)", "var(--text-2)")}>
                  📄 {selectedCollection.files} files
                </span>
                <span style={pill("var(--accent-bg)", "var(--accent)")}>
                  {selectedCollection.price} per query
                </span>
              </div>
              <button
                onClick={() => navigate(`/collections/${selectedCollection.id}`)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                View Collection →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(124,58,237,0); }
        }
      `}</style>
    </div>
  );
}
