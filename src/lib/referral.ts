// Referral codes. A visitor arrives on a link like /pricing?ref=FRIEND; ReferralCapture saves the code in the edge_ref cookie,
// checkout reads it, and the Stripe webhook records it on the subscriber (first one wins).
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
