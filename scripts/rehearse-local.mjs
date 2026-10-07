#!/usr/bin/env node
// Exercises the real local contract, Worker, D1, R2, and a local HTTPS model stub.
// Requires Hardhat on 127.0.0.1:8545 and Wrangler on 127.0.0.1:8790.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const api = "http://127.0.0.1:8790";
const rpc = "http://127.0.0.1:8545";
const vars = Object.fromEntries(
  readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);
assert.equal(
  vars.CHAIN_ID,
  "31337",
  "This rehearsal only runs on a local chain"
);
assert.equal(vars.MONAD_RPC_URL, rpc, "RPC must be the loopback Hardhat chain");
assert.equal(
  vars.MODEL_API_BASE,
  "https://127.0.0.1:9443/v1",
  "Model must be the local stub"
);
assert.match(vars.CONTRACT_ADDRESS ?? "", /^0x[0-9a-fA-F]{40}$/);

const provider = new ethers.JsonRpcProvider(rpc);
assert.equal((await provider.getNetwork()).chainId, 31337n);
const contractAddress = vars.CONTRACT_ADDRESS;
assert.notEqual(await provider.getCode(contractAddress), "0x");
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../artifacts/contracts/DataVault.sol/DataVault.json",
      import.meta.url
    ),
    "utf8"
  )
);
const owner = await provider.getSigner(1);
const buyer = await provider.getSigner(2);
const stranger = await provider.getSigner(3);
const ownerAddress = await owner.getAddress();
const buyerAddress = await buyer.getAddress();
const operatorAddress = new ethers.Wallet(vars.SETTLEMENT_PRIVATE_KEY).address;
assert(
  (await provider.getBalance(operatorAddress)) > 0n,
  "Fund the local operator before running"
);
const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}
function signedHeaders(signature, timestamp) {
  return { "x-signature": signature, "x-timestamp": String(timestamp) };
}

const content = `# Local rehearsal guide\n\nKeep clear records of invoices and expenses. Retain the date, amount, and purpose of each item.\n\nRehearsal ID: ${randomBytes(
  8
).toString("hex")}.`;
const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));
const priceWei = ethers.parseEther("0.001");
const timestamp = Date.now();
const registration = [
  "datavault-register",
  31337,
  contractAddress.toLowerCase(),
  ownerAddress.toLowerCase(),
  contentHash.toLowerCase(),
  priceWei.toString(),
  timestamp,
].join(":");
const form = new FormData();
form.set(
  "file",
  new File([content], `local-rehearsal-${randomBytes(4).toString("hex")}.md`, {
    type: "text/markdown",
  })
);
form.set("priceWei", priceWei.toString());
form.set("ownerAddress", ownerAddress);
const staged = await request("/api/collections", {
  method: "POST",
  body: form,
  headers: signedHeaders(await owner.signMessage(registration), timestamp),
});
assert.equal(
  staged.status,
  200,
  `Registration failed: ${JSON.stringify(staged.body)}`
);
const { collectionId, txCalldata } = staged.body;
const registeredTx = await owner.sendTransaction({
  to: contractAddress,
  data: txCalldata,
});
assert.equal((await registeredTx.wait()).status, 1);
const confirmed = await request(`/api/collections/${collectionId}/confirm`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ txHash: registeredTx.hash, ownerAddress }),
});
assert.equal(
  confirmed.status,
  200,
  `Confirmation failed: ${JSON.stringify(confirmed.body)}`
);

const listed = await request("/api/collections?search=local-rehearsal");
assert.equal(listed.status, 200);
assert(
  listed.body.collections.some((item) => item.collectionId === collectionId)
);
const ownerTime = Date.now();
const ownerMessage = [
  "datavault-owner-summary",
  31337,
  contractAddress.toLowerCase(),
  ownerAddress.toLowerCase(),
  ownerTime,
].join(":");
const owned = await request(`/api/owner/collections?address=${ownerAddress}`, {
  headers: signedHeaders(await owner.signMessage(ownerMessage), ownerTime),
});
assert.equal(owned.status, 200);
assert(
  owned.body.collections.some((item) => item.collectionId === collectionId)
);

const question = "What records should I keep?";
const quote = await request("/api/queries/prepare", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ collectionId, question }),
});
assert.equal(quote.status, 200, `Quote failed: ${JSON.stringify(quote.body)}`);
assert.equal(quote.body.priceWei, priceWei.toString());
const requestId = ethers.keccak256(randomBytes(32));
const ownerBalanceBefore = BigInt(
  await provider.send("eth_getBalance", [ownerAddress, "latest"])
);
const openTx = await contract
  .connect(buyer)
  .openQuery(requestId, collectionId, { value: priceWei });
