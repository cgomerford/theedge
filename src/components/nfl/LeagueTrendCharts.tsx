// src/components/nfl/LeagueTrendCharts.tsx
//
// Renders getLeagueCoverageTrend / getLeagueRouteTrend -- both were
// built in an earlier pass (alongside the League Leaders board) but
// never actually wired into any page. This is that missing piece.

'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { LeagueCoverageTrendPoint, LeagueRouteTrendPoint } from '@/lib/nfl/queries'

const MONO = "'JetBrains Mono', ui-monospace, monospace"

// Fixed palette so a given coverage type / route always gets the same
// color across renders and re-sorts, rather than recharts assigning
// colors by array order (which shifts as seasons filter in/out).
const COVERAGE_COLORS: Record<string, string> = {
  COVER_0: '#DC2626', COVER_1: '#F59E0B', COVER_2: '#22C55E', COVER_3: '#3B82F6',
  COVER_4: '#8B5CF6', COVER_6: '#EC4899', COVER_9: '#14B8A6', '2_MAN': '#64748B', COMBO: '#78716C',
}
const ROUTE_COLORS: Record<string, string> = {
  SLANT: '#FF5722', GO: '#3B82F6', POST: '#8B5CF6', CORNER: '#EC4899', OUT: '#22C55E',
  IN: '#F59E0B', CURL: '#14B8A6', FLAT: '#64748B', SCREEN: '#78716C', HITCH: '#DC2626',
}

function pivotBySeasson<T extends { season: number }>(rows: T[], keyField: keyof T, valueField: keyof T): { season: number; [k: string]: number }[] {
  const seasons = Array.from(new Set(rows.map((r) => r.season))).sort((a, b) => a - b)
  return seasons.map((season) => {
    const point: { season: number; [k: string]: number } = { season }
    for (const r of rows.filter((r) => r.season === season)) {
      point[String(r[keyField])] = Number(r[valueField])
    }
    return point
  })
}

export function LeagueCoverageTrendChart({ data = [] }: { data: LeagueCoverageTrendPoint[] }) {
  const pivoted = pivotBySeasson(data, 'coverageType', 'pct')
  const types = Array.from(new Set(data.map((d) => d.coverageType)))

  return (
    <div className="panel">
      <div className="panel-head"><h3>League Coverage Identity</h3></div>
      <p className="panel-note">Share of all charted defensive snaps league-wide, by coverage shell, across every synced season.</p>
      {pivoted.length === 0 ? (
        <p className="nh-empty tight">No coverage data synced yet.</p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={pivoted}>
              <XAxis dataKey="season" tick={{ fontSize: 10, fontFamily: MONO, fill: '#A3A3A3' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: MONO, fill: '#A3A3A3' }} unit="%" width={32} />
              <Tooltip contentStyle={{ fontSize: 11, fontFamily: MONO, borderRadius: 12 }} formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: MONO }} />
              {types.map((t) => (
                <Area
                  key={t}
                  type="monotone"
                  dataKey={t}
                  stackId="1"
                  stroke={COVERAGE_COLORS[t] ?? '#1A1A1A'}
                  fill={COVERAGE_COLORS[t] ?? '#1A1A1A'}
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function LeagueRouteTrendChart({ data = [] }: { data: LeagueRouteTrendPoint[] }) {

  // Route trees have more distinct labels than coverage shells --
  // capping to the top 6 by most-recent-season volume keeps the
  // stacked area legible instead of a 12-color soup.
  const latestSeason = Math.max(...data.map((d) => d.season), 0)
  const topRoutes = data
    .filter((d) => d.season === latestSeason)
    .sort((a, b) => b.targets - a.targets)
    .slice(0, 6)
    .map((d) => d.route)

  const filtered = data.filter((d) => topRoutes.includes(d.route))
  const pivoted = pivotBySeasson(filtered, 'route', 'pct')

  return (
    <div className="panel">
      <div className="panel-head"><h3>League Route Identity</h3></div>
      <p className="panel-note">Share of all charted targets league-wide, top 6 routes by current-season volume.</p>
      {pivoted.length === 0 ? (
        <p className="nh-empty tight">No route data synced yet.</p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={pivoted}>
              <XAxis dataKey="season" tick={{ fontSize: 10, fontFamily: MONO, fill: '#A3A3A3' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: MONO, fill: '#A3A3A3' }} unit="%" width={32} />
              <Tooltip contentStyle={{ fontSize: 11, fontFamily: MONO, borderRadius: 12 }} formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`}/>
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: MONO }} />
              {topRoutes.map((r) => (
                <Area
                  key={r}
                  type="monotone"
                  dataKey={r}
                  stackId="1"
                  stroke={ROUTE_COLORS[r] ?? '#1A1A1A'}
                  fill={ROUTE_COLORS[r] ?? '#1A1A1A'}
                  fillOpacity={0.55}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
