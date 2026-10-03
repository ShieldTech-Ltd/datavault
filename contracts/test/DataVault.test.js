const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataVault", function () {
  let contract, owner, buyer, other;
  const COLLECTION_ID = ethers.keccak256(ethers.toUtf8Bytes("demo-collection-v1"));
  const REQUEST_ID    = ethers.keccak256(ethers.toUtf8Bytes("req-001"));
  const PRICE         = ethers.parseEther("0.001");

  beforeEach(async function () {
    [owner, buyer, other] = await ethers.getSigners();
    const DataVault = await ethers.getContractFactory("DataVault");
    contract = await DataVault.deploy();
  });

  // ── registerCollection ──────────────────────────────────────────

  it("registers a collection and emits event", async function () {
    await expect(contract.connect(owner).registerCollection(COLLECTION_ID, PRICE))
      .to.emit(contract, "CollectionRegistered")
      .withArgs(COLLECTION_ID, owner.address, PRICE);

    const col = await contract.getCollection(COLLECTION_ID);
    expect(col.owner).to.equal(owner.address);
    expect(col.price).to.equal(PRICE);
    expect(col.policyVersion).to.equal(1n);
    expect(col.active).to.be.true;
  });

  it("rejects duplicate registration", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await expect(contract.connect(owner).registerCollection(COLLECTION_ID, PRICE))
      .to.be.revertedWith("already registered");
  });

  // ── updatePolicy ────────────────────────────────────────────────

  it("owner can pause and resume collection", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(owner).updatePolicy(COLLECTION_ID, PRICE, false);

    let col = await contract.getCollection(COLLECTION_ID);
    expect(col.active).to.be.false;
    expect(col.policyVersion).to.equal(2n);

    await contract.connect(owner).updatePolicy(COLLECTION_ID, PRICE, true);
    col = await contract.getCollection(COLLECTION_ID);
    expect(col.active).to.be.true;
    expect(col.policyVersion).to.equal(3n);
  });

  it("non-owner cannot update policy", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await expect(contract.connect(other).updatePolicy(COLLECTION_ID, PRICE, false))
      .to.be.revertedWith("not owner");
  });

  // ── openQuery ───────────────────────────────────────────────────

  it("buyer opens escrow with correct payment", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    )
      .to.emit(contract, "QueryOpened")
      .withArgs(REQUEST_ID, COLLECTION_ID, buyer.address, PRICE);

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.buyer).to.equal(buyer.address);
    expect(q.amount).to.equal(PRICE);
    expect(q.state).to.equal(0n); // Open
  });

  it("rejects incorrect payment amount", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE - 1n })
    ).to.be.revertedWith("incorrect payment");
  });

  it("rejects duplicate requestId", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    ).to.be.revertedWith("requestId already used");
  });

  it("rejects openQuery when collection is paused", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(owner).updatePolicy(COLLECTION_ID, PRICE, false);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    ).to.be.revertedWith("collection paused");
  });

  // ── settleQuery ─────────────────────────────────────────────────

  it("owner settles and receives payment", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });

    const before = await ethers.provider.getBalance(owner.address);
    const tx = await contract.connect(owner).settleQuery(REQUEST_ID);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * tx.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    expect(after).to.be.closeTo(before + PRICE - gas, ethers.parseEther("0.00001"));

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.state).to.equal(1n); // Settled
  });

  it("non-owner cannot settle", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(contract.connect(other).settleQuery(REQUEST_ID))
      .to.be.revertedWith("not collection owner");
  });

  // ── refundExpired ───────────────────────────────────────────────

  it("buyer can refund after timeout", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });

    // fast-forward past the 10-minute timeout
    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await contract.connect(buyer).refundExpired(REQUEST_ID);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * tx.gasPrice;
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after).to.be.closeTo(before + PRICE - gas, ethers.parseEther("0.00001"));

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.state).to.equal(2n); // Refunded
  });

  it("buyer cannot refund before timeout", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(contract.connect(buyer).refundExpired(REQUEST_ID))
      .to.be.revertedWith("timeout not elapsed");
  });
});
