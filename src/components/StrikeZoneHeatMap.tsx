'use client'

// src/components/StrikeZoneHeatMap.tsx
//
// 9-zone strike zone heat map from Baseball Savant data.
// Fetches via /api/hot-zones (server-side proxy — avoids Savant CORS).
// BA view is free. xwOBA toggle is Pro.

import { useEffect, useState } from 'react'

/* ── Types ───────────────────────────────────────────────────────────── */

interface ZoneData {
  zone:  number
  ba:    number | null
  xwoba: number | null
  pa:    number    // total pitches seen in zone
  bip?:  number   // balls in play in zone
}

type Metric = 'ba' | 'xwoba'

/* ── Zone grid layout (catcher's view) ──────────────────────────────── */
// Row 0 (top): 7 8 9  — high
// Row 1 (mid): 4 5 6  — middle
// Row 2 (bot): 1 2 3  — low

const ZONE_GRID = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
]

/* ── Colour helpers ──────────────────────────────────────────────────── */

function zoneColor(value: number | null, metric: Metric): string {
  if (value === null) return 'rgba(26,26,26,0.05)'
  if (metric === 'ba') {
    if (value >= 0.350) return 'rgba(255,87,34,0.88)'
    if (value >= 0.300) return 'rgba(255,87,34,0.60)'
    if (value >= 0.260) return 'rgba(255,87,34,0.30)'
    if (value >= 0.220) return 'rgba(26,26,26,0.06)'
    if (value >= 0.180) return 'rgba(59,130,246,0.28)'
    return 'rgba(59,130,246,0.58)'
  } else {
    if (value >= 0.420) return 'rgba(255,87,34,0.88)'
    if (value >= 0.370) return 'rgba(255,87,34,0.60)'
    if (value >= 0.320) return 'rgba(255,87,34,0.28)'
    if (value >= 0.270) return 'rgba(26,26,26,0.06)'
    if (value >= 0.220) return 'rgba(59,130,246,0.28)'
    return 'rgba(59,130,246,0.58)'
  }
}

function textColor(value: number | null, metric: Metric): string {
  const bg = zoneColor(value, metric)
  if (bg.includes('255,87,34') && parseFloat(bg.split(',')[3]) > 0.50) return '#FFFFFF'
  if (bg.includes('59,130,246') && parseFloat(bg.split(',')[3]) > 0.45) return '#1E3A8A'
  return 'var(--color-text-primary)'
}

/* ── Fetch via API route ─────────────────────────────────────────────── */

