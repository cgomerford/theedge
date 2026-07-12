'use client'

import { useState, useEffect, useRef } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import CardExportToolbar from './CardExportToolbar'
import { PITCHER_STAT_GROUPS, BATTER_STAT_GROUPS } from '@/lib/player-stats'
import { teamColorById } from '@/lib/lab'

type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: 'pitcher' | 'batter' }
const FALLBACK_COLORS = ['#FF5722', '#1A1A1A', '#2563EB', '#15803D']

// Only cares about key/label — both StatDef and BatterStatMeta satisfy this
// shape structurally, so one helper works for either group array. Calling
// it separately per branch (rather than flatMap-ing a ternary union of
// PITCHER_STAT_GROUPS | BATTER_STAT_GROUPS directly) sidesteps a TS
// generic-inference quirk where flatMap over a union of differently-shaped
// arrays fails to type-check even though the actual data is fine.
type StatOption = { key: string; label: string }

function toStatOptions(groups: { stats: { key: string; label: string }[] }[]): StatOption[] {
  return groups.flatMap(g => g.stats.map(s => ({ key: s.key, label: s.label })))
}

export default function ScatterCompareChart({ players }: { players: SelectedPlayer[] }) {
  const [subjectType, setSubjectType] = useState<'pitcher' | 'batter'>('batter')
  const pool = players.filter(p => p.subjectType === subjectType)
  const statOptions: StatOption[] = subjectType === 'pitcher' ? toStatOptions(PITCHER_STAT_GROUPS) : toStatOptions(BATTER_STAT_GROUPS)
  const [xKey, setXKey] = useState('')
  const [yKey, setYKey] = useState('')
  const [points, setPoints] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opts = subjectType === 'pitcher' ? toStatOptions(PITCHER_STAT_GROUPS) : toStatOptions(BATTER_STAT_GROUPS)
    setXKey(opts[0]?.key ?? '')
    setYKey(opts[1]?.key ?? opts[0]?.key ?? '')
  }, [subjectType])

  useEffect(() => {
    if (pool.length === 0 || !xKey || !yKey) { setPoints([]); return }
    setLoading(true)
    const url = (p: SelectedPlayer) => subjectType === 'pitcher' ? `/api/lab/pitcher-card?id=${p.id}` : `/api/lab/batter-card?id=${p.id}&mode=single`
    Promise.all(pool.map(p => fetch(url(p)).then(r => r.json()).then(j => ({ p, j }))))
      .then(results => {
        setPoints(results.map(({ p, j }, i) => {
          const get = (key: string) => subjectType === 'pitcher'
            ? (typeof j.stats?.[key] === 'number' ? j.stats[key] : null)
            : (() => { const row = (j.season ?? []).find((r: any) => r.key === key); return row ? parseFloat(row.value) : null })()
          return {
            name: p.fullName, x: get(xKey), y: get(yKey),
            color: j.teamId ? teamColorById(j.teamId) : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          }
        }).filter(pt => pt.x !== null && pt.y !== null && !isNaN(pt.x) && !isNaN(pt.y)))
      })
      .finally(() => setLoading(false))
  }, [pool.map(p => p.id).join(','), subjectType, xKey, yKey])

  const xLabel = statOptions.find(s => s.key === xKey)?.label ?? xKey
  const yLabel = statOptions.find(s => s.key === yKey)?.label ?? yKey

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Scatter</div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {(['batter', 'pitcher'] as const).map(t => (
              <button key={t} type="button" onClick={() => setSubjectType(t)}
                className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 border ${subjectType === t ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500'}`}>
                {t === 'batter' ? 'Batters' : 'Pitchers'}
              </button>
            ))}
          </div>
          <span className="text-[9px] font-mono text-stone-400">X:</span>
          <select value={xKey} onChange={e => setXKey(e.target.value)} className="text-[10px] font-mono border border-stone-300 px-2 py-1 uppercase">
            {statOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span className="text-[9px] font-mono text-stone-400">Y:</span>
          <select value={yKey} onChange={e => setYKey(e.target.value)} className="text-[10px] font-mono border border-stone-300 px-2 py-1 uppercase">
            {statOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <CardExportToolbar targetRef={chartRef} fileName={`scatter-${xKey}-vs-${yKey}-the-edge`} />
        </div>
      </div>
      {pool.length === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-6">No {subjectType}s selected above.</p>
      ) : loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <div ref={chartRef} className="border border-stone-200 bg-white p-4">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 0 }}>
              <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 9, fontFamily: 'monospace' }} />
              <ZAxis range={[100, 100]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                if (!payload || payload.length === 0) return null
                const d = payload[0].payload
                return <div className="bg-[#1A1A1A] text-white text-[10px] font-mono px-2 py-1 rounded">{d.name}: {xLabel} {d.x}, {yLabel} {d.y}</div>
              }} />
              <Scatter data={points} shape="circle">
                {points.map((p, i) => <Cell key={i} fill={p.color} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}