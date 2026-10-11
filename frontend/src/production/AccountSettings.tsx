import { useEffect, useState, type FormEvent } from 'react';
import { useWallet } from '../lib/wallet';
import { useAccount } from './account';
export default function AccountSettings() {
  const { primaryWallet, correctNetwork } = useWallet();
  const { client, state } = useAccount();
  const [displayName, setDisplayName] = useState(''), [inApp, setInApp] = useState(true);
  const [notice, setNotice] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDisplayName(state.session?.account.displayName ?? ''); setInApp(state.session?.account.notificationPreferences.inApp ?? true); }, [state.session?.account]);
  useEffect(() => { setNotice(''); setConfirmDelete(false); }, [state.session?.account.address]);
  async function save(event: FormEvent) { event.preventDefault(); setNotice(''); if (await client.save({ displayName, locale: 'en-GB', notificationPreferences: { inApp, email: false } })) setNotice('Settings saved.'); }
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
        <p>Applies to new inbox deliveries. Events processed while disabled remain suppressed when you enable notifications later.</p><label className="dv-account-checkbox"><input type="checkbox" checked={false} disabled /> Email notifications unavailable</label><p>Email requires verified-email support before you can opt in.</p>
        <button className="dv-button" disabled={state.loading}>Save settings</button></form>
      <button className="dv-button secondary" disabled={state.loading} onClick={() => void client.signOut()}>Sign out</button>
      <h3>Your account data</h3><p>Export includes your profile, notification preferences, inbox metadata and pending deletion requests. Source content, paid answers and on-chain records are outside this account export.</p>
      <button className="dv-button secondary" disabled={state.loading} onClick={() => void download()}>Download account export</button>
      <p>Deletion requests remain pending until retention and processing are defined. Submitting a request does not delete data. On-chain records are immutable.</p>
      {!confirmDelete ? <button className="dv-button secondary" disabled={state.loading} onClick={() => setConfirmDelete(true)}>Request account deletion</button> : <div><p>Confirm submission of a pending deletion request? Your profile, source content and paid answers remain retained.</p><button className="dv-button secondary" disabled={state.loading} onClick={() => void requestDeletion()}>Confirm deletion request</button><button className="dv-button secondary" disabled={state.loading} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
    </>}
    <p>Team access and subscription plans are unavailable. This workspace uses the light dashboard theme.</p>
  </section>;
}
