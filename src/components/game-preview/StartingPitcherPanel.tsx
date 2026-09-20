// src/components/game-preview/StartingPitcherPanel.tsx
//
// Full starting-pitcher detail content — season percentiles (vs the
// qualified MLB pool) and this year's pitch arsenal. Pure body content,
// no card chrome or header: it's rendered inside DetailModal, which
// already supplies the header (pitcher name/team) and the grey-out
// overlay. Real data, already-built infrastructure
// (lib/pitcher-percentiles.ts, lib/pitcher-arsenal.ts) — nothing new
// fetched here, this just presents what page.tsx already pulled.

import SavantPercentileBar from '@/components/charts/SavantPercentileBar'
import type { PercentileRow } from '@/components/charts/types'
import type { PitcherTrend } from '@/lib/streaks'
import type { PitcherVenueRecordRow } from '@/lib/pitcher-venue-record'

export type ArsenalPitchRow = {
  pitchName: string
  usagePct: number | null
  avgVelo: number | null
  whiffPct: number | null
}

export type StartingPitcherData = {
  pitcherId: number
  pitcherName: string
  teamAbbr: string
  teamColor: string
  percentileRows: PercentileRow[]
  arsenal: ArsenalPitchRow[]
  qualified: boolean
  // Pre-fetched here rather than on-demand like the batter Standard
  // Stats modal — there's only ever 2 starting pitchers per game (vs. 9
  // batters per lineup), so pre-fetching both up front is cheap.
  trend: PitcherTrend | null
  venueRecord: PitcherVenueRecordRow | null
  // MLB's sitCodes splits — same "risp"/"e" (bases empty) codes the
  // batter Standard Stats modal uses, just fetched up front here instead
  // of on demand. Raw MLB stat objects, deliberately untyped further
  // (see player-splits.ts's own SplitLine — these come from the same
  // sitCodes endpoint but this call skips SplitLine's shaping).
  situational: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    risp: any | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    basesEmpty: any | null
  }
}

export default function StartingPitcherPanel({ data }: { data: StartingPitcherData }) {
  const { percentileRows, arsenal, qualified } = data

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Season percentiles</p>
        {!qualified ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Not enough innings this season to rank vs the qualified pool yet.</p>
        ) : percentileRows.length === 0 ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Percentile data unavailable.</p>
        ) : (
          <SavantPercentileBar rows={percentileRows} rounded edgeMarker />
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Arsenal · {new Date().getFullYear()}</p>
        {arsenal.length === 0 ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">No arsenal data tracked yet this season.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_50px_56px_50px] gap-2 px-1 pb-1 border-b border-stone-100">
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-stone-400">Pitch</span>
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-stone-400 text-right">Use%</span>
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-stone-400 text-right">Velo</span>
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-stone-400 text-right">Whiff%</span>
            </div>
            {arsenal.map(p => (
              <div key={p.pitchName} className="grid grid-cols-[1fr_50px_56px_50px] gap-2 px-1 py-1.5">
                <span className="text-[12px] text-stone-800 truncate">{p.pitchName}</span>
                <span className="text-[12px] font-mono text-stone-600 text-right">{p.usagePct != null ? `${p.usagePct.toFixed(0)}%` : '–'}</span>
                <span className="text-[12px] font-mono text-stone-600 text-right">{p.avgVelo != null ? p.avgVelo.toFixed(1) : '–'}</span>
                <span className="text-[12px] font-mono text-stone-600 text-right">{p.whiffPct != null ? `${p.whiffPct.toFixed(0)}%` : '–'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
