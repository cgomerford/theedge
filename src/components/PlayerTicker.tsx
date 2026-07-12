'use client'

import { useState, useEffect } from 'react'
import { LEADER_METRICS } from '@/lib/lab'

type LeaderRow = { rank: number; personId: number; teamId?: number; name: string; team: string; value: number }
type Person = { id: number; fullName: string; primaryPosition: string }

const METRIC_OPTIONS = Object.keys(LEADER_METRICS) as (keyof typeof LEADER_METRICS)[]

export default function PlayerTicker({ onAdd, selectedIds }: { onAdd: (p: Person) => void; selectedIds: number[] }) {
  const [metric, setMetric] = useState<keyof typeof LEADER_METRICS>('avg')
  const [rows, setRows] = useState<LeaderRow[]>([])
  const [group, setGroup] = useState<'pitching' | 'hitting'>('hitting')

  useEffect(() => {
    fetch(`/api/lab/top50?metric=${metric}`)
      .then(r => r.json())
      .then(j => { setRows(j.rows ?? []); setGroup(j.group ?? 'hitting') })
      .catch(() => setRows([]))
  }, [metric])

  const meta = LEADER_METRICS[metric]
  const format = (v: number) => metric === 'era' || metric === 'whip' ? v.toFixed(2) : metric === 'ops' || metric === 'slg' || metric === 'obp' || metric === 'avg' ? v.toFixed(3) : String(v)

  return (
    <div className="border-b border-stone-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-stone-100">
        <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 shrink-0">Top 50</span>
        <select value={metric} onChange={e => setMetric(e.target.value as keyof typeof LEADER_METRICS)} className="text-[9px] font-mono border border-stone-300 px-1.5 py-0.5 uppercase">
          {METRIC_OPTIONS.map(m => <option key={m} value={m}>{LEADER_METRICS[m].label}</option>)}
        </select>
      </div>
      <div className="overflow-hidden relative py-2">
        <div className="ticker-track flex gap-6 whitespace-nowrap w-max">
          {[...rows, ...rows].map((r, i) => {
            const already = selectedIds.includes(r.personId)
            return (
              <button
                key={`${r.personId}-${i}`}
                type="button"
                disabled={already}
                onClick={() => onAdd({ id: r.personId, fullName: r.name, primaryPosition: group === 'pitching' ? 'P' : '' })}
                className={`flex items-center gap-1.5 text-xs font-mono shrink-0 ${already ? 'opacity-30 cursor-default' : 'hover:text-[#FF5722]'}`}
              >
                <span className="text-stone-400">#{r.rank}</span>
                <span className="font-bold text-stone-800">{r.name}</span>
                <span className="text-stone-400">{r.team}</span>
                <span className="font-bold" style={{ color: '#FF5722' }}>{format(r.value)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <style jsx>{`
        .ticker-track {
          animation: ticker-scroll 350s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}