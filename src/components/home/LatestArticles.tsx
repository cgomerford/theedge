import Link from 'next/link'
import Thumb from './Thumb'
import { getLatestArticles } from '@/lib/articles'

// The homepage's main column once the season's game report is no longer shown (more than 5 days after the last game):
// the latest x9Lab articles, the newest as a lead with a larger picture, the rest as divider rows.

const MUTED = '#8a8275'
const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '')

export default async function LatestArticles() {
  const articles = await getLatestArticles(9).catch(() => [])
  if (articles.length === 0) {
    return (
      <section style={{ padding: '32px 0 8px' }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em' }}>MLB analytics in plain numbers</h2>
      </section>
    )
  }
  const [lead, ...rest] = articles
  return (
    <section aria-label="Latest articles" style={{ padding: '8px 0 12px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }}>Latest from x9Lab</h2>
      <Link href={`/articles/${lead.slug}`} style={{ display: 'block', color: '#1A1A1A', textDecoration: 'none', paddingBottom: 18 }}>
        {lead.hero_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead.hero_image} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', border: '1px solid #e7e2d8', borderRadius: 2, display: 'block', marginBottom: 12 }} />
        )}
        <span style={{ display: 'block', fontSize: 'clamp(24px, 3.4vw, 36px)', fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.12 }}>{lead.title}</span>
        {lead.excerpt && <span style={{ display: 'block', marginTop: 8, fontSize: 16, lineHeight: 1.5, color: '#3a352c' }}>{lead.excerpt}</span>}
        <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: MUTED }}>{ago(lead.published_at)}</span>
      </Link>
      {rest.map(a => (
        <Link key={a.id} href={`/articles/${a.slug}`} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: '1px solid #e7e2d8', color: '#1A1A1A', textDecoration: 'none' }}>
          <Thumb src={a.hero_image} size={84} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{a.title}</span>
            {a.excerpt && <span style={{ display: 'block', marginTop: 4, fontSize: 13.5, lineHeight: 1.45, color: '#5b5347' }}>{a.excerpt.length > 150 ? `${a.excerpt.slice(0, 150).trimEnd()}…` : a.excerpt}</span>}
            <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: MUTED }}>{ago(a.published_at)}</span>
          </span>
        </Link>
      ))}
      <Link href="/articles" style={{ display: 'block', borderTop: '1px solid #e7e2d8', paddingTop: 12, fontSize: 14, fontWeight: 800, color: '#1A1A1A', textDecoration: 'underline', textUnderlineOffset: 3 }}>All articles →</Link>
    </section>
  )
}
