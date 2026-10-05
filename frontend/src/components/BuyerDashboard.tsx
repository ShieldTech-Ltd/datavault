import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
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
  question: string;
  openTxHash: string;
  buyerAddress: string;
  openedAt: number;
  outcome: string;
}
interface DisplayAnswer {
  answer: string;
  citedPassageIds: string[];
  citedPassages: CitedPassage[];
  requestId: string;
  openTxHash: string;
  settleTxHash: string | null;
}

function history(): SavedRequest[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value as SavedRequest[] : [];
  } catch { return []; }
}
function save(request: SavedRequest): SavedRequest[] {
  const next = [request, ...history().filter((item) => item.requestId !== request.requestId)].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function BuyerDashboard() {
  const { primaryWallet } = useDynamicContext();
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
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new Error("Connect an EVM wallet first.");
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
      request = { requestId, collectionId: quote.collectionId, question, openTxHash,
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
        setMessage("Settlement was broadcast and is awaiting confirmation. Your answer remains private until payment settles.");
        return;
      }
      if (result.outcome !== "settled" || !result.answer) throw new Error("Unexpected query result.");
      setAnswer({ answer: result.answer, citedPassageIds: result.citedPassageIds ?? [],
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
      setAnswer({ answer: result.answer, citedPassageIds: result.citedPassageIds,
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
      else setMessage("Settlement is still pending. Check again shortly or claim a refund after the timeout if the escrow remains open.");
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
  return <div style={{ maxWidth: 720 }}>
    <h2>Ask a Question</h2>
    <p>Pay a fixed testnet MON price to ask about a private collection. Selected passages go to the model provider. A failed, unsettled payment can be refunded after ten minutes.</p>
    {demo && <section style={box}>
      <strong>Try the UK Practical Guide</strong> <span>Team-authored sample</span>
      <p>Owner: {demo.ownerAddress}<br />Price: {formatEther(BigInt(demo.priceWei))} test MON</p>
      {SAMPLE_QUESTIONS.map((sample) => <button key={sample} type="button" style={smallButton}
        onClick={() => { changeCollection(demo.collectionId); changeQuestion(sample); }}>
        {sample}
      </button>)}
    </section>}
    <form onSubmit={prepare} style={{ display: "grid", gap: 12 }}>
      <label>Collection ID<input style={field} value={collectionId} onChange={(event) => changeCollection(event.target.value)} required disabled={busy} /></label>
      <label>Question<textarea style={field} rows={3} value={question} onChange={(event) => changeQuestion(event.target.value)} required maxLength={500} disabled={busy} /></label>
      <button type="submit" disabled={busy || !CONTRACT_ADDRESS} style={button}>Get current price</button>
    </form>
    {quote && step === "quoted" && <section style={box}>
      <strong>{quote.collectionName}</strong><p>Price: {quote.priceDisplay} test MON</p>
      <p>Your wallet will open escrow. The Worker will verify payment and current policy before private retrieval.</p>
      <p>An honest answer that says the document lacks enough information is still a paid query. A service failure that leaves escrow open is refundable after ten minutes.</p>
      <button type="button" onClick={execute} style={button}>Sign and pay</button>
    </section>}
    {step === "awaiting_wallet" && <p>Check your wallet for the opening transaction.</p>}
    {step === "confirming_open" && <p>Opening transaction sent. Waiting for chain confirmation.</p>}
    {step === "answering" && <p>Payment confirmed. Retrieving passages, generating an answer, and settling.</p>}
    {step === "settlement_pending" && <button type="button" onClick={reconcile} style={button}>Check settlement</button>}
    {message && <p role="status" style={{ color: step === "failed" ? "#b91c1c" : "#374151", overflowWrap: "anywhere" }}>{message}</p>}
    {answer && <section style={box}>
      <h3>Cited answer</h3><p style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</p>
      {answer.citedPassageIds.map((id) => {
        const passage = answer.citedPassages.find((item) => item.id === id);
        return <details key={id}><summary>{id}</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{passage?.text ?? "Passage text is available only in the original answer response."}</p>
        </details>;
      })}
      <p>Open transaction: {answer.openTxHash}<br />Settlement transaction: {answer.settleTxHash}</p>
      <a href={`/api/queries/${answer.requestId}/receipt`} target="_blank" rel="noreferrer">View public receipt</a>
    </section>}
    {current && refundAt !== null && step !== "done" && <section style={box}>
      <p>{now < refundAt ? `Refund available in ${Math.ceil((refundAt - now) / 1000)} seconds if escrow remains open.` : "Refund timeout reached. Check settlement before refunding."}</p>
      <button type="button" disabled={now < refundAt} onClick={refund} style={button}>Claim expired refund</button>
    </section>}
    {requests.length > 0 && <section style={box}><h3>Your recent requests</h3>
      {requests.map((request) => <div key={request.requestId} style={{ marginBottom: 12, overflowWrap: "anywhere" }}>
        <strong>{request.outcome}</strong> {request.question}<br />
        <button type="button" onClick={() => recover(request)} style={smallButton}>Recover answer</button>
        <button type="button" onClick={async () => { setCurrent(request); await loadRefundTime(request); setStep("settlement_pending"); }} style={smallButton}>Check or refund</button>
      </div>)}
    </section>}
  </div>;
}

const box: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: 8, marginTop: 4 };
const button: React.CSSProperties = { padding: "10px 16px", background: "#4f46e5", color: "white", border: 0, borderRadius: 6, cursor: "pointer" };
const smallButton: React.CSSProperties = { padding: "6px 10px", margin: "6px 8px 0 0", border: "1px solid #a5b4fc", background: "white", borderRadius: 6, cursor: "pointer" };
