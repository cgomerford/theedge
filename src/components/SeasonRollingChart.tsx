'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { TeamMetric, RollingPoint } from '@/lib/lab'

const METRIC_META: Record<TeamMetric, { label: string; format: (v: number) => string }> = {
  runs_per_game: { label: 'Runs/Game', format: v => v.toFixed(2) },
  team_era: { label: 'Team ERA', format: v => v.toFixed(2) },
  errors_per_game: { label: 'Errors/Game', format: v => v.toFixed(2) },
  team_ops: { label: 'Team OPS', format: v => v.toFixed(3) },
}

export default function SeasonRollingChart({ series, teamColor }: { series: Record<TeamMetric, RollingPoint[]>; teamColor: string }) {
  const [metric, setMetric] = useState<TeamMetric>('runs_per_game')
  const meta = METRIC_META[metric]
  const points = series[metric] ?? []
  const data = points.map((p, i) => ({ i: i + 1, value: p.value, date: p.date, opponent: p.opponent }))

  return (
    <div>
      <div style={{ fontSize: 9, color: '#a89e8c', marginBottom: 8 }}>10-game rolling window</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {(Object.keys(METRIC_META) as TeamMetric[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            style={{
              fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', padding: '4px 8px', borderRadius: 6,
              border: '1px solid ' + (metric === m ? '#1A1A1A' : '#e7e2d8'),
              background: metric === m ? '#1A1A1A' : '#fff',
              color: metric === m ? '#FAF8F3' : '#5b5347',
              cursor: 'pointer',
            }}
          >
            {METRIC_META[m].label}
          </button>
        ))}
      </div>
      {data.length === 0 ? (
        <p style={{ fontSize: 11, color: '#a89e8c', fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>No data available yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="i" tick={{ fontSize: 9, fontFamily: 'monospace' }} hide />
            <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} domain={['auto', 'auto']} width={38} tickFormatter={v => meta.format(v)} />
            <Tooltip
  formatter={(v: unknown) => (typeof v === 'number' ? meta.format(v) : '—')}
  labelFormatter={() => ''}
/>
            <Line type="monotone" dataKey="value" stroke={teamColor} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}