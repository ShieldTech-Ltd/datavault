// ── Types ────────────────────────────────────────────────────
export interface Collection {
  id: string;
  name: string;
  description: string;
  categories: string[];
  gradient: string;
  queries: number;
  price: string;
  priceWei: string;
  rating: number;
  owner: string;
  ownerAddress: string;
  files: number;
  totalEarnings: string;
  status: "active" | "paused";
  verified: boolean;
  createdAt: string;
  isOwned: boolean;
  collectionId: string;
}

export interface CollectionFile {
  id: string;
  name: string;
  type: "PDF" | "DOCX" | "MP4" | "MD" | "TXT";
  size: string;
  added: string;
  status: "Verified" | "Processing" | "Failed";
}

export interface Transaction {
  id: string;
  type: "Query" | "Purchase" | "Payout" | "Collection Published" | "Refund";
  collection: string;
  amount: string;
  from: string;
  toHash: string;
  status: "Completed" | "Pending" | "Refunded" | "Failed";
  date: string;
  timestamp: number;
}

export interface ChartPoint {
  date: string;
  earnings: number;
  queries: number;
  unique: number;
}

export interface TopQuery {
  text: string;
  count: number;
}

export interface Payout {
  id: string;
  amount: string;
  date: string;
  status: "Completed" | "Pending";
  hash: string;
  collection: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  status: "Active" | "Disabled";
  created: string;
  lastUsed: string;
  requests: number;
}

export interface ActivityItem {
  id: string;
  type: "query" | "purchase" | "payout" | "api" | "collection";
  message: string;
  collection: string;
  amount: string;
  time: string;
}

