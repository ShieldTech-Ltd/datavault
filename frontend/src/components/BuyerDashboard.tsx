import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { encodeFunctionData, formatEther, keccak256, toBytes } from "viem";
import { DATAVAULT_ABI, CONTRACT_ADDRESS, viemClient } from "@/lib/contract";
import { transactionExplorerUrl } from "@/lib/network";
import { verifyAnswerAnchor } from "@/lib/provenance";
import type { Collection } from '../production/api';
import { ArrowRight, ChatCircleText, ShieldCheck, Copy, ShareNetwork, CheckCircle } from '../production/icons';
import PaymentProgress from '../production/PaymentProgress';
import { SaveQuestion, savedQuestionMayFill } from '../production/SavedItems';
import {
  buyerHistoryMessage,
  executionMessage,
  queryRecoveryMessage,
  type CitedPassage,
  type QueryResult,
  type RecoveredAnswer,
} from "../../../shared/api";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 10143;
const CHAIN_LABEL =
  CHAIN_ID === 31337 ? "the local test chain" : "Monad testnet";
const HISTORY_KEY = `datavault_requests:${CHAIN_ID}:${
  CONTRACT_ADDRESS?.toLowerCase() ?? "unconfigured"
}`;
const LEGACY_HISTORY_KEY = "datavault_requests";
const SAMPLE_QUESTIONS = [
  "What information should a freelancer include on an invoice?",
  "Why might a sole trader use a separate business bank account?",
  "What records should a freelancer keep for business expenses?",
];

type Step =
  | "idle"
  | "quoting"
  | "quoted"
  | "awaiting_wallet"
  | "confirming_open"
  | "answering"
  | "settlement_pending"
  | "done"
  | "failed";
interface Quote {
  collectionId: string;
  collectionName: string;
  priceWei: string;
  priceDisplay: string;
}
interface Demo {
  collectionId: string;
  collectionName: string;
  ownerAddress: string;
  priceWei: string;
}
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
  responseDigest: string;
}

