'use client'

// src/components/batting-lab/BatterEVLaunchTrend.tsx
//
// Real exit velo and launch angle, by game, across the season — real
// per-batted-ball Statcast fields (launch_speed/launch_angle, only
// populated when the ball was actually put in play), averaged per game.
// Plus 4 more real trend panels: rolling OPS, rolling EV (smoothed —
// distinct from the raw per-game EV chart above it), rolling hard-hit%,
// and whiff% by pitch type over time (monthly). Every panel stays on its
// own single y-axis — no dual-axis charts, per house dataviz rule; "OPS
// vs EV" and "whiff vs pitch type" become small multiples instead of one
// combined chart.

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { BatterPitchLog } from '@/lib/batter-pitch-log'

const SEASON = new Date().getFullYear()
const AXIS_TICK = { fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }
const NO_ANIM = { isAnimationActive: false } as const
const OPS_WINDOW = 15 // games
const EV_WINDOW = 10 // games
const HARDHIT_WINDOW = 15 // games
const HARD_HIT_MPH = 95 // real MLB definition
const TOP_PITCH_TYPES = 5

const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }

function shortDate(d: string): string {
  const parts = d.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d
}
function fmtRate(v: number | null): string {
  return v == null ? '—' : v.toFixed(3).replace(/^0\./, '.')
}

type GameAgg = {
  date: string
  ab: number; h: number; tb: number; bb: number; hbp: number
  battedBalls: number; sumEV: number; hardHit: number
}

