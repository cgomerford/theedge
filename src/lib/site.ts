// The one place the site's domain, name and signup route are defined.
// Everything else (sitemap, canonical tags, JSON-LD, emails, share cards) imports from here.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://edgereportdaily.com'
export const SITE_NAME = 'x9Lab'

/** Bare host, for share-card footers and other places that show the domain as text. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')

/** Mailboxes on the site's domain. */
export const CONTACT_EMAIL = `hello@${SITE_HOST}`
export const POSTGAME_EMAIL = `postgame@${SITE_HOST}`
export const PREVIEW_EMAIL = `preview@${SITE_HOST}`

/** Social handle (matches the domain label on X). */
export const X_HANDLE = '@edgereportdaily'
export const X_URL = 'https://x.com/edgereportdaily'

// /signup exists (src/app/signup/page.tsx), so signup prompts go there.
export const SIGNUP_URL = '/signup'

export function signupHref(source: string): string {
  return `${SIGNUP_URL}?source=${source}`
}
