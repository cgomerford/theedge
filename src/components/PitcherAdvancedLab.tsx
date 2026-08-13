'use client'

// src/components/PitcherAdvancedLab.tsx
//
// Pro Lab — pitcher advanced tab UI. Consumes /api/pro-lab/pitcher.
// Not wired into any page yet — needs the real /mlb/players/[id] page
// file before the nav button + route slot can be added correctly.
//
// Every section handles its own empty state independently — a Statcast
// hiccup on the velo log shouldn't blank out a working day/night split.
// No fabricated fallback values anywhere; missing data reads as
// "not enough data yet", never a fake 0 or dash-filled row pretending
// to be real.

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'

type DayNightSplit = {
  day: { games: number; era: number | null; whip: number | null; k_per_9: number | null }
  night: { games: number; era: number | null; whip: number | null; k_per_9: number | null }
} | null

type VeloGamePoint = { game_date: string; opponent: string | null; avg_velocity: number | null; max_velocity: number | null; pitch_count: number }
type BreakGamePoint = { game_date: string; pitch_type: string; avg_horizontal_break: number | null; avg_vertical_break: number | null }
type HRAllowedPoint = { game_date: string; batter_name: string | null; pitch_type: string | null; exit_velocity: number | null; hit_distance_ft: number | null; venue: string | null }

type ProLabResponse = {
  dayNight: DayNightSplit
  veloLog: VeloGamePoint[]
  breakLog: BreakGamePoint[]
  hrLog: HRAllowedPoint[]
  error?: string
}

const ORANGE = '#FF5722'
const BLACK = '#1A1A1A'
const YELLOW = '#FDE047'

export default function PitcherAdvancedLab({ pitcherId, season }: { pitcherId: number; season?: number }) {
  const [data, setData] = useState<ProLabResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ pitcherId: String(pitcherId) })
    if (season) params.set('season', String(season))
    fetch(`/api/pro-lab/pitcher?${params}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setData(json) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pitcherId, season])

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
      <VeloSection log={data.veloLog} />
      <BreakSection log={data.breakLog} />
      <HRAllowedSection log={data.hrLog} />
    </div>
  );
}

// ─── Day / Night ────────────────────────────────────────────────────────────

function DayNightSection({ split }: { split: DayNightSplit }) {
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

function SplitCard({ label, stats }: { label: string; stats: { games: number; era: number | null; whip: number | null; k_per_9: number | null } }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{label} · {stats.games}</div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="ERA" value={stats.era != null ? stats.era.toFixed(2) : '—'} />
        <StatBox label="WHIP" value={stats.whip != null ? stats.whip.toFixed(2) : '—'} />
        <StatBox label="K/9" value={stats.k_per_9 != null ? stats.k_per_9.toFixed(1) : '—'} />
      </div>
    </div>
  )
}

// ─── Velocity ───────────────────────────────────────────────────────────────

function VeloSection({ log }: { log: VeloGamePoint[] }) {
  const usable = log.filter(p => p.avg_velocity != null)
  if (usable.length === 0) {
    return (
      <SectionShell title="Velocity, game by game">
        <EmptyNote>No velocity data available — this is one of the unverified Statcast fields, check the pipeline before assuming the data genuinely isn't there.</EmptyNote>
      </SectionShell>
    )
  }
  return (
    <SectionShell title="Velocity, game by game">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={usable} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
          <XAxis dataKey="game_date" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 9, fontFamily: 'monospace' }} unit=" mph" width={55} />
          <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
          <Line type="monotone" dataKey="avg_velocity" name="Avg velo" stroke={ORANGE} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="max_velocity" name="Max velo" stroke={BLACK} strokeWidth={1} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </SectionShell>
  )
}

// ─── Break ──────────────────────────────────────────────────────────────────

function BreakSection({ log }: { log: BreakGamePoint[] }) {
  if (log.length === 0) {
    return (
      <SectionShell title="Pitch break, game by game">
        <EmptyNote>No break data available yet.</EmptyNote>
      </SectionShell>
    )
  }

  const byPitchType = new Map<string, BreakGamePoint[]>()
  for (const p of log) {
    if (!byPitchType.has(p.pitch_type)) byPitchType.set(p.pitch_type, [])
    byPitchType.get(p.pitch_type)!.push(p)
  }

  return (
    <SectionShell title="Pitch break, game by game">
      <p className="text-[10px] font-mono text-stone-400 mb-3">Horizontal / vertical break in inches, per pitch type. Positive vertical = more rise relative to a spinless pitch.</p>
      <div className="space-y-6">
        {Array.from(byPitchType.entries()).map(([pitchType, points]) => (
          <div key={pitchType}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">{pitchType}</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={points} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis dataKey="game_date" tick={{ fontSize: 8, fontFamily: 'monospace' }} />
                <YAxis tick={{ fontSize: 8, fontFamily: 'monospace' }} unit="&quot;" width={40} />
                <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 11 }} />
                <Line type="monotone" dataKey="avg_horizontal_break" name="Horiz." stroke={ORANGE} strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="avg_vertical_break" name="Vert." stroke={BLACK} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ─── HR Allowed ─────────────────────────────────────────────────────────────

function HRAllowedSection({ log }: { log: HRAllowedPoint[] }) {
  if (log.length === 0) {
    return (
      <SectionShell title="Home runs allowed">
        <EmptyNote>No home runs logged this season — genuinely could mean zero allowed, or that the pipeline hasn't been verified yet. Don't read this as "clean" until the Statcast fields are confirmed.</EmptyNote>
      </SectionShell>
    )
  }
  return (
    <SectionShell title="Home runs allowed">
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
            <span className="text-stone-700">{hr.batter_name ?? '—'}</span>
            <span className="text-stone-400">{hr.pitch_type ?? '—'}</span>
            <span className="font-bold text-stone-900">{hr.hit_distance_ft != null ? `${hr.hit_distance_ft} ft` : '—'}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────────────

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
