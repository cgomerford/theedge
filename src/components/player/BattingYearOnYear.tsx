// src/components/player/BattingYearOnYear.tsx
//
// Traditional yearByYear rate stats, charted. Uses data already fetched
// server-side (getPlayerPageData) — no extra request, renders instantly.
// Pitcher version charts ERA/WHIP/K9 instead of AVG/OBP/SLG/OPS.

'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { motion } from 'framer-motion'
import type { YearByYearRow } from '@/lib/player-page'

const BATTER_METRICS = [
  { key: 'avg', label: 'AVG', color: '#FF5722' },
  { key: 'obp', label: 'OBP', color: '#2563EB' },
  { key: 'slg', label: 'SLG', color: '#059669' },
  { key: 'ops', label: 'OPS', color: '#1A1A1A' },
]
const PITCHER_METRICS = [
  { key: 'era', label: 'ERA', color: '#FF5722' },
  { key: 'whip', label: 'WHIP', color: '#2563EB' },
  { key: 'strikeoutsPer9Inn', label: 'K/9', color: '#059669' },
]

export default function BattingYearOnYear({
  rows, isPitcher,
}: {
  rows: YearByYearRow[]
  isPitcher: boolean
}) {
  const metrics = isPitcher ? PITCHER_METRICS : BATTER_METRICS
  const [active, setActive] = useState<string[]>(metrics.map(m => m.key))

  const sorted = [...rows].filter(r => r.season).sort((a, b) => Number(a.season) - Number(b.season))
  const chartData = sorted.map(r => {
    const point: Record<string, string | number | null> = { season: r.season }
    for (const m of metrics) {
      const raw = r.stat[m.key]
      point[m.key] = raw != null && raw !== '-.--' ? Number(raw) : null
    }
    return point
  })

  if (chartData.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="text-xs font-serif italic text-stone-400 text-center py-10">No prior MLB seasons on record.</p>
      </div>
    )
  }

  function toggle(key: string) {
    setActive(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35 }}
      className="bg-white border border-stone-200 rounded-xl p-5"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">Batting · year on year</p>
      <p className="text-xs font-serif text-stone-400 italic mb-4">Traditional rate stats, full career, season by season</p>

      <div className="flex gap-1.5 flex-wrap mb-4">
        {metrics.map(m => (
          <button
            key={m.key}
            onClick={() => toggle(m.key)}
            className="text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 border rounded-full transition"
            style={{
              borderColor: active.includes(m.key) ? m.color : '#e7e5e4',
              background: active.includes(m.key) ? `${m.color}12` : 'transparent',
              color: active.includes(m.key) ? m.color : '#a8a29e',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="season" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} />
          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} domain={['auto', 'auto']} width={44} />
          <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(3) : '—')} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
          {metrics.filter(m => active.includes(m.key)).map(m => (
            <Line key={m.key} type="monotone" dataKey={m.key} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  )
}