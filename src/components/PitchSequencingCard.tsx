'use client'

// src/components/PitchSequencingCard.tsx
//
// 2026-08-20 (later): full visual redesign for intuitiveness — two
// changes:
//   1. "By count" — was a scrolling table (count | pitch | % | zone).
//      Now a real 4x3 ball-strike grid (balls 0-3 columns, strikes 0-2
//      rows), same intensity-shaded-cell visual language already used
//      for hot zones (PitchLocationCard/TeamHotZoneCard) elsewhere in
//      this app — a count grid is how any baseball person already
//      mentally maps counts. Click a cell to see the location detail
//      below instead of it always taking a table row.
//   2. "What comes next" — was a flat list of horizontal bars, all the
//      same visual weight. Now an explicit flow: selected pitch as a
//      bold "from" chip, an arrow, then ranked outcomes where the TOP
//      result is visually dominant (larger, bordered, colored) and the
//      rest recede — matches how the actual insight reads ("after a
//      fastball, MOSTLY a slider, occasionally X, rarely Y") instead of
//      presenting every option as equally likely.
//
// Same data contract as before — no prop changes, drop-in replacement.

import { useState, useMemo } from 'react'
import type { PitcherCountTendency, PitcherPitchSequencing } from '@/lib/pitcher-sequencing'
import { colorForPitcherMetric } from '@/lib/hot-zones'

type Split = 'all' | 'vs_lhb' | 'vs_rhb'

type Props = {
  pitcherName: string
  abbr: string
  color: string
  countTendency: Record<string, PitcherCountTendency>
  sequencing: Record<string, PitcherPitchSequencing>
}

const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB' }

const BALLS = [0, 1, 2, 3]
const STRIKES = [0, 1, 2]

