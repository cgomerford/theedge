'use client'

// src/components/InningPitchCountHeatmap.tsx
//
// Inning-by-inning pitch count shown as a heatmap strip — one row per team,
// one cell per inning, cell shading intensity scaled to pitch count within
// that team's own range (so a 25-pitch inning always reads "hot" even in a
// low-pitch-count game). Matches the flat-card, mono-label visual language
// used across ScoutReportTab.

import type { InningPitchCount } from '@/lib/postgame'

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16)
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]
}

function Cell({ value, max, color }: { value: number; max: number; color: string }) {
  const intensity = max > 0 ? Math.max(0.08, value / max) : 0.08
  const [r, g, b] = hexToRgb(color)
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center rounded-md py-2 min-w-0"
      style={{ background: `rgba(${r},${g},${b},${intensity})` }}
    >
      <span
        className="font-mono text-[13px] font-bold leading-none"
        style={{ color: intensity > 0.55 ? '#fff' : '#292524' }}
      >
        {value}
      </span>
    </div>
  )
}

type Props = {
  data: InningPitchCount[]
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}

export default function InningPitchCountHeatmap({ data, awayAbbr, homeAbbr, awayColor, homeColor }: Props) {
  const maxAway = Math.max(1, ...data.map(d => d.awayPitches))
  const maxHome = Math.max(1, ...data.map(d => d.homePitches))
  const totalAway = data.reduce((s, d) => s + d.awayPitches, 0)
  const totalHome = data.reduce((s, d) => s + d.homePitches, 0)

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Pitches by inning</span>
        <span className="font-mono text-[9.5px] text-stone-400">{awayAbbr} {totalAway} · {homeAbbr} {totalHome}</span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-8 font-mono text-[10px] font-bold text-stone-500 flex-shrink-0">{awayAbbr}</span>
          {data.map(d => <Cell key={`a-${d.inning}`} value={d.awayPitches} max={maxAway} color={awayColor} />)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-8 font-mono text-[10px] font-bold text-stone-500 flex-shrink-0">{homeAbbr}</span>
          {data.map(d => <Cell key={`h-${d.inning}`} value={d.homePitches} max={maxHome} color={homeColor} />)}
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="w-8 flex-shrink-0" />
          {data.map(d => (
            <span key={`i-${d.inning}`} className="flex-1 text-center font-mono text-[9px] text-stone-400">{d.inning}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
