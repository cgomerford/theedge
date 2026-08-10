'use client'

// src/components/PlateDisciplineBoard.tsx
//
// Two small pieces: "most patient batters" (total pitches seen this
// game, not just one AB) and the single longest individual at-bat by
// pitch count, with which inning it happened in and how it ended.

import { playerHeadshotUrl } from '@/lib/mlb'
import type { PatientBatterEntry, LongestAtBat } from '@/lib/postgame'

function PatientRow({ entry, rank }: { entry: PatientBatterEntry; rank: number }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-stone-50 last:border-0">
      <span className="w-4 text-right text-stone-300 font-bold leading-none flex-shrink-0" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem' }}>
        {rank}
      </span>
      <img
        src={playerHeadshotUrl(entry.playerId, 60)}
        alt={entry.playerName}
        className="w-7 h-7 rounded-full object-cover border border-stone-200 flex-shrink-0 bg-white"
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-semibold text-stone-800 truncate block">{entry.playerName}</span>
        <p className="font-mono text-[9.5px] text-stone-400 truncate">{entry.context}</p>
      </div>
      <span className="font-mono text-[12px] font-bold text-stone-900 flex-shrink-0">{entry.displayValue}</span>
    </div>
  )
}

export function PatientBattersBoard({ batters }: { batters: PatientBatterEntry[] }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Most patient batters</span>
      </div>
      {batters.length > 0 ? (
        batters.map((b, i) => <PatientRow key={b.playerId} entry={b} rank={i + 1} />)
      ) : (
        <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No data</div>
      )}
    </div>
  )
}

export function LongestAtBatCard({ ab }: { ab: LongestAtBat | null }) {
  if (!ab) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-center font-mono text-[10px] text-stone-400">
        No at-bat data available
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Longest at-bat</span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline gap-2">
          <span className="leading-none text-stone-900" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.2rem', letterSpacing: '0.02em' }}>
            {ab.batterName}
          </span>
          <span className="font-mono text-[10px] text-stone-400">vs {ab.pitcherName}</span>
        </div>
        <p className="text-[12.5px] text-stone-700 leading-snug mt-1">{ab.outcome}</p>
        <div className="flex items-center gap-3 pt-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-600 font-bold">{ab.pitchCount} pitches</span>
          <span className="font-mono text-[10px] text-stone-400">Inn {ab.inning}{ab.half === 'top' ? '▲' : '▼'}</span>
        </div>
      </div>
    </div>
  )
}
