// The one place the site's domain, name and signup route are defined.
// Everything else (sitemap, canonical tags, JSON-LD, emails, share cards) imports from here.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xlab9.com'
export const SITE_NAME = 'x9Lab'

/** Bare host, for share-card footers and other places that show the domain as text. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')

/** The domain mail is sent FROM. It must be verified in Resend. Defaults to the site's host; set EMAIL_FROM_DOMAIN (server env) to send from another verified domain
 *  while a new one is being verified. Links inside emails always use SITE_URL. */
export const MAIL_HOST = process.env.EMAIL_FROM_DOMAIN || SITE_HOST

/** Mailboxes on the mail domain. */
export const CONTACT_EMAIL = `hello@${MAIL_HOST}`
export const POSTGAME_EMAIL = `postgame@${MAIL_HOST}`
export const PREVIEW_EMAIL = `preview@${MAIL_HOST}`

/** Social handle (matches the domain label on X). */
export const X_HANDLE = '@edgereportdaily'
export const X_URL = 'https://x.com/edgereportdaily'

// /signup exists (src/app/signup/page.tsx), so signup prompts go there.
export const SIGNUP_URL = '/signup'

export function signupHref(source: string): string {
  return `${SIGNUP_URL}?source=${source}`
}
