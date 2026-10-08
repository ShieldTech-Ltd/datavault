import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ACTIVITY, DASHBOARD_STATS } from "@/lib/mockData";

const statCards = [
  {
    value: String(DASHBOARD_STATS.collections),
    label: "Collections",
    icon: "⚡",
    bg: "var(--accent-bg)",
  },
  {
    value: DASHBOARD_STATS.totalQueries.toLocaleString(),
    label: "Total Queries",
    icon: "📊",
    bg: "rgba(59,130,246,0.1)",
  },
  {
    value: DASHBOARD_STATS.totalEarnings,
    label: "Total Earnings",
    icon: "🪙",
    bg: "var(--green-bg)",
  },
  {
    value: DASHBOARD_STATS.uptime,
    label: "Uptime",
    icon: "✅",
    bg: "var(--green-bg)",
  },
];

const activityDotColor: Record<string, string> = {
  query: "#7c3aed",
  purchase: "var(--green)",
  payout: "#3b82f6",
  api: "var(--yellow)",
  collection: "var(--text-3)",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { collections } = useApp();
  const ownedCollections = collections.filter((c) => c.isOwned).slice(0, 3);

  return (
    <div style={{ padding: 0 }}>
      {/* ── Hero ── */}
      <div
        style={{
          display: "flex",
          gap: "2rem",
          alignItems: "flex-start",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        {/* Left: copy + CTAs */}
        <div style={{ flex: "1 1 340px", minWidth: 280 }}>
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--accent)",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            Data Ownership for the AI Era
          </p>
          <h1
            style={{
              fontSize: "clamp(1.8rem,3.5vw,2.8rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              color: "var(--text)",
              margin: "0 0 1rem",
            }}
          >
            Your Knowledge,
            <br />
            <span
              style={{
                background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your Revenue.
            </span>
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-2)",
              lineHeight: 1.6,
              maxWidth: 480,
              marginBottom: "1.5rem",
            }}
          >
            Upload, protect, and monetize your knowledge collections with
            Blockchain-powered tokens.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/collections")}
              style={{
                background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "0.6rem 1.3rem",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Create Collection
            </button>
            <button
              onClick={() => navigate("/marketplace")}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                borderRadius: 8,
                padding: "0.55rem 1.2rem",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Explore Marketplace
            </button>
          </div>
        </div>

        {/* Right: Quick Actions card */}
        <div
          style={{
            flex: "0 0 260px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            padding: "1.2rem",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--text-2)",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Quick Actions
          </p>
          {[
            {
              icon: "+",
              label: "Create Collection",
              action: () => navigate("/collections"),
            },
            { icon: "▶", label: "Run Automation", action: () => {} },
            { icon: "★", label: "Rate All Content", action: () => {} },
            {
              icon: "🏪",
              label: "Explore Marketplace",
              action: () => navigate("/marketplace"),
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                width: "100%",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.55rem 0.75rem",
                marginBottom: "0.4rem",
                color: "var(--text)",
                fontSize: "0.83rem",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  background: "var(--accent-bg)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  color: "var(--accent)",
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}

          {/* Network badge */}
          <div
            style={{
              marginTop: "0.75rem",
              background: "linear-gradient(135deg,#1e1b4b,#312e81)",
              borderRadius: "var(--radius-sm)",
              padding: "0.7rem 0.85rem",
            }}
          >
            <p
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                marginBottom: "0.4rem",
              }}
            >
              Tanvir Teo Tassner — Network 6 Testnet
            </p>
            <button
              style={{
                background: "rgba(124,58,237,0.75)",
                border: "none",
                borderRadius: 6,
                padding: "0.3rem 0.7rem",
                color: "white",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Send to Network
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {statCards.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              padding: "1.1rem 1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: s.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
                flexShrink: 0,
              }}
            >
              {s.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 800,
                  color: "var(--text)",
                  lineHeight: 1.1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 2 }}
              >
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two columns ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(240px,35%)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left: Recent Collections */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <span
              style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}
            >
              Recent Collections
            </span>
            <button
              onClick={() => navigate("/collections")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              View All →
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
              gap: "1rem",
            }}
          >
            {ownedCollections.map((col) => (
              <div
                key={col.id}
                onClick={() => navigate(`/collections/${col.id}`)}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow)",
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "var(--shadow-md)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "var(--shadow)";
                }}
              >
                <div
                  style={{
                    height: 90,
                    background: col.gradient,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: 8,
                      left: 8,
                      background: "rgba(0,0,0,0.45)",
                      backdropFilter: "blur(4px)",
                      borderRadius: 20,
                      padding: "2px 8px",
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      color: "white",
                    }}
                  >
                    {col.categories[0]}
                  </span>
                </div>
                <div style={{ padding: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.88rem",
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: "0.4rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {col.name}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-2)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {col.queries} queries · {col.price}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.72rem",
                      color: "var(--yellow)",
                    }}
                  >
                    ★{" "}
                    <span style={{ color: "var(--text-2)" }}>
                      {col.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recent Activity */}
        <div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: "1rem",
            }}
          >
            Recent Activity
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            {ACTIVITY.slice(0, 6).map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  borderBottom: i < 5 ? "1px solid var(--border)" : "none",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      activityDotColor[item.type] ?? "var(--text-3)",
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: "0.15rem",
                    }}
                  >
                    {item.message}
                  </div>
                  {item.collection && (
                    <div
                      style={{
                        fontSize: "0.73rem",
                        color: "var(--text-2)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.collection}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {item.amount && (
                    <div
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: "var(--green)",
                        marginBottom: "0.1rem",
                      }}
                    >
                      +{item.amount}
                    </div>
                  )}
                  <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
                    {item.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
