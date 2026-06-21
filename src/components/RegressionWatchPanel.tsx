// src/components/RegressionWatchPanel.tsx
//
// "Movers" panel for the Trading Floor — surfaces players whose surface
// stat diverges from their underlying metric (ERA vs FIP for pitchers,
// AVG vs zone-weighted xwOBA for batters).
//
// Data source: getRegressionWatch() in src/lib/regression-watch.ts
// Empty state matches the pattern used by FantasyBullpenWatch / BullpenPanel
// when no data is available yet for the day.

import type { RegressionWatchData, RegressionWatchRow } from '@/lib/regression-watch'

interface RegressionWatchPanelProps {
  data: RegressionWatchData | null
}

function DirectionIcon({ direction }: { direction: 'rise' | 'drop' }) {
  return (
    <div
      className="w-7 h-7 flex items-center justify-center rounded-md shrink-0 mt-0.5"
      style={{
        background: direction === 'drop' ? 'rgba(220,38,38,0.12)' : 'rgba(34,197,94,0.12)',
      }}
    >
      <span
        className="text-base font-bold"
        style={{ color: direction === 'drop' ? '#DC2626' : '#16A34A' }}
      >
        {direction === 'drop' ? '↓' : '↑'}
      </span>
    </div>
  )
}

function PlayerRow({ row }: { row: RegressionWatchRow }) {
  return (
    <div className="flex gap-2.5 px-4 py-3 border-b border-stone-100 last:border-b-0">
      <DirectionIcon direction={row.direction} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-sm font-bold text-[#1A1A1A]">{row.player_name}</span>
          {(row.team_short || row.position) && (
            <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wide">
              {[row.team_short, row.position].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          <div>
            <span className="font-mono text-[9px] text-stone-400 tracking-wide">SURFACE </span>
            <span className="font-mono text-xs font-bold text-[#1A1A1A]">{row.surface_label}</span>
          </div>
          <div>
            <span className="font-mono text-[9px] text-stone-400 tracking-wide">TRUE </span>
            <span
              className="font-mono text-xs font-bold"
              style={{ color: row.direction === 'drop' ? '#DC2626' : '#16A34A' }}
            >
              {row.true_label}
            </span>
          </div>
        </div>
        <p className="font-serif text-[11px] italic text-stone-500 leading-snug mt-1.5">
          {row.detail}
        </p>
      </div>
    </div>
  )
}

function EmptyColumn() {
  return (
    <div className="px-4 py-6 text-center">
      <p className="font-mono text-[11px] text-stone-400">No candidates today.</p>
    </div>
  )
}

function PositionGroup({
  title,
  rise,
  drop,
}: {
  title: string
  rise: RegressionWatchRow[]
  drop: RegressionWatchRow[]
}) {
  return (
    <div>
      <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-400">
          {title}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-100">
        <div>
          <div className="px-4 py-1.5 bg-emerald-50/50">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              ↑ Due to Rise
            </span>
          </div>
          {rise.length > 0 ? rise.map((r, i) => <PlayerRow key={i} row={r} />) : <EmptyColumn />}
        </div>
        <div>
          <div className="px-4 py-1.5 bg-red-50/50">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-red-700">
              ↓ Due to Drop
            </span>
          </div>
          {drop.length > 0 ? drop.map((r, i) => <PlayerRow key={i} row={r} />) : <EmptyColumn />}
        </div>
      </div>
    </div>
  )
}

export default function RegressionWatchPanel({ data }: RegressionWatchPanelProps) {
  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
      {/* Header — matches BullpenPanel header convention */}
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">
          ⊕ Regression Watch
        </div>
        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">
          surface ≠ reality
        </span>
      </div>

      {!data ? (
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-stone-400">
            Regression Watch not yet available — check back closer to first pitch.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          <PositionGroup title="Pitchers · ERA vs FIP" rise={data.pitchers.rise} drop={data.pitchers.drop} />
          <PositionGroup title="Batters · AVG vs xwOBA" rise={data.batters.rise} drop={data.batters.drop} />
        </div>
      )}
    </div>
  )
}
