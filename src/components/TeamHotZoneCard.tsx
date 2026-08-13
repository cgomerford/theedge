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
//
// 2026-08-11: added `compact` prop for the admin Scout Stories slideshow
// (340px-wide story frame) — full-size /mlb/[slug] rendering is untouched
// unless compact is explicitly passed. Also added the same staggered
// tile-entrance animation used in PitchLocationCard's ZoneGrid, so both
// grids in the slideshow assemble themselves the same way.

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
  compact?: boolean
}

export default function TeamHotZoneCard({ teamAbbr, teamName, color, entries, opposingThrows, compact }: Props) {
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

  const pad = compact ? 'p-2.5' : 'p-4'
  const padHead = compact ? 'px-2.5 py-2' : 'px-4 py-2.5'

  if (entries.length === 0 || totalWithData === 0) {
    return (
      <div className={`bg-white rounded-xl border border-stone-200 text-center ${compact ? 'p-3' : 'p-6'}`} style={{ borderTop: `3px solid ${color}` }}>
        <p className={`font-mono uppercase tracking-widest text-stone-400 mb-1 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{teamAbbr} lineup</p>
        <p className={`font-serif italic text-stone-400 ${compact ? 'text-xs' : 'text-sm'}`}>No zone data for this lineup yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div
        className={`border-b border-stone-100 ${padHead}`}
        style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}
      >
        <p className={`font-mono uppercase tracking-widest text-stone-500 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          {teamName} · Lineup vs {opposingThrows}HP
        </p>
      </div>
      <div className={pad}>
        <div className="zone-grid grid grid-cols-3 mx-auto" style={{ gap: compact ? 3 : 4, maxWidth: compact ? 150 : 220 }}>
          <style jsx>{`
            @keyframes tileIn {
              0% { opacity: 0; transform: scale(0.3) rotate(-35deg) translateY(6px); }
              60% { opacity: 1; transform: scale(1.08) rotate(6deg) translateY(0); }
              100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
            }
            .zone-cell { animation: tileIn 420ms cubic-bezier(.34,1.56,.64,1) both; }
            .zone-cell:nth-child(1) { animation-delay: 0ms; }
            .zone-cell:nth-child(2) { animation-delay: 70ms; }
            .zone-cell:nth-child(3) { animation-delay: 140ms; }
            .zone-cell:nth-child(4) { animation-delay: 70ms; }
            .zone-cell:nth-child(5) { animation-delay: 140ms; }
            .zone-cell:nth-child(6) { animation-delay: 210ms; }
            .zone-cell:nth-child(7) { animation-delay: 140ms; }
            .zone-cell:nth-child(8) { animation-delay: 210ms; }
            .zone-cell:nth-child(9) { animation-delay: 280ms; }
          `}</style>
          {cells.map(({ zone, avg, n }) => (
            <div
              key={zone}
              className={`zone-cell aspect-square rounded-md flex flex-col items-center justify-center ${colorForBatterMetric(avg, 'xwoba')} border border-white/40`}
              title={ZONE_LABELS[zone]}
            >
              <span className={`font-mono font-bold text-stone-900/80 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{formatMetric(avg, 'xwoba')}</span>
              <span className={`font-mono text-stone-900/50 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>{n}/{entries.length}</span>
            </div>
          ))}
        </div>
        {!compact && (
          <p className="text-[9px] font-mono text-center text-stone-400 mt-3">
            Combined lineup xwOBA by zone · {totalWithData}/{entries.length} confirmed batters have data
            {totalHandednessMatched < totalWithData && (
              <> · {totalHandednessMatched} vs {opposingThrows}HP specifically, rest from season-wide split</>
            )}
          </p>
        )}
        {compact && (
          <p className="text-[7px] font-mono text-center text-stone-400 mt-2">
            xwOBA by zone · {totalWithData}/{entries.length} batters
          </p>
        )}
      </div>
    </div>
  )
}