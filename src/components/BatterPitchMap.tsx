// src/components/BatterPitchMap.tsx
'use client'

// Batter equivalent of the pitcher arsenal card's location chart — same
// real pX/pZ scatter, catcher's-eye view, fixed strike-zone box. Colored
// by OUTCOME (ball/called strike/swinging strike/foul/in play) rather
// than by pitch type, since for a batter the useful question is "what
// happened on pitches in this location," not which pitch type it was.

import type { BatterGameZones } from '@/lib/postgame'

const OUTCOME_COLOR: Record<string, string> = {
  ball: '#a8a29e',
  called_strike: '#0ea5e9',
  swinging_strike: '#dc2626',
  foul: '#93c5fd',
  single: '#22c55e',
  double: '#eab308',
  triple: '#f97316',
  home_run: '#9333ea',
  in_play_out: '#57534e',
  in_play: '#3b82f6', // fallback only — shouldn't normally appear now
  other: '#d6d3d1',
}

const OUTCOME_LABEL: Record<string, string> = {
  ball: 'Ball',
  called_strike: 'Called strike',
  swinging_strike: 'Swing & miss',
  foul: 'Foul',
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  home_run: 'Home run',
  in_play_out: 'Out',
  in_play: 'In play (unmatched)',
  other: 'Other',
}

export default function BatterPitchMap({ zones, teamColor }: { zones: BatterGameZones; teamColor: string }) {
  const plotted = zones.pitches.filter(p => p.pX != null && p.pZ != null)

  if (plotted.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 font-serif italic text-sm">
        No pitch location data available.
      </div>
    )
  }

  const SIZE = 300
  const X_RANGE = 2.5
  const Y_MIN = 0.5
  const Y_MAX = 4.5
  const toX = (x: number) => SIZE / 2 + (x / X_RANGE) * (SIZE / 2 - 16)
  const toY = (z: number) => SIZE - ((z - Y_MIN) / (Y_MAX - Y_MIN)) * SIZE

  const usedOutcomes = Array.from(new Set(plotted.map(p => p.outcome)))

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden" style={{ borderLeft: `3px solid ${teamColor}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{zones.teamAbbr} pitch map</span>
        <span className="font-mono text-[9.5px] text-stone-400">{plotted.length} pitches</span>
      </div>

      <div className="p-3">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[320px] mx-auto">
          {/* Fixed strike zone box — same proportion as pitcher card */}
          <rect x={SIZE * 0.3} y={SIZE * 0.25} width={SIZE * 0.4} height={SIZE * 0.5} fill="none" stroke="#78716c60" strokeWidth={1.5} />

          {plotted.map((p, i) => (
            <circle
              key={i}
              cx={toX(p.pX!)}
              cy={toY(p.pZ!)}
              r={6}
              fill={OUTCOME_COLOR[p.outcome] ?? OUTCOME_COLOR.other}
              fillOpacity={0.75}
              stroke="#fff"
              strokeWidth={1}
            >
              <title>{OUTCOME_LABEL[p.outcome] ?? 'Pitch'}</title>
            </circle>
          ))}
        </svg>

        <p className="text-center font-mono text-[10px] text-stone-400 mt-1">Catcher's-eye view</p>

        {/* Key — only shows outcomes actually present in this batter's pitches */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-3 pt-3 border-t border-stone-100">
          {usedOutcomes.map(o => (
            <div key={o} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: OUTCOME_COLOR[o] ?? OUTCOME_COLOR.other }} />
              <span className="font-mono text-[9px] text-stone-500">{OUTCOME_LABEL[o] ?? o}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}