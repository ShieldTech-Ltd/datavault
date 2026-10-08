import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import {
  CHART_DATA,
  EARNINGS_BREAKDOWN,
  PAYOUTS,
  COLLECTIONS,
} from "@/lib/mockData";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ── helpers ────────────────────────────────────────────────────
function weeklyData() {
  const weeks = [
    { date: "Week 1", earnings: 0, queries: 0 },
    { date: "Week 2", earnings: 0, queries: 0 },
    { date: "Week 3", earnings: 0, queries: 0 },
    { date: "Week 4", earnings: 0, queries: 0 },
  ];
  CHART_DATA.forEach((p, i) => {
    const wi = Math.min(Math.floor(i / 7), 3);
    weeks[wi].earnings += p.earnings;
    weeks[wi].queries += p.queries;
  });
  return weeks.map((w) => ({ ...w, earnings: parseFloat(w.earnings.toFixed(2)) }));
}

function monthlyData() {
  const total = CHART_DATA.reduce(
    (acc, p) => ({ earnings: acc.earnings + p.earnings, queries: acc.queries + p.queries }),
    { earnings: 0, queries: 0 }
  );
  return [{ date: "March", earnings: parseFloat(total.earnings.toFixed(2)), queries: total.queries }];
}

// ── stat card ──────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: accent + "22",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.2rem",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{value}</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── custom tooltip ─────────────────────────────────────────────
function EarningsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 8,
        color: "#f1f5f9",
        padding: "0.6rem 0.9rem",
        fontSize: "0.78rem",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#a78bfa" }}>{payload[0]?.value} MON</div>
      {payload[1] && (
        <div style={{ color: "#94a3b8", marginTop: 2 }}>{payload[1]?.value} queries</div>
      )}
    </div>
  );
}

// ── toast ──────────────────────────────────────────────────────
function Toast({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        background: "#16a34a",
        color: "white",
        padding: "0.75rem 1.25rem",
        borderRadius: 10,
        fontWeight: 600,
        fontSize: "0.875rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.25s, transform 0.25s",
        pointerEvents: "none",
      }}
    >
      &#10003; Payout request submitted!
    </div>
  );
}

