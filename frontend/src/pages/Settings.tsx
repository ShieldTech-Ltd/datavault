import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { USER_PROFILE } from "@/lib/mockData";

type Tab = "Profile Information" | "API & Webhook" | "Notifications" | "Integrations";

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  padding: "1.25rem",
};

const inputStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  color: "var(--text)",
  outline: "none",
  fontSize: "0.82rem",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--text-2)",
  display: "block",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg,#7c3aed,#6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "0.55rem 1.1rem",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.85rem",
  width: "100%",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 42, height: 24, borderRadius: 12, cursor: "pointer",
        background: checked ? "var(--accent)" : "var(--surface-3)",
        border: "1px solid var(--border)",
        position: "relative", transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 20 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "white", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  setTimeout(onDone, 2500);
  return (
    <div style={{
      position: "fixed", top: 20, right: 20,
      background: "#059669", color: "white", borderRadius: 10,
      padding: "0.65rem 1.1rem", zIndex: 1000, fontWeight: 600, fontSize: "0.85rem",
      boxShadow: "0 4px 16px rgba(5,150,105,0.4)",
      display: "flex", alignItems: "center", gap: "0.5rem",
      animation: "fadeIn 0.2s ease",
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      {message}
    </div>
  );
}

const INTEGRATIONS = [
  { id: "notion", name: "Notion", desc: "Sync your Notion pages as collection sources", color: "#000000", initials: "N" },
  { id: "github", name: "GitHub", desc: "Import markdown files from your repositories", color: "#24292e", initials: "GH" },
  { id: "gdrive", name: "Google Drive", desc: "Connect and import documents from Drive", color: "#4285f4", initials: "GD" },
  { id: "dropbox", name: "Dropbox", desc: "Access and sync files from your Dropbox", color: "#0061ff", initials: "DB" },
];

export default function Settings() {
  const { profile, updateProfile } = useApp();
  const [tab, setTab] = useState<Tab>("Profile Information");
  const [toast, setToast] = useState<string | null>(null);

  // Profile form state
  const [displayName, setDisplayName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [email, setEmail] = useState(profile.email);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookEvents, setWebhookEvents] = useState({
    queryAnswered: true,
    paymentReceived: false,
    payoutProcessed: false,
    collectionUpdated: false,
  });

  // Notifications state
  const [notifs, setNotifs] = useState({
    emailNotifications: true,
    queryAnswered: true,
    paymentNotifications: true,
    payoutAlerts: true,
    marketingUpdates: false,
  });

  // Integrations state
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  const tabs: Tab[] = ["Profile Information", "API & Webhook", "Notifications", "Integrations"];

  const saveProfile = () => {
    updateProfile({ name: displayName, bio, email });
    setToast("Profile updated!");
  };

  const toggleNotif = (key: keyof typeof notifs) => {
    setNotifs((n) => ({ ...n, [key]: !n[key] }));
  };

  const toggleWebhookEvent = (key: keyof typeof webhookEvents) => {
    setWebhookEvents((e) => ({ ...e, [key]: !e[key] }));
  };

  const toggleIntegration = (id: string) => {
    setConnected((c) => ({ ...c, [id]: !c[id] }));
  };

  return (
    <div style={{ color: "var(--text)", maxWidth: 860 }}>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Settings</h1>
        <p style={{ color: "var(--text-2)", marginTop: 6, fontSize: "0.9rem" }}>
          Manage your profile, preferences and integrations.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: "1.5rem", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--accent-bg)" : "none",
              border: "none",
              cursor: "pointer",
              padding: "0.55rem 1rem",
              borderRadius: "8px 8px 0 0",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: tab === t ? "var(--accent)" : "var(--text-2)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s, background 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Profile Information Tab */}
      {tab === "Profile Information" && (
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Avatar section */}
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", minWidth: 180 }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "linear-gradient(135deg,#7c3aed,#6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.4rem", fontWeight: 700, color: "white",
            }}>
              {profile.avatar}
            </div>
            <button style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.4rem 0.85rem", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-2)", fontWeight: 600 }}>
              Change Photo
            </button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{profile.name}</div>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, background: "var(--accent-bg)", color: "var(--accent)", padding: "2px 10px", borderRadius: 20, display: "inline-block", marginTop: 4 }}>
                {USER_PROFILE.role}
              </span>
            </div>
          </div>

          {/* Profile form */}
          <div style={{ ...cardStyle, flex: 1, minWidth: 280 }}>
            <h3 style={{ margin: "0 0 1.25rem", fontSize: "0.95rem", fontWeight: 600 }}>Profile Details</h3>

            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Display Name</label>
              <input style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Bio</label>
              <textarea
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>Wallet Address</label>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.78rem", fontFamily: "monospace", color: "var(--text-2)" }}>
                {profile.wallet}
              </div>
            </div>

            <button onClick={saveProfile} style={primaryBtn}>
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* API & Webhook Tab */}
      {tab === "API & Webhook" && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 1.25rem", fontSize: "0.95rem", fontWeight: 600 }}>Webhook Configuration</h3>

          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Webhook URL</label>
            <input
              style={inputStyle}
              placeholder="https://yoursite.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={labelStyle}>Secret Key</label>
            <input
              style={inputStyle}
              type="password"
              placeholder="whsec_..."
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>Events</label>
            {[
              { key: "queryAnswered" as const, label: "Query answered" },
              { key: "paymentReceived" as const, label: "Payment received" },
              { key: "payoutProcessed" as const, label: "Payout processed" },
              { key: "collectionUpdated" as const, label: "Collection updated" },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer", fontSize: "0.82rem", color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={webhookEvents[key]}
                  onChange={() => toggleWebhookEvent(key)}
                  style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                />
                {label}
              </label>
            ))}
          </div>

          <button
            onClick={() => setToast("Webhook saved!")}
            style={{ ...primaryBtn, width: "auto" }}
          >
            Save Webhook
          </button>
        </div>
      )}

      {/* Notifications Tab */}
      {tab === "Notifications" && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 1.25rem", fontSize: "0.95rem", fontWeight: 600 }}>Notification Preferences</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {[
              { key: "emailNotifications" as const, label: "Email notifications", desc: "Receive notifications via email" },
              { key: "queryAnswered" as const, label: "Query answered alerts", desc: "Get notified when a query is answered" },
              { key: "paymentNotifications" as const, label: "Payment notifications", desc: "Alerts for incoming payments" },
              { key: "payoutAlerts" as const, label: "Payout alerts", desc: "Notify when payouts are processed" },
              { key: "marketingUpdates" as const, label: "Marketing updates", desc: "Product news and feature announcements" },
            ].map(({ key, label, desc }, i, arr) => (
              <div
                key={key}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.85rem 0",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle checked={notifs[key]} onChange={() => toggleNotif(key)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {tab === "Integrations" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: "1rem" }}>
          {INTEGRATIONS.map((intg) => {
            const isConnected = !!connected[intg.id];
            return (
              <div key={intg.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: intg.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: "white", flexShrink: 0,
                }}>
                  {intg.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{intg.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>{intg.desc}</div>
                </div>
                <button
                  onClick={() => toggleIntegration(intg.id)}
                  style={{
                    background: isConnected ? "none" : "linear-gradient(135deg,#7c3aed,#6366f1)",
                    color: isConnected ? "var(--green)" : "white",
                    border: isConnected ? "1px solid var(--green)" : "none",
                    borderRadius: 8,
                    padding: "0.4rem 0.9rem",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {isConnected ? "Connected" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