// ── Collections ───────────────────────────────────────────────
export const COLLECTIONS: Collection[] = [
  {
    id: "col-1",
    name: "Cybersecurity Notes",
    description: "Comprehensive cybersecurity insights, guides and real-world case studies covering threat analysis, vulnerability assessments, incident response and more.",
    categories: ["Security", "Technical"],
    gradient: "linear-gradient(135deg,#1e3a5f,#2563eb)",
    queries: 648,
    price: "0.32 MON",
    priceWei: "320000000000000000",
    rating: 4.8,
    owner: "Tanvir Farhad",
    ownerAddress: "0x3F2a...7c9D",
    files: 24,
    totalEarnings: "1.34 MON",
    status: "active",
    verified: true,
    createdAt: "Mar 10, 2025",
    isOwned: true,
    collectionId: "0x8f3e...a1c9d27b6e4f2",
  },
  {
    id: "col-2",
    name: "Network Configurations",
    description: "In-depth infrastructure architecture guides, network topology patterns, and DevOps configuration templates for scalable systems.",
    categories: ["Infrastructure", "Documentation"],
    gradient: "linear-gradient(135deg,#065f46,#059669)",
    queries: 446,
    price: "0.62 MON",
    priceWei: "620000000000000000",
    rating: 4.6,
    owner: "Tanvir Farhad",
    ownerAddress: "0x3F2a...7c9D",
    files: 18,
    totalEarnings: "0.76 MON",
    status: "active",
    verified: true,
    createdAt: "Mar 12, 2025",
    isOwned: true,
    collectionId: "0x4d8b...c2e1f3a7d",
  },
  {
    id: "col-3",
    name: "API Documentation",
    description: "Detailed REST and GraphQL API documentation, integration guides, and onboarding resources for developer teams.",
    categories: ["Onboarding", "Technical"],
    gradient: "linear-gradient(135deg,#4c1d95,#7c3aed)",
    queries: 332,
    price: "0.00 MON",
    priceWei: "0",
    rating: 4.3,
    owner: "Tanvir Farhad",
    ownerAddress: "0x3F2a...7c9D",
    files: 11,
    totalEarnings: "0.38 MON",
    status: "paused",
    verified: false,
    createdAt: "Mar 15, 2025",
    isOwned: true,
    collectionId: "0x9a2c...e5f7b1d4",
  },
  {
    id: "col-4",
    name: "Data Analytics Resources",
    description: "Data science notebooks, statistical models and analytics guides for Python and R practitioners.",
    categories: ["Data Science", "Patterns"],
    gradient: "linear-gradient(135deg,#7c2d12,#ea580c)",
    queries: 407,
    price: "0.38 MON",
    priceWei: "380000000000000000",
    rating: 4.5,
    owner: "DataSci Pro",
    ownerAddress: "0xA1b2...3C4d",
    files: 29,
    totalEarnings: "1.12 MON",
    status: "active",
    verified: true,
    createdAt: "Feb 20, 2025",
    isOwned: false,
    collectionId: "0x1b3f...c4d5e6f7",
  },
  {
    id: "col-5",
    name: "Blockchain Security Research",
    description: "Peer-reviewed blockchain security research, smart contract audit templates, and vulnerability disclosures from leading experts.",
    categories: ["Security", "Technical", "Blockchain"],
    gradient: "linear-gradient(135deg,#1e3a5f,#0891b2)",
    queries: 364,
    price: "4 MON",
    priceWei: "4000000000000000000",
    rating: 4.9,
    owner: "BlockAudit Labs",
    ownerAddress: "0xB2c3...4D5e",
    files: 42,
    totalEarnings: "8.92 MON",
    status: "active",
    verified: true,
    createdAt: "Feb 14, 2025",
    isOwned: false,
    collectionId: "0x2c4e...d5e6f7a8",
  },
  {
    id: "col-6",
    name: "Smart Contract Patterns",
    description: "Battle-tested Solidity patterns, gas optimisation techniques and EVM security guidelines.",
    categories: ["Blockchain", "Technical"],
    gradient: "linear-gradient(135deg,#312e81,#6366f1)",
    queries: 1203,
    price: "0.7 MON",
    priceWei: "700000000000000000",
    rating: 4.7,
    owner: "SolidityGuru",
    ownerAddress: "0xC3d4...5E6f",
    files: 67,
    totalEarnings: "6.43 MON",
    status: "active",
    verified: true,
    createdAt: "Jan 28, 2025",
    isOwned: false,
    collectionId: "0x3d5f...e6f7a8b9",
  },
  {
    id: "col-7",
    name: "Cloud Infrastructure Guide",
    description: "Terraform modules, Kubernetes configs and AWS/GCP/Azure architecture blueprints for production workloads.",
    categories: ["Infrastructure", "Technical"],
    gradient: "linear-gradient(135deg,#1c4532,#16a34a)",
    queries: 856,
    price: "0.3 MON",
    priceWei: "300000000000000000",
    rating: 4.4,
    owner: "CloudArch Team",
    ownerAddress: "0xD4e5...6F7a",
    files: 38,
    totalEarnings: "1.87 MON",
    status: "active",
    verified: true,
    createdAt: "Jan 20, 2025",
    isOwned: false,
    collectionId: "0x4e6a...f7a8b9c0",
  },
  {
    id: "col-8",
    name: "Machine Learning Notes",
    description: "From linear regression to transformer architectures — annotated lecture notes and implementation notebooks.",
    categories: ["AI", "Research"],
    gradient: "linear-gradient(135deg,#831843,#db2777)",
    queries: 921,
    price: "1.2 MON",
    priceWei: "1200000000000000000",
    rating: 4.8,
    owner: "MLResearcher",
    ownerAddress: "0xE5f6...7A8b",
    files: 55,
    totalEarnings: "9.14 MON",
    status: "active",
    verified: true,
    createdAt: "Jan 10, 2025",
    isOwned: false,
    collectionId: "0x5f7b...a8b9c0d1",
  },
  {
    id: "col-9",
    name: "Web3 Development",
    description: "Full-stack dApp development guides covering ethers.js, wagmi, wallet integrations and IPFS storage.",
    categories: ["Blockchain", "Technical"],
    gradient: "linear-gradient(135deg,#1e3a5f,#7c3aed)",
    queries: 548,
    price: "0.85 MON",
    priceWei: "850000000000000000",
    rating: 4.5,
    owner: "Web3Builder",
    ownerAddress: "0xF6a7...8B9c",
    files: 31,
    totalEarnings: "3.28 MON",
    status: "active",
    verified: false,
    createdAt: "Dec 5, 2024",
    isOwned: false,
    collectionId: "0x6a8c...b9c0d1e2",
  },
  {
    id: "col-10",
    name: "DeFi Market Analysis",
    description: "Weekly DeFi protocol analysis, liquidity metrics, yield strategy breakdowns and risk assessments.",
    categories: ["Finance", "Research"],
    gradient: "linear-gradient(135deg,#713f12,#ca8a04)",
    queries: 734,
    price: "2.5 MON",
    priceWei: "2500000000000000000",
    rating: 4.6,
    owner: "DeFiAnalyst",
    ownerAddress: "0xA7b8...9C0d",
    files: 88,
    totalEarnings: "14.2 MON",
    status: "active",
    verified: true,
    createdAt: "Nov 18, 2024",
    isOwned: false,
    collectionId: "0x7b9d...c0d1e2f3",
  },
];

