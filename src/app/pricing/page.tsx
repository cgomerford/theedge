import SiteHeader from '@/components/SiteHeader'
import SignupAsk from '@/components/signup/SignupAsk'
import ProCheckoutButton from '@/components/pro/ProCheckoutButton'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { UNLOCK_WORDING } from '@/components/pro/ProGateView'
import { getViewerTier } from '@/lib/require-pro'
import { foundingThenMonthly } from '@/lib/pricing'
import { pageMeta } from '@/lib/seo'

// Who sees what:
//   signed out        -> what the deeper labs add, and an email signup (source "pricing"). No price, no plan name.
//   signed in, no Pro -> the same list, plus the price and the checkout button.
//   Pro               -> the list only. No prices, no upgrade prompts (billing is on /me, "Manage subscription").

export const metadata = pageMeta({
  title: 'The deeper labs',
  description:
    'The pitch-by-pitch labs, zone heatmaps and arsenal detail beyond the free pages, and how to get the free daily email. Sample sizes are shown.',
  path: '/pricing',
})

const ADDS = [
  'Pitching Lab: arsenal, location, hot-zone overlay, shape, sequencing, head-to-head and trends for any pitcher',
  'Batting Lab: results against every pitch type, zone heat maps, hot-zone overlay, sequencing and head-to-head for any hitter',
  'Zone heatmaps for every batter in a game preview',
  'Zones and arsenal detail on player pages',
  'Pitch quality by type on team pages',
]

export default async function PricingPage() {
  const tier = await getViewerTier()

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'The deeper labs', path: '/pricing' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>The deeper labs</h1>
        <p style={{ margin: '0 0 28px', fontSize: 16, color: '#5b5347', lineHeight: 1.5 }}>
          Everything else on x9Lab is free: game previews, scout reports, postgame reports, player and team pages, and the free daily email.
        </p>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {ADDS.map(a => (
            <li key={a} style={{ padding: '12px 0', borderTop: '1px solid #e7e2d8', fontSize: 16 }}>{a}</li>
          ))}
        </ul>

        {tier === 'anon' && <SignupAsk source="pricing" />}

        {tier === 'member' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '16px 0', margin: '24px 0' }}>
            <span style={{ fontSize: 16, color: '#5b5347', fontVariantNumeric: 'tabular-nums' }}>{foundingThenMonthly()}</span>
            <ProCheckoutButton>{UNLOCK_WORDING}</ProCheckoutButton>
          </div>
        )}
      </div>
    </main>
  )
}