export default function BatterEVLaunchTrend({ batterId }: { batterId: number }) {
  const [log, setLog] = useState<BatterPitchLog | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batter-pitch-log?batterId=${batterId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [batterId])

  const byGame = useMemo(() => {
    if (!log || log === 'error') return []
    const map = new Map<string, { ev: number[]; la: number[] }>()
    for (const p of log.pitches) {
      if (p.launchSpeed == null) continue
      if (!map.has(p.date)) map.set(p.date, { ev: [], la: [] })
      const d = map.get(p.date)!
      d.ev.push(p.launchSpeed)
      if (p.launchAngle != null) d.la.push(p.launchAngle)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date: shortDate(date), fullDate: date,
        avgEV: Math.round((d.ev.reduce((s, v) => s + v, 0) / d.ev.length) * 10) / 10,
        avgLA: d.la.length > 0 ? Math.round((d.la.reduce((s, v) => s + v, 0) / d.la.length) * 10) / 10 : null,
        battedBalls: d.ev.length,
      }))
  }, [log])

  // Full per-game real box-score-style aggregate — AB/H/TB/BB/HBP (for
  // rolling OPS) and hard-hit count (for rolling hard-hit%), from the
  // same real per-pitch result field used everywhere else in this app.
  const gameAggs = useMemo<GameAgg[]>(() => {
    if (!log || log === 'error') return []
    const map = new Map<string, GameAgg>()
    for (const p of log.pitches) {
      if (!map.has(p.date)) map.set(p.date, { date: p.date, ab: 0, h: 0, tb: 0, bb: 0, hbp: 0, battedBalls: 0, sumEV: 0, hardHit: 0 })
      const g = map.get(p.date)!
      const r = p.result ?? ''
      if (AB_EVENTS.has(r)) {
        g.ab++
        if (HIT_EVENTS.has(r)) { g.h++; g.tb += TOTAL_BASES[r] ?? 0 }
      }
      if (r === 'walk') g.bb++
      if (r === 'hit_by_pitch') g.hbp++
      if (p.launchSpeed != null) {
        g.battedBalls++
        g.sumEV += p.launchSpeed
        if (p.launchSpeed >= HARD_HIT_MPH) g.hardHit++
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [log])

  const rollingOPS = useMemo(() => {
    const out: { date: string; fullDate: string; ops: number | null; games: number }[] = []
    for (let i = 0; i < gameAggs.length; i++) {
      const window = gameAggs.slice(Math.max(0, i - OPS_WINDOW + 1), i + 1)
      const ab = window.reduce((s, g) => s + g.ab, 0)
      const h = window.reduce((s, g) => s + g.h, 0)
      const tb = window.reduce((s, g) => s + g.tb, 0)
      const bb = window.reduce((s, g) => s + g.bb, 0)
      const hbp = window.reduce((s, g) => s + g.hbp, 0)
      const pa = ab + bb + hbp
      const obp = pa > 0 ? (h + bb + hbp) / pa : null
      const slg = ab > 0 ? tb / ab : null
      out.push({ date: shortDate(gameAggs[i].date), fullDate: gameAggs[i].date, ops: obp != null && slg != null ? Math.round((obp + slg) * 1000) / 1000 : null, games: window.length })
    }
    return out
  }, [gameAggs])

  const rollingEV = useMemo(() => {
    const out: { date: string; fullDate: string; ev: number | null }[] = []
    for (let i = 0; i < gameAggs.length; i++) {
      const window = gameAggs.slice(Math.max(0, i - EV_WINDOW + 1), i + 1)
      const n = window.reduce((s, g) => s + g.battedBalls, 0)
      const sum = window.reduce((s, g) => s + g.sumEV, 0)
      out.push({ date: shortDate(gameAggs[i].date), fullDate: gameAggs[i].date, ev: n > 0 ? Math.round((sum / n) * 10) / 10 : null })
    }
    return out
  }, [gameAggs])

  const rollingHardHit = useMemo(() => {
    const out: { date: string; fullDate: string; pct: number | null }[] = []
    for (let i = 0; i < gameAggs.length; i++) {
      const window = gameAggs.slice(Math.max(0, i - HARDHIT_WINDOW + 1), i + 1)
      const n = window.reduce((s, g) => s + g.battedBalls, 0)
      const hard = window.reduce((s, g) => s + g.hardHit, 0)
      out.push({ date: shortDate(gameAggs[i].date), fullDate: gameAggs[i].date, pct: n > 0 ? Math.round((hard / n) * 1000) / 10 : null })
    }
    return out
  }, [gameAggs])

  // Whiff% by pitch type, by month — real swinging-strike rate per real
  // pitch type, bucketed monthly so each point has a real sample behind
  // it. Top pitch types by season volume only, to keep the chart legible.
  const { whiffByMonth, topPitchTypes } = useMemo(() => {
    if (!log || log === 'error') return { whiffByMonth: [], topPitchTypes: [] as string[] }
    const totalByType = new Map<string, number>()
    for (const p of log.pitches) totalByType.set(p.pitchType, (totalByType.get(p.pitchType) ?? 0) + 1)
    const top = [...totalByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_PITCH_TYPES).map(([pt]) => pt)
    const topSet = new Set(top)

    const byMonth = new Map<string, Map<string, { swings: number; whiffs: number }>>()
    for (const p of log.pitches) {
      if (!topSet.has(p.pitchType)) continue
      const swung = p.description === 'swinging_strike' || p.description === 'swinging_strike_blocked'
        || p.description === 'foul' || p.description === 'foul_tip' || p.description === 'hit_into_play'
      if (!swung) continue
      const month = p.date.slice(0, 7)
      if (!byMonth.has(month)) byMonth.set(month, new Map())
      const m = byMonth.get(month)!
      if (!m.has(p.pitchType)) m.set(p.pitchType, { swings: 0, whiffs: 0 })
      const b = m.get(p.pitchType)!
      b.swings++
      if (p.description === 'swinging_strike' || p.description === 'swinging_strike_blocked') b.whiffs++
    }

    const months = [...byMonth.keys()].sort()
    const rows = months.map(month => {
      const row: Record<string, string | number | null> = { month }
      const m = byMonth.get(month)!
      for (const pt of top) {
        const b = m.get(pt)
        row[pt] = b && b.swings >= 5 ? Math.round((b.whiffs / b.swings) * 1000) / 10 : null
      }
      return row
    })
    return { whiffByMonth: rows, topPitchTypes: top }
  }, [log])

  if (log === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load batted-ball data right now.</div>
  if (log === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling every real batted ball this season…</div>
  if (byGame.length === 0) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">No real batted-ball data on record yet.</div>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">EV &amp; Launch Angle Trends</p>
        <p className="text-[13px] text-[#57534E]">Real exit velo and launch angle, averaged per game, across the season — every real batted ball, not a season-long blend.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Exit velo by game</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Real avg launch_speed on balls in play, per game.</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={byGame} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit=" mph" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)} mph` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="avgEV" name="Avg EV" stroke="#FF5722" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Launch angle by game</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Real avg launch_angle on balls in play, per game — the 8°-32° band is real MLB&apos;s own definition of the &quot;sweet spot.&quot;</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={byGame} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit="°" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}°` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="avgLA" name="Avg launch angle" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Rolling {OPS_WINDOW}-game OPS</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Real trailing-{OPS_WINDOW}-game OPS, computed from his own real AB/H/TB/BB/HBP each game — a smoothed form trend, not one season-long number.</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rollingOPS} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? fmtRate(v) : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="ops" name={`Rolling ${OPS_WINDOW}-game OPS`} stroke="#059669" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Rolling {EV_WINDOW}-game exit velo</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Same real launch_speed field as the chart above, smoothed over a trailing {EV_WINDOW}-game window instead of shown raw per game — makes the underlying contact-quality trend easier to read through game-to-game noise.</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rollingEV} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit=" mph" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)} mph` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="ev" name={`Rolling ${EV_WINDOW}-game EV`} stroke="#0369A1" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Rolling {HARDHIT_WINDOW}-game hard-hit%</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Real share of batted balls at {HARD_HIT_MPH}+ mph exit velo (MLB&apos;s own hard-hit definition), trailing {HARDHIT_WINDOW}-game window.</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rollingHardHit} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={[0, 'auto']} width={36} unit="%" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="pct" name={`Rolling ${HARDHIT_WINDOW}-game hard-hit%`} stroke="#DC2626" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {whiffByMonth.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Swing-and-miss by pitch type, over time</p>
          <p className="text-[10px] font-mono text-stone-400 mb-3">Real monthly whiff rate (whiffs ÷ swings) against his {topPitchTypes.length} most-seen real pitch types this season — each real month/pitch-type cell needs 5+ real swings to show.</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={whiffByMonth} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
              <XAxis dataKey="month" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} domain={[0, 'auto']} width={36} unit="%" />
              <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')} />
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
              {topPitchTypes.map(pt => (
                <Line key={pt} {...NO_ANIM} type="monotone" dataKey={pt} name={log.pitchNames[pt] ?? pt} stroke={pitchColor(pt)} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      </div>
    </div>
  )
}
