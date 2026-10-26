import Link from 'next/link'
import PlayerSearch from '@/components/PlayerSearch'
import type { MLBNewsItem } from '@/lib/mlb-homepage'

const MUTED = '#8a8275'
const ukTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + ' UK' }

export function News({ news, articles }: { news: MLBNewsItem[]; articles: { slug: string; title: string; published_at: string | null }[] }) {
  return (
    <section aria-label="News" style={{ marginTop: 34 }}>
      <style>{`.nw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 32px}@media (max-width:760px){.nw-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="nw-grid">
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>Around the league</h2>
          {news.slice(0, 8).map(n => (
            <div key={n.id} style={{ padding: '8px 0', borderTop: '1px solid #e7e2d8' }}>
              <a href={n.link} target="_blank" rel="noopener noreferrer" style={{ color: '#1A1A1A', fontWeight: 700, textDecoration: 'none' }}>{n.headline}</a>
              <div style={{ fontSize: 12, color: MUTED }}>{n.source ?? ''}{n.published ? ` · ${ukTime(n.published)}` : ''}</div>
            </div>
          ))}
        </div>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>From x9Lab</h2>
          {articles.length === 0 && <p style={{ fontSize: 14, color: MUTED }}>No articles yet.</p>}
          {articles.map(a => (
            <div key={a.slug} style={{ padding: '8px 0', borderTop: '1px solid #e7e2d8' }}>
              <Link href={`/articles/${a.slug}`} style={{ color: '#1A1A1A', fontWeight: 700, textDecoration: 'none' }}>{a.title}</Link>
              {a.published_at && <div style={{ fontSize: 12, color: MUTED }}>{ukTime(a.published_at)}</div>}
            </div>
          ))}
          <p style={{ margin: '8px 0 0', fontSize: 14 }}><Link href="/articles" style={{ color: '#FF5722', fontWeight: 800 }}>All articles →</Link></p>
        </div>
      </div>
    </section>
  )
}

export function LabsSearch() {
  return (
    <section aria-labelledby="ls-h" style={{ marginTop: 34, paddingBottom: 20 }}>
      <h2 id="ls-h" style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800 }}>Look up a pitcher or batter</h2>
      <div style={{ maxWidth: 520 }}><PlayerSearch sport="MLB" labLinks /></div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>Pitchers open in Pitching Lab, batters in Batting Lab.</p>
    </section>
  )
}
