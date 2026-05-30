'use client'

import type { PitchType } from '@/lib/mlb'

type Props = {
  arsenal: PitchType[]
  pitcherName: string
}

const PITCH_COLORS: Record<string, string> = {
  FF: '#dc2626', SI: '#ea580c', FC: '#d97706',
  SL: '#7c3aed', ST: '#9333ea', SV: '#1d4ed8',
  CU: '#2563eb', KC: '#0891b2',
  CH: '#059669', FS: '#65a30d', FO: '#65a30d', SC: '#16a34a',
  KN: '#a16207', EP: '#92400e',
}

function StatBadge({ value, good, bad }: { value: string; good?: boolean; bad?: boolean }) {
  return (
    <span className={`font-mono text-xs font-bold tabular-nums ${
      good ? 'text-green-600' : bad ? 'text-red-500' : 'text-stone-700'
    }`}>
      {value}
    </span>
  )
}

export default function PitchArsenalChart({ arsenal, pitcherName }: Props) {
  const pitches = arsenal
    .filter(p => p.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)

  if (pitches.length === 0) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
        <p className="text-sm text-stone-400 italic font-serif">No arsenal data for {pitcherName}</p>
      </div>
    )
  }

  const maxUsage = Math.max(...pitches.map(p => p.percentage))

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-0.5">
          ⊕ Arsenal
        </div>
        <div className="font-serif text-base font-semibold text-stone-900">{pitcherName}</div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-5 py-2 border-b border-stone-100 bg-stone-50">
        <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Pitch</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-12 text-right">Velo</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-14 text-right">Whiff%</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-10 text-right">BAA</span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-14 text-right">Hard%</span>
      </div>

      {/* Pitch rows */}
      <div className="divide-y divide-stone-50">
        {pitches.map((p, i) => {
          const color = PITCH_COLORS[p.pitch_code] ?? '#A3A3A3'
          const usagePct = (p.percentage / maxUsage) * 100

          const whiffGood = (p.whiff_percent ?? 0) >= 30
          const whiffBad  = (p.whiff_percent ?? 99) < 15
          const baaGood   = (p.ba_against ?? 1) < 0.200
          const baaBad    = (p.ba_against ?? 0) > 0.280
          const hardBad   = (p.hard_hit_percent ?? 0) > 40

          return (
            <div key={i} className="px-5 py-3">
              {/* Pitch name + usage bar */}
              <div className="flex items-center gap-3 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="font-mono text-xs font-bold text-stone-900 w-32 shrink-0">{p.pitch_name}</span>
                <div className="flex-1 flex items-center gap-2">
                  {/* Usage bar */}
                  <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${usagePct}%`, backgroundColor: color, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-stone-500 w-10 text-right shrink-0">
                    {p.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 ml-5 pl-3">
                <span className="text-[10px] font-mono text-stone-400">
                  {p.avg_velocity ? `${p.avg_velocity.toFixed(1)} mph` : '–'}
                </span>
                <StatBadge
                  value={p.whiff_percent != null ? `${p.whiff_percent.toFixed(1)}%` : '–'}
                  good={whiffGood} bad={whiffBad}
                />
                <StatBadge
                  value={p.ba_against != null ? `.${Math.round(p.ba_against * 1000).toString().padStart(3, '0')}` : '–'}
                  good={baaGood} bad={baaBad}
                />
                <StatBadge
                  value={p.hard_hit_percent != null ? `${p.hard_hit_percent.toFixed(1)}%` : '–'}
                  bad={hardBad}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Key */}
      <div className="px-5 py-3 bg-stone-50 border-t border-stone-100 flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-[9px] font-mono text-green-600">● Good</span>
        <span className="text-[9px] font-mono text-red-500">● Concern</span>
        <span className="text-[9px] font-mono text-stone-400">Whiff% ≥30 = elite · BAA &lt;.200 = dominant · Hard% &gt;40 = hittable</span>
      </div>
    </div>
  )
}
