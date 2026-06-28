'use client'

// src/components/LabDashboard.tsx
//
// Observe Dashboard:
//   - KPI sparkline cards (player leaders)
//   - AL/NL donut — now classified by team ID, not the `abbreviation`
//     string field, which wasn't coming back reliably (root cause of the
//     earlier "Unknown: 19" bug)
//   - AL/NL grouped bar (replaces the 3-axis radar — a radar with only 3
//     axes is genuinely hard to read; a grouped bar says the same thing
//     more clearly)
//   - Player + team leaderboards, now with visible value axes and labels
//   - Team trends: tabs (Runs/Game, Team ERA, Errors/Game, Team OPS),
//     each showing a top-5 line chart and an all-30-teams line chart
//   - Standings progression: cumulative win% across the season for the
//     top teams, with each team's logo marking the end of its line
//
// NOT included: hit-location heatmaps, sprint speed. Both need real
// Statcast data (ball-tracking coordinates, foot-speed measurements) that
// isn't wired anywhere in this app yet — faking those would be exactly the
// kind of invented-data shortcut this build has avoided everywhere else.
//
// Customise Graphs: search-driven player/team rolling charts (unchanged).
//
// Built against `recharts`.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { METRICS, LEADER_METRICS, LEAGUE_BY_TEAM_ID, DIVISIONS, type MetricKey, type SubjectType, type RollingPoint } from '@/lib/lab'
import { teamLogoUrl } from '@/lib/mlb'

const TEAMS: { id: number; name: string }[] = [
  { id: 108, name: 'Angels' }, { id: 109, name: 'D-backs' }, { id: 110, name: 'Orioles' },
  { id: 111, name: 'Red Sox' }, { id: 112, name: 'Cubs' }, { id: 113, name: 'Reds' },
  { id: 114, name: 'Guardians' }, { id: 115, name: 'Rockies' }, { id: 116, name: 'Tigers' },
  { id: 117, name: 'Astros' }, { id: 118, name: 'Royals' }, { id: 119, name: 'Dodgers' },
  { id: 120, name: 'Nationals' }, { id: 121, name: 'Mets' }, { id: 133, name: 'Athletics' },
  { id: 134, name: 'Pirates' }, { id: 135, name: 'Padres' }, { id: 136, name: 'Mariners' },
  { id: 137, name: 'Giants' }, { id: 138, name: 'Cardinals' }, { id: 139, name: 'Rays' },
  { id: 140, name: 'Rangers' }, { id: 141, name: 'Blue Jays' }, { id: 142, name: 'Twins' },
  { id: 143, name: 'Phillies' }, { id: 144, name: 'Braves' }, { id: 145, name: 'White Sox' },
  { id: 146, name: 'Marlins' }, { id: 147, name: 'Yankees' }, { id: 158, name: 'Brewers' },
].sort((a, b) => a.name.localeCompare(b.name))

type Person = { id: number; fullName: string; primaryPosition: string }
type LeaderRow = { rank: number; personId: number; teamId?: number; name: string; team: string; value: number }
type TeamSeries = { teamId: number; name: string; abbreviation: string; points: { gameIndex: number; value: number | null }[] }
type StandingsSeries = { teamId: number; name: string; abbreviation: string; points: { gameIndex: number; wins: number }[] }
type LabMode = 'observe' | 'customise'
type PendingJump = { person: Person; subjectType: SubjectType }
type TeamMetric = 'runs_per_game' | 'team_era' | 'errors_per_game' | 'team_ops'

const PITCHER_PLAYER_METRICS: MetricKey[] = ['era', 'fip', 'whip', 'k9']
const BATTER_PLAYER_METRICS: MetricKey[] = ['ops', 'slg', 'obp']
const ALL_LEADER_METRICS = Object.keys(LEADER_METRICS) as (keyof typeof LEADER_METRICS)[]
const TEAM_METRICS: { key: TeamMetric; label: string }[] = [
  { key: 'runs_per_game', label: 'Runs/game' },
  { key: 'team_era', label: 'Team ERA' },
  { key: 'errors_per_game', label: 'Errors/game' },
  { key: 'team_ops', label: 'Team OPS' },
]

