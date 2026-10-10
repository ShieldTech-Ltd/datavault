import { useState, useEffect } from "react";
import { useWallet } from "@/lib/wallet";
import { DATAVAULT_ABI, CONTRACT_ADDRESS, viemClient } from "@/lib/contract";
import { encodeFunctionData, parseEther, formatEther, keccak256, toBytes } from "viem";
import { registrationMessage } from "../../../shared/api";

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
const STORAGE_KEY = "datavault_collection_id";

type Step = "idle" | "uploading" | "awaiting_wallet" | "awaiting_confirm" | "done" | "error";

interface OnChainPolicy {
  collectionId: string;
  price: bigint;
  active: boolean;
  policyVersion: number;
  collectionName: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "uploading",       label: "Upload" },
  { key: "awaiting_wallet", label: "Sign" },
  { key: "awaiting_confirm",label: "Confirm" },
  { key: "done",            label: "Done" },
];

function StepIndicator({ step }: { step: Step }) {
  const active = ["uploading","awaiting_wallet","awaiting_confirm","done"].indexOf(step);
  if (active < 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: "1.5rem", marginBottom: "0.5rem" }}>
      {STEPS.map((s, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.72rem", fontWeight: 700, flexShrink: 0,
                background: done ? "var(--green)" : current ? "var(--accent)" : "var(--surface-3)",
                color: (done || current) ? "white" : "var(--text-3)",
                border: current ? "2px solid var(--accent-bdr)" : "2px solid transparent",
                boxShadow: current ? "0 0 0 3px var(--accent-bg)" : undefined,
                transition: "all 0.2s",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: "0.65rem", fontWeight: current ? 600 : 400, color: current ? "var(--accent)" : done ? "var(--green)" : "var(--text-3)", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < active ? "var(--green)" : "var(--border)", margin: "0 6px", marginBottom: 20, transition: "background 0.3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OwnerDashboard() {
  const { primaryWallet } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [priceEth, setPriceEth] = useState("0.001");
  const [step, setStep] = useState<Step>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [policyTxPending, setPolicyTxPending] = useState(false);

  const contractReady = Boolean(CONTRACT_ADDRESS);
  const walletAddress = primaryWallet?.address ?? "";

  useEffect(() => {
    setPolicy(null);
    setLoadingPolicy(false);
    const savedId = localStorage.getItem(STORAGE_KEY);
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
        if (active && c[0].toLowerCase() === walletAddress.toLowerCase() && c[2] > 0n) {
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
      .finally(() => { if (active) setLoadingPolicy(false); });
    return () => { active = false; };
  }, [walletAddress, contractReady]);

  async function checkNetwork(): Promise<boolean> {
    if (!primaryWallet) return false;
    const wc = await primaryWallet.getWalletClient();
    const chainId = await wc.getChainId();
    if (chainId !== MONAD_CHAIN_ID) {
      setStep("error");
      setStatusMsg(`Wrong network. Switch to Monad testnet (chainId ${MONAD_CHAIN_ID}) in your wallet.`);
      return false;
    }
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!primaryWallet || !file || !disclosureAccepted) return;
    if (!contractReady) {
      setStep("error");
      setStatusMsg("CONTRACT_ADDRESS not configured. Deploy the contract first.");
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
      const signature = await walletClient.signMessage({ message: registrationMessage(
        MONAD_CHAIN_ID, CONTRACT_ADDRESS!, walletAddress, contentHash, priceWei.toString(), timestamp,
      ) });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("priceWei", priceWei.toString());
      formData.append("ownerAddress", walletAddress);

      const res = await fetch("/api/collections", { method: "POST", body: formData,
        headers: { "x-signature": signature, "x-timestamp": String(timestamp) } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const { collectionId, txCalldata } = (await res.json()) as { collectionId: string; txCalldata: string };

      setStep("awaiting_wallet");
      setStatusMsg("Sign the registration transaction in your wallet...");

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
      const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== "success") throw new Error("Registration transaction reverted.");

      const confirmRes = await fetch(`/api/collections/${collectionId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, ownerAddress: walletAddress }),
      });
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
        txHash = await walletClient.sendTransaction({ to: CONTRACT_ADDRESS!, data });
      } catch (err: unknown) {
        throw new Error("Transaction rejected: " + (err instanceof Error ? err.message : String(err)));
      }
      const receipt = await viemClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== "success") throw new Error("Policy transaction reverted.");
      const col = (await viemClient.readContract({
        address: CONTRACT_ADDRESS!,
        abi: DATAVAULT_ABI,
        functionName: "getCollection",
        args: [policy.collectionId as `0x${string}`],
      })) as [string, string, bigint, number, boolean];
      setPolicy({ ...policy, active: col[4], policyVersion: col[3] });
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
  }

  const isLoading = step === "uploading" || step === "awaiting_wallet" || step === "awaiting_confirm";

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Register a Knowledge Collection
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.875rem", lineHeight: 1.6 }}>
          Your Markdown document is stored privately. Selected passages are sent to the AI model
          provider only to answer buyer queries. Buyers are informed before purchase.
        </p>
      </div>

      {!contractReady && (
        <div style={st.alertYellow}>
          <span style={{ fontSize: "1rem" }} aria-hidden="true">⚠️</span>
          <span>Contract address not configured. Deploy the contract and set <code>VITE_CONTRACT_ADDRESS</code>.</span>
        </div>
      )}

      {loadingPolicy && (
        <div style={st.alertBlue}>
          <span className="animate-spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid var(--blue)", borderTopColor: "transparent", borderRadius: "50%" }} aria-hidden="true" />
          <span>Loading your collection from chain...</span>
        </div>
      )}

      {!policy && !loadingPolicy && (
        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
          {/* Drop zone */}
          <div>
            <label style={st.fieldLabel}>Knowledge collection (Markdown or plain text)</label>
            <div
              style={{ ...st.dropzone, ...(dragOver ? st.dropzoneActive : {}), ...(file ? st.dropzoneFilled : {}) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            >
              <input
                type="file"
                accept=".md,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              />
              {file ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.25rem" }} aria-hidden="true">📄</span>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{file.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--green)", fontWeight: 600 }}>✓ Ready</span>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }} aria-hidden="true">📁</div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-2)" }}>Drop your file here or click to browse</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 4 }}>.md or .txt · up to 2 MiB</div>
                </div>
              )}
            </div>
          </div>

          {/* Price */}
          <div>
            <label style={st.fieldLabel} htmlFor="price-input">Price per query (MON)</label>
            <div style={st.inputWrap}>
              <span style={{ color: "var(--text-3)", fontSize: "0.8rem", padding: "0 0.5rem", userSelect: "none" }}>◈</span>
              <input
                id="price-input"
                type="number"
                step="0.0001"
                min="0.0001"
                max="10"
                value={priceEth}
                onChange={(e) => setPriceEth(e.target.value)}
                required
                style={st.input}
              />
              <span style={{ color: "var(--text-3)", fontSize: "0.78rem", padding: "0 0.75rem", userSelect: "none", borderLeft: "1px solid var(--border)" }}>MON</span>
            </div>
          </div>

          {/* Disclosure */}
          <div style={st.disclosureBox}>
            <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer" }}>
              <div style={{ ...st.checkbox, ...(disclosureAccepted ? st.checkboxChecked : {}) }} onClick={() => setDisclosureAccepted((v) => !v)} role="checkbox" aria-checked={disclosureAccepted} tabIndex={0} onKeyDown={(e) => e.key === " " && setDisclosureAccepted((v) => !v)}>
                {disclosureAccepted && <span style={{ color: "white", fontSize: "0.7rem", fontWeight: 800 }}>✓</span>}
                <input type="checkbox" checked={disclosureAccepted} onChange={(e) => setDisclosureAccepted(e.target.checked)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                I understand that passages from my document will be sent to an external AI model provider
                when buyers submit queries. I confirm I have the right to share this content and it does
                not violate any third-party rights.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !file || !disclosureAccepted}
            style={isLoading || !file || !disclosureAccepted ? st.btnDisabled : st.btnPrimary}
          >
            {isLoading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className="animate-spin" style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                {stepLabel(step)}
              </span>
            ) : "Register Collection"}
          </button>

          {step === "awaiting_wallet" && (
            <div style={st.stepNote}>
              <span aria-hidden="true">👛</span> Check your wallet for the transaction prompt.
            </div>
          )}
          {step === "awaiting_confirm" && (
            <div style={st.stepNote}>
              <span aria-hidden="true">⏳</span> Transaction broadcast. Waiting for on-chain confirmation...
            </div>
          )}
        </form>
      )}

      {(isLoading || step === "done") && <StepIndicator step={step} />}

      {statusMsg && (
        <div style={step === "error" ? st.alertRed : st.alertGreen} className="animate-fadeIn" role={step === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{step === "error" ? "❌" : "✅"}</span>
          <span style={{ fontFamily: step === "done" ? "monospace" : undefined, fontSize: step === "done" ? "0.78rem" : undefined, wordBreak: "break-all" }}>
            {statusMsg}
          </span>
        </div>
      )}

      {policy && (
        <div style={st.policyCard} className="animate-fadeIn">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.1rem" }} aria-hidden="true">🗃️</span>
              <strong style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                {policy.collectionName ? policy.collectionName : "Active Collection"}
              </strong>
            </div>
            <button onClick={handleForgetCollection} style={st.linkBtn} type="button">
              Switch collection
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={st.statBox}>
              <div style={st.statLabel}>Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: policy.active ? "var(--green)" : "var(--yellow)", display: "inline-block" }} aria-hidden="true" />
                <strong style={{ fontSize: "0.875rem", color: policy.active ? "var(--green)" : "var(--yellow)" }}>
                  {policy.active ? "Active" : "Paused"}
                </strong>
              </div>
            </div>
            <div style={st.statBox}>
              <div style={st.statLabel}>Price</div>
              <strong style={{ fontSize: "0.875rem", color: "var(--text)" }}>{formatEther(policy.price)} MON</strong>
            </div>
            <div style={{ ...st.statBox, gridColumn: "1 / -1" }}>
              <div style={st.statLabel}>Collection ID (v{policy.policyVersion})</div>
              <code style={{ fontSize: "0.72rem", color: "var(--text-2)", wordBreak: "break-all", fontFamily: "monospace" }}>{policy.collectionId}</code>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={handleTogglePause}
              disabled={policyTxPending}
              type="button"
              style={policyTxPending ? st.btnDisabled : (policy.active ? st.btnDanger : st.btnSuccess)}
            >
              {policyTxPending ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="animate-spin" style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                  Signing...
                </span>
              ) : policy.active ? "⏸ Pause Access" : "▶ Resume Access"}
            </button>
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: "0.875rem", lineHeight: 1.5 }}>
            Document replacement is unavailable while policy versioning is being completed.
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

const st = {
  fieldLabel: { display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-2)", marginBottom: "0.4rem" } as React.CSSProperties,
  dropzone: {
    position: "relative" as const, borderRadius: 10, border: "2px dashed var(--border-2)",
    padding: "1.5rem 1.25rem", cursor: "pointer", transition: "all 0.15s",
    background: "var(--surface-2)",
  } as React.CSSProperties,
  dropzoneActive: { borderColor: "var(--accent)", background: "var(--accent-bg)", boxShadow: "0 0 0 3px var(--accent-bg)" } as React.CSSProperties,
  dropzoneFilled: { borderStyle: "solid", borderColor: "var(--green)", background: "var(--green-bg)" } as React.CSSProperties,
  inputWrap: { display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)", overflow: "hidden" } as React.CSSProperties,
  input: { flex: 1, background: "transparent", border: "none", outline: "none", padding: "0.55rem 0.5rem", color: "var(--text)", fontSize: "0.875rem" } as React.CSSProperties,
  disclosureBox: { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "0.875rem 1rem" } as React.CSSProperties,
  checkbox: {
    width: 18, height: 18, borderRadius: 5, border: "2px solid var(--border-2)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2, cursor: "pointer", transition: "all 0.15s",
    position: "relative" as const, background: "var(--surface)",
  } as React.CSSProperties,
  checkboxChecked: { background: "var(--accent)", borderColor: "var(--accent)" } as React.CSSProperties,
  btnPrimary: { padding: "0.65rem 1.25rem", borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.875rem", boxShadow: "0 2px 8px rgba(124,58,237,0.3)", width: "100%" } as React.CSSProperties,
  btnDisabled: { padding: "0.65rem 1.25rem", borderRadius: 9, background: "var(--surface-3)", color: "var(--text-3)", border: "1px solid var(--border)", cursor: "not-allowed", fontWeight: 600, fontSize: "0.875rem", width: "100%" } as React.CSSProperties,
  btnDanger: { padding: "0.55rem 1.1rem", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", border: "1px solid rgba(220,38,38,0.25)", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" } as React.CSSProperties,
  btnSuccess: { padding: "0.55rem 1.1rem", borderRadius: 8, background: "var(--green-bg)", color: "var(--green)", border: "1px solid rgba(22,163,74,0.25)", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" } as React.CSSProperties,
  linkBtn: { background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, padding: 0, textDecoration: "underline", textUnderlineOffset: "2px" } as React.CSSProperties,
  alertYellow: { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.75rem 1rem", borderRadius: 9, background: "var(--yellow-bg)", border: "1px solid rgba(217,119,6,0.25)", fontSize: "0.82rem", color: "var(--yellow)", marginBottom: "1rem" } as React.CSSProperties,
  alertBlue:   { display: "flex", gap: "0.6rem", alignItems: "center", padding: "0.75rem 1rem", borderRadius: 9, background: "var(--blue-bg)", border: "1px solid rgba(37,99,235,0.2)", fontSize: "0.82rem", color: "var(--blue)", marginBottom: "1rem" } as React.CSSProperties,
  alertGreen:  { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.875rem 1rem", borderRadius: 9, background: "var(--green-bg)", border: "1px solid rgba(22,163,74,0.25)", fontSize: "0.82rem", color: "var(--green-text)", marginTop: "1rem" } as React.CSSProperties,
  alertRed:    { display: "flex", gap: "0.6rem", alignItems: "flex-start", padding: "0.875rem 1rem", borderRadius: 9, background: "var(--red-bg)", border: "1px solid rgba(220,38,38,0.25)", fontSize: "0.82rem", color: "var(--red)", marginTop: "1rem" } as React.CSSProperties,
  stepNote: { display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.8rem", color: "var(--text-3)", padding: "0.25rem 0" } as React.CSSProperties,
  policyCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem", marginTop: "1.75rem", boxShadow: "var(--shadow-md)" } as React.CSSProperties,
  statBox: { background: "var(--surface-2)", borderRadius: 8, padding: "0.6rem 0.75rem", border: "1px solid var(--border)" } as React.CSSProperties,
  statLabel: { fontSize: "0.7rem", fontWeight: 600, color: "var(--text-3)", marginBottom: "0.25rem", textTransform: "uppercase" as const, letterSpacing: "0.05em" } as React.CSSProperties,
} as const;
