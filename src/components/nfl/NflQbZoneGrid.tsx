// src/components/nfl/NflQbZoneGrid.tsx
//
// 6-cell zone grid (left/middle/right x short/deep) — comp%/CPOE/EPA
// per zone vs league average. Real granularity is 6 cells, not the
// full depth-band mockup — nfl_qb_zone_profile only classifies
// short/deep, not multiple depth bands.

import type { QbZoneProfile, ZoneLeagueAverage } from '@/lib/nfl/queries'

const LOCATIONS = ['left', 'middle', 'right'] as const
const LENGTHS = ['deep', 'short'] as const // deep row on top, matches field-orientation of the reference mockups

function cellColor(cpoe: number | null): string {
  if (cpoe == null) return '#F0EBE0'
  if (cpoe >= 3) return '#16A34A'
  if (cpoe >= 0) return '#86EFAC'
  if (cpoe >= -3) return '#FDBA74'
  return '#F87171'
}

export default function NflQbZoneGrid({
  profile,
  leagueAvg,
}: {
  profile: QbZoneProfile | null
  leagueAvg: ZoneLeagueAverage[]
}) {
  if (!profile || profile.cells.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No zone data yet for this player.</div>
      </div>
    )
  }

  const cellByKey = new Map(profile.cells.map((c) => [`${c.passLocation}|${c.passLength}`, c]))
  const leagueByKey = new Map(leagueAvg.map((l: any) => [`${l.passLocation}|${l.passLength}`, l]))

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 12 }}>
        Green = above-average CPOE for that zone. Red = below. {profile.totalAttempts} classified attempts.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 480 }}>
        {LENGTHS.map((len) =>
          LOCATIONS.map((loc) => {
            const cell = cellByKey.get(`${loc}|${len}`)
            const league = leagueByKey.get(`${loc}|${len}`) as any
            return (
              <div
                key={`${loc}-${len}`}
                style={{ background: cellColor(cell?.cpoe ?? null), border: '1px solid rgba(26,26,26,0.1)', borderRadius: 4, padding: 12, textAlign: 'center' }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {loc} · {len}
                </div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 22, color: '#1A1A1A', margin: '4px 0' }}>
                  {cell?.compPct != null ? `${cell.compPct.toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#57534E' }}>
                  {cell?.attempts ?? 0} att · CPOE {cell?.cpoe != null ? cell.cpoe.toFixed(1) : '—'}
                </div>
                  {league?.avgCpoe != null && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#78716C', marginTop: 2 }}>
                    Lg avg CPOE {league.avgCpoe.toFixed(1)}
                  </div>
                )}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}