'use client'

// Recharts pieces for the Front Office hub. Props are plain data (no functions
// cross the server -> client boundary).
//   BuildScatter  every club placed by how much of its WAR is homegrown (x) vs
//                 traded for (y). The four LCS clubs are drawn larger.

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { C, MONO } from '@/components/team/ui'

export type BuildPoint = { abbr: string; name: string; x: number; y: number; color: string; text: string; big: boolean }

const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#8a8275' }

export function BuildScatter({ points, xMid, yMid }: { points: BuildPoint[]; xMid: number; yMid: number }) {
  if (points.length === 0) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>Not enough data yet.</p>
  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="#efebe1" />
          <XAxis type="number" dataKey="x" domain={[0, 'dataMax + 5']} unit="%" tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} label={{ value: 'Share of WAR from draft + international', position: 'insideBottom', offset: -12, fontSize: 10, fontFamily: MONO, fill: C.faint }} />
          <YAxis type="number" dataKey="y" domain={[0, 'dataMax + 5']} unit="%" tick={AXIS} tickLine={false} axisLine={false} width={44} label={{ value: 'Via trade', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fontFamily: MONO, fill: C.faint }} />
          <ReferenceLine x={xMid} stroke="#1A1A1A" strokeOpacity={0.25} strokeDasharray="4 4" />
          <ReferenceLine y={yMid} stroke="#1A1A1A" strokeOpacity={0.25} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as BuildPoint
              return <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '6px 9px', fontFamily: MONO, fontSize: 11, borderRadius: 8 }}>{p.name} · {p.x}% homegrown · {p.y}% trade</div>
            }}
          />
          <Scatter
            data={points}
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: BuildPoint }
              const w = payload.big ? 38 : 30, h = payload.big ? 22 : 17
              return (
                <g>
                  <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={5} fill={payload.color} stroke={payload.big ? '#FF5722' : '#fff'} strokeWidth={payload.big ? 2.5 : 1.5} />
                  <text x={cx} y={cy + 3} textAnchor="middle" fontSize={payload.big ? 10 : 8.5} fontFamily={MONO} fill={payload.text}>{payload.abbr}</text>
                </g>
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export type ClubPoint = { abbr: string; name: string; x: number; y: number; color: string; text: string }
const SANS_FONT = 'var(--font-outfit), system-ui, sans-serif'
const AXIS_SANS = { fontSize: 11, fontFamily: SANS_FONT, fill: '#8a8275' }

/** Every club on two per-game axes. Sans-serif only; no value is coloured red. */
export function ClubScatter({ points, xLabel, yLabel, xMid, yMid, reverseY }: { points: ClubPoint[]; xLabel: string; yLabel: string; xMid: number; yMid: number; reverseY?: boolean }) {
  if (points.length === 0) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>Not enough data yet.</p>
  return (
    <div style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 26, left: 4 }}>
          <CartesianGrid stroke="#efebe1" />
          <XAxis type="number" dataKey="x" domain={['dataMin - 0.2', 'dataMax + 0.2']} tickFormatter={v => Number(v).toFixed(1)} tick={AXIS_SANS} tickLine={false} axisLine={{ stroke: C.line }} label={{ value: xLabel, position: 'insideBottom', offset: -14, fontSize: 11, fontFamily: SANS_FONT, fill: C.mute }} />
          <YAxis type="number" dataKey="y" reversed={reverseY} domain={['dataMin - 0.2', 'dataMax + 0.2']} tickFormatter={v => Number(v).toFixed(1)} tick={AXIS_SANS} tickLine={false} axisLine={false} width={40} label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 8, fontSize: 11, fontFamily: SANS_FONT, fill: C.mute }} />
          <ReferenceLine x={xMid} stroke="#1A1A1A" strokeOpacity={0.25} strokeDasharray="4 4" />
          <ReferenceLine y={yMid} stroke="#1A1A1A" strokeOpacity={0.25} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as ClubPoint
              return <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '6px 9px', fontFamily: SANS_FONT, fontSize: 12, borderRadius: 8 }}>{p.name} · {p.x.toFixed(2)} / {p.y.toFixed(2)}</div>
            }}
          />
          <Scatter
            data={points}
            isAnimationActive={false}
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: ClubPoint }
              return (
                <g>
                  <rect x={cx - 15} y={cy - 8.5} width={30} height={17} rx={5} fill={payload.color} stroke="#fff" strokeWidth={1.5} />
                  <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily={SANS_FONT} fill={payload.text}>{payload.abbr}</text>
                </g>
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
