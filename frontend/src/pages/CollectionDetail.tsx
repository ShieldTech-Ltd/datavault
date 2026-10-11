import { useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import {
  COLLECTION_FILES,
  TRANSACTIONS,
  CollectionFile,
} from "@/lib/mockData";

const FILE_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  PDF:  { bg: "#ef4444", color: "#fff" },
  DOCX: { bg: "#3b82f6", color: "#fff" },
  MP4:  { bg: "#8b5cf6", color: "#fff" },
  MD:   { bg: "#64748b", color: "#fff" },
  TXT:  { bg: "#94a3b8", color: "#fff" },
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Verified:   { bg: "var(--green-bg)",    color: "var(--green-text)" },
  Processing: { bg: "var(--yellow-bg)",   color: "var(--yellow)" },
  Failed:     { bg: "var(--red-bg)",      color: "var(--red)" },
};

const TX_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Completed: { bg: "var(--green-bg)",  color: "var(--green-text)" },
  Pending:   { bg: "var(--yellow-bg)", color: "var(--yellow)" },
  Failed:    { bg: "var(--red-bg)",    color: "var(--red)" },
  Refunded:  { bg: "var(--surface-3)", color: "var(--text-2)" },
};

type Tab = "overview" | "content" | "analytics" | "transactions";

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { collections, updateCollection } = useApp();

  const col = useMemo(
    () => collections.find((c) => c.id === id),
    [collections, id]
  );

  const [activeTab, setActiveTab]     = useState<Tab>("content");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder]     = useState("newest");
  const [checkedIds, setCheckedIds]   = useState<Set<string>>(new Set());

  const filteredFiles = useMemo<CollectionFile[]>(() => {
    const q = searchQuery.toLowerCase();
    let files: CollectionFile[] = [...COLLECTION_FILES];
    if (q) files = files.filter((f) => f.name.toLowerCase().includes(q));
    if (sortOrder === "oldest") files = files.reverse();
    return files;
  }, [searchQuery, sortOrder]);

  const collectionTxs = useMemo(
    () => TRANSACTIONS.filter((t) => col && t.collection === col.name),
    [col]
  );

  if (!col) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 320, gap: "1rem", color: "var(--text)",
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          background: "var(--surface-3)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5">
            <rect x="2" y="2" width="9" height="9" rx="1.5"/><rect x="13" y="2" width="9" height="9" rx="1.5"/>
            <rect x="2" y="13" width="9" height="9" rx="1.5"/><rect x="13" y="13" width="9" height="9" rx="1.5"/>
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6 }}>Collection not found</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-2)" }}>This collection may have been removed or the ID is invalid.</div>
        </div>
        <button
          onClick={() => navigate("/collections")}
          style={{
            background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white",
            border: "none", borderRadius: 8, padding: "0.55rem 1.25rem",
            fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
          }}
        >
          ← Back to My Collections
        </button>
      </div>
    );
  }

  const initials = col.owner
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const toggleCheck = (fileId: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });

  const toggleAll = () => {
    if (checkedIds.size === filteredFiles.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "0.55rem 1rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
    color: activeTab === tab ? "var(--accent)" : "var(--text-2)",
    transition: "color 0.15s",
  });

  const primaryBtn: React.CSSProperties = {
    background: "linear-gradient(135deg,#7c3aed,#6366f1)",
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "0.55rem 1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.82rem",
  };

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text-2)",
    borderRadius: 8,
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontSize: "0.82rem",
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "0.45rem 0.75rem",
    color: "var(--text)",
    outline: "none",
    fontSize: "0.82rem",
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: "1.25rem",
  };

  return (
    <div style={{ color: "var(--text)" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.25rem", fontSize: "0.85rem" }}>
        <Link
          to="/collections"
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
        >
          My Collections
        </Link>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--text-2)" }}>{col.name}</span>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>

        {/* LEFT COLUMN */}
        <div style={{ width: 280, flexShrink: 0, position: "sticky", top: "1.5rem" }}>
          {/* Gradient thumbnail */}
          <div
            style={{
              height: 180,
              background: col.gradient,
              borderRadius: "var(--radius)",
              marginBottom: "1rem",
              boxShadow: "var(--shadow-md)",
            }}
          />

          {/* Stats block */}
          <div
            style={{
              ...card,
              marginBottom: "1rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
            }}
          >
            {[
              { value: `${col.files}`, label: "Files", color: "var(--blue)" },
              { value: "1,248", label: "Queries", color: "var(--accent)" },
              { value: "2.48 MON", label: "Earnings", color: "var(--green)" },
              { value: "99.9%", label: "Uptime", color: "var(--yellow)" },
            ].map(({ value, label, color }) => (
              <div
                key={label}
                style={{
                  background: "var(--surface-2)", borderRadius: 8,
                  padding: "0.6rem 0.75rem", textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1rem", fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Owner block */}
          <div style={card}>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-3)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: "0.65rem",
              }}
            >
              Owner
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{col.owner}</span>
            </div>
            <p
              style={{
                fontFamily: "monospace",
                fontSize: "0.76rem",
                color: "var(--text-3)",
                marginBottom: "0.75rem",
                wordBreak: "break-all",
              }}
            >
              {col.ownerAddress}
            </p>
            <button style={{ ...ghostBtn, width: "100%", padding: "0.4rem 0.75rem" }}>Tip Owner</button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.4rem" }}>{col.name}</h1>
          <p style={{ color: "var(--text-2)", fontSize: "0.9rem", marginBottom: "1.25rem", lineHeight: 1.6 }}>
            {col.description}
          </p>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              marginBottom: "1.25rem",
              gap: 4,
            }}
          >
            <button style={tabStyle("overview")}      onClick={() => setActiveTab("overview")}>Overview</button>
            <button style={tabStyle("content")}       onClick={() => setActiveTab("content")}>Content ({col.files})</button>
            <button style={tabStyle("analytics")}     onClick={() => setActiveTab("analytics")}>Analytics</button>
            <button style={tabStyle("transactions")}  onClick={() => setActiveTab("transactions")}>Transactions</button>
          </div>

          {/* ── Content Tab ── */}
          {activeTab === "content" && (
            <div>
              {/* Toolbar */}
              <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, flex: "1 1 180px" }}
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                </select>
                <button style={ghostBtn}>Filter ▼</button>
                <button style={primaryBtn}>+ Add Files</button>
              </div>

              {/* File table */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow)",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <th style={{ width: 36, padding: "0.7rem 1rem", textAlign: "left" }}>
                        <input
                          type="checkbox"
                          checked={checkedIds.size === filteredFiles.length && filteredFiles.length > 0}
                          onChange={toggleAll}
                          style={{ cursor: "pointer" }}
                        />
                      </th>
                      {["Title", "Type", "Size", "Added", "Status", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.7rem 1rem",
                            textAlign: "left",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-3)",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map((file) => {
                      const typeStyle = FILE_TYPE_COLORS[file.type] ?? { bg: "#64748b", color: "#fff" };
                      const stStyle   = STATUS_STYLES[file.status]  ?? { bg: "var(--surface-3)", color: "var(--text-2)" };
                      return (
                        <tr
                          key={file.id}
                          style={{ borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <input
                              type="checkbox"
                              checked={checkedIds.has(file.id)}
                              onChange={() => toggleCheck(file.id)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span
                                style={{
                                  background: typeStyle.bg,
                                  color: typeStyle.color,
                                  borderRadius: 5,
                                  padding: "2px 6px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                {file.type}
                              </span>
                              <span style={{ fontSize: "0.84rem", fontWeight: 500 }}>{file.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span
                              style={{
                                background: typeStyle.bg + "22",
                                color: typeStyle.bg,
                                borderRadius: 4,
                                padding: "2px 7px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              {file.type}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--text-2)" }}>
                            {file.size}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--text-2)" }}>
                            {file.added}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span
                              style={{
                                background: stStyle.bg,
                                color: stStyle.color,
                                borderRadius: 20,
                                padding: "3px 10px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              {file.status}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                            <button
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-3)",
                                fontSize: "1.1rem",
                                lineHeight: 1,
                                padding: "2px 6px",
                                borderRadius: 4,
                              }}
                            >
                              ···
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredFiles.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem" }}
                        >
                          No files match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Description card */}
              <div style={card}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.6rem" }}>
                  Description
                </p>
                <p style={{ color: "var(--text-2)", fontSize: "0.9rem", lineHeight: 1.7 }}>{col.description}</p>
              </div>

              {/* Meta grid */}
              <div
                style={{
                  ...card,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                {[
                  { label: "Status", value: col.status === "active" ? "Active" : "Paused" },
                  { label: "Price per Query", value: col.price },
                  { label: "Created", value: col.createdAt },
                  { label: "Rating", value: `★ ${col.rating}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "var(--text)", fontWeight: 600 }}>{value}</p>
                  </div>
                ))}

                {/* Categories */}
                <div>
                  <p style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    Categories
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {col.categories.map((cat) => (
                      <span
                        key={cat}
                        style={{
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                          border: "1px solid var(--accent-bdr)",
                          borderRadius: 20,
                          padding: "2px 10px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Collection ID */}
                <div>
                  <p style={{ fontSize: "0.73rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    Collection ID
                  </p>
                  <p style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-2)", wordBreak: "break-all" }}>
                    {col.collectionId}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() =>
                    updateCollection(col.id, {
                      status: col.status === "active" ? "paused" : "active",
                    })
                  }
                  style={
                    col.status === "active"
                      ? { ...ghostBtn, borderColor: "var(--red)", color: "var(--red)" }
                      : primaryBtn
                  }
                >
                  {col.status === "active" ? "Pause Access" : "Resume Access"}
                </button>
                <button style={ghostBtn}>Update Content</button>
              </div>
            </div>
          )}

          {/* ── Analytics Tab ── */}
          {activeTab === "analytics" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              {[
                { label: "Queries This Month", value: "648",              sub: "+12% vs last month" },
                { label: "Avg. Revenue / Query", value: "0.32 MON",      sub: "Stable pricing" },
                { label: "Unique Users",          value: "213",           sub: "Distinct wallets" },
                { label: "Total Earnings",        value: col.totalEarnings, sub: "All time" },
              ].map(({ label, value, sub }) => (
                <div key={label} style={card}>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    {label}
                  </p>
                  <p style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", margin: "0 0 4px" }}>{value}</p>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>{sub}</p>
                </div>
              ))}

              <div style={{ gridColumn: "1 / -1", ...card }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
                  Query Activity Summary
                </p>
                <p style={{ color: "var(--text-2)", fontSize: "0.88rem", lineHeight: 1.7 }}>
                  This collection received <strong>648 queries</strong> in the past 30 days with an average revenue
                  of <strong>0.32 MON per query</strong>. Peak usage occurred on weekdays between 10:00 and 16:00 UTC.
                  The most frequent topics include threat analysis, incident response workflows, and cloud security best
                  practices. Unique user wallets grew by 12% month-over-month.
                </p>
              </div>
            </div>
          )}

          {/* ── Transactions Tab ── */}
          {activeTab === "transactions" && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow)",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {["Type", "Amount", "From", "Status", "Date"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.7rem 1rem",
                          textAlign: "left",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--text-3)",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {collectionTxs.map((tx) => {
                    const st = TX_STATUS_STYLES[tx.status] ?? { bg: "var(--surface-3)", color: "var(--text-2)" };
                    return (
                      <tr key={tx.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.84rem", fontWeight: 600 }}>{tx.type}</td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.84rem", color: "var(--accent)", fontWeight: 700 }}>
                          {tx.amount}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-2)" }}>
                          {tx.from}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            style={{
                              background: st.bg,
                              color: st.color,
                              borderRadius: 20,
                              padding: "3px 10px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--text-2)" }}>
                          {tx.date}
                        </td>
                      </tr>
                    );
                  })}
                  {collectionTxs.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.85rem" }}
                      >
                        No transactions for this collection yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
