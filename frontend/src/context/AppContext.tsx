import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { COLLECTIONS, TRANSACTIONS, API_KEYS, USER_PROFILE, Collection, Transaction, ApiKey } from "@/lib/mockData";

interface AppContextValue {
  isDark: boolean;
  toggleTheme: () => void;

  collections: Collection[];
  addCollection: (c: Collection) => void;
  updateCollection: (id: string, patch: Partial<Collection>) => void;
  removeCollection: (id: string) => void;

  transactions: Transaction[];
  addTransaction: (t: Transaction) => void;

  apiKeys: ApiKey[];
  addApiKey: (k: ApiKey) => void;
  revokeApiKey: (id: string) => void;
  enableApiKey: (id: string) => void;

  profile: typeof USER_PROFILE;
  updateProfile: (patch: Partial<typeof USER_PROFILE>) => void;

  notifCount: number;
  clearNotifs: () => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem("dv_theme") === "dark"; } catch { return true; }
  });
  const [collections, setCollections]   = useState<Collection[]>(COLLECTIONS);
  const [transactions, setTransactions] = useState<Transaction[]>(TRANSACTIONS);
  const [apiKeys, setApiKeys]           = useState<ApiKey[]>(API_KEYS);
  const [profile, setProfile]           = useState(USER_PROFILE);
  const [notifCount, setNotifCount]     = useState(3);
  const [searchQuery, setSearchQuery]   = useState("");

  // Apply dark class to root
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try { localStorage.setItem("dv_theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark((d) => !d);

  const addCollection    = (c: Collection) => setCollections((prev) => [c, ...prev]);
  const updateCollection = (id: string, patch: Partial<Collection>) =>
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCollection = (id: string) =>
    setCollections((prev) => prev.filter((c) => c.id !== id));

  const addTransaction = (t: Transaction) => setTransactions((prev) => [t, ...prev]);

  const addApiKey = (k: ApiKey) => setApiKeys((prev) => [k, ...prev]);
  const revokeApiKey = (id: string) =>
    setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "Disabled" as const } : k)));
  const enableApiKey = (id: string) =>
    setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "Active" as const } : k)));

  const updateProfile = (patch: Partial<typeof USER_PROFILE>) =>
    setProfile((p) => ({ ...p, ...patch }));

  const clearNotifs = () => setNotifCount(0);

  return (
    <AppContext.Provider
      value={{
        isDark, toggleTheme,
        collections, addCollection, updateCollection, removeCollection,
        transactions, addTransaction,
        apiKeys, addApiKey, revokeApiKey, enableApiKey,
        profile, updateProfile,
        notifCount, clearNotifs,
        searchQuery, setSearchQuery,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
