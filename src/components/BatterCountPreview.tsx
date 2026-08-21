'use client'

// src/components/BatterCountPreview.tsx
//
// Batting Lab component — "what pitch will this batter see, and how have
// they done against it, in each count." Joins two things that already
// exist independently and were never cross-referenced from the batter's
// side before:
//   - pitcher_count_tendency (lib/pitcher-sequencing.ts) — the OPPOSING
//     pitcher's real tendency: what he throws most in each ball-strike
//     count, built for PitchSequencingCard.
//   - batter_pitch_type_splits — this batter's own BA/whiff/xwOBA against
//     that specific pitch type, the same table Zone Clash already uses
//     in lib/scout.ts's buildLineupArsenalRows.
//
// For each count with real data on both sides, shows: "pitcher likely
// throws X here (Y%)" next to "you've hit X at .zzz this season" — the
// actual matchup read, not either side in isolation.

import { useState } from 'react'
import type { PitcherCountTendency } from '@/lib/pitcher-sequencing'
import type { BatterPitchSplitForScout } from '@/lib/scout'

type Props = {
  batterName: string
  color: string
  pitcherCountTendency: Record<string, PitcherCountTendency>
  batterSplits: BatterPitchSplitForScout[]
}

const COUNT_ORDER = ['0-0', '1-0', '0-1', '2-0', '1-1', '0-2', '3-0', '2-1', '1-2', '3-1', '2-2', '3-2']

function fmtBa(v: number | null): string {
  return v != null ? v.toFixed(3).replace(/^0/, '') : '—'
}

export default function BatterCountPreview({ batterName, color, pitcherCountTendency, batterSplits }: Props) {
  const [split, setSplit] = useState<'all' | 'vs_lhb' | 'vs_rhb'>('all')

  const countData = pitcherCountTendency[split]
  const splitsByType = new Map(batterSplits.map(s => [s.pitch_type, s]))

  const availableSplits = (['all', 'vs_lhb', 'vs_rhb'] as const).filter(s => pitcherCountTendency[s])

  if (!countData || Object.keys(countData.counts ?? {}).length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{batterName}</p>
        <p className="text-sm font-serif italic text-stone-400">Pitcher count-tendency data not yet available.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">What {batterName} will see</p>
          <p className="text-[10px] font-serif italic text-stone-400 mt-0.5">
            Opposing pitcher's real count tendency, matched against {batterName}'s own history vs. that pitch.
          </p>
        </div>
        {availableSplits.length > 1 && (
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {availableSplits.map(s => (
              <button
                key={s}
                onClick={() => setSplit(s)}
                className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${
                  split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {s === 'all' ? 'All' : s === 'vs_lhb' ? 'vs LHB' : 'vs RHB'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="space-y-1.5">
          {COUNT_ORDER.filter(c => countData.counts[c]).map(countKey => {
            const bucket = countData.counts[countKey]
            const topPitch = bucket.pitches[0]
            if (!topPitch) return null
            const batterSplit = splitsByType.get(topPitch.pitch_type)

            return (
              <div key={countKey} className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
                <span className="font-mono text-sm font-bold text-stone-800 w-10 shrink-0">{countKey}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-stone-700">
                    Likely: <span className="font-bold">{topPitch.pitch_name}</span> ({topPitch.pct}%)
                    {topPitch.top_zone_label && <span className="text-stone-400"> · {topPitch.top_zone_label}</span>}
                  </p>
                  {batterSplit ? (
                    <p className="text-[11px] font-mono mt-0.5">
                      <span className="text-stone-500">You've hit it:</span>{' '}
                      <span className="font-bold" style={{ color }}>{fmtBa(batterSplit.ba)}</span>
                      {batterSplit.pa != null && <span className="text-stone-400"> (n={batterSplit.pa} PA)</span>}
                      {batterSplit.whiff_percent != null && (
                        <span className="text-stone-400"> · {batterSplit.whiff_percent.toFixed(1)}% whiff</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] font-serif italic text-stone-400 mt-0.5">No history vs this pitch type yet</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[7px] font-mono text-stone-400 mt-3 pt-3 border-t border-stone-100 text-center">
          Pitcher tendency is season-wide, not specific to tonight's count sequencing within an at-bat. Batter splits are season-to-date across all matchups, not just vs. tonight's pitcher.
        </p>
      </div>
    </div>
  )
}
