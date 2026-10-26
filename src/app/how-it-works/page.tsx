import SiteHeader from '@/components/SiteHeader'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { MIN_SAMPLE } from '@/lib/min-sample'

export const metadata = pageMeta({
  title: 'How it works',
  description:
    'How an x9Lab game preview is built: starting pitchers, lineups, bullpen workload and pitch data laid out in plain numbers before first pitch.',
  path: '/how-it-works',
})

const STEPS = [
  { name: 'Public game data in', body: 'Schedules, lineups, box scores and pitch-by-pitch data from public sources, refreshed through the day.' },
  { name: 'Plain numbers out', body: 'Each starter, lineup and bullpen is laid out with its stats and the number of pitches or plate appearances behind them.' },
  { name: 'Your own page', body: 'A free account lets you follow players and teams, read the full scout reports, and open one full deep look a day.' },
]

export default function HowItWorksPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>How it works</h1>
        <p style={{ margin: '0 0 28px', fontSize: 17, color: '#5b5347' }}>[George: how it works intro wording]</p>
        {STEPS.map(s => (
          <div key={s.name} style={{ padding: '14px 0', borderTop: '1px solid #e7e2d8' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{s.name}</div>
            <div style={{ fontSize: 15, color: '#3a352c', marginTop: 2 }}>{s.body}</div>
          </div>
        ))}

        <section id="sample-size" style={{ marginTop: 48, scrollMarginTop: 96 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800 }}>Sample-size minimums</h2>
          <p style={{ margin: '0 0 12px', fontSize: 15, color: '#5b5347' }}>[George: sample-size intro wording]</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {Object.entries(MIN_SAMPLE).map(([key, n]) => (
              <li key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderTop: '1px solid #e7e2d8', fontSize: 14 }}>
                <span>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
