'use client'

// src/components/nfl-edge/postgame/PostgameClient.tsx
//
// "How it swung": the home win-probability line for a finished game with the biggest swings marked.
// The model is nflfastR's, used here only to DESCRIBE how the game unfolded (never a forward-looking number).
// Plain-data props; Recharts per the stack rule.

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, MONO } from '@/components/team/ui'

export type WpPoint = { t: number; wp: number }
export type Swing = { t: number; wp: number; n: number; label: string }

const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }
const qLabel = (t: number) => (t >= 3600 ? 'OT' : `Q${Math.floor(t / 900) + 1}`)

export function WinProbChart({ points, swings, home, away, homeColor, awayColor }: { points: WpPoint[]; swings: Swing[]; home: string; away: string; homeColor: string; awayColor: string }) {
  if (points.length < 10) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '40px 0', margin: 0 }}>The win-probability line is not available for this game.</p>
  const end = Math.max(3600, ...points.map(p => p.t))
  const ticks = [0, 900, 1800, 2700, 3600, ...(end > 3600 ? [end] : [])]
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="wpSplit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={homeColor} stopOpacity={0.55} />
              <stop offset="50%" stopColor={homeColor} stopOpacity={0.08} />
              <stop offset="50%" stopColor={awayColor} stopOpacity={0.08} />
              <stop offset="100%" stopColor={awayColor} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1eee6" vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, end]} ticks={ticks} tickFormatter={(t: number) => (t === 0 ? 'KO' : t >= end ? 'End' : `End ${qLabel(t - 1)}`)} tick={AXIS} />
          <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v: number) => (v === 1 ? `${home} win` : v === 0 ? `${away} win` : '50%')} tick={AXIS} width={64} />
          <ReferenceLine y={0.5} stroke="#1A1A1A" strokeOpacity={0.35} />
          <Tooltip
            formatter={(v) => [`${Math.round(Number(v) * 100)}% ${home}`, 'Win probability']}
            labelFormatter={(t) => `${qLabel(Number(t) - 1)} · ${Math.floor((Number(t) % 900) / 60)}:${String(Math.floor(Number(t) % 60)).padStart(2, '0')} elapsed`}
            contentStyle={{ fontFamily: MONO, fontSize: 11, borderRadius: 8 }}
          />
          <Area type="monotone" dataKey="wp" baseValue={0.5} stroke={C.ink} strokeWidth={1.8} fill="url(#wpSplit)" isAnimationActive={false} />
          {swings.map(s => (
            <ReferenceDot key={s.n} x={s.t} y={s.wp} r={9} fill={C.orange} stroke="#fff" strokeWidth={2} label={{ value: String(s.n), fill: '#fff', fontSize: 10, fontFamily: MONO }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
