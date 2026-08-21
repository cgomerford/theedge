'use client'

// src/components/PitchPredictorTool.tsx
//
// Pitching Lab — interactive "what do they throw next" tool. Built
// mobile-first: big tap targets, one screen, no page scrolling required
// between steps — the explicit design goal is usable one-handed, on a
// phone, mid-game (per George: "think easy UI that could be used on your
// phone in a game to predict, when we move it to an app").
//
// HONEST DATA LIMITATION — flagged here instead of silently implying more
// than the data supports:
//
//   pitcher_count_tendency and pitcher_pitch_sequencing are TWO SEPARATE
//   tables (see pitcher-sequencing.ts). Count tendency answers "in this
//   count, what do they throw" with a single top_zone_label per pitch —
//   that's a location ANNOTATION, not a filterable zone grid. Sequencing
//   answers "after this pitch, what comes next" but is NOT conditioned by
//   count — it's a season-aggregate tendency, not "after this pitch IN
//   THIS COUNT." There is no stored data answering "in a 1-0 count, after
//   a fastball, what comes next" as one joined query.
//
//   So this is built as an honest TWO-STEP CHAIN, not a single filter:
//     Step 1 — tap a count → see what they actually throw there (with
//              rough location as context)
//     Step 2 — tap that pitch → see what tends to follow it (labeled
//              clearly as "regardless of count," since that's what the
//              data actually reflects)
//
//   If George wants a true count-conditioned "what comes next," that
//   needs a new column in the sequencing pipeline (transitions bucketed
//   by count-after, not just split) — a script/schema change, not a UI
//   change. Worth flagging back to him rather than building a UI that
//   implies precision the data doesn't have.
//
// 2026-08-20 (later): added a real 3x3 strike-zone visual (ZoneGrid) next
// to each pitch. Per George's follow-up, every cell is now genuinely
// tappable and every filter (Batter, Count, Previous Pitch, Location)
// shows its own sample size (n=). Still bound by the same underlying
// limitation: only ONE zone is ever recorded per count+pitch combo, so
// tapping a different cell can't reveal alternate real data — it
// surfaces an honest "no tracked pitches here" message instead of either
// silently doing nothing or fabricating numbers for a cell that has none.

import { useState } from 'react'
import type { PitcherCountTendency } from '@/lib/pitcher-sequencing'
import type { PitcherPitchSequencing } from '@/lib/pitcher-sequencing'

