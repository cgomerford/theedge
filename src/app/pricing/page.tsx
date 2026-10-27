import SiteHeader from '@/components/SiteHeader'
import ProCheckoutButton from '@/components/pro/ProCheckoutButton'
import CreateAccountButton from '@/components/pro/CreateAccountButton'
import ManageSubscriptionButton from '@/components/pro/ManageSubscriptionButton'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { getViewerTier } from '@/lib/require-pro'
import { FOUNDING, MONTHLY, formatPrice, FREE_FOLLOW_LIMITS, SHOW_PRICE_SIGNED_OUT_ON_PRICING } from '@/lib/pricing'
import { pageMeta } from '@/lib/seo'

// Who sees what:
//   signed out        -> everything below. The price block only while SHOW_PRICE_SIGNED_OUT_ON_PRICING is true (this page only);
//                        otherwise "Create account to see Pro pricing". Checkout always needs an account.
//   signed in, free   -> the same, with the two Stripe checkout buttons.
//   Pro               -> "You're on Pro" and "Manage subscription". No prices, no upgrade prompts.

export const metadata = pageMeta({
  title: 'Pricing',
  description: `Front-office-style breakdowns for fans. Built on public game data. Free account, or Founding Pro at ${formatPrice(FOUNDING).replace('/yr', ' a year')}.`,
  path: '/pricing',
})

const FOLLOWS = `${FREE_FOLLOW_LIMITS.players} players, ${FREE_FOLLOW_LIMITS.teams} teams`

const COMPARE: { feature: string; free: string; pro: string }[] = [
  { feature: 'Scout report: summary and recap', free: 'Yes', pro: 'Yes' },
  { feature: 'Follow players and teams, your own page', free: FOLLOWS, pro: FOLLOWS },
  { feature: 'Ask the stats: a question in plain words, such as "2 out home runs in the 5th inning" or "Juan Soto vs Yankees"', free: '10 a day (5 without an account)', pro: 'Unlimited' },
  { feature: 'Stats search by dropdown, and the leaderboards for any season, level and game type', free: 'Unlimited, no account needed', pro: 'Unlimited' },
  { feature: 'Stats graphs: bars, lines and scatter, overlaid years, image download', free: 'Yes, with an account', pro: 'Yes' },
  { feature: 'Batting Lab: Contact, Approach, Swing, Decisions, Outcomes, Platoon', free: 'Yes', pro: 'Yes' },
  { feature: 'Live games, pitch by pitch', free: 'Yes', pro: 'Plus club and player filters, longer year ranges' },
  { feature: 'Deep modules: hot zones, vs arsenal, pitch shapes', free: 'One a day', pro: 'All, every player' },
  { feature: 'Batting Lab: Location, Sequencing, Trends, career head-to-head', free: 'One a day', pro: 'Yes' },
  { feature: 'Pitching Lab: Arsenal, Shape, Stuff, Location, Sequencing, Overlay, Trends, H2H', free: 'One a day', pro: 'Yes' },
  { feature: 'Pitch Shape Lab: every pitch type', free: 'Free types, one locked type a day', pro: 'Every pitch type' },
]

const OPENS: { name: string; shows: string; why: string }[] = [
  { name: 'Hot zones vs this pitcher', shows: 'Where a hitter does damage, square by square, laid over where the starter actually throws.', why: 'You see the at-bat before it happens.' },
  { name: 'Vs arsenal', shows: 'How a hitter does against each pitch type: fastball, slider, changeup.', why: 'Which pitch beats him, and which one he punishes.' },
  { name: 'Arsenal and Shape', shows: 'Every pitch a starter throws, how much it moves and how hard, against league average.', why: 'Why a 93 mph fastball can play like 97.' },
  { name: 'Sequencing', shows: 'What he throws in each count, and what follows what.', why: "Watch a 1-2 count and know what's coming." },
  { name: 'Location and Overlay', shows: 'Where his pitches finish, by batter hand and count.', why: 'The plan, drawn on the zone.' },
  { name: 'Trends', shows: 'Velocity and usage, start by start.', why: "Spot the arm that's fading, or the new pitch he's leaning on." },
  { name: 'Career head-to-head', shows: 'Every plate appearance between a hitter and a pitcher, with the sample size on it.', why: 'The history, with honest sample sizes.' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'Can I cancel anytime?', a: 'Yes, from your account page. You keep Pro until the end of the period you paid for.' },
  { q: 'What does Founding mean?', a: `The first 100 subscribers pay ${formatPrice(FOUNDING).replace('/yr', ' a year')} or ${formatPrice(MONTHLY).replace('/mo', ' a month')}, and keep that price as long as they stay subscribed.` },
  { q: 'What happens in the off-season?', a: 'The labs, player pages and your own page run on the full 2026 season, so you can look back at any player or pitcher. Game-day pages return in spring.' },
  { q: 'Where does the data come from?', a: 'Built on public game data. Independent, not affiliated with MLB.' },
  { q: 'Is this for betting?', a: "No. It's information about how players and pitchers perform. Nothing more." },
  { q: 'Can I get a refund?', a: '[George: refund policy]' },
  { q: 'Do I need an account to buy?', a: 'Yes. Create a free account first, then upgrade from inside it, so Pro is attached to you.' },
  { q: "What's free forever?", a: 'The scout report summary and recap, following players and teams, the free Batting Lab tabs, live games, the stats leaderboards and dropdown search, ten Ask the stats questions a day, the stats graphs and one full deep look a day.' },
  { q: 'How do the Ask the stats lookups work?', a: 'Each new question you type uses one lookup: 10 a day with an account, 5 without one, unlimited on Pro. Changing seasons or filters on the same question within 15 minutes is free, and so is the dropdown search. The count resets at midnight UK time.' },
]

