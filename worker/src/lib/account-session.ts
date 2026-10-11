import { isAddress } from 'viem';
import type { AccountProfile } from '../../../shared/api';
import type { Env } from './types';
export const SESSION_COOKIE = 'dv_session';
export const CHALLENGE_COOKIE = 'dv_challenge';
export const NONCE_TTL = 5 * 60 * 1000;
export const SESSION_TTL = 24 * 60 * 60 * 1000;
const loopback = (url: URL) => ['localhost', '127.0.0.1'].includes(url.hostname);
export function deployment(env: Env) {
  const chainId = Number(env.CHAIN_ID);
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !isAddress(env.CONTRACT_ADDRESS)) throw new Error('Invalid account deployment');
  return { chainId, contract: env.CONTRACT_ADDRESS.toLowerCase() };
}
export function secureTransport(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  return url.protocol === 'https:' || (url.protocol === 'http:' && loopback(url) && env.CHAIN_ID === '31337');
}
export function trustedAccountOrigin(request: Request, env: Env): string | null {
  if (!secureTransport(request, env)) return null;
  const raw = request.headers.get('Origin');
  if (!raw) return null;
  try {
    const origin = new URL(raw), own = new URL(request.url);
    if (origin.origin !== raw) return null;
    if (origin.origin === own.origin) return raw;
    // Vite's development proxy changes the request URL to Wrangler's port.
    if (env.CHAIN_ID === '31337' && loopback(own) && loopback(origin) && ['http:', 'https:'].includes(origin.protocol)) return raw;
  } catch { /* Invalid origin. */ }
  return null;
}
export function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function digest(token: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function cookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('Cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function setCookie(request: Request, name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; ${new URL(request.url).protocol === 'https:' ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${seconds}`;
}
export interface AccountRow {
  account_id: string; address: string; chain_id: number; contract_address: string;
  display_name: string; locale: 'en-GB'; notify_in_app: number; notify_email: number; created_at: number; updated_at: number;
  email_consent?: number; verified_email?: string | null; verified_at?: number | null;
}
export function profile(row: AccountRow): AccountProfile {
  return { address: row.address, displayName: row.display_name, locale: row.locale,
    notificationPreferences: { inApp: row.notify_in_app === 1, email: row.email_consent === 1 },
    email: { verifiedEmail: row.verified_email ?? null, verifiedAt: row.verified_at ?? null },
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export interface AccountSession { account: AccountRow; csrfToken: string; expiresAt: number; tokenHash: string }
export async function readSession(request: Request, env: Env): Promise<AccountSession | null> {
  if (!secureTransport(request, env)) return null;
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await digest(token), { chainId, contract } = deployment(env);
  const row = await env.DB.prepare(`SELECT a.*, e.notify_email AS email_consent,e.verified_email,e.verified_at, s.csrf_token, s.expires_at FROM account_sessions s
    JOIN accounts a ON a.account_id = s.account_id LEFT JOIN account_email e ON e.account_id=a.account_id WHERE s.token_hash = ? AND s.expires_at > ?
    AND a.chain_id = ? AND a.contract_address = ?`).bind(tokenHash, Date.now(), chainId, contract)
    .first<AccountRow & { csrf_token: string; expires_at: number }>();
  return row ? { account: row, csrfToken: row.csrf_token, expiresAt: row.expires_at, tokenHash } : null;
}
export function validCsrf(request: Request, session: AccountSession): boolean {
  return request.headers.get('x-csrf-token') === session.csrfToken;
}
