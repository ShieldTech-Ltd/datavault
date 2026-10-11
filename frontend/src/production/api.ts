import { formatEther } from 'viem';

export interface Collection {
  collectionId: string; name: string; ownerAddress: string; createdAt: number;
  registrationTxHash: string | null; paidQueries: number; priceWei: string;
  policyVersion: number; active: boolean; queryAvailable: boolean;
  chainId: number; contractAddress: string;
  currentCollectionId?: string; newerUnlistedRevision?: boolean;
  description?: string; category?: string; visibility?: "public" | "unlisted";
}
export interface RevisionHistory { originalCollectionId?:string; currentCollectionId?:string; newerUnlistedRevision?:boolean; versions:{collectionId:string;name:string;ordinal:number;registrationTxHash:string|null}[]; nextCursor:number|null }
export interface CollectionPage { collections: Collection[]; hasMore: boolean; limit: number; offset: number }
export interface Activity {
  requestId: string; collectionId: string; collectionName: string; buyerAddress: string;
  amountWei: string | null; settledAt: number | null; settleTxHash: string | null;
}
export interface Analytics {
  windowStart:string;windowEnd:string;aggregationLimit:number;failureTimeField:'created_at';failedQueries:number;refundedQueries:number;
  daily:{date:string;settledQueries:number;failedQueries:number;refundedQueries:number;knownAmounts:number;recordedRevenueWei:string}[];
  periodDays: number; ownerAddress?: string; confirmedCollections: number; paidQueries: number;
  recordedRevenueWei: string | null; revenueCoverage: { knownAmounts: number; settledQueries: number };
  rankingAvailable: boolean;
  topCollections: { collectionId: string; name: string; paidQueries: number; recordedRevenueWei: string }[];
  recentActivity: Activity[];
}
export interface PaidRequest {
  requestId: string; collectionId: string; collectionName: string | null;
  openTxHash: string; settleTxHash: string | null; amountWei: string | null;
  outcome: string; openedAt: number; settledAt: number | null;
}
export interface HistoryPage { buyerAddress: string; requests: PaidRequest[]; hasMore: boolean; limit: number; offset: number }

