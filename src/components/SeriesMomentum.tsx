'use client'

import { useState } from 'react'
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer, Legend } from 'recharts'
import type { GameMomentum } from '@/lib/series-momentum'

const GAME_COLORS = ['#78716C', '#A8A29E', '#44403C', '#D6D3D1', '#292524']

type ChartPoint = {
  x: number
  label: string
  posDiff: number | null
  negDiff: number | null
  gameNumber: number
  isGameStart: boolean
}

function buildSeriesFlow(momentum: GameMomentum[]): ChartPoint[] {
  const points: ChartPoint[] = []
  let x = 0
  for (const game of momentum) {
    if (game.points.length === 0) continue
    points.push({ x, label: `G${game.gameNumber} start`, posDiff: 0, negDiff: 0, gameNumber: game.gameNumber, isGameStart: true })
    for (const p of game.points) {
      x += 1
      points.push({
        x,
        label: `G${game.gameNumber} · Inn ${p.inning}`,
        posDiff: p.diff > 0 ? p.diff : 0,
        negDiff: p.diff < 0 ? p.diff : 0,
        gameNumber: game.gameNumber,
        isGameStart: false,
      })
    }
    x += 1
  }
  return points
}

// Overlaid mode: every game shares the same inning-number x-axis instead of
// flowing sequentially — compares WHICH inning each game tended to swing,
// rather than telling the whole series as one continuous story.
function buildByGameSeries(momentum: GameMomentum[]) {
  const maxInning = Math.max(1, ...momentum.flatMap(m => m.points.map(p => p.inning)))
  const rows = Array.from({ length: maxInning }, (_, i) => {
    const inning = i + 1
    const row: Record<string, number | null> = { inning }
    for (const m of momentum) {
      const pt = m.points.find(p => p.inning === inning)
      row[`Game ${m.gameNumber}`] = pt ? pt.diff : null
    }
    return row
  })
  return rows
}

function SeriesTooltip({ active, payload, awayAbbr, homeAbbr, awayColor, homeColor }: any) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  const homeAhead = point.posDiff > 0
  const awayAhead = point.negDiff < 0

  return (
    <div className="bg-white border border-stone-200 rounded-lg shadow-sm px-3 py-2 text-xs font-mono">
      <p className="text-stone-400 text-[10px] mb-1 whitespace-nowrap">{point.label}</p>
      {homeAhead && <p style={{ color: homeColor }} className="font-bold whitespace-nowrap">{homeAbbr} +{point.posDiff}</p>}
      {awayAhead && <p style={{ color: awayColor }} className="font-bold whitespace-nowrap">{awayAbbr} {point.negDiff}</p>}
      {!homeAhead && !awayAhead && <p className="text-stone-500 whitespace-nowrap">Tied</p>}
    </div>
  )
}

export default function SeriesMomentum({
  momentum, awayAbbr, homeAbbr, awayColor, homeColor,
}: {
  momentum: GameMomentum[]
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}) {
  const [mode, setMode] = useState<'series' | 'byGame'>('series')
  const withPoints = momentum.filter(m => m.points.length > 0)

  if (withPoints.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 py-6 text-center">No completed games with inning data yet.</p>
  }

  const flowData = buildSeriesFlow(withPoints)
  const gameStarts = flowData.filter(p => p.isGameStart)
  const byGameData = buildByGameSeries(withPoints)

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Series momentum</p>
        <div className="flex gap-1 bg-stone-100 p-0.5 rounded-full">
          {(['series', 'byGame'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest rounded-full transition ${mode === m ? 'bg-[#1A1A1A] text-white' : 'text-stone-400'}`}
            >
              {m === 'series' ? 'Series' : 'By game'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] font-mono text-stone-400 mb-3">
        {mode === 'series' ? (
          <>
            <span style={{ color: homeColor }} className="font-bold">{homeAbbr}</span> ahead above the line ·{' '}
            <span style={{ color: awayColor }} className="font-bold">{awayAbbr}</span> ahead below · resets each game
          </>
        ) : (
          'Every game on the same inning axis — compare which innings tend to swing'
        )}
      </p>

      {mode === 'series' ? (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={flowData} margin={{ top: 24, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d6" />
            <XAxis dataKey="x" tick={false} axisLine={{ stroke: '#e7e2d6' }} />
            <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} width={30} allowDecimals={false} />
            <ReferenceLine y={0} stroke="#1A1A1A" strokeWidth={1} />
            {gameStarts.map(g => (
              <ReferenceLine
                key={g.x}
                x={g.x}
                stroke="#a8a29e"
                strokeDasharray="2 2"
                label={{ value: `Game ${g.gameNumber}`, position: 'top', fontSize: 9, fontFamily: 'monospace', fill: '#78716C' }}
              />
            ))}
            <Tooltip content={<SeriesTooltip awayAbbr={awayAbbr} homeAbbr={homeAbbr} awayColor={awayColor} homeColor={homeColor} />} />
            <Area type="monotone" dataKey="posDiff" stroke={homeColor} fill={homeColor} fillOpacity={0.35} strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="negDiff" stroke={awayColor} fill={awayColor} fillOpacity={0.35} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={byGameData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d6" />
            <XAxis dataKey="inning" tick={{ fontSize: 9, fontFamily: 'monospace' }} label={{ value: 'Inning', position: 'insideBottom', offset: -2, fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} width={30} allowDecimals={false} />
            <ReferenceLine y={0} stroke="#1A1A1A" strokeDasharray="2 2" />
            <Tooltip labelFormatter={l => `Inning ${l}`} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
            {withPoints.map((m, i) => (
              <Line
                key={m.gamePk}
                type="monotone"
                dataKey={`Game ${m.gameNumber}`}
                stroke={GAME_COLORS[i % GAME_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}