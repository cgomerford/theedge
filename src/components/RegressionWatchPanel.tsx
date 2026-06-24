// src/components/RegressionWatchPanel.tsx
import type { RegressionWatchData, RegressionWatchRow } from '@/lib/regression-watch'
import Link from 'next/link'

interface RegressionWatchPanelProps {
  data: RegressionWatchData | null
  layout?: 'stacked' | 'split'   // NEW: 'split' = Pitchers left | Batters right
}

const MAX_ROWS_PER_LIST = 5

function DirectionIcon({ direction }: { direction: 'rise' | 'drop' }) {
  const isDrop = direction === 'drop'
  return (
    <div
      className="w-6 h-6 flex items-center justify-center rounded shrink-0 mt-0.5 border"
      style={{
        background: isDrop ? 'rgba(220,38,38,0.10)' : 'rgba(16,185,129,0.10)',
        borderColor: isDrop ? 'rgba(220,38,38,0.25)' : 'rgba(16,185,129,0.25)',
      }}
    >
      <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: isDrop ? '#DC2626' : '#10B981' }}>
        {isDrop ? '↓' : '↑'}
      </span>
    </div>
  )
}

function PlayerRow({ row }: { row: RegressionWatchRow }) {
  const isDrop = row.direction === 'drop'
  return (
    <div className="group flex gap-3 px-4 py-2.5 border-b border-stone-100 last:border-b-0 hover:bg-stone-50/70 transition-colors">
      <DirectionIcon direction={row.direction} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-[13px] font-semibold text-[#1A1A1A] tracking-[-0.1px]">{row.player_name}</span>
          {(row.team_short || row.position) && (
            <span className="font-mono text-[9px] text-stone-400 uppercase tracking-[1px]">
              {[row.team_short, row.position].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">SURFACE</span>
            <span className="font-mono text-xs font-bold text-[#1A1A1A] tabular-nums">{row.surface_label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">TRUE</span>
            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: isDrop ? '#DC2626' : '#10B981' }}>
              {row.true_label}
            </span>
          </div>
        </div>
        {row.detail && (
          <p className="font-serif text-[10px] italic text-stone-500 leading-snug mt-1 pr-1 line-clamp-2">
            {row.detail}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyColumn({ label }: { label: string }) {
  return <div className="px-4 py-4 text-center"><p className="font-mono text-[10px] text-stone-400">No {label} today.</p></div>
}

function PositionGroup({ title, rise, drop }: { title: string; rise: RegressionWatchRow[]; drop: RegressionWatchRow[] }) {
  const shownRise = rise.slice(0, MAX_ROWS_PER_LIST)
  const shownDrop = drop.slice(0, MAX_ROWS_PER_LIST)
  const total = rise.length + drop.length

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-stone-500">{title}</span>
        {total > 0 && <span className="font-mono text-[9px] text-stone-400 tabular-nums">{total} flagged</span>}
      </div>

      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-100">
        <div className="border-l-2 border-emerald-200 sm:border-l-0">
          <div className="px-4 py-1.5 bg-emerald-50/60 flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-700">↑ DUE TO RISE</span>
            <span className="font-mono text-[9px] text-emerald-600 tabular-nums">({rise.length})</span>
          </div>
          {shownRise.length > 0 ? shownRise.map((r, i) => <PlayerRow key={i} row={r} />) : <EmptyColumn label="risers" />}
        </div>

        <div className="border-l-2 border-red-200 sm:border-l-0">
          <div className="px-4 py-1.5 bg-red-50/60 flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-red-700">↓ DUE TO DROP</span>
            <span className="font-mono text-[9px] text-red-600 tabular-nums">({drop.length})</span>
          </div>
          {shownDrop.length > 0 ? shownDrop.map((r, i) => <PlayerRow key={i} row={r} />) : <EmptyColumn label="drops" />}
        </div>
      </div>
    </div>
  )
}

export default function RegressionWatchPanel({ data, layout = 'stacked' }: RegressionWatchPanelProps) {
  if (!data) {
    return (
      <div className="rounded-xl border border-stone-200 overflow-hidden bg-white shadow-sm">
        <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
          <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">⊕ Regression Watch</div>
          <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">surface ≠ reality</span>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-stone-400">Regression Watch not yet available — check back closer to first pitch.</p>
        </div>
      </div>
    )
  }

  const totalFlagged = data.pitchers.rise.length + data.pitchers.drop.length + data.batters.rise.length + data.batters.drop.length
  const totalRise = data.pitchers.rise.length + data.batters.rise.length
  const totalDrop = data.pitchers.drop.length + data.batters.drop.length

  return (
    <div className="rounded-xl border border-stone-200 overflow-hidden bg-white shadow-sm">
      {/* Header + overview bar (always shown) */}
      <div className="px-4 py-2.5 bg-[#1A1A1A] flex items-center justify-between">
        <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#FF5722]">⊕ Regression Watch</div>
        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wide">surface ≠ reality</span>
      </div>

      <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-[9px] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-stone-500">FLAGGED</span>
          <span className="font-bold text-stone-900 tabular-nums">{totalFlagged}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-emerald-600">↑ {totalRise} rise</span>
          <span className="text-red-600">↓ {totalDrop} drop</span>
        </div>
      </div>

      {/* === NEW LAYOUT LOGIC === */}
      {layout === 'split' ? (
        // Pitchers LEFT | Batters RIGHT (full-width stretch)
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-4 bg-stone-50">
          <PositionGroup title="Pitchers · ERA vs FIP" rise={data.pitchers.rise} drop={data.pitchers.drop} />
          <PositionGroup title="Batters · AVG vs xwOBA" rise={data.batters.rise} drop={data.batters.drop} />
        </div>
      ) : (
        // Original stacked layout (for backward compatibility)
        <div className="divide-y divide-stone-100">
          <PositionGroup title="Pitchers · ERA vs FIP" rise={data.pitchers.rise} drop={data.pitchers.drop} />
          <PositionGroup title="Batters · AVG vs xwOBA" rise={data.batters.rise} drop={data.batters.drop} />
        </div>
      )}

      {/* View full link */}
      <div className="px-4 py-2.5 border-t border-stone-100 bg-stone-50 text-center">
        <Link href="/fantasy/regression-watch" className="font-mono text-[9px] uppercase tracking-widest text-orange-500 hover:text-orange-600 inline-flex items-center gap-1">
          View full regression watch ({totalFlagged} flagged) →
        </Link>
      </div>
    </div>
  )
}