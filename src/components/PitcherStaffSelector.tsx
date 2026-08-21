// src/components/PitcherStaffSelector.tsx
'use client'

// Wraps PostGamePitcherArsenalCard with a pitcher picker — defaults to
// the SP (role === 'SP' from deriveRoles), lets the user switch to any
// RP who threw a pitch to see the exact same arsenal/movement/location
// breakdown for that reliever's outing. No new chart logic — this is
// purely selection state on top of the existing card.

import { useState } from 'react'
import type { PitcherGameLine, PitchRecord } from '@/types/postgame'
import type { RoledPitcher } from './PitcherBoxScoreCard'
import PostGamePitcherArsenalCard from './PostGamePitcherArsenalCard'

function mlbHeadshot(pitcherId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:best/v1/people/${pitcherId}/headshot/silo/current`
}

type Props = {
  pitchers: RoledPitcher[]   // one team's SP + RPs, from deriveRoles()
  pitchLog: PitchRecord[]
  teamColor: string
}

export default function PitcherStaffSelector({ pitchers, pitchLog, teamColor }: Props) {
  const sp = pitchers.find(p => p.role === 'SP')
  const [selectedId, setSelectedId] = useState<number | null>(sp?.pitcherId ?? pitchers[0]?.pitcherId ?? null)

  const selected = pitchers.find(p => p.pitcherId === selectedId) ?? sp ?? pitchers[0]

  if (!selected) {
    return <p className="text-xs font-serif italic text-stone-400 p-4">No pitching data available.</p>
  }

  const selectedPitches = pitchLog.filter(p => p.pitcherId === selected.pitcherId)

  return (
    <div>
      {/* Pitcher pills — SP first, then RPs in appearance order (deriveRoles already sorts this way) */}
      {pitchers.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
          {pitchers.map(p => (
            <button
              key={p.pitcherId}
              onClick={() => setSelectedId(p.pitcherId)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shrink-0 transition ${
                selected.pitcherId === p.pitcherId
                  ? 'text-white border-transparent'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
              }`}
              style={selected.pitcherId === p.pitcherId ? { background: teamColor } : undefined}
            >
              <img
                src={mlbHeadshot(p.pitcherId)}
                alt=""
                className="w-5 h-5 rounded-full object-cover bg-white"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
              />
              <span className="text-[11px] font-serif whitespace-nowrap">
                {p.pitcherName.split(' ').slice(-1)[0]}
              </span>
              <span className={`text-[8px] font-mono uppercase font-bold ${selected.pitcherId === p.pitcherId ? 'text-white/70' : 'text-stone-400'}`}>
                {p.role}
              </span>
            </button>
          ))}
        </div>
      )}

      <PostGamePitcherArsenalCard pitcher={selected} pitches={selectedPitches} teamColor={teamColor} />
    </div>
  )
}