import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWallet } from '../lib/wallet';
import { CONTRACT_ADDRESS } from '../lib/contract';
import { monadTestnet } from '../lib/network';
import { ownerSummaryMessage, buyerHistoryMessage } from '../../../shared/api';
import { apiJson, type CollectionPage, type Analytics, type HistoryPage } from './api';
import { defaultDateWindow, windowQuery, SignedAnalyticsClient, type DateWindow } from './analytics-client';

export type Resource<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data: T | null; error: string };
export function emptyResource<T>(): Resource<T> { return { status: 'idle', data: null, error: '' }; }
export function useResource<T>(path: string | null) {
  const [resource, setResource] = useState<Resource<T>>(emptyResource);
  const [resourcePath,setResourcePath]=useState<string|null>(path);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setResourcePath(path);
    if (!path) { setResource(emptyResource()); return; }
    setResource({ status: 'loading', data: null, error: '' });
    apiJson<T>(path, { signal: controller.signal }).then(data => {
      if (active) setResource({ status: 'ready', data, error: '' });
    }).catch(cause => {
      if (active) setResource({ status: 'error', data: null, error: cause instanceof Error ? cause.message : 'Service unavailable.' });
    });
    return () => { active = false; controller.abort(); };
  }, [path, version]);
  return { ...(resourcePath===path?resource:emptyResource<T>()), reload: () => setVersion(v => v + 1) };
}

