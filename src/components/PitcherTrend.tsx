'use client'

import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import CardExportToolbar from './CardExportToolbar'
import { teamColorById } from '@/lib/lab'

type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: 'pitcher' | 'batter' }
type PitcherTrendPoint = { gameNumber: number; date: string; era: number | null; whip: number | null; k9: number | null; fip: number | null }

const METRICS: { key: 'era' | 'whip' | 'k9' | 'fip'; label: string; format: (v: number) => string }[] = [
  { key: 'era', label: 'ERA', format: v => v.toFixed(2) },
  { key: 'whip', label: 'WHIP', format: v => v.toFixed(2) },
  { key: 'k9', label: 'K/9', format: v => v.toFixed(1) },
  { key: 'fip', label: 'FIP', format: v => v.toFixed(2) },
]
const FALLBACK_COLORS = ['#FF5722', '#1A1A1A', '#2563EB', '#15803D']

function headshotUrl(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_180,q_auto:best/v1/people/${id}/headshot/67/current`
}

export default function PitcherTrendChart({ players }: { players: SelectedPlayer[] }) {
  const pitchers = players.filter(p => p.subjectType === 'pitcher')
  const [metric, setMetric] = useState<'era' | 'whip' | 'k9' | 'fip'>('era')
  const [series, setSeries] = useState<Record<number, PitcherTrendPoint[]>>({})
  const [teamIds, setTeamIds] = useState<Record<number, number | null>>({})
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pitchers.length === 0) return
    setLoading(true)
    Promise.all(pitchers.map(p =>
      fetch(`/api/lab/pitcher-trend?id=${p.id}`).then(r => r.json()).then(j => [p.id, j.points ?? [], j.teamId ?? null] as const)
    ))
      .then(entries => {
        setSeries(Object.fromEntries(entries.map(([id, pts]) => [id, pts])))
        setTeamIds(Object.fromEntries(entries.map(([id, , teamId]) => [id, teamId])))
      })
      .finally(() => setLoading(false))
  }, [pitchers.map(p => p.id).join(',')])

  if (pitchers.length === 0) return null

  const maxGames = Math.max(0, ...Object.values(series).map(pts => pts.length))
  const chartData = Array.from({ length: maxGames }, (_, i) => {
    const row: Record<string, number | null> = { gameNumber: i + 1 }
    for (const p of pitchers) row[String(p.id)] = series[p.id]?.[i]?.[metric] ?? null
    return row
  })
  const metricMeta = METRICS.find(m => m.key === metric)!

  function colorFor(p: SelectedPlayer, i: number): string {
    const teamId = teamIds[p.id]
    return teamId ? teamColorById(teamId) : FALLBACK_COLORS[i % FALLBACK_COLORS.length]
  }

  function makeDotRenderer(p: SelectedPlayer, color: string) {
    const lastGameNumber = series[p.id]?.length ?? 0
    const size = 26
    const clipId = `pitcher-avatar-clip-${p.id}`
    return (props: any) => {
      const { cx, cy, payload } = props
      if (payload.gameNumber !== lastGameNumber || cx == null || cy == null) return <g key={`empty-${p.id}-${payload.gameNumber}`} />
      return (
        <g key={`avatar-${p.id}`}>
          <defs><clipPath id={clipId}><circle cx={cx} cy={cy} r={size / 2} /></clipPath></defs>
          <circle cx={cx} cy={cy} r={size / 2 + 2} fill={color} />
          <image x={cx - size / 2} y={cy - size / 2} width={size} height={size} href={headshotUrl(p.id)} clipPath={`url(#${clipId})`} />
          <circle cx={cx} cy={cy} r={size / 2 + 2} fill="none" stroke="#FFFFFF" strokeWidth={2} />
        </g>
      )
    }
  }

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Pitcher season trend</div>
        <div className="flex items-center gap-3">
          <CardExportToolbar targetRef={chartRef} fileName={`pitcher-trend-${metric}-the-edge`} />
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
      {loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 16, right: 32, bottom: 0, left: 0 }}>
              <XAxis dataKey="gameNumber" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} label={{ value: 'Start #', position: 'insideBottom', offset: -2, fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} tickFormatter={v => metricMeta.format(v)} width={50} domain={['auto', 'auto']} />
              <Tooltip formatter={(value) => { const v = Array.isArray(value) ? value[0] : value; return typeof v === 'number' ? metricMeta.format(v) : '—' }} labelFormatter={l => `Start ${l}`} />
              <Legend formatter={(value: string) => pitchers.find(p => String(p.id) === value)?.fullName ?? value} wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
              {pitchers.map((p, i) => {
                const color = colorFor(p, i)
                return <Line key={p.id} type="monotone" dataKey={String(p.id)} stroke={color} strokeWidth={2} dot={makeDotRenderer(p, color)} connectNulls name={String(p.id)} />
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}