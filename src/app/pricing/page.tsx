import SiteHeader from '@/components/SiteHeader'
import ProCheckoutButton from '@/components/pro/ProCheckoutButton'
import CreateAccountButton from '@/components/pro/CreateAccountButton'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { UNLOCK_WORDING } from '@/components/pro/ProGateView'
import { getViewerTier } from '@/lib/require-pro'
import { FOUNDING, MONTHLY } from '@/lib/pricing'
import { pageMeta } from '@/lib/seo'

// Who sees what (one card, divider rows):
//   signed out        -> the free account and "Create free account". No price, no plan name.
//   signed in, no Pro -> Free ("Your plan"), then the yearly and monthly prices with checkout buttons.
//   Pro               -> the plan row only. No prices, no upgrade prompts (billing is on /me, "Manage subscription").

export const metadata = pageMeta({
  title: 'Plans',
  description:
    'What the free x9Lab account includes: the daily email, every game cockpit, scout reports and a dashboard for 10 players and 3 teams. No card needed.',
  path: '/pricing',
})

const FREE_LINE = 'Daily email, every game cockpit, scout reports, dashboard for 10 players and 3 teams.'

const QUESTIONS = [
  { q: 'Is the free account free?', a: 'Yes. No card needed.' },
  { q: 'What is in the free account?', a: 'Every cockpit, every scout report and the daily email.' },
  { q: 'Do you give picks?', a: 'No.' },
]

const ROW: React.CSSProperties = { display: 'grid', gridTemplateColumns: '160px minmax(0,1fr) auto', gap: '8px 24px', alignItems: 'center', padding: '16px 0', borderTop: '1px solid #e7e2d8' }
const NAME: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: '#1A1A1A' }
const DESC: React.CSSProperties = { fontSize: 13, color: '#5b5347', lineHeight: 1.45 }
const TAG: React.CSSProperties = { fontSize: 12, fontWeight: 800, background: '#FDE047', color: '#1A1A1A', padding: '2px 8px', borderRadius: 2, justifySelf: 'end' }

export default async function PricingPage() {
  const tier = await getViewerTier()

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <style>{`@media (max-width:640px){.pl-row{grid-template-columns:minmax(0,1fr) !important}.pl-row > *{justify-self:start !important}}`}</style>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Plans', path: '/pricing' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px 80px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722' }}>PRICING</div>
        <h1 style={{ margin: '4px 0 20px', fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em' }}>Plans</h1>

        <section style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: '4px 20px 12px' }}>
          {tier === 'anon' && (
            <>
              <div className="pl-row" style={{ ...ROW, borderTop: 0 }}>
                <span style={NAME}>Free account</span>
                <span style={DESC}>{FREE_LINE}</span>
                <CreateAccountButton source="pricing" label="Create free account" accent />
              </div>
              <p style={{ margin: '0 0 8px', padding: '12px 0', borderTop: '1px solid #e7e2d8', fontSize: 12, color: '#8a8275' }}>
                Paid options (attack zones, per-pitch detail, full Labs) are listed after you sign in.
              </p>
            </>
          )}

          {tier === 'member' && (
            <>
              <div className="pl-row" style={{ ...ROW, borderTop: 0 }}>
                <span style={NAME}>Free</span>
                <span style={DESC}>{FREE_LINE}</span>
                <span style={TAG}>Your plan</span>
              </div>
              <div className="pl-row" style={ROW}>
                <span style={NAME}>£{FOUNDING.price} / {FOUNDING.interval}</span>
                <span style={DESC}>Founding price, kept while you stay. Adds attack zones and per-pitch detail on every game, and full Labs.</span>
                <ProCheckoutButton interval="year">{UNLOCK_WORDING}</ProCheckoutButton>
              </div>
              <div className="pl-row" style={ROW}>
                <span style={NAME}>£{MONTHLY.price} / {MONTHLY.interval}</span>
                <span style={DESC}>Same as yearly. Cancel anytime.</span>
                <ProCheckoutButton interval="month" variant="outline">{UNLOCK_WORDING}</ProCheckoutButton>
              </div>
            </>
          )}

          {tier === 'pro' && (
            <div className="pl-row" style={{ ...ROW, borderTop: 0 }}>
              <span style={NAME}>Pro</span>
              <span style={DESC}>Attack zones and per-pitch detail on every game, and full Labs. Billing is under My x9Lab.</span>
              <span style={TAG}>Your plan</span>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', color: '#8a8275', padding: '16px 0 4px', borderTop: tier === 'anon' ? 0 : '1px solid #e7e2d8' }}>QUESTIONS</div>
          {QUESTIONS.map(item => (
            <div key={item.q} style={{ padding: '12px 0', borderTop: '1px solid #e7e2d8' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{item.q}</div>
              <div style={{ fontSize: 13, color: '#5b5347', marginTop: 2 }}>{item.a}</div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
