'use client'

// src/components/nfl-edge/home/LeagueCharts.tsx
//
// The one interactive chart on the NFL homepage: every club as its logo on offence-vs-defence axes.
// Plain-data props only (no functions cross the server/client boundary). Recharts, per the stack rule.

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, MONO } from '@/components/team/ui'

export type QualityPoint = { id: string; name: string; logo: string; color: string; off: number; def: number; plays: number }

const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }

function Tip({ active, payload }: { active?: boolean; payload?: { payload: QualityPoint }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '8px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.5, borderRadius: 8 }}>
      <div style={{ fontWeight: 700 }}>{p.name}</div>
      <div>Offense {p.off >= 0 ? '+' : ''}{p.off.toFixed(2)} EPA/play</div>
      {/* def is stored sign-flipped (up = better); show the real "allowed" number */}
      <div>Defense allows {(-p.def) >= 0 ? '+' : ''}{(-p.def).toFixed(2)} EPA/play</div>
      <div style={{ opacity: 0.6 }}>{p.plays} plays in sample</div>
    </div>
  )
}

export function TeamQualityScatter({ points }: { points: QualityPoint[] }) {
  if (points.length < 8) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '40px 0', margin: 0 }}>The quality map appears once enough games are played.</p>
  const xs = points.map(p => p.off), ys = points.map(p => p.def)
  const pad = 0.04
  const dom = (a: number[]): [number, number] => [Math.floor((Math.min(...a) - pad) * 20) / 20, Math.ceil((Math.max(...a) + pad) * 20) / 20]
  return (
    <div style={{ height: 420 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid stroke="#f1eee6" />
          <XAxis type="number" dataKey="off" domain={dom(xs)} tick={AXIS} tickFormatter={(v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)} label={{ value: 'Offense: EPA per play  →  better', position: 'insideBottom', offset: -14, style: { ...AXIS, fill: '#5b5347' } }} />
          <YAxis type="number" dataKey="def" domain={dom(ys)} tick={AXIS} tickFormatter={(v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)} label={{ value: 'Defense  ↑  better', angle: -90, position: 'insideLeft', style: { ...AXIS, fill: '#5b5347' } }} />
          <ZAxis range={[400, 400]} />
          <ReferenceLine x={0} stroke="#1A1A1A" strokeOpacity={0.25} />
          <ReferenceLine y={0} stroke="#1A1A1A" strokeOpacity={0.25} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            data={points}
            shape={(props: { cx?: number; cy?: number; payload?: QualityPoint }) => {
              const { cx = 0, cy = 0, payload } = props
              if (!payload) return <g />
              return (
                <g>
                  <circle cx={cx} cy={cy} r={13} fill="#fff" stroke={payload.color} strokeWidth={2} />
                  <image href={payload.logo} x={cx - 9} y={cy - 9} width={18} height={18} />
                </g>
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