// ── Files for col-1 (Cybersecurity Notes) ────────────────────
export const COLLECTION_FILES: CollectionFile[] = [
  { id: "f1", name: "Network Security Fundamentals.pdf", type: "PDF", size: "4.2 MB", added: "Mar 10, 2025", status: "Verified" },
  { id: "f2", name: "SEM Analysis Guide.docx", type: "DOCX", size: "2.1 MB", added: "Mar 10, 2025", status: "Verified" },
  { id: "f3", name: "Threat Detection Patterns.pdf", type: "PDF", size: "1.8 MB", added: "Mar 11, 2025", status: "Verified" },
  { id: "f4", name: "Breach Response.mp4", type: "MP4", size: "0.4 MB", added: "Mar 12, 2025", status: "Verified" },
  { id: "f5", name: "Cloud Security Best Practices.pdf", type: "PDF", size: "3.6 MB", added: "Feb 28, 2025", status: "Verified" },
  { id: "f6", name: "Zero Trust Architecture.md", type: "MD", size: "0.2 MB", added: "Feb 20, 2025", status: "Verified" },
  { id: "f7", name: "Penetration Testing Checklist.pdf", type: "PDF", size: "5.1 MB", added: "Feb 15, 2025", status: "Verified" },
  { id: "f8", name: "Incident Response Playbook.docx", type: "DOCX", size: "1.4 MB", added: "Feb 10, 2025", status: "Processing" },
];

// ── Chart data (25 days, Mar 1-25) ───────────────────────────
function mkChartData(): ChartPoint[] {
  const vals = [0.08,0.12,0.06,0.15,0.11,0.19,0.22,0.14,0.09,0.17,0.25,0.21,0.13,0.18,0.30,0.24,0.16,0.27,0.33,0.20,0.28,0.35,0.22,0.31,0.29];
  const qry  = [24,38,18,45,33,58,67,42,28,52,76,64,39,55,92,74,49,83,101,61,86,108,67,95,88];
  return vals.map((e, i) => ({
    date: `Mar ${i + 1}`,
    earnings: e,
    queries: qry[i],
    unique: Math.round(qry[i] * 0.68),
  }));
}
export const CHART_DATA = mkChartData();

// ── Transactions ──────────────────────────────────────────────
export const TRANSACTIONS: Transaction[] = [
  { id:"tx1", type:"Query",   collection:"Cybersecurity Notes",    amount:"0.32 MON", from:"0xAb12...3Cd4", toHash:"0x9b2e4...f3a0", status:"Completed",  date:"Mar 12, 2025 14:23", timestamp:1741783380 },
  { id:"tx2", type:"Purchase",collection:"Network Configurations", amount:"0.58 MON", from:"0xCd34...5Ef6", toHash:"0xDe4b8...3b1",  status:"Completed",  date:"Mar 12, 2025 14:33", timestamp:1741783980 },
  { id:"tx3", type:"Payout",  collection:"Cybersecurity Notes",    amount:"0.88 MON", from:"Contract",      toHash:"0x0xDe3...53",   status:"Completed",  date:"Mar 13, 2025 09:12", timestamp:1741857120 },
  { id:"tx4", type:"Refund",  collection:"API Documentation",      amount:"0.00 MON", from:"0xEf56...7Gh8", toHash:"0xDe4b5...703",  status:"Refunded",   date:"Mar 13, 2025 14:33", timestamp:1741876380 },
  { id:"tx5", type:"Collection Published", collection:"Network Configurations", amount:"0.00 MON", from:"0x3F2a...7c9D", toHash:"0xDe2b5...477", status:"Completed", date:"Mar 12, 2025 09:30", timestamp:1741769400 },
  { id:"tx6", type:"Query",   collection:"Network Configurations", amount:"0.62 MON", from:"0xGh78...9Ij0", toHash:"0xFb3c2...8a4",  status:"Completed",  date:"Mar 14, 2025 11:05", timestamp:1741950300 },
  { id:"tx7", type:"Query",   collection:"Cybersecurity Notes",    amount:"0.32 MON", from:"0xIj90...1Kl2", toHash:"0x1a4d3...9e2",  status:"Pending",    date:"Mar 14, 2025 15:41", timestamp:1741967260 },
  { id:"tx8", type:"Payout",  collection:"API Documentation",      amount:"0.42 MON", from:"Contract",      toHash:"0x2b5e4...0f3",   status:"Completed",  date:"Mar 15, 2025 14:33", timestamp:1742047980 },
  { id:"tx9", type:"Purchase",collection:"Cybersecurity Notes",    amount:"0.32 MON", from:"0xKl12...3Mn4", toHash:"0x3c6f5...1a4",  status:"Completed",  date:"Mar 15, 2025 16:22", timestamp:1742054520 },
  { id:"tx10",type:"Query",   collection:"API Documentation",      amount:"0.00 MON", from:"0xMn34...5Op6", toHash:"0x4d7a6...2b5",  status:"Failed",     date:"Mar 16, 2025 10:14", timestamp:1742119440 },
];

