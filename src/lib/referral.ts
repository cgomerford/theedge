// Referral codes. A visitor arrives on a link like /pricing?ref=FRIEND; ReferralCapture saves the code in the edge_ref cookie,
// checkout reads it, and the Stripe webhook records it on the subscriber (first one wins).
// A cookie only exists in the browser that saved it, and the emailed sign-in link is often opened in a different browser or app. So the code also
// rides in the links we build (signup -> emailed link -> /pricing/start -> checkout body); the cookie is the fallback, not the only carrier.
// One sanitiser lives here so the cookie, checkout and the webhook can never disagree about what a valid code looks like.

export const REF_COOKIE = 'edge_ref'
export const REF_COOKIE_DAYS = 30
export const REF_MAX_LEN = 40

/** Letters, digits, underscore and hyphen only, at most 40 characters. Anything else -> null (no referral). */
export function cleanRef(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, REF_MAX_LEN)
  return v || null
}

/** Reads one cookie out of a raw Cookie header (used by the checkout route, which gets the request, not the browser). */
export function refFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === REF_COOKIE) return cleanRef(decodeURIComponent(rest.join('=')))
  }
  return null
}

/** The form a code takes in a link we build: cleaned, then upper case (Stripe compares promotion codes without regard to case). Anything unusable -> null. */
export function linkRef(value: unknown): string | null {
  return cleanRef(value)?.toUpperCase() ?? null
}

type Interval = 'year' | 'month'

/** Where the emailed sign-in link lands for Pro. It is stored server-side as the link's return_to, so the code travels with the link, not with the browser. */
export function proStartPath(interval: Interval, ref?: unknown): string {
  const r = linkRef(ref)
  return `/pricing/start?interval=${interval}${r ? `&ref=${r}` : ''}`
}

/** Where /pricing/start sends someone who is not signed in yet: back to signup with the Pro choice (and the code) kept. */
export function proSignupPath(interval: Interval, ref?: unknown): string {
  const r = linkRef(ref)
  return `/signup?plan=pro&interval=${interval}${r ? `&ref=${r}` : ''}`
}

/** The Set-Cookie value for the code: 30 days, whole site, SameSite=Lax. */
export function refCookieString(code: string, secure = false): string {
  return `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** Browser only. Saves the code unless one is already saved: the first referral a person arrives with is the one that counts. */
export function saveRefCookie(code: string): void {
  try {
    if (typeof document === 'undefined') return
    if (refFromCookieHeader(document.cookie)) return
    document.cookie = refCookieString(code, window.location.protocol === 'https:')
  } catch { /* cookies blocked: the code still travels in the links */ }
}
