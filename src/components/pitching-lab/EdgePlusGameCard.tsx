'use client'

// src/components/pitching-lab/EdgePlusGameCard.tsx
//
// Edge+ isn't just a season number — pick any of this pitcher's real
// starts this season and see that exact game.
//
// The "graphic" is the hero card up top: identity (headshot, real
// opponent team logo, date) next to a grid of EVERY pitch he actually
// threw THAT game — velo, arm angle, release height, usage, the real
// ball/strike/whiff/foul/in-play call breakdown, and a radial gauge for
// the season Edge+ grade — one self-contained tile per pitch, no
// secondary table underneath repeating the same numbers. Below it: a real
// velo-by-pitch-number chart for the game (shows fade/ramp across the
// outing, not just one average number).
//
// Deliberately NOT a fabricated per-game percentile — a single start is
// ~15-25 pitches of one type, nowhere near enough to re-rank against a
// league pool honestly. What's real and shown instead: this game's own
// raw counts/averages/sequence (from the same per-pitch log as everywhere
// else in this app) paired with the season's real, already-computed
// Edge+ grade.

import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Scatter, Line, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const AXIS_TICK = { fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }

// Real least-squares linear fit (velo ~ pitch sequence number) — just the
// two endpoint points, rendered as a faint straight line so a velo
// fade/ramp across the outing reads at a glance under the real dots.
function linearTrend(points: { seq: number; velo: number }[]): { seq: number; velo: number }[] {
  const n = points.length
  if (n < 2) return []
  const sumX = points.reduce((s, p) => s + p.seq, 0)
  const sumY = points.reduce((s, p) => s + p.velo, 0)
  const sumXY = points.reduce((s, p) => s + p.seq * p.velo, 0)
  const sumXX = points.reduce((s, p) => s + p.seq * p.seq, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return []
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const minSeq = Math.min(...points.map(p => p.seq))
  const maxSeq = Math.max(...points.map(p => p.seq))
  return [
    { seq: minSeq, velo: slope * minSeq + intercept },
    { seq: maxSeq, velo: slope * maxSeq + intercept },
  ]
}

type EdgeScore = { pitchType: string; name: string; score: number | null; tier: { label: string; color: string } }

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}
function mlbTeamLogo(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}
function fmtDate(d: string): string {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtDateShort(d: string): string {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type PitchCall = 'ball' | 'strike' | 'whiff' | 'foul' | 'inPlay'
function classifyCall(description: string | null): PitchCall | null {
  switch (description) {
    case 'ball': case 'blocked_ball': case 'pitchout': return 'ball'
    case 'called_strike': return 'strike'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': return 'whiff'
    case 'foul': case 'foul_tip': case 'foul_bunt': return 'foul'
    case 'hit_into_play': return 'inPlay'
    default: return null
  }
}

function avg(vals: (number | null)[]): number | null {
  const real = vals.filter((v): v is number => v != null)
  return real.length > 0 ? real.reduce((s, v) => s + v, 0) / real.length : null
}

// Small radial progress ring for a 0-100 score — real number in the
// center, real percentage as the arc, same tier color used everywhere
// else Edge+ shows up. Reads at a glance instead of parsing "87 (season)"
// text.
function ScoreGauge({ score, color, size = 34 }: { score: number | null; color: string; size?: number }) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  const frac = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDE8DD" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 3} textAnchor="middle" fontSize={size * 0.33} fontWeight={700} fill={color} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {score ?? '—'}
      </text>
    </svg>
  )
}

