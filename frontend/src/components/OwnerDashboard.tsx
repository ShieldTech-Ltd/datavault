import { useState, useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { DATAVAULT_ABI, CONTRACT_ADDRESS, viemClient } from "@/lib/contract";
import { encodeFunctionData, parseEther, formatEther } from "viem";

const MONAD_CHAIN_ID = 10143;
const STORAGE_KEY = "datavault_collection_id";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signUpload(
  walletClient: { signMessage: (args: { message: string }) => Promise<`0x${string}`> },
  collectionId: string,
  content: string,
): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Date.now();
  const contentHash = await sha256Hex(content);
  const message = `datavault-upload:${collectionId}:${contentHash}:${timestamp}`;
  const signature = await walletClient.signMessage({ message });
  return { signature, timestamp };
}

type Step = "idle" | "uploading" | "awaiting_wallet" | "awaiting_confirm" | "done" | "error";
type SourceTab = "upload" | "website" | "notion" | "github" | "text";

interface OnChainPolicy {
  collectionId: string;
  price: bigint;
  active: boolean;
  policyVersion: number;
  collectionName: string;
}

const FILE_ICONS: Record<string, { bg: string; label: string }> = {
  pdf: { bg: "#ef4444", label: "PDF" },
  docx: { bg: "#3b82f6", label: "DOC" },
  doc: { bg: "#3b82f6", label: "DOC" },
  md: { bg: "#64748b", label: "MD" },
  txt: { bg: "#64748b", label: "TXT" },
};

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? { bg: "#7c3aed", label: ext.toUpperCase() || "FILE" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORIES = ["Technical Docs", "Research Papers", "Legal Docs", "Medical", "Finance", "Education", "Other"];

export default function OwnerDashboard() {
  const { primaryWallet } = useDynamicContext();
  const [sourceTab, setSourceTab] = useState<SourceTab>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [priceEth, setPriceEth] = useState("0.001");
  const [category, setCategory] = useState("Technical Docs");
  const [step, setStep] = useState<Step>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadStatus, setReuploadStatus] = useState("");
  const [policyTxPending, setPolicyTxPending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId || !walletAddress || !contractReady) return;
    setLoadingPolicy(true);
    viemClient
      .readContract({
        address: CONTRACT_ADDRESS!,
        abi: DATAVAULT_ABI,
        functionName: "getCollection",
        args: [savedId as `0x${string}`],
      })
      .then((col) => {
        const c = col as { owner: string; price: bigint; active: boolean; policyVersion: number };
        if (c.owner.toLowerCase() === walletAddress.toLowerCase() && c.price > 0n) {
          setPolicy({
            collectionId: savedId,
            price: c.price,
            active: c.active,
            policyVersion: c.policyVersion,
            collectionName: "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPolicy(false));
  }, [walletAddress, contractReady]);

  async function checkNetwork(): Promise<boolean> {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return false;
    const wc = await primaryWallet.getWalletClient();
    const chainId = await wc.getChainId();
    if (chainId !== MONAD_CHAIN_ID) {
      setStep("error");
      setStatusMsg(`Wrong network. Switch to Monad testnet (chainId ${MONAD_CHAIN_ID}) in your wallet.`);
      return false;
    }
    return true;
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      [".md", ".txt", ".pdf", ".docx", ".doc"].some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length) setFiles((prev) => [...prev, ...selected]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!primaryWallet || files.length === 0 || !disclosureAccepted) return;
    if (!contractReady) {
      setStep("error");
      setStatusMsg("CONTRACT_ADDRESS not configured. Deploy the contract first.");
      return;
    }

    setStep("uploading");
    setStatusMsg("Uploading collection to Worker...");

    const file = files[0];
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("priceWei", parseEther(priceEth).toString());
      formData.append("ownerAddress", walletAddress);

      const res = await fetch("/api/collections", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const { collectionId, txCalldata } = (await res.json()) as { collectionId: string; txCalldata: string };

      if (!(await checkNetwork())) return;

      setStep("awaiting_wallet");
      setStatusMsg("Sign the registration transaction in your wallet...");

      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      let txHash: string;
      try {
        txHash = await walletClient.sendTransaction({
          to: CONTRACT_ADDRESS!,
          data: txCalldata as `0x${string}`,
        });
      } catch (err: unknown) {
        throw new Error("Transaction rejected: " + (err instanceof Error ? err.message : String(err)));
      }

      setStep("awaiting_confirm");
      setStatusMsg("Waiting for on-chain confirmation...");

      const confirmRes = await fetch(`/api/collections/${collectionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, ownerAddress: walletAddress }),
      });
      if (!confirmRes.ok) {
        const text = await confirmRes.text();
        throw new Error(text);
      }

      const priceWei = parseEther(priceEth);
      localStorage.setItem(STORAGE_KEY, collectionId);
      setPolicy({
        collectionId,
        price: priceWei,
        active: true,
        policyVersion: 1,
        collectionName: file.name.replace(/\.(md|txt|pdf|docx|doc)$/i, ""),
      });
      setStep("done");
      setStatusMsg(`Registered. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStep("error");
      setStatusMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReupload() {
    if (!primaryWallet || !reuploadFile || !policy) return;
    setReuploadStatus("Signing upload...");
    try {
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const content = await reuploadFile.text();
      const { signature, timestamp } = await signUpload(walletClient, policy.collectionId, content);
      const res = await fetch(`/api/collections/${policy.collectionId}/upload`, {
        method: "POST",
        body: content,
        headers: { "Content-Type": "text/markdown", "x-signature": signature, "x-timestamp": String(timestamp) },
      });
      if (!res.ok) throw new Error(await res.text());
      setReuploadStatus("Content updated successfully.");
    } catch (err: unknown) {
      setReuploadStatus("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleTogglePause() {
    if (!primaryWallet || !policy || !contractReady) return;
    if (!(await checkNetwork())) return;
    setPolicyTxPending(true);
    try {
      const newActive = !policy.active;
      if (!isEthereumWallet(primaryWallet)) throw new Error("Not an Ethereum wallet");
      const walletClient = await primaryWallet.getWalletClient();
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "updatePolicy",
        args: [policy.collectionId as `0x${string}`, policy.price, newActive],
      });
      let txHash: string;
      try {
        txHash = await walletClient.sendTransaction({ to: CONTRACT_ADDRESS!, data });
      } catch (err: unknown) {
        throw new Error("Transaction rejected: " + (err instanceof Error ? err.message : String(err)));
      }
      await new Promise((r) => setTimeout(r, 3000));
      const col = (await viemClient.readContract({
        address: CONTRACT_ADDRESS!,
        abi: DATAVAULT_ABI,
        functionName: "getCollection",
        args: [policy.collectionId as `0x${string}`],
      })) as { active: boolean; policyVersion: number };
      setPolicy({ ...policy, active: col.active, policyVersion: col.policyVersion });
      setStatusMsg(`Policy updated. Tx: ${txHash}`);
    } catch (err: unknown) {
      setStatusMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPolicyTxPending(false);
    }
  }

  function handleForgetCollection() {
    localStorage.removeItem(STORAGE_KEY);
    setPolicy(null);
    setStep("idle");
    setStatusMsg("");
    setFiles([]);
  }

  function copyCollectionId() {
    if (!policy) return;
    navigator.clipboard.writeText(policy.collectionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const isLoading = step === "uploading" || step === "awaiting_wallet" || step === "awaiting_confirm";

  return (
    <div style={s.panel}>
      {/* Panel header */}
      <div style={s.panelHeader}>
        <div style={s.panelNum}>01</div>
        <div>
          <div style={s.panelTitle}>Register a Knowledge Collection</div>
          <div style={s.panelSub}>Upload your content, set a price, and start earning from queries.</div>
        </div>
      </div>

      {!contractReady && (
        <div style={s.warnBanner}>
          ⚠ Contract not configured. Deploy and set VITE_CONTRACT_ADDRESS.
        </div>
      )}

      {loadingPolicy && <div style={s.infoBanner}>Loading your collection from chain...</div>}

      {/* Registration form */}
      {!policy && !loadingPolicy && (
        <form onSubmit={handleRegister} style={s.form}>
          {/* Source tabs */}
          <div style={s.tabsRow}>
            {(["upload", "website", "notion", "github", "text"] as SourceTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                style={sourceTab === tab ? { ...s.tab, ...s.tabActive } : s.tab}
                onClick={() => setSourceTab(tab)}
              >
                {TAB_ICONS[tab]}
                <span style={{ marginLeft: 4 }}>{TAB_LABELS[tab]}</span>
              </button>
            ))}
          </div>

          {sourceTab === "upload" ? (
            <>
              {/* Drop zone */}
              <div
                style={isDragging ? { ...s.dropZone, ...s.dropZoneActive } : s.dropZone}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "#7c3aed", marginBottom: 8 }}>
                  <polyline points="16 16 12 12 8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="12" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={s.dropText}>Drag &amp; drop your files here</div>
                <div style={s.dropHint}>PDF, TXT, MD, DOCX (Max 100MB each)</div>
                <button
                  type="button"
                  style={s.selectFilesBtn}
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Select Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.docx,.doc"
                  multiple
                  onChange={handleFileInput}
                  style={{ display: "none" }}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div style={s.fileList}>
                  {files.map((f, i) => {
                    const icon = fileIcon(f.name);
                    return (
                      <div key={i} style={s.fileRow}>
                        <div style={{ ...s.fileIconBox, background: icon.bg }}>
                          <span style={s.fileIconLabel}>{icon.label}</span>
                        </div>
                        <div style={s.fileName}>{f.name}</div>
                        <div style={s.fileSize}>{formatBytes(f.size)}</div>
                        <button type="button" style={s.removeFileBtn} onClick={() => removeFile(i)}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={s.tabPlaceholder}>
              <span style={{ fontSize: "1.5rem" }}>{TAB_ICONS[sourceTab]}</span>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: 8 }}>
                {TAB_LABELS[sourceTab]} integration coming soon
              </div>
            </div>
          )}

          {/* Price + Category */}
          <div style={s.twoCol}>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Price per query (MON)</label>
              <div style={s.priceInputWrap}>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max="10"
                  value={priceEth}
                  onChange={(e) => setPriceEth(e.target.value)}
                  required
                  style={s.priceInput}
                />
                <div style={s.monBadge}>
                  <div style={s.monDot} />
                  MON
                </div>
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Collection Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={s.selectInput}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Disclosure */}
          <label style={s.disclosure}>
            <input
              type="checkbox"
              checked={disclosureAccepted}
              onChange={(e) => setDisclosureAccepted(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: "#7c3aed" }}
            />
            <span style={s.disclosureText}>
              I confirm passages from my document will be sent to an AI model provider for buyer queries,
              and that I hold the rights to share this content.
            </span>
          </label>

          {/* Status messages */}
          {statusMsg && step !== "done" && (
            <div style={step === "error" ? s.errorBox : s.statusBox}>
              {step === "awaiting_wallet" && <span style={s.spinner} />}
              {step === "awaiting_confirm" && <span style={s.spinner} />}
              {step === "uploading" && <span style={s.spinner} />}
              {statusMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || files.length === 0 || !disclosureAccepted}
            style={isLoading || files.length === 0 || !disclosureAccepted ? { ...s.registerBtn, opacity: 0.5, cursor: "not-allowed" } : s.registerBtn}
          >
            {isLoading ? stepLabel(step) : "Register Collection →"}
          </button>
        </form>
      )}

      {/* Error outside form */}
      {step === "error" && !policy && statusMsg && (
        <div style={s.errorBox}>{statusMsg}</div>
      )}

      {/* Policy / success state */}
      {policy && (
        <div style={s.successArea}>
          <div style={s.successBanner}>
            <div style={s.successIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#22c55e" />
                <polyline points="9 12 11 14 15 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div style={s.successTitle}>Collection Registered Successfully!</div>
              <div style={s.successDesc}>Your knowledge collection is now live on Monad testnet.</div>
            </div>
          </div>

          <div style={s.collectionMeta}>
            <div style={s.metaRow}>
              <span style={s.metaKey}>Collection ID</span>
              <div style={s.metaValue}>
                <span style={s.metaHash}>{policy.collectionId.slice(0, 10)}...{policy.collectionId.slice(-8)}</span>
                <button type="button" style={s.copyBtn} onClick={copyCollectionId} title="Copy ID">
                  {copied ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaKey}>Status</span>
              <span style={policy.active ? s.activeBadge : s.pausedBadge}>
                {policy.active ? "● Active" : "● Paused"}
              </span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaKey}>Price</span>
              <span style={s.metaVal2}>{formatEther(policy.price)} MON / query</span>
            </div>
            <div style={s.metaRow}>
              <span style={s.metaKey}>Policy version</span>
              <span style={s.metaVal2}>v{policy.policyVersion}</span>
            </div>
          </div>

          <div style={s.actionRow}>
            <button
              onClick={handleTogglePause}
              disabled={policyTxPending}
              style={policy.active ? s.pauseBtn : s.resumeBtn}
            >
              {policyTxPending ? (
                <><span style={s.spinnerSm} /> Signing...</>
              ) : policy.active ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause Access
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Resume Access
                </>
              )}
            </button>

            <div style={s.updateContent}>
              <input
                type="file"
                accept=".md,.txt"
                id="reupload"
                style={{ display: "none" }}
                onChange={(e) => setReuploadFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="reupload" style={s.updateBtn}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}>
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {reuploadFile ? reuploadFile.name.slice(0, 14) + "..." : "Update Content"}
              </label>
              {reuploadFile && (
                <button type="button" onClick={handleReupload} style={s.signUploadBtn}>
                  Sign &amp; Upload
                </button>
              )}
            </div>
          </div>

          {reuploadStatus && (
            <div style={reuploadStatus.startsWith("Error") ? s.errorBox : s.successBox}>
              {reuploadStatus}
            </div>
          )}

          {statusMsg && step !== "idle" && (
            <div style={s.statusBox}>{statusMsg}</div>
          )}

          <button type="button" onClick={handleForgetCollection} style={s.forgetBtn}>
            Switch collection
          </button>
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

const TAB_LABELS: Record<SourceTab, string> = {
  upload: "Upload Files",
  website: "Website",
  notion: "Notion",
  github: "GitHub",
  text: "Text",
};

const TAB_ICONS: Record<SourceTab, JSX.Element> = {
  upload: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <polyline points="16 16 12 12 8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="12" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  website: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  notion: <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>N</span>,
  github: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  text: <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>T</span>,
};

const s = {
  panel: {
    background: "#0f172a",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 16,
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
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
    padding: "0.6rem 0.875rem",
    fontSize: "0.78rem",
    color: "#fbbf24",
  },
  infoBanner: {
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 8,
    padding: "0.6rem 0.875rem",
    fontSize: "0.78rem",
    color: "#818cf8",
  },

  form: { display: "flex", flexDirection: "column" as const, gap: "0.875rem" },

  tabsRow: {
    display: "flex",
    gap: "0.25rem",
    flexWrap: "wrap" as const,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    padding: "0.35rem 0.7rem",
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.1)",
    borderRadius: 7,
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  tabActive: {
    background: "rgba(124,58,237,0.2)",
    border: "1px solid rgba(124,58,237,0.4)",
    color: "#c4b5fd",
  },

  dropZone: {
    border: "1.5px dashed rgba(124,58,237,0.3)",
    borderRadius: 12,
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    cursor: "pointer",
    background: "rgba(124,58,237,0.04)",
    transition: "all 0.15s",
  },
  dropZoneActive: {
    border: "1.5px dashed #7c3aed",
    background: "rgba(124,58,237,0.1)",
  },
  dropText: { fontSize: "0.85rem", fontWeight: 600, color: "#e2e8f0", marginBottom: 4 },
  dropHint: { fontSize: "0.72rem", color: "#64748b", marginBottom: "0.875rem" },
  selectFilesBtn: {
    padding: "0.45rem 1.1rem",
    background: "linear-gradient(135deg, #7c3aed, #6366f1)",
    border: "none",
    borderRadius: 7,
    color: "white",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },

  fileList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.4rem",
    marginTop: "-0.25rem",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.4rem 0.6rem",
    background: "rgba(148,163,184,0.05)",
    border: "1px solid rgba(148,163,184,0.08)",
    borderRadius: 8,
  },
  fileIconBox: {
    width: 28,
    height: 28,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fileIconLabel: { fontSize: "0.55rem", fontWeight: 800, color: "white", letterSpacing: "0.02em" },
  fileName: { flex: 1, fontSize: "0.78rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  fileSize: { fontSize: "0.72rem", color: "#64748b", flexShrink: 0 },
  removeFileBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: "0.75rem",
    padding: "0 0.2rem",
    flexShrink: 0,
    lineHeight: 1,
  },

  tabPlaceholder: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "2rem",
    border: "1px dashed rgba(148,163,184,0.15)",
    borderRadius: 12,
  },

  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" },
  fieldGroup: { display: "flex", flexDirection: "column" as const, gap: "0.35rem" },
  fieldLabel: { fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" },
  priceInputWrap: {
    display: "flex",
    alignItems: "center",
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 8,
    overflow: "hidden",
  },
  priceInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "0.5rem 0.6rem",
    fontSize: "0.85rem",
    color: "#f1f5f9",
    width: "100%",
  },
  monBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.4rem 0.6rem",
    background: "rgba(124,58,237,0.15)",
    borderLeft: "1px solid rgba(148,163,184,0.1)",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#a78bfa",
    flexShrink: 0,
  },
  monDot: { width: 6, height: 6, borderRadius: "50%", background: "#7c3aed" },
  selectInput: {
    background: "rgba(148,163,184,0.06)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 8,
    padding: "0.5rem 0.6rem",
    fontSize: "0.82rem",
    color: "#f1f5f9",
    outline: "none",
    cursor: "pointer",
  },

  disclosure: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    cursor: "pointer",
  },
  disclosureText: { fontSize: "0.72rem", color: "#64748b", lineHeight: 1.55 },

  statusBox: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 8,
    padding: "0.55rem 0.75rem",
    fontSize: "0.78rem",
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
  successBox: {
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 8,
    padding: "0.55rem 0.75rem",
    fontSize: "0.78rem",
    color: "#86efac",
  },

  registerBtn: {
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

  spinner: {
    display: "inline-block",
    width: 12,
    height: 12,
    border: "2px solid rgba(129,140,248,0.3)",
    borderTopColor: "#818cf8",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    flexShrink: 0,
  },
  spinnerSm: {
    display: "inline-block",
    width: 10,
    height: 10,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    marginRight: 4,
  },

  /* Success / policy state */
  successArea: { display: "flex", flexDirection: "column" as const, gap: "0.75rem" },
  successBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
    padding: "0.75rem",
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 10,
  },
  successIcon: { flexShrink: 0, marginTop: 1 },
  successTitle: { fontSize: "0.85rem", fontWeight: 700, color: "#86efac", marginBottom: 2 },
  successDesc: { fontSize: "0.73rem", color: "#4ade80", opacity: 0.8 },

  collectionMeta: {
    background: "rgba(148,163,184,0.04)",
    border: "1px solid rgba(148,163,184,0.08)",
    borderRadius: 10,
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  metaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" },
  metaKey: { fontSize: "0.73rem", color: "#64748b" },
  metaValue: { display: "flex", alignItems: "center", gap: "0.4rem" },
  metaHash: { fontFamily: "monospace", fontSize: "0.72rem", color: "#94a3b8" },
  metaVal2: { fontSize: "0.8rem", color: "#e2e8f0", fontWeight: 600 },
  copyBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    padding: "2px",
    display: "flex",
    alignItems: "center",
  },
  activeBadge: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#4ade80",
    background: "rgba(34,197,94,0.15)",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 20,
    padding: "2px 8px",
  },
  pausedBadge: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#fb923c",
    background: "rgba(251,146,60,0.15)",
    border: "1px solid rgba(251,146,60,0.25)",
    borderRadius: 20,
    padding: "2px 8px",
  },

  actionRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  pauseBtn: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.875rem",
    background: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  resumeBtn: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.875rem",
    background: "rgba(34,197,94,0.15)",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 8,
    color: "#86efac",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  updateContent: { display: "flex", alignItems: "center", gap: "0.5rem" },
  updateBtn: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.875rem",
    background: "rgba(148,163,184,0.08)",
    border: "1px solid rgba(148,163,184,0.15)",
    borderRadius: 8,
    color: "#94a3b8",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  signUploadBtn: {
    padding: "0.45rem 0.75rem",
    background: "rgba(99,102,241,0.2)",
    border: "1px solid rgba(99,102,241,0.35)",
    borderRadius: 7,
    color: "#818cf8",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  forgetBtn: {
    background: "none",
    border: "none",
    color: "#475569",
    fontSize: "0.72rem",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
    alignSelf: "flex-start" as const,
  },
} as const;