// ── main component ─────────────────────────────────────────────
export default function Earnings() {
  const navigate = useNavigate();
  const { profile } = useApp();
  const [tab, setTab] = useState<"Daily" | "Weekly" | "Monthly">("Daily");
  const [toastVisible, setToastVisible] = useState(false);
  const [minPayout, setMinPayout] = useState("5");

  const chartData =
    tab === "Daily" ? CHART_DATA : tab === "Weekly" ? weeklyData() : monthlyData();

  const ownedCollections = COLLECTIONS.filter((c) => c.isOwned).sort(
    (a, b) => parseFloat(b.totalEarnings) - parseFloat(a.totalEarnings)
  );

  function handleRequestPayout() {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }

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
        }
      : {
          background: "transparent",
          color: "var(--text-2)",
          border: "1px solid var(--border)",
          borderRadius: 7,
          padding: "0.4rem 0.875rem",
          fontSize: "0.8rem",
          cursor: "pointer",
        };

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: "1.25rem",
  };

  const settingRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.6rem 0",
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div style={{ padding: "2rem", maxWidth: 1280, margin: "0 auto" }}>
      <Toast visible={toastVisible} />

      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Earnings &amp; Monetization
        </h1>
        <p style={{ color: "var(--text-3)", marginTop: 6, fontSize: "0.875rem" }}>
          Track your earnings, payouts, and growth analytics.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <StatCard label="Total Earnings" value="2.48 MON" icon="🪙" accent="#16a34a" />
        <StatCard label="Total Queries In" value="1,248" icon="📊" accent="#3b82f6" />
        <StatCard label="Avg per Query" value="0.38 MON" icon="📈" accent="#7c3aed" />
        <StatCard label="Total Sales" value="12" icon="🛒" accent="#f97316" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>

        {/* LEFT column */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          {/* Earnings Overview */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
                Earnings Overview
              </h2>
              <div style={{ display: "flex", gap: 6 }}>
                {(["Daily", "Weekly", "Monthly"] as const).map((t) => (
                  <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  interval={tab === "Daily" ? 4 : 0}
                />
                <YAxis
                  tickFormatter={(v) => `${v}`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<EarningsTooltip />} />
                <Area
                  type="monotone"
                  dataKey="earnings"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#earningsGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#7c3aed" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Earnings Breakdown */}
          <div style={cardStyle}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
              Earnings Breakdown
            </h2>
            <div
              style={{
                display: "flex",
                gap: "2rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* Donut */}
              <div style={{ flexShrink: 0 }}>
                <PieChart width={220} height={220}>
                  <Pie
                    data={EARNINGS_BREAKDOWN}
                    cx={110}
                    cy={90}
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {EARNINGS_BREAKDOWN.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: "0.73rem", color: "var(--text-2)" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </div>

              {/* Top Earning Collections table */}
              <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
                <h3
                  style={{
                    margin: "0 0 0.75rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Top Earning Collections
                </h3>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["#", "Collection", "Amount", "Queries", "Created"].map((h) => (
                        <th
                          key={h}
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "var(--text-3)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            padding: "0.5rem 0.75rem",
                            borderBottom: "1px solid var(--border)",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ownedCollections.map((col, idx) => (
                      <tr
                        key={col.id}
                        onClick={() => navigate(`/collections/${col.id}`)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--surface-2)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <td
                          style={{
                            padding: "0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--text-3)",
                            fontWeight: 700,
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--text)",
                          }}
                        >
                          {col.name}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--green)",
                            fontWeight: 600,
                          }}
                        >
                          {col.totalEarnings}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--text-2)",
                          }}
                        >
                          {col.queries.toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem",
                            fontSize: "0.82rem",
                            color: "var(--text-3)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {col.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent Payouts */}
          <div style={cardStyle}>
            <h2
              style={{
                margin: "0 0 1rem",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Recent Payouts
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {PAYOUTS.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.875rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface-2)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--green)",
                      fontSize: "0.95rem",
                      minWidth: 90,
                    }}
                  >
                    {p.amount}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: "0.82rem",
                      color: "var(--text)",
                      minWidth: 140,
                    }}
                  >
                    {p.collection}
                  </span>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-3)",
                      minWidth: 110,
                    }}
                  >
                    {p.date}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      padding: "0.2rem 0.6rem",
                      borderRadius: 99,
                      background:
                        p.status === "Completed" ? "var(--green-bg)" : "var(--yellow-bg)",
                      color: p.status === "Completed" ? "var(--green-text)" : "var(--yellow)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.status}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                      color: "var(--text-3)",
                      minWidth: 110,
                    }}
                  >
                    {p.hash}
                  </span>
                  <a
                    href="#"
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--accent)",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                    onClick={(e) => e.preventDefault()}
                  >
                    View &#8594;
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{ width: 300, flexShrink: 0, position: "sticky", top: "1.5rem" }}>
          <div style={cardStyle}>
            <h2
              style={{
                margin: "0 0 1.25rem",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Payout Settings
            </h2>

            <div style={settingRow}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Revenue Split</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", fontWeight: 600 }}>
                100% to you
              </span>
            </div>

            <div style={settingRow}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Minimum Payout</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  value={minPayout}
                  onChange={(e) => setMinPayout(e.target.value)}
                  style={{
                    width: 48,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "0.2rem 0.4rem",
                    fontSize: "0.78rem",
                    color: "var(--text)",
                    textAlign: "right",
                  }}
                />
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>MON</span>
              </div>
            </div>

            <div style={settingRow}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Network</span>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "0.2rem 0.6rem",
                  borderRadius: 99,
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-bdr)",
                }}
              >
                Monad Testnet
              </span>
            </div>

            <div
              style={{
                ...settingRow,
                borderBottom: "none",
                marginBottom: "1.25rem",
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>Fee Rate</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-2)", fontWeight: 600 }}>
                5 MON min
              </span>
            </div>

            <button
              onClick={handleRequestPayout}
              style={{
                background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "0.65rem 1rem",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.875rem",
                width: "100%",
              }}
            >
              Request Payout
            </button>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid var(--border)",
                margin: "1.25rem 0",
              }}
            />

            <h3
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Payment Method
            </h3>
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.6rem 0.875rem",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                color: "var(--text-2)",
              }}
            >
              {profile.wallet.slice(0, 6)}...{profile.wallet.slice(-4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
