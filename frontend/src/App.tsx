import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import Layout from "@/components/Layout";
import Dashboard      from "@/pages/Dashboard";
import MyCollections  from "@/pages/MyCollections";
import CollectionDetail from "@/pages/CollectionDetail";
import Marketplace    from "@/pages/Marketplace";
import AskQuery       from "@/pages/AskQuery";
import Earnings       from "@/pages/Earnings";
import Transactions   from "@/pages/Transactions";
import Analytics      from "@/pages/Analytics";
import ApiAccess      from "@/pages/ApiAccess";
import Settings       from "@/pages/Settings";

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="collections" element={<MyCollections />} />
            <Route path="collections/:id" element={<CollectionDetail />} />
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="query" element={<AskQuery />} />
            <Route path="earnings" element={<Earnings />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="api-access" element={<ApiAccess />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
