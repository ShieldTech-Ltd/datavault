import { useState } from "react";
import {
  CHART_DATA,
  TOP_QUERIES,
  DASHBOARD_STATS,
  COLLECTIONS,
} from "@/lib/mockData";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Tab = "Overview" | "Queries" | "Earnings" | "Collections";

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  padding: "1.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--text-2)",
  display: "block",
  marginBottom: 4,
};

export default function Analytics() {
  const [tab, setTab] = useState<Tab>("Overview");

  const ownedCollections = COLLECTIONS.filter((c) => c.isOwned);
  const maxQueryCount = Math.max(...TOP_QUERIES.map((q) => q.count));
  const totalQueriesSum = TOP_QUERIES.reduce((sum, q) => sum + q.count, 0);

  const totalEarnings = CHART_DATA.reduce((s, d) => s + d.earnings, 0);
  const avgEarnings = totalEarnings / CHART_DATA.length;
  const bestDay = CHART_DATA.reduce((best, d) =>
    d.earnings > best.earnings ? d : best
  );

  const tabs: Tab[] = ["Overview", "Queries", "Earnings", "Collections"];

  return (
    <div style={{ padding: "2rem", color: "var(--text)", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>Performance Metrics</p>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Analytics &amp; Insights</h1>
        <p style={{ color: "var(--text-3)", marginTop: 6, fontSize: "0.875rem" }}>
          Track performance, understand your audience, and optimise growth.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ ...cardStyle, borderLeft: "3px solid var(--blue)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--blue-bg)", border: "1px solid rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Queries</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{DASHBOARD_STATS.totalQueries.toLocaleString()}</div>
        </div>

        <div style={{ ...cardStyle, borderLeft: "3px solid var(--green)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--green-bg)", border: "1px solid rgba(22,163,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Earnings</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--green)" }}>{DASHBOARD_STATS.totalEarnings}</div>
        </div>

        <div style={{ ...cardStyle, borderLeft: "3px solid var(--accent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--accent-bg)", border: "1px solid var(--accent-bdr)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Unique Users</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em" }}>328</div>
        </div>

        <div style={{ ...cardStyle, borderLeft: "3px solid #10b981" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--green-bg)", border: "1px solid rgba(22,163,74,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Uptime</span>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.02em", color: "#10b981" }}>{DASHBOARD_STATS.uptime}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.6rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: tab === t ? "var(--accent)" : "var(--text-2)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "Overview" && (
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
          <div style={{ ...cardStyle, flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Query Trends</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={CHART_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUnique" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.78rem" }}
                  labelStyle={{ color: "var(--text)", fontWeight: 600 }}
                  formatter={((val: unknown, name: string) => [val ?? 0, name === "queries" ? "Total Queries" : "Unique Queries"]) as never}
                />
                <Legend verticalAlign="top" align="left" wrapperStyle={{ fontSize: "0.75rem", paddingBottom: 8 }} formatter={(val) => val === "queries" ? "Total Queries" : "Unique Queries"} />
                <Area type="monotone" dataKey="queries" stroke="#7c3aed" strokeWidth={2} fill="url(#gTotal)" dot={false} />
                <Area type="monotone" dataKey="unique" stroke="#6366f1" strokeWidth={2} fill="url(#gUnique)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...cardStyle, width: 280, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Top Queries</span>
              <a href="#" style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}>More →</a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {TOP_QUERIES.map((q, i) => (
                <div key={i}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: "0.65rem", color: "var(--accent)", minWidth: 20, fontWeight: 800,
                      background: "var(--accent-bg)", border: "1px solid var(--accent-bdr)",
                      borderRadius: 4, padding: "1px 4px", textAlign: "center", flexShrink: 0, marginTop: 1,
                    }}>#{i + 1}</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--text)", flex: 1, lineHeight: 1.4 }}>{q.text}</span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{q.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--surface-3)", marginLeft: 28 }}>
                    <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#7c3aed,#6366f1)", width: `${(q.count / maxQueryCount) * 100}%`, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Queries Tab */}
      {tab === "Queries" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={cardStyle}>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Total Queries Over Time</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={CHART_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.78rem" }} />
                <Line type="monotone" dataKey="queries" stroke="#7c3aed" strokeWidth={2} dot={false} name="Total Queries" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={cardStyle}>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Top 5 Queries</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  {["Question", "Count", "% of Total"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-2)", fontWeight: 600, fontSize: "0.75rem", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_QUERIES.map((q, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.6rem 0.75rem", color: "var(--text)" }}>{q.text}</td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "var(--text)", fontWeight: 600 }}>{q.count}</td>
                    <td style={{ padding: "0.6rem 0.75rem", color: "var(--text-2)" }}>{((q.count / totalQueriesSum) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Earnings Tab */}
      {tab === "Earnings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={cardStyle}>
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Earnings Over Time</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={CHART_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gEarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.78rem" }}
                  formatter={((val: unknown) => [typeof val === "number" ? `${val.toFixed(3)} MON` : String(val ?? 0), "Earnings"]) as never}
                />
                <Area type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} fill="url(#gEarnings)" dot={false} name="Earnings" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
            <div style={{ ...cardStyle, borderLeft: "3px solid var(--green)" }}>
              <div style={{ ...labelStyle, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontSize: "0.68rem" }}>Total Earnings</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green)", letterSpacing: "-0.02em" }}>{totalEarnings.toFixed(3)} MON</div>
            </div>
            <div style={{ ...cardStyle, borderLeft: "3px solid var(--blue)" }}>
              <div style={{ ...labelStyle, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontSize: "0.68rem" }}>Daily Average</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--blue)", letterSpacing: "-0.02em" }}>{avgEarnings.toFixed(3)} MON</div>
            </div>
            <div style={{ ...cardStyle, borderLeft: "3px solid var(--accent)", background: "var(--accent-bg)" }}>
              <div style={{ ...labelStyle, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontSize: "0.68rem" }}>Best Day</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "-0.02em" }}>{bestDay.earnings.toFixed(3)} MON</div>
              <div style={{ fontSize: "0.73rem", color: "var(--text-2)", marginTop: 4 }}>📅 {bestDay.date}</div>
            </div>
          </div>
        </div>
      )}

      {/* Collections Tab */}
      {tab === "Collections" && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "1rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Your Collections</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Collection", "Queries", "Earnings", "Avg Rating", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--text-2)", fontWeight: 600, fontSize: "0.75rem", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ownedCollections.map((col) => (
                <tr key={col.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.65rem 0.75rem", color: "var(--text)", fontWeight: 500 }}>{col.name}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "var(--text)" }}>{col.queries.toLocaleString()}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "var(--green)", fontWeight: 600 }}>{col.totalEarnings}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "var(--text)" }}>&#9733; {col.rating}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <span style={{
                      fontSize: "0.7rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                      background: col.status === "active" ? "var(--green-bg)" : "var(--yellow-bg)",
                      color: col.status === "active" ? "var(--green)" : "var(--yellow)",
                    }}>
                      {col.status === "active" ? "Active" : "Paused"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