function colorForIndex(i: number, total: number): string {
  const hue = Math.round((360 * i) / Math.max(total, 1))
  return `hsl(${hue}, 70%, 45%)`
}

// Real MLB primary brand colors — best-effort from general knowledge of team
// branding, not pulled from an official source. Worth double-checking exact
// hex values against official brand guides if pixel-perfect accuracy matters.
// Note: several teams genuinely share very similar navy/red primaries
// (that's true to their actual branding, not a bug here) — the click-to-
// highlight grey-out is what actually disambiguates crowded views; real
// colors alone won't make all 30 teams visually distinct from each other.
const TEAM_COLORS: Record<number, string> = {
  108: '#BA0021', 109: '#A71930', 110: '#DF4601', 111: '#BD3039', 112: '#0E3386',
  113: '#C6011F', 114: '#00385D', 115: '#333366', 116: '#0C2340', 117: '#EB6E1F',
  118: '#004687', 119: '#005A9C', 120: '#AB0003', 121: '#002D72', 133: '#003831',
  134: '#FDB827', 135: '#2F241D', 136: '#0C2C56', 137: '#FD5A1E', 138: '#C41E3A',
  139: '#092C5C', 140: '#003278', 141: '#134A8E', 142: '#002B5C', 143: '#E81828',
  144: '#CE1141', 145: '#27251F', 146: '#00A3E0', 147: '#003087', 158: '#12284B',
}

function teamColor(teamId: number, fallback: string): string {
  return TEAM_COLORS[teamId] ?? fallback
}

// Groups teams whose latest value is close together and assigns each a
// vertical pixel offset so their end-of-line logos don't stack on top of
// each other. This works on data values + a fixed pixel step, not the
// chart's actual pixel scale (recharts doesn't expose that outside the
// render), so it's an approximation — good enough to separate logos, not
// pixel-perfect to the axis.
function computeLogoOffsets(
  teams: { teamId: number; points: any[] }[], valueKey: string, logoSize: number
): Record<number, number> {
  const lasts = teams
    .map(t => ({ teamId: t.teamId, value: t.points[t.points.length - 1]?.[valueKey] }))
    .filter((l): l is { teamId: number; value: number } => typeof l.value === 'number')
  if (lasts.length < 2) return {}

  const values = lasts.map(l => l.value)
  const range = Math.max(1e-6, Math.max(...values) - Math.min(...values))
  const epsilon = range * 0.05
  const sorted = [...lasts].sort((a, b) => a.value - b.value)

  const offsets: Record<number, number> = {}
  let cluster: typeof sorted = []
  const flush = () => {
    const n = cluster.length
    cluster.forEach((c, idx) => { offsets[c.teamId] = (idx - (n - 1) / 2) * (logoSize + 4) })
    cluster = []
  }
  for (const item of sorted) {
    if (cluster.length === 0 || item.value - cluster[cluster.length - 1].value <= epsilon) {
      cluster.push(item)
    } else {
      flush()
      cluster.push(item)
    }
  }
  flush()
  return offsets
}

export default function LabDashboard() {
  const [mode, setMode] = useState<LabMode>('observe')
  const [pendingJump, setPendingJump] = useState<PendingJump | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('observe')}
          className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border transition ${mode === 'observe' ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}`}>
          Observe dashboard
        </button>
        <button type="button" onClick={() => setMode('customise')}
          className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border transition ${mode === 'customise' ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}`}>
          Customise graphs
        </button>
      </div>

      {mode === 'observe' ? (
        <ObserveDashboard onJumpToPlayer={(person, subjectType) => { setPendingJump({ person, subjectType }); setMode('customise') }} />
      ) : (
        <CustomiseGraphs jump={pendingJump} onConsumedJump={() => setPendingJump(null)} />
      )}
    </div>
  )
}

// ─────────────────────────── OBSERVE DASHBOARD ───────────────────────────

