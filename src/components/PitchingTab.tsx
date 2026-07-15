'use client'

import { useState } from 'react'
import PitcherArsenalCard from '@/components/PitcherArsenalCard'
import PitchMovementChart from '@/components/PitchMovementChart'
import type { PitcherStatsFull, PitchMovementRow } from '@/lib/pitcher-full-stats'

type PitcherInfo = {
  id: number
  name: string
  abbr: string
  side: string
  fullStats: PitcherStatsFull | null
  movementRows: PitchMovementRow[]
}

export default function PitchingTab({
  awayPitcher, homePitcher,
}: {
  awayPitcher: PitcherInfo | null
  homePitcher: PitcherInfo | null
}) {
  const pitchers = [awayPitcher, homePitcher].filter((p): p is PitcherInfo => p !== null)
  const [selected, setSelected] = useState(0)

  if (pitchers.length === 0) {
    return <p className="text-sm font-serif italic text-stone-400 py-10 text-center">No probable pitchers announced yet.</p>
  }

  const pitcher = pitchers[selected]

  return (
    <div className="space-y-6">
      {pitchers.length > 1 && (
        <div className="flex gap-1 bg-stone-100 p-1 rounded-full w-fit">
          {pitchers.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setSelected(i)}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-widest rounded-full transition ${
                selected === i ? 'bg-[#1A1A1A] text-[#FAF8F3]' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <PitcherArsenalCard
        key={pitcher.id}
        pitcherId={pitcher.id}
        pitcherName={pitcher.name}
        abbr={pitcher.abbr}
        side={pitcher.side}
        fullStats={pitcher.fullStats}
        extra={<PitchMovementChart rows={pitcher.movementRows} />}
      />
    </div>
  )
}