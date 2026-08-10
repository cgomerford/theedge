'use client'

// src/components/player/StatsPercentilesRail.tsx
//
// REBUILT 2026-08 to match Savant's own percentile-ranking visual language
// (see reference screenshot in chat) rather than a generic filled bar:
// full-width blue→grey→red track (POOR → GREAT), with a circular badge
// positioned at the actual percentile location — not a bar fill amount.
// This is the same information as before, drawn the way George's own
// primary data source draws it, which is the whole point of the request.
//
// Pitcher list stays short (era/whip/k9 + 3 Statcast dials = 6 rows) —
// that's a real data-availability limit, not a bug: lib/lab.ts's
// LEADER_METRICS only has 3 pitcher-scoped categories (see
// /api/stats/percentile's own header comment on why 'strikeOuts' isn't
// safely reusable for pitchers). Batters get up to 13 rows.

import { motion } from 'framer-motion'

function pctColor(p: number): string {
  if (p >= 90) return '#059669'
  if (p >= 75) return '#16a34a'
  if (p >= 50) return '#f59e0b'
  if (p >= 25) return '#f97316'
  return '#dc2626'
}

function SavantBar({ label, percentile }: { label: string; percentile: number }) {
  const color = pctColor(percentile)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-600 font-semibold">{label}</span>
        <span className="font-mono text-[9px] text-stone-400">{percentile}th pctile</span>
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #3B82F6, #E7E5E4 50%, #DC2626)' }}>
        <div
          className="absolute top-1/2 flex items-center justify-center rounded-full font-mono font-bold tabular-nums text-white shadow-sm"
          style={{
            left: `${percentile}%`, transform: 'translate(-50%, -50%)',
            width: 26, height: 26, background: color, fontSize: 10,
            border: '2px solid white',
          }}
        >
          {percentile}
        </div>
      </div>
    </div>
  )
}

export default function StatsPercentilesRail({
  seasonStatRows, percentileRows,
}: {
  seasonStatRows: { key: string; label: string; value: string }[]
  percentileRows: { key: string; label: string; percentile: number | null }[]
}) {
  const ranked = percentileRows.filter(
    (r): r is { key: string; label: string; percentile: number } => r.percentile != null
  ).sort((a, b) => b.percentile - a.percentile)

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">This season</p>
        <div className="space-y-2">
          {seasonStatRows.map(r => (
            <div key={r.key} className="flex items-center justify-between border-b border-stone-50 pb-1.5 last:border-0 last:pb-0">
              <span className="font-serif italic text-xs text-stone-500">{r.label}</span>
              <span className="font-mono text-sm font-bold text-stone-900">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">2026 Percentile Rankings</p>
        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-[8px] uppercase tracking-widest text-blue-500">Poor</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-stone-400">Average</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-red-600">Great</span>
        </div>
        {ranked.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400 py-6 text-center">Not enough sample to rank yet.</p>
        ) : (
          <div className="space-y-6">
            {ranked.map(r => <SavantBar key={r.key} label={r.label} percentile={r.percentile} />)}
          </div>
        )}
      </div>
    </motion.div>
  )
}