assert.equal((await openTx.wait()).status, 1);
const digest = createHash("sha256").update(question).digest("hex");
const executeTime = Date.now();
const execution = [
  "datavault-execute",
  31337,
  contractAddress.toLowerCase(),
  requestId.toLowerCase(),
  collectionId.toLowerCase(),
  digest,
  openTx.hash.toLowerCase(),
  executeTime,
].join(":");
const executeBody = JSON.stringify({
  requestId,
  collectionId,
  question,
  openTxHash: openTx.hash,
});
const denied = await request("/api/queries/execute", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...signedHeaders(await stranger.signMessage(execution), executeTime),
  },
  body: executeBody,
});
assert.equal(
  denied.status,
  403,
  "A different wallet must not execute the buyer's escrow"
);
const executed = await request("/api/queries/execute", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...signedHeaders(await buyer.signMessage(execution), executeTime),
  },
  body: executeBody,
});
assert.equal(
  executed.status,
  200,
  `Execution failed: ${JSON.stringify(executed.body)}`
);
assert.equal(executed.body.outcome, "settled");
assert.match(executed.body.answer, /\[Passage /);
assert(executed.body.citedPassages.length > 0);
assert.equal((await contract.getQuery(requestId)).state, 1n);
assert.equal(
  BigInt(await provider.send("eth_getBalance", [ownerAddress, "latest"])),
  ownerBalanceBefore + priceWei
);
const receipt = await request(`/api/queries/${requestId}/receipt`);
assert.equal(receipt.status, 200);
assert.equal(receipt.body.amountWei, priceWei.toString());
assert.equal(receipt.body.outcome, "settled");
assert(!JSON.stringify(receipt.body).includes(executed.body.answer));

const recoveryTime = Date.now();
const answerPath = `/api/queries/${requestId}/answer`;
const rejectedRecovery = await request(answerPath, {
  headers: signedHeaders(
    await stranger.signMessage(`datavault-answer:${requestId}:${recoveryTime}`),
    recoveryTime
  ),
});
assert.equal(rejectedRecovery.status, 403);
const recovered = await request(answerPath, {
  headers: signedHeaders(
    await buyer.signMessage(`datavault-answer:${requestId}:${recoveryTime}`),
    recoveryTime
  ),
});
assert.equal(recovered.status, 200);
assert.equal(recovered.body.answer, executed.body.answer);
const historyTime = Date.now();
const historyMessage = [
  "datavault-buyer-history",
  31337,
  contractAddress.toLowerCase(),
  buyerAddress.toLowerCase(),
  historyTime,
].join(":");
const buyerHistory = await request(
  `/api/buyer/queries?address=${buyerAddress}`,
  {
    headers: signedHeaders(
      await buyer.signMessage(historyMessage),
      historyTime
    ),
  }
);
assert.equal(buyerHistory.status, 200);
assert(buyerHistory.body.requests.some((item) => item.requestId === requestId));
assert(!JSON.stringify(buyerHistory.body).includes(executed.body.answer));
const analytics = await request("/api/marketplace/analytics");
assert.equal(analytics.status, 200);
assert(analytics.body.paidQueries >= 1);
assert(
  analytics.body.recentActivity.some((item) => item.requestId === requestId)
);
const ownerAnalyticsTime = Date.now();
const ownerAnalyticsMessage = [
  "datavault-owner-summary",
  31337,
  contractAddress.toLowerCase(),
  ownerAddress.toLowerCase(),
  ownerAnalyticsTime,
].join(":");
const ownerAnalytics = await request(
  `/api/owner/analytics?address=${ownerAddress}`,
  {
    headers: signedHeaders(
      await owner.signMessage(ownerAnalyticsMessage),
      ownerAnalyticsTime
    ),
  }
);
assert.equal(ownerAnalytics.status, 200);
assert(ownerAnalytics.body.paidQueries >= 1);
assert(
  ownerAnalytics.body.recentActivity.some(
    (item) => item.requestId === requestId
  )
);

const refundableId = ethers.keccak256(randomBytes(32));
const refundableTx = await contract
  .connect(buyer)
  .openQuery(refundableId, collectionId, { value: priceWei });
assert.equal((await refundableTx.wait()).status, 1);
const pausedTx = await contract
  .connect(owner)
  .updatePolicy(collectionId, priceWei, false);
assert.equal((await pausedTx.wait()).status, 1);
const pausedQuote = await request("/api/queries/prepare", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ collectionId, question }),
});
assert.equal(
  pausedQuote.status,
  403,
  "A paused collection must reject new quotes"
);
const pausedTime = Date.now();
const pausedExecution = [
  "datavault-execute",
  31337,
  contractAddress.toLowerCase(),
  refundableId.toLowerCase(),
  collectionId.toLowerCase(),
  digest,
  refundableTx.hash.toLowerCase(),
  pausedTime,
].join(":");
const pausedResult = await request("/api/queries/execute", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...signedHeaders(await buyer.signMessage(pausedExecution), pausedTime),
  },
  body: JSON.stringify({
    requestId: refundableId,
    collectionId,
    question,
    openTxHash: refundableTx.hash,
  }),
});
assert.equal(
  pausedResult.status,
  403,
  "A paused collection must reject execution before retrieval"
);
await provider.send("evm_increaseTime", [601]);
await provider.send("evm_mine", []);
const refundTx = await contract.connect(buyer).refundExpired(refundableId);
assert.equal((await refundTx.wait()).status, 1);
assert.equal((await contract.getQuery(refundableId)).state, 2n);
console.log(
  JSON.stringify(
    {
      result: "LOCAL E2E PASSED",
      chainId: 31337,
      contractAddress,
      collectionId,
      requestId,
      openTxHash: openTx.hash,
      settleTxHash: executed.body.settleTxHash,
      refundTxHash: refundTx.hash,
      verified: [
        "registration",
        "owner catalogue",
        "quote",
        "escrow",
        "wrong buyer denial",
        "cited answer",
        "settlement",
        "owner payout",
        "receipt",
        "answer recovery",
        "buyer history",
        "analytics",
        "owner analytics",
        "pause enforcement",
        "timeout refund",
      ],
    },
    null,
    2
  )
);
