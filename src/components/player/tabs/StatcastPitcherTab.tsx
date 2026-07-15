'use client'

import { useEffect, useState } from 'react'
import type { PitcherStatcastFull, PitchInArsenal } from '@/lib/player-statcast-full'

export default function StatcastPitcherTab({ playerId }: { playerId: number }) {
  const [data, setData] = useState<PitcherStatcastFull | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/player/statcast-full/${playerId}?type=pitcher`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setData(j) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerId])

  if (loading) {
    return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">Loading Statcast…</p>
  }
  if (!data) {
    return <p className="text-xs font-serif italic text-stone-400 py-8 text-center">Below qualifier threshold for Statcast rankings.</p>
  }

  return (
    <div className="space-y-5">
      {/* ── Overall ─────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
          ⊕ Overall
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <StatCell label="xERA" value={fmt2(data.xera)} rank={data.ranks.xera != null ? 100 - data.ranks.xera : null} />
          <StatCell label="xBA" value={fmt3(data.xba)} rank={data.ranks.xba != null ? 100 - data.ranks.xba : null} />
          <StatCell label="xSLG" value={fmt3(data.xslg)} rank={data.ranks.xslg != null ? 100 - data.ranks.xslg : null} />
          <StatCell label="xwOBA" value={fmt3(data.xwoba)} rank={data.ranks.xwoba != null ? 100 - data.ranks.xwoba : null} />
          <StatCell label="FB velo" value={fmtMph(data.avg_fastball_velo)} rank={data.ranks.fastball_velo} />
          <StatCell label="Whiff%" value={fmtPct(data.whiff_pct)} rank={data.ranks.whiff_pct} />
          <StatCell label="Chase%" value={fmtPct(data.chase_pct)} rank={data.ranks.chase_pct} />
          <StatCell label="K%" value={fmtPct(data.k_pct)} rank={data.ranks.k_pct} />
          <StatCell label="BB%" value={fmtPct(data.bb_pct)} rank={data.ranks.bb_pct != null ? 100 - data.ranks.bb_pct : null} />
          <StatCell label="K-BB%" value={fmtPct(data.k_bb_pct)} rank={null} />
        </div>
      </div>

      {/* ── Contact allowed ────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
          ⊕ Contact against
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <StatCell label="Barrel% allowed" value={fmtPct(data.barrel_pct_allowed)} rank={data.ranks.barrel_pct != null ? 100 - data.ranks.barrel_pct : null} />
          <StatCell label="Hard-hit% allowed" value={fmtPct(data.hard_hit_pct_allowed)} rank={data.ranks.hard_hit_pct != null ? 100 - data.ranks.hard_hit_pct : null} />
          <StatCell label="GB%" value={fmtPct(data.gb_pct)} rank={data.ranks.gb_pct} />
          <StatCell label="FB%" value={fmtPct(data.fb_pct)} rank={null} />
        </div>
      </div>

      {/* ── Arsenal ────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
            ⊕ Arsenal
          </div>
          <div className="text-[9px] font-mono text-stone-400">
            {data.arsenal.length} pitches thrown
          </div>
        </div>
        {data.arsenal.length === 0 ? (
          <p className="px-5 py-6 text-xs font-serif italic text-stone-400 text-center">
            No arsenal data — may be below Savant's per-pitch minimum (10 thrown).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50">
                <tr>
                  {['Pitch', 'Usage%', 'Velo', 'Spin', 'IVB', 'HB', 'Whiff%', 'Put-away%', 'xwOBA', 'RV/100'].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[9px] font-mono uppercase tracking-widest text-stone-500 whitespace-nowrap ${h === 'Pitch' ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.arsenal.map((p, i) => (
                  <ArsenalRow key={`${p.pitch_type}-${i}`} pitch={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ArsenalRow({ pitch }: { pitch: PitchInArsenal }) {
  const rvColor = pitch.run_value_per_100 == null ? 'text-stone-400'
    : pitch.run_value_per_100 <= -2 ? 'text-green-600 font-bold'
    : pitch.run_value_per_100 <= 0 ? 'text-green-600'
    : pitch.run_value_per_100 <= 2 ? 'text-orange-500'
    : 'text-red-600 font-bold'

  return (
    <tr className="border-t border-stone-50 hover:bg-stone-50/50">
      <td className="px-3 py-2 font-serif text-stone-800 whitespace-nowrap">
        <span className="font-semibold">{pitch.pitch_name || pitch.pitch_type}</span>
        <span className="ml-2 text-[10px] font-mono text-stone-400">{pitch.pitch_type}</span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{fmtPct(pitch.usage_pct)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{fmtMph(pitch.velocity)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{pitch.spin_rate != null ? `${Math.round(pitch.spin_rate)}` : '—'}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{pitch.vertical_break != null ? `${pitch.vertical_break.toFixed(1)}"` : '—'}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{pitch.horizontal_break != null ? `${pitch.horizontal_break.toFixed(1)}"` : '—'}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{fmtPct(pitch.whiff_pct)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{fmtPct(pitch.put_away_pct)}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">{fmt3(pitch.xwoba)}</td>
      <td className={`px-3 py-2 text-right font-mono tabular-nums ${rvColor}`}>
        {pitch.run_value_per_100 != null ? (pitch.run_value_per_100 > 0 ? '+' : '') + pitch.run_value_per_100.toFixed(1) : '—'}
      </td>
    </tr>
  )
}

function StatCell({ label, value, rank }: { label: string; value: string; rank: number | null }) {
  const color = rank == null ? '#a8a29e' : rank >= 75 ? '#059669' : rank >= 50 ? '#f59e0b' : rank >= 25 ? '#f97316' : '#dc2626'
  return (
    <div className="bg-stone-50 rounded-lg p-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-lg font-mono font-bold text-stone-900 tabular-nums mt-0.5">{value}</div>
      {rank != null && (
        <>
          <div className="mt-2 h-1 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${rank}%`, background: color }} />
          </div>
          <div className="mt-1 text-[9px] font-mono tabular-nums" style={{ color }}>
            {Math.round(rank)}th %ile
          </div>
        </>
      )}
    </div>
  )
}

function fmt2(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(2)
}
function fmt3(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(3).replace(/^0\./, '.')
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}
function fmtMph(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} mph`
}