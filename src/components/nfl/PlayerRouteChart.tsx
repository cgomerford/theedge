// src/components/nfl/PlayerRouteChart.tsx

'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { PlayerRouteProfile } from '@/lib/nfl/queries'

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SERIF = "'Fraunces', serif"

function epaColor(epa: number): string {
  // Green (strong value) -> amber (neutral) -> red (negative value),
  // scaled around 0 rather than a fixed min/max so a route with zero
  // volume elsewhere on the chart doesn't skew the scale.
  if (epa > 0.3) return '#16A34A'
  if (epa > 0) return '#84A98C'
  if (epa > -0.3) return '#D97706'
  return '#DC2626'
}

export function PlayerRouteChart({ profile, playerName }: { profile: PlayerRouteProfile; playerName: string }) {
  const data = profile.rows.filter((r) => r.targets > 0).slice(0, 5)

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{playerName}</h3>
      </div>
      <p className="panel-note">
        Target share by route, {profile.teamId} · {profile.season}. Bar color is EPA/target (value), not just volume — hover for the full breakdown.
      </p>
      {data.length === 0 ? (
        <p className="nh-empty tight">No charted targets yet this season.</p>
      ) : (
       <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40 }} barCategoryGap={6}>
              <XAxis type="number" tick={{ fontSize: 10, fontFamily: MONO, fill: '#A3A3A3' }} unit="%" />
              <YAxis type="category" dataKey="route" tick={{ fontSize: 10, fontFamily: MONO, fill: '#78716C' }} width={70} />
              <Tooltip
                contentStyle={{ fontSize: 11, fontFamily: MONO, borderRadius: 12 }}
                                formatter={(_value, _name, item) => {
                  const r = item?.payload as (typeof data)[number]
                  if (!r) return ['', '']
                  const lines = [
                    `${r.targetPct?.toFixed(1) ?? '—'}% share · ${r.targets} targets`,
                    `${r.catchRate?.toFixed(0) ?? '—'}% catch · ${r.yardsPerTarget?.toFixed(1) ?? '—'} yds/tgt`,
                    `${r.avgAirYards?.toFixed(1) ?? '—'} air yds · ${r.avgYac?.toFixed(1) ?? '—'} YAC`,
                    `${r.epaPerTarget != null ? (r.epaPerTarget > 0 ? '+' : '') + r.epaPerTarget.toFixed(2) : '—'} EPA/tgt · ${r.redZonePct?.toFixed(0) ?? '0'}% red zone · ${r.touchdowns} TD`,
                  ]
                  return [lines.join(' · '), r.route]
                }}
              />
              <Bar dataKey="targetPct" radius={[0, 6, 6, 0]}>
                {data.map((d) => (
                  <Cell key={d.route} fill={epaColor(d.epaPerTarget ?? 0)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
