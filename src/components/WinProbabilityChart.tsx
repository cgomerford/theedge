'use client'

// src/components/WinProbabilityChart.tsx
//
// Diverging area chart matching the reference style: 50% baseline in the
// middle, away-team win% reads upward from center, home-team win% reads
// downward — with each team's logo anchored at their side of the axis.
// Vertical gradient fill (away color at top fading through white at the
// midline to home color at bottom) gives the flowing look without needing
// per-point dynamic line coloring. X-axis ticks land on T1/B1/T2/B2...
// (top/bottom of each inning) instead of a raw play index.
//
// Underlying data is still the same simplified approximation described in
// lib/postgame.ts (computeWinProbability) — not the official empirical WE
// model. The normalCdf bug that had this flipped (showing the away team's
// odds where the home team's belonged) is fixed as of this version.

import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WinProbabilityPoint } from '@/lib/postgame'

type ChartPoint = {
  idx: number
  awayWinPct: number
  homeWinPct: number
  inning: number
  half: 'top' | 'bottom'
  awayScore: number
  homeScore: number
  description: string
}

type Props = {
  data: WinProbabilityPoint[]
  awayAbbr: string
  homeAbbr: string
  awayTeamId?: number | null
  homeTeamId?: number | null
  awayColor: string
  homeColor: string
}

function TeamBadge({ teamId, abbr, size = 22 }: { teamId?: number | null; abbr: string; size?: number }) {
  return teamId ? (
    <img
      src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
      alt={abbr}
      style={{ width: size, height: size }}
      className="object-contain flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  ) : (
    <span className="font-mono text-[9px] font-bold text-stone-500">{abbr}</span>
  )
}

function CustomTooltip({ active, payload, awayAbbr, homeAbbr, awayTeamId, homeTeamId }: any) {
  if (!active || !payload?.[0]) return null
  const p: ChartPoint = payload[0].payload
  const favored = p.awayWinPct >= 50 ? 'away' : 'home'
  const pct = favored === 'away' ? p.awayWinPct : p.homeWinPct
  return (
    <div className="bg-white border border-stone-300 rounded-lg shadow-md px-3 py-2.5 max-w-[220px]">
      <div className="flex items-center gap-2 mb-1.5">
        <TeamBadge teamId={favored === 'away' ? awayTeamId : homeTeamId} abbr={favored === 'away' ? awayAbbr : homeAbbr} size={18} />
        <span className="font-mono text-[11px] font-bold text-stone-900">{pct}% Win Probability</span>
      </div>
    <p className="text-[10.5px] text-stone-600 leading-snug">{p.description || `${awayAbbr} ${p.awayScore} – ${homeAbbr} ${p.homeScore}`}</p>
    </div>
  )
}

export default function WinProbabilityChart({ data, awayAbbr, homeAbbr, awayTeamId, homeTeamId, awayColor, homeColor }: Props) {
  const { chartData, ticks, tickLabels } = useMemo(() => {
    const chartData: ChartPoint[] = data.map((p, i) => ({
      idx: i,
      awayWinPct: Math.round((1 - p.homeWinProb) * 100),
      homeWinPct: Math.round(p.homeWinProb * 100),
      inning: p.inning,
      half: p.half,
      awayScore: p.awayScore,
      homeScore: p.homeScore,
      description: p.description,
    }))

    const ticks: number[] = []
    const tickLabels: Record<number, string> = {}
    let lastKey = ''
    chartData.forEach((p, i) => {
      const key = `${p.half}${p.inning}`
      if (key !== lastKey) {
        ticks.push(i)
        tickLabels[i] = `${p.half === 'top' ? 'T' : 'B'}${p.inning}`
        lastKey = key
      }
    })

    return { chartData, ticks, tickLabels }
  }, [data])

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Win probability</span>
        <span className="font-mono text-[9px] text-stone-400">approximation, not an official WE model</span>
      </div>
      {chartData.length === 0 ? (
        <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No play data available</div>
      ) : (
        <div className="relative p-3" style={{ height: 260 }}>
          {/* team badges anchored to their side of the axis */}
          <div className="absolute left-4 top-6 z-10"><TeamBadge teamId={awayTeamId} abbr={awayAbbr} /></div>
          <div className="absolute left-4 bottom-10 z-10"><TeamBadge teamId={homeTeamId} abbr={homeAbbr} /></div>

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 30, bottom: 4 }}>
              <defs>
                <linearGradient id="wpGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={awayColor} stopOpacity={0.35} />
                  <stop offset="48%" stopColor={awayColor} stopOpacity={0.05} />
                  <stop offset="52%" stopColor={homeColor} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={homeColor} stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="idx"
                ticks={ticks}
                tickFormatter={(v) => tickLabels[v] ?? ''}
                tick={{ fontSize: 9, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={{ stroke: '#e7e2d8' }}
                interval={0}
                minTickGap={18}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => v <= 50 ? `${100 - v}%` : `${v}%`}
                tick={{ fontSize: 9, fill: '#a8a29e' }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine y={50} stroke="#d6d3d1" strokeWidth={1.5} />
              <Tooltip content={<CustomTooltip awayAbbr={awayAbbr} homeAbbr={homeAbbr} awayTeamId={awayTeamId} homeTeamId={homeTeamId} />} />
              <Area
                type="monotone"
                dataKey="awayWinPct"
                stroke="#78716c"
                strokeWidth={2}
                fill="url(#wpGradient)"
                dot={false}
                activeDot={{ r: 4, fill: '#292524' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}