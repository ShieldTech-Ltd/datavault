import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useWallet } from './lib/wallet';
import { CONTRACT_ADDRESS } from './lib/contract';
import { monadTestnet } from './lib/network';
import { WorkspaceProvider } from './production/data';
import { AccountProvider } from './production/account';
import Shell from './production/Shell';
import { DashboardPage, MarketplacePage, CollectionsPage, CollectionPageView, QueryPage, ManagePage, EarningsPage, TransactionsPage, AnalyticsPage, ApiPage, SettingsPage } from './production/Pages';
import './app.css';
import './production/dashboard.css';
import './production/light-reference.css';
function MarketplaceRoute() { const location = useLocation(); return <MarketplacePage key={location.search} />; }
export default function App() {
  const { primaryWallet, correctNetwork } = useWallet();
  const identity = `${monadTestnet.chainId}:${CONTRACT_ADDRESS}:${correctNetwork}:${primaryWallet?.address.toLowerCase() ?? 'disconnected'}`;
  const routes = <AccountProvider><WorkspaceProvider key={identity}><Routes><Route element={<Shell />}>
    <Route index element={<DashboardPage />} /><Route path="collections" element={<CollectionsPage />} />
    <Route path="collections/:id" element={<CollectionPageView />} /><Route path="marketplace" element={<MarketplaceRoute />} />
    <Route path="query" element={<QueryPage />} /><Route path="manage" element={<ManagePage />} />
    <Route path="earnings" element={<EarningsPage />} /><Route path="transactions" element={<TransactionsPage />} />
    <Route path="analytics" element={<AnalyticsPage />} /><Route path="api-access" element={<ApiPage />} />
    <Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes></WorkspaceProvider></AccountProvider>;
  return typeof document === 'undefined'
    ? <MemoryRouter initialEntries={[`${window.location.pathname}${window.location.search ?? ''}`]}>{routes}</MemoryRouter>
    : <BrowserRouter>{routes}</BrowserRouter>;
}
