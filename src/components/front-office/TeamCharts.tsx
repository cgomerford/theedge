'use client'

// Recharts pieces for the team Front Office page. Props are plain data only.
//   AgeBars     players (bars) and their WAR (second series) by age bracket
//   PayrollBars committed salary by season, split guaranteed / option

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, SANS } from '@/components/team/ui'

const AXIS = { fontSize: 11, fontFamily: SANS, fill: '#8a8275' }
const TIP = { background: '#1A1A1A', color: '#FAF8F3', border: 0, borderRadius: 8, fontFamily: SANS, fontSize: 12 }

export type AgeBucket = { label: string; players: number; war: number }

export function AgeBars({ data, color }: { data: AgeBucket[]; color: string }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#efebe1" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} />
          <YAxis yAxisId="l" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={28} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={34} />
          <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(0,0,0,.04)' }} />
          <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />
          <Bar yAxisId="l" dataKey="players" name="Players" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="r" dataKey="war" name="WAR" fill={C.yellow} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export type PayrollYear = { season: string; guaranteed: number; option: number }

export function PayrollBars({ data, color }: { data: PayrollYear[]; color: string }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#efebe1" vertical={false} />
          <XAxis dataKey="season" tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={v => `$${v}M`} />
          <Tooltip contentStyle={TIP} cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v: unknown) => `$${Number(v).toFixed(1)}M`} />
          <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />
          <Bar dataKey="guaranteed" name="Guaranteed" stackId="p" fill={color} isAnimationActive={false} />
          <Bar dataKey="option" name="Option / non-guaranteed" stackId="p" fill={C.yellow} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
