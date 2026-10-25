// Sign-up attribution carried in hidden form fields (no cookies). Used by /signup, /api/auth/login and src/lib/auth.ts.

export const ATTRIBUTION_KEYS = ['source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]
export type Attribution = Partial<Record<AttributionKey, string>> & { return_to?: string }

const MAX_LEN = 200

// Trim, cap length and drop control characters. Empty -> undefined so nothing blank is stored.
function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_LEN)
  return v || undefined
}

// Only same-site paths ("/mlb/players/682928"). Rejects "//evil.com", "/\evil.com", and absolute URLs so the
// callback can never be turned into an open redirect.
export function safeReturnPath(value: unknown): string | undefined {
  const v = clean(value)
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return undefined
  if (v.startsWith('/login') || v.startsWith('/signup') || v.startsWith('/api/')) return undefined
  return v
}

// Works for URLSearchParams, FormData and a plain searchParams object.
export function readAttribution(get: (key: string) => unknown): Attribution {
  const out: Attribution = {}
  for (const key of ATTRIBUTION_KEYS) {
    const v = clean(get(key))
    if (v) out[key] = v
  }
  const returnTo = safeReturnPath(get('return_to'))
  if (returnTo) out.return_to = returnTo
  return out
}
