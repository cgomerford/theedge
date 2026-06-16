'use client'

// src/components/BullpenPanel.tsx
//
// Bullpen availability panel — Pro-gated.
// Vertical bar per reliever, horizontal scroll row.
// Each bar: L3D total (orange) with yesterday subset (white) stacked inside.
// Headshot above, name + ERA below, status dot at top.

import Link from 'next/link'

/* ── Types ─────────────────────────────────────────────────────────── */

export type Availability = 'full_go' | 'limited' | 'rest_day'

export interface PitchDay {
  date: string
  pitches: number
}

export interface BullpenArm {
  player_id: number
  name:      string
  hand:      'L' | 'R'
  role:      string
  era:       number | null
  days:      PitchDay[]   // last 3 calendar days, oldest first
  pitches_today: number
}

export interface BullpenData {
  team_name: string
  team_id:   number
  arms:      BullpenArm[]
}

/* ── Status logic ───────────────────────────────────────────────────── */

const REST_DAY_THRESHOLD = 25
const LIMITED_THRESHOLD  = 40

function getAvailability(arm: BullpenArm): Availability {
  const yesterday = arm.days[arm.days.length - 1]?.pitches ?? 0
  const total3d   = arm.days.reduce((sum, d) => sum + d.pitches, 0)
  if (yesterday >= REST_DAY_THRESHOLD) return 'rest_day'
  if (total3d   >= LIMITED_THRESHOLD)  return 'limited'
  return 'full_go'
}

const STATUS: Record<Availability, { label: string; dot: string }> = {
  full_go:  { label: 'Full Go',  dot: '#16A34A' },
  limited:  { label: 'Limited',  dot: '#D97706' },
  rest_day: { label: 'Rest Day', dot: '#DC2626' },
}

/* ── Constants ──────────────────────────────────────────────────────── */

const BAR_HEIGHT  = 140   // px — total bar track height
const BAR_MAX     = 50    // pitches = 100% bar height
const playerHeadshotUrl = (id: number) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

/* ── Single arm column ──────────────────────────────────────────────── */

