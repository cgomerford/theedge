'use client'

// src/components/InningPitcherRunsChart.tsx
//
// Two-series grouped bar chart: avg pitchers used per inning (bullpen
// churn) and runs scored per inning (offensive tendency), side by side
// per inning. Uses recharts (already a dependency — see PieChart usage
// in TeamDugoutView.tsx).

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { InningUsageBar } from '@/lib/bullpen-usage'

type Props = {
  data: InningUsageBar[]
  teamColor: string
  gamesSampled: number
}

export default function InningPitcherRunsChart({ data, teamColor, gamesSampled }: Props) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Pitchers used &amp; runs scored, by inning</div>
      <div style={{ fontSize: 9, color: '#a89e8c', marginTop: 2, marginBottom: 12 }}>Averages across last {gamesSampled} games</div>
      {data.length === 0 ? (
        <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No inning-level data available for this sample.</p>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1eee6" vertical={false} />
              <XAxis dataKey="inning" tick={{ fontSize: 10, fill: '#8a8275' }} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8a8275' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e7e2d8' }}
                formatter={(value: unknown, name: unknown) => [String(value), String(name)]}
                labelFormatter={(l) => `Inning ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="avgPitchers" name="Avg pitchers" fill={teamColor} radius={[3, 3, 0, 0]} />
              <Bar dataKey="runsScored" name="Runs scored" fill="#EF9F27" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
