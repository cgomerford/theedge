'use client'

// src/components/PitchLocationChart.tsx
//
// Compact strike-zone scatter for PlayerPitchHover's hover tooltip.
// Dots colored + sized by outcome so hits (especially HRs) pop hard.

import type { PitchRecord } from '@/lib/series-pitches'

type Props = {
  pitches: PitchRecord[]
}

const PLATE_HALF_WIDTH_FT = 0.708
const FALLBACK_SZ_TOP = 3.5
const FALLBACK_SZ_BOT = 1.5

const VB_W = 160
const VB_H = 190
const X_MIN = -2.2
const X_MAX = 2.2
const Z_MIN = 0
const Z_MAX = 5

function toSVG(x: number, z: number): { sx: number; sy: number } {
  const sx = ((x - X_MIN) / (X_MAX - X_MIN)) * VB_W
  const sy = VB_H - ((z - Z_MIN) / (Z_MAX - Z_MIN)) * VB_H
  return { sx, sy }
}

// ─── Outcome groups (priority order for visual hierarchy) ───────────────
type OutcomeGroup =
  | 'home_run'
  | 'hit'
  | 'in_play_out'
  | 'whiff'
  | 'called_strike'
  | 'foul'
  | 'ball'
  | 'other'

function classify(p: PitchRecord): OutcomeGroup {
  const desc = (p.description ?? '').toLowerCase()

  if (desc === 'home_run' || desc.includes('home_run') || desc.includes('homer')) {
    return 'home_run'
  }

 if (
    desc === 'single' ||
    desc === 'double' ||
    desc === 'triple' ||
    desc === 'ground_rule_double' ||
    desc.includes('in_play_no_out') ||
    desc.includes('in play, no out') ||
    desc.includes('in play, run')
  ) {
    return 'hit'
  }

  if (
    desc === 'hit_into_play' ||
    desc.includes('in_play') ||
    desc.includes('in play') ||
    desc.includes('out') ||
    desc === 'field_out' ||
    desc === 'force_out' ||
    desc === 'grounded_into_double_play' ||
    desc === 'double_play' ||
    desc === 'sac_fly' ||
    desc === 'sac_bunt'
  ) {
    return 'in_play_out'
  }

  if (desc.includes('swinging_strike') || desc.includes('missed_bunt')) return 'whiff'
  if (desc === 'called_strike') return 'called_strike'
  if (desc === 'foul' || desc.startsWith('foul')) return 'foul'
  if (
    desc === 'ball' ||
    desc === 'blocked_ball' ||
    desc === 'pitchout' ||
    desc === 'intent_ball' ||
    desc === 'hit_by_pitch'
  ) {
    return 'ball'
  }

  return 'other'
}

const OUTCOME_STYLE: Record<
  OutcomeGroup,
  { color: string; r: number; opacity: number; stroke?: string; strokeWidth?: number }
> = {
  home_run: {
    color: '#16A34A',
    r: 5.2,
    opacity: 1,
    stroke: '#14532d',
    strokeWidth: 1.4,
  },
  hit: {
    color: '#22C55E',
    r: 4.0,
    opacity: 0.95,
    stroke: '#166534',
    strokeWidth: 1.0,
  },
  in_play_out: {
    color: '#4ADE80',
    r: 2.8,
    opacity: 0.75,
  },
  whiff: {
    color: '#DC2626',
    r: 3.2,
    opacity: 0.9,
  },
  called_strike: {
    color: '#F97316',
    r: 2.5,
    opacity: 0.8,
  },
  foul: {
    color: '#EAB308',
    r: 2.4,
    opacity: 0.75,
  },
  ball: {
    color: '#3B82F6',
    r: 2.2,
    opacity: 0.65,
  },
  other: {
    color: 'rgba(120,113,108,0.45)',
    r: 2.0,
    opacity: 0.5,
  },
}

const LEGEND_ORDER: OutcomeGroup[] = [
  'home_run',
  'hit',
  'in_play_out',
  'whiff',
  'called_strike',
  'foul',
  'ball',
]

