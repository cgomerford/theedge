'use client'

import PercentileRing from './PercentileRing'
import MetricTip from './MetricTip'

export default function OverlayStatRow({
  label, tooltip, valueAFormatted, valueBFormatted, deltaFormatted, leaderName, leaderColor, isTie, pctA, pctB, percentileUnavailable,
}: {
  label: string
  tooltip: any
  valueAFormatted: string | null
  valueBFormatted: string | null
  deltaFormatted: string | null
  leaderName: string | null
  leaderColor: string
  isTie: boolean
  pctA?: { percentile: number } | null
  pctB?: { percentile: number } | null
  percentileUnavailable?: boolean
}) {
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4 px-2 border-b border-stone-100 last:border-0"
      style={{ background: isTie || !leaderColor ? 'transparent' : `${leaderColor}0D` }}
    >
      {/* Player A side */}
      <div className="flex items-center justify-end gap-3 min-w-0">
        <span className="text-base font-mono font-bold text-stone-700 truncate">{valueAFormatted ?? '—'}</span>
       <div className="flex flex-col items-center shrink-0 w-10">
  {pctA ? (
    <PercentileRing percentile={pctA.percentile} size={40} strokeWidth={4} />
  ) : percentileUnavailable ? (
    <div className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center">
      <span className="text-[6px] font-mono uppercase text-stone-300 leading-tight text-center px-0.5">n/a</span>
    </div>
  ) : (
    <div className="w-10 h-10 rounded-full border-2 border-dashed border-stone-200" />
  )}
  <span className="text-[7px] font-mono uppercase tracking-wider text-stone-400 mt-1">
    {percentileUnavailable ? 'unable to show' : 'pctl'}
  </span>
</div>
      </div>

      {/* Center — stat label + delta */}
      <div className="text-center min-w-[110px]">
        <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">
          <MetricTip tip={tooltip}>{label}</MetricTip>
        </div>
        {deltaFormatted === null ? (
          <div className="text-sm font-mono text-stone-300">—</div>
        ) : isTie ? (
          <div className="text-sm font-mono font-bold text-stone-400">Even</div>
        ) : (
          <>
            <div className="text-lg font-mono font-bold" style={{ color: leaderColor }}>+{deltaFormatted}</div>
            <div className="h-1 w-16 rounded-full mx-auto mt-1" style={{ background: leaderColor }} />
            <div className="text-[9px] font-mono uppercase tracking-wider text-stone-500 mt-0.5 truncate max-w-[110px] mx-auto">{leaderName}</div>
          </>
        )}
      </div>

      {/* Player B side */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col items-center shrink-0">
          {pctB ? <PercentileRing percentile={pctB.percentile} size={40} strokeWidth={4} /> : <div className="w-10 h-10 rounded-full border-2 border-dashed border-stone-200" />}
          <span className="text-[7px] font-mono uppercase tracking-wider text-stone-400 mt-1">pctl</span>
        </div>
        <span className="text-base font-mono font-bold text-stone-700 truncate">{valueBFormatted ?? '—'}</span>
      </div>
    </div>
  )
}

