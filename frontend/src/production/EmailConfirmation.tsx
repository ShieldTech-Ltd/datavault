import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAccount } from './account';
function readToken(){return typeof window!=='undefined'?new URLSearchParams(window.location.hash.slice(1)).get('token')??'':'';}
function eraseFragment(){if(typeof history!=='undefined')history.replaceState(history.state,'',window.location.pathname+window.location.search);}
export default function EmailConfirmation({unsubscribe=false}:{unsubscribe?:boolean}){
 const {client,state}=useAccount();
 const [token,setToken]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 // The token is transient component memory only. Link GET never confirms.
 useEffect(()=>{setToken(readToken());},[]);
 async function confirm(){
  if(!token||busy)return;setBusy(true);setNotice('');
  try{
   if(unsubscribe){
    const response=await fetch('/api/email/unsubscribe',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    setNotice(response.ok?'Email notifications are disabled. Your account and in-app notifications are unchanged.':'This unsubscribe link is invalid or unavailable.');
   }else{const result=await client.verifyEmail(token);setNotice(result?'Your email is verified. Email notifications remain off until you explicitly opt in in settings.':'Confirmation failed. Sign in with the wallet that requested this email, then request a fresh verification link in settings.');}
  }catch{setNotice('The email service is unavailable. Please retry from settings.');}
  finally{eraseFragment();setToken('');setBusy(false);}
 }
 return <section className="dv-card dv-panel dv-account-settings"><h1>{unsubscribe?'Confirm unsubscribe':'Confirm your email'}</h1>
  <p>{unsubscribe?'Confirm that you want to stop transactional email notifications.':'Sign in with the connected wallet that requested this email, then confirm below. Opening this link does not verify your email.'}</p>
  {!unsubscribe&&!state.session&&<button className="dv-button" disabled={state.loading} onClick={()=>void client.signIn()}>Sign in to account</button>}
  {!unsubscribe&&state.session&&<p>Confirm for wallet <span className="dv-account-address">{state.session.account.address}</span></p>}
  {notice&&<p role="status">{notice}</p>}{state.error&&!unsubscribe&&<p role="alert">{state.error}</p>}
  {!token&&!notice&&<p>No confirmation token is available. Open the email link or request a fresh link in settings.</p>}
  <button className="dv-button" disabled={!token||busy||(!unsubscribe&&(!state.session||state.loading))} onClick={()=>void confirm()}>{unsubscribe?'Confirm unsubscribe':'Confirm email'}</button>
  <Link className="dv-button secondary" to="/settings">Return to settings</Link>
 </section>;
}
