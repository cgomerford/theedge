// src/components/SeasonShapeRiver.tsx
//
// "Season Shape River" — the texture of a real season instead of a cumulative
// win chart: a rolling (10- or 15-game) real run-differential stream from
// Opening Day to today, filled green above zero / red below, with a real
// opponent-quality band riding underneath (the rolling average of the real
// season win% of whoever they actually played that stretch) so a hot run
// against last place doesn't read the same as one against the league's best.
// Real transaction ticks (trades, call-ups, signings, IL moves) and real
// win/loss streaks mark the games that shaped the shape. Overlay a division
// rival's own river on the same axes to compare who peaked when.
//
// Every series here is real, lazy-fetched per team from the live MLB Stats
// API (src/lib/season-shape.ts) — no projections, no synthetic smoothing
// beyond the stated rolling window.

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts'
import { MLB_TEAMS } from '@/lib/teams'
import type { MLBDivisionStandings } from '@/lib/mlb-homepage'
import {
  getTeamGameLog, getTeamSeasonTransactions, buildRiver, findStreaks, tagTransactions,
  type SeasonGame, type RiverPoint, type StreakTick, type TransactionTick,
} from '@/lib/season-shape'

const GOOD = '#059669'
const BAD = '#DC2626'
const ORANGE = '#FF5722'
const BLUE = '#185FA5'
const SIGN = '#8B5CF6'
const BAND = '#94A3B8'
const SEASON = new Date().getFullYear()

const TICK_COLOR: Record<TransactionTick['type'], string> = { trade: ORANGE, callup: BLUE, signing: SIGN, il: BAD }
const TICK_LABEL: Record<TransactionTick['type'], string> = { trade: 'Trade', callup: 'Call-up', signing: 'Signing', il: 'IL move' }

// River isn't cached — it's cheap to recompute (a few hundred games) and
// depends on the window size, so it's derived at render time instead of
// stored, keeping the fetch cache limited to what's actually fetched.
type TeamData = { games: SeasonGame[]; streaks: StreakTick[]; txTicks: TransactionTick[] }

