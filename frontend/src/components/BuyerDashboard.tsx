import { useState, useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { DATAVAULT_ABI, CONTRACT_ADDRESS } from "@/lib/contract";
import { encodeFunctionData, keccak256, toBytes, formatEther } from "viem";

const MONAD_CHAIN_ID = 10143;
const REFUND_TIMEOUT_MS = 10 * 60 * 1000;
const HISTORY_KEY = "datavault_requests";
const MAX_HISTORY = 10;

type QueryStep =
  | "idle"
  | "quoting"
  | "quoted"
  | "awaiting_wallet"
  | "answering"
  | "settlement_pending"
  | "done"
  | "failed"
  | "refundable";

interface Quote {
  collectionId: string;
  priceWei: string;
  priceDisplay: string;
  collectionName: string;
}

interface AnswerResult {
  answer: string;
  citedPassageIds: string[];
  requestId: string;
  openTxHash: string;
  settleTxHash: string | null;
  outcome: string;
}

interface SavedRequest {
  requestId: string;
  collectionId: string;
  question: string;
  openTxHash: string;
  buyerAddress: string;
  openedAt: number;
  outcome: string;
}

function loadHistory(): SavedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToHistory(req: SavedRequest) {
  const history = loadHistory().filter((r) => r.requestId !== req.requestId);
  history.unshift(req);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function updateHistoryOutcome(requestId: string, outcome: string) {
  const history = loadHistory().map((r) =>
    r.requestId === requestId ? { ...r, outcome } : r,
  );
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function signAuth(
  walletClient: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  prefix: string,
  requestId: string,
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Date.now();
  const message = `${prefix}:${requestId}:${timestamp}`;
  const signature = await walletClient.signMessage({ message });
  return { signature, timestamp };
}

const EXAMPLE_QUESTIONS = ["Architecture", "Gas model", "Smart contracts", "Ecosystem"];

const STEP_LABELS = ["Initiate Payment", "Open Escrow", "Process Query", "Generate Answer"];

function currentStepIndex(step: QueryStep): number {
  if (step === "quoting" || step === "quoted") return 0;
  if (step === "awaiting_wallet") return 1;
  if (step === "answering") return 2;
  if (step === "done" || step === "settlement_pending") return 3;
  return -1;
}

export default function BuyerDashboard() {
  const { primaryWallet } = useDynamicContext();
  const [collectionId, setCollectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<QueryStep>("idle");
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [history, setHistory] = useState<SavedRequest[]>([]);
  const [refundCountdown, setRefundCountdown] = useState<number | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const inFlightRef = useRef<{ requestId: string; openTxHash: string; openedAt: number } | null>(null);

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  useEffect(() => {
    setHistory(loadHistory());
  }, [walletAddress]);

  useEffect(() => {
    if (!inFlightRef.current || step !== "refundable") return;
    const openedAt = inFlightRef.current.openedAt;
    const tick = () => {
      const remaining = openedAt + REFUND_TIMEOUT_MS - Date.now();
      setRefundCountdown(remaining > 0 ? remaining : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step]);

  async function checkNetwork(): Promise<boolean> {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return false;
    const wc = await primaryWallet.getWalletClient();
    const chainId = await wc.getChainId();
    if (chainId !== MONAD_CHAIN_ID) {
      setError(`Wrong network. Switch to Monad testnet (chainId ${MONAD_CHAIN_ID}).`);
      return false;
    }
    return true;
  }

  function handleCollectionIdChange(v: string) {
    setCollectionId(v);
    setQuote(null);
    setError("");
  }

  function handleQuestionChange(v: string) {
    setQuestion(v);
    setQuote(null);
    setError("");
  }

  async function handlePrepare(e: React.FormEvent) {
    e.preventDefault();
    if (step === "awaiting_wallet" || step === "answering") return;
    setStep("quoting");
    setError("");
    setQuote(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/queries/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, question }),
      });
      if (!res.ok) throw new Error(await res.text());
      const q = (await res.json()) as Quote;
      setQuote(q);
      setStep("quoted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("idle");
    }
  }

  async function handleExecute() {
    if (!primaryWallet || !quote) return;
    if (step === "awaiting_wallet" || step === "answering") return;
    if (!contractReady) { setError("Contract address not configured."); return; }
    if (!(await checkNetwork())) return;

    setStep("awaiting_wallet");
    setError("");

    try {
      const requestId = keccak256(toBytes(`${walletAddress}-${Date.now()}-${question}`));

      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "openQuery",
        args: [requestId, quote.collectionId as `0x${string}`],
      });

      let txHash: string;
      try {
        txHash = await walletClient.sendTransaction({
          to: CONTRACT_ADDRESS!,
          data,
          value: BigInt(quote.priceWei),
        });
      } catch (err: unknown) {
        throw new Error("Transaction rejected: " + (err instanceof Error ? err.message : String(err)));
      }

      const openedAt = Date.now();
      inFlightRef.current = { requestId, openTxHash: txHash, openedAt };
      saveToHistory({ requestId, collectionId: quote.collectionId, question, openTxHash: txHash, buyerAddress: walletAddress, openedAt, outcome: "pending" });
      setHistory(loadHistory());
      setStep("answering");

      const res = await fetch("/api/queries/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, collectionId: quote.collectionId, question, txHash, buyerAddress: walletAddress }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (openedAt + REFUND_TIMEOUT_MS < Date.now()) {
          updateHistoryOutcome(requestId, "refundable");
          setHistory(loadHistory());
          setStep("refundable");
        } else {
          updateHistoryOutcome(requestId, "failed");
          setHistory(loadHistory());
          setStep("failed");
        }
        throw new Error(text);
      }

      const result = (await res.json()) as { answer: string; citedPassageIds: string[]; requestId: string; openTxHash: string; settleTxHash: string | null; outcome: string };
      updateHistoryOutcome(requestId, result.outcome);
      setHistory(loadHistory());
      setAnswer({ ...result });
      setStep(result.outcome === "settlement_pending" ? "settlement_pending" : "done");
    } catch (err: unknown) {
      if (step !== "failed" && step !== "refundable") {
        setError(err instanceof Error ? err.message : String(err));
        if (step !== "settlement_pending") setStep("idle");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function handleReconcile() {
    if (!primaryWallet || !answer || !isEthereumWallet(primaryWallet)) return;
    setReconciling(true);
    try {
      const walletClient = await primaryWallet.getWalletClient();
      const { signature, timestamp } = await signAuth(walletClient, "datavault-reconcile", answer.requestId);
      const res = await fetch(`/api/queries/${answer.requestId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerAddress: walletAddress, signature, timestamp }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { outcome: string; settleTxHash: string | null };
      setAnswer({ ...answer, outcome: data.outcome, settleTxHash: data.settleTxHash ?? answer.settleTxHash });
      if (data.outcome === "settled") {
        setStep("done");
        updateHistoryOutcome(answer.requestId, "settled");
        setHistory(loadHistory());
      }
    } catch (err: unknown) {
      setError("Reconcile failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReconciling(false);
    }
  }

  async function handleRefund() {
    if (!primaryWallet || !inFlightRef.current) return;
    if (!(await checkNetwork())) return;
    setRefunding(true);
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "refundExpired",
        args: [inFlightRef.current.requestId as `0x${string}`],
      });
      const txHash = await walletClient.sendTransaction({ to: CONTRACT_ADDRESS!, data });
      updateHistoryOutcome(inFlightRef.current.requestId, "refunded");
      setHistory(loadHistory());
      setStep("idle");
      setError("");
      setAnswer(null);
      setQuote(null);
      alert(`Refund sent. Tx: ${txHash}`);
    } catch (err: unknown) {
      setError("Refund failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRefunding(false);
    }
  }

  async function handleRecoverAnswer(req: SavedRequest) {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return;
    setError("");
    try {
      const walletClient = await primaryWallet.getWalletClient();
      const { signature, timestamp } = await signAuth(walletClient, "datavault-answer", req.requestId);
      const res = await fetch(`/api/queries/${req.requestId}/answer`, {
        headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { answer: string; citedPassageIds: string[]; outcome: string };
      inFlightRef.current = { requestId: req.requestId, openTxHash: req.openTxHash, openedAt: req.openedAt };
      setCollectionId(req.collectionId);
      setQuestion(req.question);
      setAnswer({
        answer: data.answer,
        citedPassageIds: data.citedPassageIds ?? [],
        requestId: req.requestId,
        openTxHash: req.openTxHash,
        settleTxHash: null,
        outcome: data.outcome,
      });
      setStep(data.outcome === "settlement_pending" ? "settlement_pending" : "done");
    } catch (err: unknown) {
      setError("Recovery failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 1500);
    });
  }

  const isExecuting = step === "awaiting_wallet" || step === "answering";
  const refundReady = step === "refundable" && (refundCountdown === null || refundCountdown <= 0);
  const activeStepIdx = currentStepIndex(step);
  const showStepper = step === "awaiting_wallet" || step === "answering";

  /* Format tx hash for display */
  function shortHash(h: string) {
    return h.slice(0, 18) + "..." + h.slice(-10);
  }

  /* Parse answer into key points if possible */
  function parseKeyPoints(text: string): { intro: string; points: string[] } | null {
    const keyIdx = text.toLowerCase().indexOf("key points");
    if (keyIdx === -1) return null;
    const before = text.slice(0, keyIdx).trim();
    const after = text.slice(keyIdx + 10).trim().replace(/^[:\-\s]+/, "");
    const lines = after.split(/\n+/).filter(Boolean);
    const points = lines.slice(0, 4).map((l) => l.replace(/^\d+\.\s*/, "").trim());
    return points.length >= 2 ? { intro: before, points } : null;
  }

  return (
    <>
      {/* Panel 02 — Ask a Question */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div style={s.panelNum}>02</div>
          <div>
            <div style={s.panelTitle}>Ask a Question</div>
            <div style={s.panelSub}>Select a collection, pay per query, and get AI-powered answers.</div>
          </div>
        </div>

        {!contractReady && (
          <div style={s.warnBanner}>⚠ Contract not deployed. Development preview only.</div>
        )}

        <form onSubmit={handlePrepare} style={s.form}>
          {/* Collection selector */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Select Collection</label>
            <div style={s.collectionSelector}>
              <div style={s.collectionIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="14 2 14 8 20 8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Collection ID (0x...)"
                value={collectionId}
                onChange={(e) => handleCollectionIdChange(e.target.value)}
                required
                disabled={isExecuting}
                style={s.collectionInput}
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "#64748b", flexShrink: 0 }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Price row */}
          {quote && (
            <div style={s.priceRow}>
              <div style={s.priceLeft}>
                <div style={s.monCircle}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="rgba(124,58,237,0.3)" stroke="#7c3aed" strokeWidth="2" />
                    <path d="M8 12l2.5 2.5L16 8" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={s.priceText}>{quote.priceDisplay} MON per query</span>
              </div>
              <span style={s.availableBadge}>● Available</span>
            </div>
          )}

          {/* Question textarea */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Your Question</label>
            <div style={s.textareaWrap}>
              <textarea
                rows={4}
                value={question}
                onChange={(e) => handleQuestionChange(e.target.value)}
                required
                disabled={isExecuting}
                maxLength={2000}
                placeholder="How does Monad handle parallel transaction execution?"
                style={s.textarea}
              />
              <span style={s.charCount}>{question.length}/2000</span>
            </div>
          </div>

          {/* Example chips */}
          <div style={s.chipsRow}>
            <span style={s.chipsLabel}>Example questions:</span>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={isExecuting}
                style={s.chip}
                onClick={() => handleQuestionChange(q)}
              >
                {q}
              </button>
            ))}
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* CTA buttons */}
          {!quote ? (
            <button
              type="submit"
              disabled={isExecuting || step === "quoting" || !collectionId.trim() || !question.trim()}
              style={isExecuting || step === "quoting" || !collectionId.trim() || !question.trim()
                ? { ...s.payBtn, opacity: 0.5, cursor: "not-allowed" }
                : s.payBtn}
            >
              {step === "quoting" ? (
                <><span style={s.spinnerWh} /> Getting quote...</>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                    <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
                  </svg>
                  Pay and Ask
                </>
              )}
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.5rem" }}>
              <div style={s.quoteBox}>
                <strong style={{ color: "#c4b5fd", fontSize: "0.8rem" }}>{quote.collectionName || "Collection"}</strong>
                <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                  {" "}— {formatEther(BigInt(quote.priceWei))} MON. Payment goes to escrow; refundable after 10 min if delivery fails.
                </span>
              </div>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecuting}
                style={isExecuting ? { ...s.payBtn, opacity: 0.5, cursor: "not-allowed" } : s.payBtn}
              >
                {isExecuting ? (
                  <><span style={s.spinnerWh} /> Working...</>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    Confirm &amp; Pay {quote.priceDisplay} MON
                  </>
                )}
              </button>
            </div>
          )}
        </form>

        {/* Escrow status + stepper */}
        {showStepper && (
          <div style={s.stepperArea}>
            <div style={s.stepperStatus}>
              <div style={s.loadingDot} />
              <div>
                <div style={s.stepperMsg}>
                  {step === "awaiting_wallet" ? "Opening escrow on Monad testnet..." : "Processing query and generating answer..."}
                </div>
                <div style={s.stepperHint}>
                  {step === "awaiting_wallet" ? "Please confirm the transaction in your wallet." : "Awaiting AI response and settlement."}
                </div>
              </div>
            </div>
            <div style={s.stepper}>
              {STEP_LABELS.map((label, i) => (
                <div key={label} style={s.stepItem}>
                  <div style={i <= activeStepIdx ? { ...s.stepCircle, ...s.stepCircleActive } : i === activeStepIdx + 1 ? { ...s.stepCircle, ...s.stepCircleNext } : s.stepCircle}>
                    {i < activeStepIdx ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <polyline points="20 6 9 17 4 12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, color: i <= activeStepIdx ? "white" : "#64748b" }}>{i + 1}</span>
                    )}
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div style={i < activeStepIdx ? { ...s.stepLine, ...s.stepLineActive } : s.stepLine} />
                  )}
                  <div style={s.stepLabel}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Refund state */}
        {(step === "failed" || step === "refundable") && (
          <div style={s.failedBox}>
            <div style={s.failedTitle}>
              {step === "refundable" ? "Query failed — refund available" : "Query failed"}
            </div>
            <div style={s.failedDesc}>
              {step === "refundable"
                ? "The 10-minute escrow window has elapsed. You can now reclaim your payment."
                : "The query could not be completed. Refund available after 10 minutes."}
            </div>
            {step === "refundable" && refundCountdown !== null && refundCountdown > 0 && (
              <div style={s.countdown}>Refund available in {Math.ceil(refundCountdown / 1000)}s</div>
            )}
            <button
              onClick={handleRefund}
              disabled={refunding || !refundReady}
              style={refunding || !refundReady ? { ...s.refundBtn, opacity: 0.5 } : s.refundBtn}
            >
              {refunding ? <><span style={s.spinnerWh} /> Sending...</> : "Claim Refund (on-chain)"}
            </button>
          </div>
        )}

        {/* Recent queries */}
        {history.length > 0 && (
          <div style={s.historySection}>
            <div style={s.historyHeader}>
              <span style={s.historyTitle}>Recent Queries</span>
              <button style={s.viewAllBtn}>View All →</button>
            </div>
            <div style={s.historyList}>
              {history.slice(0, 3).map((req) => (
                <div key={req.requestId} style={s.historyRow}>
                  <div style={s.historyIcon}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={s.historyContent}>
                    <div style={s.historyQ}>{req.question.slice(0, 48)}{req.question.length > 48 ? "..." : ""}</div>
                    <div style={s.historyMeta}>
                      <span style={s.historyCollection}>{req.collectionId.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <div style={s.historyRight}>
                    <span style={s.historyTime}>{timeAgo(req.openedAt)}</span>
                    <span style={{ ...s.outcomeDot, color: outcomeColor(req.outcome) }}>{req.outcome}</span>
                    {(req.outcome === "answer_recorded" || req.outcome === "settlement_pending" || req.outcome === "settled") && (
                      <button onClick={() => handleRecoverAnswer(req)} style={s.recoverBtn}>
                        Recover
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panel 03 — AI Answer + Sources */}
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <div style={s.panelNum}>03</div>
          <div style={{ flex: 1 }}>
            <div style={s.panelTitle}>AI Answer + Sources</div>
            <div style={s.panelSub}>Get accurate answers with source citations and on-chain receipt.</div>
          </div>
          {answer && (
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button
                style={s.smallActionBtn}
                onClick={() => navigator.clipboard.writeText(answer.answer)}
                title="Copy answer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                </svg>
                Copy
              </button>
              <button style={s.smallActionBtn} title="Share">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="2" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="2" />
                </svg>
                Share
              </button>
            </div>
          )}
        </div>

        {!answer && step !== "done" && step !== "settlement_pending" && (
          <div style={s.emptyState}>
            <div style={s.emptyIconWrap}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.3)" strokeWidth="1.5" />
                <path d="M9 11.5l2.5 2.5L15.5 9" stroke="rgba(124,58,237,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={s.emptyTitle}>Awaiting your query</div>
            <div style={s.emptyDesc}>
              Fill in a collection ID and question in panel 02, then click{" "}
              <em>Pay and Ask</em> to receive an AI-generated answer here with verified citations and an on-chain receipt.
            </div>
            {step === "quoting" && <div style={s.infoBanner}><span style={s.spinnerPurple} /> Getting quote...</div>}
            {step === "quoted" && <div style={s.infoBanner}>Quote ready. Confirm payment in panel 02.</div>}
          </div>
        )}

        {(step === "done" || step === "settlement_pending") && answer && (() => {
          const parsed = parseKeyPoints(answer.answer);
          return (
            <div style={s.answerContent}>
              {/* Success banner */}
              <div style={s.answerBanner}>
                <div style={s.answerBannerLeft}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#22c55e" />
                    <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={s.answerBannerText}>Answer generated successfully</span>
                </div>
                <span style={s.answerTime}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 3 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  12.4s
                </span>
              </div>

              {step === "settlement_pending" && (
                <div style={s.pendingBanner}>
                  Settlement pending.{" "}
                  <button onClick={handleReconcile} disabled={reconciling} style={s.reconcileBtn}>
                    {reconciling ? "Checking..." : "Check status"}
                  </button>
                </div>
              )}

              {/* Answer text */}
              <div style={s.answerText}>
                {parsed ? (
                  <>
                    <p style={{ margin: "0 0 0.75rem", lineHeight: 1.65 }}>{parsed.intro}</p>
                    <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.82rem", color: "#e2e8f0" }}>Key points:</p>
                    <ol style={s.keyPoints}>
                      {parsed.points.map((pt, i) => (
                        <li key={i} style={s.keyPoint}>
                          {pt}{" "}
                          <span style={s.citRef}>[{i + 1}]</span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p style={{ margin: 0, lineHeight: 1.65 }}>{answer.answer}</p>
                )}
              </div>

              {/* Citations */}
              {answer.citedPassageIds.length > 0 && (
                <div style={s.citationsSection}>
                  <div style={s.citationsHeader}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={s.citationsTitle}>Sources</span>
                  </div>
                  {answer.citedPassageIds.map((id, i) => (
                    <div key={id} style={s.citationRow}>
                      <span style={s.citNum}>[{i + 1}]</span>
                      <span style={s.citId}>{id.length > 40 ? id.slice(0, 40) + "..." : id}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: "#475569", flexShrink: 0 }}>
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                  ))}
                </div>
              )}

              {/* Transaction receipt */}
              <div style={s.receipt}>
                <div style={s.receiptHeader}>
                  <div style={s.receiptLeft}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#22c55e" />
                      <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={s.receiptTitle}>Transaction Receipt</span>
                  </div>
                  <span style={s.settledBadge}>
                    {answer.outcome === "settled" ? "● Settled" : `● ${answer.outcome}`}
                  </span>
                </div>
                <div style={s.receiptDesc}>Query completed and payment sent to collection owner.</div>

                <div style={s.receiptHashRow}>
                  <span style={s.receiptKey}>Transaction Hash</span>
                  <div style={s.receiptHashVal}>
                    <span style={s.receiptHash}>{shortHash(answer.openTxHash)}</span>
                    <button style={s.receiptIconBtn} onClick={() => copyHash(answer.openTxHash)} title="Copy">
                      {copiedHash ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <polyline points="20 6 9 17 4 12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                    <a
                      href={`https://explorer.monad.xyz/tx/${answer.openTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      style={s.receiptIconBtn}
                      title="View on Explorer"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </a>
                  </div>
                </div>

                <div style={s.receiptMeta}>
                  <div style={s.receiptMetaItem}>
                    <span style={s.receiptKey}>Timestamp</span>
                    <span style={s.receiptVal}>{new Date(inFlightRef.current?.openedAt ?? Date.now()).toLocaleString()}</span>
                  </div>
                  {quote && (
                    <div style={s.receiptMetaItem}>
                      <span style={s.receiptKey}>Amount</span>
                      <span style={s.receiptVal}>{quote.priceDisplay} MON</span>
                    </div>
                  )}
                  <div style={s.receiptMetaItem}>
                    <span style={s.receiptKey}>Status</span>
                    <span style={s.confirmedBadge}>● Confirmed</span>
                  </div>
                </div>

                <a
                  href={`/api/queries/${answer.requestId}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  style={s.explorerLink}
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

function outcomeColor(outcome: string): string {
  if (outcome === "settled") return "#4ade80";
  if (outcome === "failed" || outcome === "refunded") return "#f87171";
  if (outcome === "refundable") return "#fb923c";
  if (outcome === "pending") return "#94a3b8";
  return "#818cf8";
}

const s = {
  panel: {
    background: "#0f172a",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 16,
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.875rem",
    minWidth: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    paddingBottom: "0.875rem",
    borderBottom: "1px solid rgba(148,163,184,0.08)",
  },
  panelNum: {
    width: 32,
    height: 32,
    background: "linear-gradient(135deg, #7c3aed, #6366f1)",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8rem",
    fontWeight: 800,
    color: "white",
    flexShrink: 0,
  },
  panelTitle: { fontSize: "0.95rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 2 },
  panelSub: { fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.4 },

  warnBanner: {
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.25)",
    borderRadius: 8,
    padding: "0.55rem 0.75rem",
    fontSize: "0.75rem",
    color: "#fbbf24",
  },
  infoBanner: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 8,
    padding: "0.55rem 0.75rem",
    fontSize: "0.75rem",
    color: "#818cf8",
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 8,
    padding: "0.55rem 0.75rem",
    fontSize: "0.78rem",
    color: "#fca5a5",
  },

  form: { display: "flex", flexDirection: "column" as const, gap: "0.75rem" },
  fieldGroup: { display: "flex", flexDirection: "column" as const, gap: "0.35rem" },
  fieldLabel: { fontSize: "0.73rem", fontWeight: 600, color: "#94a3b8" },

  collectionSelector: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 10,
    padding: "0 0.75rem",
    cursor: "pointer",
  },
  collectionIcon: {
    width: 28,
    height: 28,
    background: "rgba(124,58,237,0.15)",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  collectionInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "0.625rem 0",
    fontSize: "0.82rem",
    color: "#f1f5f9",
    fontFamily: "monospace",
  },

  priceRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.08)",
    borderRadius: 8,
  },
  priceLeft: { display: "flex", alignItems: "center", gap: "0.5rem" },
  monCircle: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(124,58,237,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  priceText: { fontSize: "0.82rem", color: "#e2e8f0", fontWeight: 500 },
  availableBadge: { fontSize: "0.72rem", color: "#4ade80", fontWeight: 600 },

  textareaWrap: { position: "relative" as const },
  textarea: {
    width: "100%",
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 10,
    padding: "0.625rem 0.75rem",
    fontSize: "0.82rem",
    color: "#f1f5f9",
    outline: "none",
    resize: "vertical" as const,
    fontFamily: "inherit",
    lineHeight: 1.6,
    boxSizing: "border-box" as const,
  },
  charCount: {
    position: "absolute" as const,
    bottom: 8,
    right: 10,
    fontSize: "0.65rem",
    color: "#475569",
  },

  chipsRow: { display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" as const },
  chipsLabel: { fontSize: "0.72rem", color: "#475569" },
  chip: {
    padding: "0.3rem 0.65rem",
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 20,
    fontSize: "0.72rem",
    color: "#94a3b8",
    cursor: "pointer",
  },

  payBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.7rem",
    background: "linear-gradient(135deg, #7c3aed, #6366f1)",
    border: "none",
    borderRadius: 10,
    color: "white",
    fontWeight: 700,
    fontSize: "0.875rem",
    cursor: "pointer",
    width: "100%",
    boxShadow: "0 4px 15px rgba(124,58,237,0.3)",
  },
  quoteBox: {
    padding: "0.6rem 0.75rem",
    background: "rgba(124,58,237,0.08)",
    border: "1px solid rgba(124,58,237,0.2)",
    borderRadius: 8,
    fontSize: "0.78rem",
    lineHeight: 1.5,
  },

  spinnerWh: {
    display: "inline-block",
    width: 13,
    height: 13,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    marginRight: 6,
    flexShrink: 0,
  },
  spinnerPurple: {
    display: "inline-block",
    width: 11,
    height: 11,
    border: "2px solid rgba(124,58,237,0.3)",
    borderTopColor: "#7c3aed",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  },

  /* Stepper */
  stepperArea: {
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.08)",
    borderRadius: 10,
    padding: "0.875rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  stepperStatus: { display: "flex", alignItems: "flex-start", gap: "0.625rem" },
  loadingDot: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(124,58,237,0.15)",
    border: "2px solid rgba(124,58,237,0.4)",
    flexShrink: 0,
    marginTop: 2,
    animation: "pulse 1.5s ease-in-out infinite",
  },
  stepperMsg: { fontSize: "0.8rem", fontWeight: 600, color: "#e2e8f0", marginBottom: 2 },
  stepperHint: { fontSize: "0.72rem", color: "#64748b" },
  stepper: { display: "flex", alignItems: "flex-start", gap: 0 },
  stepItem: { display: "flex", flexDirection: "column" as const, alignItems: "center", flex: 1 },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "rgba(148,163,184,0.08)",
    border: "1.5px solid rgba(148,163,184,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepCircleActive: {
    background: "linear-gradient(135deg, #7c3aed, #6366f1)",
    border: "none",
    boxShadow: "0 0 10px rgba(124,58,237,0.4)",
  },
  stepCircleNext: {
    border: "1.5px solid rgba(124,58,237,0.4)",
    background: "rgba(124,58,237,0.08)",
  },
  stepLine: {
    height: 1.5,
    flex: 1,
    background: "rgba(148,163,184,0.12)",
    marginTop: -16,
    marginBottom: 20,
    width: "100%",
  },
  stepLineActive: { background: "rgba(124,58,237,0.5)" },
  stepLabel: {
    fontSize: "0.58rem",
    color: "#64748b",
    textAlign: "center" as const,
    lineHeight: 1.3,
    maxWidth: 60,
  },

  /* Refund / failed */
  failedBox: {
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 10,
    padding: "0.875rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  failedTitle: { fontSize: "0.85rem", fontWeight: 700, color: "#fca5a5" },
  failedDesc: { fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.5 },
  countdown: { fontSize: "0.75rem", color: "#64748b" },
  refundBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.4rem",
    padding: "0.55rem 1rem",
    background: "rgba(239,68,68,0.2)",
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: 8,
    color: "#fca5a5",
    fontWeight: 600,
    fontSize: "0.8rem",
    cursor: "pointer",
  },

  /* Recent queries */
  historySection: {
    borderTop: "1px solid rgba(148,163,184,0.08)",
    paddingTop: "0.875rem",
  },
  historyHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" },
  historyTitle: { fontSize: "0.82rem", fontWeight: 700, color: "#e2e8f0" },
  viewAllBtn: { background: "none", border: "none", color: "#7c3aed", fontSize: "0.72rem", cursor: "pointer", fontWeight: 600 },
  historyList: { display: "flex", flexDirection: "column" as const, gap: "0.4rem" },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.5rem 0.625rem",
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.06)",
    borderRadius: 8,
  },
  historyIcon: {
    width: 26,
    height: 26,
    background: "rgba(124,58,237,0.12)",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  historyContent: { flex: 1, minWidth: 0 },
  historyQ: { fontSize: "0.75rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  historyMeta: { fontSize: "0.65rem", color: "#475569", marginTop: 1 },
  historyCollection: { fontFamily: "monospace" },
  historyRight: { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2, flexShrink: 0 },
  historyTime: { fontSize: "0.65rem", color: "#475569" },
  outcomeDot: { fontSize: "0.65rem", fontWeight: 600 },
  recoverBtn: {
    fontSize: "0.65rem",
    padding: "1px 6px",
    background: "rgba(124,58,237,0.15)",
    border: "1px solid rgba(124,58,237,0.25)",
    borderRadius: 4,
    color: "#a78bfa",
    cursor: "pointer",
  },

  /* Panel 03 */
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "2rem 1rem",
    gap: "0.75rem",
    textAlign: "center" as const,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    background: "rgba(124,58,237,0.08)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(124,58,237,0.15)",
  },
  emptyTitle: { fontSize: "0.95rem", fontWeight: 600, color: "#64748b" },
  emptyDesc: { fontSize: "0.78rem", color: "#475569", lineHeight: 1.65, maxWidth: 260 },

  smallActionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.3rem 0.65rem",
    background: "rgba(148,163,184,0.08)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderRadius: 7,
    color: "#94a3b8",
    fontSize: "0.72rem",
    cursor: "pointer",
  },

  /* Answer content */
  answerContent: { display: "flex", flexDirection: "column" as const, gap: "0.875rem" },
  answerBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 8,
  },
  answerBannerLeft: { display: "flex", alignItems: "center", gap: "0.5rem" },
  answerBannerText: { fontSize: "0.78rem", fontWeight: 600, color: "#4ade80" },
  answerTime: { display: "flex", alignItems: "center", fontSize: "0.72rem", color: "#64748b" },

  pendingBanner: {
    background: "rgba(251,191,36,0.08)",
    border: "1px solid rgba(251,191,36,0.2)",
    borderRadius: 8,
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    color: "#fbbf24",
  },
  reconcileBtn: {
    background: "none",
    border: "none",
    color: "#f59e0b",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "0.75rem",
    padding: 0,
  },

  answerText: {
    fontSize: "0.82rem",
    color: "#cbd5e1",
    lineHeight: 1.7,
    padding: "0.75rem",
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.08)",
    borderRadius: 10,
  },
  keyPoints: { margin: "0", paddingLeft: "1.1rem", display: "flex", flexDirection: "column" as const, gap: "0.4rem" },
  keyPoint: { fontSize: "0.8rem", color: "#cbd5e1", lineHeight: 1.6 },
  citRef: {
    display: "inline",
    fontSize: "0.65rem",
    color: "#7c3aed",
    background: "rgba(124,58,237,0.15)",
    border: "1px solid rgba(124,58,237,0.25)",
    borderRadius: 3,
    padding: "0 3px",
    marginLeft: 2,
    cursor: "pointer",
    verticalAlign: "super",
  },

  citationsSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.4rem",
  },
  citationsHeader: { display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.1rem" },
  citationsTitle: { fontSize: "0.78rem", fontWeight: 700, color: "#94a3b8" },
  citationRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.4rem 0.625rem",
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.06)",
    borderRadius: 7,
  },
  citNum: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#7c3aed",
    background: "rgba(124,58,237,0.15)",
    border: "1px solid rgba(124,58,237,0.2)",
    borderRadius: 3,
    padding: "0 4px",
    flexShrink: 0,
  },
  citId: { flex: 1, fontSize: "0.73rem", color: "#94a3b8", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },

  /* Receipt */
  receipt: {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 12,
    padding: "0.875rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.625rem",
  },
  receiptHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  receiptLeft: { display: "flex", alignItems: "center", gap: "0.5rem" },
  receiptTitle: { fontSize: "0.82rem", fontWeight: 700, color: "#e2e8f0" },
  settledBadge: {
    fontSize: "0.68rem",
    fontWeight: 700,
    color: "#4ade80",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 20,
    padding: "2px 8px",
  },
  receiptDesc: { fontSize: "0.72rem", color: "#64748b" },
  receiptHashRow: { display: "flex", flexDirection: "column" as const, gap: "0.3rem" },
  receiptKey: { fontSize: "0.65rem", color: "#475569", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  receiptHashVal: { display: "flex", alignItems: "center", gap: "0.4rem" },
  receiptHash: { fontFamily: "monospace", fontSize: "0.72rem", color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis" },
  receiptIconBtn: {
    background: "none",
    border: "none",
    color: "#475569",
    cursor: "pointer",
    padding: "2px",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  receiptMeta: { display: "flex", gap: "0.75rem", flexWrap: "wrap" as const },
  receiptMetaItem: { display: "flex", flexDirection: "column" as const, gap: "0.2rem" },
  receiptVal: { fontSize: "0.78rem", color: "#e2e8f0", fontWeight: 600 },
  confirmedBadge: { fontSize: "0.72rem", fontWeight: 700, color: "#4ade80" },
  explorerLink: {
    fontSize: "0.75rem",
    color: "#7c3aed",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    marginTop: "0.1rem",
  },
} as const;
