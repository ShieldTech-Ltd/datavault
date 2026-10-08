import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { TRANSACTIONS, Transaction } from "@/lib/mockData";

// ── type icons & colors ────────────────────────────────────────
const TYPE_META: Record<
  Transaction["type"],
  { icon: string; color: string; bg: string }
> = {
  Query:                { icon: "⚡", color: "#7c3aed", bg: "#7c3aed22" },
  Purchase:             { icon: "🛍️", color: "#3b82f6", bg: "#3b82f622" },
  Payout:               { icon: "↑",  color: "#16a34a", bg: "#16a34a22" },
  "Collection Published":{ icon: "📦", color: "#94a3b8", bg: "#94a3b822" },
  Refund:               { icon: "↓",  color: "#ef4444", bg: "#ef444422" },
};

const STATUS_STYLE: Record<
  Transaction["status"],
  { color: string; bg: string }
> = {
  Completed: { color: "var(--green-text)", bg: "var(--green-bg)" },
  Pending:   { color: "var(--yellow)",     bg: "var(--yellow-bg)" },
  Refunded:  { color: "var(--blue)",       bg: "var(--blue-bg)" },
  Failed:    { color: "var(--red)",        bg: "var(--red-bg)" },
};

// ── filter tabs ────────────────────────────────────────────────
type FilterTab = "All" | "Queries" | "Payments" | "Payouts" | "Collection Interactions";

function matchesTab(tx: Transaction, tab: FilterTab): boolean {
  if (tab === "All") return true;
  if (tab === "Queries") return tx.type === "Query";
  if (tab === "Payments") return tx.type === "Purchase";
  if (tab === "Payouts") return tx.type === "Payout";
  if (tab === "Collection Interactions")
    return tx.type === "Collection Published" || tx.type === "Refund";
  return true;
}

// ── copy button ────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy hash"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0 4px",
        color: copied ? "var(--green)" : "var(--text-3)",
        fontSize: "0.75rem",
        lineHeight: 1,
        position: "relative",
      }}
    >
      {copied ? "✓" : "⧉"}
      {copied && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0f172a",
            color: "#f1f5f9",
            fontSize: "0.68rem",
            padding: "2px 6px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          Copied!
        </span>
      )}
    </button>
  );
}

// ── small stat card ────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "0.75rem 1rem",
        minWidth: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: "1.15rem",
          fontWeight: 700,
          color: color ?? "var(--text)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "0.73rem", color: "var(--text-3)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── export helper ──────────────────────────────────────────────