async function loadTeam(teamId: number): Promise<TeamData> {
  const [games, transactions] = await Promise.all([
    getTeamGameLog(teamId, SEASON),
    getTeamSeasonTransactions(teamId, SEASON),
  ])
  return {
    games,
    streaks: findStreaks(games, 4),
    txTicks: tagTransactions(games, transactions),
  }
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00Z')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

type ChartRow = RiverPoint & { rivalDiff: number | null }
type CustomTooltipProps = {
  active?: boolean
  payload?: { payload: ChartRow }[]
  label?: number
  team: string
  rival?: string
  ticksByGame: Map<number, TransactionTick[]>
}

function CustomTooltip({ active, payload, label, team, rival, ticksByGame }: CustomTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null
  const row = payload[0]?.payload
  if (!row) return null
  const ticks: TransactionTick[] = ticksByGame.get(label) ?? []
  return (
    <div style={{ background: '#1A1A1A', color: '#FAF8F3', borderRadius: 8, padding: '8px 10px', fontSize: 10.5, maxWidth: 240 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{fmtDate(row.date)} · Game {label}</div>
      <div style={{ color: '#D4D0C8' }}>
        <span style={{ color: row.rollingDiff >= 0 ? GOOD : BAD, fontWeight: 700 }}>{row.rollingDiff >= 0 ? '+' : ''}{row.rollingDiff}</span> run diff · {team}
      </div>
      <div style={{ color: '#A3A3A3', fontSize: 9.5, marginTop: 1 }}>Opponent quality (avg win%): {(row.opponentWinPct * 100).toFixed(0)}%</div>
      {rival && row.rivalDiff !== undefined && row.rivalDiff !== null && (
        <div style={{ color: '#A3A3A3', fontSize: 9.5, marginTop: 1 }}>{rival}: <span style={{ color: row.rivalDiff >= 0 ? GOOD : BAD, fontWeight: 700 }}>{row.rivalDiff >= 0 ? '+' : ''}{row.rivalDiff}</span></div>
      )}
      {ticks.length > 0 && (
        <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ color: TICK_COLOR[t.type], fontSize: 9.5, fontWeight: 700 }}>
              {TICK_LABEL[t.type]} <span style={{ color: '#D4D0C8', fontWeight: 400 }}>— {t.description.length > 90 ? t.description.slice(0, 90) + '…' : t.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SeasonShapeRiver({ standings }: { standings: MLBDivisionStandings[] }) {
  const teamOptions = useMemo(() => [...MLB_TEAMS].sort((a, b) => a.short.localeCompare(b.short)), [])
  const [teamId, setTeamId] = useState<number>(teamOptions[0]?.id)
  const [rivalId, setRivalId] = useState<number | null>(null)
  const [window, setWindow] = useState<10 | 15>(10)
  const [cache, setCache] = useState<Record<number, TeamData>>({})

  const team = teamOptions.find(t => t.id === teamId)
  const rivalTeams = useMemo(
    () => team ? teamOptions.filter(t => t.league === team.league && t.division === team.division && t.id !== team.id) : [],
    [team, teamOptions]
  )

  const opponentWinPctById = useMemo(() => {
    const m = new Map<number, number>()
    for (const div of standings) for (const t of div.teams) m.set(t.id, t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0.5)
    return m
  }, [standings])

  useEffect(() => {
    const need = [teamId, ...(rivalId ? [rivalId] : [])].filter(id => cache[id] === undefined)
    if (need.length === 0) return
    Promise.all(need.map(id => loadTeam(id).then(d => [id, d] as const)))
      .then(entries => setCache(prev => { const next = { ...prev }; for (const [id, d] of entries) next[id] = d; return next }))
  }, [teamId, rivalId, cache])

  const data = cache[teamId]
  const rivalData = rivalId !== null ? cache[rivalId] : undefined
  const loading = data === undefined

  const river = useMemo(() => data ? buildRiver(data.games, opponentWinPctById, window) : [], [data, opponentWinPctById, window])
  const rivalRiver = useMemo(() => rivalData ? buildRiver(rivalData.games, opponentWinPctById, window) : [], [rivalData, opponentWinPctById, window])

  const chartData = useMemo((): ChartRow[] => {
    const rivalByGame = new Map(rivalRiver.map(p => [p.gameIndex, p.rollingDiff]))
    return river.map(p => ({ ...p, rivalDiff: rivalId !== null ? rivalByGame.get(p.gameIndex) ?? null : null }))
  }, [river, rivalRiver, rivalId])

  const ticksByGame = useMemo(() => {
    const m = new Map<number, TransactionTick[]>()
    for (const t of data?.txTicks ?? []) m.set(t.gameIndex, [...(m.get(t.gameIndex) ?? []), t])
    return m
  }, [data])

  const { yMin, yMax, offsetZero } = useMemo(() => {
    const vals = chartData.flatMap(p => [p.rollingDiff, ...(p.rivalDiff !== null && p.rivalDiff !== undefined ? [p.rivalDiff] : [])])
    if (vals.length === 0) return { yMin: -5, yMax: 5, offsetZero: 0.5 }
    const min = Math.min(...vals, 0), max = Math.max(...vals, 0)
    const pad = Math.max(2, (max - min) * 0.15)
    const lo = Math.floor(min - pad), hi = Math.ceil(max + pad)
    return { yMin: lo, yMax: hi, offsetZero: Math.min(1, Math.max(0, hi / (hi - lo))) }
  }, [chartData])

  if (!team) return null

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-4">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-[13px] font-serif font-bold text-[#1A1A1A]">Season shape river</div>
          <div className="text-[10px] text-[#8A8577] mt-0.5 max-w-[460px]">
            Rolling {window}-game real run differential, Opening Day to today. The pale band underneath is the real average win% of who they actually played that stretch.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={teamId} onChange={e => { setTeamId(Number(e.target.value)); setRivalId(null) }} className="text-[11px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer">
            {teamOptions.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
          </select>
          <select value={rivalId ?? ''} onChange={e => setRivalId(e.target.value ? Number(e.target.value) : null)} className="text-[11px] text-[#8A8577] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer">
            <option value="">Compare with…</option>
            {rivalTeams.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
          </select>
          <div className="flex items-center border border-[#DEDACE] rounded-full overflow-hidden">
            {([10, 15] as const).map(w => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className="text-[10.5px] font-bold px-2.5 py-1.5"
                style={{ background: window === w ? '#1A1A1A' : '#fff', color: window === w ? '#fff' : '#8A8577', border: 'none', cursor: 'pointer' }}
              >
                {w}g
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">Loading season log…</div>
      ) : chartData.length === 0 ? (
        <div className="text-[11px] text-[#8A8577] text-center py-12">No completed games yet this season.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="riverFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offsetZero} stopColor={GOOD} stopOpacity={0.32} />
                  <stop offset={offsetZero} stopColor={BAD} stopOpacity={0.32} />
                </linearGradient>
              </defs>
              <XAxis dataKey="gameIndex" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#B5B0A3' }} tickLine={false} axisLine={{ stroke: '#E8E4DC' }} />
              <YAxis yAxisId="diff" domain={[yMin, yMax]} tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#B5B0A3' }} tickLine={false} axisLine={false} width={28} />
              <YAxis yAxisId="opp" domain={[0, 1]} hide />
              <Tooltip content={<CustomTooltip team={team.short} rival={rivalTeams.find(t => t.id === rivalId)?.short} ticksByGame={ticksByGame} />} />

              <Area yAxisId="opp" type="monotone" dataKey="opponentWinPct" stroke="none" fill={BAND} fillOpacity={0.22} isAnimationActive={false} />
              <ReferenceLine yAxisId="diff" y={0} stroke="rgba(26,26,26,0.25)" strokeWidth={1} />
              <Area yAxisId="diff" type="monotone" dataKey="rollingDiff" stroke="#1A1A1A" strokeWidth={1.5} fill="url(#riverFill)" isAnimationActive={false} />
              {rivalId !== null && (
                <Line yAxisId="diff" type="monotone" dataKey="rivalDiff" stroke={rivalTeams.find(t => t.id === rivalId)?.primary_color ?? ORANGE} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              )}

              {(data?.streaks ?? []).map((s, i) => {
                const pt = chartData.find(p => p.gameIndex === s.gameIndex)
                if (!pt) return null
                return (
                  <ReferenceDot
                    key={`streak-${i}`}
                    yAxisId="diff"
                    x={s.gameIndex}
                    y={pt.rollingDiff}
                    r={4}
                    fill={s.type === 'win' ? GOOD : BAD}
                    stroke="#fff"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                  />
                )
              })}
              {(data?.txTicks ?? []).map((t, i) => (
                <ReferenceDot
                  key={`tx-${i}`}
                  yAxisId="diff"
                  x={t.gameIndex}
                  y={yMin + (yMax - yMin) * 0.04}
                  r={3}
                  fill={TICK_COLOR[t.type]}
                  stroke="none"
                  ifOverflow="visible"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-3 flex-wrap mt-2 text-[9px] text-[#8A8577]">
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: GOOD, display: 'inline-block' }} />Win streak (4+)</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: BAD, display: 'inline-block' }} />Loss streak (4+)</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: ORANGE, display: 'inline-block' }} />Trade</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: BLUE, display: 'inline-block' }} />Call-up</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: SIGN, display: 'inline-block' }} />Signing</span>
            <span className="flex items-center gap-1"><span style={{ width: 8, height: 8, borderRadius: 999, background: BAND, display: 'inline-block' }} />Opponent win% band</span>
          </div>
        </>
      )}
    </div>
  )
}
