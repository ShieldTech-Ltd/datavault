import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { CATEGORIES, Collection } from "@/lib/mockData";

// ── helpers ──────────────────────────────────────────────────────

function randomId() {
  return "col-" + Math.random().toString(36).slice(2, 9);
}

const GRADIENTS = [
  "linear-gradient(135deg,#1e3a5f,#2563eb)",
  "linear-gradient(135deg,#065f46,#059669)",
  "linear-gradient(135deg,#4c1d95,#7c3aed)",
  "linear-gradient(135deg,#7c2d12,#ea580c)",
  "linear-gradient(135deg,#312e81,#6366f1)",
];

// ── CreatePanel ───────────────────────────────────────────────────

interface CreatePanelProps {
  onClose: () => void;
  onSubmit: (c: Collection) => void;
}

function CreatePanel({ onClose, onSubmit }: CreatePanelProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Technical");
  const [agreed, setAgreed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  function handleFile(f: File | null) {
    if (f) setFileName(f.name);
  }

  function handleSubmit() {
    if (!name.trim() || !agreed) return;
    const newCol: Collection = {
      id: randomId(),
      collectionId: "0x" + Math.random().toString(16).slice(2, 18),
      name: name.trim(),
      description: description.trim() || "A new knowledge collection.",
      categories: [category],
      gradient: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
      queries: 0,
      price: price ? `${price} MON` : "0.00 MON",
      priceWei: "0",
      rating: 0,
      owner: "Tanvir Farhad",
      ownerAddress: "0x3F2a...7c9D",
      files: fileName ? 1 : 0,
      totalEarnings: "0.00 MON",
      status: "active",
      verified: false,
      createdAt: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      isOwned: true,
    };
    onSubmit(newCol);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 99,
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px,95vw)",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          zIndex: 100,
          overflowY: "auto",
          padding: "1.75rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.1rem",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              Register a Knowledge Collection
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-2)", marginTop: 2 }}>
              Fill in the details to publish your collection.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "var(--text-2)",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Collection name */}
        <div>
          <label
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-2)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Collection Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cybersecurity Notes"
            style={{
              width: "100%",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.55rem 0.75rem",
              color: "var(--text)",
              fontSize: "0.85rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-2)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what's in this collection..."
            rows={3}
            style={{
              width: "100%",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.55rem 0.75rem",
              color: "var(--text)",
              fontSize: "0.85rem",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* File upload */}
        <div>
          <label
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-2)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Upload Files
          </label>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "1.5rem 1rem",
              cursor: "pointer",
              background: dragOver ? "var(--accent-bg)" : "var(--surface-2)",
              transition: "background 0.15s",
            }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>📂</div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-2)",
                marginBottom: 2,
              }}
            >
              {fileName || "Drag & drop files here"}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
              .md · .txt · .pdf · .docx
            </div>
            <input
              type="file"
              accept=".md,.txt,.pdf,.docx"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {/* Price */}
        <div>
          <label
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-2)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Price per Query
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              style={{
                width: "100%",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.55rem 3rem 0.55rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.85rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--accent)",
              }}
            >
              MON
            </span>
          </div>
        </div>

        {/* Category */}
        <div>
          <label
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-2)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: "100%",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.55rem 0.75rem",
              color: "var(--text)",
              fontSize: "0.85rem",
              outline: "none",
            }}
          >
            {CATEGORIES.filter((c) => c !== "All").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Disclosure */}
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.6rem",
            cursor: "pointer",
            fontSize: "0.8rem",
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }}
          />
          I confirm I have the rights to share this content and agree to the
          DataVault terms of service.
        </label>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !agreed}
          style={{
            background:
              name.trim() && agreed
                ? "linear-gradient(135deg,#7c3aed,#6366f1)"
                : "var(--surface-3)",
            color: name.trim() && agreed ? "white" : "var(--text-3)",
            border: "none",
            borderRadius: 8,
            padding: "0.65rem 1.2rem",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: name.trim() && agreed ? "pointer" : "not-allowed",
            marginTop: "0.5rem",
          }}
        >
          Register Collection →
        </button>
      </div>
    </>
  );
}

// ── DotMenu ───────────────────────────────────────────────────────