async function fetchZones(playerId: number): Promise<ZoneData[]> {
  try {
    const res = await fetch(`/api/hot-zones?playerId=${playerId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.zones ?? []
  } catch {
    return []
  }
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function StrikeZoneHeatMap({
  playerId, playerName, stand, isPro,
}: {
  playerId:    number
  playerName:  string
  stand?:      'L' | 'R' | null | undefined
  isPro:       boolean
}) {
  const [zones,   setZones]   = useState<ZoneData[]>([])
  const [loading, setLoading] = useState(true)
  const [metric,  setMetric]  = useState<Metric>('ba')

  useEffect(() => {
    setLoading(true)
    setZones([])
    fetchZones(playerId).then(data => {
      setZones(data)
      setLoading(false)
    })
  }, [playerId])

  const getZone = (z: number) => zones.find(d => d.zone === z)

  const displayMetric: Metric = isPro ? metric : 'ba'

  // Hottest and coldest zones for badges
  const valid    = zones.filter(z => (z.ba ?? 0) > 0)
  const hotZone  = valid.length > 0 ? valid.reduce((a, b) => (a.ba ?? 0) > (b.ba ?? 0) ? a : b) : null
  const coldZone = valid.length > 0 ? valid.reduce((a, b) => (a.ba ?? 1) < (b.ba ?? 1) ? a : b) : null

  const isEmpty = !loading && zones.length === 0

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3' }}>
          Catcher's view · {stand === 'L' ? 'LHB' : stand === 'R' ? 'RHB' : 'Batter'} · 2026
        </span>
        {isPro && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ba', 'xwoba'] as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{
                  fontFamily: 'Space Mono, monospace', fontSize: 9,
                  padding: '3px 8px', borderRadius: 4, border: '1px solid',
                  borderColor: metric === m ? '#FF5722' : 'rgba(26,26,26,0.15)',
                  background: metric === m ? '#FF5722' : 'transparent',
                  color: metric === m ? '#FFFFFF' : '#A3A3A3',
                  cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '.04em',
                }}
              >
                {m === 'ba' ? 'Batting avg' : 'xwOBA'}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 160, fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#A3A3A3',
        }}>
          Loading...
        </div>
      )}

      {isEmpty && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, color: '#6B6B6B', marginBottom: 6 }}>
            No hot zone data yet
          </div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3', lineHeight: 1.6 }}>
            Needs enough plate appearances this season to build meaningful zone data
          </div>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          {/* Zone grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 4, maxWidth: 220, margin: '0 auto 12px',
          }}>
            {ZONE_GRID.flat().map(zoneNum => {
              const zd    = getZone(zoneNum)
              const value = displayMetric === 'ba' ? zd?.ba ?? null : zd?.xwoba ?? null
              const bg    = zoneColor(value, displayMetric)
              const tc    = textColor(value, displayMetric)
              const isHot  = hotZone?.zone  === zoneNum
              const isCold = coldZone?.zone === zoneNum

              return (
                <div
                  key={zoneNum}
                  style={{
                    background:  bg,
                    border:      isHot ? '2px solid #FF5722' : isCold ? '2px solid #3B82F6' : '1px solid rgba(26,26,26,0.08)',
                    borderRadius: 4,
                    height:      64,
                    display:     'flex',
                    flexDirection: 'column' as const,
                    alignItems:  'center',
                    justifyContent: 'center',
                    position:    'relative' as const,
                  }}
                >
                  {/* Zone number */}
                  <div style={{
                    position: 'absolute', top: 3, left: 5,
                    fontFamily: 'Space Mono, monospace', fontSize: 7,
                    color: 'rgba(26,26,26,0.2)',
                  }}>
                    {zoneNum}
                  </div>

                  {value !== null ? (
                    <>
                      <div style={{
                        fontFamily: 'Space Mono, monospace', fontSize: 13,
                        fontWeight: 700, color: tc, lineHeight: 1,
                      }}>
                        {value.toFixed(3).replace('0.', '.')}
                      </div>
                   {zd && zd.pa > 0 && (
                        <div style={{
                          fontFamily: 'Space Mono, monospace', fontSize: 7,
                          color: tc, opacity: 0.65, marginTop: 2,
                        }}>
                          {zd.pa} pitches
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#C4BDB7' }}>—</div>
                  )}

                  {/* Hot / cold badge */}
                  {isHot && (
                    <div style={{
                      position: 'absolute', top: -9, right: -1,
                      fontFamily: 'Space Mono, monospace', fontSize: 7,
                      background: '#FF5722', color: '#FFF',
                      padding: '1px 4px', borderRadius: 3,
                    }}>
                      HOT
                    </div>
                  )}
                  {isCold && (
                    <div style={{
                      position: 'absolute', top: -9, right: -1,
                      fontFamily: 'Space Mono, monospace', fontSize: 7,
                      background: '#3B82F6', color: '#FFF',
                      padding: '1px 4px', borderRadius: 3,
                    }}>
                      COLD
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Colour scale */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
            {[
              { bg: 'rgba(59,130,246,0.55)', label: 'Cold' },
              { bg: 'rgba(26,26,26,0.08)',   label: 'Average', border: '1px solid rgba(26,26,26,0.15)' },
              { bg: 'rgba(255,87,34,0.7)',   label: 'Hot' },
            ].map(({ bg, label, border }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, background: bg, borderRadius: 2, border: border ?? 'none' }} />
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Plain English explainer */}
          <div style={{
            padding: '8px 12px', background: '#F5F1E8', borderRadius: 6,
            fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#6B6B6B', lineHeight: 1.6,
          }}>
           {displayMetric === 'ba'
              ? 'Each box shows batting average on balls put in play in that zone. Numbers show how many pitches the batter has seen there this season. Orange = pitchers avoid this zone. Blue = safe to attack.'
              : 'xwOBA shows how dangerous contact has been in each zone regardless of luck. Higher = more damage done when the batter swings here.'}
            {hotZone?.ba != null && ` This batter hits ${hotZone.ba.toFixed(3)} in their hottest zone — pitch there at your peril.`}
          </div>

          {!isPro && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: '#FFF3E0', borderRadius: 6,
              fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#E65100',
            }}>
              ⊕ Pro — unlock xwOBA view to see which zones produce the most dangerous contact
            </div>
          )}
        </>
      )}
    </div>
  )
}