function ObserveDashboard({ onJumpToPlayer }: { onJumpToPlayer: (person: Person, subjectType: SubjectType) => void }) {
  const [leaders, setLeaders] = useState<Record<string, LeaderRow[]>>({})
  const [sparklines, setSparklines] = useState<Record<string, RollingPoint[]>>({})
  const [teamLeaders, setTeamLeaders] = useState<Record<string, LeaderRow[]>>({})
  const [leagueBars, setLeagueBars] = useState<{ subject: string; AL: number; NL: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pitcherMetrics: (keyof typeof LEADER_METRICS)[] = ['era', 'whip', 'k9']
  const batterMetrics: (keyof typeof LEADER_METRICS)[] = ['ops', 'slg', 'obp']
  const heroMetrics: (keyof typeof LEADER_METRICS)[] = ['era', 'k9', 'ops']

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [leaderEntries, teamEntries, radarRes] = await Promise.all([
        Promise.all(ALL_LEADER_METRICS.map(async metric => {
          const res = await fetch(`/api/lab/leaders?metric=${metric}&limit=5`)
          const json = await res.json()
          if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
          return [metric, json.leaders ?? []] as const
        })),
        Promise.all(TEAM_METRICS.map(async ({ key }) => {
          const res = await fetch(`/api/lab/team-leaders?metric=${key}&limit=5`)
          const json = await res.json()
          if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
          return [key, json.leaders ?? []] as const
        })),
        fetch('/api/lab/league-radar').then(r => r.json()),
      ])

      const leaderMap = Object.fromEntries(leaderEntries)
      setLeaders(leaderMap)
      setTeamLeaders(Object.fromEntries(teamEntries))
      setLeagueBars(radarRes.axes ?? [])

      const sparkEntries = await Promise.all(heroMetrics.map(async metric => {
        const top = leaderMap[metric]?.[0]
        if (!top) return [metric, []] as const
        const subjectType: SubjectType = metric === 'ops' ? 'batter' : 'pitcher'
        const params = new URLSearchParams({ subjectType, id: String(top.personId), metric, window: '10' })
        const res = await fetch(`/api/lab/rolling?${params}`)
        const json = await res.json()
        if (!res.ok) return [metric, []] as const
        return [metric, json.points ?? []] as const
      }))
      setSparklines(Object.fromEntries(sparkEntries))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the dashboard — try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Fixed: classify by teamId, not the abbreviation string (see lab.ts notes)
  const leagueCounts = (() => {
    const seen = new Map<number, number | undefined>()
    for (const metric of ALL_LEADER_METRICS) {
      for (const row of leaders[metric] ?? []) {
        if (!seen.has(row.personId)) seen.set(row.personId, row.teamId)
      }
    }
    let AL = 0, NL = 0, Unknown = 0
    for (const teamId of seen.values()) {
      const league = teamId ? LEAGUE_BY_TEAM_ID[teamId] : undefined
      if (league === 'AL') AL++
      else if (league === 'NL') NL++
      else Unknown++
    }
    return [
      { name: 'AL', value: AL, fill: '#FF5722' },
      { name: 'NL', value: NL, fill: '#FDE047' },
      ...(Unknown > 0 ? [{ name: 'Unknown', value: Unknown, fill: '#A3A3A3' }] : []),
    ]
  })()

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-600 font-mono">{error}</p>
          <button type="button" onClick={load} className="text-[10px] font-mono uppercase tracking-widest text-stone-500 underline">Retry</button>
        </div>
      )}
      {loading && <p className="text-sm font-mono text-stone-400">Loading dashboard…</p>}

      {/* Hero KPIs */}
      <div className="grid sm:grid-cols-3 gap-4">
        {heroMetrics.map(metric => {
          const top = leaders[metric]?.[0]
          const meta = METRICS.find(m => m.key === metric)
          const subjectType: SubjectType = metric === 'ops' ? 'batter' : 'pitcher'
          return (
            <KpiCard key={metric} label={LEADER_METRICS[metric].label.replace(' leaders', '')} top={top} format={meta?.format}
              points={sparklines[metric] ?? []}
              onClick={top ? () => onJumpToPlayer({ id: top.personId, fullName: top.name, primaryPosition: '' }, subjectType) : undefined} />
          )
        })}
      </div>

      {/* Donut + AL/NL grouped bar */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-stone-200 bg-white p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">League split · today&apos;s leaders</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={leagueCounts} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2}>
                  {leagueCounts.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {leagueCounts.map(c => (
                <div key={c.name} className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-2.5 h-2.5" style={{ background: c.fill }} />
                  <span className="text-stone-600">{c.name}</span>
                  <span className="text-stone-900 font-bold">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border border-stone-200 bg-white p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">AL vs NL · team averages</div>
          <p className="text-[9px] font-mono text-stone-400 mb-2">Relative comparison, not absolute percentile.</p>
          {leagueBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={leagueBars} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                <YAxis type="category" dataKey="subject" width={110} tick={{ fontSize: 9, fontFamily: 'monospace' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
                <Bar dataKey="AL" fill="#FF5722" />
                <Bar dataKey="NL" fill="#FDE047" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs font-mono text-stone-400 py-8 text-center">No data yet.</p>
          )}
        </div>
      </div>

      {/* Team leaderboards */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ Team leaders</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TEAM_METRICS.map(({ key, label }) => (
            <TeamLeaderCard key={key} title={label} rows={teamLeaders[key] ?? []} format={METRICS.find(m => m.key === key)?.format} />
          ))}
        </div>
        <p className="text-[10px] font-mono text-stone-400 mt-2">
          Team ERA covers the whole pitching staff (starters + bullpen) — true bullpen-only splits aren&apos;t wired yet.
        </p>
      </div>

      {/* Player leaderboards — now with visible axis + value labels */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ Pitching leaders</div>
        <div className="grid sm:grid-cols-3 gap-4">
          {pitcherMetrics.map(metric => (
            <LeaderCard key={metric} title={LEADER_METRICS[metric].label} rows={leaders[metric] ?? []} format={METRICS.find(m => m.key === metric)?.format}
              onPick={(personId, name) => onJumpToPlayer({ id: personId, fullName: name, primaryPosition: 'P' }, 'pitcher')} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ Batting leaders</div>
        <div className="grid sm:grid-cols-3 gap-4">
          {batterMetrics.map(metric => (
            <LeaderCard key={metric} title={LEADER_METRICS[metric].label} rows={leaders[metric] ?? []} format={METRICS.find(m => m.key === metric)?.format}
              onPick={(personId, name) => onJumpToPlayer({ id: personId, fullName: name, primaryPosition: '' }, 'batter')} />
          ))}
        </div>
      </div>

      {/* Team trend tabs — All / AL / NL / division, with click-to-highlight key */}
      <TeamTrends teamLeaders={teamLeaders} />

      {/* Standings progression by division, with click-to-highlight key */}
      <Standings />

      <p className="text-[10px] font-mono text-stone-400">
        Hit-location heatmaps and sprint speed aren&apos;t included — both need real Statcast tracking data this app doesn&apos;t have wired yet.
      </p>
    </div>
  )
}

const SCOPES: { key: string; label: string; teamIds: number[] | null }[] = [
  { key: 'all', label: 'All teams', teamIds: null },
  { key: 'AL', label: 'AL', teamIds: null }, // resolved at render time via LEAGUE_BY_TEAM_ID
  { key: 'NL', label: 'NL', teamIds: null },
  { key: 'AL East', label: 'AL East', teamIds: DIVISIONS['AL East'] },
  { key: 'AL Central', label: 'AL Central', teamIds: DIVISIONS['AL Central'] },
  { key: 'AL West', label: 'AL West', teamIds: DIVISIONS['AL West'] },
  { key: 'NL East', label: 'NL East', teamIds: DIVISIONS['NL East'] },
  { key: 'NL Central', label: 'NL Central', teamIds: DIVISIONS['NL Central'] },
  { key: 'NL West', label: 'NL West', teamIds: DIVISIONS['NL West'] },
]

function filterByScope<T extends { teamId: number }>(items: T[], scopeKey: string): T[] {
  if (scopeKey === 'all') return items
  if (scopeKey === 'AL') return items.filter(i => LEAGUE_BY_TEAM_ID[i.teamId] === 'AL')
  if (scopeKey === 'NL') return items.filter(i => LEAGUE_BY_TEAM_ID[i.teamId] === 'NL')
  const ids = DIVISIONS[scopeKey]
  return ids ? items.filter(i => ids.includes(i.teamId)) : items
}

function TeamTrends({ teamLeaders }: { teamLeaders: Record<string, LeaderRow[]> }) {
  const [metric, setMetric] = useState<TeamMetric>('runs_per_game')
  const [scope, setScope] = useState<string>('all')
  const [series, setSeries] = useState<TeamSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/lab/teams-rolling?metric=${metric}&window=10`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSeries(json.series ?? []) })
      .catch(() => { if (!cancelled) setError("Couldn't load team trends — try again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [metric])

  const metricMeta = METRICS.find(m => m.key === metric)
  const scoped = filterByScope(series, scope)

  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ Team trends across the season</div>

      <div className="flex flex-wrap gap-2 mb-2">
        {TEAM_METRICS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setMetric(key)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest border transition ${metric === key ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {SCOPES.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setScope(key)}
            className={`px-3 py-1 font-mono text-[10px] uppercase tracking-widest border transition ${scope === key ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 font-mono mb-2">{error}</p>}
      {loading && <p className="text-sm font-mono text-stone-400 mb-2">Loading all 30 teams…</p>}

      {scoped.length > 0 ? (
        <TeamCompareChart teams={scoped} valueKey="value" format={metricMeta?.format} showLogoAtEnd logoSize={14} height={300} />
      ) : (
        <p className="text-xs font-mono text-stone-400 border border-stone-200 bg-white p-4">No data yet.</p>
      )}
    </div>
  )
}

function Standings() {
  const [division, setDivision] = useState<string>('AL East')
  const [series, setSeries] = useState<StandingsSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/lab/standings-progress?division=${encodeURIComponent(division)}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setSeries(json.series ?? []) })
      .catch(() => { if (!cancelled) setError("Couldn't load standings — try again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [division])

  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">⊕ Standings progression</div>
      <p className="text-[9px] font-mono text-stone-400 mb-3">Cumulative win% across the season, by game number. Logo marks each team&apos;s current spot.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.keys(DIVISIONS).map(d => (
          <button key={d} type="button" onClick={() => setDivision(d)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest border transition ${division === d ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}`}>
            {d}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 font-mono mb-2">{error}</p>}
      {loading && <p className="text-sm font-mono text-stone-400 mb-2">Loading {division}…</p>}

      {series.length > 0 ? (
        <TeamCompareChart teams={series} valueKey="wins" format={(v) => String(Math.round(v))} showLogoAtEnd logoSize={10} height={300} />
      ) : (
        <p className="text-xs font-mono text-stone-400 border border-stone-200 bg-white p-4">No data yet.</p>
      )}
    </div>
  )
}

// Shared chart for both Team Trends and Standings: one line per team plus a
// clickable key on the right. Click a team to add it to the highlighted set
// (its real team color, bold) — everyone else dims to grey. Click again to
// remove it. Empty selection = everyone shown in their own team color.
function TeamCompareChart({
  teams, valueKey, format, yDomain, showLogoAtEnd, logoSize = 20, height = 280,
}: {
  teams: { teamId: number; name: string; abbreviation: string; points: any[] }[]
  valueKey: string
  format?: (v: number) => string
  yDomain?: [number, number]
  showLogoAtEnd?: boolean
  logoSize?: number
  height?: number
}) {
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())

  function toggle(abbr: string) {
    setHighlighted(prev => {
      const next = new Set(prev)
      if (next.has(abbr)) next.delete(abbr)
      else next.add(abbr)
      return next
    })
  }

  const noneSelected = highlighted.size === 0
  const logoOffsets = useMemo(
    () => (showLogoAtEnd ? computeLogoOffsets(teams, valueKey, logoSize) : {}),
    [teams, valueKey, logoSize, showLogoAtEnd]
  )

  return (
    <div className="border border-stone-200 bg-white p-4 flex gap-4">
      <div className="flex-1 min-w-0">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d6" />
            <XAxis dataKey="gameIndex" type="number" allowDuplicatedCategory={false} tick={{ fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis domain={yDomain ?? ['auto', 'auto']} tick={{ fontSize: 9, fontFamily: 'monospace' }} />
            <Tooltip formatter={(v) => (typeof v === 'number' && format ? format(v) : String(v ?? ''))} />
            {teams.map((t, i) => {
              const isOn = highlighted.has(t.abbreviation)
              const dimmed = !noneSelected && !isOn
              const baseColor = teamColor(t.teamId, colorForIndex(i, teams.length))
              const color = noneSelected || isOn ? baseColor : '#D6D3D1'
              const lastIndex = t.points[t.points.length - 1]?.gameIndex
              const yOffset = logoOffsets[t.teamId] ?? 0
              return (
                <Line
                  key={t.teamId}
                  data={t.points}
                  dataKey={valueKey}
                  name={t.abbreviation || t.name}
                  stroke={color}
                  strokeWidth={isOn ? 3 : dimmed ? 1 : 1.5}
                  strokeOpacity={dimmed ? 0.5 : 1}
                  isAnimationActive={false}
                  connectNulls
                  dot={
                    showLogoAtEnd
                      ? (props: any) =>
                          props.payload.gameIndex === lastIndex ? (
                            <image
                              key={`${t.teamId}-logo`}
                              x={props.cx - logoSize / 2}
                              y={props.cy - logoSize / 2 + yOffset}
                              width={logoSize}
                              height={logoSize}
                              href={teamLogoUrl(t.teamId)}
                              opacity={dimmed ? 0.35 : 1}
                            />
                          ) : (
                            <g key={`${t.teamId}-${props.payload.gameIndex}`} />
                          )
                      : false
                  }
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="w-32 shrink-0 space-y-0.5 max-h-80 overflow-y-auto">
        {teams.map((t, i) => {
          const isOn = highlighted.has(t.abbreviation)
          const baseColor = teamColor(t.teamId, colorForIndex(i, teams.length))
          return (
            <button key={t.teamId} type="button" onClick={() => toggle(t.abbreviation)}
              className={`w-full flex items-center gap-1.5 text-left px-1.5 py-1 font-mono text-[10px] transition ${isOn ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: noneSelected || isOn ? baseColor : '#D6D3D1' }} />
              <span className={isOn ? 'text-stone-900 font-bold' : 'text-stone-500'}>{t.abbreviation || t.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}


function KpiCard({ label, top, format, points, onClick }: {
  label: string; top?: LeaderRow; format?: (v: number) => string; points: RollingPoint[]; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="text-left border border-stone-200 bg-white p-4 hover:border-stone-400 transition disabled:cursor-default">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">{label} leader</div>
      {top ? (
        <>
          <div className="font-serif font-bold text-stone-900 text-lg leading-tight">{top.name}</div>
          <div className="flex items-baseline gap-2 mt-1 mb-2">
            <span className="font-mono text-2xl font-bold text-[#FF5722]">{format ? format(top.value) : top.value}</span>
            <span className="text-[10px] font-mono text-stone-400">· {top.team}</span>
          </div>
          {points.length > 1 && (
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={points}>
                <Line type="monotone" dataKey="value" stroke="#FF5722" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      ) : <p className="text-xs font-mono text-stone-400">No data yet.</p>}
    </button>
  )
}

function LeaderCard({ title, rows, format, onPick }: {
  title: string; rows: LeaderRow[]; format?: (v: number) => string; onPick: (personId: number, name: string) => void
}) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{title}</div>
      {rows.length === 0 ? <p className="text-xs font-mono text-stone-400">No data yet.</p> : (
        <ResponsiveContainer width="100%" height={rows.length * 36 + 24}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
            <XAxis type="number" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} tickFormatter={(v) => format ? format(v) : String(v)} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#57534e' }}
              tickFormatter={(name: string) => (name.length > 14 ? name.slice(0, 13) + '…' : name)} />
            <Tooltip formatter={(v) => (typeof v === 'number' && format ? format(v) : String(v ?? ''))} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} />
            <Bar dataKey="value" fill="#FF5722" radius={0} cursor="pointer" onClick={(data: any) => onPick(data.personId, data.name)}>
              <LabelList dataKey="value" position="right" formatter={(v) => (typeof v === 'number' && format ? format(v) : String(v ?? ''))} style={{ fontSize: 10, fontFamily: 'monospace', fill: '#1A1A1A' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function TeamLeaderCard({ title, rows, format }: { title: string; rows: LeaderRow[]; format?: (v: number) => string }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{title}</div>
      {rows.length === 0 ? <p className="text-xs font-mono text-stone-400">No data yet.</p> : (
        <ResponsiveContainer width="100%" height={rows.length * 36 + 24}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
            <XAxis type="number" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} tickFormatter={(v) => format ? format(v) : String(v)} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#57534e' }}
              tickFormatter={(name: string) => (name.length > 14 ? name.slice(0, 13) + '…' : name)} />
            <Tooltip formatter={(v) => (typeof v === 'number' && format ? format(v) : String(v ?? ''))} />
            <Bar dataKey="value" fill="#1A1A1A" radius={0}>
              <LabelList dataKey="value" position="right" formatter={(v) => (typeof v === 'number' && format ? format(v) : String(v ?? ''))} style={{ fontSize: 10, fontFamily: 'monospace', fill: '#1A1A1A' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─────────────────────────── CUSTOMISE GRAPHS ───────────────────────────

function CustomiseGraphs({ jump, onConsumedJump }: { jump: PendingJump | null; onConsumedJump: () => void }) {
  const [subjectType, setSubjectType] = useState<SubjectType>(jump?.subjectType ?? 'pitcher')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(jump?.person ?? null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [window_, setWindow] = useState(10)
  const [playerPoints, setPlayerPoints] = useState<Record<string, RollingPoint[]>>({})
  const [playerLoading, setPlayerLoading] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)

  const [teamId, setTeamId] = useState<number>(TEAMS[0].id)
  const [teamMetric, setTeamMetric] = useState<MetricKey>('runs_per_game')
  const [teamWindow, setTeamWindow] = useState(10)
  const [teamPoints, setTeamPoints] = useState<RollingPoint[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)

  const playerMetrics = subjectType === 'pitcher' ? PITCHER_PLAYER_METRICS : BATTER_PLAYER_METRICS

  const loadPlayerCharts = useCallback(async (personId: number, metrics: MetricKey[], win: number, type: SubjectType) => {
    setPlayerLoading(true)
    setPlayerError(null)
    try {
      const entries = await Promise.all(metrics.map(async metric => {
        const params = new URLSearchParams({ subjectType: type, id: String(personId), metric, window: String(win) })
        const res = await fetch(`/api/lab/rolling?${params}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
        return [metric, json.points ?? []] as const
      }))
      setPlayerPoints(Object.fromEntries(entries))
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : "Couldn't load that player's charts — try again.")
    } finally {
      setPlayerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (jump) {
      loadPlayerCharts(jump.person.id, jump.subjectType === 'pitcher' ? PITCHER_PLAYER_METRICS : BATTER_PLAYER_METRICS, window_, jump.subjectType)
      onConsumedJump()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (subjectType === 'team' || query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/lab/search?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.people ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query, subjectType])

  function pickPerson(p: Person) {
    setSelectedPerson(p); setQuery(''); setResults([]); setPlayerPoints({})
    loadPlayerCharts(p.id, playerMetrics, window_, subjectType)
  }

  function changeWindow(w: number) {
    setWindow(w)
    if (selectedPerson) loadPlayerCharts(selectedPerson.id, playerMetrics, w, subjectType)
  }

  async function loadTeamChart() {
    setTeamLoading(true)
    setTeamError(null)
    try {
      const params = new URLSearchParams({ subjectType: 'team', id: String(teamId), metric: teamMetric, window: String(teamWindow) })
      const res = await fetch(`/api/lab/rolling?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || json.error || 'Request failed')
      setTeamPoints(json.points ?? [])
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : "Couldn't load that chart — try again.")
    } finally {
      setTeamLoading(false)
    }
  }

  const teamMetricMeta = METRICS.find(m => m.key === teamMetric)
  const teamAvailableMetrics = METRICS.filter(m => m.subjectType === 'team')

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['pitcher', 'batter', 'team'] as SubjectType[]).map(t => (
          <button key={t} type="button" onClick={() => { setSubjectType(t); setSelectedPerson(null); setPlayerPoints({}) }}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border transition ${subjectType === t ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}`}>
            {t === 'pitcher' ? 'Pitcher' : t === 'batter' ? 'Batter' : 'Team'}
          </button>
        ))}
      </div>

      {subjectType === 'team' ? (
        <>
          <select value={teamId} onChange={e => setTeamId(Number(e.target.value))} className="border border-stone-300 px-3 py-2 font-mono text-sm bg-white">
            {TEAMS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <select value={teamMetric} onChange={e => setTeamMetric(e.target.value as MetricKey)} className="border border-stone-300 px-3 py-2 font-mono text-sm bg-white">
              {teamAvailableMetrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select value={teamWindow} onChange={e => setTeamWindow(Number(e.target.value))} className="border border-stone-300 px-3 py-2 font-mono text-sm bg-white">
              {[5, 10, 15, 30].map(w => <option key={w} value={w}>Last {w} games</option>)}
            </select>
            <button type="button" onClick={loadTeamChart} disabled={teamLoading} className="bg-[#FF5722] text-white px-5 py-2 font-mono text-xs uppercase tracking-widest hover:bg-orange-600 transition disabled:opacity-40">
              {teamLoading ? 'Loading…' : 'Run chart →'}
            </button>
          </div>
          {teamError && <p className="text-sm text-red-600 font-mono">{teamError}</p>}
          {teamPoints.length > 0 && teamMetricMeta && <ChartCard label={teamMetricMeta.label} window={teamWindow} points={teamPoints} format={teamMetricMeta.format} />}
        </>
      ) : (
        <>
          <div className="relative max-w-sm">
            <input value={selectedPerson ? selectedPerson.fullName : query}
              onChange={e => { setQuery(e.target.value); if (selectedPerson) { setSelectedPerson(null); setPlayerPoints({}) } }}
              placeholder={`Search ${subjectType}s…`} className="w-full border border-stone-300 px-3 py-2 font-mono text-sm" />
            {results.length > 0 && !selectedPerson && (
              <div className="absolute z-10 w-full bg-white border border-stone-300 mt-1 max-h-56 overflow-y-auto">
                {results.map(p => (
                  <button key={p.id} type="button" onClick={() => pickPerson(p)} className="block w-full text-left px-3 py-2 text-sm font-mono hover:bg-stone-50">
                    {p.fullName} <span className="text-stone-400">· {p.primaryPosition}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!selectedPerson && <p className="text-sm font-mono text-stone-400">Search for a {subjectType} to see their rolling charts.</p>}

          {selectedPerson && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-serif font-semibold text-stone-900">{selectedPerson.fullName}</span>
                <select value={window_} onChange={e => changeWindow(Number(e.target.value))} className="border border-stone-300 px-3 py-1.5 font-mono text-xs bg-white ml-2">
                  {[5, 10, 15, 30].map(w => <option key={w} value={w}>Last {w} games</option>)}
                </select>
              </div>
              {playerError && <p className="text-sm text-red-600 font-mono">{playerError}</p>}
              {playerLoading && <p className="text-sm font-mono text-stone-400">Loading {selectedPerson.fullName}&apos;s charts…</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                {playerMetrics.map(metric => {
                  const meta = METRICS.find(m => m.key === metric)
                  const points = playerPoints[metric]
                  if (!meta || !points) return null
                  return <ChartCard key={metric} label={meta.label} window={window_} points={points} format={meta.format} />
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ChartCard({ label, window, points, format }: { label: string; window: number; points: RollingPoint[]; format: (v: number) => string }) {
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">Rolling {label} · last {window} games</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d6" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace' }} domain={['auto', 'auto']} />
          <Tooltip formatter={(v) => (typeof v === 'number' ? format(v) : String(v ?? ''))} labelFormatter={(lbl, payload) => `${lbl} vs ${payload?.[0]?.payload?.opponent ?? ''}`} />
          <Line type="monotone" dataKey="value" stroke="#FF5722" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}