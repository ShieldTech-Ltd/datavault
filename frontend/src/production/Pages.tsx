import AccountSettings from './AccountSettings';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowRight, Plus, ShieldCheck, ArrowSquareOut } from './icons';
import { useWallet } from '../lib/wallet';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { monadTestnet, transactionExplorerUrl } from '../lib/network';
import BuyerDashboard from '../components/BuyerDashboard';
import OwnerDashboard from '../components/OwnerDashboard';
import { useResource, useWorkspace } from './data';
import { mon, short, type CollectionPage, type Collection, type Analytics } from './api';
import { Heading, State, WorkspaceGate, Metrics, CollectionCards, ActivityTable, coverFor } from './Views';

export function DashboardPage() {
  const collections = useResource<CollectionPage>('/api/collections?limit=24');
  const analytics = useResource<Analytics>('/api/marketplace/analytics');
  const { primaryWallet } = useWallet();
  return <>
    <section className="dv-reference-hero"><img className="dv-reference-hero-art" src="/assets/light/hero.png" alt=""/><div className="dv-reference-hero-copy"><span className="dv-eyebrow">DATA OWNERSHIP FOR THE AI ERA</span><h1>Your Knowledge<br/>Has <span>Real Value</span></h1><p>Upload, protect, and monetize your knowledge collections.<br/>Get verifiable AI answers with on-chain receipts.</p><div className="dv-hero-actions"><a className="dv-button" href="#register-knowledge">Register a Collection <ArrowRight size={16}/></a><Link className="dv-button secondary" to="/marketplace">Explore Collections</Link></div></div><div className="dv-reference-hero-metrics"><State resource={analytics} retry={analytics.reload}>{data => <Metrics data={data} uptime/>}</State></div></section>
    <div className="dv-reference-workspace">
      <section id="register-knowledge" className="dv-card dv-reference-register"><div className="dv-reference-panel-heading"><span>01</span><div><h2>Register a Knowledge Collection</h2><p>Upload your content, set a price, and earn from queries.</p></div></div><OwnerDashboard key={primaryWallet?.address ?? 'disconnected'} onChanged={() => { collections.reload(); analytics.reload(); }}/></section>
      <BuyerDashboard key={primaryWallet?.address ?? 'disconnected'} dashboard collections={collections.data?.collections} onSettled={() => { collections.reload(); analytics.reload(); }}/>
    </div>
  </>;
}
export function MarketplacePage() {
  const [params, setParams] = useSearchParams(); const search = (params.get('search') ?? '').slice(0, 64);
  const [offset, setOffset] = useState(0); const [status, setStatus] = useState<'all' | 'active' | 'paused'>('all');
  const collections = useResource<CollectionPage>(`/api/collections?limit=12&offset=${offset}&search=${encodeURIComponent(search)}`);
  return <><Heading title="Knowledge marketplace" description="Discover confirmed collections with ownership and current policy checked on chain." />
    <form className="dv-marketplace-search" role="search" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); setParams({ search: String(form.get('search') ?? '').trim().slice(0,64) }); }}><input aria-label="Search collections" name="search" maxLength={64} defaultValue={search} placeholder="Search knowledge collections..."/><button className="dv-button" type="submit">Search</button></form>
    <div className="dv-filter-bar"><span>{search ? `Search: ${search}` : 'Browse verified collections'}</span><label>Status on this page <select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option></select></label></div>
    <State resource={collections} retry={collections.reload}>{data => <><CollectionCards collections={data.collections.filter(c => status === 'all' || c.active === (status === 'active'))} /><div className="dv-pagination"><button className="dv-button secondary" disabled={offset === 0} onClick={() => setOffset(v => Math.max(0, v - 12))}>Previous</button><span>Page {Math.floor(offset / 12) + 1}</span><button className="dv-button secondary" disabled={!data.hasMore || offset + 12 > 1000} onClick={() => setOffset(v => v + 12)}>Next</button></div></>}</State>
  </>;
}
export function CollectionsPage() {
  const workspace = useWorkspace();
  return <><Heading title="Your collections" description="Publish private Markdown knowledge, set a price and control access through your wallet." action={<Link className="dv-button" to="/manage"><Plus size={17} /> New collection</Link>} />
    <WorkspaceGate kind="collections" /><State resource={workspace.collections} empty="Your collection list appears after you connect and sign." retry={() => void workspace.load('collections')}>{data => <><CollectionCards collections={data.collections} owner />{data.hasMore && <button className="dv-button secondary" disabled={workspace.loading || data.offset + data.limit > 1000} onClick={() => void workspace.load('collections', data.offset + data.limit)}>Load more collections</button>}</>}</State>
  </>;
}
export function CollectionPageView() {
  const { id = '' } = useParams(); const resource = useResource<Collection>(/^0x[0-9a-fA-F]{64}$/.test(id) ? `/api/collections/${id}` : null); const { primaryWallet } = useWallet();
  return <><Heading title="Collection details" description="Current ownership, query price and access policy for this collection." />
    <State resource={resource} empty="A valid collection ID is required." retry={resource.reload}>{item => <div className="dv-detail-grid"><article className="dv-card dv-detail"><img src={coverFor(item.name)} alt="" /><div><span className={`dv-status ${item.active ? 'active' : ''}`}>{item.active ? 'Active on chain' : 'Paused'}</span><h2>{item.name}</h2><p>{item.category ?? 'General'}{item.visibility === 'unlisted' ? ' ? Unlisted, accessible by ID' : ' ? Public'}</p>{item.description && <p>{item.description}</p>}<p>Source text is private. Buyers receive only selected cited passages after a paid query settles.</p><dl><dt>Owner</dt><dd>{item.ownerAddress}</dd><dt>Collection ID</dt><dd>{item.collectionId}</dd><dt>Policy version</dt><dd>{item.policyVersion}</dd><dt>Settled queries</dt><dd>{item.paidQueries}</dd></dl></div></article><aside className="dv-card dv-detail-side"><ShieldCheck size={32} /><h2>{mon(item.priceWei)}</h2><p>Per paid query, using test tokens.</p><p>{item.queryAvailable ? 'The service can currently quote this collection.' : 'Queries are currently unavailable. The owner or service configuration may need attention.'}</p>{item.queryAvailable && <Link className="dv-button" to={`/query?collection=${item.collectionId}`}>Ask this collection <ArrowRight size={16} /></Link>}{primaryWallet?.address.toLowerCase() === item.ownerAddress.toLowerCase() && <Link className="dv-button secondary" to={`/manage?collection=${item.collectionId}`}>Manage access</Link>}{transactionExplorerUrl(item.registrationTxHash) && <a href={transactionExplorerUrl(item.registrationTxHash)!} target="_blank" rel="noreferrer">Registration transaction <ArrowSquareOut size={15} /></a>}</aside></div>}</State>
  </>;
}
export function QueryPage() {
  const [params] = useSearchParams(); const collection = params.get('collection'); const request = params.get('request'); const { primaryWallet } = useWallet();
  return <><Heading title="Ask a collection" description="Review the live price, pay through your wallet and inspect a cited answer after settlement." />
    {request && <div className="dv-account-gate"><ShieldCheck size={24} /><div><strong>Recover your paid request</strong><p>Select Recover linked request below for {short(request)}. Recovery uses the existing payment. Questions are not stored in this browser.</p></div></div>}
    <div className="dv-paid-workspace"><BuyerDashboard key={primaryWallet?.address ?? 'disconnected'} selectedCollection={collection} selectedRequest={request} /></div>
  </>;
}
export function ManagePage() {
  const [params] = useSearchParams(); const collection = params.get('collection'); const { primaryWallet } = useWallet();
  return <><Heading title="Publish and control your knowledge" description="Upload privately, choose a query price and confirm the collection through your wallet." />
    {!primaryWallet ? <div className="dv-state"><ShieldCheck size={32} /><h2>Connect an owner wallet</h2><p>Use the wallet control above to publish or manage a collection.</p></div> : <div className="dv-card dv-owner-form"><OwnerDashboard key={`${primaryWallet.address}:${collection ?? 'new'}`} selectedCollection={collection} /></div>}
  </>;
}
export function EarningsPage() {
  const workspace = useWorkspace();
  return <><Heading title="Owner earnings" description="Recorded revenue from settled queries on your collections in the last 30 days." /><WorkspaceGate kind="analytics" />
    <div className="dv-account-gate"><div><strong>Payments go directly to your wallet</strong><p>The contract pays the owner when a query settles. There is no DataVault balance to withdraw. These records are not a complete wallet balance or transaction ledger.</p></div></div>
    <State resource={workspace.analytics} empty="Sign with your owner wallet to view recorded earnings." retry={() => void workspace.load('analytics')}>{data => <><Metrics data={data} /><div className="dv-section-title"><h2>Recent owner settlements</h2></div><div className="dv-card"><ActivityTable activity={data.recentActivity} /></div></>}</State>
  </>;
}
export function TransactionsPage() {
  const workspace = useWorkspace();
  return <><Heading title="Your paid requests" description="Recorded query payments, settlement status and recovery links for the connected buyer wallet." /><WorkspaceGate kind="history" />
    <State resource={workspace.history} empty="Sign with your buyer wallet to load requests." retry={() => void workspace.load('history')}>{data => <>
      {!data.requests.length ? <div className="dv-state"><h3>No paid requests yet</h3><p>Choose a collection and ask your first question.</p><Link className="dv-button" to="/marketplace">Explore marketplace</Link></div> : <div className="dv-card dv-table-scroll"><table className="dv-table"><thead><tr><th>Collection / request</th><th>Opened</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.requests.map(item => <tr key={item.requestId}><td>{item.collectionName ?? short(item.collectionId)}<small>{short(item.requestId)}</small></td><td>{new Date(item.openedAt).toLocaleString()}</td><td>{mon(item.amountWei)}</td><td><span className={`dv-status ${item.outcome === 'settled' ? 'active' : ''}`}>{item.outcome.replace(/_/g, ' ')}</span></td><td><a href={`/api/queries/${item.requestId}/receipt`} target="_blank" rel="noreferrer">Receipt</a><Link to={`/query?collection=${item.collectionId}&request=${item.requestId}`}>Recover / check</Link></td></tr>)}</tbody></table></div>}
      {data.hasMore && <button className="dv-button secondary" disabled={workspace.loading || data.offset + data.limit > 1000} onClick={() => void workspace.load('history', data.offset + data.limit)}>Load more requests</button>}
    </>}</State>
  </>;
}
export function AnalyticsPage() {
  const [scope, setScope] = useState<'marketplace' | 'owner'>('marketplace'); const publicData = useResource<Analytics>('/api/marketplace/analytics'); const workspace = useWorkspace(); const resource = scope === 'owner' ? workspace.analytics : publicData;
  return <><Heading title="Recorded analytics" description="Public collection settlements in the current deployment. My collections includes your unlisted records." />
    <div className="dv-tabs" role="group" aria-label="Analytics scope"><button className={scope === 'marketplace' ? 'selected' : ''} onClick={() => setScope('marketplace')}>Marketplace</button><button className={scope === 'owner' ? 'selected' : ''} onClick={() => setScope('owner')}>My collections</button></div>
    {scope === 'owner' && <WorkspaceGate kind="analytics" />}<State resource={resource} empty="Sign with your wallet to load owner analytics." retry={scope === 'owner' ? () => void workspace.load('analytics') : publicData.reload}>{data => <><Metrics data={data} /><div className="dv-two-columns"><section className="dv-card dv-panel"><h2>Top earning collections</h2><p>Last {data.periodDays} days</p>{!data.rankingAvailable ? <p>Ranking is unavailable because older settlement amounts are missing.</p> : data.topCollections.length ? <ol className="dv-ranking">{data.topCollections.map((item, i) => <li key={item.collectionId}><b>{i + 1}</b><Link to={`/collections/${item.collectionId}`}>{item.name}<small>{item.paidQueries} settled queries</small></Link><strong>{mon(item.recordedRevenueWei)}</strong></li>)}</ol> : <p>No settlements recorded in this period.</p>}</section><section className="dv-card dv-panel"><h2>Data coverage</h2><dl><dt>Payments with recorded amounts</dt><dd>{data.revenueCoverage.knownAmounts}</dd><dt>Settled requests in period</dt><dd>{data.revenueCoverage.settledQueries}</dd></dl><p>The service currently provides a fixed 30-day summary. Daily growth, question rankings and audience metrics are unavailable.</p></section></div><div className="dv-section-title"><h2>Recent settlements</h2><span>Up to 10 records</span></div><div className="dv-card"><ActivityTable activity={data.recentActivity} /></div></>}</State>
  </>;
}
export function ApiPage() {
  return <><Heading title="Signed API access" description="The current API authorizes paid actions and private activity reads with wallet signatures." /><div className="dv-two-columns"><section className="dv-card dv-panel"><ShieldCheck size={32} /><h2>Wallet authorization</h2><p>Owner and buyer activity reads, query execution and answer recovery use EIP-191 signed messages bound to the deployment and request purpose.</p><p>Send <code>x-signature</code> and <code>x-timestamp</code> headers. Public catalogue and receipt endpoints do not require a wallet signature.</p><a className="dv-button secondary" href="https://github.com/ShieldTech-Ltd/datavault/blob/master/docs/api-contract.md" target="_blank" rel="noreferrer">Read the API contract <ArrowSquareOut size={16} /></a></section><section className="dv-card dv-panel"><h2>API key management unavailable</h2><p>DataVault does not currently issue API keys, scopes or developer plans. No key is generated or stored by this page.</p><p>Use the published wallet-signature protocol for supported integrations.</p></section></div></>;
}
export function SettingsPage() {
  const { primaryWallet, correctNetwork } = useWallet();
  return <><Heading title="Workspace settings" description="Your wallet connection, deployment identity and saved account preferences." /><div className="dv-two-columns"><section className="dv-card dv-panel"><h2>Connection</h2><dl><dt>Wallet</dt><dd>{primaryWallet?.address ?? 'Not connected'}</dd><dt>Expected network</dt><dd>{monadTestnet.name} ({monadTestnet.chainId})</dd><dt>Wallet network</dt><dd>{primaryWallet ? correctNetwork ? 'Matches deployment' : 'Switch required' : 'Not connected'}</dd><dt>Contract</dt><dd>{CONTRACT_ADDRESS ?? 'Not configured'}</dd></dl></section><AccountSettings /><section className="dv-card dv-panel"><h2>Privacy</h2><p>The browser retains request identifiers for recovery, without plaintext questions. The service retains paid answers, and selected source passages are sent to its model provider.</p></section></div></>;
}
