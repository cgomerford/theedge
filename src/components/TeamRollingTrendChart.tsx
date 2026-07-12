'use client'

import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import CardExportToolbar from './CardExportToolbar'
import { teamColorById } from '@/lib/lab'

type TeamMetric = 'runs_per_game' | 'team_era' | 'errors_per_game' | 'team_ops'
const METRICS: { key: TeamMetric; label: string; format: (v: number) => string }[] = [
  { key: 'runs_per_game', label: 'Runs/game', format: v => v.toFixed(2) },
  { key: 'team_era', label: 'Team ERA', format: v => v.toFixed(2) },
  { key: 'errors_per_game', label: 'Errors/game', format: v => v.toFixed(2) },
  { key: 'team_ops', label: 'Team OPS', format: v => v.toFixed(3) },
]

export default function TeamRollingTrendChart({ teamIds, teamNames }: { teamIds: number[]; teamNames: Record<number, string> }) {
  const [metric, setMetric] = useState<TeamMetric>('runs_per_game')
  const [allSeries, setAllSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/lab/team-trend-chart?metric=${metric}&window=10`)
      .then(r => r.json())
      .then(j => setAllSeries(j.series ?? []))
      .finally(() => setLoading(false))
  }, [metric])

  const relevant = allSeries.filter((s: any) => teamIds.includes(s.teamId))
  const maxGames = Math.max(0, ...relevant.map((s: any) => s.points.length))
  const chartData = Array.from({ length: maxGames }, (_, i) => {
    const row: Record<string, number | null> = { gameIndex: i + 1 }
    for (const s of relevant) row[String(s.teamId)] = s.points[i]?.value ?? null
    return row
  })
  const metricMeta = METRICS.find(m => m.key === metric)!

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Team rolling trend (10-game window)</div>
        <div className="flex items-center gap-3">
          <CardExportToolbar targetRef={chartRef} fileName={`team-trend-${metric}-the-edge`} />
          <div className="flex gap-1">
            {METRICS.map(m => (
              <button key={m.key} type="button" onClick={() => setMetric(m.key)}
                className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 border ${metric === m.key ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {teamIds.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">Add teams above to see their trend.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis dataKey="gameIndex" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
              <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} tickFormatter={v => metricMeta.format(v)} width={50} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: any) => typeof v === 'number' ? metricMeta.format(v) : '—'} labelFormatter={l => `Game ${l}`} />
              <Legend formatter={(value: string) => teamNames[Number(value)] ?? value} wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
              {teamIds.map(id => (
                <Line key={id} type="monotone" dataKey={String(id)} stroke={teamColorById(id)} strokeWidth={2} dot={false} connectNulls name={String(id)} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}