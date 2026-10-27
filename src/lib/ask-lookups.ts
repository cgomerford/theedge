// src/lib/ask-lookups.ts
//
// Daily lookup allowance for the ask lab (/mlb/ask, GET /api/stats/query). Server only (it imports node:crypto and the service-role client).
//
// PRIVACY NOTE
//  - Stored per lookup row: viewer kind, subscriber id (signed-in Free) or the random cookie id and a daily-salted IP hash (signed-out),
//    the London day, a hash of the question's identity fields, and two timestamps. No raw IP address, no user agent, no question text.
//  - The IP hash uses a salt that rotates every London day, so it cannot be reversed or linked across days.
//  - Rows older than 30 days are deleted by the ask_lookup_charge function itself.
//  - The x9_anon cookie is strictly functional (it only counts free lookups) and holds a random id, not personal data.
//
// Table ownership: public.ask_lookups is written only by the SQL functions in supabase/sql/29_ask_lookups.sql, called from here.
// Pro viewers never reach the database, never get a cookie and are never hashed.
// Any database problem lets the request run uncounted (lookupsLeft null); it is logged once per process and never thrown.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import type { QueryResult } from '@/lib/stats-query'
import type { QueryState } from '@/lib/stats-query-catalog'

export const ASK_LOOKUPS_PER_DAY = 5
export const ASK_REFINE_MINUTES = 15
export const ASK_IP_BACKSTOP_PER_DAY = 15   // [George: confirm 15]
export const ANON_COOKIE = 'x9_anon'

export type Viewer =
  | { kind: 'pro' }
  | { kind: 'subscriber'; subscriberId: string }
  | { kind: 'anon'; anonId: string; ipHash: string | null; setCookie: boolean }

const warned = new Set<string>()
function warnOnce(what: string, code?: string) {
  if (warned.has(what)) return
  warned.add(what)
  console.warn(`[ask-lookups] ${what}`, code ?? '')
}

const b64 = (b: Buffer) => b.toString('base64url')
const secret = () => process.env.ASK_COOKIE_SECRET && process.env.ASK_COOKIE_SECRET.length >= 16 ? process.env.ASK_COOKIE_SECRET : null
const hmac = (key: string | Buffer, msg: string) => createHmac('sha256', key).update(msg).digest()

export function signAnon(id: string, key: string): string { return `${id}.${b64(hmac(key, `anon:${id}`))}` }
/** Returns the cookie's id when the signature holds, else null. */
export function verifyAnon(value: string | undefined, key: string): string | null {
  if (!value) return null
  const i = value.lastIndexOf('.')
  if (i < 1) return null
  const id = value.slice(0, i)
  const given = Buffer.from(value.slice(i + 1), 'base64url')
  const want = hmac(key, `anon:${id}`)
  return given.length === want.length && timingSafeEqual(given, want) ? id : null
}

/** The London calendar day (only used to rotate the IP salt; the SQL counts with its own day). */
export function londonDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function ipHash(ip: string, day: string, key: string): string {
  return createHmac('sha256', hmac(key, `ip-salt:${day}`)).update(ip).digest('hex')
}

/** Canonical hash of what makes two requests the same question. Refine-only fields (seasons, minSample) are left out on purpose. */
export function questionKey(q: Pick<QueryState, 'group' | 'gameType' | 'view' | 'metric' | 'family' | 'split' | 'deep'>): string {
  const canon = JSON.stringify([q.group, q.gameType, q.view, q.metric, q.family, q.split, q.deep ? [[...q.deep.stack].sort(), q.deep.who ?? null] : null])
  return createHash('sha256').update(canon).digest('hex')
}

export function hasRows(r: QueryResult): boolean {
  if (r.loading) return false
  return !!r.league || (r.breakdown?.length ?? 0) > 0 || (r.recent?.length ?? 0) > 0 || (r.teams?.length ?? 0) > 0 || (r.players?.length ?? 0) > 0 || !!r.bySeason?.some(s => s.totals)
}

