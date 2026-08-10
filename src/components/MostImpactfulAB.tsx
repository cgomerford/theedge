'use client'

// src/components/MostImpactfulAB.tsx
//
// Single hero card for the game's highest-leverage at-bat. Score is a
// heuristic (see computeImpactScore in lib/postgame.ts) — not true WPA —
// labeled honestly in the footnote rather than presented as more precise
// than it is.

import type { ImpactfulAtBat } from '@/lib/postgame'

type Props = {
  ab: ImpactfulAtBat | null
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}

export default function MostImpactfulAB({ ab, awayAbbr, homeAbbr, awayColor, homeColor }: Props) {
  if (!ab) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-center font-mono text-[10px] text-stone-400">
        No impactful at-bat data available
      </div>
    )
  }

  const battingAway = ab.half === 'top'
  const color = battingAway ? awayColor : homeColor

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Most impactful at-bat</span>
      </div>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="leading-none text-stone-900"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', letterSpacing: '0.02em' }}
          >
            {ab.batterName}
          </span>
          <span className="font-mono text-[10px] text-stone-400">vs {ab.pitcherName}</span>
        </div>
        <p className="text-[13px] text-stone-700 leading-snug">{ab.description}</p>
        <div className="flex items-center gap-3 pt-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">
            {ab.inning}{ab.half === 'top' ? '▲' : '▼'} · {ab.rbi} RBI
          </span>
          <span className="font-mono text-[10px] text-stone-400">
            {awayAbbr} {ab.scoreAfter.away} – {homeAbbr} {ab.scoreAfter.home}
          </span>
        </div>
      </div>
      <div className="px-4 pb-3">
        <p className="font-mono text-[9px] text-stone-300">
          Ranked by a leverage heuristic (RBI, inning, outs) — not a full win-probability model.
        </p>
      </div>
    </div>
  )
}