interface WorkspaceData {
  window:DateWindow;setWindow:(window:DateWindow)=>void;exportAnalytics:()=>Promise<Blob|null>;
  collections: Resource<CollectionPage>; analytics: Resource<Analytics>; history: Resource<HistoryPage>;
  loading: boolean; load: (kind?: 'all' | 'collections' | 'analytics' | 'history', offset?: number) => Promise<void>;
}
const Workspace = createContext<WorkspaceData | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { primaryWallet, correctNetwork } = useWallet();
  const [collections, setCollections] = useState<Resource<CollectionPage>>(emptyResource);
  const [analytics, setAnalytics] = useState<Resource<Analytics>>(emptyResource);
  const [history, setHistory] = useState<Resource<HistoryPage>>(emptyResource);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [window,setDateWindow]=useState<DateWindow>(defaultDateWindow);
  const identity=`${correctNetwork?primaryWallet?.address.toLowerCase():''}:${windowQuery(window)}`;
  const identityRef=useRef(identity);identityRef.current=identity;
  const generation=useRef(0);
  const [resourceIdentity,setResourceIdentity]=useState(identity);
  useEffect(()=>{++generation.current;pending.current=false;setCollections(emptyResource());setAnalytics(emptyResource());setHistory(emptyResource());setLoading(false);setResourceIdentity(identity);},[identity]);
  const setWindow=(value:DateWindow)=>{++generation.current;setDateWindow(value);setAnalytics(emptyResource());};
  async function exportAnalytics(){
    if(!primaryWallet||!correctNetwork||!CONTRACT_ADDRESS)return null;
    const captured=identity,version=generation.current;
    const result=await new SignedAnalyticsClient(monadTestnet.chainId,CONTRACT_ADDRESS).read(primaryWallet,window,()=>identityRef.current===captured&&generation.current===version,true);
    return result instanceof Blob?result:null;
  }

  async function load(kind: 'all' | 'collections' | 'analytics' | 'history' = 'all', offset = 0) {
    if (!primaryWallet || !correctNetwork || !CONTRACT_ADDRESS || pending.current) return;
    const captured=identity,version=++generation.current;
    const current=()=>identityRef.current===captured&&generation.current===version;
    pending.current = true;
    setLoading(true);
    const ownerNeeded = kind !== 'history';
    const historyNeeded = kind === 'all' || kind === 'history';
    const collectionNeeded = kind === 'all' || kind === 'collections';
    const analyticsNeeded = kind === 'all' || kind === 'analytics';
    const loadingState = <T,>(previous: Resource<T>): Resource<T> => ({ ...previous, status: 'loading', error: '' });
    if (collectionNeeded) setCollections(loadingState);
    if (analyticsNeeded) setAnalytics(loadingState);
    if (historyNeeded) setHistory(loadingState);
    try {
      const client = await primaryWallet.getWalletClient();
      if (await client.getChainId() !== monadTestnet.chainId) throw new Error(`Switch to ${monadTestnet.name} first.`);
      const address = primaryWallet.address.toLowerCase();
      async function headers(purpose: 'owner' | 'buyer') {
        const timestamp = Date.now();
        const message = purpose === 'owner'
          ? ownerSummaryMessage(monadTestnet.chainId, CONTRACT_ADDRESS!, address, timestamp)
          : buyerHistoryMessage(monadTestnet.chainId, CONTRACT_ADDRESS!, address, timestamp);
        const signature=await client.signMessage({message});
        const latest=await primaryWallet!.getWalletClient();
        if(!current()||await latest.getChainId()!==monadTestnet.chainId)throw new Error('Wallet or analytics window changed.');
        return { 'x-signature':signature, 'x-timestamp': String(timestamp) };
      }
      const ownerHeaders = ownerNeeded ? await headers('owner') : undefined;
      const buyerHeaders = historyNeeded ? await headers('buyer') : undefined;
      if(!current())return;
      const ready = <T,>(data: T): Resource<T> => ({ status: 'ready', data, error: '' });
      const failed = <T,>(cause: unknown): Resource<T> => ({ status: 'error', data: null, error: cause instanceof Error ? cause.message : 'Service unavailable.' });
      await Promise.all([
        collectionNeeded ? apiJson<CollectionPage>(`/api/owner/collections?address=${address}&limit=24&offset=${offset}`, { headers: ownerHeaders })
          .then(data => {
            if (!Array.isArray(data.collections) || data.collections.some(item => item.ownerAddress?.toLowerCase() !== address)) throw new Error('Collection response does not match this wallet.');
            if(current())setCollections(previous => ready({ ...data, collections: offset ? [...(previous.data?.collections ?? []), ...data.collections] : data.collections }));
          })
          .catch(cause => {if(current())setCollections(failed(cause));}) : Promise.resolve(),
        analyticsNeeded ? apiJson<Analytics>(`/api/owner/analytics?address=${address}&${windowQuery(window)}`, { headers: ownerHeaders })
          .then(data => { if (data.ownerAddress?.toLowerCase() !== address || data.windowStart!==window.start+'T00:00:00.000Z'||data.windowEnd!==window.end+'T00:00:00.000Z') throw new Error('Owner response does not match this wallet and window.'); if(current())setAnalytics(ready(data)); })
          .catch(cause => {if(current())setAnalytics(failed(cause));}) : Promise.resolve(),
        historyNeeded ? apiJson<HistoryPage>(`/api/buyer/queries?address=${address}&limit=20&offset=${offset}`, { headers: buyerHeaders })
          .then(data => { if (data.buyerAddress.toLowerCase() !== address) throw new Error('Buyer response does not match this wallet.');
            if(current())setHistory(previous => ready({ ...data, requests: offset ? [...(previous.data?.requests ?? []), ...data.requests] : data.requests })); })
          .catch(cause => {if(current())setHistory(failed(cause));}) : Promise.resolve(),
      ]);
    } catch (cause) {
      if(!current())return;
      const error = cause instanceof Error ? cause.message : 'Wallet authorization unavailable.';
      const fail = { status: 'error' as const, data: null, error };
      if (collectionNeeded) setCollections(fail);
      if (analyticsNeeded) setAnalytics(fail);
      if (historyNeeded) setHistory(fail);
    } finally { if(current()){pending.current = false; setLoading(false);} }
  }
  const visible=resourceIdentity===identity;
  return <Workspace.Provider value={{ collections:visible?collections:emptyResource(), analytics:visible?analytics:emptyResource(), history:visible?history:emptyResource(), loading:visible&&loading, load,window,setWindow,exportAnalytics }}>{children}</Workspace.Provider>;
}
export function useWorkspace() { const value = useContext(Workspace); if (!value) throw new Error('Workspace provider missing'); return value; }
