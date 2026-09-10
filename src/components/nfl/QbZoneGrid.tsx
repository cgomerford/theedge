// src/components/nfl/QbZoneGrid.tsx
//
// Redesigned to match the NGS reference image: trapezoid field
// perspective (narrower at top = further downfield, wider at bottom =
// near LOS), a green/yellow/red legend, LOS line, and a player card
// below with headshot + validated stat line.
//
// Row labels say "~15 air yds" rather than a hard cutoff -- real 2024
// data shows short/deep overlap slightly in the 12-15 range (verified
// via nflreadpy), so a hard "< 15 / >= 15" claim would overstate the
// precision of pass_length's own classification.
//
// Passer rating in the player card uses the standard clamped NFL
// formula, verified against Tua Tagovailoa's real 2023 season (560
// att, 388 comp, 4624 yds, 29 TD, 14 INT -> 101.1) before shipping --
// see getQbSeasonBoxScore in queries.ts.

'use client'

import type { QbZoneProfile, ZoneLeagueAverage, QbSeasonBoxScore } from '@/lib/nfl/queries'

const MONO = "'JetBrains Mono', monospace"
const SERIF = "'Fraunces', serif"

const ROWS: { length: string; label: string }[] = [
  { length: 'deep', label: 'DEEP · ~15+ AIR YDS' },
  { length: 'short', label: 'SHORT · ~15 AIR YDS OR LESS' },
]
const COLS: { location: string; label: string }[] = [
  { location: 'left', label: 'LEFT' },
  { location: 'middle', label: 'MIDDLE' },
  { location: 'right', label: 'RIGHT' },
]

function zoneTone(cpoe: number, leagueAvg: number): { bg: string; label: string } {
  const delta = cpoe - leagueAvg
  if (delta > 2) return { bg: '#16A34A', label: 'BETTER' }
  if (delta < -2) return { bg: '#DC2626', label: 'WORSE' }
  return { bg: '#D97706', label: 'AVERAGE' }
}

// Trapezoid effect: each row narrower than the last as it goes "further
// downfield" (up), achieved with per-row horizontal inset rather than a
// single clip-path over the whole grid, so cell content stays upright
// and readable instead of being skewed/distorted.
const ROW_INSET: Record<string, number> = { deep: 10, short: 0 }

export function QbZoneGrid({
  profile,
  leagueAvgs,
  qbName,
  headshotUrl,
  teamId,
  boxScore,
}: {
  profile: QbZoneProfile
  leagueAvgs: ZoneLeagueAverage[]
  qbName: string
  headshotUrl?: string | null
  teamId?: string
  boxScore?: QbSeasonBoxScore | null
}) {
  const avgByZone = new Map(leagueAvgs.map((a) => [`${a.passLocation}|${a.passLength}`, a]))
  const cellByZone = new Map(profile.cells.map((c) => [`${c.passLocation}|${c.passLength}`, c]))

  return (
    <div style={{ background: '#0A0A0A', borderRadius: 16, overflow: 'hidden' }}>
      {/* Field */}
      <div style={{ position: 'relative', padding: '18px 18px 26px' }}>
        {ROWS.map((row, rowIdx) => {
          const inset = ROW_INSET[row.length]
          return (
            <div key={row.length} style={{ marginBottom: 10, padding: `0 ${inset}%` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>
                  {row.label}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {COLS.map((col) => {
                  const key = `${col.location}|${row.length}`
                  const cell = cellByZone.get(key)
                  const avg = avgByZone.get(key)
                  if (!cell || !avg || cell.attempts === 0) {
                    return (
                      <div
                        key={key}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: 8,
                          padding: 12,
                          minHeight: 68,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>No attempts</span>
                      </div>
                    )
                  }
                  const tone = zoneTone(cell.cpoe ?? 0, avg.avgCpoe)
                  return (
                    <div key={key} style={{ background: tone.bg, borderRadius: 8, padding: 12, minHeight: 68, color: '#fff' }}>
                      <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, lineHeight: 1 }}>
                        {cell.cpoe != null ? `${cell.cpoe > 0 ? '+' : ''}${cell.cpoe.toFixed(1)}` : '—'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 7, opacity: 0.85, marginTop: 2 }}>
                        League avg {avg.avgCpoe > 0 ? '+' : ''}{avg.avgCpoe.toFixed(1)}
                      </div>
                    </div>
                  )
                })}
              </div>
              {rowIdx === 0 ? null : (
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <div style={{ height: 2, background: '#3B82F6' }} />
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: -7,
                      fontFamily: MONO,
                      fontSize: 8,
                      fontWeight: 700,
                      color: '#3B82F6',
                      background: '#0A0A0A',
                      paddingRight: 6,
                    }}
                  >
                    LOS
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '0 18px 16px' }}>
        {[
          { color: '#16A34A', label: 'BETTER THAN AVERAGE' },
          { color: '#D97706', label: 'WITHIN AVERAGE' },
          { color: '#DC2626', label: 'WORSE THAN AVERAGE' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, background: l.color, display: 'inline-block' }} />
            <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>{l.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: '#3B82F6' }}>LOS</span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(255,255,255,0.6)' }}>LINE OF SCRIMMAGE</span>
        </div>
      </div>

      {/* Player card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: '#171717', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={headshotUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', background: '#262626', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 8, background: '#262626', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {qbName}
            {teamId ? <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>/ {teamId}</span> : null}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{profile.season} REGULAR SEASON</div>
        </div>
        {boxScore ? (
          <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
            {[
              { label: 'RATING', value: boxScore.passerRating.toFixed(1) },
              { label: 'COMP %', value: boxScore.compPct.toFixed(1) },
              { label: 'YARDS', value: boxScore.passingYards.toLocaleString() },
              { label: 'TD/INT', value: `${boxScore.passingTds}/${boxScore.interceptions}` },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: '#fff' }}>{s.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}