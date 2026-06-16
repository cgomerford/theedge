'use client'

// src/components/SprayChart.tsx
//
// Where does this batter hit the ball? Spray chart from Savant data.
// Dots on a field — orange = home run, yellow = extra bases,
// green = single, grey = out. Filter by result type.

import { useEffect, useState } from 'react'

/* ── Types ───────────────────────────────────────────────────────────── */

interface BattedBall {
  x:       number
  y:       number
  events:  string
  bb_type: string
}

type Filter = 'all' | 'hits' | 'hr'
type EventGroup = 'hr' | 'xbh' | 'single' | 'out'

function classifyEvent(events: string): EventGroup {
  if (events === 'home_run') return 'hr'
  if (['double', 'triple'].includes(events)) return 'xbh'
  if (events === 'single') return 'single'
  return 'out'
}

const DOT_COLOR: Record<EventGroup, string> = {
  hr:     '#FF5722',
  xbh:    '#F59E0B',
  single: '#16A34A',
  out:    'rgba(26,26,26,0.15)',
}

const DOT_RADIUS: Record<EventGroup, number> = {
  hr:     4,
  xbh:    3,
  single: 2.5,
  out:    2,
}

/* ── Coordinate transform ────────────────────────────────────────────── */
// Savant hc_x/hc_y: 0-250, home plate at ~125,215
// Our SVG viewBox: 220x200, home plate at 110,185

function toSVG(hc_x: number, hc_y: number): [number, number] {
  return [
    Math.round((hc_x / 250) * 220),
    Math.round((hc_y / 250) * 200),
  ]
}

/* ── Fetch via our API route (avoids Savant CORS block) ─────────────── */

