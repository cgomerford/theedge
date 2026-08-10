'use client'

// src/components/PitchLocationChart.tsx
//
// Compact strike-zone scatter for PlayerPitchHover's hover tooltip — every
// pitch this batter saw in the current series, plotted at its real
// plate_x/plate_z location, colored by outcome.
//
// 2026-08-09: this file previously contained a stray copy of
// PitchLocationCard.tsx (the Scout Report's season-aggregate hot-zone
// card) — wrong component entirely. This is the real, intended component:
// a lightweight per-pitch scatter built from series-pitches.ts's
// PitchRecord[].
//
// Strike zone box uses this batter's own actual sz_top/sz_bot, averaged
// across their pitches in the window — a real per-batter zone, not a
// league-average placeholder.
//
// Also 2026-08-09: added a pitch-type breakdown below the outcome legend
// — dots stay colored by OUTCOME (ball/strike/foul/in-play), since that's
// the more visually useful thing to scan at a glance in a small scatter;
// pitch TYPE (4-seam, slider, etc.) is listed as counts underneath
// instead of double-encoding it into dot color/shape, which would clutter
// a chart this small.

import type { PitchRecord } from '@/lib/series-pitches'

type Props = {
  pitches: PitchRecord[]
}

// Standard home plate width is 17 inches; half-width in feet for the
// strike zone box.
const PLATE_HALF_WIDTH_FT = 0.708

// Typical MLB strike zone bounds — used only if a batter's own sz_top/
// sz_bot can't be computed from their pitch set.
const FALLBACK_SZ_TOP = 3.5
const FALLBACK_SZ_BOT = 1.5

const VB_W = 160
const VB_H = 190
const X_MIN = -2.2, X_MAX = 2.2   // feet, catcher's view
const Z_MIN = 0, Z_MAX = 5        // feet, ground to well above the zone

function toSVG(x: number, z: number): { sx: number; sy: number } {
  const sx = ((x - X_MIN) / (X_MAX - X_MIN)) * VB_W
  const sy = VB_H - ((z - Z_MIN) / (Z_MAX - Z_MIN)) * VB_H
  return { sx, sy }
}

type OutcomeGroup = 'whiff' | 'called_strike' | 'foul' | 'in_play' | 'ball' | 'other'

function classifyDescription(description: string): OutcomeGroup {
  const d = description.toLowerCase()
  if (d.includes('swinging_strike')) return 'whiff'
  if (d === 'called_strike') return 'called_strike'
  if (d === 'foul' || d.startsWith('foul')) return 'foul'
  if (d === 'hit_into_play') return 'in_play'
  if (d === 'ball' || d === 'blocked_ball' || d === 'pitchout') return 'ball'
  return 'other'
}

const OUTCOME_COLOR: Record<OutcomeGroup, string> = {
  whiff:         '#DC2626', // red — swing and miss
  called_strike: '#F97316', // orange — took a strike
  foul:          '#EAB308', // yellow
  in_play:       '#16A34A', // green — real contact
  ball:          '#3B82F6', // blue
  other:         'rgba(120,113,108,0.4)',
}

export default function PitchLocationChart({ pitches }: Props) {
  if (pitches.length === 0) {
    return (
      <div className="w-[150px] py-6 text-center">
        <p className="text-[10px] font-serif italic text-stone-400">No pitch data for this series.</p>
      </div>
    )
  }

  const szBounds = pitches.filter(p => p.szTop != null && p.szBot != null)
  const avgSzTop = szBounds.length > 0
    ? szBounds.reduce((s, p) => s + (p.szTop as number), 0) / szBounds.length
    : FALLBACK_SZ_TOP
  const avgSzBot = szBounds.length > 0
    ? szBounds.reduce((s, p) => s + (p.szBot as number), 0) / szBounds.length
    : FALLBACK_SZ_BOT

  const zoneTopLeft = toSVG(-PLATE_HALF_WIDTH_FT, avgSzTop)
  const zoneBotRight = toSVG(PLATE_HALF_WIDTH_FT, avgSzBot)

  const counts: Record<OutcomeGroup, number> = { whiff: 0, called_strike: 0, foul: 0, in_play: 0, ball: 0, other: 0 }
  for (const p of pitches) counts[classifyDescription(p.description)]++

  // Pitch-type breakdown — grouped by pitchName (falls back to pitchType
  // if the name is missing), sorted most-thrown first.
  const typeCounts = new Map<string, number>()
  for (const p of pitches) {
    const label = p.pitchName || p.pitchType || 'Unknown'
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
  }
  const sortedTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div className="w-[150px]">
      <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
        {/* Strike zone box, sized to this batter's own average sz_top/sz_bot */}
        <rect
          x={zoneTopLeft.sx}
          y={zoneTopLeft.sy}
          width={zoneBotRight.sx - zoneTopLeft.sx}
          height={zoneBotRight.sy - zoneTopLeft.sy}
          fill="none"
          stroke="#78716c"
          strokeWidth={1.5}
          opacity={0.6}
        />
        {pitches.map((p, i) => {
          if (p.plateX == null || p.plateZ == null) return null
          const { sx, sy } = toSVG(p.plateX, p.plateZ)
          const group = classifyDescription(p.description)
          return (
            <circle
              key={i}
              cx={sx}
              cy={sy}
              r={group === 'in_play' || group === 'whiff' ? 3 : 2.3}
              fill={OUTCOME_COLOR[group]}
              opacity={0.85}
            />
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center mt-1.5">
        {(['in_play', 'whiff', 'called_strike', 'foul', 'ball'] as OutcomeGroup[])
          .filter(g => counts[g] > 0)
          .map(g => (
            <div key={g} className="flex items-center gap-1">
              <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: OUTCOME_COLOR[g] }} />
              <span className="font-mono text-[8px] text-stone-400">{counts[g]}</span>
            </div>
          ))}
      </div>

      {/* Pitch-type breakdown — separate from the outcome legend above,
          since a pitch's TYPE (fastball, slider...) and its OUTCOME
          (ball, whiff...) are independent facts about it. */}
      <div className="mt-1.5 pt-1.5 border-t border-stone-100">
        {sortedTypes.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="font-mono text-[8px] text-stone-500 truncate">{name}</span>
            <span className="font-mono text-[8px] text-stone-400 flex-shrink-0 ml-1">{count}</span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[8px] text-stone-400 text-center mt-1.5">{pitches.length} pitches</p>
    </div>
  )
}