const H2: React.CSSProperties = { margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }
const MUTED = '#8a8275'

export default async function PricingPage() {
  const tier = await getViewerTier()
  const showPrice = tier !== 'anon' || SHOW_PRICE_SIGNED_OUT_ON_PRICING

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px 80px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(32px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Baseball, read like a front office.</h1>
        <p style={{ margin: '0 0 28px', fontSize: 17, color: '#5b5347' }}>Front-office-style breakdowns for fans. Built on public game data.</p>

        {/* b) free account first */}
        <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 20px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '16px 0', marginBottom: 36 }}>
          {tier === 'anon' ? (
            <>
              <span style={{ fontSize: 20, fontWeight: 800, flex: '1 1 240px' }}>Start free. No card.</span>
              <CreateAccountButton source="pricing_free" label="Create account" accent />
            </>
          ) : (
            <span style={{ fontSize: 18, fontWeight: 800 }}>{tier === 'pro' ? "You're on Pro" : "You're on the free account"}</span>
          )}
        </section>

        {/* c) comparison */}
        <section aria-labelledby="compare-h" style={{ marginBottom: 40 }}>
          <h2 id="compare-h" style={H2}>Free account and Pro</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead>
                <tr>
                  {['Feature', 'Free account', 'Pro'].map((h, i) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', fontSize: 13, fontWeight: 800, color: MUTED, padding: '8px 10px', borderBottom: '1px solid #e7e2d8', position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined, background: i === 0 ? '#FAF8F3' : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(r => (
                  <tr key={r.feature}>
                    <th scope="row" style={{ textAlign: 'left', fontSize: 14, fontWeight: 700, padding: '12px 10px', borderBottom: '1px solid #e7e2d8', verticalAlign: 'top', minWidth: 220, position: 'sticky', left: 0, background: '#FAF8F3' }}>{r.feature}</th>
                    <td style={{ fontSize: 14, padding: '12px 10px', borderBottom: '1px solid #e7e2d8', verticalAlign: 'top' }}>{r.free}</td>
                    <td style={{ fontSize: 14, padding: '12px 10px', borderBottom: '1px solid #e7e2d8', verticalAlign: 'top' }}>{r.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* d) what Pro opens */}
        <section aria-labelledby="opens-h" style={{ marginBottom: 40 }}>
          <h2 id="opens-h" style={H2}>What Pro opens</h2>
          {OPENS.map(o => (
            <div key={o.name} style={{ padding: '14px 0', borderTop: '1px solid #e7e2d8' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{o.name}</div>
              <div style={{ fontSize: 14, color: '#3a352c', marginTop: 2 }}>{o.shows}</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{o.why}</div>
            </div>
          ))}
        </section>

        {/* e) price block */}
        <section aria-labelledby="price-h" style={{ borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '20px 0', marginBottom: 40 }}>
          <h2 id="price-h" style={H2}>Founding Pro</h2>
          {tier === 'pro' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{"You're on Pro"}</span>
              <div><ManageSubscriptionButton style={{ padding: '11px 18px', background: '#1A1A1A', color: '#FAF8F3', border: 0, borderRadius: 2, fontSize: 15 }} /></div>
            </div>
          ) : showPrice ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 800 }}>Founding Pro: {formatPrice(FOUNDING).replace('/yr', ' a year')}.</div>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#5b5347' }}>For the first 100 subscribers. Your price stays while you stay subscribed.</p>
              <p style={{ margin: '4px 0 14px', fontSize: 15, color: '#5b5347' }}>Or {formatPrice(MONTHLY).replace('/mo', ' a month')}.</p>
              {tier === 'member' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <ProCheckoutButton interval="year">{`Founding Pro, ${formatPrice(FOUNDING)}`}</ProCheckoutButton>
                  <ProCheckoutButton interval="month" variant="outline">{`Monthly, ${formatPrice(MONTHLY)}`}</ProCheckoutButton>
                </div>
              ) : (
                <CreateAccountButton source="pricing" label="Create an account to upgrade" accent />
              )}
            </>
          ) : (
            <CreateAccountButton source="pricing" label="Create account to see Pro pricing" accent />
          )}
        </section>

        {/* f) FAQ */}
        <section aria-labelledby="faq-h">
          <h2 id="faq-h" style={H2}>Questions</h2>
          {FAQ.map(f => (
            <div key={f.q} style={{ padding: '12px 0', borderTop: '1px solid #e7e2d8' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{f.q}</div>
              <div style={{ fontSize: 14, color: '#5b5347', marginTop: 2 }}>{f.a}</div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