function validatePayload(path: string, value: any): boolean {
  const hash = (v: unknown) => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
  const address = (v: unknown) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
  const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const amount = (v: unknown) => typeof v === 'string' && /^\d+$/.test(v);
  const collection = (v: any) => v && hash(v.collectionId) && address(v.ownerAddress) && typeof v.name === 'string'
    && (v.description === undefined || typeof v.description === 'string' && v.description.length <= 2000)
    && (v.category === undefined || ['General','Technology','Business','Research','Education','Finance','Legal','Other'].includes(v.category))
    && (v.visibility === undefined || ['public','unlisted'].includes(v.visibility))
    && amount(v.priceWei) && count(v.paidQueries) && typeof v.active === 'boolean' && typeof v.queryAvailable === 'boolean';
  const page = (v: any) => v && typeof v.hasMore === 'boolean' && count(v.offset) && count(v.limit) && v.limit > 0;
  const route = path.split('?')[0];
  if (route === '/api/collections' || route === '/api/owner/collections') return page(value) && Array.isArray(value.collections) && value.collections.every(collection);
  if (/^\/api\/collections\/0x[0-9a-fA-F]{64}\/revisions$/.test(route)) return value && (value.originalCollectionId===undefined || hash(value.originalCollectionId)) && (value.currentCollectionId===undefined || hash(value.currentCollectionId)) && (value.nextCursor===null || count(value.nextCursor)) && Array.isArray(value.versions) && value.versions.length<=50 && value.versions.every((v:any)=>hash(v.collectionId)&&typeof v.name==='string'&&count(v.ordinal)&&v.ordinal>0);
  if (/^\/api\/collections\/0x/.test(route)) return collection(value);
  if (route === '/api/marketplace/analytics' || route === '/api/owner/analytics') return value && count(value.periodDays)
    && value.periodDays>0 && value.periodDays<=90 && typeof value.windowStart==='string' && typeof value.windowEnd==='string'
    && Number.isFinite(Date.parse(value.windowStart)) && Date.parse(value.windowEnd)-Date.parse(value.windowStart)===value.periodDays*86400000
    && count(value.failedQueries) && count(value.refundedQueries) && value.aggregationLimit===10000 && value.failureTimeField==='created_at'
    && Array.isArray(value.daily) && value.daily.length===value.periodDays && value.daily.every((v:any,i:number)=>v.date===new Date(Date.parse(value.windowStart)+i*86400000).toISOString().slice(0,10)&&count(v.settledQueries)&&count(v.failedQueries)&&count(v.refundedQueries)&&count(v.knownAmounts)&&amount(v.recordedRevenueWei))
    && count(value.confirmedCollections) && count(value.paidQueries) && (value.recordedRevenueWei === null || amount(value.recordedRevenueWei))
    && value.revenueCoverage && count(value.revenueCoverage.knownAmounts) && count(value.revenueCoverage.settledQueries)
    && typeof value.rankingAvailable === 'boolean' && Array.isArray(value.topCollections) && value.topCollections.every((v: any) => v && hash(v.collectionId) && typeof v.name === 'string' && count(v.paidQueries) && amount(v.recordedRevenueWei))
    && Array.isArray(value.recentActivity) && value.recentActivity.every((v: any) => v && hash(v.requestId) && typeof v.collectionName === 'string' && address(v.buyerAddress) && (v.amountWei === null || amount(v.amountWei)) && (v.settleTxHash === null || hash(v.settleTxHash)));
  if (route === '/api/buyer/queries') return page(value) && address(value.buyerAddress) && Array.isArray(value.requests)
    && value.requests.every((v: any) => v && hash(v.requestId) && hash(v.collectionId) && hash(v.openTxHash) && typeof v.outcome === 'string' && count(v.openedAt) && (v.amountWei === null || amount(v.amountWei)));
  return true;
}

export async function apiJson<T>(path: string, init?: RequestInit, suppliedResponse?:Response): Promise<T> {
  const response = suppliedResponse ?? await fetch(path, { ...init, cache: 'no-store' });
  if (!response.ok) {
    // Do not surface untrusted HTML, provider errors or private infrastructure details.
    const label = response.status === 429 ? 'Too many requests. Please wait a minute and retry.'
      : response.status === 401 || response.status === 403 ? 'Wallet authorization was rejected. Sign again with the correct account.'
      : path.includes('/analytics') && response.status===400 ? 'Use valid UTC dates, an exclusive end, and a range of 1 to 90 days.'
      : path.includes('/analytics') && response.status===503 ? 'Analytics exceeds the 10,000-record exact aggregation limit or this deployment is unavailable. Choose a smaller window and retry.'
      : 'This service is unavailable. Your data has not been replaced with sample activity.';
    throw new Error(label);
  }
  try {
    const value = await response.json();
    if (!validatePayload(path, value)) throw new Error('Invalid payload');
    return value as T;
  }
  catch { throw new Error('The service returned an invalid response. Please retry.'); }
}
export function mon(value: string | null): string {
  if (value === null) return 'Unavailable';
  try { return `${formatEther(BigInt(value))} MON`; } catch { return 'Unavailable'; }
}
export function short(value: string): string { return `${value.slice(0, 6)}...${value.slice(-4)}`; }
export function selectedWindowLabel(data: Pick<Analytics,'windowStart'|'windowEnd'>):string {
  return `Selected window: ${data.windowStart.slice(0,10)} to ${data.windowEnd.slice(0,10)} UTC (exclusive end)`;
}
export function revenueLabel(data: Analytics): string {
  return `${data.revenueCoverage.knownAmounts < data.revenueCoverage.settledQueries && data.recordedRevenueWei !== null ? 'At least ' : ''}${mon(data.recordedRevenueWei)}`;
}
