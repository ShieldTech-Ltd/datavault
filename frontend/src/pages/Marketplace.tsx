import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import {
  CATEGORIES,
  getMarketplaceCollections,
  Collection,
} from "@/lib/mockData";

// ── Helpers ────────────────────────────────────────────────────

function parsePriceMon(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

type PriceRange = "all" | "free" | "0-10" | "10-50" | "50+";

function matchesPrice(price: string, range: PriceRange): boolean {
  if (range === "all") return true;
  const n = parsePriceMon(price);
  if (range === "free")  return n === 0;
  if (range === "0-10")  return n > 0 && n <= 10;
  if (range === "10-50") return n > 10 && n <= 50;
  if (range === "50+")   return n > 50;
  return true;
}

// ── Component ──────────────────────────────────────────────────

export default function Marketplace() {
  const navigate = useNavigate();
  const { searchQuery } = useApp();

  const allCollections = useMemo(() => getMarketplaceCollections(), []);

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [priceRange, setPriceRange]             = useState<PriceRange>("all");
  const [verifiedOnly, setVerifiedOnly]         = useState(false);
  const [localSearch, setLocalSearch]           = useState("");
  const [sortBy, setSortBy]                     = useState("popular");
  const [dropdownCat, setDropdownCat]           = useState("All Categories");

  // Combine global search (from header) with local toolbar search
  const activeSearch = localSearch || searchQuery;

  const filtered = useMemo<Collection[]>(() => {
    let result = [...allCollections];

    // Category filter
    if (selectedCategory !== "All") {
      result = result.filter((c) => c.categories.includes(selectedCategory));
    }

    // Price range
    if (priceRange !== "all") {
      result = result.filter((c) => matchesPrice(c.price, priceRange));
    }

    // Verified only
    if (verifiedOnly) {
      result = result.filter((c) => c.verified);
    }

    // Search
    if (activeSearch.trim()) {
      const q = activeSearch.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Sort
    if (sortBy === "popular")  result.sort((a, b) => b.queries - a.queries);
    if (sortBy === "rating")   result.sort((a, b) => b.rating - a.rating);
    if (sortBy === "newest")   result.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    if (sortBy === "price-lo") result.sort((a, b) => parsePriceMon(a.price) - parsePriceMon(b.price));
    if (sortBy === "price-hi") result.sort((a, b) => parsePriceMon(b.price) - parsePriceMon(a.price));

    return result;
  }, [allCollections, selectedCategory, priceRange, verifiedOnly, activeSearch, sortBy]);

  // ── Styles ──────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "0.45rem 0.75rem",
    color: "var(--text)",
    outline: "none",
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

  const primaryBtn: React.CSSProperties = {
    background: "linear-gradient(135deg,#7c3aed,#6366f1)",
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "0.55rem 1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.82rem",
    width: "100%",
  };

  const sideCard: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    padding: "1rem",
    marginBottom: "1rem",
  };

  const sectionHeading: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--text-3)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: "0.65rem",
  };

  return (
    <div style={{ color: "var(--text)" }}>
      {/* Page header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.7rem", fontWeight: 800, margin: "0 0 0.3rem" }}>Knowledge Marketplace</h1>
        <p style={{ color: "var(--text-2)", fontSize: "0.9rem" }}>
          Discover high-quality knowledge collections from global creators.
        </p>
      </div>

      {/* Three-column layout */}
      <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>

        {/* LEFT SIDEBAR */}
        <div style={{ width: 200, flexShrink: 0, position: "sticky", top: "1.5rem" }}>
          {/* Categories */}
          <div style={sideCard}>
            <p style={sectionHeading}>Categories</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setDropdownCat(cat === "All" ? "All Categories" : cat);
                  }}
                  style={{
                    background: selectedCategory === cat ? "var(--accent-bg)" : "transparent",
                    color: selectedCategory === cat ? "var(--accent)" : "var(--text-2)",
                    border: selectedCategory === cat ? "1px solid var(--accent-bdr)" : "1px solid transparent",
                    borderRadius: 6,
                    padding: "0.35rem 0.65rem",
                    cursor: "pointer",
                    fontSize: "0.83rem",
                    fontWeight: selectedCategory === cat ? 700 : 400,
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div style={sideCard}>
            <p style={sectionHeading}>Price Range</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(
                [
                  { key: "all",   label: "Any Price" },
                  { key: "free",  label: "Free" },
                  { key: "0-10",  label: "0–10 MON" },
                  { key: "10-50", label: "10–50 MON" },
                  { key: "50+",   label: "50+ MON" },
                ] as { key: PriceRange; label: string }[]
              ).map(({ key, label }) => (
                <label
                  key={key}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.83rem", color: "var(--text-2)" }}
                >
                  <input
                    type="radio"
                    name="priceRange"
                    checked={priceRange === key}
                    onChange={() => setPriceRange(key)}
                    style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Verified Only */}
          <div style={sideCard}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.84rem", color: "var(--text-2)" }}
            >
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                style={{ accentColor: "var(--accent)", cursor: "pointer", width: 15, height: 15 }}
              />
              <span style={{ fontWeight: 600 }}>Verified Only</span>
            </label>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputStyle, flex: "1 1 200px" }}
              placeholder="Search collections..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
            <select
              value={dropdownCat}
              onChange={(e) => {
                const val = e.target.value;
                setDropdownCat(val);
                setSelectedCategory(val === "All Categories" ? "All" : val);
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="All Categories">All Categories</option>
              {CATEGORIES.filter((c) => c !== "All").map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="popular">Sort: Popular</option>
              <option value="rating">Sort: Rating</option>
              <option value="newest">Sort: Newest</option>
              <option value="price-lo">Price: Low to High</option>
              <option value="price-hi">Price: High to Low</option>
            </select>
          </div>

          {/* Count */}
          <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: "1rem" }}>
            Showing <strong style={{ color: "var(--text-2)" }}>{filtered.length}</strong> collection{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Collection grid */}
          {filtered.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "1rem",
              }}
            >
              {filtered.map((col) => (
                <CollectionCard key={col.id} col={col} navigate={navigate} primaryBtn={primaryBtn} ghostBtn={ghostBtn} />
              ))}
            </div>
          ) : (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "4rem 2rem",
                textAlign: "center",
                boxShadow: "var(--shadow)",
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--surface-3)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 1rem",
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No collections found</div>
              <div style={{ fontSize: "0.84rem", color: "var(--text-2)", maxWidth: 300, margin: "0 auto" }}>
                Try a different search term, category, or clear your filters to browse all collections.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collection Card ────────────────────────────────────────────