function ArmColumn({ arm }: { arm: BullpenArm }) {
  const availability = getAvailability(arm)
  const status       = STATUS[availability]

  const total3d     = arm.days.reduce((sum, d) => sum + d.pitches, 0)
  const yesterday   = arm.days[arm.days.length - 1]?.pitches ?? 0

  // Heights capped at BAR_HEIGHT
  const l3dPx  = Math.min((total3d   / BAR_MAX) * BAR_HEIGHT, BAR_HEIGHT)
  const yestPx = Math.min((yesterday / BAR_MAX) * BAR_HEIGHT, l3dPx)   // can't exceed l3d

  // Last name only for tight columns
  const lastName = arm.name.split(' ').slice(-1)[0]

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           6,
      minWidth:      72,
      maxWidth:      80,
    }}>

      {/* Status dot */}
      <div style={{
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   status.dot,
        flexShrink:   0,
      }} />

      {/* Headshot */}
      <img
        src={playerHeadshotUrl(arm.player_id)}
        alt={arm.name}
        style={{
          width:        44,
          height:       44,
          borderRadius: '50%',
          objectFit:    'cover',
          border:       '2px solid #E8E3DC',
          flexShrink:   0,
          background:   '#F0EDE6',
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/0/headshot/67/current'
        }}
      />

      {/* Vertical bar track */}
      <div style={{
        position:     'relative',
        width:        36,
        height:       BAR_HEIGHT,
        background:   '#EDE9E2',
        borderRadius: 4,
        overflow:     'hidden',
        flexShrink:   0,
      }}>
        {/* L3D bar (orange) — grows from bottom */}
        {l3dPx > 0 && (
          <div style={{
            position:     'absolute',
            bottom:       0,
            left:         0,
            right:        0,
            height:       l3dPx,
            background:   '#FF5722',
            borderRadius: '0 0 4px 4px',
          }}>
            {/* Yesterday subset (white) — bottom of the orange bar */}
            {yestPx > 0 && (
              <div style={{
                position:     'absolute',
                bottom:       0,
                left:         0,
                right:        0,
                height:       yestPx,
                background:   'rgba(255,255,255,0.55)',
                borderRadius: '0 0 4px 4px',
              }} />
            )}

            {/* L3D pitch count label — inside bar if tall enough, above if not */}
            {total3d > 0 && (
              <div style={{
                position:   'absolute',
                top:        l3dPx > 24 ? 6 : -20,
                left:       0,
                right:      0,
                textAlign:  'center',
                fontFamily: 'Space Mono, monospace',
                fontSize:   11,
                fontWeight: 700,
                color:      l3dPx > 24 ? '#FFFFFF' : '#FF5722',
                lineHeight: 1,
              }}>
                {total3d}
              </div>
            )}
          </div>
        )}

        {/* Zero state label */}
        {total3d === 0 && (
          <div style={{
            position:   'absolute',
            bottom:     8,
            left:       0,
            right:      0,
            textAlign:  'center',
            fontFamily: 'Space Mono, monospace',
            fontSize:   10,
            color:      '#C4BDB7',
          }}>
            0
          </div>
        )}
      </div>

      {/* Yesterday count below bar */}
      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize:   9,
        color:      '#A3A3A3',
        textAlign:  'center',
        lineHeight: 1.4,
      }}>
        {yesterday > 0 ? `${yesterday} yest` : 'rested'}
      </div>

      {/* Hand badge + last name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginBottom: 2 }}>
          <span style={{
            fontFamily:  'Space Mono, monospace',
            fontSize:    8,
            fontWeight:  700,
            color:       '#FFFFFF',
            background:  '#1A1A1A',
            padding:     '1px 4px',
            borderRadius: 2,
            letterSpacing: '0.03em',
          }}>
            {arm.hand}
          </span>
        </div>
        <div style={{
          fontFamily: 'Fraunces, serif',
          fontSize:   12,
          fontWeight: 600,
          color:      '#1A1A1A',
          lineHeight: 1.2,
        }}>
          {lastName}
        </div>
        {arm.era !== null && (
          <div style={{
            fontFamily: 'Space Mono, monospace',
            fontSize:   9,
            color:      '#A3A3A3',
            marginTop:  2,
          }}>
            {arm.era.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Team row ────────────────────────────────────────────────────────── */

function TeamRow({ data }: { data: BullpenData }) {
  // Sort: rest_day → limited → full_go, then by total pitches desc within group
  const sorted = [...data.arms].sort((a, b) => {
    const order = { rest_day: 0, limited: 1, full_go: 2 }
    const diff  = order[getAvailability(a)] - order[getAvailability(b)]
    if (diff !== 0) return diff
    const aTotal = a.days.reduce((s, d) => s + d.pitches, 0)
    const bTotal = b.days.reduce((s, d) => s + d.pitches, 0)
    return bTotal - aTotal
  })

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Team label */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        marginBottom: 16,
      }}>
        <span style={{
          fontFamily:    'Space Mono, monospace',
          fontSize:      9,
          color:         '#FF5722',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          § {data.team_name} Bullpen
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.08)' }} />
      </div>

      {/* Horizontal scroll row */}
      <div style={{
        overflowX:  'auto',
        paddingBottom: 8,
        // Hide scrollbar visually but keep functional
        msOverflowStyle: 'none' as any,
        scrollbarWidth:  'none' as any,
      }}>
        <div style={{
          display: 'flex',
          gap:     16,
          width:   'max-content',
          padding: '4px 2px',
        }}>
          {sorted.map(arm => (
            <ArmColumn key={arm.player_id} arm={arm} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Legend ──────────────────────────────────────────────────────────── */

function Legend() {
  return (
    <div style={{
      display:       'flex',
      gap:           20,
      flexWrap:      'wrap',
      alignItems:    'center',
      marginBottom:  24,
      padding:       '10px 14px',
      background:    '#F5F1E8',
      borderRadius:  6,
    }}>
      <span style={{
        fontFamily:    'Space Mono, monospace',
        fontSize:      9,
        color:         '#A3A3A3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Pitches thrown:
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 14, height: 14, background: '#FF5722', borderRadius: 2 }} />
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#6B6B6B' }}>Last 3 days</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 14, height: 14, borderRadius: 2,
          background: 'linear-gradient(to right, #FF5722 50%, rgba(255,255,255,0.55) 50%)',
          border: '1px solid #E8E3DC',
        }} />
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#6B6B6B' }}>Yesterday (subset)</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        {(['full_go', 'limited', 'rest_day'] as Availability[]).map(a => (
          <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS[a].dot }} />
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#6B6B6B' }}>{STATUS[a].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Paywall ─────────────────────────────────────────────────────────── */

function BullpenPaywall() {
  return (
    <div style={{
      textAlign:    'center',
      padding:      '48px 24px',
      background:   '#FAF8F3',
      borderRadius: 10,
      border:       '1px dashed rgba(26,26,26,0.15)',
    }}>
      <div style={{
        fontFamily:    'Space Mono, monospace',
        fontSize:      10,
        color:         '#FF5722',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom:  12,
      }}>
        ⊕ Pro Feature
      </div>
      <p style={{
        fontFamily:   'Fraunces, serif',
        fontSize:     16,
        color:        '#1A1A1A',
        marginBottom: 6,
        lineHeight:   1.5,
      }}>
        Bullpen availability — who's actually ready tonight
      </p>
      <p style={{
        fontFamily:   'system-ui, sans-serif',
        fontSize:     13,
        color:        '#6B6B6B',
        margin:       '0 auto 24px',
        maxWidth:     340,
        lineHeight:   1.6,
      }}>
        Pitch load for every reliever over the last 3 days. Know before first pitch which arms are rested and which manager is going to the next man down.
      </p>
      <Link
        href="/pro"
        style={{
          display:        'inline-block',
          background:     '#FF5722',
          color:          '#FFFFFF',
          fontFamily:     'Space Mono, monospace',
          fontSize:       11,
          fontWeight:     700,
          padding:        '10px 22px',
          borderRadius:   6,
          textDecoration: 'none',
          letterSpacing:  '0.05em',
          textTransform:  'uppercase',
        }}
      >
        Unlock Pro →
      </Link>
    </div>
  )
}

/* ── Main export ─────────────────────────────────────────────────────── */

export default function BullpenPanel({
  home,
  away,
  isPro,
}: {
  home:  BullpenData | null
  away:  BullpenData | null
  isPro: boolean
}) {
  if (!isPro) return <BullpenPaywall />

  const hasData = (home?.arms.length ?? 0) > 0 || (away?.arms.length ?? 0) > 0

  if (!hasData) {
    return (
      <div style={{
        textAlign:  'center',
        padding:    '48px 24px',
        color:      '#A3A3A3',
        fontFamily: 'Space Mono, monospace',
        fontSize:   11,
      }}>
        Bullpen data not yet available — check back closer to first pitch.
      </div>
    )
  }

  return (
    <div>
      <Legend />
      {away && away.arms.length > 0 && <TeamRow data={away} />}
      {home && home.arms.length > 0 && <TeamRow data={home} />}
      <p style={{
        fontFamily: 'Space Mono, monospace',
        fontSize:   9,
        color:      '#C4BDB7',
        textAlign:  'center',
        marginTop:  8,
        lineHeight: 1.6,
      }}>
        Pitch counts from MLB Stats API. Availability is model-based — actual manager decisions may vary.
      </p>
    </div>
  )
}