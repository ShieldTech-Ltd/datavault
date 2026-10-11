import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router';
import {useAccount} from './account';
import type {BillingData,BillingLimits} from './account-client';

export function formatBillingAmount(amount:number,currency:string){
 const formatter=new Intl.NumberFormat('en-GB',{style:'currency',currency:currency.toUpperCase()});
 // Stripe preserves a two-decimal API representation for ISK and UGX charges.
 const digits=['isk','ugx'].includes(currency.toLowerCase())?2:formatter.resolvedOptions().maximumFractionDigits??2;
 return formatter.format(amount/10**digits);
}
const labels:Record<keyof BillingLimits,string>={activeKeys:'Active API keys',ownedWorkspaces:'Owned workspaces',workspaceMembers:'Members per workspace',importsPerDay:'Imports per rolling day',savedQuestions:'Active saved questions',uploadBytes:'Upload bytes'};
export function BillingView({data,busy,pending,onAction,onRefresh}:{data:BillingData;busy:boolean;pending?:boolean;onAction:(action:'checkout'|'portal')=>void;onRefresh:()=>void}){
 return <section className="dv-card dv-panel dv-account-settings"><h2>Personal account billing</h2>
  <p>Wallet query payments continue. Subscriptions are separate from query escrow and owner revenue.</p>
  <p>Current plan: <strong>{data.plan==='pro'?'Pro':'Free'}</strong></p>
  {!data.available&&<p>Subscriptions are unavailable. {data.error?'The billing provider is currently unavailable.':'The operator has not configured an available subscription.'}</p>}
  {pending&&<p role="status">Pending verification. Checkout return links do not activate Pro. Refresh to check verified server state.</p>}
  {data.subscription&&<p>Subscription status: {data.subscription.status}. {data.subscription.periodEnd>0&&<>Verified period ends {new Date(data.subscription.periodEnd).toLocaleString('en-GB')}. </>}{data.subscription.cancelAtPeriodEnd&&'Cancellation is scheduled at period end. '}{!data.subscription.fresh&&'Provider evidence is stale. Higher limits are unavailable until verification.'}</p>}
  <dl>{Object.entries(data.limits).map(([key,value])=><div key={key}><dt>{labels[key as keyof BillingLimits]}</dt><dd>{value.toLocaleString('en-GB')}</dd></div>)}</dl>
  <p>Each workspace inherits its creator's account limits. Other Owners cannot access the creator's invoices or billing portal. Independent workspace billing and billing transfer are unavailable.</p>
  {data.available&&data.price&&<><h3>Configured test subscription</h3><p>Test mode. {formatBillingAmount(data.price.amount,data.price.currency)} per {data.price.intervalCount===1?'':data.price.intervalCount+' '}{data.price.interval}{data.price.intervalCount===1?'':'s'}.</p>
  {data.offeredLimits&&<dl>{Object.entries(data.offeredLimits).map(([key,value])=><div key={key}><dt>{labels[key as keyof BillingLimits]}</dt><dd>{value.toLocaleString('en-GB')}</dd></div>)}</dl>}
  <button className="dv-button" disabled={busy||data.plan==='pro'} onClick={()=>onAction('checkout')}>Open test checkout</button>
  {data.portalAvailable&&<button className="dv-button secondary" disabled={busy} onClick={()=>onAction('portal')}>Open billing portal</button>}</>}
  <button className="dv-button secondary" disabled={busy} onClick={onRefresh}>Refresh billing</button>
  <h3>Invoices</h3>{data.invoices.length?<ul>{data.invoices.map(i=><li key={i.id}><a href={i.url} rel="noreferrer" target="_blank">{formatBillingAmount(i.amount,i.currency)} ({i.status})</a>, {new Date(i.createdAt).toLocaleDateString('en-GB')}</li>)}</ul>:<p>No invoices are available for this account.</p>}
 </section>;
}
export default function Billing(){
 const {client,state}=useAccount(),location=useLocation();
 const identity=state.session?state.session.account.address+':'+state.session.csrfToken:'';
 const [result,setResult]=useState<{owner:string;data:BillingData}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=useRef(identity);current.current=identity;
 const request=useRef(0);
 async function refresh(){const owner=identity,ticket=++request.current;setBusy(true);setError('');const data=await client.billing();if(current.current!==owner||ticket!==request.current)return;setBusy(false);if(data)setResult({owner,data});else setError('Billing could not be loaded. Retry or sign in again.');}
 useEffect(()=>{setResult(null);setBusy(false);setError('');++request.current;if(identity)void refresh();return()=>{++request.current;};},[identity]);
 async function action(kind:'checkout'|'portal'){const owner=identity;setBusy(true);setError('');const response=await client.billingAction(kind);if(current.current!==owner)return;setBusy(false);if(response)window.location.assign(response.url);else setError('Billing action unavailable. Retry or refresh the account.');}
 return <><header className="dv-page-heading"><div><h1>Billing</h1><p>Verified subscription status and personal invoices.</p></div></header>
 {!identity?<section className="dv-card dv-panel"><h2>Sign in to view billing</h2><p>Subscriptions are unavailable until the operator configures a provider. Wallet query payments continue.</p><Link className="dv-button secondary" to="/settings">Account settings</Link></section>:<>{error&&<p role="alert">{error}</p>}{result?.owner===identity?<BillingView data={result.data} busy={busy||state.loading} pending={new URLSearchParams(location.search).get('checkout')==='pending'} onAction={kind=>{void action(kind);}} onRefresh={()=>{void refresh();}}/>:<section className="dv-card dv-panel"><p role="status">{busy?'Loading billing...':'Billing unavailable.'}</p><button className="dv-button secondary" disabled={busy} onClick={()=>{void refresh();}}>Retry billing</button></section>}</>}
 </>;
}
