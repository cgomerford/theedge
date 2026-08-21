'use client'

// src/components/TeamHotZoneCard.tsx
//
// Aggregate confirmed-lineup hot zone — averages real batter_hot_zones data
// across the confirmed lineup (vs the opposing starter's throwing hand).
//
// 2026-08-18: chase zones (11-14) redrawn as Savant-style quadrants —
// a 2×2 outer frame with the core 3×3 inset in the middle. Values sit
// in the four outer corners (same treatment as PitchLocationCard).
//
// 2026-08-09: added a fallback to each batter's 'all' split when their
// specific vs_lhp/vs_rhp split doesn't exist yet.
//
// 2026-08-11: added `compact` prop for the admin Scout Stories slideshow.

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

const CORE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const CHASE_KEYS = ['11', '12', '13', '14'] as const
const ALL_ZONES = [...CORE_KEYS, ...CHASE_KEYS]

// flex-col: justify = vertical, items = horizontal
const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2 pl-2',
  '12': 'items-end justify-start pt-2 pr-2',
  '13': 'items-start justify-end pb-2 pl-2',
  '14': 'items-end justify-end pb-2 pr-2',
}

export default function TeamHotZoneCard({ teamAbbr, teamName, color, entries, opposingThrows, compact }: Props) {
  const splitKey = opposingThrows === 'L' ? 'vs_lhp' : 'vs_rhp'

  const cells = Object.fromEntries(ALL_ZONES.map(z => {
    const values: number[] = []
    let matchedCount = 0
    let fallbackCount = 0

    for (const e of entries) {
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
    return [z, { zone: z, avg, n: values.length, matchedCount, fallbackCount }]
  }))

  const totalWithData = entries.filter(e => e.zones?.[splitKey] || e.zones?.['all']).length
  const totalHandednessMatched = entries.filter(e => e.zones?.[splitKey]).length

  const pad = compact ? 'p-2.5' : 'p-4'
  const padHead = compact ? 'px-2.5 py-2' : 'px-4 py-2.5'
  const cellSize = compact ? 30 : 44
  const gap = compact ? 3 : 4
  const chaseBand = compact ? 26 : 38
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

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
        <div className="mx-auto relative" style={{ width: total, height: total }}>
          <style jsx>{`
            @keyframes tileIn {
              0% { opacity: 0; transform: scale(0.3) rotate(-35deg) translateY(6px); }
              60% { opacity: 1; transform: scale(1.08) rotate(6deg) translateY(0); }
              100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
            }
            .zone-cell { animation: tileIn 420ms cubic-bezier(.34,1.56,.64,1) both; }
          `}</style>

          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
            {CHASE_KEYS.map(z => {
              const { avg, n } = cells[z]
              return (
                <div
                  key={z}
                  className={`zone-cell flex flex-col ${CHASE_ALIGN[z]} ${colorForBatterMetric(avg, 'xwoba')} border border-white/25`}
                  title={ZONE_LABELS[z]}
                >
                  <span className={`font-mono font-bold text-stone-900/80 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{formatMetric(avg, 'xwoba')}</span>
                  <span className={`font-mono text-stone-900/50 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>{n}/{entries.length}</span>
                </div>
              )
            })}
          </div>

          <div
            className="absolute grid"
            style={{
              top: chaseBand,
              left: chaseBand,
              width: core,
              height: core,
              gridTemplateColumns: `repeat(3, ${cellSize}px)`,
              gridTemplateRows: `repeat(3, ${cellSize}px)`,
              gap,
            }}
          >
            {CORE_KEYS.map(z => {
              const { avg, n } = cells[z]
              return (
                <div
                  key={z}
                  className={`zone-cell rounded-md flex flex-col items-center justify-center ${colorForBatterMetric(avg, 'xwoba')} border border-white/40`}
                  title={ZONE_LABELS[z]}
                >
                  <span className={`font-mono font-bold text-stone-900/80 ${compact ? 'text-[8px]' : 'text-[11px]'}`}>{formatMetric(avg, 'xwoba')}</span>
                  <span className={`font-mono text-stone-900/50 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>{n}/{entries.length}</span>
                </div>
              )
            })}
          </div>
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