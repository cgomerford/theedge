'use client'

// §00 Process vs results: x = xERA, y = ERA, one dot per pitcher, diagonal = "ERA equals xERA".
// Above the line the ERA is worse than the quality of contact, strikeouts and walks deserved. Click a dot to
// load that pitcher (sets ?p=). Props are plain data. Recharts only (house rule).

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { C, SANS } from '@/components/team/ui'
import { Headshot } from './Avatar'

export type ScatterPt = { id: number; name: string; xera: number; era: number; ip: number }

const AXIS = { fontSize: 11, fontFamily: SANS, fill: '#8a8275' }

export default function ProcessVsResults({ points, selected, color }: { points: ScatterPt[]; selected: number; color: string }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const vals = points.flatMap(p => [p.xera, p.era])
  const lo = Math.floor((Math.min(...vals) - 0.25) * 2) / 2
  const hi = Math.ceil((Math.max(...vals) + 0.25) * 2) / 2

  function pick(id: number) {
    const q = new URLSearchParams(sp.toString())
    q.set('p', String(id)); q.delete('pt')
    router.replace(`${path}?${q.toString()}`, { scroll: false })
  }

  return (
    <div style={{ height: 330 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 14, bottom: 22, left: 4 }}>
          <CartesianGrid stroke="#efebe1" />
          <XAxis type="number" dataKey="xera" name="xERA" domain={[lo, hi]} tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }}
            label={{ value: 'xERA (what he deserved)', position: 'insideBottom', offset: -12, style: { ...AXIS } }} />
          <YAxis type="number" dataKey="era" name="ERA" domain={[lo, hi]} tick={AXIS} tickLine={false} axisLine={false} width={34}
            label={{ value: 'ERA', angle: -90, position: 'insideLeft', style: { ...AXIS } }} />
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="#1A1A1A" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip cursor={false} content={({ payload }) => {
            const p = payload?.[0]?.payload as ScatterPt | undefined
            if (!p) return null
            return (
              <div style={{ background: '#1A1A1A', color: '#FAF8F3', borderRadius: 10, padding: '9px 12px', fontFamily: SANS, fontSize: 12, lineHeight: 1.45, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,.28)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Headshot id={p.id} size={28} /><b style={{ fontSize: 12.5 }}>{p.name}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>ERA</span><b>{p.era.toFixed(2)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>xERA</span><b>{p.xera.toFixed(2)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>ERA − xERA</span><b>{p.era - p.xera > 0 ? '+' : ''}{(p.era - p.xera).toFixed(2)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ opacity: .7 }}>Innings</span><b>{p.ip.toFixed(1)}</b></div>
                <div style={{ marginTop: 5, opacity: .7, fontSize: 10 }}>{p.era - p.xera > 0.15 ? 'ERA worse than his process deserved.' : p.era - p.xera < -0.15 ? 'ERA better than his process deserved.' : 'ERA in line with his process.'} Click to load him.</div>
              </div>
            )
          }} />
          <Scatter data={points} isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number; payload?: ScatterPt }) => {
              const { cx, cy, payload } = props
              if (cx == null || cy == null || !payload) return <g />
              const on = payload.id === selected
              return (
                <g style={{ cursor: 'pointer' }} onClick={() => pick(payload.id)}>
                  <circle cx={cx} cy={cy} r={14} fill="transparent" />
                  <circle cx={cx} cy={cy} r={on ? 8 : 5.5} fill={on ? C.orange : color} fillOpacity={on ? 1 : 0.75} stroke={on ? C.ink : '#fff'} strokeWidth={on ? 2 : 1} />
                  {on && <text x={cx + 11} y={cy - 9} fontFamily={SANS} fontSize={11} fontWeight={700} fill={C.ink}>{payload.name.split(' ').slice(-1)[0]}</text>}
                </g>
              )
            }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
