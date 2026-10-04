import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { DATAVAULT_ABI, CONTRACT_ADDRESS } from "@/lib/contract";
import { encodeFunctionData, parseEther } from "viem";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Signs the upload message so the Worker can verify ownership without trusting a header.
// Message format mirrors policy.ts verifyUploadSignature.
async function signUpload(
  walletClient: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  collectionId: string,
  content: string,
): Promise<{ signature: string; timestamp: number; contentHash: string }> {
  const timestamp = Date.now();
  const contentHash = await sha256Hex(content);
  const message = `datavault-upload:${collectionId}:${contentHash}:${timestamp}`;
  const signature = await walletClient.signMessage({ message });
  return { signature, timestamp, contentHash };
}

type Status = "idle" | "loading" | "success" | "error";

interface PolicyState {
  collectionId: string;
  price: string;
  active: boolean;
  policyVersion: number;
}

export default function OwnerDashboard() {
  const { primaryWallet } = useDynamicContext();
  const [file, setFile] = useState<File | null>(null);
  const [priceEth, setPriceEth] = useState("0.001");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [pausing, setPausing] = useState(false);

  const contractReady = Boolean(CONTRACT_ADDRESS);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!primaryWallet || !file) return;
    setStatus("loading");
    setMessage("Uploading collection...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("priceWei", parseEther(priceEth).toString());
      formData.append("ownerAddress", primaryWallet.address);

      const res = await fetch("/api/collections", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { collectionId, txCalldata } = (await res.json()) as { collectionId: string; txCalldata: string };

      setMessage("Sign the registration transaction in your wallet...");

      if (!contractReady) throw new Error("CONTRACT_ADDRESS not set. Deploy the contract first.");

      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const txHash = await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS!,
        data: txCalldata as `0x${string}`,
      });

      setMessage("Confirming registration with the server...");

      // Tell the Worker the tx hash so it can verify on-chain ownership and activate the collection.
      const confirmRes = await fetch(`/api/collections/${collectionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, ownerAddress: primaryWallet.address }),
      });
      if (!confirmRes.ok) throw new Error(await confirmRes.text());

      setPolicy({ collectionId, price: priceEth, active: true, policyVersion: 1 });
      setStatus("success");
      setMessage(`Registered and confirmed. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReupload() {
    if (!primaryWallet || !file || !policy) return;
    setStatus("loading");
    setMessage("Signing upload...");
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const content = await file.text();
      const { signature, timestamp } = await signUpload(walletClient, policy.collectionId, content);
      const res = await fetch(`/api/collections/${policy.collectionId}/upload`, {
        method: "POST",
        body: content,
        headers: { "Content-Type": "text/markdown", "x-signature": signature, "x-timestamp": String(timestamp) },
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("success");
      setMessage("Collection content updated.");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTogglePause() {
    if (!primaryWallet || !policy || !contractReady) return;
    setPausing(true);
    try {
      const newActive = !policy.active;
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "updatePolicy",
        args: [policy.collectionId as `0x${string}`, parseEther(policy.price), newActive],
      });
      await walletClient.sendTransaction({
        to: CONTRACT_ADDRESS!,
        data,
      });
      setPolicy({ ...policy, active: newActive, policyVersion: policy.policyVersion + 1 });
    } finally {
      setPausing(false);
    }
  }

  return (
    <div>
      <h2>Register a Knowledge Collection</h2>
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        Your Markdown document will be stored privately. Selected passages are sent to the AI model
        provider to answer queries. Buyers are informed of this before purchase.
      </p>

      {!contractReady && (
        <div style={styles.warning}>
          Contract address not configured. Deploy the contract and set VITE_CONTRACT_ADDRESS.
        </div>
      )}

      <form onSubmit={handleRegister} style={styles.form}>
        <label style={styles.label}>
          Knowledge collection (Markdown file)
          <input
            type="file"
            accept=".md,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Price per query (MON)
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={priceEth}
            onChange={(e) => setPriceEth(e.target.value)}
            required
            style={styles.input}
          />
        </label>

        <button type="submit" disabled={status === "loading" || !file} style={styles.button}>
          {status === "loading" ? "Working..." : "Register Collection"}
        </button>
      </form>

      {message && (
        <div style={status === "error" ? styles.error : styles.success}>
          {message}
        </div>
      )}

      {policy && (
        <div style={styles.policyCard}>
          <strong>Active collection</strong>
          <div style={{ fontFamily: "monospace", fontSize: "0.8rem", marginTop: 4 }}>
            ID: {policy.collectionId}
          </div>
          <div>Status: {policy.active ? "Active" : "Paused"} (policy v{policy.policyVersion})</div>
          <div>Price: {policy.price} MON per query</div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={handleTogglePause}
              disabled={pausing}
              style={{ ...styles.button, background: policy.active ? "#ef4444" : "#22c55e" }}
            >
              {pausing ? "Signing..." : policy.active ? "Pause Access" : "Resume Access"}
            </button>
            {file && (
              <button
                onClick={handleReupload}
                disabled={status === "loading"}
                style={{ ...styles.button, background: "#64748b" }}
              >
                Update Content (signed)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem", maxWidth: 480, marginTop: "1.5rem" },
  label: { display: "flex", flexDirection: "column" as const, gap: "0.35rem", fontSize: "0.9rem", fontWeight: 500 },
  input: { border: "1px solid #d1d5db", borderRadius: 6, padding: "0.5rem 0.75rem", fontSize: "0.9rem" },
  button: { padding: "0.6rem 1.25rem", borderRadius: 6, background: "#6366f1", color: "white", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" },
  warning: { background: "#fef3c7", border: "1px solid #fbbf24", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginBottom: "1rem" },
  success: { background: "#f0fdf4", border: "1px solid #86efac", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginTop: "1rem", fontFamily: "monospace" },
  error: { background: "#fef2f2", border: "1px solid #fca5a5", padding: "0.75rem 1rem", borderRadius: 6, fontSize: "0.875rem", marginTop: "1rem" },
  policyCard: { background: "#f8fafc", border: "1px solid #e2e8f0", padding: "1rem", borderRadius: 8, marginTop: "1.5rem", maxWidth: 480 },
} as const;
