'use client'

// src/components/BatterZoneHeatmap.tsx
//
// Two views instead of the old single-batter-with-tabs picker:
//   1. COMBINED — every pitch every batter on this team saw tonight,
//      aggregated into one team-wide zone heatmap.
//   2. THE 9 — a 3x3 grid of small individual heatmaps, one per batter
//      in the lineup (up to 9), so you can see the whole lineup's zone
//      coverage at a glance instead of clicking through one at a time.

import { useMemo, useState } from 'react'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { BatterGameZones } from '@/lib/postgame'

// In-zone 3x3 grid only for the mini tiles (keeps them small and legible);
// the combined view gets the full 5-col grid including the four
// outside-zone corners (11-14), same as the original design.
const FULL_ZONE_GRID: (number | null)[] = [
  11, 1, 2, 3, 12,
  null, 4, 5, 6, null,
  13, 7, 8, 9, 14,
]
const MINI_ZONE_GRID = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const OUTCOME_COLOR: Record<string, string> = {
  ball: '#d6d3d1',
  called_strike: '#fbbf24',
  swinging_strike: '#ef4444',
  foul: '#93c5fd',
  in_play: '#22c55e',
  other: '#e7e5e4',
}

type ZoneBucket = { total: number; byOutcome: Record<string, number> }

function zoneCounts(pitches: BatterGameZones['pitches']): Map<number, ZoneBucket> {
  const map = new Map<number, ZoneBucket>()
  for (const p of pitches) {
    if (p.zone == null) continue
    if (!map.has(p.zone)) map.set(p.zone, { total: 0, byOutcome: {} })
    const bucket = map.get(p.zone)!
    bucket.total += 1
    bucket.byOutcome[p.outcome] = (bucket.byOutcome[p.outcome] ?? 0) + 1
  }
  return map
}

function dominantOutcome(byOutcome: Record<string, number>): string {
  let best = 'other'
  let bestCount = -1
  for (const [k, v] of Object.entries(byOutcome)) {
    if (v > bestCount) { best = k; bestCount = v }
  }
  return best
}

function CombinedGrid({ pitches }: { pitches: BatterGameZones['pitches'] }) {
  const counts = zoneCounts(pitches)
  const maxCount = Math.max(1, ...[...counts.values()].map(c => c.total))
  return (
    <div className="grid grid-cols-5 gap-1 max-w-[240px] mx-auto">
      {FULL_ZONE_GRID.map((zone, i) => {
        if (zone == null) return <div key={i} />
        const bucket = counts.get(zone)
        const total = bucket?.total ?? 0
        const outcome = bucket ? dominantOutcome(bucket.byOutcome) : 'other'
        const intensity = total > 0 ? Math.max(0.15, total / maxCount) : 0.06
        const isCorner = zone >= 11
        return (
          <div
            key={i}
            className={`aspect-square flex items-center justify-center font-mono text-[12px] font-bold ${isCorner ? 'rounded-full' : 'rounded-sm'}`}
            style={{
              background: `${OUTCOME_COLOR[outcome]}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,
              color: total > 0 ? '#292524' : '#d6d3d1',
              border: '1px solid #f5f5f4',
            }}
            title={`Zone ${zone}: ${total} pitches`}
          >
            {total > 0 ? total : ''}
          </div>
        )
      })}
    </div>
  )
}

function MiniBatterTile({ batter }: { batter: BatterGameZones }) {
  const counts = zoneCounts(batter.pitches)
  const maxCount = Math.max(1, ...[...counts.values()].map(c => c.total))
  return (
    <div className="bg-stone-50/60 rounded-lg border border-stone-100 p-2 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5 w-full">
        <img
          src={playerHeadshotUrl(batter.playerId, 60)}
          alt={batter.playerName}
          className="w-6 h-6 rounded-full object-cover bg-white flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
        />
        <span className="font-mono text-[10px] text-stone-700 truncate flex-1 min-w-0">{batter.playerName.split(' ').slice(-1)[0]}</span>
        <span className="font-mono text-[9px] text-stone-400 flex-shrink-0">{batter.pitches.length}p</span>
      </div>
      <div className="grid grid-cols-3 gap-0.5 w-full">
        {MINI_ZONE_GRID.map(zone => {
          const bucket = counts.get(zone)
          const total = bucket?.total ?? 0
          const outcome = bucket ? dominantOutcome(bucket.byOutcome) : 'other'
          const intensity = total > 0 ? Math.max(0.2, total / maxCount) : 0.05
          return (
            <div
              key={zone}
              className="aspect-square rounded-sm flex items-center justify-center font-mono text-[9px] font-bold"
              style={{
                background: `${OUTCOME_COLOR[outcome]}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,
                color: total > 0 ? '#292524' : '#d6d3d1',
              }}
              title={`Zone ${zone}: ${total} pitches`}
            >
              {total > 0 ? total : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  teamAbbr: string
  teamColor: string
  batters: BatterGameZones[]
}

export default function BatterZoneHeatmap({ teamAbbr, teamColor, batters }: Props) {
  const [showByBatter, setShowByBatter] = useState(false)
  const active = useMemo(() => [...batters].filter(b => b.pitches.length > 0).sort((a, b) => b.pitches.length - a.pitches.length), [batters])
  const allPitches = useMemo(() => active.flatMap(b => b.pitches), [active])

  if (active.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-center font-mono text-[10px] text-stone-400">
        No pitch data available
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${teamColor}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{teamAbbr} batter heatmap</span>
        <span className="font-mono text-[9.5px] text-stone-400">{allPitches.length} pitches seen</span>
      </div>

      {/* Combined team view — always visible */}
      <div className="p-4">
        <CombinedGrid pitches={allPitches} />
      </div>

      {/* By batter — hidden behind its own toggle, not shown by default */}
      <button
        onClick={() => setShowByBatter(o => !o)}
        className="w-full px-3 py-2 border-t border-stone-100 flex items-center justify-center gap-1.5 hover:bg-stone-50 transition-colors"
      >
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
          {showByBatter ? 'Hide' : 'Show'} by batter
        </span>
        <svg className={`w-3 h-3 text-stone-400 transition-transform ${showByBatter ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showByBatter && (
        <div className="p-4 border-t border-stone-100">
          <div className="grid grid-cols-3 gap-2">
            {active.slice(0, 9).map(b => <MiniBatterTile key={b.playerId} batter={b} />)}
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-stone-100 flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {Object.entries(OUTCOME_COLOR).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: c }} />
            <span className="font-mono text-[9px] text-stone-400 capitalize">{k.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}