interface DotMenuProps {
  collectionId: string;
  status: "active" | "paused";
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function DotMenu({ status, onEdit, onToggle, onDelete }: DotMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(4px)",
          border: "none",
          borderRadius: 6,
          width: 28,
          height: 28,
          color: "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1rem",
          lineHeight: 1,
        }}
      >
        ···
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9 }}
          />
          <div
            style={{
              position: "absolute",
              top: "110%",
              right: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "var(--shadow-md)",
              zIndex: 10,
              minWidth: 130,
              overflow: "hidden",
            }}
          >
            {[
              { label: "Edit", action: onEdit },
              { label: status === "active" ? "Pause" : "Resume", action: onToggle },
              { label: "Delete", action: onDelete, danger: true },
            ].map((item) => (
              <button
                key={item.label}
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 0.9rem",
                  background: "transparent",
                  border: "none",
                  color: item.danger ? "var(--red)" : "var(--text)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function MyCollections() {
  const navigate = useNavigate();
  const { collections, addCollection, updateCollection, removeCollection } =
    useApp();

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const [catDropOpen, setCatDropOpen] = useState(false);

  const owned = collections.filter((c) => c.isOwned);

  const filtered = owned.filter((c) => {
    const matchName = c.name.toLowerCase().includes(search.toLowerCase());
    const matchCat =
      activeCat === "All" || c.categories.includes(activeCat);
    return matchName && matchCat;
  });

  function handleDelete(id: string) {
    if (window.confirm("Delete this collection? This cannot be undone.")) {
      removeCollection(id);
    }
  }

  function handleToggle(c: Collection) {
    updateCollection(c.id, {
      status: c.status === "active" ? "paused" : "active",
    });
  }

  return (
    <div style={{ padding: 0 }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            color: "var(--text)",
            margin: "0 0 0.35rem",
          }}
        >
          My Collections
        </h1>
        <p style={{ fontSize: "0.88rem", color: "var(--text-2)", margin: 0 }}>
          Manage, track, and optimize your knowledge collections.
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <span
            style={{
              position: "absolute",
              left: "0.7rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-3)",
              fontSize: "0.85rem",
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            style={{
              width: "100%",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.5rem 0.75rem 0.5rem 2rem",
              color: "var(--text)",
              fontSize: "0.85rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Category dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setCatDropOpen((o) => !o)}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.5rem 0.9rem",
              color: "var(--text-2)",
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              whiteSpace: "nowrap",
            }}
          >
            {activeCat === "All" ? "All Categories" : activeCat}
            <span style={{ fontSize: "0.65rem" }}>▼</span>
          </button>
          {catDropOpen && (
            <>
              <div
                onClick={() => setCatDropOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 9 }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "var(--shadow-md)",
                  zIndex: 10,
                  minWidth: 160,
                  overflow: "hidden",
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCat(cat);
                      setCatDropOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.5rem 0.9rem",
                      background:
                        activeCat === cat ? "var(--accent-bg)" : "transparent",
                      border: "none",
                      color:
                        activeCat === cat ? "var(--accent)" : "var(--text)",
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      textAlign: "left",
                      fontWeight: activeCat === cat ? 600 : 400,
                    }}
                  >
                    {cat === "All" ? "All Categories" : cat}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "linear-gradient(135deg,#7c3aed,#6366f1)",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "0.55rem 1.1rem",
            fontWeight: 600,
            fontSize: "0.82rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
            marginLeft: "auto",
          }}
        >
          + Create New Collection
        </button>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 1rem",
            color: "var(--text-3)",
            fontSize: "0.9rem",
          }}
        >
          No collections match your filters.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
            gap: "1.25rem",
          }}
        >
          {filtered.map((col) => (
            <div
              key={col.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  height: 100,
                  background: col.gradient,
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {/* Category tags */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 8,
                    display: "flex",
                    gap: "0.3rem",
                    flexWrap: "wrap",
                  }}
                >
                  {col.categories.map((cat) => (
                    <span
                      key={cat}
                      style={{
                        background: "rgba(0,0,0,0.45)",
                        backdropFilter: "blur(4px)",
                        borderRadius: 20,
                        padding: "2px 8px",
                        fontSize: "0.62rem",
                        fontWeight: 600,
                        color: "white",
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                {/* ... menu */}
                <div style={{ position: "absolute", top: 8, right: 8 }}>
                  <DotMenu
                    collectionId={col.id}
                    status={col.status}
                    onEdit={() => navigate(`/collections/${col.id}`)}
                    onToggle={() => handleToggle(col)}
                    onDelete={() => handleDelete(col.id)}
                  />
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "0.9rem 1rem", flex: 1 }}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    color: "var(--text)",
                    margin: "0 0 0.35rem",
                  }}
                >
                  {col.name}
                </h3>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-2)",
                    margin: "0 0 0.6rem",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {col.description}
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    fontSize: "0.75rem",
                    color: "var(--text-2)",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span>{col.queries} queries</span>
                  <span>·</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {col.price}
                  </span>
                  <span>·</span>
                  <span style={{ color: "var(--yellow)" }}>
                    ★ {col.rating.toFixed(1)}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Status badge */}
                  <span
                    style={
                      col.status === "active"
                        ? {
                            background: "var(--green-bg)",
                            color: "var(--green)",
                            border: "1px solid rgba(34,197,94,0.25)",
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                          }
                        : {
                            background: "var(--yellow-bg)",
                            color: "var(--yellow)",
                            border: "1px solid rgba(234,179,8,0.25)",
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                          }
                    }
                  >
                    {col.status === "active" ? "Active" : "Paused"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--text-3)",
                      marginLeft: "auto",
                    }}
                  >
                    {col.createdAt}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: "0.65rem 1rem",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <button
                  onClick={() => navigate(`/collections/${col.id}`)}
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    padding: "0.45rem 0.75rem",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  View Details
                </button>
                <button
                  onClick={() => handleToggle(col)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.45rem 0.75rem",
                    color: "var(--text-2)",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.status === "active" ? "Pause" : "Resume"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create panel ── */}
      {showCreate && (
        <CreatePanel
          onClose={() => setShowCreate(false)}
          onSubmit={(c) => {
            addCollection(c);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