// Standard catcher's-eye-view 3x3 zone chart — same 1-9 layout as
// fetch_pitcher_hot_zones.py's ZONE_LABELS (1 top-left/high-inside through
// 9 bottom-right/low-outside). top_zone on CountPitchSummary is this same
// normalized 1-9 code, so no remapping needed — just highlight the
// matching cell.
//
// TAPPABLE, per George — every one of the 9 cells is a real button. But
// the underlying table only ever records ONE zone per count+pitch combo
// (there's no per-zone pitch count to branch across), so tapping the lit
// cell confirms it and tapping any other cell honestly reports there's no
// tracked data there — rather than silently doing nothing (which would
// look broken) or pretending a different zone has real numbers behind it
// (which would be fabricating data).
function ZoneGrid({
  dataZone, count, color, size = 14, onTapOtherZone,
}: {
  dataZone: string | null
  count?: number | null
  color: string
  size?: number
  onTapOtherZone?: () => void
}) {
  const dataZoneNum = dataZone ? parseInt(dataZone, 10) : null
  const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  return (
    <div
      className="shrink-0"
      style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${size}px)`, gridTemplateRows: `repeat(3, ${size}px)`, gap: 2 }}
    >
      {cells.map(c => {
        const isData = c === dataZoneNum
        return (
          <button
            key={c}
            type="button"
            onClick={() => { if (!isData) onTapOtherZone?.() }}
            title={isData && count != null ? `${count} pitches tracked here` : isData ? undefined : 'No tracked pitches at this location'}
            style={{
              background: isData ? color : '#E7E5E4',
              borderRadius: 2,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        )
      })}
    </div>
  )
}

type Split = 'all' | 'vs_rhb' | 'vs_lhb'

type Props = {
  pitcherName: string
  abbr: string
  color: string
  countTendency: Record<string, PitcherCountTendency>
  sequencing: Record<string, PitcherPitchSequencing>
}

const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_rhb: 'RHB', vs_lhb: 'LHB' }
const BALLS = [0, 1, 2, 3]
const STRIKES = [0, 1, 2]

export default function PitchPredictorTool({ pitcherName, abbr, color, countTendency, sequencing }: Props) {
  const [split, setSplit] = useState<Split>('all')
  const [selectedCount, setSelectedCount] = useState<string | null>(null)
  const [selectedPitchType, setSelectedPitchType] = useState<string | null>(null)
  const [zoneTapMessage, setZoneTapMessage] = useState<string | null>(null)

  const availableSplits = (['all', 'vs_rhb', 'vs_lhb'] as Split[]).filter(
    s => countTendency[s] || sequencing[s]
  )

  const countData = countTendency[split]
  const seqData = sequencing[split]

  // Total pitches tracked for the current Batter split — sequencing's
  // total_followed sum when available (it's what actually backs the
  // prediction), falling back to count-tendency's totals otherwise.
  const totalTrackedForSplit = seqData?.transitions
    ? Object.values(seqData.transitions).reduce((sum, t) => sum + t.total_followed, 0)
    : countData?.counts
      ? Object.values(countData.counts).reduce((sum, b) => sum + b.total_pitches, 0)
      : null

  const bucket = selectedCount ? countData?.counts?.[selectedCount] : null
  const transition = selectedPitchType ? seqData?.transitions?.[selectedPitchType] : null

  // Previous-pitch options: sourced from the SEQUENCING table (what
  // actually drives the prediction below), not just whatever showed up in
  // the selected count — a pitcher can have sequencing data for a pitch
  // that wasn't among the top pitches in this particular count.
  const pitchOptions = seqData?.transitions
    ? Object.entries(seqData.transitions)
        .map(([code, t]) => ({ code, name: t.pitch_name, total: t.total_followed }))
        .sort((a, b) => b.total - a.total)
    : []

  // Location is read-only, derived from Count + Previous Pitch together —
  // it's whatever the count-tendency table recorded as the typical zone
  // for that exact combination, NOT a free filter (see header comment:
  // there's no per-location branching in the sequencing data, so tapping
  // a different zone couldn't change the prediction below in any real way).
  const locationZone = (selectedCount && selectedPitchType)
    ? bucket?.pitches?.find(p => p.pitch_type === selectedPitchType) ?? null
    : null

  const reset = () => { setSelectedCount(null); setSelectedPitchType(null); setZoneTapMessage(null) }

  const handleSelectCount = (key: string) => {
    setSelectedCount(key)
    setZoneTapMessage(null)
    if (!selectedPitchType) {
      const top = countTendency[split]?.counts?.[key]?.pitches?.[0]
      setSelectedPitchType(top?.pitch_type ?? null)
    }
  }

  const handleSelectPitch = (code: string) => {
    setSelectedPitchType(code)
    setZoneTapMessage(null)
  }

  if (!countData && !seqData) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-stone-400 mb-1">{abbr} · {pitcherName}</p>
        <p className="text-base font-serif italic text-stone-400">No count or sequencing data available yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ maxWidth: 480, marginInline: 'auto' }}>
      {/* Header */}
      <div className="p-4 border-b border-stone-100">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">{abbr} · Pitch predictor</p>
        <p className="font-serif font-bold text-stone-900 text-lg">{pitcherName}</p>
      </div>

      {/* 1 · Batter */}
      {availableSplits.length > 1 && (
        <div className="p-4 border-b border-stone-100">
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">1 · Batter</p>
          <div className="flex gap-1.5">
            {availableSplits.map(s => (
              <button
                key={s}
                onClick={() => { setSplit(s); reset() }}
                className={`flex-1 font-mono uppercase tracking-wider rounded-lg py-2.5 text-xs transition ${
                  split === s ? 'text-white' : 'bg-stone-100 text-stone-500'
                }`}
                style={split === s ? { background: color } : undefined}
              >
                {SPLIT_LABELS[s]}
              </button>
            ))}
          </div>
          {totalTrackedForSplit != null && (
            <p className="font-mono text-[9px] text-stone-400 mt-2">{totalTrackedForSplit.toLocaleString()} pitches tracked for this split</p>
          )}
        </div>
      )}

      {/* 2 · Count */}
      <div className="p-4 border-b border-stone-100">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">2 · Count</p>
        <div className="flex justify-center">
          <div>
            <div className="grid grid-cols-[36px_repeat(4,1fr)] gap-1.5 mb-1.5">
              <div />
              {BALLS.map(b => (
                <div key={b} className="text-center font-mono text-[10px] uppercase tracking-wider text-stone-400">{b}B</div>
              ))}
            </div>
            {STRIKES.map(s => (
              <div key={s} className="grid grid-cols-[36px_repeat(4,1fr)] gap-1.5 mb-1.5">
                <div className="flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-stone-400">{s}S</div>
                {BALLS.map(b => {
                  const key = `${b}-${s}`
                  const cellBucket = countData?.counts?.[key]
                  const isSelected = selectedCount === key
                  const hasData = cellBucket && cellBucket.pitches.length > 0
                  return (
                    <button
                      key={key}
                      disabled={!hasData}
                      onClick={() => handleSelectCount(key)}
                      className="rounded-lg flex flex-col items-center justify-center transition disabled:opacity-25"
                      style={{
                        aspectRatio: '1',
                        minHeight: 52,
                        background: isSelected ? color : hasData ? `${color}1A` : '#F5F5F4',
                        border: isSelected ? `2px solid ${color}` : '1px solid transparent',
                      }}
                    >
                      <span className={`font-mono font-bold text-sm ${isSelected ? 'text-white' : 'text-stone-700'}`}>
                        {b}-{s}
                      </span>
                      {hasData && (
                        <span className={`font-mono text-[8px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-stone-500'}`}>
                          n={cellBucket!.total_pitches}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        {bucket && (
          <p className="font-mono text-[9px] text-stone-400 text-center mt-2">{bucket.total_pitches} pitches tracked in this count</p>
        )}
      </div>

      {/* 3 · Previous pitch — independently selectable, drives the prediction */}
      <div className="p-4 border-b border-stone-100">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">3 · Previous pitch</p>
        {pitchOptions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {pitchOptions.map(opt => (
              <button
                key={opt.code}
                onClick={() => handleSelectPitch(opt.code)}
                className="font-mono text-xs uppercase tracking-wider rounded-lg px-3 py-2 border transition flex items-center gap-1.5"
                style={selectedPitchType === opt.code
                  ? { background: color, borderColor: color, color: 'white' }
                  : { background: 'white', borderColor: '#E7E5E4', color: '#44403C' }}
              >
                {opt.name}
                <span className={selectedPitchType === opt.code ? 'text-white/70' : 'text-stone-400'} style={{ fontSize: '9px' }}>
                  n={opt.total}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-serif italic text-stone-400">No sequencing data for this split.</p>
        )}
      </div>

      {/* 4 · Location of previous pitch — every cell tappable; only the
          lit cell has real tracked data behind it (see ZoneGrid comment) */}
      <div className="p-4 border-b border-stone-100">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">
          4 · Location of previous pitch
        </p>
        {locationZone?.top_zone ? (
          <div>
            <div className="flex items-center gap-4">
              <ZoneGrid
                dataZone={locationZone.top_zone}
                count={locationZone.count_n}
                color={color}
                size={22}
                onTapOtherZone={() => setZoneTapMessage('No tracked pitches at that location for this count + pitch.')}
              />
              <div>
                <p className="font-serif text-sm text-stone-700">
                  {locationZone.top_zone_label ?? `Zone ${locationZone.top_zone}`}
                </p>
                <p className="font-mono text-[9px] text-stone-400 mt-0.5">
                  n={locationZone.count_n} pitches tracked here
                </p>
              </div>
            </div>
            {zoneTapMessage && (
              <p className="font-mono text-[9px] text-orange-600 mt-2">{zoneTapMessage}</p>
            )}
          </div>
        ) : (
          <p className="text-sm font-serif italic text-stone-400">
            {selectedCount ? 'No location data for this count + pitch.' : 'Pick a count above to see typical location.'}
          </p>
        )}
      </div>

      {/* Prediction — driven by Batter (split) + Previous Pitch only */}
      {selectedPitchType && (
        <div className="p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">
            What usually follows a {transition?.pitch_name ?? pitchOptions.find(o => o.code === selectedPitchType)?.name ?? selectedPitchType}
            <span className="normal-case italic text-stone-300"> — regardless of count</span>
          </p>

          {transition && transition.next_pitches.length > 0 ? (
            <div>
              <div className="rounded-xl p-4 mb-3 text-center" style={{ background: `${color}12`, border: `1.5px solid ${color}` }}>
                <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mb-1">Most likely next</p>
                <p className="font-serif font-bold text-2xl text-stone-900">{transition.next_pitches[0].pitch_name}</p>
                <p className="font-mono text-sm font-bold mt-1" style={{ color }}>
                  {transition.next_pitches[0].pct}% of the time
                </p>
              </div>

              <div className="space-y-1.5">
                {transition.next_pitches.slice(1, 5).map(n => (
                  <div key={n.pitch_type} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-stone-500 w-24 shrink-0 truncate">{n.pitch_name}</span>
                    <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${n.pct}%`, background: color, opacity: 0.35 }} />
                    </div>
                    <span className="font-mono text-xs text-stone-400 w-10 text-right shrink-0">{n.pct}%</span>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[9px] text-stone-400 text-center mt-2">
                {transition.total_followed} instances tracked this season
              </p>
            </div>
          ) : (
            <p className="text-sm font-serif italic text-stone-400 text-center py-4">
              Not enough sequencing data for this pitch yet.
            </p>
          )}
        </div>
      )}

      {(selectedCount || selectedPitchType) && (
        <button
          onClick={reset}
          className="w-full font-mono text-[10px] uppercase tracking-widest text-stone-400 py-3 border-t border-stone-100 hover:text-stone-600 transition"
        >
          Reset
        </button>
      )}
    </div>
  )
}
