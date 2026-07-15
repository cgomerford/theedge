'use client'

import { useEffect, useState } from 'react'
import type { BatterStatcastFull } from '@/lib/player-statcast-full'

export default function StatcastBatterTab({
  playerId, positionAbbr,
}: {
  playerId: number
  positionAbbr: string
}) {
  const [data, setData] = useState<BatterStatcastFull | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/player/statcast-full/${playerId}?type=batter`, { cache: 'no-store' })
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
      <StatcastGroup
        title="Expected stats"
        note="Based on batted-ball quality — strips out luck of hit placement."
        stats={[
          { label: 'xBA', value: fmt3(data.xba), rank: data.ranks.xba },
          { label: 'xSLG', value: fmt3(data.xslg), rank: data.ranks.xslg },
          { label: 'xwOBA', value: fmt3(data.xwoba), rank: data.ranks.xwoba },
          { label: 'xISO', value: fmt3(data.xiso), rank: null },
          { label: 'xBABIP', value: fmt3(data.xbabip), rank: null },
        ]}
      />

      <StatcastGroup
        title="Contact quality"
        stats={[
          { label: 'Avg EV', value: fmtMph(data.avg_exit_velocity), rank: data.ranks.exit_velocity },
          { label: 'Max EV', value: fmtMph(data.max_exit_velocity), rank: null },
          { label: 'Hard-hit%', value: fmtPct(data.hard_hit_pct), rank: data.ranks.hard_hit_pct },
          { label: 'Barrel%', value: fmtPct(data.barrel_pct), rank: data.ranks.barrel_pct },
          { label: 'Barrel/BBE%', value: fmtPct(data.barrel_per_bbe), rank: null },
          { label: 'Sweet spot%', value: fmtPct(data.sweet_spot_pct), rank: null },
          { label: 'Avg LA', value: fmtDeg(data.avg_launch_angle), rank: null },
        ]}
      />

      <StatcastGroup
        title="Batted-ball profile"
        stats={[
          { label: 'GB%', value: fmtPct(data.gb_pct), rank: null },
          { label: 'LD%', value: fmtPct(data.ld_pct), rank: null },
          { label: 'FB%', value: fmtPct(data.fb_pct), rank: null },
          { label: 'Popup%', value: fmtPct(data.popup_pct), rank: null },
          { label: 'Pull%', value: fmtPct(data.pull_pct), rank: null },
          { label: 'Straight%', value: fmtPct(data.straight_pct), rank: null },
          { label: 'Oppo%', value: fmtPct(data.oppo_pct), rank: null },
        ]}
      />

      <StatcastGroup
        title="Plate discipline"
        stats={[
          { label: 'Chase%', value: fmtPct(data.chase_pct), rank: data.ranks.chase_pct != null ? 100 - data.ranks.chase_pct : null },
          { label: 'Whiff%', value: fmtPct(data.whiff_pct), rank: data.ranks.whiff_pct != null ? 100 - data.ranks.whiff_pct : null },
          { label: 'Zone contact%', value: fmtPct(data.zone_contact_pct), rank: null },
          { label: 'OZ contact%', value: fmtPct(data.oz_contact_pct), rank: null },
          { label: 'K%', value: fmtPct(null), rank: data.ranks.k_pct != null ? 100 - data.ranks.k_pct : null },
          { label: 'BB%', value: fmtPct(null), rank: data.ranks.bb_pct },
        ]}
      />

      <StatcastGroup
        title="Speed & baserunning"
        stats={[
          { label: 'Sprint speed', value: data.sprint_speed != null ? `${data.sprint_speed.toFixed(1)} ft/s` : '—', rank: data.ranks.sprint_speed },
          { label: 'Bolts (30+ ft/s)', value: data.bolts != null ? String(data.bolts) : '—', rank: null },
        ]}
      />
    </div>
  )
}

// ─── UI ───────────────────────────────────────────────────────────────────

function StatcastGroup({
  title, note, stats,
}: {
  title: string
  note?: string
  stats: { label: string; value: string; rank: number | null }[]
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">
        ⊕ {title}
      </div>
      {note && <p className="text-[10px] font-serif italic text-stone-400 mb-3">{note}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {stats.map((s, i) => (
          <StatCell key={i} {...s} />
        ))}
      </div>
    </div>
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

// ─── Formatters ───────────────────────────────────────────────────────────

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
function fmtDeg(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}°`
}