function readSafeHistory(key: string): SavedRequest[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    if (raw.length > 100_000) {
      localStorage.removeItem(key);
      return [];
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const bytes32 = /^0x[0-9a-fA-F]{64}$/;
    const address = /^0x[0-9a-fA-F]{40}$/;
    const safe = value
      .flatMap((item): SavedRequest[] => {
        if (
          !item ||
          typeof item !== "object" ||
          !bytes32.test(item.requestId) ||
          !bytes32.test(item.collectionId) ||
          !bytes32.test(item.openTxHash) ||
          !address.test(item.buyerAddress)
        )
          return [];
        return [
          {
            requestId: item.requestId,
            collectionId: item.collectionId,
            openTxHash: item.openTxHash,
            buyerAddress: item.buyerAddress,
            openedAt: Number(item.openedAt) || 0,
            outcome: String(item.outcome ?? "unknown"),
          },
        ];
      })
      .slice(0, 20);
    // Rewrite legacy records to remove previously persisted plaintext questions.
    if (JSON.stringify(safe) !== JSON.stringify(value))
      localStorage.setItem(key, JSON.stringify(safe));
    return safe;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage may be disabled. */
    }
    return [];
  }
}
function history(): SavedRequest[] {
  if (HISTORY_KEY !== LEGACY_HISTORY_KEY) readSafeHistory(LEGACY_HISTORY_KEY);
  return readSafeHistory(HISTORY_KEY);
}
function save(request: SavedRequest): SavedRequest[] {
  const next = [
    request,
    ...history().filter((item) => item.requestId !== request.requestId),
  ].slice(0, 20);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* Payment flow must survive disabled storage. */
  }
  return next;
}
async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function BuyerDashboard({
  selectedQuestion,
  selectedCollection,
  selectedRequest,
  dashboard = false,
  collections,
  onSettled,
}: {
  selectedQuestion?: {id:number;collectionId:string;question:string;version:number}|null;
  selectedCollection?: string | null;
  selectedRequest?: string | null;
  dashboard?: boolean;
  collections?: Collection[];
  onSettled?: () => void;
}) {
  const { primaryWallet } = useWallet();
  const address = primaryWallet?.address ?? "";
  const [demo, setDemo] = useState<Demo | null>(null);
  const [collectionId, setCollectionId] = useState("");
  const [question, setQuestion] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<DisplayAnswer | null>(null);
  const [anchorStatus, setAnchorStatus] = useState<
    "idle" | "checking" | "verified" | "unavailable" | "mismatch"
  >("idle");
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [historyMessage, setHistoryMessage] = useState("");
  const [current, setCurrent] = useState<SavedRequest | null>(null);
  const [refundAt, setRefundAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setRequests(
      history().filter(
        (item) => item.buyerAddress.toLowerCase() === address.toLowerCase()
      )
    );
    setCurrent(null);
    setAnswer(null);
    setQuote(null);
    setRefundAt(null);
    setStep("idle");
    setMessage("");
    setHistoryStatus("idle");
    setHistoryMessage("");
    fetch("/api/demo")
      .then((response) =>
        response.ok ? (response.json() as Promise<Demo>) : null
      )
      .then((item) => setDemo(item))
      .catch(() => setDemo(null));
  }, [address]);
  useEffect(() => {
    if (selectedCollection) changeCollection(selectedCollection);
  }, [selectedCollection]);
  useEffect(()=>{if(selectedQuestion){if(!savedQuestionMayFill(step)){setMessage('Finish or recover the current paid request before using another saved question.');return;}changeCollection(selectedQuestion.collectionId);setQuestion(selectedQuestion.question);setAnswer(null);setCurrent(null);setRefundAt(null);setMessage('Saved question filled. Review the live quote before paying.');}},[selectedQuestion?.id,selectedQuestion?.question,selectedQuestion?.version]);
  useEffect(() => {
    if (dashboard && !collectionId && collections?.length) changeCollection(collections.find(item => item.queryAvailable)?.collectionId ?? collections[0].collectionId);
  }, [dashboard, collections, collectionId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function remember(request: SavedRequest) {
    setCurrent(request);
    setRequests(
      save(request).filter(
        (item) => item.buyerAddress.toLowerCase() === address.toLowerCase()
      )
    );
  }
  function changeCollection(value: string) {
    setCollectionId(value);
    setQuote(null);
    setStep("idle");
  }
  function changeQuestion(value: string) {
    setQuestion(value);
    setQuote(null);
    if (step !== "settlement_pending" && step !== "failed") setStep("idle");
  }

  async function wallet() {
    if (!primaryWallet) throw new Error("Connect an EVM wallet first.");
    const client = await primaryWallet.getWalletClient();
    if ((await client.getChainId()) !== CHAIN_ID)
      throw new Error(`Switch your wallet to ${CHAIN_LABEL} (${CHAIN_ID}).`);
    return client;
  }
  async function signedHeaders(purpose: "answer" | "reconcile", requestId: string) {
    const client = await wallet();
    if (!CONTRACT_ADDRESS) throw new Error("Contract is not configured.");
    const timestamp = Date.now();
    const signature = await client.signMessage({
      message: queryRecoveryMessage(purpose, CHAIN_ID, CONTRACT_ADDRESS, requestId, timestamp),
    });
    return { "x-signature": signature, "x-timestamp": String(timestamp) };
  }
  async function loadRefundTime(request: SavedRequest) {
    if (!CONTRACT_ADDRESS) return;
    try {
      const query = (await viemClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: DATAVAULT_ABI,
        functionName: "getQuery",
        args: [request.requestId as `0x${string}`],
      })) as [`0x${string}`, string, bigint, number, bigint, number];
      setRefundAt(query[5] === 0 ? Number(query[4]) * 1000 + 600_000 : null);
    } catch {
      setRefundAt(null);
    }
  }

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    setStep("quoting");
    setMessage("");
    setAnswer(null);
    try {
      const response = await fetch("/api/queries/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, question }),
      });
      if (!response.ok) throw new Error(await response.text());
      setQuote((await response.json()) as Quote);
      setStep("quoted");
    } catch (error) {
      setMessage(String(error));
      setStep("idle");
    }
  }

  async function execute() {
    if (!quote || !CONTRACT_ADDRESS) return;
    setMessage("");
    setStep("awaiting_wallet");
    let request: SavedRequest | null = null;
    try {
      const client = await wallet();
      const requestId = keccak256(
        toBytes(`${address}:${Date.now()}:${crypto.randomUUID()}`)
      );
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "openQuery",
        args: [requestId, quote.collectionId as `0x${string}`],
      });
      const openTxHash = await client.sendTransaction({
        to: CONTRACT_ADDRESS,
        data,
        value: BigInt(quote.priceWei),
      });
      request = {
        requestId,
        collectionId: quote.collectionId,
        openTxHash,
        buyerAddress: address,
        openedAt: Date.now(),
        outcome: "open_pending",
      };
      remember(request);
      setStep("confirming_open");
      const receipt = await viemClient.waitForTransactionReceipt({
        hash: openTxHash,
      });
      if (receipt.status !== "success")
        throw new Error(
          "Opening transaction reverted. No payment was escrowed."
        );
      await loadRefundTime(request);
      await runOpenedRequest(request, question);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStep("failed");
      if (request) {
        remember({ ...request, outcome: "failed" });
        await loadRefundTime(request);
      }
    }
  }

  async function runOpenedRequest(request: SavedRequest, queryText: string) {
    if (!CONTRACT_ADDRESS) throw new Error("Contract is not configured.");
    const client = await wallet();
    const timestamp = Date.now();
    const signature = await client.signMessage({
      message: executionMessage(
        CHAIN_ID,
        CONTRACT_ADDRESS,
        request.requestId,
        request.collectionId,
        await sha256Hex(queryText),
        request.openTxHash,
        timestamp
      ),
    });
    setStep("answering");
    const response = await fetch("/api/queries/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": signature,
        "x-timestamp": String(timestamp),
      },
      body: JSON.stringify({
        requestId: request.requestId,
        collectionId: request.collectionId,
        question: queryText,
        openTxHash: request.openTxHash,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = (await response.json()) as QueryResult;
    if (result.outcome === "settlement_pending") {
      remember({ ...request, outcome: "settlement_pending" });
      setStep("settlement_pending");
      setMessage(
        result.settleTxHash
          ? "Settlement confirmation is uncertain. Check the chain status before retrying payment. Your answer remains private until settlement is confirmed."
          : "Settlement broadcast is uncertain. Check the chain status before retrying payment. If escrow stays open, you can refund after the timeout."
      );
      return;
    }
    if (result.outcome !== "settled" || !result.answer)
      throw new Error("Unexpected query result.");
    setAnswer({
      answer: result.answer,
      buyerAddress: request.buyerAddress,
      citedPassageIds: result.citedPassageIds ?? [],
      citedPassages: result.citedPassages ?? [],
      requestId: request.requestId,
      openTxHash: request.openTxHash,
      settleTxHash: result.settleTxHash,
      responseDigest: result.responseDigest ?? "",
    });
    remember({ ...request, outcome: "settled" });
    setStep("done"); onSettled?.();
  }

  async function resumeOpenRequest() {
    if (
      !current ||
      !question.trim() ||
      current.buyerAddress.toLowerCase() !== address.toLowerCase()
    )
      return;
    setMessage("");
    try {
      await runOpenedRequest(current, question);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStep("failed");
      remember({ ...current, outcome: "failed" });
      await loadRefundTime(current);
    }
  }

  async function recover(request: SavedRequest) {
    setCurrent(request);
    setCollectionId(request.collectionId);
    setQuote(null);
    setMessage("");
    setAnswer(null);
    await loadRefundTime(request);
    try {
      const response = await fetch(`/api/queries/${request.requestId}/answer`, {
        headers: await signedHeaders("answer", request.requestId),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as RecoveredAnswer;
      setAnswer({
        answer: result.answer,
        buyerAddress: request.buyerAddress,
        citedPassageIds: result.citedPassageIds,
        citedPassages: result.citedPassages ?? [],
        requestId: request.requestId,
        openTxHash: request.openTxHash,
        settleTxHash: result.settleTxHash,
        responseDigest: result.responseDigest,
      });
      remember({ ...request, outcome: "settled" });
      setStep("done"); onSettled?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStep("failed");
    }
  }

  async function recoverLinkedRequest() {
    if (!selectedRequest || !/^0x[0-9a-fA-F]{64}$/.test(selectedRequest)) {
      setMessage('A valid request ID is required.'); return;
    }
    try {
      if (!address || !CONTRACT_ADDRESS) throw new Error('Connect the buyer wallet first.');
      const response = await fetch(`/api/queries/${selectedRequest}/receipt`);
      if (!response.ok) throw new Error('This recorded request is unavailable.');
      const receipt = await response.json();
      const bytes32 = /^0x[0-9a-fA-F]{64}$/;
      if (receipt.requestId?.toLowerCase() !== selectedRequest.toLowerCase()
        || receipt.buyerAddress?.toLowerCase() !== address.toLowerCase()
        || receipt.contractAddress?.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()
        || receipt.chainId !== CHAIN_ID || !bytes32.test(receipt.collectionId)
        || !bytes32.test(receipt.openTxHash) || !Number.isFinite(receipt.createdAt)) {
        throw new Error('This receipt does not match your wallet and deployment.');
      }
      const request: SavedRequest = { requestId: receipt.requestId, collectionId: receipt.collectionId,
        openTxHash: receipt.openTxHash, buyerAddress: address, openedAt: receipt.createdAt, outcome: receipt.outcome };
      setCollectionId(request.collectionId);
      remember(request);
      if (request.outcome === 'settled') await recover(request);
      else { await loadRefundTime(request); setStep('settlement_pending'); setMessage('Recorded payment selected. Check settlement or refund when eligible.'); }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Recovery is unavailable.'); }
  }

  async function syncHistory() {
    if (!primaryWallet || !CONTRACT_ADDRESS) return;
    setHistoryStatus("loading");
    setHistoryMessage("");
    try {
      const client = await wallet();
      const timestamp = Date.now();
      const signature = await client.signMessage({
        message: buyerHistoryMessage(
          CHAIN_ID,
          CONTRACT_ADDRESS,
          address,
          timestamp
        ),
      });
      const response = await fetch(
        `/api/buyer/queries?address=${encodeURIComponent(address)}&limit=20`,
        {
          headers: {
            "x-signature": signature,
            "x-timestamp": String(timestamp),
          },
        }
      );
      if (!response.ok)
        throw new Error("Request history is unavailable. Try again.");
      const result = (await response.json()) as { requests: SavedRequest[] };
      const bytes32 = /^0x[0-9a-fA-F]{64}$/;
      const synced = result.requests
        .filter(
          (item) =>
            bytes32.test(item.requestId) &&
            bytes32.test(item.collectionId) &&
            bytes32.test(item.openTxHash) &&
            Number.isFinite(item.openedAt)
        )
        .map((item) => ({ ...item, buyerAddress: address }));
      const merged = [...synced, ...history()]
        .filter(
          (item, index, all) =>
            all.findIndex((other) => other.requestId === item.requestId) ===
            index
        )
        .sort((a, b) => b.openedAt - a.openedAt)
        .slice(0, 20);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
      } catch {
        /* Local storage is optional. */
      }
      setRequests(merged);
      setHistoryStatus("idle");
      setHistoryMessage(
        synced.length
          ? `Loaded ${synced.length} recorded requests.`
          : "No recorded requests for this wallet."
      );
    } catch (cause) {
      setHistoryStatus("error");
      setHistoryMessage(
        cause instanceof Error
          ? cause.message
          : "Could not load request history."
      );
    }
  }

  async function reconcile() {
    if (!current) return;
    setMessage("");
    try {
      const response = await fetch(
        `/api/queries/${current.requestId}/reconcile`,
        {
          method: "POST",
          headers: await signedHeaders(
            "reconcile",
            current.requestId
          ),
        }
      );
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as {
        outcome: string;
        message?: string;
      };
      if (result.outcome === "settled") {
        await recover(current);
      } else if (result.outcome === "refunded") {
        remember({ ...current, outcome: "refunded" });
        setRefundAt(null);
        setStep("idle");
        setMessage("This escrow was refunded on Monad.");
      } else if (result.outcome === "refundable") {
        remember({ ...current, outcome: "refundable" });
        await loadRefundTime(current);
        setStep("failed");
        setMessage(
          "Escrow is still open and the refund timeout has passed. You can claim the refund below."
        );
      } else if (result.outcome === "settlement_pending") {
        remember({ ...current, outcome: "settlement_pending" });
        await loadRefundTime(current);
        setStep("settlement_pending");
        setMessage(
          result.message ??
            "Settlement is still pending on Monad. Check again shortly."
        );
      } else {
        setStep("failed");
        setMessage(
          result.message ??
            "No answer is recorded. If escrow is open, retry the exact original question or refund after timeout."
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function refund() {
    if (!current || !CONTRACT_ADDRESS || refundAt === null || now < refundAt)
      return;
    setMessage("");
    try {
      const client = await wallet();
      const query = (await viemClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: DATAVAULT_ABI,
        functionName: "getQuery",
        args: [current.requestId as `0x${string}`],
      })) as [`0x${string}`, string, bigint, number, bigint, number];
      if (query[1].toLowerCase() !== address.toLowerCase())
        throw new Error("Connected wallet is not the escrow buyer.");
      if (query[5] !== 0) {
        remember({
          ...current,
          outcome: query[5] === 1 ? "settlement_pending" : "refunded",
        });
        setRefundAt(null);
        setStep(query[5] === 1 ? "settlement_pending" : "idle");
        throw new Error(
          query[5] === 1
            ? "Escrow already settled. Check settlement to recover the answer."
            : "Escrow was already refunded on Monad."
        );
      }
      const latestBlock = await viemClient.getBlock();
      if (latestBlock.timestamp < query[4] + 600n)
        throw new Error(
          "The on-chain refund timeout has not passed yet. Check again after the next block."
        );
      const data = encodeFunctionData({
        abi: DATAVAULT_ABI,
        functionName: "refundExpired",
        args: [current.requestId as `0x${string}`],
      });
      const hash = await client.sendTransaction({ to: CONTRACT_ADDRESS, data });
      const receipt = await viemClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error("Refund transaction reverted.");
      remember({ ...current, outcome: "refunded" });
      setRefundAt(null);
      setStep("idle");
      setMessage(`Refund confirmed. Transaction: ${hash}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const busy = [
    "quoting",
    "awaiting_wallet",
    "confirming_open",
    "answering",
  ].includes(step);
  const visibleRequests = requests.filter(
    (item) => item.buyerAddress.toLowerCase() === address.toLowerCase()
  );
  const visibleAnswer =
    answer && answer.buyerAddress.toLowerCase() === address.toLowerCase()
      ? answer
      : null;
  async function copyAnswer() {
    if (!visibleAnswer) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(visibleAnswer.answer);
      setMessage('Answer copied.');
    } catch { setMessage('Copy is unavailable. Select the answer text instead.'); }
  }
  useEffect(() => {
    if (!visibleAnswer) {
      setAnchorStatus("idle");
      return;
    }
    let active = true;
    setAnchorStatus("checking");
    void verifyAnswerAnchor(visibleAnswer).then((status) => {
      if (active) setAnchorStatus(status);
    });
    return () => {
      active = false;
    };
  }, [visibleAnswer]);
  return (
    <div className="workspace-grid">
      <section
        className="workspace-card query-card"
        aria-labelledby="query-heading"
      >
        <div className="workspace-card-header">
          <div>
            <span className="workspace-icon" aria-hidden="true">{dashboard ? '02' : <ChatCircleText size={19}/>}</span>
            <strong id="query-heading">{dashboard ? 'Ask a Question' : 'Query workspace'}</strong>
          </div>
          {!dashboard && <span className="workspace-caption">Buyer flow</span>}
        </div>
        <p className="workspace-description">
          {dashboard ? 'Select a collection, review its price, and get a cited answer.' : 'Ask a private collection. You review the live price before a wallet payment.'}
        </p>
        {demo && !dashboard && (
          <div className="workspace-demo">
            <div>
              <strong>{demo.collectionName}</strong>
              <span>Confirmed sample collection</span>
            </div>
            <span>{formatEther(BigInt(demo.priceWei))} test MON</span>
          </div>
        )}
        {!demo && !dashboard && (
          <p className="workspace-muted">
            The guided sample collection will appear after it is registered and
            confirmed on Monad.
          </p>
        )}
        {demo && !dashboard && (
          <div className="workspace-suggestions">
            <span>Suggested questions</span>
            {SAMPLE_QUESTIONS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  changeCollection(demo.collectionId);
                  changeQuestion(sample);
                }}
              >
                {sample}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={prepare} className="workspace-form">
          <label htmlFor="collection-id">{dashboard ? 'Select Collection' : 'Collection ID'}</label>
          {dashboard && collections?.length ? <select id="collection-id" value={collectionId} disabled={busy} onChange={event => changeCollection(event.target.value)}>{collections.map(item => <option key={item.collectionId} value={item.collectionId}>{item.name}{item.active ? '' : ' (Paused)'}</option>)}</select> : <input
            id="collection-id"
            value={collectionId}
            onChange={(event) => changeCollection(event.target.value)}
            placeholder="Choose a collection below or paste its ID"
            required
            disabled={busy}
          />}
          {dashboard && collections?.find(item => item.collectionId === collectionId) && <div className="dv-query-live-price"><strong>{formatEther(BigInt(collections.find(item => item.collectionId === collectionId)!.priceWei))} MON per query</strong><span>{collections.find(item => item.collectionId === collectionId)!.queryAvailable ? 'Available' : 'Unavailable'}</span></div>}
          <label htmlFor="query-question">Your question</label>
          <textarea
            id="query-question"
            rows={dashboard ? 3 : 4}
            value={question}
            onChange={(event) => changeQuestion(event.target.value)}
            placeholder="Ask a question about the collection"
            required
            maxLength={500}
            disabled={busy}
          />
          <div className="workspace-form-foot">
            <span>Up to 500 characters</span>
            <span>Selected passages are sent to the model provider</span>
          </div>
          <SaveQuestion collectionId={collectionId} question={question}/>
          <button
            type="submit"
            disabled={busy || !CONTRACT_ADDRESS}
            className="workspace-pay-button"
          >
            {step === "quoting" ? "Checking price..." : "Review current price"}{" "}
            <ArrowRight size={17} aria-hidden="true"/>
          </button>
          {!CONTRACT_ADDRESS && (
            <p className="workspace-muted">
              Paid queries become available after the Monad contract is
              configured.
            </p>
          )}
        </form>
        {quote && step === "quoted" && (
          <div className="workspace-quote">
            <div>
              <span>Current price for {quote.collectionName}</span>
              <strong>{quote.priceDisplay} test MON</strong>
            </div>
            <p>
              Your wallet opens escrow on Monad. The Worker checks the payment
              and current policy before reading private passages. An
              insufficient-evidence answer is still a paid query. A service
              failure with open escrow can be refunded after ten minutes.
            </p>
            <button
              type="button"
              onClick={execute}
              disabled={!primaryWallet}
              className="workspace-pay-button"
            >
              {primaryWallet ? "Sign and pay" : "Connect wallet to pay"}{" "}
              <ArrowRight size={17} aria-hidden="true"/>
            </button>
          </div>
        )}
        {step === "awaiting_wallet" && (
          <p className="workspace-notice">
            Check your wallet for the opening transaction.
          </p>
        )}
        {step === "confirming_open" && (
          <p className="workspace-notice">
            Opening transaction sent. Waiting for Monad confirmation.
          </p>
        )}
        {step === "answering" && (
          <p className="workspace-notice">
            Payment confirmed. Retrieving passages, generating an answer, and
            settling.
          </p>
        )}
        {current &&
          (step === "settlement_pending" || step === "failed") &&
          current.outcome !== "refunded" &&
          current.outcome !== "settled" && (
            <button
              type="button"
              onClick={reconcile}
              className="workspace-secondary-button"
            >
              Check settlement
            </button>
          )}
        {current &&
          (step === "settlement_pending" || step === "failed") &&
          current.outcome !== "settled" &&
          current.outcome !== "refunded" &&
          current.buyerAddress.toLowerCase() === address.toLowerCase() && (
            <div className="workspace-recovery">
              <p>
                If escrow is still open, re-enter the exact original question
                above and retry this request. This uses the existing payment.
                Questions are not saved in this browser.
              </p>
              <button
                type="button"
                onClick={() => void resumeOpenRequest()}
                disabled={!primaryWallet || !question.trim()}
                className="workspace-secondary-button"
              >
                Retry this paid request
              </button>
            </div>
          )}
        {message && (
          <p
            role="status"
            className={
              step === "failed" ? "workspace-error" : "workspace-notice"
            }
          >
            {message}
          </p>
        )}
        {current &&
          current.buyerAddress.toLowerCase() === address.toLowerCase() &&
          refundAt !== null &&
          step !== "done" && (
            <div className="workspace-recovery">
              <p>
                {now < refundAt
                  ? `Refund available in ${Math.ceil(
                      (refundAt - now) / 1000
                    )} seconds if escrow remains open.`
                  : "Refund timeout reached. Check settlement before refunding."}
              </p>
              <button
                type="button"
                disabled={now < refundAt}
                onClick={refund}
                className="workspace-secondary-button"
              >
                Claim expired refund
              </button>
            </div>
          )}
        {dashboard && (quote || current) && <PaymentProgress step={step} opened={Boolean(current)}/>}
        {(visibleRequests.length > 0 || primaryWallet) && (
          <div className="workspace-history">
            <h3>Your recent requests</h3>
            {selectedRequest && <button type="button" disabled={!primaryWallet} onClick={() => void recoverLinkedRequest()}>Recover linked request</button>}
            {primaryWallet && CONTRACT_ADDRESS && (
              <button
                type="button"
                onClick={() => void syncHistory()}
                disabled={historyStatus === "loading"}
              >
                {historyStatus === "loading"
                  ? "Loading..."
                  : "Sync from account"}
              </button>
            )}
            {historyMessage && <p role="status">{historyMessage}</p>}
            {visibleRequests.map((request) => (
              <div key={request.requestId}>
                <span>
                  <strong>{request.outcome}</strong>{" "}
                  {request.requestId.slice(0, 12)}...
                </span>
                <div>
                  <button type="button" onClick={() => recover(request)}>
                    Recover answer
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setCurrent(request);
                      setCollectionId(request.collectionId);
                      setQuote(null);
                      await loadRefundTime(request);
                      setStep("settlement_pending");
                    }}
                  >
                    Check or refund
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <aside
        className="workspace-card proof-card"
        aria-labelledby="proof-heading"
      >
        <div className="workspace-card-header">
          <div>
            <span className="proof-icon" aria-hidden="true">{dashboard ? '03' : <ShieldCheck size={19}/>}</span>
            <strong id="proof-heading">{dashboard ? 'AI Answer + Sources' : 'Proof of provenance'}</strong>
          </div>
          {dashboard ? <div className="dv-answer-actions"><button type="button" disabled={!visibleAnswer} onClick={() => void copyAnswer()}><Copy size={13}/>Copy</button><button type="button" disabled={!visibleAnswer || typeof navigator === 'undefined' || typeof navigator.share !== 'function'} onClick={() => { if (visibleAnswer) void navigator.share({ title: 'DataVault cited answer', text: visibleAnswer.answer }).catch(() => setMessage('Sharing was not completed.')); }}><ShareNetwork size={13}/>Share</button></div> : <span
            className={
              visibleAnswer ? "workspace-status settled" : "workspace-status"
            }
          >
            {visibleAnswer ? "Settled" : "Waiting"}
          </span>}
        </div>
        {visibleAnswer ? (
          <>
            {dashboard && <div className="dv-answer-success"><CheckCircle size={20} weight="fill"/>Answer generated and settled</div>}
            <div className="proof-answer">
              <span>Answer</span>
              <p>{visibleAnswer.answer}</p>
            </div>
            <h3>Key cited sources</h3>
            <div className="proof-citations">
              {visibleAnswer.citedPassageIds.map((id, index) => {
                const passage = visibleAnswer.citedPassages.find(
                  (item) => item.id === id
                );
                return (
                  <details key={id}>
                    <summary>
                      <b>{index + 1}</b>
                      {id}
                    </summary>
                    <p>
                      {passage?.text ??
                        "Passage text is available only in the original answer response."}
                    </p>
                  </details>
                );
              })}
            </div>
            <h3>On-chain receipt</h3>
            <p className="proof-limitation" role="status">
              {anchorStatus === "verified"
                ? "Answer digest matches the Monad settlement event."
                : anchorStatus === "checking"
                ? "Checking the answer digest against Monad..."
                : anchorStatus === "mismatch"
                ? "Answer digest does not match the settlement event. Do not rely on this answer."
                : "Answer digest verification is unavailable. Check the receipt and transaction manually."}
            </p>
            <dl className="proof-receipt">
              <div>
                <dt>Opening transaction</dt>
                <dd>
                  {visibleAnswer.openTxHash}
                  {transactionExplorerUrl(visibleAnswer.openTxHash) && (
                    <a
                      href={transactionExplorerUrl(visibleAnswer.openTxHash)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Monad explorer
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt>Settlement transaction</dt>
                <dd>
                  {visibleAnswer.settleTxHash ?? "Pending confirmation"}
                  {transactionExplorerUrl(visibleAnswer.settleTxHash) && (
                    <a
                      href={transactionExplorerUrl(visibleAnswer.settleTxHash)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Monad explorer
                    </a>
                  )}
                </dd>
              </div>
            </dl>
            <p className="proof-limitation">
              The receipt links the payment to a content version and cited
              passages. It does not establish that the answer is correct.
            </p>
            <a
              className="workspace-secondary-button"
              href={`/api/queries/${visibleAnswer.requestId}/receipt`}
              target="_blank"
              rel="noreferrer"
            >
              View public receipt
            </a>
          </>
        ) : (
          <div className="proof-empty">
            <div className="proof-empty-symbol" aria-hidden="true">
              <ShieldCheck size={32}/>
            </div>
            <h3>Your verified answer appears here</h3>
            <p>
              The answer, cited passages, and transaction receipt are shown
              after an actual paid query settles. No sample receipt is presented
              as a real transaction.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
