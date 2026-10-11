// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DataVault Query License
 *
 * Stores collection policy on-chain and manages per-query escrow.
 * Source passages, prompts, and AI answers are never stored here.
 *
 * Operator model
 * --------------
 * The owner registers with their own wallet (e.g. Dynamic embedded wallet).
 * They supply a separate operator address at registration time.
 * The operator is the Worker's settlement key: a hot wallet whose private key
 * is stored in Cloudflare Worker secrets.
 *
 * settleQuery must be called by the operator, not the owner.
 * Payment always goes to the owner. The operator never receives funds.
 * The owner can replace the operator at any time via updateOperator.
 *
 * This separates user identity (owner's Dynamic wallet) from automated
 * settlement (Worker's key) without sharing private keys.
 *
 * State machine per request:
 *   Open -> Settled  (answer digest recorded, payment released to owner)
 *   Open -> Refunded (timeout elapsed, payment returned to buyer)
 */
contract DataVault {
    // ─────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────

    struct Collection {
        address owner;
        address operator;     // Worker settlement key, authorized by owner
        uint256 price;        // wei per query
        uint32  policyVersion;
        bool    active;
    }

    enum QueryState { Open, Settled, Refunded }

    struct Query {
        bytes32    collectionId;
        address    buyer;
        uint256    amount;        // escrowed payment
        uint32     policyVersion; // policy version at time of openQuery
        uint64     openedAt;      // block.timestamp
        QueryState state;
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    mapping(bytes32 => Collection) public collections;
    mapping(bytes32 => Query)      public queries;

    uint64 public constant REFUND_TIMEOUT = 10 minutes;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    event CollectionRegistered(
        bytes32 indexed collectionId,
        address indexed owner,
        address indexed operator,
        uint256 price
    );
    event PolicyUpdated(
        bytes32 indexed collectionId,
        uint256 price,
        bool active,
        uint32 policyVersion
    );
    event OperatorUpdated(
        bytes32 indexed collectionId,
        address indexed newOperator
    );
    event QueryOpened(
        bytes32 indexed requestId,
        bytes32 indexed collectionId,
        address indexed buyer,
        uint256 amount
    );
    event QuerySettled(bytes32 indexed requestId, address indexed owner, bytes32 answerDigest);
    event QueryRefunded(bytes32 indexed requestId, address indexed buyer);

    // ─────────────────────────────────────────────────────────────
    // Owner: register
    // ─────────────────────────────────────────────────────────────

    /**
     * Register a new collection.
     * collectionId: derived off-chain from chain, contract, owner, and content hash.
     * operator:     the Worker's settlement wallet address. Must not be address(0).
     *               Payment always goes to msg.sender (the owner), never to the operator.
     */
    function registerCollection(
        bytes32 collectionId,
        uint256 price,
        address operator
    ) external {
        require(collections[collectionId].owner == address(0), "already registered");
        require(price > 0, "price must be nonzero");
        require(operator != address(0), "operator required");

        collections[collectionId] = Collection({
            owner:         msg.sender,
            operator:      operator,
            price:         price,
            policyVersion: 1,
            active:        true
        });

        emit CollectionRegistered(collectionId, msg.sender, operator, price);
    }

    // ─────────────────────────────────────────────────────────────
    // Owner: update policy
    // ─────────────────────────────────────────────────────────────

    /**
     * Update price and active status. Increments policyVersion so the Worker
     * detects stale policy checks. Only the owner can call this.
     */
    function updatePolicy(
        bytes32 collectionId,
        uint256 price,
        bool active
    ) external {
        Collection storage col = collections[collectionId];
        require(col.owner == msg.sender, "not owner");
        require(price > 0, "price must be nonzero");

        col.price         = price;
        col.active        = active;
        col.policyVersion += 1;

        emit PolicyUpdated(collectionId, price, active, col.policyVersion);
    }

    /**
     * Replace the operator address. Only the owner can call this.
     * Use this if the Worker settlement key is rotated.
     */
    function updateOperator(bytes32 collectionId, address newOperator) external {
        Collection storage col = collections[collectionId];
        require(col.owner == msg.sender, "not owner");
        require(newOperator != address(0), "operator required");

        col.operator = newOperator;
        emit OperatorUpdated(collectionId, newOperator);
    }

    // ─────────────────────────────────────────────────────────────
    // Buyer: open escrow
    // ─────────────────────────────────────────────────────────────

    /**
     * Place payment in escrow for a query. msg.value must exactly match
     * the collection's current price. The requestId must be globally unique.
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
    // Operator: settle before releasing a recorded answer
    // ─────────────────────────────────────────────────────────────

    /**
     * Called by the Worker (operator) after recording a cited answer and
     * before returning it to the buyer. The buyer can recover the answer
     * after settlement if the Worker exits before delivery.
     * Only the registered operator may call this.
     * Payment is always released to the collection owner, never to the operator.
     */
    function settleQuery(bytes32 requestId, bytes32 answerDigest) external {
        Query storage q = queries[requestId];
        require(q.buyer != address(0), "unknown request");
        require(q.state == QueryState.Open, "already finalised");
        require(answerDigest != bytes32(0), "answer digest required");

        Collection storage col = collections[q.collectionId];
        require(col.operator == msg.sender, "not authorized operator");

        q.state = QueryState.Settled;

        (bool ok, ) = col.owner.call{value: q.amount}("");
        require(ok, "transfer failed");

        emit QuerySettled(requestId, col.owner, answerDigest);
    }

    // ─────────────────────────────────────────────────────────────
    // Buyer: refund after timeout
    // ─────────────────────────────────────────────────────────────

    /**
     * The buyer calls this after REFUND_TIMEOUT elapses and the Worker has
     * not settled (model or service failure). No Worker involvement needed.
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