async function fetchSprayData(playerId: number): Promise<BattedBall[]> {
  try {
    const res = await fetch(`/api/spray-chart?playerId=${playerId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.balls ?? []
  } catch {
    return []
  }
}

/* ── Pull tendency ───────────────────────────────────────────────────── */
function getPullSummary(balls: BattedBall[], stand?: 'L' | 'R' | null): string {
  const hits = balls.filter(b => ['home_run','single','double','triple'].includes(b.events))
  if (hits.length < 10) return ''
  if (!stand) return ''  // don't guess if we don't know handedness
  // RHB pulls left (low hc_x), LHB pulls right (high hc_x)
  const pulled = stand === 'L'
    ? hits.filter(b => b.x > 140).length
    : hits.filter(b => b.x < 80).length
  const pct = Math.round((pulled / hits.length) * 100)
  if (pct >= 55) return `Pulls ${pct}% of hits`
  if (pct <= 25) return `Goes oppo ${100 - pct}% of hits`
  return `Spreads it around`
}

/* ── Field SVG ───────────────────────────────────────────────────────── */

function Field() {
  // Savant coordinate system: (125, 215) = home plate, y increases downward
  // So outfield is LOW y values (top of SVG), home plate is HIGH y values (bottom)
  // SVG viewBox 220x220 — home plate at ~(110, 195), outfield arc at ~y=20
  return (
    <g>
      {/* Outfield grass — arc at top, home plate at bottom */}
      <path d="M110 195 L10 90 Q110 5 210 90 Z"
        fill="#EDE8E0" stroke="#D4C9C0" strokeWidth="1"/>
      {/* Infield dirt */}
      <path d="M110 195 L68 153 L110 111 L152 153 Z"
        fill="#E2D5CB" stroke="#D4C9C0" strokeWidth="0.5"/>
      {/* Foul lines */}
      <line x1="110" y1="195" x2="10" y2="90" stroke="#C4BDB7" strokeWidth="0.5" strokeDasharray="4,3"/>
      <line x1="110" y1="195" x2="210" y2="90" stroke="#C4BDB7" strokeWidth="0.5" strokeDasharray="4,3"/>
      {/* Second base — top of diamond (low y) */}
      <rect x="107" y="108" width="6" height="6" rx="1" fill="#1A1A1A" transform="rotate(45 110 111)"/>
      {/* Third base — left */}
      <rect x="65" y="150" width="6" height="6" rx="1" fill="#1A1A1A" transform="rotate(45 68 153)"/>
      {/* First base — right */}
      <rect x="149" y="150" width="6" height="6" rx="1" fill="#1A1A1A" transform="rotate(45 152 153)"/>
      {/* Home plate */}
      <polygon points="110,200 106,195 108,189 112,189 114,195" fill="#1A1A1A"/>
      {/* Labels */}
      <text x="110" y="45" textAnchor="middle" fontSize="9" fill="#B0A89F" fontFamily="Space Mono, monospace">Centre field</text>
      <text x="30" y="130" textAnchor="middle" fontSize="9" fill="#B0A89F" fontFamily="Space Mono, monospace">Left</text>
      <text x="190" y="130" textAnchor="middle" fontSize="9" fill="#B0A89F" fontFamily="Space Mono, monospace">Right</text>
    </g>
  )
}

/* ── Filter button ───────────────────────────────────────────────────── */

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'Space Mono, monospace', fontSize: 9, padding: '4px 10px',
      borderRadius: 4, border: `1px solid ${active ? '#FF5722' : 'rgba(26,26,26,0.15)'}`,
      background: active ? '#FF5722' : 'transparent',
      color: active ? '#FFFFFF' : '#A3A3A3',
      cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em',
    }}>
      {label}
    </button>
  )
}

/* ── Main export ─────────────────────────────────────────────────────── */

export default function SprayChart({
  playerId, playerName, stand, isPro,
}: {
  playerId:    number
  playerName:  string
  stand?:      'L' | 'R' | null
  isPro:       boolean
}) {
  const [balls,   setBalls]   = useState<BattedBall[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<Filter>('all')

  useEffect(() => {
    setLoading(true)
    setBalls([])
    fetchSprayData(playerId).then(data => {
      setBalls(data)
      setLoading(false)
    })
  }, [playerId])

  const displayed = balls.filter(b => {
    if (filter === 'hits') return ['home_run','single','double','triple'].includes(b.events)
    if (filter === 'hr')   return b.events === 'home_run'
    return true
  })

  const totalBIP  = balls.length
  const hits      = balls.filter(b => ['home_run','single','double','triple'].includes(b.events)).length
  const hrs       = balls.filter(b => b.events === 'home_run').length
  const pullText  = getPullSummary(balls, stand)

  // Empty state
  const isEmpty = !loading && totalBIP === 0

  return (
    <div>
{/* Plain English insight */}
      {!loading && totalBIP > 0 && pullText && (
        <div style={{
          padding: '8px 12px', background: '#1A1A1A', borderRadius: 6,
          marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 13, color: '#FFFFFF' }}>
            {pullText}
          </span>
          {hrs > 0 && (
            <span style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9, fontWeight: 700,
              color: '#FF5722', background: 'rgba(255,87,34,0.15)',
              padding: '2px 7px', borderRadius: 4, marginLeft: 'auto',
            }}>
              {hrs} HR this season
            </span>
          )}
        </div>
      )}

      {/* Summary row */}
      {!loading && totalBIP > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3' }}>
            {totalBIP} balls in play · {hits} hits · {hrs} home runs
          </span>
          {pullText && (
            <span style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9, fontWeight: 700,
              color: '#FF5722', background: '#FFF3E0',
              padding: '2px 7px', borderRadius: 4,
            }}>
              {pullText}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <FilterBtn label="All"       active={filter === 'all'}  onClick={() => setFilter('all')} />
            <FilterBtn label="Hits only" active={filter === 'hits'} onClick={() => setFilter('hits')} />
            <FilterBtn label="HR only"   active={filter === 'hr'}   onClick={() => setFilter('hr')} />
          </div>
        </div>
      )}

      {/* Field */}
      <div style={{
        background: '#FAF8F3', borderRadius: 8,
        padding: '8px 4px', position: 'relative', minHeight: 160,
      }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#A3A3A3',
            background: '#FAF8F3', borderRadius: 8, zIndex: 2,
          }}>
            Loading...
          </div>
        )}

        <svg viewBox="0 0 220 200" style={{ width: '100%', display: 'block' }}>
          <Field />

          {!loading && !isEmpty && displayed.map((b, i) => {
            const [x, y] = toSVG(b.x, b.y)
            const group  = classifyEvent(b.events)
            return (
              <circle
                key={i} cx={x} cy={y}
                r={DOT_RADIUS[group]}
                fill={DOT_COLOR[group]}
                opacity={group === 'out' ? 0.35 : 0.80}
              />
            )
          })}
        </svg>

        {/* Empty state overlay on the field */}
        {isEmpty && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6,
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, color: '#6B6B6B' }}>
              No data yet for this season
            </div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9,
              color: '#A3A3A3', textAlign: 'center', maxWidth: 200, lineHeight: 1.6,
            }}>
              Once this batter has enough plate appearances, their spray chart will appear here
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          {([
            { group: 'hr',     label: 'Home run'    },
            { group: 'xbh',    label: 'Extra bases' },
            { group: 'single', label: 'Single'      },
            { group: 'out',    label: 'Out'         },
          ] as { group: EventGroup; label: string }[]).map(({ group, label }) => (
            <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 9, height: 9, borderRadius: '50%',
                background: DOT_COLOR[group],
                border: group === 'out' ? '1px solid #C4BDB7' : 'none',
              }} />
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#A3A3A3' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Friendly explainer */}
      <div style={{
        marginTop: 10, padding: '8px 12px',
        background: '#F5F1E8', borderRadius: 6,
        fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#6B6B6B',
        lineHeight: 1.6,
      }}>
        Each dot is one ball hit into play this season. Orange dots cleared the fence.
        {pullText ? ` This batter ${pullText.toLowerCase()} — defenders adjust accordingly.` : ''}
      </div>
    </div>
  )
}
