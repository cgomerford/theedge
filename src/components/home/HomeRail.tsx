import Link from 'next/link'
import Thumb from './Thumb'
import { getLatestArticles } from '@/lib/articles'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'

// The strip down the right of the homepage, outside the featured report card: x9Lab articles, then articles from around
// the league. Rows are divider rows with a square thumbnail (a plain icon when there is no picture).

const MUTED = '#8a8275'
const H: React.CSSProperties = { margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }
const ROW: React.CSSProperties = { display: 'flex', gap: 12, padding: '12px 0', borderTop: '1px solid #e7e2d8', color: '#1A1A1A', textDecoration: 'none' }
const TITLE: React.CSSProperties = { fontSize: 14, fontWeight: 700, lineHeight: 1.3 }

function ago(iso: string | null): string {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function HomeRail() {
  const [articles, news] = await Promise.all([getLatestArticles(4).catch(() => []), getMLBNewsMultiSource().catch(() => [])])

  return (
    <aside aria-label="Articles" className="hm-rail">
      {articles.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={H}>From x9Lab</h2>
          {articles.map(a => (
            <Link key={a.id} href={`/articles/${a.slug}`} style={ROW}>
              <Thumb src={a.hero_image} />
              <span style={{ minWidth: 0 }}>
                <span style={{ ...TITLE, display: 'block' }}>{a.title}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{ago(a.published_at)}</span>
              </span>
            </Link>
          ))}
          <Link href="/articles" style={{ display: 'block', borderTop: '1px solid #e7e2d8', paddingTop: 10, fontSize: 13, fontWeight: 800, color: '#1A1A1A', textDecoration: 'underline', textUnderlineOffset: 3 }}>All articles</Link>
        </section>
      )}

      {news.length > 0 && (
        <section>
          <h2 style={H}>Around the league</h2>
          {news.slice(0, 5).map(n => (
            <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" style={ROW}>
              <Thumb src={n.image} />
              <span style={{ minWidth: 0 }}>
                <span style={{ ...TITLE, display: 'block' }}>{n.headline}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{[n.source, ago(n.published)].filter(Boolean).join(' · ')}</span>
              </span>
            </a>
          ))}
        </section>
      )}
    </aside>
  )
}
