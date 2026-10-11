import { useEffect, useState, type FormEvent } from 'react';
import { useWallet } from '../lib/wallet';
import { useAccount } from './account';
import type { EmailStatus } from './account-client';
import GithubConnection from './GithubConnection';
import NotionConnection from './NotionConnection';
import TeamSettings from './TeamSettings';
export default function AccountSettings() {
  const { primaryWallet, correctNetwork } = useWallet();
  const { client, state } = useAccount();
  const [displayName, setDisplayName] = useState(''), [inApp, setInApp] = useState(true);
  const [notice, setNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [email,setEmail]=useState(''),[emailEnabled,setEmailEnabled]=useState(false),[emailStatus,setEmailStatus]=useState<EmailStatus|null>(null),[cooldown,setCooldown]=useState(0);
  useEffect(() => { setDisplayName(state.session?.account.displayName ?? ''); setInApp(state.session?.account.notificationPreferences.inApp ?? true); }, [state.session?.account]);
  useEffect(() => { setNotice(''); setConfirmDelete(false);setEmail('');setEmailStatus(null);setCooldown(0); }, [state.session?.account.address]);
  useEffect(()=>{setEmailEnabled(state.session?.account.notificationPreferences.email??false);if(state.session)void client.emailStatus().then(result=>{if(result){setEmailStatus(result);setCooldown(result.resendAfter);}});},[client,state.session?.account]);
  useEffect(()=>{if(!cooldown)return;const timer=setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>clearInterval(timer);},[cooldown>0]);
  async function save(event: FormEvent) { event.preventDefault(); setNotice(''); if (await client.save({ displayName, locale: 'en-GB', notificationPreferences: { inApp, email: emailEnabled } })) setNotice('Settings saved.'); }
  async function sendVerification(event:FormEvent){event.preventDefault();setNotice('');const result=await client.challengeEmail(email);if(result){setCooldown(result.resendAfter??60);setNotice('Verification message accepted by the email provider. Check your inbox, then confirm with this wallet. Acceptance does not confirm delivery.');}else{const result=await client.emailStatus();if(result){setEmailStatus(result);setCooldown(result.resendAfter);}}}
  async function removeEmail(){if(await client.removeEmail()){setEmail('');setEmailEnabled(false);setNotice('Email removed and email notifications disabled.');}}
  async function download() {
    setNotice(''); const blob = await client.exportAccount(); if (!blob) return;
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'datavault-account.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function requestDeletion() { setNotice(''); const result = await client.requestDeletion(); if (result) { setNotice(`Deletion request ${result.requestId} is pending. No data has been deleted.`); setConfirmDelete(false); } }
  return <section className="dv-card dv-panel dv-account-settings"><h2>Account profile</h2>
    <p>Sign in with your connected wallet to save profile settings. This session does not authorize payments or paid queries.</p>
    {state.error && <p role="alert">{state.error}</p>}{state.error.includes('Server sign-out failed') && <button className="dv-button secondary" disabled={state.loading} onClick={() => void client.signOut()}>Retry sign-out</button>}{notice && <p role="status">{notice}</p>}
    {!state.session ? <><button className="dv-button" disabled={!primaryWallet || !correctNetwork || state.loading} onClick={() => void client.signIn()}>{state.loading ? 'Loading account...' : 'Sign in to account'}</button><p>{!primaryWallet ? 'Connect an owner wallet above first.' : !correctNetwork ? 'Switch to the deployment network first.' : 'Your wallet will ask you to sign a standard sign-in message.'}</p></> : <>
      <p>Signed in as <span className="dv-account-address">{state.session.account.address}</span></p><p>Session expires {new Date(state.session.expiresAt).toLocaleString()}.</p>
      <form onSubmit={save}><label>Display name<input value={displayName} maxLength={80} onChange={event => setDisplayName(event.target.value)} disabled={state.loading} /></label>
        <label>Locale<select value="en-GB" disabled><option value="en-GB">English (United Kingdom)</option></select></label>
        <label className="dv-account-checkbox"><input type="checkbox" checked={inApp} disabled={state.loading} onChange={event => setInApp(event.target.checked)} /> Enable in-app notifications</label>
        <p>Applies to new inbox deliveries. Events processed while disabled remain suppressed when you enable notifications later.</p>
        <label className="dv-account-checkbox"><input type="checkbox" checked={emailEnabled} disabled={state.loading||(!emailEnabled&&(!emailStatus?.providerConfigured||!state.session.account.email?.verifiedEmail))} onChange={event=>setEmailEnabled(event.target.checked)} /> Enable transactional email notifications</label>
        <p>Explicitly opt in to future collection registrations and settled payouts. No marketing messages or historical backlog. In-app notifications are independent.</p>
        <button className="dv-button" disabled={state.loading}>Save settings</button></form>
      <h3>Verified email</h3>
      {emailStatus===null?<p>Email status unavailable. <button className="dv-button secondary" disabled={state.loading} onClick={()=>void client.emailStatus().then(result=>{if(result){setEmailStatus(result);setCooldown(result.resendAfter);}})}>Retry email status</button></p>:<>
        {!emailStatus.providerConfigured&&<p role="status">Email provider unavailable. Verification and email opt-in require a configured sender and trusted links.</p>}
        <p>{emailStatus.verifiedEmail?<>Verified: <span className="dv-account-address">{emailStatus.verifiedEmail}</span></>:'No verified email address.'}</p>
        {emailStatus.pendingEmail&&<p>Pending: <span className="dv-account-address">{emailStatus.pendingEmail}</span>. {emailStatus.status==='send_failed'?'The provider did not accept the verification message.':emailStatus.status==='expired'?'The verification link expired. Request a fresh message.':'Check your inbox and confirm with this wallet.'}</p>}
        <form onSubmit={event=>void sendVerification(event)}><label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={state.loading||!emailStatus.providerConfigured} required /></label>
          <p>Requesting a replacement revokes the previous email and disables email notifications. Verification does not opt you in.</p>
          <button className="dv-button secondary" disabled={state.loading||!emailStatus.providerConfigured||!email.trim()||cooldown>0}>{cooldown>0?`Resend available in ${cooldown}s`:emailStatus.pendingEmail?'Resend verification':'Send verification'}</button>
        </form>
        {(emailStatus.verifiedEmail||emailStatus.pendingEmail)&&<button className="dv-button secondary" disabled={state.loading} onClick={()=>void removeEmail()}>Remove email</button>}
      </>}
      <button className="dv-button secondary" disabled={state.loading} onClick={() => void client.signOut()}>Sign out</button>
      <h3>Your account data</h3><p>Export includes your profile, notification preferences, inbox metadata, bookmarks, active saved questions, pending deletion requests, workspace memberships, invitations and private import job metadata. Source content, paid answers and on-chain records are outside this account export.</p>
      <button className="dv-button secondary" disabled={state.loading} onClick={() => void download()}>Download account export</button>
      <p>Deletion requests remain pending until retention and processing are defined. Submitting a request does not delete data. On-chain records are immutable.</p>
      {!confirmDelete ? <button className="dv-button secondary" disabled={state.loading} onClick={() => setConfirmDelete(true)}>Request account deletion</button> : <div><p>Confirm submission of a pending deletion request? Your profile, source content and paid answers remain retained.</p><button className="dv-button secondary" disabled={state.loading} onClick={() => void requestDeletion()}>Confirm deletion request</button><button className="dv-button secondary" disabled={state.loading} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
    </>}
    <GithubConnection/>
    <NotionConnection/>
    <TeamSettings/>
    <p>Subscription plans are unavailable. This workspace uses the light dashboard theme.</p>
  </section>;
}
