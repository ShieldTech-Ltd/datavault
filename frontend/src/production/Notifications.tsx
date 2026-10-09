import { useEffect, useRef, useState } from 'react';
import { useAccount } from './account';
export interface InboxItem {id:number;type:string;sourceId:string;collectionId:string;collectionName:string;amountWei:string|null;createdAt:number;readAt:number|null}
const labels:Record<string,string>={collection_registered:'Collection registered',payout_settled:'Payout settled',query_failed:'Query failed',query_refundable:'Query refundable'};
export function InboxView({signedIn,items,loading,error,onSignIn,onRead,onRetry,onMore}:{signedIn:boolean;items:InboxItem[];loading:boolean;error:string;onSignIn?:()=>void;onRead?:(id:number)=>void;onRetry?:()=>void;onMore?:()=>void}) {
 if(!signedIn)return <div><p>Sign in to view your notifications.</p><button className="dv-button secondary" onClick={onSignIn}>Sign in</button></div>;
 return <div>{loading&&<p role="status">Loading notifications...</p>}{error&&<div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div>}{!loading&&!error&&!items.length&&<p>No notifications yet.</p>}<ul>{items.map(item=><li key={item.id}><strong>{labels[item.type]??'Account event'}</strong><p><a href={`/collections/${encodeURIComponent(item.collectionId)}`}>{item.collectionName}</a>{item.amountWei!==null&&<>{`, ${item.amountWei} wei`}</>}</p>{item.type!=='collection_registered'&&<a href={`/query?collection=${encodeURIComponent(item.collectionId)}&request=${encodeURIComponent(item.sourceId)}`}>Request details</a>}<p><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString()}</time></p>{item.readAt===null&&<button disabled={loading} onClick={()=>onRead?.(item.id)}>Mark read</button>}</li>)}</ul>{onMore&&<button disabled={loading} onClick={onMore}>Load more</button>}</div>;
}
export default function Notifications(){
 const {state,client}=useAccount(),[open,setOpen]=useState(false),[page,setPage]=useState<{owner:string;items:InboxItem[];unreadCount:number;nextCursor:string|null}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[cursor,setCursor]=useState<string|null>(null);
 const address=state.session?.account.address??'',csrf=state.session?.csrfToken;
 const identity=useRef(csrf);identity.current=csrf;
 useEffect(()=>{setCursor(null);setPage(null);setError('');},[address]);
 useEffect(()=>{
 if(!address)return;
 const abort=new AbortController();setLoading(true);setError('');
 fetch(`/api/account/notifications?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,{credentials:'same-origin',signal:abort.signal}).then(async response=>{if(!response.ok)throw Error('Notifications unavailable. Please retry.');return response.json();}).then(data=>{if(!abort.signal.aborted)setPage(old=>({owner:address,items:cursor&&old?.owner===address?[...old.items,...data.items]:data.items,unreadCount:data.unreadCount,nextCursor:data.nextCursor}));}).catch(cause=>{if(!abort.signal.aborted)setError(cause.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
 return()=>abort.abort();
 },[address,cursor,refresh]);
 const current=page?.owner===address?page:null;
 function reload(){setCursor(null);setRefresh(n=>n+1);}
 function toggle(){if(!open)reload();setOpen(!open);}
 async function read(id:number){
 const started=csrf;
 try{const response=await fetch(`/api/account/notifications/${id}`,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':csrf??''},body:JSON.stringify({read:true})});if(identity.current!==started)return;if(!response.ok)throw Error('Could not mark this notification read. Please retry.');setCursor(null);setRefresh(n=>n+1);}catch(cause){if(identity.current===started)setError((cause as Error).message);}
 }
 return <div className="dv-notifications"><button className="dv-button secondary" aria-expanded={open} aria-controls="notification-inbox" onClick={toggle}>Notifications{current&&current.unreadCount>0&&<span aria-label={`${current.unreadCount} unread notifications`}> ({current.unreadCount})</span>}</button>{open&&<section className="dv-notification-popover dv-card" id="notification-inbox" aria-label="Notifications"><h2>Notifications</h2>{address&&<button disabled={loading} onClick={reload}>Refresh</button>}<InboxView signedIn={!!address} items={current?.items??[]} loading={loading} error={error||state.error} onSignIn={()=>void client.signIn()} onRead={id=>void read(id)} onRetry={reload} onMore={current?.nextCursor?()=>setCursor(current.nextCursor):undefined}/></section>}</div>;
}
