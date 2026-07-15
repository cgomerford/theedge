'use client'

import { useEffect, useState } from 'react'
import { playerHeadshotUrl, pitchColor } from '@/lib/mlb'
import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'
import PitchUsageDonut from '@/components/PitchUsageDonut'
import PitchArsenalSummary from '@/components/PitchArsenalSummary'
import type { PitcherStatsFull } from '@/lib/pitcher-full-stats'

const statBarRanges: Record<string, [number, number, boolean]> = {
  era: [1.5, 6.0, false],
  whip: [0.7, 1.6, false],
  k_per_9: [4, 13, true],
  bb_per_9: [1, 5, false],
  fip: [1.5, 6.0, false],
  l3_era: [1.5, 6.0, false],
}

function statBarPct(kind: keyof typeof statBarRanges, value: number | null): number {
  if (value == null) return 0
  const [lo, hi, higherIsBetter] = statBarRanges[kind]
  let pct = (value - lo) / (hi - lo)
  if (!higherIsBetter) pct = 1 - pct
  return Math.max(0, Math.min(100, Math.round(pct * 100)))
}

function HeaderStatBar({ label, value, pct, isTrend }: { label: string; value: number | null; pct: number; isTrend?: boolean }) {
  const color = isTrend ? '#D97706' : '#16A34A'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-stone-400">{label}</span>
        <span className="text-[10px] font-mono font-bold text-stone-900">{value != null ? value.toFixed(2) : '—'}</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: value != null ? color : '#e7e2d6' }} />
      </div>
    </div>
  )
}

function PitcherHeaderStats({ stats }: { stats: PitcherStatsFull | null }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 mb-6">
      <div className="grid grid-cols-3 gap-x-5 gap-y-3">
        <HeaderStatBar label="ERA" value={stats?.era ?? null} pct={statBarPct('era', stats?.era ?? null)} />
<HeaderStatBar label="WHIP" value={stats?.k_per_9 != null ? null : null} pct={0} />
        <HeaderStatBar label="K/9" value={stats?.k_per_9 ?? null} pct={statBarPct('k_per_9', stats?.k_per_9 ?? null)} />
        <HeaderStatBar label="BB/9" value={stats?.bb_per_9 ?? null} pct={statBarPct('bb_per_9', stats?.bb_per_9 ?? null)} />
        <HeaderStatBar label="FIP" value={stats?.fip ?? null} pct={statBarPct('fip', stats?.fip ?? null)} />
        <HeaderStatBar label="L3 ERA" value={stats?.l3_era ?? null} pct={statBarPct('l3_era', stats?.l3_era ?? null)} isTrend />
      </div>
    </div>
  )
}

function StatCell({ label, value, format, highlight }: { label: string; value: number | null; format: (v: number) => string; highlight?: 'good' | 'bad' | 'neutral' }) {
  const color = highlight === 'good' ? 'text-green-600' : highlight === 'bad' ? 'text-red-500' : 'text-stone-900'
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-0.5">{label}</div>
      <div className={`text-sm font-mono font-bold ${value !== null ? color : 'text-stone-300'}`}>
        {value !== null ? format(value) : '—'}
      </div>
    </div>
  )
}

function PitchRow({ row }: { row: ArsenalRow }) {
  // Savant's pitch-arsenal-stats CSV stores whiff_percent, k_percent,
  // put_away, hard_hit_percent on a 0-100 scale (24.4 = 24.4%), NOT 0-1.
  // pitch_usage is the one field that IS 0-1 (0.377 = 37.7%). Same class
  // of bug as the pitcher pct vs pct100 formatter fix earlier this session.
  const pct100 = (v: number) => `${v.toFixed(1)}%`         // already 0-100
  const pctFrom01 = (v: number) => `${(v * 100).toFixed(1)}%`  // 0-1 → percent
  const rate = (v: number) => v.toFixed(3).replace(/^0/, '')
  const rv = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`

  const whiffHigh = row.whiffPct !== null && row.whiffPct > 30
  const rvGood = row.runValuePer100 !== null && row.runValuePer100 < -1
  const rvBad = row.runValuePer100 !== null && row.runValuePer100 > 1
  return (
    <div className="border border-stone-100 rounded-xl bg-white p-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: pitchColor(row.pitchType) }} />
        <span className="font-serif font-semibold text-base text-stone-900">{row.pitchName}</span>
        <span className="text-[10px] font-mono text-stone-400 ml-auto">{row.pitches} pitches · {pct100(row.usage)} usage</span>
      </div>
<div className="grid grid-cols-4 md:grid-cols-7 gap-4">
        <StatCell label="Whiff%" value={row.whiffPct} format={pct100} highlight={whiffHigh ? 'good' : 'neutral'} />
        <StatCell label="Put away" value={row.putAway} format={pct100} />
        <StatCell label="K%" value={row.kPct} format={pct100} />
        <StatCell label="wOBA" value={row.woba} format={rate} />
        <StatCell label="xwOBA" value={row.estWoba} format={rate} />
        <StatCell label="Hard hit%" value={row.hardHitPct} format={pct100} />
        <StatCell label="Run value" value={row.runValuePer100} format={rv} highlight={rvGood ? 'good' : rvBad ? 'bad' : 'neutral'} />
      </div>

      <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.usage)}%`, background: pitchColor(row.pitchType), opacity: 0.7 }} />
      </div>
    </div>
  )
}

export default function PitcherArsenalCard({
  pitcherId, pitcherName, abbr, side, fullStats, extra,
}: {
  pitcherId: number
  pitcherName: string
  abbr: string
  side: string
  fullStats: PitcherStatsFull | null
  extra?: React.ReactNode
}) {
  const [rows, setRows] = useState<ArsenalRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/pitcher-arsenal?pitcherId=${pitcherId}&season=${new Date().getFullYear()}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setRows(json.rows ?? []) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pitcherId])

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <img
          src={playerHeadshotUrl(pitcherId)}
          alt={pitcherName}
          className="w-14 h-14 rounded-full object-cover border-2 border-stone-200"
        />
    <div>
          <div className="font-serif font-semibold text-xl text-stone-900">{pitcherName}</div>
          <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">{abbr} · {side}</div>
        </div>
      </div>

      <PitcherHeaderStats stats={fullStats} />

      {loading ? (
        <p className="text-xs font-mono text-stone-400 py-10 text-center">Loading arsenal data…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs font-serif italic text-stone-400 py-10 text-center">No arsenal data available for this pitcher yet.</p>
      ) : (
        <div className="space-y-6">
          <PitchArsenalSummary rows={rows} pitcherName={pitcherName} />
          <PitchUsageDonut rows={rows} />
          <div className="space-y-3">
            {rows.map(r => <PitchRow key={r.pitchType} row={r} />)}
          </div>
        </div>
      )}

      {extra && <div className="mt-8">{extra}</div>}
    </div>
  )
}