function exportCsv(txs: Transaction[]) {
  const header = "ID,Type,Collection,Amount,From,Hash,Status,Date\n";
  const rows = txs
    .map((t) =>
      [t.id, t.type, t.collection, t.amount, t.from, t.toHash, t.status, t.date]
        .map((v) => `"${v}"`)
        .join(",")
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── main component ─────────────────────────────────────────────
export default function Transactions() {
  const { searchQuery } = useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [collectionFilter, setCollectionFilter] = useState("All Collections");

  // Unique collection names for dropdown
  const collectionNames = useMemo(() => {
    const names = Array.from(new Set(TRANSACTIONS.map((t) => t.collection).filter(Boolean)));
    return ["All Collections", ...names];
  }, []);

  const filtered = useMemo(() => {
    return TRANSACTIONS.filter((tx) => {
      if (!matchesTab(tx, activeTab)) return false;
      if (collectionFilter !== "All Collections" && tx.collection !== collectionFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !tx.collection.toLowerCase().includes(q) &&
          !tx.toHash.toLowerCase().includes(q) &&
          !tx.type.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [activeTab, collectionFilter, searchQuery]);

  // Summary stats
  const totalVolume = filtered
    .reduce((sum, t) => sum + parseFloat(t.amount), 0)
    .toFixed(2);
  const completedCount = filtered.filter((t) => t.status === "Completed").length;
  const pendingCount = filtered.filter((t) => t.status === "Pending").length;

  const filterTabs: FilterTab[] = [
    "All",
    "Queries",
    "Payments",
    "Payouts",
    "Collection Interactions",
  ];

  const tabStyle = (active: boolean): React.CSSProperties =>
    active
      ? {
          background: "var(--accent-bg)",
          color: "var(--accent)",
          border: "1px solid var(--accent-bdr)",
          borderRadius: 7,
          padding: "0.4rem 0.875rem",
          fontWeight: 600,
          fontSize: "0.8rem",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }
      : {
          background: "transparent",
          color: "var(--text-2)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          padding: "0.4rem 0.875rem",
          fontSize: "0.8rem",
          cursor: "pointer",
          whiteSpace: "nowrap",
        };

  return (
    <div style={{ padding: "2rem", maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Transaction History
        </h1>
        <p style={{ color: "var(--text-3)", marginTop: 6, fontSize: "0.875rem" }}>
          View all your queries, payments, and on-chain transactions.
        </p>
      </div>

      {/* Filter toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        {/* Type tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {filterTabs.map((t) => (
            <button key={t} style={tabStyle(activeTab === t)} onClick={() => setActiveTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.4rem 0.75rem",
              fontSize: "0.8rem",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            {collectionNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <button
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.4rem 0.875rem",
              fontSize: "0.8rem",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            All Filters &#9660;
          </button>

          <button
            onClick={() => exportCsv(filtered)}
            style={{
              background: "linear-gradient(135deg,#7c3aed,#6366f1)",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: "0.45rem 1rem",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Export
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <MiniStat label="Total Transactions" value={filtered.length} />
        <MiniStat label="Total Volume" value={`${totalVolume} MON`} color="var(--accent)" />
        <MiniStat label="Completed" value={completedCount} color="var(--green)" />
        <MiniStat label="Pending" value={pendingCount} color="var(--yellow)" />
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Type", "Collection", "Amount", "From", "To Hash", "Status", "Date"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--text-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "0.75rem 1rem",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: "3rem 1rem",
                      color: "var(--text-3)",
                      fontSize: "0.875rem",
                    }}
                  >
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const typeMeta = TYPE_META[tx.type];
                  const statusStyle = STATUS_STYLE[tx.status];
                  return (
                    <tr
                      key={tx.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--surface-2)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* TYPE */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 7,
                              background: typeMeta.bg,
                              color: typeMeta.color,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.85rem",
                              flexShrink: 0,
                            }}
                          >
                            {typeMeta.icon}
                          </span>
                          <span
                            style={{
                              fontSize: "0.82rem",
                              color: typeMeta.color,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tx.type}
                          </span>
                        </div>
                      </td>

                      {/* COLLECTION */}
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          fontSize: "0.82rem",
                          color: "var(--text-2)",
                        }}
                      >
                        {tx.collection || "—"}
                      </td>

                      {/* AMOUNT */}
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          fontSize: "0.82rem",
                          color:
                            parseFloat(tx.amount) > 0 ? "var(--green)" : "var(--text-3)",
                          fontWeight: parseFloat(tx.amount) > 0 ? 600 : 400,
                        }}
                      >
                        {tx.amount}
                      </td>

                      {/* FROM */}
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          fontSize: "0.78rem",
                          color: "var(--text-3)",
                          fontFamily: "monospace",
                        }}
                      >
                        {tx.from}
                      </td>

                      {/* TO HASH */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.78rem",
                              color: "var(--text-3)",
                              fontFamily: "monospace",
                            }}
                          >
                            {tx.toHash}
                          </span>
                          <CopyButton text={tx.toHash} />
                        </div>
                      </td>

                      {/* STATUS */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.6rem",
                            borderRadius: 99,
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {tx.status}
                        </span>
                      </td>

                      {/* DATE */}
                      <td
                        style={{
                          padding: "0.875rem 1rem",
                          fontSize: "0.78rem",
                          color: "var(--text-3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tx.date}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
