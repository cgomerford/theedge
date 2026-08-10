// src/components/player/PlayerRadarChart.tsx
//
// Player profile radar — reuses the SAME percentile inputs as
// SignatureSummary and the season grade (dials + leaderboard percentiles),
// just visualized as a radar. No new percentile source — same honesty
// rule as player-grade.ts: only plots axes with a REAL percentile, never
// fabricates a midpoint for a missing one.
//
// EXTENDED 2026-08: expand button opens a larger version in ChartModal.

'use client'

import { useState } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'
import { motion } from 'framer-motion'
import type { SignatureDial } from '@/lib/player-signature'
import ChartModal from './ChartModal'

function RadarPlot({ axes, color, height }: { axes: { axis: string; value: number }[]; color: string; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={axes} outerRadius="72%">
        <PolarGrid stroke="#e7e5e4" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#78716c' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v}th pctile` : '—')} />
        <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export default function PlayerRadarChart({
  dials, leaderboardPercentiles, color,
}: {
  dials: SignatureDial[]
  leaderboardPercentiles: { key: string; label: string; percentile: number | null }[]
  color: string
}) {
  const [open, setOpen] = useState(false)

  const axes = [
    ...dials.filter(d => d.percentile != null).map(d => ({ axis: d.label, value: d.percentile! })),
    ...leaderboardPercentiles.filter(p => p.percentile != null).map(p => ({ axis: p.label, value: p.percentile! })),
  ]

  if (axes.length < 3) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex items-center justify-center h-64">
        <p className="text-xs font-serif italic text-stone-400 text-center">Not enough ranked metrics yet for a radar profile.</p>
      </div>
    )
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Radar</p>
          <button onClick={() => setOpen(true)} className="font-mono text-[9px] uppercase tracking-widest text-orange-600 hover:text-orange-700 transition">
            Expand ⤢
          </button>
        </div>
        <p className="text-xs font-serif text-stone-400 italic mb-3">Percentile vs league, each axis</p>
        <RadarPlot axes={axes} color={color} height={240} />
      </motion.div>

      <ChartModal open={open} onClose={() => setOpen(false)} title="Radar — Percentile vs league">
        <RadarPlot axes={axes} color={color} height={480} />
      </ChartModal>
    </>
  )
}