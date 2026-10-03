// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DataVault Query License
 *
 * Stores collection policy on-chain and manages per-query escrow.
 * Source passages, prompts, and AI answers are never stored here.
 *
 * State machine per request:
 *   Open -> Settled (answer delivered, payment released to owner)
 *   Open -> Refunded (timeout elapsed, payment returned to buyer)
 */
contract DataVault {
    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────

    struct Collection {
        address owner;
        uint256 price;        // wei per query
        uint32  policyVersion;
        bool    active;
    }

    enum QueryState { Open, Settled, Refunded }

    struct Query {
        bytes32     collectionId;
        address     buyer;
        uint256     amount;       // escrowed payment
        uint32      policyVersion; // policy version at time of openQuery
        uint64      openedAt;     // block.timestamp
        QueryState  state;
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    mapping(bytes32 => Collection) public collections;
    mapping(bytes32 => Query)      public queries;

    // Seconds a buyer must wait before calling refundExpired
    uint64 public constant REFUND_TIMEOUT = 10 minutes;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    event CollectionRegistered(bytes32 indexed collectionId, address indexed owner, uint256 price);
    event PolicyUpdated(bytes32 indexed collectionId, uint256 price, bool active, uint32 policyVersion);
    event QueryOpened(bytes32 indexed requestId, bytes32 indexed collectionId, address indexed buyer, uint256 amount);
    event QuerySettled(bytes32 indexed requestId, address indexed owner);
    event QueryRefunded(bytes32 indexed requestId, address indexed buyer);

    // ─────────────────────────────────────────────────────────────
    // Owner: register and update
    // ─────────────────────────────────────────────────────────────

    /**
     * Register a new collection. The collectionId is derived off-chain
     * (e.g. keccak256 of the owner address + content hash).
     */
    function registerCollection(bytes32 collectionId, uint256 price) external {
        require(collections[collectionId].owner == address(0), "already registered");
        require(price > 0, "price must be nonzero");

        collections[collectionId] = Collection({
            owner:         msg.sender,
            price:         price,
            policyVersion: 1,
            active:        true
        });

        emit CollectionRegistered(collectionId, msg.sender, price);
    }

    /**
     * Update price and active status. Increments policyVersion so
     * the Worker can detect a stale policy check.
     */
    function updatePolicy(bytes32 collectionId, uint256 price, bool active) external {
        Collection storage col = collections[collectionId];
        require(col.owner == msg.sender, "not owner");
        require(price > 0, "price must be nonzero");

        col.price         = price;
        col.active        = active;
        col.policyVersion += 1;

        emit PolicyUpdated(collectionId, price, active, col.policyVersion);
    }

    // ─────────────────────────────────────────────────────────────
    // Buyer: open escrow
    // ─────────────────────────────────────────────────────────────

    /**
     * Place payment in escrow for a specific query. The requestId must
     * be unique (generated off-chain, stored in D1 before this call).
     * msg.value must exactly match the collection's current price.
     */
    function openQuery(bytes32 requestId, bytes32 collectionId) external payable {
        Collection storage col = collections[collectionId];
        require(col.owner != address(0), "collection not found");
        require(col.active, "collection paused");
        require(msg.value == col.price, "incorrect payment");
        require(queries[requestId].buyer == address(0), "requestId already used");

        queries[requestId] = Query({
            collectionId:  collectionId,
            buyer:         msg.sender,
            amount:        msg.value,
            policyVersion: col.policyVersion,
            openedAt:      uint64(block.timestamp),
            state:         QueryState.Open
        });

        emit QueryOpened(requestId, collectionId, msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────────────────────
    // Worker: settle after successful answer
    // ─────────────────────────────────────────────────────────────

    /**
     * Called by the Worker after delivering a cited answer. Releases
     * escrowed payment to the collection owner.
     *
     * Only the collection owner can settle (Worker holds the owner key
     * in Worker secrets).
     */
    function settleQuery(bytes32 requestId) external {
        Query storage q = queries[requestId];
        require(q.buyer != address(0), "unknown request");
        require(q.state == QueryState.Open, "already finalised");

        Collection storage col = collections[q.collectionId];
        require(col.owner == msg.sender, "not collection owner");

        q.state = QueryState.Settled;

        (bool ok, ) = col.owner.call{value: q.amount}("");
        require(ok, "transfer failed");

        emit QuerySettled(requestId, col.owner);
    }

    // ─────────────────────────────────────────────────────────────
    // Buyer: refund after timeout
    // ─────────────────────────────────────────────────────────────

    /**
     * The buyer calls this after REFUND_TIMEOUT has elapsed and the
     * Worker has not settled the query (model or service failure).
     */
    function refundExpired(bytes32 requestId) external {
        Query storage q = queries[requestId];
        require(q.buyer == msg.sender, "not buyer");
        require(q.state == QueryState.Open, "already finalised");
        require(block.timestamp >= q.openedAt + REFUND_TIMEOUT, "timeout not elapsed");

        q.state = QueryState.Refunded;

        (bool ok, ) = q.buyer.call{value: q.amount}("");
        require(ok, "transfer failed");

        emit QueryRefunded(requestId, q.buyer);
    }

    // ─────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────

    function getCollection(bytes32 collectionId) external view returns (Collection memory) {
        return collections[collectionId];
    }

    function getQuery(bytes32 requestId) external view returns (Query memory) {
        return queries[requestId];
    }
}