export async function resolveViewer(req: Request): Promise<Viewer> {
  if (await isProViewer()) return { kind: 'pro' }
  const sub = await getCurrentSubscriber()
  if (sub) return { kind: 'subscriber', subscriberId: sub.id }
  const key = secret()
  if (!key) { warnOnce('no secret'); return { kind: 'anon', anonId: '', ipHash: null, setCookie: false } }   // anonId '' = uncounted
  const existing = verifyAnon((await cookies()).get(ANON_COOKIE)?.value, key)
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? '').trim()
  return { kind: 'anon', anonId: existing ?? b64(randomBytes(16)), ipHash: ip ? ipHash(ip, londonDay(), key) : null, setCookie: !existing }
}

/** The Set-Cookie value for a new anonymous id (null when the visitor already had a valid one). */
export function anonCookie(v: Viewer): { name: string; value: string; options: Record<string, unknown> } | null {
  const key = secret()
  if (v.kind !== 'anon' || !v.setCookie || !key || !v.anonId) return null
  return { name: ANON_COOKIE, value: signAnon(v.anonId, key), options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 } }
}

const counted = (v: Viewer) => v.kind === 'subscriber' || (v.kind === 'anon' && !!v.anonId)
const args = (v: Viewer, question: string) => ({
  p_kind: v.kind === 'subscriber' ? 'subscriber' : 'anon',
  p_subscriber: v.kind === 'subscriber' ? v.subscriberId : null,
  p_anon: v.kind === 'anon' ? v.anonId : null,
  p_ip_hash: v.kind === 'anon' ? v.ipHash : null,
  p_question: question, p_cap: ASK_LOOKUPS_PER_DAY, p_ip_cap: ASK_IP_BACKSTOP_PER_DAY, p_refine_minutes: ASK_REFINE_MINUTES,
})

export type Check = { allowed: boolean; refine: boolean; left: number | null }
export async function checkLookup(v: Viewer, question: string): Promise<Check> {
  if (!counted(v)) return { allowed: true, refine: false, left: null }
  try {
    const { data, error } = await createAdminClient().rpc('ask_lookup_check', args(v, question))
    if (error) { warnOnce('unavailable', error.code); return { allowed: true, refine: false, left: null } }
    const row = (data as { allowed: boolean; refine: boolean; lookups_left: number }[] | null)?.[0]
    return row ? { allowed: !!row.allowed, refine: !!row.refine, left: Number(row.lookups_left) } : { allowed: true, refine: false, left: null }
  } catch (e) { warnOnce('unavailable', (e as Error).name); return { allowed: true, refine: false, left: null } }
}

export type Charge = { ok: boolean; left: number | null }
/** Run only after the result has rows. ok = false means a parallel request took the last lookup. */
export async function chargeLookup(v: Viewer, question: string): Promise<Charge> {
  if (!counted(v)) return { ok: true, left: null }
  try {
    const { data, error } = await createAdminClient().rpc('ask_lookup_charge', args(v, question))
    if (error) { warnOnce('unavailable', error.code); return { ok: true, left: null } }
    const row = (data as { charged: boolean; refine: boolean; lookups_left: number }[] | null)?.[0]
    return row ? { ok: row.charged || row.refine, left: Number(row.lookups_left) } : { ok: true, left: null }
  } catch (e) { warnOnce('unavailable', (e as Error).name); return { ok: true, left: null } }
}

export async function getLookupsLeft(v: Viewer): Promise<number | null> {
  if (!counted(v)) return null
  try {
    const a = args(v, '')
    const { data, error } = await createAdminClient().rpc('ask_lookups_left', { p_kind: a.p_kind, p_subscriber: a.p_subscriber, p_anon: a.p_anon, p_ip_hash: a.p_ip_hash, p_cap: a.p_cap, p_ip_cap: a.p_ip_cap })
    if (error) { warnOnce('unavailable', error.code); return null }
    return typeof data === 'number' ? data : null
  } catch (e) { warnOnce('unavailable', (e as Error).name); return null }
}
