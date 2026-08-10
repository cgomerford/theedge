'use client'

// src/components/PostGameSprayChart.tsx
//
// Same visual language as LineupSprayChart (used in the Scout Report for
// season-aggregate spray density), but plots THIS game's actual batted-ball
// locations from MLB Gameday hit coordinates (hitData.coordinates on the
// live feed — coordX/coordY are on Gameday's 250x250 field-diagram grid,
// home plate at roughly (125, 205), outfield wall toward y=0).
//
// Kept as its own component rather than repurposing LineupSprayChart
// because the input shape and meaning are different (individual real
// events tonight vs. an aggregated season density field) — if
// LineupSprayChart's internals turn out to already support point-plotting
// mode, this can likely be slimmed down to a thin wrapper. Send that file
// over and I'll check.

import type { SprayHit } from '@/lib/postgame'

const FIELD_SIZE = 250
const HOME_X = 125
const HOME_Y = 205

const OUTCOME_COLOR: Record<string, string> = {
  home_run: '#dc2626',
  triple: '#f97316',
  double: '#eab308',
  single: '#22c55e',
  field_out: '#a8a29e',
  strikeout: '#e7e5e4',
  groundout: '#a8a29e',
  flyout: '#a8a29e',
}

function colorFor(outcome: string): string {
  const key = outcome.toLowerCase().replace(/\s+/g, '_')
  return OUTCOME_COLOR[key] ?? '#a8a29e'
}

type Props = {
  teamAbbr: string
  teamName: string
  color: string
  hits: SprayHit[]
}

export default function PostGameSprayChart({ teamAbbr, teamName, color, hits }: Props) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{teamAbbr} spray chart</span>
        <span className="font-mono text-[9.5px] text-stone-400">{hits.length} balls in play</span>
      </div>
      <div className="p-3">
        <svg viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`} className="w-full aspect-square">
          {/* field wedge */}
          <path
            d={`M ${HOME_X} ${HOME_Y} L 10 40 A 163 163 0 0 1 240 40 Z`}
            fill="#f5f5f4"
            stroke="#e7e5e4"
            strokeWidth={1}
          />
          {/* foul lines */}
          <line x1={HOME_X} y1={HOME_Y} x2={10} y2={40} stroke="#d6d3d1" strokeWidth={1} />
          <line x1={HOME_X} y1={HOME_Y} x2={240} y2={40} stroke="#d6d3d1" strokeWidth={1} />
          {/* infield diamond */}
          <path
            d={`M ${HOME_X} ${HOME_Y} L ${HOME_X - 40} ${HOME_Y - 40} L ${HOME_X} ${HOME_Y - 80} L ${HOME_X + 40} ${HOME_Y - 40} Z`}
            fill="none"
            stroke="#d6d3d1"
            strokeWidth={1}
          />
          {hits.map((h, i) => (
            <circle
              key={i}
              cx={h.coordX}
              cy={h.coordY}
              r={h.launchSpeed && h.launchSpeed > 100 ? 4.5 : 3.2}
              fill={colorFor(h.outcome)}
              stroke="#fff"
              strokeWidth={0.75}
              opacity={0.9}
            >
              <title>{`${h.playerName} · ${h.outcome} · inning ${h.inning}${h.launchSpeed ? ` · ${h.launchSpeed.toFixed(1)} mph` : ''}`}</title>
            </circle>
          ))}
        </svg>
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
          {['home_run', 'triple', 'double', 'single', 'field_out'].map(k => (
            <div key={k} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: OUTCOME_COLOR[k] }} />
              <span className="font-mono text-[9px] text-stone-400 capitalize">{k.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
