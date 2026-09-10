// src/components/nfl/TopPerformersGrid.tsx
//
// Structural pass -- real headshot/name/team/stat from data you
// already have. The mini trajectory thumbnail under each card is a
// deliberate placeholder (labeled, not faked as real) -- the honest
// version needs a compact real chart (EPA-by-week or route-share),
// which is a follow-up refinement, not something to fake here.

'use client'

import Link from 'next/link'

export interface TopPerformerEntry {
  gsisId: string
  fullName: string
  teamId: string
  position: string
  headshotUrl: string | null
  statValue: number
  statLabel: string
}

export function TopPerformersGrid({ entries, columns = 3 }: { entries: TopPerformerEntry[]; columns?: number }) {
  if (entries.length === 0) return null

  return (
    <section className="nh-leaders-league" style={{ margin: 0, padding: 0 }}>
      <div className="nh-league-head">
        <div>
          <p className="nh-kicker">§ Top Performers</p>
          <h2>This week's headline numbers.</h2>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8, marginTop: 16 }}>
        {entries.map((e) => (
          <Link
            key={e.gsisId}
            href={`/nfl/players/${e.gsisId}`}
            style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
              {e.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.headshotUrl} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: '#EEE' }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEE' }} />
              )}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.fullName}
                </p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#78716C', margin: '2px 0 0' }}>
                  {e.teamId} · {e.position}
                </p>
              </div>
            </div>
            <div style={{ padding: '0 10px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, lineHeight: 1 }}>{e.statValue.toFixed(0)}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3' }}>{e.statLabel}</span>
            </div>
            <div style={{ background: '#F4F0E8', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid rgba(26,26,26,0.06)' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Trend chart — next pass
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}