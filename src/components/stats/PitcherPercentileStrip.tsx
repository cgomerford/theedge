'use client'

import type { PercentileStat } from '@/lib/pitcher-percentiles'

const TIER_COLOR: Record<string, string> = {
  elite: '#16A34A',
  above: '#65A30D',
  average: '#D97706',
  below: '#DC2626',
}
const TIER_LABEL: Record<string, string> = {
  elite: 'Elite',
  above: 'Above avg',
  average: 'Average',
  below: 'Below',
}

export default function PitcherPercentileStrip({
  stats, qualified,
}: {
  stats: PercentileStat[]
  qualified: boolean
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Statcast</p>
        {!qualified && (
          <span className="text-[10px] font-mono text-amber-600">⚠ not qualified vs MLB</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => {
          const color = s.tier ? TIER_COLOR[s.tier] : '#a89e8c'
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{s.label}</span>
                {s.percentile != null && <span className="text-[9px] font-mono text-stone-400">{s.percentile}th</span>}
              </div>
              <div className="text-lg font-mono font-bold text-stone-900 mb-1.5">{s.value}</div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full" style={{ width: `${s.percentile ?? 0}%`, background: color }} />
              </div>
              {s.tier && <span className="text-[9px] font-mono font-bold uppercase" style={{ color }}>{TIER_LABEL[s.tier]}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}