export default function PitchSequencingCard({ pitcherName, abbr, color, countTendency, sequencing }: Props) {
  const [split, setSplit] = useState<Split>('all')
  const [selectedCount, setSelectedCount] = useState<string | null>(null)

  const countData = countTendency[split]
  const seqData = sequencing[split]

  const availableSplits = (['all', 'vs_lhb', 'vs_rhb'] as Split[]).filter(
    s => countTendency[s] || sequencing[s],
  )

  const pitchTypeOptions = useMemo(() => {
    if (!seqData?.transitions) return []
    return Object.entries(seqData.transitions)
      .sort((a, b) => b[1].total_followed - a[1].total_followed)
      .map(([code, data]) => ({ code, name: data.pitch_name, total: data.total_followed }))
  }, [seqData])

  const [selectedFrom, setSelectedFrom] = useState<string | null>(null)
  const activeFrom = selectedFrom ?? pitchTypeOptions[0]?.code ?? null
  const activeTransition = activeFrom && seqData?.transitions ? seqData.transitions[activeFrom] : null

  const hasCountData = countData && Object.keys(countData.counts ?? {}).length > 0
  const hasSeqData = pitchTypeOptions.length > 0

  const selectedCountBucket = selectedCount ? countData?.counts?.[selectedCount] : null

  if (!hasCountData && !hasSeqData) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{abbr} · {pitcherName}</p>
        <p className="text-sm font-serif italic text-stone-400">Count/sequencing data not yet available.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{abbr} · Pitch selection</p>
          <p className="font-serif font-semibold text-stone-900">{pitcherName}</p>
        </div>
        {availableSplits.length > 1 && (
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {availableSplits.map(s => (
              <button
                key={s}
                onClick={() => { setSplit(s); setSelectedCount(null) }}
                className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${
                  split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {SPLIT_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── By count — real ball-strike grid ─────────────────────────── */}
      {hasCountData && (
        <div className="p-4 border-b border-stone-100">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-3">Most-used pitch by count</p>

          <div className="flex justify-center">
            <div>
              <div className="grid grid-cols-[28px_repeat(4,44px)] gap-1 mb-1">
                <div />
                {BALLS.map(b => (
                  <div key={b} className="text-center font-mono text-[8px] uppercase tracking-wider text-stone-400">{b}B</div>
                ))}
              </div>
              {STRIKES.map(s => (
                <div key={s} className="grid grid-cols-[28px_repeat(4,44px)] gap-1 mb-1">
                  <div className="flex items-center justify-center font-mono text-[8px] uppercase tracking-wider text-stone-400">{s}S</div>
                  {BALLS.map(b => {
                    const key = `${b}-${s}`
                    const bucket = countData.counts[key]
                    const top = bucket?.pitches?.[0]
                    const isSelected = selectedCount === key
                    if (!top) {
                      return <div key={key} className="aspect-square rounded-md bg-stone-50 border border-dashed border-stone-200" />
                    }
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedCount(isSelected ? null : key)}
                        title={`${top.pitch_name} — ${top.pct}%, n=${top.count_n}`}
                        className={`aspect-square rounded-md flex flex-col items-center justify-center ${colorForPitcherMetric(top.pct, 'usage_pct')}`}
                        style={{ border: isSelected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.4)' }}
                      >
                        <span className="font-mono font-bold text-stone-900/80 text-[10px]">{top.pct}%</span>
                        <span className="font-mono text-stone-900/50 text-[7px]">n={top.count_n}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend line — which pitch each shaded cell refers to isn't
              visible in the cell itself (no room at this size), so the
              selected-cell detail panel below carries the pitch name */}
          <p className="font-mono text-[8px] text-stone-400 text-center mt-2">Tap a cell for the pitch name and location</p>

          {selectedCountBucket && (
            <div className="mt-3 p-3 bg-stone-50 rounded-lg">
              <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">
                {selectedCount} count · {selectedCountBucket.total_pitches} pitches
              </p>
              <div className="space-y-1">
                {selectedCountBucket.pitches.slice(0, 4).map(p => (
                  <div key={p.pitch_type} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-stone-700">{p.pitch_name}</span>
                    <span className="font-mono text-stone-500">
                      {p.pct}%{p.top_zone_label ? ` · ${p.top_zone_label}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── What comes next — explicit flow, dominant top result ─────── */}
      {hasSeqData && (
        <div className="p-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">Pick a pitch to see what follows</p>
          <div className="flex gap-1.5 flex-wrap mb-4">
            {pitchTypeOptions.map(opt => (
              <button
                key={opt.code}
                onClick={() => setSelectedFrom(opt.code)}
                className={`font-mono text-[10px] uppercase tracking-wider rounded-lg px-2.5 py-1.5 border transition ${
                  activeFrom === opt.code
                    ? 'text-white border-transparent'
                    : 'text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
                style={activeFrom === opt.code ? { background: color } : undefined}
              >
                {opt.name}
              </button>
            ))}
          </div>

          {activeTransition && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="font-mono text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: color }}>
                  {pitchTypeOptions.find(o => o.code === activeFrom)?.name}
                </div>
                <svg className="w-5 h-5 text-stone-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                {activeTransition.next_pitches[0] && (
                  <div className="border-2 rounded-lg px-3 py-1.5" style={{ borderColor: color }}>
                    <p className="font-mono text-sm font-bold text-stone-900">
                      {activeTransition.next_pitches[0].pitch_name}
                    </p>
                    <p className="font-mono text-[10px] text-stone-500">
                      {activeTransition.next_pitches[0].pct}% of the time
                    </p>
                  </div>
                )}
              </div>

              <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mb-1.5">
                Full breakdown · {activeTransition.total_followed} samples
              </p>
              <div className="space-y-1.5">
                {activeTransition.next_pitches.map((np, i) => (
                  <div key={np.pitch_type} className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] w-20 shrink-0 ${i === 0 ? 'font-bold text-stone-800' : 'text-stone-500'}`}>
                      {np.pitch_name}
                    </span>
                    <div className="flex-1 h-2.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${np.pct}%`, background: color, opacity: i === 0 ? 1 : 0.4 }}
                      />
                    </div>
                    <span className={`font-mono text-[10px] w-10 text-right shrink-0 ${i === 0 ? 'font-bold text-stone-800' : 'text-stone-400'}`}>
                      {np.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}