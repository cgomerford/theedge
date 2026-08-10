'use client'

// src/components/TeamHotZoneCard.tsx
//
// Aggregate confirmed-lineup hot zone — averages real batter_hot_zones data
// across the confirmed lineup (vs the opposing starter's throwing hand), not
// a stub. Every cell shows how many of the lineup's batters actually
// contributed data, so a thin-sample cell reads as thin, not confident.
//
// 2026-08-09: added a fallback to each batter's 'all' split when their
// specific vs_lhp/vs_rhp split doesn't exist yet. A handedness split needs
// a real chunk of plate appearances against that handedness before it
// means anything, so plenty of batters legitimately only have an 'all'
// row this early — without this fallback, enough thin-split batters in
// one lineup could zero out the whole card even though real season data
// exists for every one of them. Cells now track how many contributors
// were handedness-matched vs season-wide fallback, shown honestly rather
// than silently blended.

import type { BatterHotZones } from '@/lib/hot-zones'
import { colorForBatterMetric, formatMetric, ZONE_LABELS } from '@/lib/hot-zones'

export type LineupZoneEntry = {
  playerId: number
  playerName: string
  zones?: Record<string, BatterHotZones>
}

type Props = {
  teamAbbr: string
  teamName: string
  color: string
  entries: LineupZoneEntry[]
  opposingThrows: 'L' | 'R'
}

export default function TeamHotZoneCard({ teamAbbr, teamName, color, entries, opposingThrows }: Props) {
  const splitKey = opposingThrows === 'L' ? 'vs_lhp' : 'vs_rhp'

  const cells = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(z => {
    const values: number[] = []
    let matchedCount = 0
    let fallbackCount = 0

    for (const e of entries) {
      // Prefer the handedness-specific split; fall back to 'all' if this
      // batter doesn't have enough PA against this handedness yet.
      const matched = e.zones?.[splitKey]
      const fallback = e.zones?.['all']
      const source = matched ?? fallback
      const v = source?.zones?.[z]?.xwoba
      if (v != null) {
        values.push(v)
        if (matched) matchedCount++
        else fallbackCount++
      }
    }
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
    return { zone: z, avg, n: values.length, matchedCount, fallbackCount }
  })

  // A batter "has data" if they have EITHER split available — 'all' alone
  // still counts, since the card now uses it.
  const totalWithData = entries.filter(e => e.zones?.[splitKey] || e.zones?.['all']).length
  const totalHandednessMatched = entries.filter(e => e.zones?.[splitKey]).length

  if (entries.length === 0 || totalWithData === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center" style={{ borderTop: `3px solid ${color}` }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{teamAbbr} lineup</p>
        <p className="text-sm font-serif italic text-stone-400">No zone data for this lineup yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div
        className="px-4 py-2.5 border-b border-stone-100"
        style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}
      >
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
          {teamName} · Lineup vs {opposingThrows}HP
        </p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-1 w-full max-w-[220px] mx-auto">
          {cells.map(({ zone, avg, n }) => (
            <div
              key={zone}
              className={`aspect-square rounded-md flex flex-col items-center justify-center ${colorForBatterMetric(avg, 'xwoba')} border border-white/40`}
              title={ZONE_LABELS[zone]}
            >
              <span className="text-[11px] font-mono font-bold text-stone-900/80">{formatMetric(avg, 'xwoba')}</span>
              <span className="text-[8px] font-mono text-stone-900/50">{n}/{entries.length}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] font-mono text-center text-stone-400 mt-3">
          Combined lineup xwOBA by zone · {totalWithData}/{entries.length} confirmed batters have data
          {totalHandednessMatched < totalWithData && (
            <> · {totalHandednessMatched} vs {opposingThrows}HP specifically, rest from season-wide split</>
          )}
        </p>
      </div>
    </div>
  )
}