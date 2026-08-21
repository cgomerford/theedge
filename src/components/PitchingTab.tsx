'use client'

// src/components/PitchingTab.tsx
//
// 2026-08-20 (later): swapped PitchSequencingCard (static season-aggregate
// display card) for PitchPredictorTool (interactive count → pitch → "what
// comes next" tool) in each pitcher's `extra` slot. Same countTendency /
// sequencing props, same data — this is a component swap, not a data
// change. PitchSequencingCard itself is untouched and still used
// elsewhere (Scout Report / Pro Lab); only this tab's usage changed.
//
// Earlier change, still in effect:
//   Initial pitcher selection respects a `?pitcher=away|home` URL param,
//   defaulting to 'away' when absent, so a future "view in Pitching Lab"
//   link from Scout Report can land on the specific pitcher clicked.

// 2026-08-20 (later): PitchPredictorTool and PitchSequencingCard now sit
// side by side (two-column grid, stacks to one column on mobile) instead
// of the predictor replacing the card outright — different jobs: the
// card is a read-only season-aggregate reference (by-count grid + "what
// comes next" flow), the tool is the interactive tap-through predictor.
// Keeping both means you can cross-check the tool's answer against the
// full reference data next to it.

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PitcherArsenalCard from '@/components/PitcherArsenalCard'
import PitchMovementChart from '@/components/PitchMovementChart'
import PitchPredictorTool from '@/components/PitchPredictorTool'
import PitchSequencingCard from '@/components/PitchSequencingCard'
import type { PitcherStatsFull, PitchMovementRow } from '@/lib/pitcher-full-stats'
import type { PitcherCountTendency, PitcherPitchSequencing } from '@/lib/pitcher-sequencing'

type PitcherInfo = {
  id: number
  name: string
  abbr: string
  side: string
  color?: string
  fullStats: PitcherStatsFull | null
  movementRows: PitchMovementRow[]
  countTendency?: Record<string, PitcherCountTendency>
  sequencing?: Record<string, PitcherPitchSequencing>
}

export default function PitchingTab({
  awayPitcher, homePitcher,
}: {
  awayPitcher: PitcherInfo | null
  homePitcher: PitcherInfo | null
}) {
  const pitchers = [awayPitcher, homePitcher].filter((p): p is PitcherInfo => p !== null)

  const searchParams = useSearchParams()
  const initialIndex = (() => {
    const p = searchParams?.get('pitcher')
    if (p === 'home' && homePitcher) return pitchers.indexOf(homePitcher)
    if (p === 'away' && awayPitcher) return pitchers.indexOf(awayPitcher)
    return 0
  })()
  const [selected, setSelected] = useState(initialIndex)

  if (pitchers.length === 0) {
    return <p className="text-sm font-serif italic text-stone-400 py-10 text-center">No probable pitchers announced yet.</p>
  }

  const pitcher = pitchers[Math.min(selected, pitchers.length - 1)]

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
        extra={
          <div className="space-y-6">
            <PitchMovementChart rows={pitcher.movementRows} />
            {(pitcher.countTendency || pitcher.sequencing) && (
              <div className="grid md:grid-cols-2 gap-4 items-start">
                <PitchPredictorTool
                  pitcherName={pitcher.name}
                  abbr={pitcher.abbr}
                  color={pitcher.color ?? '#FF5722'}
                  countTendency={pitcher.countTendency ?? {}}
                  sequencing={pitcher.sequencing ?? {}}
                />
                <PitchSequencingCard
                  pitcherName={pitcher.name}
                  abbr={pitcher.abbr}
                  color={pitcher.color ?? '#FF5722'}
                  countTendency={pitcher.countTendency ?? {}}
                  sequencing={pitcher.sequencing ?? {}}
                />
              </div>
            )}
          </div>
        }
      />
    </div>
  )
}