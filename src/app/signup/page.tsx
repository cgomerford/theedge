import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import PlanChoice from '@/components/signup/PlanChoice'
import { SIGNUP_BENEFITS, SIGNUP_HEADLINE, SIGNUP_KICKER, SIGNUP_SENT, SIGNUP_SUBHEAD } from '@/components/signup/copy'
import { getCurrentSubscriber } from '@/lib/auth'
import { ATTRIBUTION_KEYS, readAttribution, safeReturnPath } from '@/lib/attribution'
import { noindex } from '@/lib/seo'
import { getOffer } from '@/lib/pro-offer-server'
import { FOUNDING, FOUNDING_MONTHLY, STANDARD, STANDARD_MONTHLY, formatPrice } from '@/lib/pricing'
import { REF_COOKIE, linkRef, proStartPath } from '@/lib/referral'

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata = { title: 'Sign up', ...noindex() }

// Same-site path of the page that linked here, from the Referer header (used only when ?return_to= is absent).
async function refererPath(): Promise<string | undefined> {
  const h = await headers()
  const ref = h.get('referer')
  const host = h.get('host')
  if (!ref || !host) return undefined
  try {
    const u = new URL(ref)
    if (u.host !== host) return undefined
    return safeReturnPath(u.pathname + u.search)
  } catch {
    return undefined
  }
}

const ERRORS: Record<string, string> = {
  'rate-limit': 'Too many attempts. Try again in a minute.',
  invalid: 'Please enter a valid email.',
  'verify-failed': 'Browser check failed. Reload the page and try again.',
}

export default async function SignupPage({ searchParams }: Props) {
  const sp = await searchParams
  const first = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k])

  // Attribution rides in hidden fields only: no cookies, nothing stored in the browser.
  const attribution = readAttribution(first)
  const returnTo = attribution.return_to ?? (await refererPath())

  // /signup?plan=pro&interval=month pre-selects Pro (links from emails, X posts, the pricing page).
  const wantsPro = first('plan') === 'pro'
  const interval = first('interval') === 'month' ? 'month' : 'year'
  // The referral code: the link's own ?ref= first, else the code this browser saved earlier. It goes into the emailed link (below), because that link is often opened in a different browser.
  const ref = linkRef(first('ref')) ?? linkRef((await cookies()).get(REF_COOKIE)?.value)
  const viewer = await getCurrentSubscriber()
  if (viewer) redirect(wantsPro && !viewer.is_pro ? proStartPath(interval, ref) : returnTo ?? '/me')
  const offers = await getOffer()   // what checkout would charge a new subscriber right now; null plan = not available, so Pro is not offered
  const offer = {
    year: offers.annual.plan ? formatPrice(offers.annual.plan === 'founding' ? FOUNDING : STANDARD) : null,
    month: offers.monthly.plan ? formatPrice(offers.monthly.plan === 'founding' ? FOUNDING_MONTHLY : STANDARD_MONTHLY) : null,
  }

  const source = attribution.source ?? 'signup_page'
  const extra = Object.fromEntries(ATTRIBUTION_KEYS.filter(k => k !== 'source').map(k => [k, attribution[k]]))
  const error = first('error')
  const sent = first('sent') === '1'

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <style>{`
        .su-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:64px;align-items:start}
        @media (max-width:860px){.su-grid{grid-template-columns:minmax(0,1fr);gap:32px}}
      `}</style>
      <SiteHeader variant="page" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 16px 80px' }}>
        <div className="su-grid">
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722' }}>{SIGNUP_KICKER}</div>
            <h1 style={{ margin: '12px 0 8px', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {SIGNUP_HEADLINE}
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 17, color: '#5b5347' }}>{SIGNUP_SUBHEAD}</p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {SIGNUP_BENEFITS.map(b => (
                <li key={b} style={{ padding: '12px 0', borderTop: '1px solid #e7e2d8', fontSize: 17 }}>{b}</li>
              ))}
            </ul>
          </div>

          <div>
            {sent ? (
              <div role="status">
                <div style={{ fontSize: 22, fontWeight: 800 }}>{SIGNUP_SENT}</div>
              </div>
            ) : (
              <>
                <PlanChoice source={source} returnTo={returnTo} extra={extra} initialPlan={wantsPro ? 'pro' : 'free'} initialInterval={interval} offer={offer} refCode={ref} />
                {error && ERRORS[error] && <p role="alert" style={{ margin: '12px 0 0', fontSize: 14, color: '#b42318' }}>{ERRORS[error]}</p>}
              </>
            )}
            <p style={{ margin: '24px 0 0', fontSize: 14, color: '#8a8275' }}>
              Already have an account? <a href="/login" style={{ color: '#1A1A1A', fontWeight: 800 }}>Sign in</a>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
