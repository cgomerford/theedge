// Throwaway-address block list, shared by /api/subscribe and /api/auth/login (signup).

// === DISPOSABLE EMAIL BLOCK LIST ===
// Domains we refuse to send to. Add more as patterns emerge.
// Source for additions: the bot incident May 19 + standard throwaway lists.
const BLOCKED_EMAIL_DOMAINS = new Set([
  // Pattern that hit us May 19
  'immenseignite.info',
  // Common throwaway / temp-mail providers
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  '10minutemail.com',
  '10minutemail.net',
  'dispostable.com',
  'maildrop.cc',
  'mintemail.com',
  'mohmal.com',
  'throwawaymail.com',
  'yopmail.com',
  'fakeinbox.com',
  'trashmail.com',
  'getairmail.com',
  'mailnesia.com',
  'mytemp.email',
  'tempinbox.com',
])

// Catch suspicious patterns even on plausible TLDs.
// .info is overrepresented in spam; combined with no MX-known domains, it's worth flagging.
export function isLikelyDisposable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return true

  // 1. Exact match on known throwaway domains
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true

  // 2. The specific spam pattern we saw: random-string@*.info
  //    Real .info domains are rare for personal email; bot domains are common here.
  //    Block ALL .info signups for now — we can whitelist later if a real user complains.
  if (domain.endsWith('.info')) return true

  return false
}
