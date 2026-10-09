import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAccount } from './account';
import type { SavedItem, SavedPage } from './account-client';
import { download } from './AnalyticsControls';
export const savedQuestionMayFill=(step:string)=>['idle','quoted','done'].includes(step);
export function BookmarkButton({collectionId}:{collectionId:string}){
 const {client,state}=useAccount();const [saved,setSaved]=useState(false);
 useEffect(()=>setSaved(false),[state.session?.account.address,collectionId]);
 if(!state.session)return <Link className="dv-button secondary" to="/settings">Sign in to bookmark</Link>;
 return <button className="dv-button secondary" disabled={state.loading||saved} onClick={async()=>{if(await client.bookmark(collectionId))setSaved(true);}}>{saved?'Bookmarked':'Bookmark collection'}</button>;
}
export function SavedItems({kind,onUse}:{kind:'bookmarks'|'saved-questions';onUse?:(item:SavedItem)=>void}){
 const {client,state}=useAccount();const [page,setPage]=useState<SavedPage|null>(null);const address=state.session?.account.address;
 const [loadedFor,setLoadedFor]=useState<string>(),[message,setMessage]=useState('');
 useEffect(()=>{setPage(null);setMessage('');setLoadedFor(undefined);},[address]);
 async function load(cursor?:string){const result=await client.savedItems(kind,cursor);if(result){setLoadedFor(address);setPage(previous=>({items:cursor?[...(previous?.items??[]),...result.items]:result.items,nextCursor:result.nextCursor}));}}
 return <section className="dv-card dv-panel"><h2>{kind==='bookmarks'?'Private bookmarks':'Saved questions'}</h2><p>{kind==='bookmarks'?'Keep collection references in your private account.':'Questions are saved only with explicit opt-in for each save, expire after 30 days and are limited to 50 active items. Use only fills the paid query form.'}</p>{!address?<Link className="dv-button secondary" to="/settings">Sign in to account</Link>:<><div className="dv-analytics-controls"><button className="dv-button secondary" disabled={state.loading} onClick={()=>void load()}>Load {kind==='bookmarks'?'bookmarks':'saved questions'}</button><button className="dv-button secondary" disabled={state.loading} onClick={async()=>{const blob=await client.exportAccount();if(blob)download(blob,'datavault-account.json');}}>Export account saved items</button></div>{loadedFor===address&&page&&<>{!page.items.length&&<p>No saved items.</p>}<ul className="dv-saved-items">{page.items.map(item=><li key={item.id}><Link to={`/collections/${item.collectionId}`}>{item.collectionName}</Link>{item.question&&<p>{item.question}</p>}{item.expiresAt&&<small>Expires {new Date(item.expiresAt).toLocaleDateString()}</small>}<div className="dv-analytics-controls">{kind==='bookmarks'?<Link className="dv-button secondary" to={`/query?collection=${item.collectionId}`}>Open query form</Link>:<button className="dv-button secondary" onClick={()=>onUse?.(item)}>Use in query form</button>}<button className="dv-button secondary" disabled={state.loading} onClick={async()=>{if(await client.deleteSaved(kind,item.id)){setPage(previous=>previous?{...previous,items:previous.items.filter(value=>value.id!==item.id)}:null);setMessage('Deleted.');}}}>Delete</button></div></li>)}</ul>{page.nextCursor&&<button className="dv-button secondary" disabled={state.loading} onClick={()=>void load(page.nextCursor!)}>Load more</button>}</>}</>}{state.error&&<p role="alert">{state.error}</p>}{message&&<p role="status">{message}</p>}</section>;
}
export function SaveQuestion({collectionId,question}:{collectionId:string;question:string}){
 const {client,state}=useAccount();const [optIn,setOptIn]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{setOptIn(false);setSaved(false);},[collectionId,question,state.session?.account.address]);
 if(!state.session)return null;
 return <section className="dv-saved-question"><label><input type="checkbox" checked={optIn} onChange={e=>setOptIn(e.target.checked)}/> Save this question privately for 30 days (explicit opt-in for this save)</label><button type="button" className="dv-button secondary" disabled={!optIn||saved||state.loading||!collectionId||!question.trim()||question.length>1000} onClick={async()=>{if(await client.saveQuestion(collectionId,question,optIn)){setOptIn(false);setSaved(true);}}}>{saved?'Question saved':'Save question'}</button>{state.error&&<p role="alert">{state.error}</p>}</section>;
}
