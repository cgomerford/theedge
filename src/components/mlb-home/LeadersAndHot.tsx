import Link from 'next/link'
import { Headshot } from '@/components/home/Logo'
import SmallSample from '@/components/data/SmallSample'
import type { MLBStatLeader } from '@/lib/mlb-homepage'
import type { HotRow, SeasonState } from '@/lib/mlb-home-dashboard'

const MUTED = '#8a8275'

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span style={{ fontSize: 12, color: MUTED }}>{label}: {values.length === 1 ? values[0] : 'one game'}</span>
  const max = Math.max(1, ...values), w = 90, h = 26
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - (v / max) * (h - 8)}`).join(' ')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width={w} height={h} role="img" aria-label={`${label}: ${values.join(', ')}`}><polyline points={pts} fill="none" stroke="#FF5722" strokeWidth="2.5" /></svg>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
    </span>
  )
}

function LeaderRows({ rows, start }: { rows: MLBStatLeader[]; start: number }) {
  return (
    <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
      {rows.map((r, i) => (
        <Link key={r.personId} href={`/mlb/players/${r.personId}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: '#1A1A1A', textDecoration: 'none' }}>
          <span style={{ width: 16, color: MUTED, fontSize: 12 }}>{start + i}</span>
          <Headshot id={r.personId} name={r.name} size={28} />
          <span style={{ flex: 1, minWidth: 0 }}>{r.name} <span style={{ color: MUTED }}>{r.teamAbbr}</span></span>
          <b>{r.statValue}</b>
        </Link>
      ))}
    </div>
  )
}

export function Leaders({ groups, season }: { groups: { label: string; rows: MLBStatLeader[] }[]; season: SeasonState }) {
  return (
    <section aria-labelledby="ld-h" style={{ marginTop: 34 }}>
      <h2 id="ld-h" style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800 }}>Leaders</h2>
      <style>{`.ld-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 32px}@media (max-width:760px){.ld-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="ld-grid">
        {groups.map(g => {
          const [top, ...rest] = g.rows
          if (!top) return <div key={g.label} style={{ fontSize: 14, color: MUTED }}>{g.label}: not available right now.</div>
          return (
            <div key={g.label} style={{ borderTop: '1px solid #e7e2d8', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.1em', color: MUTED }}>{g.label}</div>
              <div style={{ fontSize: 'clamp(44px, 6vw, 64px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', margin: '4px 0 8px' }}>{top.statValue}</div>
              <Link href={`/mlb/players/${top.personId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#1A1A1A', textDecoration: 'none', fontWeight: 800 }}>
                <Headshot id={top.personId} name={top.name} size={32} />{top.name} <span style={{ color: MUTED, fontWeight: 600 }}>{top.teamAbbr}</span>
              </Link>
              <LeaderRows rows={rest.slice(0, 4)} start={2} />
              {rest.length > 4 && (
                <details style={{ marginTop: 2 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#FF5722', padding: '4px 0' }}>Show the top {rest.length + 1}</summary>
                  <LeaderRows rows={rest.slice(4)} start={6} />
                </details>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: MUTED }}>
        {season.year} regular season, qualified players. {season.state === 'postseason' ? 'Postseason leaders are on the Stats page. ' : ''}<Link href="/mlb/stats" style={{ color: '#FF5722', fontWeight: 800 }}>Full leaderboards in Stats →</Link>
      </p>
    </section>
  )
}

function HotList({ title, rows }: { title: string; rows: HotRow[] }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{title}</h3>
      {rows.length === 0 && <p style={{ fontSize: 14, color: MUTED }}>Nobody qualifies yet.</p>}
      {rows.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #e7e2d8' }}>
          <div style={{ minWidth: 0 }}>
            <Link href={`/mlb/players/${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1A1A1A', textDecoration: 'none', minWidth: 0 }}>
              <Headshot id={r.id} name={r.name} size={36} />
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 800 }}>{r.name}</span> <span style={{ color: MUTED, fontSize: 13 }}>{r.team}</span>
                <span style={{ display: 'block', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#1A1A1A', fontWeight: 400 }}>{r.line} · {r.n} {r.nLabel}{r.small && <> · <SmallSample n={r.n} /></>}</span>
              </span>
            </Link>
          </div>
          <Spark values={r.spark} label={r.sparkLabel} />
        </div>
      ))}
    </div>
  )
}

export function HotThisMonth({ hitters, pitchers, week, post }: { hitters: HotRow[]; pitchers: HotRow[]; week: string; post: boolean }) {
  return (
    <section aria-labelledby="hot-h" style={{ marginTop: 34 }}>
      <h2 id="hot-h" style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800 }}>Who&apos;s hot this month</h2>
      <style>{`.hot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 32px}@media (max-width:760px){.hot-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="hot-grid">
        <HotList title="Hitters" rows={hitters} />
        <HotList title="Pitchers" rows={pitchers} />
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>{post ? 'Postseason' : 'Regular season'}, {week}. Hitters by OPS (minimum {post ? 7 : 60} plate appearances); pitchers by innings, then ERA.</p>
    </section>
  )
}
