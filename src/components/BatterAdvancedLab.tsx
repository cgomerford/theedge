'use client'

// src/components/BatterAdvancedLab.tsx
//
// Pro Lab — batter advanced tab UI. Consumes /api/pro-lab/batter.
// Mirrors PitcherAdvancedLab.tsx structure exactly — see that file for
// the fuller commentary on empty-state discipline.

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'

type BatterDayNightSplit = {
  day: { games: number; avg: number | null; obp: number | null; slg: number | null }
  night: { games: number; avg: number | null; obp: number | null; slg: number | null }
} | null

type ExitVeloGamePoint = { game_date: string; opponent: string | null; avg_exit_velocity: number | null; max_exit_velocity: number | null; batted_ball_count: number }
type HRHitPoint = { game_date: string; pitcher_name: string | null; pitch_type: string | null; exit_velocity: number | null; hit_distance_ft: number | null; launch_angle: number | null }

type ProLabResponse = {
  dayNight: BatterDayNightSplit
  veloLog: ExitVeloGamePoint[]
  hrLog: HRHitPoint[]
  error?: string
}

const ORANGE = '#FF5722'
const BLACK = '#1A1A1A'

export default function BatterAdvancedLab({ batterId, season }: { batterId: number; season?: number }) {
  const [data, setData] = useState<ProLabResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ batterId: String(batterId) })
    if (season) params.set('season', String(season))
    fetch(`/api/pro-lab/batter?${params}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setData(json) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [batterId, season])

  if (loading) {
    return <p className="text-xs font-mono text-stone-400 py-8 text-center">Loading advanced data…</p>
  }
  if (error || data?.error) {
    return <p className="text-xs font-mono text-red-500 py-8 text-center">{error ?? data?.error}</p>
  }
  if (!data) return null

  return (
    <div className="space-y-10">
      <DayNightSection split={data.dayNight} />
      <ExitVeloSection log={data.veloLog} />
      <HRSection log={data.hrLog} />
    </div>
  );
}

function DayNightSection({ split }: { split: BatterDayNightSplit }) {
  if (!split) {
    return (
      <SectionShell title="Day / Night split">
        <EmptyNote>Not enough decided games this season to split by day/night yet.</EmptyNote>
      </SectionShell>
    )
  }
  return (
    <SectionShell title="Day / Night split">
      <div className="grid grid-cols-2 gap-4">
        <SplitCard label="Day games" stats={split.day} />
        <SplitCard label="Night games" stats={split.night} />
      </div>
    </SectionShell>
  )
}

function SplitCard({ label, stats }: { label: string; stats: { games: number; avg: number | null; obp: number | null; slg: number | null } }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{label} · {stats.games}</div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="AVG" value={stats.avg != null ? stats.avg.toFixed(3).replace(/^0/, '') : '—'} />
        <StatBox label="OBP" value={stats.obp != null ? stats.obp.toFixed(3).replace(/^0/, '') : '—'} />
        <StatBox label="SLG" value={stats.slg != null ? stats.slg.toFixed(3).replace(/^0/, '') : '—'} />
      </div>
    </div>
  )
}

function ExitVeloSection({ log }: { log: ExitVeloGamePoint[] }) {
  const usable = log.filter(p => p.avg_exit_velocity != null)
  if (usable.length === 0) {
    return (
      <SectionShell title="Exit velocity, game by game">
        <EmptyNote>No exit velocity data available — this is one of the unverified Statcast fields, check the pipeline before assuming the data genuinely isn't there.</EmptyNote>
      </SectionShell>
    )
  }
  return (
    <SectionShell title="Exit velocity, game by game">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={usable} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
          <XAxis dataKey="game_date" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize: 9, fontFamily: 'monospace' }} unit=" mph" width={55} />
          <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
          <Line type="monotone" dataKey="avg_exit_velocity" name="Avg EV" stroke={ORANGE} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="max_exit_velocity" name="Max EV" stroke={BLACK} strokeWidth={1} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </SectionShell>
  )
}

function HRSection({ log }: { log: HRHitPoint[] }) {
  if (log.length === 0) {
    return (
      <SectionShell title="Home runs hit">
        <EmptyNote>No home runs logged this season — genuinely could mean zero hit, or that the pipeline hasn't been verified yet.</EmptyNote>
      </SectionShell>
    )
  }
  return (
    <SectionShell title="Home runs hit">
      <div className="mb-4">
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
            <XAxis dataKey="game_date" type="category" tick={{ fontSize: 8, fontFamily: 'monospace' }} name="Date" />
            <YAxis dataKey="hit_distance_ft" tick={{ fontSize: 9, fontFamily: 'monospace' }} unit=" ft" width={50} name="Distance" />
            <ZAxis dataKey="exit_velocity" range={[40, 160]} name="Exit velo" unit=" mph" />
            <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={log} fill={ORANGE} />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-[9px] font-mono text-stone-400 mt-1">Dot size = exit velocity off the bat.</p>
      </div>
      <div className="border border-stone-200 divide-y divide-stone-100">
        {log.map((hr, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 text-xs font-mono">
            <span className="text-stone-500">{hr.game_date}</span>
            <span className="text-stone-700">{hr.pitcher_name ?? '—'}</span>
            <span className="text-stone-400">{hr.pitch_type ?? '—'}</span>
            <span className="font-bold text-stone-900">{hr.hit_distance_ft != null ? `${hr.hit_distance_ft} ft` : '—'}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ {title}</h3>
      {children}
    </section>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-mono font-bold text-stone-900">{value}</div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{label}</div>
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-serif italic text-stone-400 py-6 text-center border border-dashed border-stone-200">
      {children}
    </p>
  )
}
