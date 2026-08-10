'use client'

// src/components/BattingInningChart.tsx
//
// Offense side: avg pitches SEEN per inning, stacked as balls (bottom) +
// strikes (top) on the left axis, with avg runs scored per inning drawn
// as a line-with-dots on a secondary right axis (different unit, so it
// gets its own scale rather than fighting the pitch-count bars for
// vertical space).

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { BattingPitchingInningUsage } from '@/lib/bullpen-usage'

type Props = {
  data: BattingPitchingInningUsage[]
  teamColor: string
  gamesSampled: number
}

export default function BattingInningChart({ data, teamColor, gamesSampled }: Props) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Batting — pitches seen &amp; runs scored, by inning</div>
      <div style={{ fontSize: 9, color: '#a89e8c', marginTop: 2, marginBottom: 12 }}>Averages across last {gamesSampled} games · bars = balls + strikes seen (left axis) · line = avg runs scored (right axis) · extra innings only shown with 10+ games of sample</div>
      {data.length === 0 ? (
        <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No inning-level data available for this sample.</p>
      ) : (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1eee6" vertical={false} />
              <XAxis dataKey="inning" tick={{ fontSize: 10, fill: '#8a8275' }} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} />
              <YAxis yAxisId="pitches" tick={{ fontSize: 10, fill: '#8a8275' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="runs" orientation="right" tick={{ fontSize: 10, fill: '#1D9E75' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e7e2d8' }}
                labelFormatter={(l, payload) => {
                  const n = payload?.[0]?.payload?.gamesSampled
                  return `Inning ${l}${n != null ? ` · ${n} games` : ''}`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="pitches" dataKey="avgBallsSeen" name="Avg balls seen" stackId="pitches" fill="#d6cdb8" radius={[0, 0, 0, 0]} />
              <Bar yAxisId="pitches" dataKey="avgStrikesSeen" name="Avg strikes seen" stackId="pitches" fill={teamColor} radius={[3, 3, 0, 0]} />
              <Line yAxisId="runs" type="monotone" dataKey="avgRunsScored" name="Avg runs scored" stroke="#1D9E75" strokeWidth={2} dot={{ r: 4, fill: '#1D9E75' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}