const LEGEND_LABEL: Record<OutcomeGroup, string> = {
  home_run: 'HR',
  hit: 'Hit',
  in_play_out: 'Out',
  whiff: 'Whiff',
  called_strike: 'Called',
  foul: 'Foul',
  ball: 'Ball',
  other: 'Other',
}

export default function PitchLocationChart({ pitches }: Props) {
  if (pitches.length === 0) {
    return (
      <div className="w-[150px] py-6 text-center">
        <p className="text-[10px] font-serif italic text-stone-400">
          No pitch data for this series.
        </p>
      </div>
    )
  }

  const szBounds = pitches.filter(p => p.szTop != null && p.szBot != null)
  const avgSzTop =
    szBounds.length > 0
      ? szBounds.reduce((s, p) => s + (p.szTop as number), 0) / szBounds.length
      : FALLBACK_SZ_TOP
  const avgSzBot =
    szBounds.length > 0
      ? szBounds.reduce((s, p) => s + (p.szBot as number), 0) / szBounds.length
      : FALLBACK_SZ_BOT

  const zoneTopLeft = toSVG(-PLATE_HALF_WIDTH_FT, avgSzTop)
  const zoneBotRight = toSVG(PLATE_HALF_WIDTH_FT, avgSzBot)

  const counts: Record<OutcomeGroup, number> = {
    home_run: 0,
    hit: 0,
    in_play_out: 0,
    whiff: 0,
    called_strike: 0,
    foul: 0,
    ball: 0,
    other: 0,
  }
  for (const p of pitches) counts[classify(p)]++

  const typeCounts = new Map<string, number>()
  for (const p of pitches) {
    const label = p.pitchName || p.pitchType || 'Unknown'
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1)
  }
  const sortedTypes = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])

  const sortedPitches = [...pitches].sort((a, b) => {
    const rank = (g: OutcomeGroup) =>
      g === 'home_run' ? 5 : g === 'hit' ? 4 : g === 'whiff' ? 3 : 1
    return rank(classify(a)) - rank(classify(b))
  })

  return (
    <div className="w-[150px]">
      <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
        <rect
          x={zoneTopLeft.sx}
          y={zoneTopLeft.sy}
          width={zoneBotRight.sx - zoneTopLeft.sx}
          height={zoneBotRight.sy - zoneTopLeft.sy}
          fill="none"
          stroke="#78716c"
          strokeWidth={1.5}
          opacity={0.55}
        />

        {sortedPitches.map((p, i) => {
          if (p.plateX == null || p.plateZ == null) return null
          const { sx, sy } = toSVG(p.plateX, p.plateZ)
          const group = classify(p)
          const style = OUTCOME_STYLE[group]

          return (
            <circle
              key={i}
              cx={sx}
              cy={sy}
              r={style.r}
              fill={style.color}
              opacity={style.opacity}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth ?? 0}
            />
          )
        })}
      </svg>

      {/* Outcome legend */}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center mt-1.5">
        {LEGEND_ORDER.filter(g => counts[g] > 0).map(g => (
          <div key={g} className="flex items-center gap-1">
            <span
              className="rounded-full flex-shrink-0"
              style={{
                width: g === 'home_run' ? 8 : g === 'hit' ? 7 : 6,
                height: g === 'home_run' ? 8 : g === 'hit' ? 7 : 6,
                background: OUTCOME_STYLE[g].color,
                border: OUTCOME_STYLE[g].stroke
                  ? `1.5px solid ${OUTCOME_STYLE[g].stroke}`
                  : undefined,
              }}
            />
            <span
              className={`font-mono text-[8px] ${
                g === 'home_run' || g === 'hit'
                  ? 'text-stone-800 font-semibold'
                  : 'text-stone-400'
              }`}
            >
              {LEGEND_LABEL[g]} {counts[g]}
            </span>
          </div>
        ))}
      </div>

      {/* Pitch-type counts */}
      <div className="mt-1.5 pt-1.5 border-t border-stone-100">
        {sortedTypes.map(([name, count]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="font-mono text-[8px] text-stone-500 truncate">{name}</span>
            <span className="font-mono text-[8px] text-stone-400 flex-shrink-0 ml-1">
              {count}
            </span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[8px] text-stone-400 text-center mt-1.5">
        {pitches.length} pitches
      </p>
    </div>
  )
}