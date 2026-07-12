'use client'

import PercentileRing from './PercentileRing'

export type BarDatum = { id: string; name: string; color: string; value: number; formatted: string; percentile?: number | null }

export default function HorizontalBarCompareBase({ data, higherIsBetter }: { data: BarDatum[]; higherIsBetter: boolean }) {
  const sorted = [...data].sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value)
  const max = Math.max(...sorted.map(d => Math.abs(d.value)), 1)
  return (
    <div className="space-y-3">
      {sorted.map((d, i) => (
        <div key={d.id} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs font-mono font-bold text-stone-700 truncate">{i === 0 ? '🏆 ' : ''}{d.name}</span>
          <div className="flex-1 h-4 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full flex items-center justify-end pr-2" style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: d.color, minWidth: '32px' }}>
              <span className="text-[9px] font-mono font-bold text-white">{d.formatted}</span>
            </div>
          </div>
          {typeof d.percentile === 'number' && <PercentileRing percentile={d.percentile} size={26} strokeWidth={3} />}
        </div>
      ))}
    </div>
  )
}