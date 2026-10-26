import SiteHeader from '@/components/SiteHeader'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { pageMeta } from '@/lib/seo'

export const metadata = pageMeta({
  title: 'The case for plain numbers',
  description: 'Why x9Lab puts the sample size beside every stat, and how plain-number game previews differ from dense stat sites and long-form previews. Read the reasoning.',
  path: '/why-edge',
})

const POINTS = [
  { name: 'Every number shows its sample', body: 'A rate with no count behind it is easy to misread. Each stat here carries its n, and below the minimum it says "Small sample" instead of a number.' },
  { name: 'Description, not advice', body: "Pages say what players and pitchers have done and with how many pitches or plate appearances. They don't say what will happen." },
  { name: 'Built on public game data', body: 'Pitch-level and box-score data that anyone can get. Independent, not affiliated with MLB.' },
]

export default function WhyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'Why x9Lab', path: '/why-edge' }]} />
      <SiteHeader variant="page" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 16px 80px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>The case for plain numbers</h1>
        <p style={{ margin: '0 0 28px', fontSize: 17, color: '#5b5347' }}>[George: why x9Lab intro wording]</p>
        {POINTS.map(p => (
          <div key={p.name} style={{ padding: '14px 0', borderTop: '1px solid #e7e2d8' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
            <div style={{ fontSize: 15, color: '#3a352c', marginTop: 2 }}>{p.body}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