// ── Payouts ───────────────────────────────────────────────────
export const PAYOUTS: Payout[] = [
  { id:"p1", amount:"0.63 MON", date:"Oct 25, 2025", status:"Completed", hash:"0x9b2e4...f3a0", collection:"Cybersecurity Notes" },
  { id:"p2", amount:"0.88 MON", date:"Oct 25, 2025", status:"Completed", hash:"0xDe4b8...3b1",  collection:"Network Configurations" },
  { id:"p3", amount:"0.42 MON", date:"Mar 15, 2025", status:"Completed", hash:"0x2b5e4...0f3",   collection:"API Documentation" },
];

// ── Top queries (Analytics) ───────────────────────────────────
export const TOP_QUERIES: TopQuery[] = [
  { text: "What is parallel execution?",         count: 182 },
  { text: "How does Monad achieve speed?",        count: 134 },
  { text: "Best practices for smart contracts",  count: 97  },
  { text: "Explain transaction finality",         count: 76  },
  { text: "How to deploy a DApp on Monad?",       count: 61  },
];

// ── Suggested questions (Ask & Query) ────────────────────────
export const SUGGESTED_QUESTIONS = [
  "Explain MonadConsensus Mechanism",
  "What are the top five security threats?",
  "Best practices for smart contracts",
  "Compare consensus mechanisms",
  "How to deploy a DApp on Monad?",
];

// ── Recent activity (Dashboard) ───────────────────────────────
export const ACTIVITY: ActivityItem[] = [
  { id:"a1", type:"query",      message:"New query answered",         collection:"Cybersecurity Notes",    amount:"0.32 MON", time:"2 min ago"  },
  { id:"a2", type:"purchase",   message:"Collection purchased",       collection:"Network Configurations", amount:"0.62 MON", time:"14 min ago" },
  { id:"a3", type:"payout",     message:"Model size changed",         collection:"API Documentation",      amount:"",         time:"1h ago"     },
  { id:"a4", type:"api",        message:"API key created",            collection:"",                       amount:"",         time:"3h ago"     },
  { id:"a5", type:"collection", message:"New query answered",         collection:"Cybersecurity Notes",    amount:"0.32 MON", time:"5h ago"     },
  { id:"a6", type:"query",      message:"Collection published",       collection:"API Documentation",      amount:"",         time:"1d ago"     },
];

// ── API Keys ──────────────────────────────────────────────────
export const API_KEYS: ApiKey[] = [
  { id:"k1", name:"Development Key", key:"dv_dev_sk_test_5KcZr8mNpQvXyWj3bAeGhL2uD7sF9tYi",  status:"Active",   created:"Mar 10, 2025", lastUsed:"Today",          requests: 1482 },
  { id:"k2", name:"Production Key",  key:"dv_live_sk_prod_9RvBnMqPxUwZaKe6cJoTlS4fH1gYiL",  status:"Disabled", created:"Mar 01, 2025", lastUsed:"Mar 14, 2025",   requests: 0    },
];

// ── User profile ──────────────────────────────────────────────
export const USER_PROFILE = {
  name:    "Taylor Monad",
  role:    "Creator",
  bio:     "Building the future of private knowledge monetisation on Monad. Researcher and protocol designer.",
  wallet:  "0x3F2a...7c9D",
  email:   "taylor@datavault.xyz",
  avatar:  "TM",
};

// ── Stats (Dashboard) ─────────────────────────────────────────
export const DASHBOARD_STATS = {
  collections:   12,
  totalQueries:  1248,
  totalEarnings: "2.48 MON",
  uptime:        "99.9%",
};

// ── Earnings breakdown (donut chart) ─────────────────────────
export const EARNINGS_BREAKDOWN = [
  { name:"Cybersecurity Notes",    value:1.34, color:"#7c3aed" },
  { name:"Network Configurations", value:0.76, color:"#6366f1" },
  { name:"API Documentation",      value:0.38, color:"#a855f7" },
];

// ── Helpers ───────────────────────────────────────────────────
export const CATEGORIES = ["All","Technical","Blockchain","Security","Research","Business","AI","Infrastructure","Finance","Data & Code"];

export function getOwnedCollections(): Collection[] {
  return COLLECTIONS.filter((c) => c.isOwned);
}

export function getMarketplaceCollections(): Collection[] {
  return COLLECTIONS.filter((c) => !c.isOwned);
}

export function getCollectionById(id: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}
