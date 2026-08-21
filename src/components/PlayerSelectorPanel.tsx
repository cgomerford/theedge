// src/components/PlayerSelectorPanel.tsx
'use client'

// Generic "defaults to best performer" selector — used for both the
// home and away batter boxes in the main report page. Not reused for
// pitchers: there are only ever two starters, no selection needed there.

import { useState } from 'react'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { TeamBatterOption } from '@/lib/postgame-report'
import BattingSummaryRow from '@/components/BattingSummaryRow'
import BatterBattedBallSequence from '@/components/BatterBattedBallSequence'
import BatterSeasonTrendPanel from '@/components/BatterSeasonTrendPanel'

export default function PlayerSelectorPanel({
  options,
  defaultBatterId,
  teamAbbr,
}: {
  options: TeamBatterOption[]
  defaultBatterId: number | null
  teamAbbr: string
}) {
  const [selectedId, setSelectedId] = useState<number | null>(defaultBatterId)
  const selected = options.find(o => o.batterId === selectedId) ?? options[0] ?? null

  if (options.length === 0) {
    return <div className="text-center text-stone-400 font-serif italic text-sm py-8">No batter data for {teamAbbr}.</div>
  }

  return (
    <div className="space-y-4">
      {/* Player pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map(o => (
          <button
            key={o.batterId}
            onClick={() => setSelectedId(o.batterId)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0 transition ${
              selected?.batterId === o.batterId
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400'
            }`}
          >
            <img src={playerHeadshotUrl(o.batterId)} alt="" className="w-5 h-5 rounded-full object-cover" />
            <span className="text-xs font-serif whitespace-nowrap">{o.batterName}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-4">
          <BattingSummaryRow summary={selected.summary} />
          <BatterSeasonTrendPanel summary={selected.summary} playerId={selected.batterId} />
          <BatterBattedBallSequence summary={selected.summary} />
        </div>
      )}
    </div>
  )
}