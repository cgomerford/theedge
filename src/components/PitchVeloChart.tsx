'use client'

// Velocity distribution by pitch type — grouped bar chart showing average
// velo per pitch from the arsenal data. Uses recharts BarChart, same
// dependency already used by SeriesMomentum.

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'

// Savant's pitch-arsenal-stats CSV doesn't carry average velocity directly.
// This component expects it to be passed in separately — either from the
// movement data (which DOES carry release_speed per pitch) or from a
// future velo-specific fetch. If veloByType is empty, falls back to
// showing just the pitch names without bars.

export type VeloEntry = { pitchName: string; pitchType: string; avgVelo: number }

export default function PitchVeloChart({ entries }: { entries: VeloEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">Velocity by pitch</p>
      <p className="text-[10px] font-mono text-stone-400 mb-3">Average release speed (mph)</p>
      <ResponsiveContainer width="100%" height={entries.length * 36 + 20}>
        <BarChart data={entries} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[60, 100]} tick={{ fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis
            type="category"
            dataKey="pitchName"
            tick={{ fontSize: 10, fontFamily: "'Fraunces', serif" }}
            width={90}
          />
          <Tooltip
            formatter={(v: any) => [`${v.toFixed(1)} mph`, 'Avg velo']}
            labelStyle={{ fontFamily: "'Fraunces', serif", fontSize: 12 }}
          />
          <Bar dataKey="avgVelo" radius={[0, 4, 4, 0]} barSize={16}>
            {entries.map((e, i) => (
              <Cell key={i} fill={pitchColor(e.pitchType)} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}