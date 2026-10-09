import CollectionEditor from '../production/CollectionEditor';
import { updateCollectionPrice } from '../production/collection-policy';
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
import { CloudArrowUp, FileText, Globe, GithubLogo } from '../production/icons';

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
const NETWORK_LABEL =
  MONAD_CHAIN_ID === 31337 ? "the local test chain" : "Monad testnet";
const STORAGE_KEY = "datavault_collection_id";
const PENDING_KEY = `datavault_pending_registration:${MONAD_CHAIN_ID}:${
  CONTRACT_ADDRESS?.toLowerCase() ?? "unconfigured"
}`;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

interface PendingRegistration {
  collectionId: string;
  txHash: string;
  ownerAddress: string;
  name: string;
}

function readPending(ownerAddress: string): PendingRegistration | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw || raw.length > 2_000) return null;
    const item: unknown = JSON.parse(raw);
    if (!item || typeof item !== "object") return null;
    const value = item as Partial<PendingRegistration>;
    if (!HASH_RE.test(value.collectionId ?? "") ||
        !HASH_RE.test(value.txHash ?? "") ||
        value.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase() ||
        typeof value.name !== "string") return null;
    return value as PendingRegistration;
  } catch {
    return null;
  }
}

function storePending(value: PendingRegistration | null) {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Recovery still works in the current tab when storage is unavailable.
  }
}

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
  onChanged,
}: {
  selectedCollection?: string | null;
  onForget?: () => void;
  onChanged?: () => void;
}) {
  const { primaryWallet } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [textName, setTextName] = useState('Knowledge collection');
  const [sourceText, setSourceText] = useState('');
  function updateSourceText(name: string, text: string) {
    setTextName(name); setSourceText(text);
    setFile(text.trim() && name.trim() ? new File([text], `${name.trim().replace(/[\\/]/g, '_')}.md`, { type: 'text/markdown' }) : null);
  }
  const [priceEth, setPriceEth] = useState("0.001");
  const [step, setStep] = useState<Step>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [policyTxPending, setPolicyTxPending] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [pending, setPending] = useState<PendingRegistration | null>(null);
  const [recoveryCollectionId, setRecoveryCollectionId] = useState("");
  const [recoveryTxHash, setRecoveryTxHash] = useState("");

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  useEffect(() => {
    setPending(walletAddress ? readPending(walletAddress) : null);
  }, [walletAddress]);

  // Load saved collection and on-chain state after connect or refresh
  useEffect(() => {
    setPolicy(null);
    setLoadingPolicy(false);
    let savedId = selectedCollection;
    if (!savedId) {
      try { savedId = localStorage.getItem(STORAGE_KEY); } catch { savedId = null; }
    }
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
        `Wrong network. Switch to ${NETWORK_LABEL} (chainId ${MONAD_CHAIN_ID}) in your wallet.`
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
      const registration = {
        collectionId,
        txHash,
        ownerAddress: walletAddress,
        name: file.name.replace(/\.md$/i, ""),
      };
      setPending(registration);
      storePending(registration);
      await confirmPending(registration);
    } catch (err: unknown) {
      setStep("error");
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmPending(registration: PendingRegistration) {
    if (!CONTRACT_ADDRESS || !primaryWallet ||
        registration.ownerAddress.toLowerCase() !== primaryWallet.address.toLowerCase())
      throw new Error("Connect the wallet that registered this collection.");
    setStep("awaiting_confirm");
    const receipt = await viemClient.waitForTransactionReceipt({
      hash: registration.txHash as `0x${string}`,
    });
    if (receipt.status !== "success") {
      setPending(null);
      storePending(null);
      throw new Error("Registration transaction reverted. No collection was registered.");
    }
    const confirmRes = await fetch(
      `/api/collections/${registration.collectionId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: registration.txHash,
          ownerAddress: registration.ownerAddress,
        }),
      }
    );
    if (!confirmRes.ok) throw new Error(await confirmRes.text());
    const col = (await viemClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: DATAVAULT_ABI,
      functionName: "getCollection",
      args: [registration.collectionId as `0x${string}`],
    })) as [string, string, bigint, number, boolean];
    if (col[0].toLowerCase() !== registration.ownerAddress.toLowerCase())
      throw new Error("Confirmed collection owner does not match this wallet.");
    try { localStorage.setItem(STORAGE_KEY, registration.collectionId); } catch {}
    setPolicy({
      collectionId: registration.collectionId,
      price: col[2],
      active: col[4],
      policyVersion: col[3],
      collectionName: registration.name,
    });
    setPending(null);
    storePending(null);
    setStep("done");
    setStatusMsg(`Registered and confirmed. Tx: ${registration.txHash}`);
    onChanged?.();
  }

  async function resumeConfirmation() {
    if (!pending) return;
    setStatusMsg("Checking the registration transaction and collection state...");
    try {
      await confirmPending(pending);
    } catch (cause) {
      setStep("error");
      setStatusMsg(cause instanceof Error ? cause.message : "Confirmation is unavailable.");
    }
  }

  async function recoverFromTransaction(event: React.FormEvent) {
    event.preventDefault();
    if (!primaryWallet || !HASH_RE.test(recoveryCollectionId) ||
        !HASH_RE.test(recoveryTxHash)) return;
    const registration = {
      collectionId: recoveryCollectionId,
      txHash: recoveryTxHash,
      ownerAddress: primaryWallet.address,
      name: "",
    };
    setPending(registration);
    storePending(registration);
    setStatusMsg("Checking the registration transaction and collection state...");
    try {
      await confirmPending(registration);
      setRecoveryCollectionId("");
      setRecoveryTxHash("");
    } catch (cause) {
      setStep("error");
      setStatusMsg(cause instanceof Error ? cause.message : "Confirmation is unavailable.");
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
      setPolicy({ ...policy, price: col[2], active: col[4], policyVersion: col[3] });
      onChanged?.();
      setStatusMsg(`Policy updated. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStatusMsg(
        "Error: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setPolicyTxPending(false);
    }
  }

  async function handlePriceUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!primaryWallet || !policy || !contractReady || !(await checkNetwork())) return;
    setPolicyTxPending(true);
    try {
      const walletClient = await primaryWallet.getWalletClient();
      const saved = await updateCollectionPrice(walletClient, viemClient, CONTRACT_ADDRESS!, policy.collectionId as `0x${string}`, newPrice, policy.active);
      setPolicy({ ...policy, ...saved });
      setNewPrice("");
      setStatusMsg("Price updated and confirmed on chain.");
      onChanged?.();
    } catch (error) { setStatusMsg(error instanceof Error ? error.message : "Price update unavailable."); }
    finally { setPolicyTxPending(false); }
  }

  function handleForgetCollection() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
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

      {pending && walletAddress.toLowerCase() === pending.ownerAddress.toLowerCase() && (
        <div style={styles.warning}>
          <strong>Registration needs confirmation</strong>
          <p>Transaction: {pending.txHash}</p>
          <p>Collection: {pending.collectionId}</p>
          <button type="button" onClick={() => void resumeConfirmation()}
            disabled={isLoading} style={styles.button}>
            {isLoading ? "Checking registration..." : "Resume confirmation"}
          </button>
          <button type="button" onClick={() => { setPending(null); storePending(null); }}
            disabled={isLoading} style={{ ...styles.linkButton, marginLeft: "0.75rem" }}>
            Clear local record
          </button>
        </div>
      )}

      {!policy && !loadingPolicy && !pending && (
        <form onSubmit={handleRegister} style={styles.form}>
          <div style={styles.label}>
            <div className="dv-upload-tabs" aria-label="Collection source"><button type="button" aria-pressed={inputMode === 'file'} onClick={() => { setInputMode('file'); setFile(null); }}><FileText size={16}/> Upload Files</button><button type="button" disabled title="Website imports unavailable"><Globe size={15}/> Website</button><button type="button" disabled title="Notion imports unavailable">Notion</button><button type="button" disabled title="GitHub imports unavailable"><GithubLogo size={15}/> GitHub</button><button type="button" aria-pressed={inputMode === 'text'} onClick={() => { setInputMode('text'); updateSourceText(textName, sourceText); }}>Text</button></div>
            {inputMode === 'text' ? <div className="dv-source-text"><label>Collection name<input value={textName} maxLength={80} required onChange={event => updateSourceText(event.target.value, sourceText)}/></label><label>Knowledge text<textarea value={sourceText} maxLength={512000} required rows={8} placeholder="Paste your Markdown knowledge here" onChange={event => updateSourceText(textName, event.target.value)}/></label><small>Saved privately through the same Markdown upload flow.</small></div> : <label className="dv-upload-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setFile(event.dataTransfer.files?.[0] ?? null); }}><CloudArrowUp size={46} weight="duotone"/><strong>Drag & drop your file here</strong><small>Markdown or TXT (max 500 KB)</small>
            <span className="dv-file-label">Knowledge collection (Markdown file)</span>
            <input
              type="file"
              aria-label="Knowledge collection (Markdown file)"
              accept=".md,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required={!file}
              style={styles.input}
            />
            {file && <span className="dv-upload-selected"><FileText size={19}/><span>{file.name}</span><small>{(file.size / 1024).toFixed(1)} KB</small></span>}
            </label>}
          </div>

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

      {!policy && !pending && walletAddress && (
        <details style={{ marginTop: "1rem" }}>
          <summary>Already sent a registration transaction?</summary>
          <p>
            If this browser lost the pending record, enter the collection ID
            shown after you submitted registration and the transaction hash from
            your wallet. The Worker verifies both against Monad.
          </p>
          <form onSubmit={(event) => void recoverFromTransaction(event)} style={styles.form}>
            <label style={styles.label}>
              Collection ID
              <input value={recoveryCollectionId} onChange={(event) => setRecoveryCollectionId(event.target.value)}
                pattern="0x[0-9a-fA-F]{64}" required style={styles.input} />
            </label>
            <label style={styles.label}>
              Registration transaction hash
              <input value={recoveryTxHash} onChange={(event) => setRecoveryTxHash(event.target.value)}
                pattern="0x[0-9a-fA-F]{64}" required style={styles.input} />
            </label>
            <button type="submit" disabled={isLoading || !contractReady} style={styles.button}>
              Recover registration
            </button>
          </form>
        </details>
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

          <form onSubmit={event => void handlePriceUpdate(event)}>
            <label>New price per query (MON)<input aria-label="New price per query (MON)" inputMode="decimal" value={newPrice} onChange={event => setNewPrice(event.target.value)} required /></label>
            <button type="submit" disabled={policyTxPending} style={styles.button}>Update price</button>
            <p>Price and pause changes advance the policy version and can invalidate outstanding quotes and requests under the current policy rules.</p>
          </form>
          <CollectionEditor collectionId={policy.collectionId} onChanged={onChanged} />
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
