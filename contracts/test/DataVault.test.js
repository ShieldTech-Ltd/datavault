const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataVault", function () {
  let contract, owner, operator, buyer, other;
  const COLLECTION_ID = ethers.keccak256(ethers.toUtf8Bytes("demo-collection-v1"));
  const REQUEST_ID    = ethers.keccak256(ethers.toUtf8Bytes("req-001"));
  const PRICE         = ethers.parseEther("0.001");

  beforeEach(async function () {
    [owner, operator, buyer, other] = await ethers.getSigners();
    const DataVault = await ethers.getContractFactory("DataVault");
    contract = await DataVault.deploy();
  });

  // ── registerCollection ──────────────────────────────────────────

  it("registers a collection with a separate operator and emits event", async function () {
    await expect(
      contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address)
    )
      .to.emit(contract, "CollectionRegistered")
      .withArgs(COLLECTION_ID, owner.address, operator.address, PRICE);

    const col = await contract.getCollection(COLLECTION_ID);
    expect(col.owner).to.equal(owner.address);
    expect(col.operator).to.equal(operator.address);
    expect(col.price).to.equal(PRICE);
    expect(col.policyVersion).to.equal(1n);
    expect(col.active).to.be.true;
  });

  it("rejects duplicate registration", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address)
    ).to.be.revertedWith("already registered");
  });

  it("rejects registration with zero operator address", async function () {
    await expect(
      contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, ethers.ZeroAddress)
    ).to.be.revertedWith("operator required");
  });

  // ── updatePolicy ────────────────────────────────────────────────

  it("owner can pause and resume collection, bumping policyVersion", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
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
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(other).updatePolicy(COLLECTION_ID, PRICE, false)
    ).to.be.revertedWith("not owner");
  });

  // ── updateOperator ───────────────────────────────────────────────

  it("owner can replace the operator", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(contract.connect(owner).updateOperator(COLLECTION_ID, other.address))
      .to.emit(contract, "OperatorUpdated")
      .withArgs(COLLECTION_ID, other.address);

    const col = await contract.getCollection(COLLECTION_ID);
    expect(col.operator).to.equal(other.address);
  });

  it("non-owner cannot replace the operator", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(other).updateOperator(COLLECTION_ID, other.address)
    ).to.be.revertedWith("not owner");
  });

  it("rejects zero address as new operator", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(owner).updateOperator(COLLECTION_ID, ethers.ZeroAddress)
    ).to.be.revertedWith("operator required");
  });

  // ── openQuery ───────────────────────────────────────────────────

  it("buyer opens escrow with correct payment", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    )
      .to.emit(contract, "QueryOpened")
      .withArgs(REQUEST_ID, COLLECTION_ID, buyer.address, PRICE);

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.buyer).to.equal(buyer.address);
    expect(q.amount).to.equal(PRICE);
    expect(q.state).to.equal(0n);
  });

  it("rejects incorrect payment amount", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE - 1n })
    ).to.be.revertedWith("incorrect payment");
  });

  it("rejects duplicate requestId", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    ).to.be.revertedWith("requestId already used");
  });

  it("rejects openQuery when collection is paused", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(owner).updatePolicy(COLLECTION_ID, PRICE, false);
    await expect(
      contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE })
    ).to.be.revertedWith("collection paused");
  });

  // ── settleQuery (operator model) ────────────────────────────────

  it("operator settles and owner receives payment (not the operator)", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });

    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const operatorBefore = await ethers.provider.getBalance(operator.address);

    const tx = await contract.connect(operator).settleQuery(REQUEST_ID);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * tx.gasPrice;

    const ownerAfter = await ethers.provider.getBalance(owner.address);
    const operatorAfter = await ethers.provider.getBalance(operator.address);

    // Owner received the payment
    expect(ownerAfter).to.be.closeTo(ownerBefore + PRICE, ethers.parseEther("0.00001"));
    // Operator only spent gas, received nothing
    expect(operatorAfter).to.be.closeTo(operatorBefore - gasCost, ethers.parseEther("0.00001"));

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.state).to.equal(1n);
  });

  it("owner cannot settle their own collection (must use operator)", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(contract.connect(owner).settleQuery(REQUEST_ID))
      .to.be.revertedWith("not authorized operator");
  });

  it("random address cannot settle", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(contract.connect(other).settleQuery(REQUEST_ID))
      .to.be.revertedWith("not authorized operator");
  });

  it("cannot settle an already settled query", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await contract.connect(operator).settleQuery(REQUEST_ID);
    await expect(contract.connect(operator).settleQuery(REQUEST_ID))
      .to.be.revertedWith("already finalised");
  });

  it("new operator can settle after updateOperator", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(owner).updateOperator(COLLECTION_ID, other.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });

    // Old operator can no longer settle
    await expect(contract.connect(operator).settleQuery(REQUEST_ID))
      .to.be.revertedWith("not authorized operator");

    // New operator can settle
    await expect(contract.connect(other).settleQuery(REQUEST_ID))
      .to.emit(contract, "QuerySettled")
      .withArgs(REQUEST_ID, owner.address);
  });

  // ── refundExpired ───────────────────────────────────────────────

  it("buyer can refund after timeout", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });

    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await contract.connect(buyer).refundExpired(REQUEST_ID);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * tx.gasPrice;
    const after = await ethers.provider.getBalance(buyer.address);

    expect(after).to.be.closeTo(before + PRICE - gas, ethers.parseEther("0.00001"));

    const q = await contract.getQuery(REQUEST_ID);
    expect(q.state).to.equal(2n);
  });

  it("buyer cannot refund before timeout", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await expect(contract.connect(buyer).refundExpired(REQUEST_ID))
      .to.be.revertedWith("timeout not elapsed");
  });

  it("cannot refund an already settled query", async function () {
    await contract.connect(owner).registerCollection(COLLECTION_ID, PRICE, operator.address);
    await contract.connect(buyer).openQuery(REQUEST_ID, COLLECTION_ID, { value: PRICE });
    await contract.connect(operator).settleQuery(REQUEST_ID);
    await ethers.provider.send("evm_increaseTime", [600]);
    await ethers.provider.send("evm_mine", []);
    await expect(contract.connect(buyer).refundExpired(REQUEST_ID))
      .to.be.revertedWith("already finalised");
  });
});
