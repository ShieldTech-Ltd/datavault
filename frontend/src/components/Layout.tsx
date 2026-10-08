import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useApp } from "@/context/AppContext";

const NAV = [
  { to: "/",            label: "Dashboard",       icon: IconDashboard },
  { to: "/collections", label: "Our Collections", icon: IconCollections },
  { to: "/marketplace", label: "Marketplace",     icon: IconMarketplace },
  { to: "/query",       label: "Build Query",     icon: IconQuery },
  { to: "/earnings",    label: "Earnings",         icon: IconEarnings },
  { to: "/transactions",label: "Transactions",    icon: IconTransactions },
  { to: "/analytics",   label: "Analytics",       icon: IconAnalytics },
  { to: "/api-access",  label: "API Access",      icon: IconApi },
  { to: "/settings",    label: "Settings",        icon: IconSettings },
];

export default function Layout() {
  const { isDark, toggleTheme, notifCount, clearNotifs, searchQuery, setSearchQuery } = useApp();
  const { primaryWallet } = useDynamicContext();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs] = useState(false);
  const walletAddr = primaryWallet?.address ?? "";
  const shortAddr  = walletAddr ? `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}` : "";

  return (
    <div style={s.root}>
      {/* ── Sidebar ─────────────────────────────── */}
      <aside style={s.sidebar}>
        {/* Logo */}
        <div style={s.logoRow} onClick={() => navigate("/")} role="button" tabIndex={0}>
          <div style={s.logoIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="9" height="9" rx="2" fill="#7c3aed"/>
              <rect x="13" y="2" width="9" height="9" rx="2" fill="#7c3aed" opacity="0.6"/>
              <rect x="2" y="13" width="9" height="9" rx="2" fill="#7c3aed" opacity="0.6"/>
              <rect x="13" y="13" width="9" height="9" rx="2" fill="#7c3aed" opacity="0.3"/>
            </svg>
          </div>
          <span style={s.logoText}>DataVault</span>
        </div>

        {/* Nav */}
        <nav style={s.nav}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              style={({ isActive }) => ({
                ...s.navItem,
                ...(isActive ? s.navItemActive : {}),
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{ color: isActive ? "#7c3aed" : "var(--text-3)", display:"flex", flexShrink:0 }}>
                    <Icon />
                  </span>
                  <span style={{ flex: 1 }}>{label}</span>
                  {label === "Marketplace" && (
                    <span style={s.hotBadge}>HOT</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Pro card */}
        <div style={s.proCard}>
          <div style={s.proTop}>
            <span style={{ fontSize: "1rem" }}>👑</span>
            <span style={s.proTitle}>DataVault Pro</span>
          </div>
          <p style={s.proDesc}>Unlock advanced analytics, custom branding and API access.</p>
          <button style={s.proBtn}>Upgrade Now →</button>
        </div>

        {/* Help */}
        <div style={s.helpRow}>
          <div style={s.helpIcon}>?</div>
          <div>
            <div style={s.helpTitle}>Need Help?</div>
            <div style={s.helpSub}>Visit our docs</div>
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────── */}
      <div style={s.main}>
        {/* Topbar */}
        <header style={s.topbar}>
          {/* Search */}
          <div style={s.searchWrap}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color:"var(--text-3)", flexShrink:0 }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search your collections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={s.searchInput}
            />
          </div>

          {/* Right controls */}
          <div style={s.topRight}>
            {/* Network chip */}
            <div style={s.networkChip}>
              <span style={s.netDot}/>
              Monad Testnet
              <ChevronDown />
            </div>

            {/* Wallet */}
            {walletAddr ? (
              <div style={s.walletChip}>
                <span style={s.walletDot}/>
                {shortAddr}
                <ChevronDown />
              </div>
            ) : (
              <div style={{ transform:"scale(0.9)", transformOrigin:"right center" }}>
                <DynamicWidget />
              </div>
            )}

            {/* Theme toggle */}
            <button style={s.iconBtn} onClick={toggleTheme} title={isDark ? "Light mode" : "Dark mode"}>
              {isDark ? <IconSun /> : <IconMoon />}
            </button>

            {/* Notifications */}
            <div style={{ position:"relative" }}>
              <button
                style={s.iconBtn}
                onClick={() => { setShowNotifs((v) => !v); clearNotifs(); }}
                title="Notifications"
              >
                <IconBell />
                {notifCount > 0 && <span style={s.notifDot}>{notifCount}</span>}
              </button>
              {showNotifs && (
                <div style={s.notifPanel}>
                  <div style={s.notifHeader}>Notifications</div>
                  {[
                    { msg: "New query answered on Cybersecurity Notes",    time: "2 min ago"  },
                    { msg: "Payout of 0.88 MON received",                  time: "1h ago"     },
                    { msg: "Your collection is now verified",               time: "2h ago"     },
                  ].map((n, i) => (
                    <div key={i} style={s.notifItem}>
                      <div style={s.notifMsg}>{n.msg}</div>
                      <div style={s.notifTime}>{n.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar */}
            <div style={s.avatar}>TM</div>
          </div>
        </header>

        {/* Page content */}
        <main style={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    display:"flex", minHeight:"100vh",
    background:"var(--bg)", color:"var(--text)",
    fontFamily:"'Inter',system-ui,sans-serif",
  },
  sidebar: {
    width:"var(--sidebar-w)", flexShrink:0,
    background:"var(--bg-sidebar)",
    borderRight:"1px solid var(--border)",
    display:"flex", flexDirection:"column",
    position:"sticky", top:0, height:"100vh",
    overflowY:"auto", overflowX:"hidden",
  },
  logoRow: {
    display:"flex", alignItems:"center", gap:"0.5rem",
    padding:"1rem 1rem 0.75rem",
    borderBottom:"1px solid var(--border)",
    cursor:"pointer", userSelect:"none",
  },
  logoIcon: {
    width:30, height:30, borderRadius:8,
    background:"var(--accent-bg)", border:"1px solid var(--accent-bdr)",
    display:"flex", alignItems:"center", justifyContent:"center",
    flexShrink:0,
  },
  logoText: { fontWeight:800, fontSize:"1rem", color:"var(--text)", letterSpacing:"-0.02em" },

  nav: { display:"flex", flexDirection:"column", gap:2, padding:"0.5rem 0.5rem", flex:1 },
  navItem: {
    display:"flex", alignItems:"center", gap:"0.6rem",
    padding:"0.5rem 0.75rem", borderRadius:8,
    fontSize:"0.8rem", fontWeight:500, color:"var(--text-2)",
    textDecoration:"none", transition:"all 0.12s",
    border:"none", background:"transparent", cursor:"pointer",
  },
  navItemActive: {
    background:"var(--accent-bg)", color:"var(--accent)",
    fontWeight:600,
  },
  hotBadge: {
    fontSize:"0.55rem", fontWeight:800,
    background:"linear-gradient(135deg,#f59e0b,#ef4444)",
    color:"white", borderRadius:4, padding:"1px 5px",
    letterSpacing:"0.06em",
  },

  proCard: {
    margin:"0.5rem 0.75rem 0",
    background:"linear-gradient(135deg,var(--accent-bg),rgba(99,102,241,0.08))",
    border:"1px solid var(--accent-bdr)", borderRadius:10, padding:"0.875rem",
  },
  proTop: { display:"flex", alignItems:"center", gap:"0.4rem", marginBottom:"0.35rem" },
  proTitle: { fontWeight:700, fontSize:"0.78rem", color:"var(--text)" },
  proDesc: { fontSize:"0.7rem", color:"var(--text-2)", lineHeight:1.5, marginBottom:"0.6rem" },
  proBtn: {
    width:"100%", padding:"0.45rem",
    background:"linear-gradient(135deg,#7c3aed,#6366f1)",
    border:"none", borderRadius:7, color:"white",
    fontSize:"0.73rem", fontWeight:700, cursor:"pointer",
  },

  helpRow: {
    display:"flex", alignItems:"center", gap:"0.6rem",
    padding:"0.75rem 1rem 1rem",
    borderTop:"1px solid var(--border)", marginTop:"0.5rem",
  },
  helpIcon: {
    width:26, height:26, borderRadius:"50%",
    background:"var(--surface-3)", border:"1px solid var(--border)",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:"0.7rem", fontWeight:700, color:"var(--text-2)", flexShrink:0,
  },
  helpTitle: { fontSize:"0.75rem", fontWeight:600, color:"var(--text-2)" },
  helpSub:   { fontSize:"0.68rem", color:"var(--text-3)" },

  main: { flex:1, display:"flex", flexDirection:"column", minWidth:0 },
  topbar: {
    height:"var(--topbar-h)", display:"flex", alignItems:"center",
    justifyContent:"space-between", padding:"0 1.25rem",
    background:"var(--bg-topbar)", borderBottom:"1px solid var(--border)",
    position:"sticky", top:0, zIndex:20,
    gap:"1rem",
  },
  searchWrap: {
    display:"flex", alignItems:"center", gap:"0.5rem",
    background:"var(--surface-2)", border:"1px solid var(--border)",
    borderRadius:8, padding:"0 0.75rem", flex:1, maxWidth:340,
  },
  searchInput: {
    flex:1, background:"transparent", border:"none", outline:"none",
    color:"var(--text)", padding:"0.45rem 0", fontSize:"0.8rem",
  },
  topRight: { display:"flex", alignItems:"center", gap:"0.5rem", flexShrink:0 },
  networkChip: {
    display:"flex", alignItems:"center", gap:"0.35rem",
    padding:"0.35rem 0.7rem",
    background:"var(--surface-2)", border:"1px solid var(--border)",
    borderRadius:20, fontSize:"0.75rem", color:"var(--text-2)", cursor:"pointer",
    whiteSpace:"nowrap",
  },
  netDot: { width:7, height:7, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 5px #22c55e" },
  walletChip: {
    display:"flex", alignItems:"center", gap:"0.35rem",
    padding:"0.35rem 0.7rem",
    background:"var(--accent-bg)", border:"1px solid var(--accent-bdr)",
    borderRadius:20, fontSize:"0.75rem", color:"var(--accent)", cursor:"pointer",
    fontFamily:"monospace", whiteSpace:"nowrap",
  },
  walletDot: { width:7, height:7, borderRadius:"50%", background:"var(--accent)" },
  iconBtn: {
    width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center",
    background:"var(--surface-2)", border:"1px solid var(--border)",
    borderRadius:"50%", color:"var(--text-2)", cursor:"pointer", position:"relative",
    flexShrink:0,
  },
  notifDot: {
    position:"absolute", top:0, right:0,
    width:16, height:16, background:"#ef4444", borderRadius:"50%",
    fontSize:"0.55rem", fontWeight:800, color:"white",
    display:"flex", alignItems:"center", justifyContent:"center",
    border:"2px solid var(--bg-topbar)",
  },
  notifPanel: {
    position:"absolute", top:42, right:0, width:280,
    background:"var(--surface)", border:"1px solid var(--border)",
    borderRadius:12, boxShadow:"var(--shadow-lg)", zIndex:50,
    overflow:"hidden",
  },
  notifHeader: {
    padding:"0.75rem 1rem", fontWeight:700, fontSize:"0.82rem",
    borderBottom:"1px solid var(--border)", color:"var(--text)",
  },
  notifItem: { padding:"0.75rem 1rem", borderBottom:"1px solid var(--border)" },
  notifMsg:  { fontSize:"0.78rem", color:"var(--text)", lineHeight:1.4, marginBottom:3 },
  notifTime: { fontSize:"0.68rem", color:"var(--text-3)" },
  avatar: {
    width:34, height:34, borderRadius:"50%",
    background:"linear-gradient(135deg,#7c3aed,#6366f1)",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:"0.7rem", fontWeight:800, color:"white",
    flexShrink:0, border:"2px solid var(--accent-bdr)",
  },
  content: { flex:1, padding:"1.5rem", overflowX:"hidden", minHeight:0 },
};

// ── Tiny icon components ──────────────────────────────────────
function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginLeft:2, opacity:0.6 }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconDashboard()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconCollections()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="13" y="2" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="2" y="13" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="13" y="13" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="2"/></svg>; }
function IconMarketplace()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconQuery()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconEarnings()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function IconTransactions() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polyline points="17 1 21 5 17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 23 3 19 7 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconAnalytics()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconApi()          { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polyline points="16 18 22 12 16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="8 6 2 12 8 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconSettings()     { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>; }
function IconBell()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IconSun()          { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>; }
function IconMoon()         { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