export default function EdgePlusGameCard({
  pitcherId, pitcherName, teamAbbr, teamColor, edgeScores,
}: {
  pitcherId: number
  pitcherName: string
  teamAbbr: string
  teamColor: string
  edgeScores: EdgeScore[]
}) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [opponents, setOpponents] = useState<Record<string, string>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/start-trends?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled || !json.starts) return
        const map: Record<string, string> = {}
        for (const s of json.starts) map[s.date] = s.opponent
        setOpponents(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [pitcherId])

  const dates = useMemo(() => {
    if (!log || log === 'error') return []
    return [...new Set(log.pitches.map(p => p.date))].sort().reverse()
  }, [log])

  const activeDate = selectedDate ?? dates[0] ?? null
  const opponentTeam = activeDate ? findTeamByName(opponents[activeDate] ?? '') : undefined

  const gameBreakdown = useMemo(() => {
    if (!log || log === 'error' || !activeDate) return []
    const pitches = log.pitches.filter(p => p.date === activeDate)
    const byType = new Map<string, { count: number; velo: number[]; arm: (number | null)[]; relH: (number | null)[]; ball: number; strike: number; whiff: number; foul: number; inPlay: number }>()
    for (const p of pitches) {
      if (!byType.has(p.pitchType)) byType.set(p.pitchType, { count: 0, velo: [], arm: [], relH: [], ball: 0, strike: 0, whiff: 0, foul: 0, inPlay: 0 })
      const b = byType.get(p.pitchType)!
      b.count++
      if (p.velo != null) b.velo.push(p.velo)
      b.arm.push(p.armAngle)
      b.relH.push(p.releasePosZ)
      const call = classifyCall(p.description)
      if (call) b[call]++
    }
    const total = pitches.length
    return [...byType.entries()]
      .map(([pt, b]) => ({
        pitchType: pt,
        name: log.pitchNames[pt] ?? pt,
        count: b.count,
        pct: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0,
        avgVelo: b.velo.length > 0 ? b.velo.reduce((s, v) => s + v, 0) / b.velo.length : null,
        avgArm: avg(b.arm),
        avgRelH: avg(b.relH),
        ball: b.ball, strike: b.strike, whiff: b.whiff, foul: b.foul, inPlay: b.inPlay,
      }))
      .sort((a, b) => b.count - a.count)
  }, [log, activeDate])

  // Real pitch-by-pitch velo across the outing — true thrown order via
  // (at_bat_number, pitch_number), same reconstruction SequenceExplorer
  // uses. Shows a fade/ramp across the game, not just one flat average.
  const veloSequence = useMemo(() => {
    if (!log || log === 'error' || !activeDate) return []
    const pitches = log.pitches.filter(p => p.date === activeDate && p.atBatNumber != null && p.pitchNumber != null && p.velo != null)
    return [...pitches].sort((a, b) => (a.atBatNumber! - b.atBatNumber!) || (a.pitchNumber! - b.pitchNumber!))
      .map((p, i) => ({ seq: i + 1, velo: p.velo as number, pitchType: p.pitchType }))
  }, [log, activeDate])

  const veloByType = useMemo(() => {
    const byType = new Map<string, { seq: number; velo: number }[]>()
    for (const d of veloSequence) {
      if (!byType.has(d.pitchType)) byType.set(d.pitchType, [])
      byType.get(d.pitchType)!.push({ seq: d.seq, velo: d.velo })
    }
    return [...byType.entries()].map(([pt, pts]) => ({ pitchType: pt, points: pts, trend: linearTrend(pts) }))
  }, [veloSequence])

  if (log === 'error') return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load game data right now.</div>
  if (log === null) return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling this season&apos;s starts…</div>
  if (dates.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {dates.map(d => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`font-mono rounded-full border px-3 py-1.5 text-[11px] transition ${activeDate === d ? 'border-[#FF5722] text-[#FF5722] bg-orange-50 font-bold' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
          >
            {fmtDate(d)}
          </button>
        ))}
      </div>

      {activeDate && (
        <>
          {/* The graphic — meant to be screenshot-shareable on its own */}
          <div className="bg-white border-2 border-stone-200 rounded-2xl overflow-hidden flex relative">
            <div
              className="w-[26%] sm:w-[22%] shrink-0 p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden"
              style={{ background: `linear-gradient(160deg, ${teamColor}22, ${teamColor}05)` }}
            >
              {opponentTeam && (
                <img
                  src={mlbTeamLogo(opponentTeam.id)} alt=""
                  className="absolute -right-8 -bottom-8 w-40 h-40 opacity-[0.07] pointer-events-none select-none"
                />
              )}
              <div className="relative">
                <p className="text-[9px] font-mono uppercase tracking-widest" style={{ color: teamColor }}>{teamAbbr} · SP</p>
                <img src={mlbHeadshot(pitcherId)} alt="" className="w-11 h-11 sm:w-16 sm:h-16 my-2" style={{ borderRadius: '50%', objectFit: 'cover', border: `2px solid ${teamColor}` }} />
                <p className="text-[15px] sm:text-[18px] font-black text-stone-900 leading-tight">{pitcherName}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {opponentTeam && (
                    <img src={mlbTeamLogo(opponentTeam.id)} alt="" className="w-4 h-4 object-contain shrink-0" />
                  )}
                  <p className="text-[10px] sm:text-[11px] font-mono text-stone-500">{fmtDateShort(activeDate)}{opponents[activeDate] ? ` vs ${opponents[activeDate]}` : ''}</p>
                </div>
              </div>
              <p className="relative text-[8px] font-mono uppercase tracking-widest text-stone-400">Edge+ Game Card</p>
            </div>

            <div className="flex-1 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {gameBreakdown.map(g => {
                const seasonEdge = edgeScores.find(e => e.pitchType === g.pitchType)
                return (
                  <div
                    key={g.pitchType}
                    className="rounded-lg p-2.5 sm:p-3 flex flex-col gap-1.5 min-w-0 border"
                    style={{ background: `${pitchColor(g.pitchType)}0D`, borderColor: `${pitchColor(g.pitchType)}33` }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pitchColor(g.pitchType) }} />
                      <span className="text-[10px] sm:text-[12px] font-bold text-stone-900 truncate">{g.name}</span>
                      <span className="ml-auto text-[9px] sm:text-[10px] font-mono text-stone-400 shrink-0">{g.pct.toFixed(0)}%</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[20px] sm:text-[26px] font-black text-stone-900 leading-none">{g.avgVelo != null ? g.avgVelo.toFixed(1) : '—'}</span>
                        <span className="text-[9px] sm:text-[10px] font-mono text-stone-400">mph</span>
                      </div>
                      {seasonEdge && <ScoreGauge score={seasonEdge.score} color={seasonEdge.tier.color} size={30} />}
                    </div>

                    <div className="flex gap-2.5 text-[8px] sm:text-[9px] font-mono text-stone-500">
                      <span>Arm <b className="text-stone-800">{g.avgArm != null ? `${g.avgArm.toFixed(0)}°` : '—'}</b></span>
                      <span>Rel <b className="text-stone-800">{g.avgRelH != null ? `${g.avgRelH.toFixed(1)}ft` : '—'}</b></span>
                    </div>

                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] sm:text-[9px] font-mono text-stone-500 pt-1.5 border-t border-stone-900/5">
                      <span>Ball <b className="text-stone-800">{g.ball}</b></span>
                      <span>Strike <b className="text-stone-800">{g.strike}</b></span>
                      <span>Whiff <b className="text-stone-800">{g.whiff}</b></span>
                      <span>Foul <b className="text-stone-800">{g.foul}</b></span>
                      <span>In play <b className="text-stone-800">{g.inPlay}</b></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-[9px] font-mono text-stone-400 px-1">Real per-pitch counts/averages from this exact start. Edge+ gauges shown are this pitcher&apos;s season-long grade — a single game is too small a sample to honestly re-rank against a league pool.</p>

          {/* Real velo across the outing — every pitch, true thrown order, plus a faint linear trend per pitch */}
          {veloByType.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Velo by pitch, this start</p>
              <p className="text-[10px] font-mono text-stone-400 mb-3">Every real pitch, true thrown order (game_pk + at-bat + pitch number), with a faint real trend line per pitch — a fade or ramp across the outing shows up here, not just in a single average.</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
                  <XAxis type="number" dataKey="seq" name="Pitch #" tick={AXIS_TICK} domain={['dataMin', 'dataMax']} allowDuplicatedCategory={false} />
                  <YAxis type="number" dataKey="velo" name="Velo" tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit=" mph" />
                  <ZAxis range={[24, 24]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)} mph` : '—')} />
                  <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
                  {veloByType.map(({ pitchType, points }) => (
                    <Scatter key={pitchType} name={log.pitchNames[pitchType] ?? pitchType} data={points} fill={pitchColor(pitchType)} isAnimationActive={false} />
                  ))}
                  {veloByType.map(({ pitchType, trend }) => (
                    <Line
                      key={`trend-${pitchType}`} data={trend} dataKey="velo" type="linear"
                      stroke={pitchColor(pitchType)} strokeWidth={1.5} strokeOpacity={0.35} strokeDasharray="4 3"
                      dot={false} activeDot={false} legendType="none" isAnimationActive={false}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
