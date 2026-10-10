import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { encodeFunctionData, formatEther, keccak256, toBytes } from "viem";
import { DATAVAULT_ABI, CONTRACT_ADDRESS, viemClient } from "@/lib/contract";
import { executionMessage, type CitedPassage, type QueryResult, type RecoveredAnswer } from "../../../shared/api";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
const HISTORY_KEY = "datavault_requests";
const SAMPLE_QUESTIONS = [
  "What information should a freelancer include on an invoice?",
  "Why might a sole trader use a separate business bank account?",
  "What records should a freelancer keep for business expenses?",
];

type Step = "idle" | "quoting" | "quoted" | "awaiting_wallet" | "confirming_open" |
  "answering" | "settlement_pending" | "done" | "failed";
interface Quote { collectionId: string; collectionName: string; priceWei: string; priceDisplay: string }
interface Demo { collectionId: string; collectionName: string; ownerAddress: string; priceWei: string }
interface SavedRequest {
  requestId: string;
  collectionId: string;
  openTxHash: string;
  buyerAddress: string;
  openedAt: number;
  outcome: string;
}
interface DisplayAnswer {
  answer: string;
  buyerAddress: string;
  citedPassageIds: string[];
  citedPassages: CitedPassage[];
  requestId: string;
  openTxHash: string;
  settleTxHash: string | null;
}

function history(): SavedRequest[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    const bytes32 = /^0x[0-9a-fA-F]{64}$/;
    const address = /^0x[0-9a-fA-F]{40}$/;
    const safe = value.flatMap((item): SavedRequest[] => {
      if (!item || typeof item !== "object" || !bytes32.test(item.requestId) ||
          !bytes32.test(item.collectionId) || !bytes32.test(item.openTxHash) ||
          !address.test(item.buyerAddress)) return [];
      return [{ requestId: item.requestId, collectionId: item.collectionId,
        openTxHash: item.openTxHash, buyerAddress: item.buyerAddress,
        openedAt: Number(item.openedAt) || 0, outcome: String(item.outcome ?? "unknown") }];
    }).slice(0, 20);
    if (JSON.stringify(safe) !== JSON.stringify(value)) localStorage.setItem(HISTORY_KEY, JSON.stringify(safe));
    return safe;
  } catch { return []; }
}
function save(request: SavedRequest): SavedRequest[] {
  const next = [request, ...history().filter((item) => item.requestId !== request.requestId)].slice(0, 20);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  return next;
}
async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const FLOW_STEPS = [
  { key: "quoting",         short: "Price",    label: "Fetching price" },
  { key: "awaiting_wallet", short: "Sign",     label: "Sign transaction" },
  { key: "confirming_open", short: "Confirm",  label: "On-chain confirmation" },
  { key: "answering",       short: "Answer",   label: "Generating answer" },
  { key: "done",            short: "Done",     label: "Complete" },
];

function FlowProgress({ step }: { step: Step }) {
  const idx = FLOW_STEPS.findIndex((s) => s.key === step);
  if (idx < 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "1.25rem 0 0.5rem", gap: 0 }} role="progressbar" aria-label="Query progress">
      {FLOW_STEPS.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < FLOW_STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.68rem", fontWeight: 700, flexShrink: 0,
                background: done ? "var(--green)" : current ? "var(--accent)" : "var(--surface-3)",
                color: (done || current) ? "white" : "var(--text-3)",
                boxShadow: current ? "0 0 0 3px var(--accent-bg)" : undefined,
                transition: "all 0.25s",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: "0.62rem", fontWeight: current ? 700 : 400, color: current ? "var(--accent)" : done ? "var(--green-text)" : "var(--text-3)", whiteSpace: "nowrap" }}>
                {s.short}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < idx ? "var(--green)" : "var(--border)", margin: "0 4px", marginBottom: 20, transition: "background 0.3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function outcomeColor(outcome: string): string {
  if (outcome === "settled") return "var(--green)";
  if (outcome === "failed" || outcome === "refunded") return "var(--red)";
  if (outcome === "settlement_pending") return "var(--yellow)";
  return "var(--text-3)";
}
function outcomeLabel(outcome: string): string {
  if (outcome === "settled") return "✓ Settled";
  if (outcome === "failed") return "✗ Failed";
  if (outcome === "refunded") return "↩ Refunded";
  if (outcome === "settlement_pending") return "⏳ Pending";
  if (outcome === "open_pending") return "⏳ Opening";
  return outcome;
}

