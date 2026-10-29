import { getDevView } from '@/lib/dev-view'
import { createAdminClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import type { Attribution } from '@/lib/attribution'

const SESSION_COOKIE_NAME = 'edge_session'
const SESSION_DURATION_DAYS = 30
const LOGIN_LINK_DURATION_MIN = 30

export type AuthSubscriber = {
  id: string
  email: string
  teams: string[]
  primary_team: string | null
  preferences_token: string
  is_pro: boolean
  role: 'user' | 'admin'
}

// Create a one-time login token for a verified email
// `createIfMissing` is true only for /signup: a new address gets a subscriber row (source saved on it) and
// may use the link even though it is not verified yet. Clicking the link is what verifies it (see consumeLoginLink).
// /login passes false, so it only ever signs in people who already have a verified account.
export async function createLoginLink(
  email: string,
  attribution: Attribution = {},
  opts: { createIfMissing?: boolean } = {},
): Promise<string | null> {
  const supa = createAdminClient()
  const address = email.toLowerCase().trim()

  const { data: sub } = await supa
    .from('subscribers')
    .select('id, email_verified, source')
    .eq('email', address)
    .maybeSingle()

  if (!sub && opts.createIfMissing) {
    const { error: insertError } = await supa.from('subscribers').insert({
      email: address,
      source: attribution.source ?? 'signup',
      fan_type: 'casual',
      email_verified: false,
      preferences_token: crypto.randomUUID().replace(/-/g, ''),
    })
    if (insertError) {
      console.error('[createLoginLink] subscriber insert error:', insertError.message)
      return null
    }
  } else if (!sub || (!sub.email_verified && !opts.createIfMissing)) {
    return null
  }

  // Generate token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LOGIN_LINK_DURATION_MIN * 60 * 1000)

  const base = {
    email: email.toLowerCase().trim(),
    token,
    expires_at: expiresAt.toISOString(),
  }

  let { error } = await supa.from('login_links').insert({ ...base, ...attribution })

  // If the attribution migration isn't applied yet, don't lock everyone out of signing in: log it and retry plain.
  if (error && Object.keys(attribution).length > 0) {
    console.error('[createLoginLink] attribution insert failed, retrying without it:', error.message)
    ;({ error } = await supa.from('login_links').insert(base))
  }

  if (error) {
    console.error('[createLoginLink] Supabase error:', error.message)
    return null
  }

  return token
}

// Consume a login link token, return subscriber if valid
export async function consumeLoginLink(
  token: string,
): Promise<(AuthSubscriber & { return_to: string | null }) | null> {
  const supa = createAdminClient()

  const { data: link } = await supa
    .from('login_links')
    .select('*')
    .eq('token', token)
    .single()

  if (!link) return null

  // Already used?
  if (link.used_at) return null

  // Expired?
  if (new Date(link.expires_at) < new Date()) return null

  // Mark used
  await supa
    .from('login_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', link.id)

  // Using the link proves the person controls this inbox, so the address is verified from here on.
  const { error: verifyError } = await supa.from('subscribers').update({ email_verified: true }).eq('email', link.email)
  if (verifyError) console.error('[consumeLoginLink] verify update error:', verifyError.message)

  // Fetch the subscriber
  const { data: sub } = await supa
    .from('subscribers')
    .select('id, email, teams, primary_team, preferences_token, is_pro, role')
    .eq('email', link.email)
    .single()

  if (!sub) return null

  return {
    id: sub.id,
    email: sub.email,
    teams: (sub.teams ?? []) as string[],
    primary_team: sub.primary_team ?? null,
    preferences_token: sub.preferences_token ?? '',
    is_pro: sub.is_pro ?? false,
    role: (sub.role ?? 'user') as 'user' | 'admin',
    return_to: (link.return_to as string | null) ?? null,
  }
}

// Create a session for a subscriber, set cookie
export async function createSession(subscriberId: string): Promise<string> {
  const supa = createAdminClient()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)

  await supa.from('sessions').insert({
    subscriber_id: subscriberId,
    token,
    expires_at: expiresAt.toISOString(),
  })

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: '/',
  })

  return token
}

// Get current session's subscriber, or null.
// Under `next dev` only, the DevViewSwitcher cookie can force the signed out / signed in / Pro view (lib/dev-view.ts).
export async function getCurrentSubscriber(): Promise<AuthSubscriber | null> {
  const real = await readSession()
  const view = await getDevView()
  if (!view) return real
  if (view === 'out') return null
  const base: AuthSubscriber = real ?? { id: '00000000-0000-0000-0000-000000000000', email: 'dev@localhost', teams: [], primary_team: null, preferences_token: '', is_pro: false, role: 'user' }
  // Local Pro view only: a demo follow of the Phillies when the account follows no team, so the My x9Lab team panel has something to show (same idea as DEV_PRO_DEMO_FOLLOWS).
  const teams = view === 'pro' && base.teams.length === 0 ? ['phillies'] : base.teams
  return { ...base, teams, is_pro: view === 'pro' }
}

async function readSession(): Promise<AuthSubscriber | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) return null

  const supa = createAdminClient()

  const { data: session } = await supa
    .from('sessions')
    .select('*, subscribers(id, email, teams, primary_team, preferences_token, is_pro, role)')
    .eq('token', token)
    .single()

  if (!session) return null

  // Expired?
  if (new Date(session.expires_at) < new Date()) {
    return null
  }

  // Update last_used — fire-and-forget, don't block the response on housekeeping
  supa
    .from('sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id)
    .then(() => {}, () => {})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (session.subscribers as any)
  if (!sub) return null

  return {
    id: sub.id,
    email: sub.email,
    teams: (sub.teams ?? []) as string[],
    primary_team: sub.primary_team ?? null,
    preferences_token: sub.preferences_token ?? '',
    is_pro: sub.is_pro ?? false,
    role: (sub.role ?? 'user') as 'user' | 'admin',
  }
}

// Destroy current session
export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (token) {
    const supa = createAdminClient()
    await supa.from('sessions').delete().eq('token', token)
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}