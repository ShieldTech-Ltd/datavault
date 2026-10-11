import ServiceStatus from './ServiceStatus';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Stack, Wallet, ChatCircleText, ShieldCheck } from './icons';
import { useWallet } from '../lib/wallet';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { transactionExplorerUrl } from '../lib/network';
import { useWorkspace, type Resource } from './data';
import { mon, short, revenueLabel, type Analytics, type Collection, type Activity } from './api';

export function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="dv-page-heading"><div><p className="dv-eyebrow">YOUR KNOWLEDGE WORKSPACE</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function State<T>({ resource, empty, retry, children }: { resource: Resource<T>; empty?: string; retry?: () => void; children: (data: T) => ReactNode }) {
  if (resource.status === 'error') return <div className="dv-state dv-error" role="status"><ShieldCheck size={28} /><h3>Data unavailable</h3><p>{resource.error}</p>{retry && <button className="dv-button secondary" onClick={retry}>Try again</button>}</div>;
  if (resource.status === 'loading') return <div className="dv-state" role="status"><p>Loading verified records...</p></div>;
  if (!resource.data) return <div className="dv-state"><p>{empty ?? 'Records have not been loaded.'}</p></div>;
  return <>{children(resource.data)}</>;
}
export function WorkspaceGate({ kind = 'all' }: { kind?: 'all' | 'collections' | 'analytics' | 'history' }) {
  const { primaryWallet } = useWallet(); const workspace = useWorkspace();
  return <div className="dv-account-gate"><ShieldCheck size={24} /><div><strong>{primaryWallet ? 'Your wallet, your records' : 'Connect your wallet to open your workspace'}</strong><p>{!CONTRACT_ADDRESS ? 'Workspace data is unavailable until the contract is configured.' : 'Sign a read-only message to load your account records. This does not open a payment.'}</p></div>
    {primaryWallet && CONTRACT_ADDRESS && <button className="dv-button secondary" disabled={workspace.loading} onClick={() => void workspace.load(kind)}>{workspace.loading ? 'Check your wallet...' : 'Load my workspace'}</button>}
  </div>;
}

export function Metrics({ data, uptime = false }: { data: Analytics; uptime?: boolean }) {
  const complete = data.revenueCoverage.knownAmounts === data.revenueCoverage.settledQueries;
  return <div className="dv-metrics">
    <div className="dv-card"><Stack size={24} /><span>Confirmed collections</span><strong>{data.confirmedCollections}</strong><small>{data.ownerAddress ? 'Owned collections, including unlisted' : 'Public collections in this deployment'}</small></div>
    <div className="dv-card"><ChatCircleText size={24} /><span>Settled queries</span><strong>{data.paidQueries}</strong><small>Last {data.periodDays} days</small></div>
    <div className="dv-card"><Wallet size={24} /><span>Recorded owner revenue</span><strong>{revenueLabel(data)}</strong><small>{complete ? 'Exact for recorded settlements' : 'Older records have missing amounts'}</small></div>
    {uptime && <ServiceStatus />}
  </div>;
}
export function coverFor(name: string) {
  const words = name.toLowerCase();
  const art = /secur|cyber/.test(words) ? 'cybersecurity' : /network/.test(words) ? 'network' : /blockchain|monad/.test(words) ? 'blockchain' : /contract/.test(words) ? 'contracts' : /api|code/.test(words) ? 'api' : /learn|\bai\b/.test(words) ? 'machine-learning' : /financ|defi/.test(words) ? 'defi' : 'cloud';
  return `/assets/professional/${art}.webp`;
}
export function CollectionCards({ collections, owner = false }: { collections: Collection[]; owner?: boolean }) {
  if (!collections.length) return <div className="dv-state"><Stack size={30} /><h3>{owner ? 'Your knowledge starts here' : 'No collections found'}</h3><p>{owner ? 'Publish your first Markdown collection and set its query price.' : 'Try a different search, or check back when an owner publishes a collection.'}</p>{owner && <Link className="dv-button" to="/manage">Publish a collection <ArrowRight size={16} /></Link>}</div>;
  return <div className="dv-collection-grid">{collections.map(item => <article className="dv-card dv-collection" key={item.collectionId}>
    <Link to={`/collections/${item.collectionId}`} className="dv-cover"><img src={coverFor(item.name)} alt="" loading="lazy" decoding="async" /><span className={`dv-status ${item.active ? 'active' : ''}`}>{item.active ? 'Active' : 'Paused'}</span></Link>
    <div className="dv-collection-body"><span className="dv-eyebrow">VERIFIED ON CHAIN</span><h3><Link to={`/collections/${item.collectionId}`}>{item.name}</Link></h3><p>Owner {short(item.ownerAddress)}</p><div className="dv-collection-meta"><span>{item.paidQueries} settled queries</span><strong>{mon(item.priceWei)} / query</strong></div>
      <Link className="dv-button secondary" to={owner ? `/manage?collection=${item.collectionId}` : `/query?collection=${item.collectionId}`}>{owner ? 'Manage collection' : item.queryAvailable ? 'Ask a question' : 'View query availability'}<ArrowRight size={16} /></Link>
    </div></article>)}</div>;
}
export function ActivityTable({ activity }: { activity: Activity[] }) {
  if (!activity.length) return <div className="dv-state"><p>No settlements recorded in this period.</p></div>;
  return <div className="dv-table-scroll"><table className="dv-table"><thead><tr><th>Collection</th><th>Settled</th><th>Amount</th><th>Proof</th></tr></thead><tbody>{activity.map(item => <tr key={item.requestId}><td>{item.collectionName}<small>{short(item.requestId)}</small></td><td>{item.settledAt ? new Date(item.settledAt).toLocaleString() : 'Unavailable'}</td><td>{mon(item.amountWei)}</td><td><a href={`/api/queries/${item.requestId}/receipt`} target="_blank" rel="noreferrer">Receipt</a>{transactionExplorerUrl(item.settleTxHash) && <a href={transactionExplorerUrl(item.settleTxHash)!} target="_blank" rel="noreferrer">Transaction</a>}</td></tr>)}</tbody></table></div>;
}
