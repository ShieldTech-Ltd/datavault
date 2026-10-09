import type { AccountProfile, AccountSessionResponse } from '../../../shared/api';
type WalletClient = { getChainId(): Promise<number>; signMessage(input: { message: string }): Promise<string> };
export type AccountWallet = { address: string; getWalletClient(): Promise<WalletClient> };
export type AccountState = { session: AccountSessionResponse | null; loading: boolean; error: string };
export type SavedItem={id:number;collectionId:string;collectionName:string;createdAt:number;question?:string;expiresAt?:number};
export type SavedPage={items:SavedItem[];nextCursor:string|null};
export type EmailStatus = { providerConfigured: boolean; verifiedEmail: string | null; verifiedAt: number | null; pendingEmail: string | null; status: string; resendAfter: number };
export type ApiKey = {id:string;name:string;displayPrefix:string;scopes:string[];collectionIds:string[];collections?:{id:string;name:string}[];createdAt:number;expiresAt:number;revokedAt:number|null;status:'active'|'expired'|'revoked'};
export type ApiKeyInput = {name:string;collectionIds:string[];expiresInDays:number;scopes:['collections:read']};
export type KeyUsage = {asOf:number;retentionDays:number;daily:{keyId:string;timestamp:number;accepted:number;rejected:number;ownershipDenied:number;chainUnavailable:number}[];minute:{keyId:string;timestamp:number;claimed:number;accepted:number;rejected:number;ownershipDenied:number;chainUnavailable:number}[];limits:{daily:number;minute:number}};
function validSession(value: unknown): value is AccountSessionResponse {
  const v = value as AccountSessionResponse | null;
  return Boolean(v && /^0x[a-f0-9]{40}$/.test(v.account?.address) && typeof v.account.displayName === 'string' &&
    v.account.displayName.length <= 80 && v.account.locale === 'en-GB' && typeof v.account.notificationPreferences?.inApp === 'boolean' &&
    typeof v.account.notificationPreferences.email === 'boolean' && (!v.account.notificationPreferences.email || Boolean(v.account.email?.verifiedEmail && Number.isSafeInteger(v.account.email?.verifiedAt))) && Number.isSafeInteger(v.account.createdAt) && Number.isSafeInteger(v.account.updatedAt) &&
    /^[a-f0-9]{64}$/.test(v.csrfToken) && Number.isFinite(Date.parse(v.expiresAt)) && Date.parse(v.expiresAt) > Date.now());
}
// One controller survives navigation. Every async result is fenced by wallet generation.
export class AccountClient {
  state: AccountState = { session: null, loading: false, error: '' };
  private wallet: AccountWallet | null = null;
  private generation = 0;
  private listeners = new Set<(state: AccountState) => void>();
  private pending = false;
  private cleanup: Promise<void> = Promise.resolve();
  private revocationCsrf: string | undefined;
  private hydrateAbort: AbortController | null = null;
  constructor(private chainId: number, private contract: string | undefined, private network: typeof fetch = (...args) => globalThis.fetch(...args)) {}
  subscribe(listener: (state: AccountState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(value: Partial<AccountState>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener(this.state)); }
  private current(generation: number, address: string) { return this.generation === generation && this.wallet?.address.toLowerCase() === address; }
  private async response(path: string, init: RequestInit = {}) {
    return this.network(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  }
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.response(path, init);
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Account authorization expired or was rejected. Sign in again.'
      : response.status === 429 ? 'Too many requests. Please wait a minute and retry.' : 'Account service unavailable. Please retry.');
    try { return await response.json() as T; } catch { throw new Error('Invalid account service response.'); }
  }
  private revoke(csrfToken?: string): Promise<void> {
    this.revocationCsrf = csrfToken ?? this.revocationCsrf;
    const token = this.revocationCsrf;
    const operation = this.cleanup.then(async () => {
      const response = await this.response('/api/auth/logout', { method: 'POST', headers: token ? { 'x-csrf-token': token } : {} });
      if (!response.ok) throw new Error('Server sign-out failed. Retry sign-out before leaving a shared browser.');
      if (this.revocationCsrf === token) this.revocationCsrf = undefined;
    });
    this.cleanup = operation.catch(() => {});
    return operation;
  }
  async setWallet(wallet: AccountWallet | null, correctNetwork: boolean) {
    const next = correctNetwork && this.contract ? wallet : null;
    const previous = this.wallet?.address.toLowerCase(), address = next?.address.toLowerCase();
    if (previous === address) return;
    const previousSession = this.state.session;
    this.wallet = next; const generation = ++this.generation;
    this.hydrateAbort?.abort(); this.publish({ session: null, error: '', loading: false });
    if (previousSession) {
      try { await this.revoke(previousSession.csrfToken); } catch (cause) { if (generation === this.generation) this.publish({ error: (cause as Error).message }); }
    }
    if (!address || !this.current(generation, address)) return;
    await this.cleanup;
    if (!this.current(generation, address)) return;
    const controller = new AbortController(); this.hydrateAbort = controller;
    this.publish({ loading: true });
    try {
      const response = await this.response('/api/account', { signal: controller.signal });
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Could not restore your account. Retry sign-in.');
      const session: unknown = await response.json();
      if (!validSession(session)) throw new Error('Invalid account session response.');
      if (!this.current(generation, address) || session.account.address !== address) { await this.revoke(session.csrfToken); return; }
      this.publish({ session });
    } catch (cause) {
      if (this.current(generation, address) && !controller.signal.aborted) this.publish({ error: (cause as Error).message });
    } finally { if (this.current(generation, address)) this.publish({ loading: false }); }
  }
  async signIn() {
    if (!this.wallet || !this.contract || this.pending) return;
    const wallet = this.wallet, address = wallet.address.toLowerCase(), generation = this.generation;
    this.pending = true; this.publish({ loading: true, error: '' });
    try {
      await this.cleanup;
      if (!this.current(generation, address)) return;
      const client = await wallet.getWalletClient();
      if (await client.getChainId() !== this.chainId) throw new Error('Switch to the deployment network first.');
      if (!this.current(generation, address)) return;
      const challenge = await this.json<{ message: string; nonce: string; expiresAt: string }>('/api/auth/challenge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
      if (!this.current(generation, address)) return;
      if (typeof challenge.message !== 'string' || !/^[a-f0-9]{64}$/.test(challenge.nonce) || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= Date.now()) throw new Error('Invalid sign-in challenge.');
      const signature = await client.signMessage({ message: challenge.message });
      // Re-read the injected wallet after the prompt, before issuing an authenticated cookie.
      const latest = await wallet.getWalletClient();
      if (await latest.getChainId() !== this.chainId || !this.current(generation, address)) return;
      const result: unknown = await this.json('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: challenge.message, signature }) });
      if (!validSession(result)) throw new Error('Invalid account session response.');
      if (!this.current(generation, address) || result.account.address !== address) { await this.revoke(result.csrfToken); return; }
      let unchanged = false;
      try { const afterVerify = await wallet.getWalletClient(); unchanged = await afterVerify.getChainId() === this.chainId && this.current(generation, address); } catch { /* Wallet changed during verification. */ }
      if (!unchanged) { await this.revoke(result.csrfToken); return; }
      this.publish({ session: result });
    } catch (cause) { if (this.current(generation, address)) this.publish({ error: cause instanceof Error ? cause.message : 'Sign-in failed.' }); }
    finally { this.pending = false; this.publish({ loading: false }); }
  }
  async signOut() {
    const session = this.state.session;
    ++this.generation; this.hydrateAbort?.abort(); this.publish({ session: null, loading: true, error: '' });
    try { await this.revoke(session?.csrfToken); } catch (cause) { this.publish({ error: (cause as Error).message }); }
    finally { this.publish({ loading: false }); }
  }
  private async operation<T>(task: (session: AccountSessionResponse) => Promise<T>): Promise<T | null> {
    const session = this.state.session, address = this.wallet?.address.toLowerCase(), generation = this.generation;
    if (!session || !address || this.pending || Date.parse(session.expiresAt) <= Date.now()) { if (session && Date.parse(session.expiresAt) <= Date.now()) this.publish({ session: null, error: 'Account session expired. Sign in again.' }); return null; }
    this.pending = true; this.publish({ loading: true, error: '' });
    try { const result = await task(session); return this.current(generation, address) ? result : null; }
    catch (cause) { if (this.current(generation, address)) this.publish({ error: (cause as Error).message }); return null; }
    finally { this.pending = false; if (this.current(generation, address)) this.publish({ loading: false }); }
  }
  async save(settings: Pick<AccountProfile, 'displayName' | 'locale' | 'notificationPreferences'>) {
    const result = await this.operation(async session => this.json<{ account: AccountProfile }>('/api/account', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.csrfToken }, body: JSON.stringify(settings) }));
    if (result && this.state.session) {
      const next = { ...this.state.session, account: result.account };
      if (!validSession(next) || next.account.address !== this.state.session.account.address) { this.publish({ session: null, error: 'Invalid profile response for this wallet.' }); return false; }
      this.publish({ session: next }); return true;
    }
    return false;
  }
  async exportAccount(): Promise<Blob | null> {
    return this.operation(async () => {
      const response = await this.response('/api/account/export');
      if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Account export unavailable.');
      return response.blob();
    });
  }
  async apiKeys(){return this.operation(async()=>this.json<{keys:ApiKey[]}>('/api/account/api-keys'));}
  async apiKeyUsage(){return this.operation(async()=>this.json<KeyUsage>('/api/account/api-keys/usage'));}
  async revokeApiKey(id:string){return this.operation(async session=>this.json('/api/account/api-keys/'+encodeURIComponent(id),{method:'DELETE',headers:{'Content-Type':'application/json','x-csrf-token':session.csrfToken},body:'{}'}));}
  async createApiKey(input:ApiKeyInput){
    return this.operation(async session=>{
      const generation=this.generation,address=session.account.address;
      const response=await this.response('/api/account/api-keys',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(input)});
      if(!response.ok)throw new Error(response.status===409?'Maximum 5 active keys. Revoke a key or wait for expiry.':response.status===400?'Check the name, collection selection, scope and expiry.':response.status===503?'Chain verification is unavailable. Retry when the deployment is reachable.':response.status===401||response.status===403?'Account or current collection ownership authorization was rejected. Sign in and reload your owned collections.':'Key creation failed. Retry.');
      const result=await response.json() as {key:ApiKey;secret:string};
      if(!this.current(generation,address)){
        // A wallet switch may have already logged out. Still attempt revocation with
        // the original CSRF credential; never reveal the delayed secret.
        if(/^[a-f0-9]{64}$/.test(result.key?.id))try{await this.response('/api/account/api-keys/'+result.key.id,{method:'DELETE',headers:{'Content-Type':'application/json','x-csrf-token':session.csrfToken},body:'{}'});}catch{/* Revocation is best effort after the original session ends. */}
        return null;
      }
      if(!/^dv_[a-f0-9]{64}$/.test(result.secret)||!/^[a-f0-9]{64}$/.test(result.key?.id))throw new Error('Invalid API key response.');
      return result;
    });
  }
  async savedItems(kind:'bookmarks'|'saved-questions',cursor?:string):Promise<SavedPage|null> {
    return this.operation(async()=>this.json<SavedPage>(`/api/account/${kind}?limit=20${cursor?'&cursor='+encodeURIComponent(cursor):''}`));
  }
  async saveQuestion(collectionId:string,question:string,optIn:boolean) {
    if(!optIn)return null;
    return this.savedMutation('saved-questions','POST',{collectionId,question,optIn:true});
  }
  async bookmark(collectionId:string){return this.savedMutation('bookmarks','POST',{collectionId});}
  async deleteSaved(kind:'bookmarks'|'saved-questions',id:number){return this.savedMutation(`${kind}/${id}`,'DELETE',{});}
  private async savedMutation(path:string,method:string,input:unknown){
    return this.operation(async session=>this.json(`/api/account/${path}`,{method,headers:{'Content-Type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(input)}));
  }
  async emailStatus(): Promise<EmailStatus | null> {
    return this.operation(async () => this.json<EmailStatus>('/api/account/email'));
  }
  private async emailMutation(path: string, method: string, input: unknown) {
    const result=await this.operation(async session => {
      const outcome=await this.json<{status:string;resendAfter?:number}>(path,{method,headers:{'Content-Type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(input)});
      const next:unknown=await this.json('/api/account');
      if(!validSession(next)||next.account.address!==session.account.address)throw new Error('Invalid account response for this wallet.');
      return {outcome,session:next};
    });
    if(result)this.publish({session:result.session});
    return result?.outcome??null;
  }
  async challengeEmail(email:string){return this.emailMutation('/api/account/email/challenge','POST',{email});}
  async verifyEmail(token:string){return this.emailMutation('/api/account/email/verify','POST',{token});}
  async removeEmail(){return this.emailMutation('/api/account/email','DELETE',{});}
  async requestDeletion() {
    return this.operation(async session => {
      const result = await this.json<{ requestId: string; status: string }>('/api/account/deletion-request', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.csrfToken }, body: '{}' });
      if (result.status !== 'pending' || !/^[a-f0-9]{64}$/.test(result.requestId)) throw new Error('Invalid deletion-request response.');
      return result;
    });
  }
}
