import { consumeNotifications, reconcileNotifications, inboxSelect } from '../lib/notifications';
import { handleSavedItems, savedItems } from '../lib/saved-items';
import { challengeEmail, emailStatus, removeEmail, setEmailConsent, verifyEmail } from '../lib/account-email';
import { getAddress, isAddress, verifyMessage, type Hex } from 'viem';
import { createSiweMessage, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { Env } from '../lib/types';
import { CHALLENGE_COOKIE, SESSION_COOKIE, NONCE_TTL, SESSION_TTL, cookie, deployment, digest,
  profile, randomToken, readSession, secureTransport, setCookie, trustedAccountOrigin, validCsrf } from '../lib/account-session';
function json(value: unknown, status = 200, headers: Record<string,string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
const denied = () => json({ error: 'Account authorization rejected. Contract-wallet verification is not supported.' }, 401);
function object(value: unknown): value is Record<string,unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function only(value: Record<string,unknown>, fields: string[]) { return Object.keys(value).every(key => fields.includes(key)); }
async function body(request: Request): Promise<Record<string,unknown> | null> {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) return null;
  try { const value = await request.json(); return object(value) ? value : null; } catch { return null; }
}
export async function handleAccountRoute(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname, method = request.method;
  if (!secureTransport(request, env)) return json({ error: 'HTTPS is required for account sessions.' }, 403);
  const origin = method === 'GET' ? null : trustedAccountOrigin(request, env);
  if (method !== 'GET' && !origin) return json({ error: 'A trusted same-origin request is required.' }, 403);
  const { chainId, contract } = deployment(env);
  if (path === '/api/auth/challenge' && method === 'POST') {
    const input = await body(request);
    if (!input || !only(input, ['address']) || typeof input.address !== 'string' || !isAddress(input.address)) return json({ error: 'A valid wallet address is required.' }, 400);
    const now = Date.now(), nonce = randomToken(), browser = randomToken(), expires = now + NONCE_TTL;
    const message = createSiweMessage({ domain: new URL(origin!).host, address: getAddress(input.address), chainId,
      uri: origin!, version: '1', nonce, issuedAt: new Date(now), expirationTime: new Date(expires),
      statement: 'Sign in to DataVault account settings. This does not authorize payments or paid queries.',
      resources: [`urn:datavault:${chainId}:${contract}`] });
    // Opportunistic expiry cleanup bounds transient credentials without storing raw cookie tokens.
    await env.DB.prepare('DELETE FROM account_nonces WHERE expires_at <= ?').bind(now).run();
    await env.DB.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(now).run();
    await env.DB.prepare(`INSERT INTO account_nonces (nonce,address,chain_id,contract_address,origin,message,browser_hash,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(nonce, input.address.toLowerCase(), chainId, contract, origin, message, await digest(browser), expires).run();
    return json({ message, nonce, expiresAt: new Date(expires).toISOString() }, 200,
      { 'Set-Cookie': setCookie(request, CHALLENGE_COOKIE, browser, NONCE_TTL / 1000) });
  }
  if (path === '/api/auth/verify' && method === 'POST') {
    const input = await body(request);
    if (!input || !only(input, ['message','signature']) || typeof input.message !== 'string' || typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) return json({ error: 'A SIWE message and EOA signature are required.' }, 400);
    const browser = cookie(request, CHALLENGE_COOKIE);
    if (!browser) return denied();
    try {
      const parsed = parseSiweMessage(input.message), now = Date.now();
      if (!parsed.nonce || !parsed.address || !isAddress(parsed.address) || !validateSiweMessage({ message: parsed,
        domain: new URL(origin!).host, time: new Date(now) }) || parsed.chainId !== chainId || parsed.uri !== origin ||
        parsed.resources?.length !== 1 || parsed.resources[0] !== `urn:datavault:${chainId}:${contract}`) return denied();
      const row = await env.DB.prepare('SELECT * FROM account_nonces WHERE nonce = ?').bind(parsed.nonce)
        .first<{ address: string; message: string; origin: string; chain_id: number; contract_address: string; browser_hash: string; expires_at: number; consumed_at: number | null }>();
      if (!row || row.message !== input.message || row.origin !== origin || row.chain_id !== chainId || row.contract_address !== contract || row.expires_at <= now || row.consumed_at !== null || row.browser_hash !== await digest(browser)) return denied();
      if (!await verifyMessage({ address: getAddress(row.address), message: input.message, signature: input.signature as Hex })) return denied();
      const claim = await env.DB.prepare(`UPDATE account_nonces SET consumed_at = ? WHERE nonce = ? AND consumed_at IS NULL
        AND expires_at > ? AND message = ? AND browser_hash = ?`).bind(now, parsed.nonce, now, input.message, row.browser_hash).run();
      if (claim.meta.changes !== 1) return denied();
      const id = `${chainId}:${contract}:${row.address}`, token = randomToken(), csrf = randomToken(), expires = now + SESSION_TTL;
      await env.DB.prepare(`INSERT INTO accounts (account_id,address,chain_id,contract_address,created_at,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(account_id) DO NOTHING`).bind(id, row.address, chainId, contract, now, now).run();
      await env.DB.prepare('INSERT INTO account_sessions (token_hash,account_id,csrf_token,expires_at,created_at) VALUES (?,?,?,?,?)')
        .bind(await digest(token), id, csrf, expires, now).run();
      const sessionRequest = new Request(request.url, { headers: new Headers(request.headers) });
      sessionRequest.headers.set('Cookie', `${SESSION_COOKIE}=${token}`);
      const session = await readSession(sessionRequest, env);
      return json({ account: profile(session!.account), csrfToken: csrf, expiresAt: new Date(expires).toISOString() }, 200,
        { 'Set-Cookie': setCookie(request, SESSION_COOKIE, token, SESSION_TTL / 1000) });
    } catch { return denied(); }
  }
  const session = await readSession(request, env);
  if (path === '/api/auth/logout' && method === 'POST') {
    if (session && !validCsrf(request, session)) return json({ error: 'CSRF token required.' }, 403);
    if (session) await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(session.tokenHash).run();
    return new Response(null, { status: 204, headers: { 'Set-Cookie': setCookie(request, SESSION_COOKIE, '', 0) } });
  }
  if (!session) return denied();
  if (method !== 'GET' && !validCsrf(request, session)) return json({ error: 'CSRF token required.' }, 403);
  const savedResponse=await handleSavedItems(request,env,session.account);
  if(savedResponse)return savedResponse;
  if (path === '/api/account/email' && method === 'GET') return json(await emailStatus(env,session.account));
  if (path === '/api/account/email/challenge' && method === 'POST') {
    const input=await body(request); if(!input)return json({error:'Invalid email request.'},400);
    const result=await challengeEmail(request,env,session.account,input);
    return json(result.value,result.status,result.status===429?{'Retry-After':'60'}:{});
  }
  if (path === '/api/account/email/verify' && method === 'POST') {
    const input=await body(request); if(!input||!await verifyEmail(env,session.account,input))return json({error:'Email confirmation is invalid, expired or belongs to another wallet.'},400);
    return json({status:'verified'});
  }
  if (path === '/api/account/email' && method === 'DELETE') {
    await removeEmail(env,session.account.account_id);return json({status:'removed'});
  }
  if (path === '/api/account/notifications' && method === 'GET') {
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get('limit') ?? '20', rawCursor = params.get('cursor');
    if (!/^[1-9][0-9]*$/.test(rawLimit) || Number(rawLimit)>50 || (rawCursor !== null && (!/^[1-9][0-9]*$/.test(rawCursor) || !Number.isSafeInteger(Number(rawCursor))))) return json({error:'Invalid pagination'},400);
    await reconcileNotifications(env);
    await consumeNotifications(env,session.account);
    const limit=Number(rawLimit), cursor=rawCursor===null?Number.MAX_SAFE_INTEGER:Number(rawCursor);
    const rows=await env.DB.prepare(`${inboxSelect} WHERE i.account_id=? AND e.event_id<? ORDER BY e.event_id DESC LIMIT ?`).bind(session.account.account_id,cursor,limit+1).all<any>();
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM notification_inbox WHERE account_id=? AND read_at IS NULL').bind(session.account.account_id).first<{n:number}>();
    const items=rows.results.slice(0,limit);
    return json({items,unreadCount:count!.n,nextCursor:rows.results.length>limit?String(items.at(-1).id):null});
  }
  if (/^\/api\/account\/notifications\/[^/]+$/.test(path) && method === 'PATCH') {
    const id=path.split('/').at(-1)!,input=await body(request);
    if(!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)) || !input || !only(input,['read']) || input.read!==true) return json({error:'Invalid notification update'},400);
    const exists=await env.DB.prepare('SELECT event_id FROM notification_inbox WHERE account_id=? AND event_id=?').bind(session.account.account_id,Number(id)).first();
    if(!exists)return json({error:'Notification not found'},404);
    await env.DB.prepare('UPDATE notification_inbox SET read_at=COALESCE(read_at,?) WHERE account_id=? AND event_id=?').bind(Date.now(),session.account.account_id,Number(id)).run();
    return json({read:true});
  }
  if (path === '/api/account' && method === 'GET') return json({ account: profile(session.account), csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString() });
  if (path === '/api/account' && method === 'PATCH') {
    const input = await body(request);
    if (!input || !Object.keys(input).length || !only(input, ['displayName','locale','notificationPreferences']) ||
      ('displayName' in input && (typeof input.displayName !== 'string' || input.displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(input.displayName))) ||
      ('locale' in input && input.locale !== 'en-GB') || ('notificationPreferences' in input &&
        (!object(input.notificationPreferences) || !Object.keys(input.notificationPreferences).length || !only(input.notificationPreferences, ['inApp','email']) ||
          ('inApp' in input.notificationPreferences && typeof input.notificationPreferences.inApp !== 'boolean') ||
          ('email' in input.notificationPreferences && typeof input.notificationPreferences.email !== 'boolean')))) return json({ error: 'Invalid profile settings.' }, 400);
    const preferences = input.notificationPreferences as { inApp?: boolean; email?: boolean } | undefined;
    if(preferences?.email!==undefined&&!await setEmailConsent(env,session.account.account_id,preferences.email))return json({error:'Verify your email and configure the email provider before enabling notifications.'},400);
    await env.DB.prepare(`UPDATE accounts SET display_name = COALESCE(?,display_name), locale = COALESCE(?,locale),
      notify_in_app = COALESCE(?,notify_in_app), updated_at = ? WHERE account_id = ?`)
      .bind(input.displayName === undefined ? null : (input.displayName as string).trim(), input.locale ?? null,
        preferences?.inApp === undefined ? null : Number(preferences.inApp), Date.now(), session.account.account_id).run();
    return json({ account: profile((await readSession(request, env))!.account) });
  }
  if (path === '/api/account/export' && method === 'GET') {
    const requests = await env.DB.prepare('SELECT request_id AS requestId, status, created_at AS createdAt FROM account_deletion_requests WHERE account_id = ? ORDER BY created_at')
      .bind(session.account.account_id).all();
    const inbox = await env.DB.prepare(`${inboxSelect} WHERE i.account_id=? ORDER BY e.event_id DESC`).bind(session.account.account_id).all();
    const bookmarks=await savedItems(env,session.account,'bookmarks',null);
    const savedQuestions=await savedItems(env,session.account,'saved-questions',50);
    return json({ scope: 'Account profile, notification preferences, inbox metadata, bookmarks, active explicitly saved questions and pending deletion requests. Saved questions expire after 30 days. Paid answers, source content and immutable on-chain records are outside this export.',
      deployment: { chainId, contractAddress: contract }, account: profile(session.account), deletionRequests: requests.results, notifications: inbox.results, bookmarks, savedQuestions }, 200,
      { 'Content-Disposition': 'attachment; filename="datavault-account.json"' });
  }
  if (path === '/api/account/deletion-request' && method === 'POST') {
    const input = await body(request);
    if (!input || Object.keys(input).length) return json({ error: 'No extra request fields are accepted.' }, 400);
    await env.DB.prepare(`INSERT INTO account_deletion_requests (request_id,account_id,created_at) VALUES (?,?,?) ON CONFLICT(account_id,status) DO NOTHING`)
      .bind(randomToken(), session.account.account_id, Date.now()).run();
    const row = await env.DB.prepare("SELECT request_id AS requestId, status FROM account_deletion_requests WHERE account_id = ? AND status = 'pending'")
      .bind(session.account.account_id).first();
    return json(row);
  }
  return json({ error: 'Not found' }, 404);
}
