import { createAdminClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const SESSION_COOKIE_NAME = 'edge_session'
const SESSION_DURATION_DAYS = 30
const LOGIN_LINK_DURATION_MIN = 30
export type AuthSubscriber = {
  id: string
  email: string
  teams: string[]
  preferences_token: string
  is_pro: boolean
  role: 'user' | 'admin'
}
// Create a one-time login token for a verified email
export async function createLoginLink(email: string): Promise<string | null> {
  const supa = createAdminClient()

  // Check the email exists AND is verified
  const { data: sub } = await supa
    .from('subscribers')
    .select('id, email_verified')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (!sub || !sub.email_verified) {
    return null
  }

  // Generate token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LOGIN_LINK_DURATION_MIN * 60 * 1000)

  const { error } = await supa.from('login_links').insert({
    email: email.toLowerCase().trim(),
    token,
    expires_at: expiresAt.toISOString(),
  })

  if (error) {
    console.error('Login link insert error:', error)
    return null
  }

  return token
}

// Consume a login link token, return subscriber if valid
export async function consumeLoginLink(token: string): Promise<AuthSubscriber | null> {
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

  // Fetch the subscriber
  const { data: sub } = await supa
    .from('subscribers')
    .select('id, email, teams, preferences_token, is_pro, role')
    .eq('email', link.email)
    .single()

  if (!sub) return null
return {
    id: sub.id,
    email: sub.email,
    teams: (sub.teams ?? []) as string[],
    preferences_token: sub.preferences_token ?? '',
    is_pro: sub.is_pro ?? false,
    role: (sub.role ?? 'user') as 'user' | 'admin',
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

// Get current session's subscriber, or null
export async function getCurrentSubscriber(): Promise<AuthSubscriber | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) return null

  const supa = createAdminClient()

  const { data: session } = await supa
    .from('sessions')
    .select('*, subscribers(id, email, teams, preferences_token, is_pro, role)')
    .eq('token', token)
    .single()

  if (!session) return null

  // Expired?
  if (new Date(session.expires_at) < new Date()) {
    return null
  }

  // Update last_used
  await supa
    .from('sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (session.subscribers as any)
  if (!sub) return null

return {
    id: sub.id,
    email: sub.email,
    teams: (sub.teams ?? []) as string[],
    preferences_token: sub.preferences_token ?? '',
    is_pro: sub.is_pro ?? false,
    role: (sub.role ?? 'user') as 'user' | 'admin',
  }
}

// Create a session for a subscriber, set cookie

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