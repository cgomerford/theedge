'use client'

// src/components/LineupSprayChart.tsx
//
// Combined-lineup spray chart for Scout Report — every confirmed batter's
// balls in play for the season, plotted as individual dots colored by
// outcome (red = HR, orange = triple, yellow = double, blue = single,
// grey = out), same visual language as the single-player SprayChart.tsx
// on the Batting tab, just combined across the whole lineup instead of
// one player.
//
// 2026-08-09: switched from a density heatmap (single team-color blob,
// darker = more balls in that cell) to per-outcome dots. Density showed
// WHERE the lineup collectively hits the ball; this shows WHAT KIND of
// contact happens where — genuinely different information, not just a
// restyle. Outs render first/smallest/most transparent so they sit as a
// backdrop rather than drowning out the rarer, more important outcomes
// (HR/3B/2B), which render last and on top.
//
// Deliberately not shared with the existing SprayChart component used on
// the Batting tab — build-new-separate approved several rounds back for
// Scout Report visuals. Same architectural discipline (SVG, no external
// charting lib) as the other Scout Report components.
//
// Field coordinate transform: Statcast hc_x/hc_y have home plate at
// roughly (125, 200). Lower hc_y = deeper in the outfield (yes, really —
// it's an image-pixel-style origin, not cartesian). Transformed here so
// home plate sits at bottom-center of the SVG and the field extends up.

import type { BatterSpray, SprayPlay } from '@/lib/batter-spray'

type Props = {
  teamAbbr: string
  teamName: string
  color: string
  batters: BatterSpray[]   // batters that HAVE data (may be < full lineup)
  lineupSize: number       // full confirmed lineup count, for honest sample framing
}

// SVG canvas — home plate at bottom center, field fans up.
const VB_W = 500
const VB_H = 500
const HOME_X = 250
const HOME_Y = 460
const FIELD_SCALE = 2.4

function statcastToSVG(x: number, y: number): { sx: number; sy: number } {
  const sx = HOME_X + (x - 125) * FIELD_SCALE
  const sy = HOME_Y - (200 - y) * FIELD_SCALE
  return { sx, sy }
}

type OutcomeGroup = 'hr' | 'triple' | 'double' | 'single' | 'out'

function classifyOutcome(ev: string | null): OutcomeGroup {
  if (ev === 'home_run') return 'hr'
  if (ev === 'triple') return 'triple'
  if (ev === 'double') return 'double'
  if (ev === 'single') return 'single'
  return 'out'
}

const OUTCOME_COLOR: Record<OutcomeGroup, string> = {
  hr:     '#DC2626', // red
  triple: '#F97316', // orange
  double: '#EAB308', // yellow
  single: '#3B82F6', // blue
  out:    'rgba(120,113,108,0.28)', // grey, translucent — backdrop, not a focal point
}

const OUTCOME_RADIUS: Record<OutcomeGroup, number> = {
  hr:     4.5,
  triple: 4,
  double: 3.2,
  single: 2.6,
  out:    2,
}

const OUTCOME_LABEL: Record<OutcomeGroup, string> = {
  hr: 'Home run', triple: 'Triple', double: 'Double', single: 'Single', out: 'Out',
}

// Draw order matters — outs first (backdrop), rarer/bigger outcomes last
// (on top), so a home run cluster is never hidden under a mass of outs.
const DRAW_ORDER: OutcomeGroup[] = ['out', 'single', 'double', 'triple', 'hr']

// Field overlay — foul lines, wall arc, infield diamond, home plate.
// Coordinates hand-tuned to match the field scale above (not derived from
// statcastToSVG — the overlay is a stylised diagram, not real coordinates).
function FieldOverlay() {
  return (
    <g stroke="#78716c" strokeWidth={1.5} fill="none" opacity={0.55}>
      {/* Foul lines from home plate to LF/RF wall corners */}
      <line x1={HOME_X} y1={HOME_Y} x2={80} y2={180} />
      <line x1={HOME_X} y1={HOME_Y} x2={420} y2={180} />
      {/* Outfield wall — quadratic curve through center */}
      <path d="M 80 180 Q 250 20 420 180" />
      {/* Infield diamond, dashed so it recedes visually */}
      <path d="M 250 460 L 310 400 L 250 340 L 190 400 Z" strokeDasharray="3,3" opacity={0.4} />
      {/* Home plate marker */}
      <circle cx={HOME_X} cy={HOME_Y} r={3} fill="#292524" opacity={0.9} />
    </g>
  )
}

export default function LineupSprayChart({ teamAbbr, teamName, color, batters, lineupSize }: Props) {
  const allPlays = batters.flatMap(b => b.plays)
  const totalPlays = allPlays.length

  if (totalPlays === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center" style={{ borderTop: `3px solid ${color}` }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{teamAbbr} · Spray</p>
        <p className="text-sm font-serif italic text-stone-400">No spray data for this lineup yet.</p>
      </div>
    )
  }

  const byOutcome: Record<OutcomeGroup, SprayPlay[]> = { hr: [], triple: [], double: [], single: [], out: [] }
  for (const p of allPlays) {
    byOutcome[classifyOutcome(p.ev)].push(p)
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div
        className="px-4 py-2.5 border-b border-stone-100"
        style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}
      >
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
          {teamName} · Spray by outcome
        </p>
      </div>
      <div className="p-3">
        <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
          {DRAW_ORDER.map(group =>
            byOutcome[group].map((p, i) => {
              const { sx, sy } = statcastToSVG(p.x, p.y)
              if (sx < 0 || sx >= VB_W || sy < 0 || sy >= VB_H) return null
              return (
                <circle
                  key={`${group}-${i}`}
                  cx={sx}
                  cy={sy}
                  r={OUTCOME_RADIUS[group]}
                  fill={OUTCOME_COLOR[group]}
                  opacity={group === 'out' ? 1 : 0.85}
                />
              )
            })
          )}
          <FieldOverlay />
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
          {DRAW_ORDER.slice().reverse().map(group => (
            <div key={group} className="flex items-center gap-1.5">
              <span
                className="rounded-full flex-shrink-0"
                style={{ width: 8, height: 8, background: OUTCOME_COLOR[group] }}
              />
              <span className="font-mono text-[9px] text-stone-400">
                {OUTCOME_LABEL[group]} · {byOutcome[group].length.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[9px] font-mono text-center text-stone-400 mt-2">
          {totalPlays.toLocaleString()} balls in play · {batters.length}/{lineupSize} confirmed batters w/ data
        </p>
      </div>
    </div>
  )
}