export default function BuyerDashboard() {
  const { primaryWallet } = useWallet();
  const address = primaryWallet?.address ?? "";
  const [demo, setDemo] = useState<Demo | null>(null);
  const [collectionId, setCollectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<DisplayAnswer | null>(null);
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [current, setCurrent] = useState<SavedRequest | null>(null);
  const [refundAt, setRefundAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setRequests(history().filter((item) => item.buyerAddress.toLowerCase() === address.toLowerCase()));
    setCurrent(null); setAnswer(null); setQuote(null); setRefundAt(null); setStep("idle"); setMessage("");
    fetch("/api/demo").then((response) => response.ok ? response.json() as Promise<Demo> : null)
      .then((item) => setDemo(item)).catch(() => setDemo(null));
  }, [address]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function remember(request: SavedRequest) {
    setCurrent(request);
    setRequests(save(request).filter((item) => item.buyerAddress.toLowerCase() === address.toLowerCase()));
  }
  function changeCollection(value: string) { setCollectionId(value); setQuote(null); setStep("idle"); }
  function changeQuestion(value: string) { setQuestion(value); setQuote(null); setStep("idle"); }

  async function wallet() {
    if (!primaryWallet) throw new Error("Connect an EVM wallet first.");
    const client = await primaryWallet.getWalletClient();
    if (await client.getChainId() !== CHAIN_ID) throw new Error(`Switch your wallet to Monad testnet (${CHAIN_ID}).`);
    return client;
  }
  async function signedHeaders(prefix: string, requestId: string) {
    const client = await wallet();
    const timestamp = Date.now();
    const signature = await client.signMessage({ message: `${prefix}:${requestId}:${timestamp}` });
    return { "x-signature": signature, "x-timestamp": String(timestamp) };
  }
  async function loadRefundTime(request: SavedRequest) {
    if (!CONTRACT_ADDRESS) return;
    try {
      const query = await viemClient.readContract({
        address: CONTRACT_ADDRESS, abi: DATAVAULT_ABI, functionName: "getQuery",
        args: [request.requestId as `0x${string}`],
      }) as [`0x${string}`, string, bigint, number, bigint, number];
      setRefundAt(query[5] === 0 ? Number(query[4]) * 1000 + 600_000 : null);
    } catch { setRefundAt(null); }
  }

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    setStep("quoting"); setMessage(""); setAnswer(null);
    try {
      const response = await fetch("/api/queries/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, question }),
      });
      if (!response.ok) throw new Error(await response.text());
      setQuote(await response.json() as Quote);
      setStep("quoted");
    } catch (error) { setMessage(String(error)); setStep("idle"); }
  }

  async function execute() {
    if (!quote || !CONTRACT_ADDRESS) return;
    setMessage(""); setStep("awaiting_wallet");
    let request: SavedRequest | null = null;
    try {
      const client = await wallet();
      const requestId = keccak256(toBytes(`${address}:${Date.now()}:${crypto.randomUUID()}`));
      const data = encodeFunctionData({ abi: DATAVAULT_ABI, functionName: "openQuery",
        args: [requestId, quote.collectionId as `0x${string}`] });
      const openTxHash = await client.sendTransaction({
        to: CONTRACT_ADDRESS, data, value: BigInt(quote.priceWei),
      });
      request = { requestId, collectionId: quote.collectionId, openTxHash,
        buyerAddress: address, openedAt: Date.now(), outcome: "open_pending" };
      remember(request);
      setStep("confirming_open");
      const receipt = await viemClient.waitForTransactionReceipt({ hash: openTxHash });
      if (receipt.status !== "success") throw new Error("Opening transaction reverted. No payment was escrowed.");
      await loadRefundTime(request);
      const timestamp = Date.now();
      const signature = await client.signMessage({ message: executionMessage(
        CHAIN_ID, CONTRACT_ADDRESS, requestId, quote.collectionId,
        await sha256Hex(question), openTxHash, timestamp,
      ) });
      setStep("answering");
      const response = await fetch("/api/queries/execute", {
        method: "POST", headers: { "Content-Type": "application/json", "x-signature": signature,
          "x-timestamp": String(timestamp) },
        body: JSON.stringify({ requestId, collectionId: quote.collectionId, question, openTxHash }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as QueryResult;
      if (result.outcome === "settlement_pending") {
        remember({ ...request, outcome: "settlement_pending" });
        setStep("settlement_pending");
        setMessage(result.settleTxHash
          ? "Settlement confirmation is uncertain. Check the chain status before retrying. Your answer remains private until confirmed."
          : "Settlement broadcast is uncertain. Check chain status before retrying. If escrow stays open, you can refund after timeout.");
        return;
      }
      if (result.outcome !== "settled" || !result.answer) throw new Error("Unexpected query result.");
      setAnswer({ answer: result.answer, buyerAddress: request.buyerAddress,
        citedPassageIds: result.citedPassageIds ?? [],
        citedPassages: result.citedPassages ?? [], requestId, openTxHash,
        settleTxHash: result.settleTxHash });
      remember({ ...request, outcome: "settled" });
      setStep("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStep("failed");
      if (request) { remember({ ...request, outcome: "failed" }); await loadRefundTime(request); }
    }
  }

  async function recover(request: SavedRequest) {
    setCurrent(request); setMessage(""); setAnswer(null);
    await loadRefundTime(request);
    try {
      const response = await fetch(`/api/queries/${request.requestId}/answer`, {
        headers: await signedHeaders("datavault-answer", request.requestId),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as RecoveredAnswer;
      setAnswer({ answer: result.answer, buyerAddress: request.buyerAddress,
        citedPassageIds: result.citedPassageIds,
        citedPassages: result.citedPassages ?? [], requestId: request.requestId, openTxHash: request.openTxHash,
        settleTxHash: result.settleTxHash });
      remember({ ...request, outcome: "settled" }); setStep("done");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); setStep("failed"); }
  }

  async function reconcile() {
    if (!current) return;
    setMessage("");
    try {
      const response = await fetch(`/api/queries/${current.requestId}/reconcile`, {
        method: "POST", headers: await signedHeaders("datavault-reconcile", current.requestId),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { outcome: string };
      if (result.outcome === "settled") await recover(current);
      else setMessage("Settlement still pending. Check again shortly or claim a refund after the timeout if escrow remains open.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  async function refund() {
    if (!current || !CONTRACT_ADDRESS || refundAt === null || now < refundAt) return;
    setMessage("");
    try {
      const client = await wallet();
      const data = encodeFunctionData({ abi: DATAVAULT_ABI, functionName: "refundExpired",
        args: [current.requestId as `0x${string}`] });
      const hash = await client.sendTransaction({ to: CONTRACT_ADDRESS, data });
      const receipt = await viemClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Refund transaction reverted.");
      remember({ ...current, outcome: "refunded" }); setRefundAt(null); setStep("idle");
      setMessage(`Refund confirmed. Transaction: ${hash}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  const busy = ["quoting", "awaiting_wallet", "confirming_open", "answering"].includes(step);
  const visibleRequests = requests.filter((item) => item.buyerAddress.toLowerCase() === address.toLowerCase());

  return (
    <div style={{ maxWidth: 680 }} className="animate-fadeIn">
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Ask a Question
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.6 }}>
          Pay a fixed testnet MON price to query a private collection. Selected passages go to the model provider.
          A failed unsettled payment can be refunded after ten minutes.
        </p>
      </div>

      {/* Demo collection card */}
      {demo && (
        <div style={bd.demoCard} className="animate-fadeIn">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "1.1rem" }} aria-hidden="true">🧪</span>
            <div>
              <strong style={{ fontSize: "0.875rem", color: "var(--text)" }}>Try the UK Practical Guide</strong>
              <span style={bd.demoBadge}>Team-authored sample</span>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Price</div>
              <strong style={{ fontSize: "0.875rem", color: "var(--accent)" }}>{formatEther(BigInt(demo.priceWei))} MON</strong>
            </div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)", fontFamily: "monospace", marginBottom: "0.75rem", wordBreak: "break-all" }}>
            Owner: {demo.ownerAddress}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {SAMPLE_QUESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                style={bd.sampleBtn}
                onClick={() => { changeCollection(demo.collectionId); changeQuestion(sample); }}
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Query form */}
      <form onSubmit={prepare} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <label style={bd.fieldLabel} htmlFor="collection-id">Collection ID</label>
          <input
            id="collection-id"
            style={bd.field}
            value={collectionId}
            onChange={(e) => changeCollection(e.target.value)}
            required
            disabled={busy}
            placeholder="0x..."
            spellCheck={false}
          />
        </div>
        <div>
          <label style={bd.fieldLabel} htmlFor="question-input">Your question</label>
          <textarea
            id="question-input"
            style={{ ...bd.field, resize: "vertical", minHeight: 90, fontFamily: "inherit" }}
            rows={3}
            value={question}
            onChange={(e) => changeQuestion(e.target.value)}
            required
            maxLength={500}
            disabled={busy}
            placeholder="What would you like to know?"
          />
          <div style={{ fontSize: "0.7rem", color: "var(--text-3)", textAlign: "right", marginTop: 4 }}>
            {question.length}/500
          </div>
        </div>
        <button type="submit" disabled={busy || !CONTRACT_ADDRESS} style={busy || !CONTRACT_ADDRESS ? bd.btnDisabled : bd.btnPrimary}>
          {step === "quoting" ? (
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
              <span className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
              Fetching price...
            </span>
          ) : "Get Current Price"}
        </button>
      </form>

      {/* Flow progress */}
      {busy && <FlowProgress step={step} />}

      {/* Status steps */}
      {step === "awaiting_wallet" && <div style={bd.statusNote}>👛 Check your wallet for the opening transaction prompt.</div>}
      {step === "confirming_open" && <div style={bd.statusNote}>⛓ Opening transaction sent — waiting for chain confirmation.</div>}
      {step === "answering" && <div style={bd.statusNote}>🤖 Payment confirmed. Retrieving passages and generating your answer...</div>}

      {/* Quote card */}
      {quote && step === "quoted" && (
        <div style={bd.card} className="animate-fadeIn">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong style={{ fontSize: "0.9rem", color: "var(--text)" }}>{quote.collectionName}</strong>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>Price</div>
              <strong style={{ color: "var(--accent)", fontSize: "1rem" }}>{quote.priceDisplay} MON</strong>
            </div>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
            Your wallet will open escrow on-chain. The Worker verifies payment and current policy before private retrieval.
            An honest answer that says the document lacks information is still a paid query. A service failure that leaves
            escrow open is refundable after ten minutes.
          </p>
          <button type="button" onClick={execute} style={bd.btnPrimary}>
            Sign and Pay {quote.priceDisplay} MON
          </button>
        </div>
      )}

      {/* Settlement pending */}
      {step === "settlement_pending" && (
        <div style={{ ...bd.card, borderColor: "rgba(217,119,6,0.3)", background: "var(--yellow-bg)" }} className="animate-fadeIn">
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--yellow)", marginBottom: "0.5rem" }}>⏳ Settlement Pending</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.6, marginBottom: "0.75rem" }}>{message}</p>
          <button type="button" onClick={reconcile} style={bd.btnWarning}>Check Settlement Status</button>
        </div>
      )}

      {/* Error / message */}
      {message && step !== "settlement_pending" && (
        <div style={step === "failed" ? bd.alertRed : bd.alertGreen} className="animate-fadeIn" role="status">
          <span aria-hidden="true">{step === "failed" ? "❌" : "✅"}</span>
          <span style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{message}</span>
        </div>
      )}

      {/* Answer card */}
      {answer && answer.buyerAddress.toLowerCase() === address.toLowerCase() && (
        <div style={bd.answerCard} className="animate-fadeIn">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: "1.1rem" }} aria-hidden="true">✨</span>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>Cited Answer</h3>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: "1rem" }}>
            {answer.answer}
          </p>

          {answer.citedPassageIds.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
                Citations ({answer.citedPassageIds.length})
              </div>
              {answer.citedPassageIds.map((id) => {
                const passage = answer.citedPassages.find((item) => item.id === id);
                return (
                  <details key={id} style={bd.citationBox}>
                    <summary style={{ cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)", userSelect: "none" }}>
                      {id.length > 40 ? id.slice(0, 40) + "…" : id}
                    </summary>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.6, marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
                      {passage?.text ?? "Passage text is available only in the original answer response."}
                    </p>
                  </details>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginBottom: 2 }}>Open TX</div>
              <code style={{ fontSize: "0.7rem", color: "var(--text-2)", wordBreak: "break-all" }}>{answer.openTxHash}</code>
            </div>
            {answer.settleTxHash && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginBottom: 2 }}>Settlement TX</div>
                <code style={{ fontSize: "0.7rem", color: "var(--text-2)", wordBreak: "break-all" }}>{answer.settleTxHash}</code>
              </div>
            )}
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <a href={`/api/queries/${answer.requestId}/receipt`} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
              View public receipt →
            </a>
          </div>
        </div>
      )}

      {/* Refund section */}
      {current && current.buyerAddress.toLowerCase() === address.toLowerCase() && refundAt !== null && step !== "done" && (
        <div style={{ ...bd.card, borderColor: "rgba(217,119,6,0.3)" }} className="animate-fadeIn">
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--yellow)", marginBottom: "0.5rem" }}>⏰ Refund Window</div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
            {now < refundAt
              ? `Refund available in ${Math.ceil((refundAt - now) / 1000)} seconds if escrow remains open.`
              : "Refund timeout reached. Verify settlement status before claiming a refund."}
          </p>
          <button type="button" disabled={now < refundAt} onClick={refund} style={now < refundAt ? bd.btnDisabled : bd.btnWarning}>
            Claim Expired Refund
          </button>
        </div>
      )}

      {/* History */}
      {visibleRequests.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
            Recent Requests
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {visibleRequests.map((request) => (
              <div key={request.requestId} style={bd.historyItem}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: outcomeColor(request.outcome), whiteSpace: "nowrap" }}>
                    {outcomeLabel(request.outcome)}
                  </span>
                  <code style={{ fontSize: "0.72rem", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {request.requestId.slice(0, 14)}…
                  </code>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                  <button type="button" onClick={() => void recover(request)} style={bd.historyBtn}>
                    Recover
                  </button>
                  <button type="button" onClick={async () => { setCurrent(request); await loadRefundTime(request); setStep("settlement_pending"); }} style={bd.historyBtn}>
                    Check / Refund
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const bd = {
  fieldLabel: { display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.375rem" } as React.CSSProperties,
  field: { display: "block", width: "100%", boxSizing: "border-box" as const, padding: "0.6rem 0.75rem", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", color: "var(--text)", fontSize: "0.875rem", outline: "none" } as React.CSSProperties,
  btnPrimary: { display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", padding: "0.65rem 1.25rem", background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white", border: "none", borderRadius: 9, cursor: "pointer", fontWeight: 700, fontSize: "0.875rem", width: "100%", boxShadow: "0 2px 8px rgba(124,58,237,0.3)" } as React.CSSProperties,
  btnDisabled: { display: "flex", alignItems: "center", justifyContent: "center", padding: "0.65rem 1.25rem", background: "var(--surface-3)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 9, cursor: "not-allowed", fontWeight: 600, fontSize: "0.875rem", width: "100%" } as React.CSSProperties,
  btnWarning: { padding: "0.55rem 1.1rem", background: "var(--yellow-bg)", color: "var(--yellow)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" } as React.CSSProperties,
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem", margin: "1rem 0", boxShadow: "var(--shadow)" } as React.CSSProperties,
  demoCard: { background: "linear-gradient(135deg, var(--accent-bg), rgba(99,102,241,0.06))", border: "1px solid var(--accent-bdr)", borderRadius: 12, padding: "1.25rem", margin: "0 0 1.25rem" } as React.CSSProperties,
  demoBadge: { marginLeft: "0.5rem", fontSize: "0.65rem", fontWeight: 700, background: "var(--accent-bg)", color: "var(--accent)", borderRadius: 4, padding: "1px 6px", border: "1px solid var(--accent-bdr)" } as React.CSSProperties,
  sampleBtn: { padding: "0.35rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, cursor: "pointer", fontSize: "0.75rem", color: "var(--text-2)", transition: "all 0.15s" } as React.CSSProperties,
  statusNote: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "0.6rem 0.875rem", marginBottom: "0.5rem" } as React.CSSProperties,
  answerCard: { background: "var(--surface)", border: "1px solid var(--green)", borderRadius: 12, padding: "1.25rem", margin: "1rem 0", boxShadow: "0 0 0 3px var(--green-bg)" } as React.CSSProperties,
  citationBox: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.6rem 0.875rem", marginBottom: "0.4rem" } as React.CSSProperties,
  alertRed: { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.875rem 1rem", borderRadius: 9, background: "var(--red-bg)", border: "1px solid rgba(220,38,38,0.25)", fontSize: "0.82rem", color: "var(--red)", marginTop: "0.5rem" } as React.CSSProperties,
  alertGreen: { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.875rem 1rem", borderRadius: 9, background: "var(--green-bg)", border: "1px solid rgba(22,163,74,0.25)", fontSize: "0.82rem", color: "var(--green-text)", marginTop: "0.5rem" } as React.CSSProperties,
  historyItem: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.625rem 0.875rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "var(--shadow)" } as React.CSSProperties,
  historyBtn: { padding: "0.3rem 0.65rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", fontSize: "0.72rem", color: "var(--text-2)", fontWeight: 500, whiteSpace: "nowrap" as const } as React.CSSProperties,
} as const;