interface CardProps {
  col: Collection;
  navigate: ReturnType<typeof useNavigate>;
  primaryBtn: React.CSSProperties;
  ghostBtn: React.CSSProperties;
}

function CollectionCard({ col, navigate, primaryBtn, ghostBtn }: CardProps) {
  const [hovered, setHovered] = useState(false);

  const starsDisplay = (rating: number) => {
    const full  = Math.floor(rating);
    const hasHalf = rating - full >= 0.5;
    return "★".repeat(full) + (hasHalf ? "½" : "") + "☆".repeat(5 - full - (hasHalf ? 1 : 0));
  };

  return (
    <div
      className="card-hover"
      style={{
        background: "var(--surface)",
        border: `1px solid ${hovered ? "var(--accent-bdr)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color 0.15s, box-shadow 0.15s",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Gradient thumbnail */}
      <div
        style={{
          height: 120,
          background: col.gradient,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {col.verified && (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(251,191,36,0.2)",
              color: "#d97706",
              border: "1px solid rgba(217,119,6,0.4)",
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: "0.68rem",
              fontWeight: 700,
              backdropFilter: "blur(6px)",
            }}
          >
            ✦ Verified
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {/* Title */}
        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text)", lineHeight: 1.3 }}>
          {col.name}
        </h3>

        {/* Creator */}
        <p style={{ fontSize: "0.78rem", color: "var(--text-3)", margin: 0 }}>by {col.owner}</p>

        {/* Category chips */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {col.categories.slice(0, 2).map((cat) => (
            <span
              key={cat}
              style={{
                background: "var(--surface-2)",
                color: "var(--text-2)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "2px 8px",
                fontSize: "0.72rem",
                fontWeight: 500,
              }}
            >
              {cat}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-2)" }}>
          <span>{col.queries.toLocaleString()} queries</span>
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>{col.price}</span>
        </div>

        {/* Rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8rem" }}>
          <span style={{ color: "#f59e0b", letterSpacing: 1 }}>{starsDisplay(col.rating)}</span>
          <span style={{ color: "var(--text-3)" }}>{col.rating.toFixed(1)}</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "0.25rem" }}>
          <button
            style={{ ...ghostBtn, width: "100%", textAlign: "center" }}
            onClick={() => navigate(`/collections/${col.id}`)}
          >
            View Collection
          </button>
          {!col.isOwned && (
            <button style={primaryBtn} onClick={() => navigate(`/collections/${col.id}`)}>
              Buy Access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
