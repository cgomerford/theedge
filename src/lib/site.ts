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

/** The address shown to readers on the site (contact, about, FAQ, privacy, terms) and linked with mailto. Replies from people go to George directly.
 *  Do NOT use it as a send-from address: Resend only sends from the verified domain, which is what CONTACT_EMAIL above is for. */
export const PUBLIC_CONTACT_EMAIL = 'george.x9lab@gmail.com'
export const POSTGAME_EMAIL = `postgame@${MAIL_HOST}`
export const PREVIEW_EMAIL = `preview@${MAIL_HOST}`

/** Social handle (matches the domain label on X). */
export const X_HANDLE = '@x9LabHQ'
export const X_URL = 'https://x.com/x9LabHQ'

/** The publisher logo for structured data (an absolute URL). Google's article guidance: no taller than 60px and no wider than 600px, so this is the 600x60 bar. */
export const SITE_LOGO_URL = `${SITE_URL}/brand/publisher/x9lab-logo-600x60.png`
export const SITE_LOGO_SIZE = { width: 600, height: 60 }

// /signup exists (src/app/signup/page.tsx), so signup prompts go there.
export const SIGNUP_URL = '/signup'

export function signupHref(source: string): string {
  return `${SIGNUP_URL}?source=${source}`
}

/** Google Analytics 4 measurement ID (public by design; it is printed in every page's source). Set here, not in an env var, so a stale Vercel setting cannot point the site at an old property. */
export const GA_MEASUREMENT_ID = 'G-NSV4B60Q37'
