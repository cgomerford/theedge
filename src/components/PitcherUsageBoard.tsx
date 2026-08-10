'use client'

// src/components/PitcherUsageBoard.tsx
//
// "Which pitchers were worked" board — one row per pitcher who appeared,
// grouped by team, showing pitch count, batters faced, and which innings
// they covered. Compact table, matches NotesCard/SignalRow density.

import { playerHeadshotUrl } from '@/lib/mlb'
import type { PitcherUsageEntry } from '@/lib/postgame'

function formatInnings(innings: number[]): string {
  if (innings.length === 0) return '—'
  const sorted = [...innings].sort((a, b) => a - b)
  // collapse consecutive runs, e.g. [1,2,3,7] -> "1-3, 7"
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    if (cur !== undefined) { start = cur; prev = cur }
  }
  return parts.join(', ')
}

function PitcherRow({ p }: { p: PitcherUsageEntry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-50 last:border-0">
      <img
        src={playerHeadshotUrl(p.playerId, 60)}
        alt={p.playerName}
        className="w-7 h-7 rounded-full object-cover border border-stone-200 flex-shrink-0 bg-white"
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[12.5px] font-semibold text-stone-800 truncate block whitespace-nowrap overflow-hidden text-ellipsis">{p.playerName}</span>
        <span className="font-mono text-[9px] text-stone-400 whitespace-nowrap">Inn {formatInnings(p.inningsAppeared)}</span>
      </div>
      <div className="text-right flex-shrink-0" style={{ minWidth: 52 }}>
        <div className="font-mono text-[12px] font-bold text-stone-900 whitespace-nowrap">{p.pitchCount}p</div>
        <div className="font-mono text-[9px] text-stone-400 whitespace-nowrap">{p.battersFaced} BF</div>
      </div>
    </div>
  )
}

type Props = {
  usage: PitcherUsageEntry[]
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}

export default function PitcherUsageBoard({ usage, awayAbbr, homeAbbr, awayColor, homeColor }: Props) {
  const away = usage.filter(p => p.teamAbbr === awayAbbr).sort((a, b) => (a.inningsAppeared[0] ?? 99) - (b.inningsAppeared[0] ?? 99))
  const home = usage.filter(p => p.teamAbbr === homeAbbr).sort((a, b) => (a.inningsAppeared[0] ?? 99) - (b.inningsAppeared[0] ?? 99))

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${awayColor}` }}>
        <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{awayAbbr} pitchers worked</span>
        </div>
        {away.length > 0 ? away.map(p => <PitcherRow key={p.playerId} p={p} />) : (
          <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No data</div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${homeColor}` }}>
        <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{homeAbbr} pitchers worked</span>
        </div>
        {home.length > 0 ? home.map(p => <PitcherRow key={p.playerId} p={p} />) : (
          <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No data</div>
        )}
      </div>
    </div>
  )
}