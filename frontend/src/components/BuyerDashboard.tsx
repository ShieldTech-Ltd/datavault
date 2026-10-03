import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import { encodeFunctionData, parseAbi, keccak256, toBytes } from "viem";

interface Quote {
  collectionId: string;
  priceWei: string;
  priceDisplay: string;
  collectionName: string;
}

interface Answer {
  answer: string;
  passages: string[];
  requestId: string;
  txHash: string;
  receiptUrl: string;
}

export default function BuyerDashboard() {
  const { primaryWallet } = useDynamicContext();
  const [collectionId, setCollectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const contractReady = Boolean(CONTRACT_ADDRESS);

  async function handlePrepare(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!primaryWallet || !quote) return;
    setLoading(true);
    setError("");

    try {
      if (!contractReady) throw new Error("Contract address not configured.");

      const requestId = keccak256(toBytes(`${primaryWallet.address}-${Date.now()}`));

      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const openQueryAbi = parseAbi(["function openQuery(bytes32 requestId, bytes32 collectionId) external payable"]);
      const data = encodeFunctionData({
        abi: openQueryAbi,
        functionName: "openQuery",
        args: [requestId, quote.collectionId as `0x${string}`],
      });

      const txHash = await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS!,
        data,
        value: BigInt(quote.priceWei),
      });

      const res = await fetch("/api/queries/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          collectionId: quote.collectionId,
          question,
          txHash,
          buyerAddress: primaryWallet.address,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as Answer;
      setAnswer(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Ask a Question</h2>
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        Payment is placed in escrow. You receive a cited answer drawn from the owner's knowledge collection.
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
            onChange={(e) => setCollectionId(e.target.value)}
            required
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Your question
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            placeholder="What are the National Insurance thresholds for self-employed workers in the UK?"
            style={{ ...styles.input, resize: "vertical" }}
          />
        </label>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading && !quote ? "Getting quote..." : "Get Quote"}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      {quote && !answer && (
        <div style={styles.quoteCard}>
          <strong>{quote.collectionName}</strong>
          <div style={{ marginTop: "0.5rem" }}>Price: <strong>{quote.priceDisplay} MON</strong></div>
          <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            Signing places this amount in escrow on Monad. Payment releases to the owner after
            your answer is delivered. If delivery fails, you can reclaim the payment after 10 minutes.
          </p>
          <button onClick={handleExecute} disabled={loading} style={styles.button}>
            {loading ? "Waiting for signature and answer..." : `Sign and Pay ${quote.priceDisplay} MON`}
          </button>
        </div>
      )}

      {answer && (
        <div style={styles.answerCard}>
          <strong>Answer</strong>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.6 }}>{answer.answer}</p>
          {answer.passages.length > 0 && (
            <>
              <strong style={{ fontSize: "0.85rem" }}>Source passages</strong>
              <ul style={{ fontSize: "0.8rem", color: "#374151", paddingLeft: "1.25rem" }}>
                {answer.passages.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.75rem", fontFamily: "monospace" }}>
            Request: {answer.requestId}<br />
            Tx: {answer.txHash}<br />
            <a href={answer.receiptUrl} style={{ color: "#6366f1" }}>View receipt</a>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem", maxWidth: 560, marginTop: "1.5rem" },
  label: { display: "flex", flexDirection: "column" as const, gap: "0.35rem", fontSize: "0.9rem", fontWeight: 500 },
  input: { border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 0.75rem", fontSize: "0.9rem" },
  button: { padding: "0.6rem 1.25rem", borderRadius: 6, background: "#6366f1", color: "white", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" },
  warning: { background: "#fef3c7", border: "1px solid #fbbf24", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginBottom: "1rem" },
  error: { background: "#fef2f2", border: "1px solid #fca5a5", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginTop: "1rem" },
  quoteCard: { background: "#f0f9ff", border: "1px solid #bae6fd", padding: "1rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 560 },
  answerCard: { background: "#f8fafc", border: "1px solid #e2e8f0", padding: "1.25rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 560 },
} as const;
