import { useState, useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { DATAVAULT_ABI, CONTRACT_ADDRESS } from "@/lib/contract";
import { encodeFunctionData, keccak256, toBytes, formatEther } from "viem";

const MONAD_CHAIN_ID = 10143;
const REFUND_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
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
  const inFlightRef = useRef<{ requestId: string; openTxHash: string; openedAt: number } | null>(null);

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  useEffect(() => {
    setHistory(loadHistory());
  }, [walletAddress]);

  // Refund countdown ticker
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
      setError(`Wrong network. Switch to Monad testnet (chainId ${MONAD_CHAIN_ID}) in your wallet.`);
      return false;
    }
    return true;
  }

  // Invalidate quote when inputs change
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
    if (step === "awaiting_wallet" || step === "answering") return; // block duplicate
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
    if (step === "awaiting_wallet" || step === "answering") return; // block duplicate

    if (!contractReady) {
      setError("Contract address not configured.");
      return;
    }
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
      saveToHistory({
        requestId,
        collectionId: quote.collectionId,
        question,
        openTxHash: txHash,
        buyerAddress: walletAddress,
        openedAt,
        outcome: "pending",
      });
      setHistory(loadHistory());

      setStep("answering");

      const res = await fetch("/api/queries/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          collectionId: quote.collectionId,
          question,
          txHash,
          buyerAddress: walletAddress,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        // Determine if refundable based on time
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

      const result = (await res.json()) as {
        answer: string;
        citedPassageIds: string[];
        requestId: string;
        openTxHash: string;
        settleTxHash: string | null;
        outcome: string;
      };

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
      const res = await fetch(`/api/queries/${req.requestId}/answer?signature=${encodeURIComponent(signature)}&timestamp=${timestamp}&buyerAddress=${walletAddress}`);
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

  const isExecuting = step === "awaiting_wallet" || step === "answering";
  const refundReady = step === "refundable" && (refundCountdown === null || refundCountdown <= 0);

  return (
    <div>
      <h2>Ask a Question</h2>
      <p style={styles.subtext}>
        Payment is placed in escrow on Monad. You receive a cited answer drawn from the owner's knowledge collection.
        The model provider receives the relevant passages to generate the answer.
      </p>

      {!contractReady && (
        <div style={styles.warning}>
          Contract not deployed yet. This is a development preview.
        </div>
      )}

      <form onSubmit={handlePrepare} style={styles.form}>
        <label style={styles.label}>
          Collection ID (bytes32 hex)
          <input
            type="text"
            placeholder="0x..."
            value={collectionId}
            onChange={(e) => handleCollectionIdChange(e.target.value)}
            required
            disabled={isExecuting}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Your question
          <textarea
            rows={3}
            value={question}
            onChange={(e) => handleQuestionChange(e.target.value)}
            required
            disabled={isExecuting}
            placeholder="What are the National Insurance thresholds for self-employed workers in the UK?"
            style={{ ...styles.input, resize: "vertical" as const }}
          />
        </label>

        <button type="submit" disabled={isExecuting || step === "quoting"} style={styles.button}>
          {step === "quoting" ? "Getting quote..." : "Get Quote"}
        </button>
      </form>

      {error && <div style={styles.errorBox}>{error}</div>}

      {quote && step === "quoted" && (
        <div style={styles.quoteCard}>
          <strong>{quote.collectionName}</strong>
          <div style={{ marginTop: "0.5rem" }}>
            Price: <strong>{quote.priceDisplay} MON</strong> ({formatEther(BigInt(quote.priceWei))} MON)
          </div>
          <p style={styles.subtext}>
            Signing places this amount in escrow on Monad. Payment releases to the owner after
            your answer is delivered. If delivery fails, you can reclaim the payment after 10 minutes.
          </p>
          <button onClick={handleExecute} style={styles.button}>
            Sign and Pay {quote.priceDisplay} MON
          </button>
        </div>
      )}

      {step === "awaiting_wallet" && (
        <div style={styles.stateCard}>
          Check your wallet for the payment transaction prompt...
        </div>
      )}

      {step === "answering" && (
        <div style={styles.stateCard}>
          Transaction sent. Waiting for AI answer and settlement...
        </div>
      )}

      {(step === "done" || step === "settlement_pending") && answer && (
        <div style={styles.answerCard}>
          <strong>Answer</strong>
          {step === "settlement_pending" && (
            <div style={styles.pendingNote}>
              Settlement is pending confirmation. Your answer is saved.{" "}
              <button onClick={handleReconcile} disabled={reconciling} style={styles.linkButton}>
                {reconciling ? "Checking..." : "Check settlement status"}
              </button>
            </div>
          )}
          <p style={{ marginTop: "0.75rem", lineHeight: 1.6 }}>{answer.answer}</p>
          {answer.citedPassageIds.length > 0 && (
            <>
              <strong style={{ fontSize: "0.85rem" }}>Cited passages</strong>
              <ul style={styles.citationList}>
                {answer.citedPassageIds.map((id) => (
                  <li key={id} style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{id}</li>
                ))}
              </ul>
            </>
          )}
          <div style={styles.receiptMeta}>
            Request: {answer.requestId}<br />
            Open Tx: {answer.openTxHash}<br />
            {answer.settleTxHash && <>Settle Tx: {answer.settleTxHash}<br /></>}
            Outcome: {answer.outcome}<br />
            <a href={`/api/queries/${answer.requestId}/receipt`} target="_blank" rel="noreferrer" style={{ color: "#6366f1" }}>
              View receipt
            </a>
          </div>
        </div>
      )}

      {(step === "failed" || step === "refundable") && (
        <div style={styles.failedCard}>
          <strong>{step === "refundable" ? "Query failed: refund available" : "Query failed"}</strong>
          <p style={styles.subtext}>
            {step === "refundable"
              ? "The 10-minute escrow window has elapsed. You can now reclaim your payment."
              : "The query could not be completed. You can request a refund after 10 minutes."}
          </p>
          {step === "refundable" && refundCountdown !== null && refundCountdown > 0 && (
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              Refund available in: {Math.ceil(refundCountdown / 1000)}s
            </div>
          )}
          <button
            onClick={handleRefund}
            disabled={refunding || !refundReady}
            style={{ ...styles.button, background: "#ef4444", marginTop: "0.75rem" }}
          >
            {refunding ? "Sending refund..." : "Claim Refund (on-chain)"}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div style={styles.historySection}>
          <strong style={{ fontSize: "0.9rem" }}>Recent queries</strong>
          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column" as const, gap: "0.4rem" }}>
            {history.map((req) => (
              <div key={req.requestId} style={styles.historyRow}>
                <div style={{ fontSize: "0.8rem", color: "#374151", flex: 1 }}>
                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{req.requestId.slice(0, 10)}...</span>
                  {" "}&mdash; {req.question.slice(0, 60)}{req.question.length > 60 ? "..." : ""}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.75rem", color: outcomeColor(req.outcome), fontWeight: 600 }}>
                    {req.outcome}
                  </span>
                  {(req.outcome === "answer_recorded" || req.outcome === "settlement_pending" || req.outcome === "settled") && (
                    <button
                      onClick={() => handleRecoverAnswer(req)}
                      style={styles.miniButton}
                    >
                      Recover answer
                    </button>
                  )}
                  <a
                    href={`/api/queries/${req.requestId}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "0.75rem", color: "#6366f1" }}
                  >
                    Receipt
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function outcomeColor(outcome: string): string {
  if (outcome === "settled") return "#16a34a";
  if (outcome === "failed" || outcome === "refunded") return "#dc2626";
  if (outcome === "refundable") return "#f59e0b";
  return "#6b7280";
}

const styles = {
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem", maxWidth: 560, marginTop: "1.5rem" },
  label: { display: "flex", flexDirection: "column" as const, gap: "0.35rem", fontSize: "0.9rem", fontWeight: 500 },
  input: { border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 0.75rem", fontSize: "0.9rem" },
  button: { padding: "0.6rem 1.25rem", borderRadius: 6, background: "#6366f1", color: "white", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" },
  linkButton: { background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "0.82rem", padding: 0, textDecoration: "underline" },
  miniButton: { padding: "0.2rem 0.5rem", borderRadius: 4, background: "#f3f4f6", border: "1px solid #d1d5db", cursor: "pointer", fontSize: "0.75rem" },
  warning: { background: "#fef3c7", border: "1px solid #fbbf24", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginBottom: "1rem" },
  errorBox: { background: "#fef2f2", border: "1px solid #fca5a5", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginTop: "1rem" },
  quoteCard: { background: "#f0f9ff", border: "1px solid #bae6fd", padding: "1rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 560 },
  answerCard: { background: "#f8fafc", border: "1px solid #e2e8f0", padding: "1.25rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 560 },
  failedCard: { background: "#fef2f2", border: "1px solid #fca5a5", padding: "1rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 560 },
  stateCard: { background: "#f9fafb", border: "1px solid #e5e7eb", padding: "0.75rem 1rem", borderRadius: 6, marginTop: "1rem", fontSize: "0.875rem", color: "#374151" },
  pendingNote: { background: "#fefce8", border: "1px solid #fde047", padding: "0.5rem 0.75rem", borderRadius: 4, fontSize: "0.82rem", marginTop: "0.5rem" },
  citationList: { fontSize: "0.8rem", color: "#374151", paddingLeft: "1.25rem", marginTop: "0.5rem" },
  receiptMeta: { fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.75rem", fontFamily: "monospace", wordBreak: "break-all" as const },
  historySection: { marginTop: "2rem", borderTop: "1px solid #e5e7eb", paddingTop: "1rem", maxWidth: 560 },
  historyRow: { display: "flex", gap: "0.75rem", alignItems: "center", padding: "0.5rem 0.75rem", background: "#f9fafb", borderRadius: 6, border: "1px solid #f3f4f6" },
  subtext: { color: "#6b7280", fontSize: "0.875rem" },
} as const;
