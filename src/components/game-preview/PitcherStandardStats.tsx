// src/components/game-preview/PitcherStandardStats.tsx
//
// "Standard Stats" modal content for a starting pitcher — raw season
// line (reusing StartingPitcherData.percentileRows' rawValue, no need to
// refetch what buildSpData already pulled), recent-start trend, and park
// record. Unlike the batter version, everything here is pre-fetched
// server-side (see StartingPitcherPanel.tsx's StartingPitcherData type) —
// there are only 2 starting pitchers per game, so no on-demand fetch
// needed the way 9-per-lineup batters required.

import type { StartingPitcherData } from './StartingPitcherPanel'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
      <span className="text-[11px] text-stone-500">{label}</span>
      <span className="text-[12px] font-mono font-bold text-stone-900">{value}</span>
    </div>
  )
}

function fmt(v: string | number | undefined | null): string {
  if (v == null || v === '.---') return '—'
  return String(v)
}

export default function PitcherStandardStats({ data }: { data: StartingPitcherData }) {
  const { percentileRows, trend, venueRecord, situational } = data

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">{new Date().getFullYear()} season</p>
        {percentileRows.length === 0 ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">Not enough innings this season to rank yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4">
            {percentileRows.map(r => <StatRow key={r.label} label={r.label} value={r.rawValue} />)}
          </div>
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Recent starts</p>
        {!trend ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">No recent-start data on record yet.</p>
        ) : (
          <>
            {trend.trend_label && <p className="text-xs text-stone-700 mb-1">{trend.trend_label}</p>}
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="ERA (L3 starts)" value={trend.last_3_era != null ? trend.last_3_era.toFixed(2) : '—'} />
              <StatRow label="K/9 (L3)" value={trend.last_3_k_per_9 != null ? trend.last_3_k_per_9.toFixed(1) : '—'} />
              <StatRow label="BB/9 (L3)" value={trend.last_3_bb_per_9 != null ? trend.last_3_bb_per_9.toFixed(1) : '—'} />
              <StatRow label="IP (L3)" value={String(trend.last_3_innings)} />
              <StatRow label="HR allowed (L3)" value={String(trend.hr_allowed_last_3)} />
              {trend.current_scoreless_innings > 0 && (
                <StatRow label="Scoreless streak" value={`${trend.current_scoreless_innings} IP`} />
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Record at this park</p>
        {!venueRecord ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">No record on file at this venue yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4">
            <StatRow label="Starts" value={String(venueRecord.starts)} />
            <StatRow label="W-L" value={`${venueRecord.wins}-${venueRecord.losses}`} />
            <StatRow label="No-decisions" value={String(venueRecord.noDecisions)} />
            <StatRow label="ERA" value={venueRecord.era != null ? venueRecord.era.toFixed(2) : '—'} />
          </div>
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Situational — {new Date().getFullYear()} season</p>
        <p className="text-[10px] text-stone-400 font-sans italic mb-2">
          MLB&apos;s own splits only break out runners-in-scoring-position (2nd/3rd combined) and bases empty — not each individual base state.
        </p>
        {!situational.risp && !situational.basesEmpty ? (
          <p className="text-xs font-sans italic text-stone-400 py-2">No situational splits on record yet.</p>
        ) : (
          <>
            <p className="text-[10px] font-mono uppercase text-stone-500 mt-2 mb-1">
              Runners in scoring position <span className="text-stone-400 normal-case">— {fmt(situational.risp?.battersFaced ?? situational.risp?.plateAppearances)} batters faced this season</span>
            </p>
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="BAA" value={fmt(situational.risp?.avg)} />
              <StatRow label="ERA" value={fmt(situational.risp?.era)} />
            </div>
            <p className="text-[10px] font-mono uppercase text-stone-500 mt-3 mb-1">
              Bases empty <span className="text-stone-400 normal-case">— {fmt(situational.basesEmpty?.battersFaced ?? situational.basesEmpty?.plateAppearances)} batters faced this season</span>
            </p>
            <div className="grid grid-cols-2 gap-x-4">
              <StatRow label="BAA" value={fmt(situational.basesEmpty?.avg)} />
              <StatRow label="ERA" value={fmt(situational.basesEmpty?.era)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
