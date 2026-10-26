// The free deep look is tracked in a signed cookie, not in the database: no migration to run.
//   cookie x9_look = "<day>|<feature>|<key>.<signature>"   (day = calendar day in Europe/London)
// It records WHICH module a free account opened first today. Opening that module again is free; any other module
// (another player, another lab, another game) is gated until tomorrow. Clearing the cookie resets it, which is the
// accepted trade-off of a cookie (the data APIs still check the account is signed in).
// Pure functions (Web Crypto), so the proxy and the server can both use them.

export const LOOK_COOKIE = 'x9_look'
export const LOOK_MAX_AGE = 60 * 60 * 36

export const dayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export type Look = { day: string; feature: string; key: string }

const secret = () => process.env.DEEP_LOOK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-only-deep-look-secret'

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function signLook(feature: string, key: string): Promise<string> {
  const payload = `${dayLondon()}|${feature}|${key}`
  return `${payload}.${await hmac(payload)}`
}

/** The look in a cookie value, or null if it is missing, forged, or from another day. */
export async function verifyLook(value: string | undefined | null): Promise<Look | null> {
  if (!value) return null
  const i = value.lastIndexOf('.')
  if (i < 0) return null
  const payload = value.slice(0, i)
  if ((await hmac(payload)) !== value.slice(i + 1)) return null
  const [day, feature, ...rest] = payload.split('|')
  const key = rest.join('|')
  if (!day || !feature || !key || day !== dayLondon()) return null
  return { day, feature, key }
}
