import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { DATAVAULT_ABI, CONTRACT_ADDRESS, viemClient } from "@/lib/contract";
import {
  encodeFunctionData,
  parseEther,
  formatEther,
  keccak256,
  toBytes,
} from "viem";
import { registrationMessage } from "../../../shared/api";

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
const STORAGE_KEY = "datavault_collection_id";

type Step =
  | "idle"
  | "uploading"
  | "awaiting_wallet"
  | "awaiting_confirm"
  | "done"
  | "error";

interface OnChainPolicy {
  collectionId: string;
  price: bigint;
  active: boolean;
  policyVersion: number;
  collectionName: string;
}

export default function OwnerDashboard({
  selectedCollection,
  onForget,
}: {
  selectedCollection?: string | null;
  onForget?: () => void;
}) {
  const { primaryWallet } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [priceEth, setPriceEth] = useState("0.001");
  const [step, setStep] = useState<Step>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [policyTxPending, setPolicyTxPending] = useState(false);

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  // Load saved collection and on-chain state after connect or refresh
  useEffect(() => {
    setPolicy(null);
    setLoadingPolicy(false);
    const savedId = selectedCollection ?? localStorage.getItem(STORAGE_KEY);
    if (!savedId || !walletAddress || !contractReady) return;
    let active = true;
    setLoadingPolicy(true);
    viemClient
      .readContract({
        address: CONTRACT_ADDRESS!,
        abi: DATAVAULT_ABI,
        functionName: "getCollection",
        args: [savedId as `0x${string}`],
      })
      .then((col) => {
        const c = col as [string, string, bigint, number, boolean];
        if (
          active &&
          c[0].toLowerCase() === walletAddress.toLowerCase() &&
          c[2] > 0n
        ) {
          setPolicy({
            collectionId: savedId,
            price: c[2],
            active: c[4],
            policyVersion: c[3],
            collectionName: "",
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [walletAddress, contractReady, selectedCollection]);

  async function checkNetwork(): Promise<boolean> {
    if (!primaryWallet) return false;
    const wc = await primaryWallet.getWalletClient();
    const chainId = await wc.getChainId();
    if (chainId !== MONAD_CHAIN_ID) {
      setStep("error");
      setStatusMsg(
        `Wrong network. Switch to Monad testnet (chainId ${MONAD_CHAIN_ID}) in your wallet.`
      );
      return false;
    }
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!primaryWallet || !file || !disclosureAccepted) return;
    if (!contractReady) {
      setStep("error");
      setStatusMsg(
        "CONTRACT_ADDRESS not configured. Deploy the contract first."
      );
      return;
    }

    setStep("uploading");
    setStatusMsg("Uploading collection to Worker...");

    try {
      if (!(await checkNetwork())) return;
      const walletClient = await primaryWallet.getWalletClient();
      const contentHash = keccak256(toBytes(await file.text()));
      const priceWei = parseEther(priceEth);
      const timestamp = Date.now();
      const signature = await walletClient.signMessage({
        message: registrationMessage(
          MONAD_CHAIN_ID,
          CONTRACT_ADDRESS!,
          walletAddress,
          contentHash,
          priceWei.toString(),
          timestamp
        ),
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("priceWei", priceWei.toString());
      formData.append("ownerAddress", walletAddress);

      const res = await fetch("/api/collections", {
        method: "POST",
        body: formData,
        headers: { "x-signature": signature, "x-timestamp": String(timestamp) },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const { collectionId, txCalldata } = (await res.json()) as {
        collectionId: string;
        txCalldata: string;
      };

      setStep("awaiting_wallet");
      setStatusMsg("Sign the registration transaction in your wallet...");

      let txHash: string;
      try {
        txHash = await walletClient.sendTransaction({
          to: CONTRACT_ADDRESS!,
          data: txCalldata as `0x${string}`,
        });
      } catch (err: unknown) {
        throw new Error(
          "Transaction rejected: " +
            (err instanceof Error ? err.message : String(err))
        );
      }

      setStep("awaiting_confirm");
      setStatusMsg("Waiting for on-chain confirmation...");
      const receipt = await viemClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      if (receipt.status !== "success")
        throw new Error("Registration transaction reverted.");

      const confirmRes = await fetch(
        `/api/collections/${collectionId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash, ownerAddress: walletAddress }),
        }
      );
      if (!confirmRes.ok) {
        const text = await confirmRes.text();
        throw new Error(text);
      }

      localStorage.setItem(STORAGE_KEY, collectionId);
      setPolicy({
        collectionId,
        price: priceWei,
        active: true,
        policyVersion: 1,
        collectionName: file.name.replace(/\.md$/i, ""),
      });
      setStep("done");
      setStatusMsg(`Registered and confirmed. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStep("error");
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleTogglePause() {
    if (!primaryWallet || !policy || !contractReady) return;
    if (!(await checkNetwork())) return;
    setPolicyTxPending(true);
    try {
      const newActive = !policy.active;
      const walletClient = await primaryWallet.getWalletClient();
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "updatePolicy",
        args: [policy.collectionId as `0x${string}`, policy.price, newActive],
      });
      let txHash: string;
      try {
        txHash = await walletClient.sendTransaction({
          to: CONTRACT_ADDRESS!,
          data,
        });
      } catch (err: unknown) {
        throw new Error(
          "Transaction rejected: " +
            (err instanceof Error ? err.message : String(err))
        );
      }
      const receipt = await viemClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      if (receipt.status !== "success")
        throw new Error("Policy transaction reverted.");
      const col = (await viemClient.readContract({
        address: CONTRACT_ADDRESS!,
        abi: DATAVAULT_ABI,
        functionName: "getCollection",
        args: [policy.collectionId as `0x${string}`],
      })) as [string, string, bigint, number, boolean];
      setPolicy({ ...policy, active: col[4], policyVersion: col[3] });
      setStatusMsg(`Policy updated. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStatusMsg(
        "Error: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setPolicyTxPending(false);
    }
  }

  function handleForgetCollection() {
    localStorage.removeItem(STORAGE_KEY);
    onForget?.();
    setPolicy(null);
    setStep("idle");
    setStatusMsg("");
  }

  const isLoading =
    step === "uploading" ||
    step === "awaiting_wallet" ||
    step === "awaiting_confirm";

  return (
    <div>
      <h2>Register a Knowledge Collection</h2>
      <p style={styles.subtext}>
        Your Markdown document will be stored privately. Selected passages are
        sent to the AI model provider only to answer queries. Buyers are
        informed of this before purchase.
      </p>

      {!contractReady && (
        <div style={styles.warning}>
          Contract address not configured. Deploy the contract and set
          VITE_CONTRACT_ADDRESS.
        </div>
      )}

      {loadingPolicy && (
        <div style={styles.info}>Loading your collection from chain...</div>
      )}

      {!policy && !loadingPolicy && (
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
              max="10"
              value={priceEth}
              onChange={(e) => setPriceEth(e.target.value)}
              required
              style={styles.input}
            />
          </label>

          <div style={styles.disclosureBox}>
            <label
              style={{
                display: "flex",
                gap: "0.6rem",
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={disclosureAccepted}
                onChange={(e) => setDisclosureAccepted(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "#374151",
                  lineHeight: 1.5,
                }}
              >
                I understand that passages from my document will be sent to an
                external AI model provider when buyers submit queries. I confirm
                I have the right to share this content under these terms and
                that it does not violate any third-party rights.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !file || !disclosureAccepted}
            style={styles.button}
          >
            {isLoading ? stepLabel(step) : "Register Collection"}
          </button>

          {step === "awaiting_wallet" && (
            <div style={styles.stepNote}>
              Check your wallet for the transaction prompt.
            </div>
          )}
          {step === "awaiting_confirm" && (
            <div style={styles.stepNote}>
              Transaction broadcast. Waiting for Worker to verify on-chain...
            </div>
          )}
        </form>
      )}

      {statusMsg && (
        <div style={step === "error" ? styles.errorBox : styles.successBox}>
          {statusMsg}
        </div>
      )}

      {policy && (
        <div style={styles.policyCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <strong>
              Active collection
              {policy.collectionName ? `: ${policy.collectionName}` : ""}
            </strong>
            <button onClick={handleForgetCollection} style={styles.linkButton}>
              Forget (switch collection)
            </button>
          </div>
          <div style={styles.mono}>ID: {policy.collectionId}</div>
          <div style={{ marginTop: "0.4rem" }}>
            Status: <strong>{policy.active ? "Active" : "Paused"}</strong>{" "}
            (policy v{policy.policyVersion})
          </div>
          <div>
            Price: <strong>{formatEther(policy.price)} MON</strong> per query
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleTogglePause}
              disabled={policyTxPending}
              style={{
                ...styles.button,
                background: policy.active ? "#ef4444" : "#22c55e",
              }}
            >
              {policyTxPending
                ? "Signing..."
                : policy.active
                ? "Pause Access"
                : "Resume Access"}
            </button>
          </div>

          <p
            style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "1rem" }}
          >
            Document replacement is unavailable while policy versioning is being
            completed.
          </p>
        </div>
      )}
    </div>
  );
}

function stepLabel(step: Step): string {
  if (step === "uploading") return "Uploading...";
  if (step === "awaiting_wallet") return "Waiting for signature...";
  if (step === "awaiting_confirm") return "Confirming on-chain...";
  return "Working...";
}

const styles = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    maxWidth: 480,
    marginTop: "1.5rem",
  },
  label: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    fontSize: "0.9rem",
  },
  button: {
    padding: "0.6rem 1.25rem",
    borderRadius: 6,
    background: "#6366f1",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "#6366f1",
    cursor: "pointer",
    fontSize: "0.8rem",
    padding: 0,
    textDecoration: "underline",
  },
  warning: {
    background: "#fef3c7",
    border: "1px solid #fbbf24",
    padding: "0.75rem 1rem",
    borderRadius: 6,
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
  info: {
    background: "#f0f9ff",
    border: "1px solid #bae6fd",
    padding: "0.75rem 1rem",
    borderRadius: 6,
    fontSize: "0.875rem",
    marginBottom: "1rem",
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #86efac",
    padding: "0.75rem 1rem",
    borderRadius: 6,
    fontSize: "0.875rem",
    marginTop: "1rem",
    fontFamily: "monospace",
    wordBreak: "break-all" as const,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fca5a5",
    padding: "0.75rem 1rem",
    borderRadius: 6,
    fontSize: "0.875rem",
    marginTop: "1rem",
  },
  disclosureBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    padding: "0.75rem 1rem",
    borderRadius: 6,
  },
  stepNote: { fontSize: "0.82rem", color: "#6b7280", padding: "0.4rem 0" },
  policyCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: "1rem",
    borderRadius: 8,
    marginTop: "1.5rem",
    maxWidth: 520,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: "0.78rem",
    marginTop: "0.3rem",
    wordBreak: "break-all" as const,
    color: "#374151",
  },
  subtext: { color: "#6b7280", fontSize: "0.875rem" },
} as const;
