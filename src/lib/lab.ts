// src/lib/lab.ts
//
// Pro "Lab" dashboard — rolling stats, leaderboards, team trends and
// standings progression. Pulls live from the MLB Stats API.
//
// Honesty notes:
// - "Team ERA" is the whole pitching staff (starter + relief) — true
//   bullpen-only ERA needs per-game boxscore splitting, not wired.
// - League (AL/NL) classification is by official team ID, not the
//   `abbreviation` string field — that field wasn't coming back reliably
//   from the leaders endpoint (root cause of the earlier "Unknown: 19" bug).
//   IDs are ours to control; strings from the API aren't.
// - AL vs NL comparisons are relative (normalized against each other),
//   not absolute percentiles — we don't have full historical context for that.
// - Standings progression computes cumulative win% from each team's full
//   schedule of decided games — it's real, but it's a derived calculation,
//   not a single "standings on date X" API call (which doesn't exist cleanly
//   per-team-per-day without many more requests than this is worth).
// - Endpoint shapes (/stats/leaders, /teams/stats, /schedule, /standings,
//   /people/search) are undocumented-API guesses based on common usage —
//   verify against real responses if something looks off.

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const FIP_CONSTANT = 3.10 // fixed constant — a known simplification

export type MetricKey =
  | 'era' | 'fip' | 'whip' | 'k9'                                          // pitcher
  | 'ops' | 'slg' | 'obp'                                                   // batter
  | 'runs_per_game' | 'team_era' | 'errors_per_game' | 'team_ops'           // team

export type SubjectType = 'pitcher' | 'batter' | 'team'

export type RollingPoint = {
  date: string
  opponent: string
  value: number | null
}

export const METRICS: {
  key: MetricKey
  label: string
  subjectType: SubjectType
  format: (v: number) => string
}[] = [
  { key: 'era', label: 'ERA', subjectType: 'pitcher', format: v => v.toFixed(2) },
  { key: 'fip', label: 'FIP', subjectType: 'pitcher', format: v => v.toFixed(2) },
  { key: 'whip', label: 'WHIP', subjectType: 'pitcher', format: v => v.toFixed(2) },
  { key: 'k9', label: 'K/9', subjectType: 'pitcher', format: v => v.toFixed(1) },
  { key: 'ops', label: 'OPS', subjectType: 'batter', format: v => v.toFixed(3) },
  { key: 'slg', label: 'SLG', subjectType: 'batter', format: v => v.toFixed(3) },
  { key: 'obp', label: 'OBP', subjectType: 'batter', format: v => v.toFixed(3) },
  { key: 'runs_per_game', label: 'Runs / game', subjectType: 'team', format: v => v.toFixed(2) },
  { key: 'team_era', label: 'Team ERA', subjectType: 'team', format: v => v.toFixed(2) },
  { key: 'errors_per_game', label: 'Errors / game', subjectType: 'team', format: v => v.toFixed(2) },
  { key: 'team_ops', label: 'Team OPS', subjectType: 'team', format: v => v.toFixed(3) },
]

// The 30 official MLB team IDs, classified AL/NL. Stable, controlled by us.
export const LEAGUE_BY_TEAM_ID: Record<number, 'AL' | 'NL'> = {
  108: 'AL', 110: 'AL', 111: 'AL', 114: 'AL', 116: 'AL', 117: 'AL', 118: 'AL',
  133: 'AL', 136: 'AL', 139: 'AL', 140: 'AL', 141: 'AL', 142: 'AL', 145: 'AL', 147: 'AL',
  109: 'NL', 112: 'NL', 113: 'NL', 115: 'NL', 119: 'NL', 120: 'NL', 121: 'NL',
  134: 'NL', 135: 'NL', 137: 'NL', 138: 'NL', 143: 'NL', 144: 'NL', 146: 'NL', 158: 'NL',
}

// Real MLB primary brand colors — same map used in LabDashboard.tsx.
// Duplicated here rather than imported cross-component (that file doesn't
// export it) so player/team cards can theme headers without a client-only
// dependency. Worth consolidating into one shared file later — not urgent.
export const TEAM_COLORS: Record<number, string> = {
  108: '#BA0021', 109: '#A71930', 110: '#DF4601', 111: '#BD3039', 112: '#0E3386',
  113: '#C6011F', 114: '#00385D', 115: '#333366', 116: '#0C2340', 117: '#EB6E1F',
  118: '#004687', 119: '#005A9C', 120: '#AB0003', 121: '#002D72', 133: '#003831',
  134: '#FDB827', 135: '#2F241D', 136: '#0C2C56', 137: '#FD5A1E', 138: '#C41E3A',
  139: '#092C5C', 140: '#003278', 141: '#134A8E', 142: '#002B5C', 143: '#E81828',
  144: '#CE1141', 145: '#27251F', 146: '#00A3E0', 147: '#003087', 158: '#12284B',
}
// Resolves a batter's current team — used for team-color theming on cards
// and the season trend chart. Was previously duplicated inline in the
// batter-card route; centralizing here so it's one function, not several
// copies drifting apart.
export async function getCurrentTeamId(personId: number): Promise<number | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${personId}?hydrate=currentTeam`)
    if (!res.ok) return null
    const json = await res.json()
    return json.people?.[0]?.currentTeam?.id ?? null
  } catch {
    return null
  }
}
export function teamColorById(teamId: number | null | undefined): string {
  if (teamId == null) return '#1A1A1A'
  return TEAM_COLORS[teamId] ?? '#1A1A1A'
}
function ipToOuts(ip: string | number): number {
  const [whole, frac = '0'] = String(ip).split('.')
  return parseInt(whole, 10) * 3 + parseInt(frac, 10)
}
export type PitcherTrendPoint = {
  gameNumber: number
  date: string
  era: number | null
  whip: number | null
  k9: number | null
  fip: number | null
}

export async function getPitcherSeasonProgression(id: number, season: number): Promise<PitcherTrendPoint[]> {
  const splits = await fetchPersonGameLog(id, season, 'pitching')
  const sorted = sortByDate(splits)

  let outs = 0, er = 0, bb = 0, hits = 0, k = 0, hr = 0, hbp = 0

  return sorted.map((g, i) => {
    const st = g.stat ?? {}
    outs += ipToOuts(st.inningsPitched ?? '0.0')
    er += Number(st.earnedRuns ?? 0)
    bb += Number(st.baseOnBalls ?? 0)
    hits += Number(st.hits ?? 0)
    k += Number(st.strikeOuts ?? 0)
    hr += Number(st.homeRuns ?? 0)
    hbp += Number(st.hitBatsmen ?? st.hitByPitch ?? 0)

    const innings = outs / 3
    const era = innings > 0 ? (er / innings) * 9 : null
    const whip = innings > 0 ? (bb + hits) / innings : null
    const k9 = innings > 0 ? (k / innings) * 9 : null
    const fip = innings > 0 ? (13 * hr + 3 * (bb + hbp) - 2 * k) / innings + FIP_CONSTANT : null

    return {
      gameNumber: i + 1,
      date: g.date,
      era: era !== null ? Math.round(era * 100) / 100 : null,
      whip: whip !== null ? Math.round(whip * 100) / 100 : null,
      k9: k9 !== null ? Math.round(k9 * 100) / 100 : null,
      fip: fip !== null ? Math.round(fip * 100) / 100 : null,
    }
  })
}
// ─── Player gameLogs (rolling charts) ──────────────────────────────────────

async function fetchPersonGameLog(personId: number, season: number, group: 'pitching' | 'hitting') {
  const res = await fetch(`${MLB_API}/people/${personId}/stats?stats=gameLog&group=${group}&season=${season}`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return (json.stats?.[0]?.splits ?? []) as any[]
}

async function fetchTeamGameLog(teamId: number, season: number, group: 'pitching' | 'hitting' | 'fielding') {
  const res = await fetch(`${MLB_API}/teams/${teamId}/stats?stats=gameLog&group=${group}&season=${season}`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return (json.stats?.[0]?.splits ?? []) as any[]
}

function sortByDate(splits: any[]) {
  return [...splits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

function rollingPitching(splits: any[], window: number, metric: 'era' | 'fip' | 'whip' | 'k9'): RollingPoint[] {
  const sorted = sortByDate(splits)
  const points = sorted.map((last, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    let outs = 0, er = 0, bb = 0, hits = 0, k = 0, hr = 0, hbp = 0
    for (const g of slice) {
      const st = g.stat ?? {}
      outs += ipToOuts(st.inningsPitched ?? '0.0')
      er += Number(st.earnedRuns ?? 0)
      bb += Number(st.baseOnBalls ?? 0)
      hits += Number(st.hits ?? 0)
      k += Number(st.strikeOuts ?? 0)
      hr += Number(st.homeRuns ?? 0)
      hbp += Number(st.hitBatsmen ?? st.hitByPitch ?? 0)
    }
    const innings = outs / 3
    let value: number | null = null
    if (innings > 0) {
      if (metric === 'era') value = (er / innings) * 9
      if (metric === 'whip') value = (bb + hits) / innings
      if (metric === 'k9') value = (k / innings) * 9
      if (metric === 'fip') value = (13 * hr + 3 * (bb + hbp) - 2 * k) / innings + FIP_CONSTANT
    }
    return { date: last.date, opponent: last.opponent?.name ?? '', value: value !== null ? Math.round(value * 100) / 100 : null }
  })
  return points.slice(-window)
}

function rollingHitting(splits: any[], window: number, metric: 'ops' | 'slg' | 'obp'): RollingPoint[] {
  const sorted = sortByDate(splits)
  const points = sorted.map((last, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    let ab = 0, h = 0, doubles = 0, triples = 0, hr = 0, bb = 0, hbp = 0, sf = 0
    for (const g of slice) {
      const st = g.stat ?? {}
      ab += Number(st.atBats ?? 0)
      h += Number(st.hits ?? 0)
      doubles += Number(st.doubles ?? 0)
      triples += Number(st.triples ?? 0)
      hr += Number(st.homeRuns ?? 0)
      bb += Number(st.baseOnBalls ?? 0)
      hbp += Number(st.hitByPitch ?? 0)
      sf += Number(st.sacFlies ?? 0)
    }
    const totalBases = h + doubles + 2 * triples + 3 * hr
    const obpDenom = ab + bb + hbp + sf
    const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : null
    const slg = ab > 0 ? totalBases / ab : null
    let value: number | null = null
    if (metric === 'obp') value = obp
    if (metric === 'slg') value = slg
    if (metric === 'ops' && obp !== null && slg !== null) value = obp + slg
    return { date: last.date, opponent: last.opponent?.name ?? '', value: value !== null ? Math.round(value * 1000) / 1000 : null }
  })
  return points.slice(-window)
}
export type YearMode = 'single' | 'multi' | 'career'

export async function fetchYearByYearHitting(id: number): Promise<any[]> {
  const res = await fetch(`${MLB_API}/people/${id}/stats?stats=yearByYear&group=hitting`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return (json.stats?.[0]?.splits ?? []).filter((s: any) => s.season)
}

async function fetchCareerHitting(id: number): Promise<any> {
  const res = await fetch(`${MLB_API}/people/${id}/stats?stats=career&group=hitting`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return json.stats?.[0]?.splits?.[0]?.stat ?? {}
}

const HITTING_SUM_KEYS = [
  'atBats', 'hits', 'doubles', 'triples', 'homeRuns', 'baseOnBalls', 'strikeOuts',
  'hitByPitch', 'sacFlies', 'stolenBases', 'caughtStealing', 'plateAppearances',
  'rbi', 'runs', 'groundIntoDoublePlay', 'leftOnBase', 'totalBases',
]

function aggregateHittingCounts(statBlocks: any[]): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(HITTING_SUM_KEYS.map(k => [k, 0]))
  for (const block of statBlocks) for (const k of HITTING_SUM_KEYS) totals[k] += Number(block[k] ?? 0)
  return totals
}

// Real rate stats from summed counts — not an average of per-season rates.
// See file header note in the chat response for why that distinction matters.
function ratesFromCounts(t: Record<string, number>): Record<string, string> {
  const avg = t.atBats > 0 ? t.hits / t.atBats : 0
  const obpDenom = t.atBats + t.baseOnBalls + t.hitByPitch + t.sacFlies
  const obp = obpDenom > 0 ? (t.hits + t.baseOnBalls + t.hitByPitch) / obpDenom : 0
  const slg = t.atBats > 0 ? t.totalBases / t.atBats : 0
  const babipDenom = t.atBats - t.strikeOuts - t.homeRuns + t.sacFlies
  const babip = babipDenom > 0 ? (t.hits - t.homeRuns) / babipDenom : 0
  const sbAttempts = t.stolenBases + t.caughtStealing
  return {
    avg: avg.toFixed(3), obp: obp.toFixed(3), slg: slg.toFixed(3), ops: (obp + slg).toFixed(3),
    atBatsPerHomeRun: t.homeRuns > 0 ? (t.atBats / t.homeRuns).toFixed(1) : '—',
    babip: babip.toFixed(3),
    stolenBasePercentage: sbAttempts > 0 ? `${((t.stolenBases / sbAttempts) * 100).toFixed(1)}%` : '—',
  }
}

export async function getBatterYearStats(id: number, mode: YearMode, years: number[]): Promise<SeasonStatRow[]> {
  if (mode === 'single') {
    return getPlayerSeasonStats('batter', id, years[0] ?? new Date().getFullYear())
  }
  if (mode === 'career') {
    const stat = await fetchCareerHitting(id)
    return BATTER_SEASON_FIELDS.map(f => ({ key: f.key, label: f.label, value: stat[f.key] !== undefined ? String(stat[f.key]) : '—' }))
  }
  const all = await fetchYearByYearHitting(id)
  const selected = all.filter(s => years.includes(Number(s.season))).map(s => s.stat ?? {})
  if (selected.length === 0) return BATTER_SEASON_FIELDS.map(f => ({ key: f.key, label: f.label, value: '—' }))
  const counts = aggregateHittingCounts(selected)
  const rates = ratesFromCounts(counts)
  const merged: Record<string, string> = { ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, String(v)])), ...rates }
  return BATTER_SEASON_FIELDS.map(f => ({ key: f.key, label: f.label, value: merged[f.key] ?? '—' }))
}
function rollingTeam(
  splits: any[], window: number, metric: 'runs_per_game' | 'team_era' | 'errors_per_game'
): RollingPoint[] {
  const sorted = sortByDate(splits)
  const points = sorted.map((last, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    let value: number | null = null
    if (metric === 'runs_per_game') value = slice.reduce((s, g) => s + Number(g.stat?.runs ?? 0), 0) / slice.length
    if (metric === 'errors_per_game') value = slice.reduce((s, g) => s + Number(g.stat?.errors ?? 0), 0) / slice.length
    if (metric === 'team_era') {
      let outs = 0, er = 0
      for (const g of slice) { outs += ipToOuts(g.stat?.inningsPitched ?? '0.0'); er += Number(g.stat?.earnedRuns ?? 0) }
      const innings = outs / 3
      value = innings > 0 ? (er / innings) * 9 : null
    }
    return { date: last.date, opponent: last.opponent?.name ?? '', value: value !== null ? Math.round(value * 100) / 100 : null }
  })
  return points.slice(-window)
}
export type SeasonTrendPoint = {
  gameNumber: number
  date: string
  avg: number | null
  obp: number | null
  slg: number | null
  ops: number | null
  hr: number   // cumulative
  rbi: number  // cumulative
}

export async function getBatterSeasonProgression(id: number, season: number): Promise<SeasonTrendPoint[]> {
  const splits = await fetchPersonGameLog(id, season, 'hitting')
  const sorted = sortByDate(splits)

  let ab = 0, h = 0, doubles = 0, triples = 0, hr = 0, bb = 0, hbp = 0, sf = 0, rbi = 0

  return sorted.map((g, i) => {
    const st = g.stat ?? {}
    ab += Number(st.atBats ?? 0)
    h += Number(st.hits ?? 0)
    doubles += Number(st.doubles ?? 0)
    triples += Number(st.triples ?? 0)
    hr += Number(st.homeRuns ?? 0)
    bb += Number(st.baseOnBalls ?? 0)
    hbp += Number(st.hitByPitch ?? 0)
    sf += Number(st.sacFlies ?? 0)
    rbi += Number(st.rbi ?? 0)

    const totalBases = h + doubles + 2 * triples + 3 * hr
    const obpDenom = ab + bb + hbp + sf
    const avg = ab > 0 ? h / ab : null
    const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : null
    const slg = ab > 0 ? totalBases / ab : null

    return {
      gameNumber: i + 1,
      date: g.date,
      avg: avg !== null ? Math.round(avg * 1000) / 1000 : null,
      obp: obp !== null ? Math.round(obp * 1000) / 1000 : null,
      slg: slg !== null ? Math.round(slg * 1000) / 1000 : null,
      ops: obp !== null && slg !== null ? Math.round((obp + slg) * 1000) / 1000 : null,
      hr,
      rbi,
    }
  })
}

// ─── Season-vs-season comparison (Lab player cards, "vs last season") ─────
//
// Thin wrapper around the two functions above — fetches N seasons in
// parallel for one player and hands back each season's full game-by-game
// progression, still indexed by gameNumber so the UI can overlay them on
// a shared x-axis regardless of when each season actually started.
export type SeasonProgressionSeries = {
  season: number
  points: PitcherTrendPoint[] | SeasonTrendPoint[]
}

export async function getSeasonProgressionCompare(
  subjectType: 'pitcher' | 'batter', id: number, seasons: number[]
): Promise<SeasonProgressionSeries[]> {
  return Promise.all(
    seasons.map(async season => ({
      season,
      points: subjectType === 'pitcher'
        ? await getPitcherSeasonProgression(id, season)
        : await getBatterSeasonProgression(id, season),
    }))
  )
}

export async function getRollingMetric(opts: {
  subjectType: SubjectType; id: number; metric: MetricKey; season: number; window: number
}): Promise<RollingPoint[]> {
  const { subjectType, id, metric, season, window } = opts
  if (subjectType === 'pitcher') {
    const splits = await fetchPersonGameLog(id, season, 'pitching')
    return rollingPitching(splits, window, metric as 'era' | 'fip' | 'whip' | 'k9')
  }
  if (subjectType === 'batter') {
    const splits = await fetchPersonGameLog(id, season, 'hitting')
    return rollingHitting(splits, window, metric as 'ops' | 'slg' | 'obp')
  }
  const group = metric === 'runs_per_game' ? 'hitting' : metric === 'errors_per_game' ? 'fielding' : 'pitching'
  const splits = await fetchTeamGameLog(id, season, group as 'hitting' | 'fielding' | 'pitching')
  return rollingTeam(splits, window, metric as 'runs_per_game' | 'team_era' | 'errors_per_game')
}

export async function searchPeople(query: string) {
  const res = await fetch(`${MLB_API}/people/search?names=${encodeURIComponent(query)}`)
  if (!res.ok) return []
  const json = await res.json()
  return (json.people ?? []).map((p: any) => ({
    id: p.id, fullName: p.fullName, primaryPosition: p.primaryPosition?.abbreviation ?? '',
  }))
}
// ─── Player trend (L7 vs season) ───────────────────────────────────────────
//
// Reuses the existing rolling-average functions rather than reimplementing
// the stat math: "season value" is just the rolling calc with a window big
// enough to cover every game played; "L7 value" is the same calc with
// window=7. Both come from a single gameLog fetch.

export type PlayerTrendRow = {
  metric: MetricKey
  label: string
  seasonValue: number | null
  l7Value: number | null
  delta: number | null       // l7Value - seasonValue, in the metric's own units
  l7Games: number             // actual games in the L7 sample — can be < 7 early in a season/callup
  insufficientSample: boolean // true when l7Games < 3 — don't badge a trend off 1-2 games
  direction: 'up' | 'down' | 'flat'
}

// Lower value = better performance, for these metrics.
const LOWER_IS_BETTER: Record<'era' | 'fip' | 'whip' | 'k9' | 'ops' | 'slg' | 'obp', boolean> = {
  era: true, fip: true, whip: true, k9: false, ops: false, slg: false, obp: false,
}

// Minimum |delta| (in the metric's own units) before we call it a real trend
// rather than game-to-game noise. Picked to roughly match each stat's normal
// week-to-week wobble — these are a starting point, not derived from anything.
const TREND_EPSILON: Record<'era' | 'fip' | 'whip' | 'k9' | 'ops' | 'slg' | 'obp', number> = {
  era: 0.05, fip: 0.05, whip: 0.03, k9: 0.3, ops: 0.015, slg: 0.010, obp: 0.010,
}

export async function getPlayerTrend(
  subjectType: 'pitcher' | 'batter', id: number, season: number
): Promise<PlayerTrendRow[]> {
  const group = subjectType === 'pitcher' ? 'pitching' : 'hitting'
  const splits = await fetchPersonGameLog(id, season, group)

  const pitcherMetrics: ('era' | 'fip' | 'whip' | 'k9')[] = ['era', 'fip', 'whip', 'k9']
  const batterMetrics: ('ops' | 'slg' | 'obp')[] = ['ops', 'slg', 'obp']
  const metrics = subjectType === 'pitcher' ? pitcherMetrics : batterMetrics

  const emptyRow = (metric: MetricKey): PlayerTrendRow => ({
    metric, label: METRICS.find(m => m.key === metric)!.label,
    seasonValue: null, l7Value: null, delta: null, l7Games: 0, insufficientSample: true, direction: 'flat',
  })

  if (splits.length === 0) return metrics.map(emptyRow)

  const l7Games = Math.min(7, splits.length)

  return metrics.map(metric => {
    const seasonPoints = subjectType === 'pitcher'
      ? rollingPitching(splits, splits.length, metric as 'era' | 'fip' | 'whip' | 'k9')
      : rollingHitting(splits, splits.length, metric as 'ops' | 'slg' | 'obp')
    const l7Points = subjectType === 'pitcher'
      ? rollingPitching(splits, 7, metric as 'era' | 'fip' | 'whip' | 'k9')
      : rollingHitting(splits, 7, metric as 'ops' | 'slg' | 'obp')

    const seasonValue = seasonPoints[seasonPoints.length - 1]?.value ?? null
    const l7Value = l7Points[l7Points.length - 1]?.value ?? null
    const label = METRICS.find(m => m.key === metric)!.label

    if (seasonValue === null || l7Value === null) {
      return { metric, label, seasonValue, l7Value, delta: null, l7Games, insufficientSample: true, direction: 'flat' }
    }

    const delta = Math.round((l7Value - seasonValue) * 1000) / 1000
    const insufficientSample = l7Games < 3
    let direction: 'up' | 'down' | 'flat' = 'flat'
    if (!insufficientSample && Math.abs(delta) >= TREND_EPSILON[metric]) {
      const improving = LOWER_IS_BETTER[metric] ? delta < 0 : delta > 0
      direction = improving ? 'up' : 'down'
    }

    return { metric, label, seasonValue, l7Value, delta, l7Games, insufficientSample, direction }
  })
}

// ─── Player league leaders ──────────────────────────────────────────────────

export const LEADER_METRICS: Record <
  'era' | 'whip' | 'k9' | 'ops' | 'slg' | 'obp'
  | 'avg' | 'homeRuns' | 'rbi' | 'stolenBases' | 'hits' | 'doubles' | 'triples' | 'baseOnBalls' | 'strikeOuts' | 'totalBases',
  { label: string; group: 'pitching' | 'hitting'; leaderCategory: string }
> = {
  era:  { label: 'ERA leaders',  group: 'pitching', leaderCategory: 'earnedRunAverage' },
  whip: { label: 'WHIP leaders', group: 'pitching', leaderCategory: 'walksAndHitsPerInningPitched' },
  k9:   { label: 'K/9 leaders',  group: 'pitching', leaderCategory: 'strikeoutsPer9Inn' },
  ops:  { label: 'OPS leaders',  group: 'hitting',  leaderCategory: 'onBasePlusSlugging' },
  slg:  { label: 'SLG leaders',  group: 'hitting',  leaderCategory: 'sluggingPercentage' },
  obp:  { label: 'OBP leaders',  group: 'hitting',  leaderCategory: 'onBasePercentage' },
  avg:          { label: 'AVG leaders', group: 'hitting', leaderCategory: 'battingAverage' },
  homeRuns:     { label: 'HR leaders',  group: 'hitting', leaderCategory: 'homeRuns' },
  rbi:          { label: 'RBI leaders', group: 'hitting', leaderCategory: 'runsBattedIn' },
  stolenBases:  { label: 'SB leaders',  group: 'hitting', leaderCategory: 'stolenBases' },
  hits:         { label: 'H leaders',   group: 'hitting', leaderCategory: 'hits' },
  doubles:      { label: '2B leaders',  group: 'hitting', leaderCategory: 'doubles' },
  triples:      { label: '3B leaders',  group: 'hitting', leaderCategory: 'triples' },
  baseOnBalls:  { label: 'BB leaders',  group: 'hitting', leaderCategory: 'walks' },
  strikeOuts:   { label: 'K leaders',   group: 'hitting', leaderCategory: 'strikeouts' },
  totalBases:   { label: 'TB leaders',  group: 'hitting', leaderCategory: 'totalBases' },
}

export type LeaderRow = {
  rank: number
  personId: number
  teamId?: number // used for AL/NL classification — see LEAGUE_BY_TEAM_ID
  name: string
  team: string
  value: number
}

// ─── Metric percentile (real rank against a real pool) ─────────────────────
//
// Honesty note, same spirit as the AL/NL radar above: MLB's /stats/leaders
// endpoint only returns players who clear its IP/PA qualification threshold
// — this is "percentile among qualified players," not literally every
// rostered player. A player below the threshold (rookies, part-time bats,
// recent callups) will correctly return null here rather than a fabricated
// low percentile. The UI should treat null as "not enough playing time yet,"
// not as a 0.
export type PercentileResult = {
  rank: number
  poolSize: number
  percentile: number // 0–100, higher = better performance
}

export async function getMetricPercentile(
  metric: keyof typeof LEADER_METRICS, season: number, personId: number, poolSize = 150
): Promise<PercentileResult | null> {
  const rows = await getLeaders(metric, season, poolSize)
  const idx = rows.findIndex(r => r.personId === personId)
  if (idx === -1) return null

  const rank = idx + 1
  const percentile = Math.round(((rows.length - rank) / Math.max(rows.length - 1, 1)) * 100)
  return { rank, poolSize: rows.length, percentile }
}
export async function getLeaders(
  metric: keyof typeof LEADER_METRICS, season: number, limit = 5
): Promise<LeaderRow[]> {
  const meta = LEADER_METRICS[metric]
  const url = `${MLB_API}/stats/leaders?leaderCategories=${meta.leaderCategory}&season=${season}&sportId=1&statGroup=${meta.group}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  const leaders = json.leagueLeaders?.[0]?.leaders ?? []
  return leaders.map((l: any) => ({
    rank: Number(l.rank),
    personId: l.person?.id,
    teamId: l.team?.id ? Number(l.team.id) : undefined,
    name: l.person?.fullName ?? '',
    team: l.team?.abbreviation ?? l.team?.name ?? '',
    value: Number(l.value),
  }))
}

// ─── Team-level leaders ──────────────────────────────────────────────────────

export type TeamMetric = 'runs_per_game' | 'team_era' | 'errors_per_game' | 'team_ops'

export type TeamValueRow = { teamId: number; name: string; abbreviation: string; value: number }

async function fetchAllTeamSeasonValues(metric: TeamMetric, season: number): Promise<TeamValueRow[]> {
  const group = metric === 'errors_per_game' ? 'fielding' : metric === 'team_era' ? 'pitching' : 'hitting'
  const res = await fetch(`${MLB_API}/teams/stats?season=${season}&group=${group}&stats=season&sportId=1`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  const splits = json.stats?.[0]?.splits ?? []

  return splits.map((s: any) => {
    const st = s.stat ?? {}
    const games = Number(st.gamesPlayed ?? st.games ?? 0) || 1
    let value = 0

    if (metric === 'runs_per_game') value = Number(st.runs ?? 0) / games
    if (metric === 'errors_per_game') value = Number(st.errors ?? 0) / games
    if (metric === 'team_era') {
      const innings = ipToOuts(st.inningsPitched ?? '0.0') / 3
      value = innings > 0 ? (Number(st.earnedRuns ?? 0) / innings) * 9 : 0
    }
    if (metric === 'team_ops') {
      if (st.ops !== undefined) {
        value = Number(st.ops)
      } else {
        const ab = Number(st.atBats ?? 0), h = Number(st.hits ?? 0), d = Number(st.doubles ?? 0)
        const t = Number(st.triples ?? 0), hr = Number(st.homeRuns ?? 0), bb = Number(st.baseOnBalls ?? 0)
        const hbp = Number(st.hitByPitch ?? 0), sf = Number(st.sacFlies ?? 0)
        const tb = h + d + 2 * t + 3 * hr
        const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0
        const slg = ab > 0 ? tb / ab : 0
        value = obp + slg
      }
    }

    return {
      teamId: s.team?.id,
      name: s.team?.name ?? '',
      abbreviation: s.team?.abbreviation ?? '',
      value: Math.round(value * 1000) / 1000,
    }
  }).filter((r: TeamValueRow) => r.teamId)
}

const TEAM_METRIC_SORT_ASC: Record<TeamMetric, boolean> = {
  runs_per_game: false, team_era: true, errors_per_game: true, team_ops: false,
}

export async function getTeamLeaders(metric: TeamMetric, season: number, limit = 5): Promise<LeaderRow[]> {
  const all = await fetchAllTeamSeasonValues(metric, season)
  const sorted = [...all].sort((a, b) => (TEAM_METRIC_SORT_ASC[metric] ? a.value - b.value : b.value - a.value))
  return sorted.slice(0, limit).map((t, i) => ({
    rank: i + 1, personId: t.teamId, teamId: t.teamId, name: t.name, team: t.abbreviation, value: t.value,
  }))
}

// ─── AL/NL radar (real averages, normalized relative to each other) ───────

export type LeagueRadarAxis = { subject: string; AL: number; NL: number }

export async function getLeagueRadar(season: number): Promise<LeagueRadarAxis[]> {
  const [runs, era, errors] = await Promise.all([
    fetchAllTeamSeasonValues('runs_per_game', season),
    fetchAllTeamSeasonValues('team_era', season),
    fetchAllTeamSeasonValues('errors_per_game', season),
  ])

  function leagueAverage(rows: TeamValueRow[], league: 'AL' | 'NL'): number {
    const filtered = rows.filter(r => LEAGUE_BY_TEAM_ID[r.teamId] === league)
    if (filtered.length === 0) return 0
    return filtered.reduce((sum, r) => sum + r.value, 0) / filtered.length
  }

  function normalizePair(alVal: number, nlVal: number, lowerIsBetter: boolean): { AL: number; NL: number } {
    const a = lowerIsBetter ? -alVal : alVal
    const n = lowerIsBetter ? -nlVal : nlVal
    const min = Math.min(a, n), max = Math.max(a, n)
    if (max === min) return { AL: 65, NL: 65 }
    const scale = (v: number) => 35 + ((v - min) / (max - min)) * 65
    return { AL: Math.round(scale(a)), NL: Math.round(scale(n)) }
  }

  return [
    { subject: 'Batting (runs/g)', ...normalizePair(leagueAverage(runs, 'AL'), leagueAverage(runs, 'NL'), false) },
    { subject: 'Pitching (ERA)', ...normalizePair(leagueAverage(era, 'AL'), leagueAverage(era, 'NL'), true) },
    { subject: 'Defense (errors/g)', ...normalizePair(leagueAverage(errors, 'AL'), leagueAverage(errors, 'NL'), true) },
  ]
}

// ─── All-teams full-season rolling series (for trend charts) ──────────────
//
// Fetches all 30 teams' gameLogs for one metric and returns a FULL-SEASON
// rolling series per team, indexed by game number (not calendar date) so
// teams with different schedules still line up on a shared x-axis.

export type TeamSeries = {
  teamId: number
  name: string
  abbreviation: string
  points: { gameIndex: number; value: number | null }[]
}

const TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number)

// Minimal id→name/abbreviation lookup so series still have labels even if a
// team's gameLog response omits team metadata (gameLog splits sometimes do).
export const TEAM_NAMES: Record<number, { name: string; abbreviation: string }> = {
  108: { name: 'Angels', abbreviation: 'LAA' }, 109: { name: 'D-backs', abbreviation: 'ARI' },
  110: { name: 'Orioles', abbreviation: 'BAL' }, 111: { name: 'Red Sox', abbreviation: 'BOS' },
  112: { name: 'Cubs', abbreviation: 'CHC' }, 113: { name: 'Reds', abbreviation: 'CIN' },
  114: { name: 'Guardians', abbreviation: 'CLE' }, 115: { name: 'Rockies', abbreviation: 'COL' },
  116: { name: 'Tigers', abbreviation: 'DET' }, 117: { name: 'Astros', abbreviation: 'HOU' },
  118: { name: 'Royals', abbreviation: 'KC' }, 119: { name: 'Dodgers', abbreviation: 'LAD' },
  120: { name: 'Nationals', abbreviation: 'WSH' }, 121: { name: 'Mets', abbreviation: 'NYM' },
  133: { name: 'Athletics', abbreviation: 'OAK' }, 134: { name: 'Pirates', abbreviation: 'PIT' },
  135: { name: 'Padres', abbreviation: 'SD' }, 136: { name: 'Mariners', abbreviation: 'SEA' },
  137: { name: 'Giants', abbreviation: 'SF' }, 138: { name: 'Cardinals', abbreviation: 'STL' },
  139: { name: 'Rays', abbreviation: 'TB' }, 140: { name: 'Rangers', abbreviation: 'TEX' },
  141: { name: 'Blue Jays', abbreviation: 'TOR' }, 142: { name: 'Twins', abbreviation: 'MIN' },
  143: { name: 'Phillies', abbreviation: 'PHI' }, 144: { name: 'Braves', abbreviation: 'ATL' },
  145: { name: 'White Sox', abbreviation: 'CWS' }, 146: { name: 'Marlins', abbreviation: 'MIA' },
  147: { name: 'Yankees', abbreviation: 'NYY' }, 158: { name: 'Brewers', abbreviation: 'MIL' },
}

function rollingTeamFullSeason(
  splits: any[], window: number, metric: TeamMetric
): { gameIndex: number; value: number | null }[] {
  const sorted = sortByDate(splits)
  return sorted.map((_, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    let value: number | null = null
    if (metric === 'runs_per_game') value = slice.reduce((s, g) => s + Number(g.stat?.runs ?? 0), 0) / slice.length
    if (metric === 'errors_per_game') value = slice.reduce((s, g) => s + Number(g.stat?.errors ?? 0), 0) / slice.length
    if (metric === 'team_era') {
      let outs = 0, er = 0
      for (const g of slice) { outs += ipToOuts(g.stat?.inningsPitched ?? '0.0'); er += Number(g.stat?.earnedRuns ?? 0) }
      const innings = outs / 3
      value = innings > 0 ? (er / innings) * 9 : null
    }
    if (metric === 'team_ops') {
      let ab = 0, h = 0, d = 0, t = 0, hr = 0, bb = 0, hbp = 0, sf = 0
      for (const g of slice) {
        const st = g.stat ?? {}
        ab += Number(st.atBats ?? 0); h += Number(st.hits ?? 0); d += Number(st.doubles ?? 0)
        t += Number(st.triples ?? 0); hr += Number(st.homeRuns ?? 0); bb += Number(st.baseOnBalls ?? 0)
        hbp += Number(st.hitByPitch ?? 0); sf += Number(st.sacFlies ?? 0)
      }
      const tb = h + d + 2 * t + 3 * hr
      const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : null
      const slg = ab > 0 ? tb / ab : null
      value = obp !== null && slg !== null ? obp + slg : null
    }
    return { gameIndex: i + 1, value: value !== null ? Math.round(value * 1000) / 1000 : null }
  })
}

export async function getAllTeamsRollingSeries(metric: TeamMetric, season: number, window = 10): Promise<TeamSeries[]> {
  const group: 'hitting' | 'fielding' | 'pitching' =
    metric === 'errors_per_game' ? 'fielding' : metric === 'team_era' ? 'pitching' : 'hitting'

  const results = await Promise.all(
    TEAM_IDS.map(async teamId => {
      try {
        const splits = await fetchTeamGameLog(teamId, season, group)
        const points = rollingTeamFullSeason(splits, window, metric)
        const meta = TEAM_NAMES[teamId]
        return { teamId, name: meta.name, abbreviation: meta.abbreviation, points }
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is TeamSeries => r !== null)
}

// ─── Standings progression (cumulative win% over the season) ──────────────

export type StandingsSeries = {
  teamId: number
  name: string
  abbreviation: string
  points: { gameIndex: number; wins: number }[]
}

// Real MLB divisional alignment — stable, controlled by us, same spirit as
// LEAGUE_BY_TEAM_ID above.
export const DIVISIONS: Record<string, number[]> = {
  'AL East': [147, 111, 141, 110, 139],
  'AL Central': [114, 142, 145, 116, 118],
  'AL West': [117, 136, 140, 108, 133],
  'NL East': [144, 143, 121, 146, 120],
  'NL Central': [158, 112, 138, 113, 134],
  'NL West': [119, 135, 137, 109, 115],
}

async function getTeamWinProgression(teamId: number, season: number): Promise<{ gameIndex: number; wins: number }[]> {
  const res = await fetch(`${MLB_API}/schedule?teamId=${teamId}&season=${season}&gameType=R&sportId=1`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  const games = (json.dates ?? []).flatMap((d: any) => d.games ?? [])

  const decided = games
    .filter((g: any) => g.status?.abstractGameState === 'Final')
    .sort((a: any, b: any) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())

  let wins = 0
  return decided.map((g: any, i: number) => {
    const isHome = g.teams?.home?.team?.id === teamId
    const won = isHome ? g.teams?.home?.isWinner : g.teams?.away?.isWinner
    if (won) wins++
    return { gameIndex: i + 1, wins }
  })
}

// Takes an explicit list of team IDs (a division's 5 teams) — no more
// "top N by win%" guessing at which teams are interesting.
export async function getStandingsProgression(season: number, teamIds: number[]): Promise<StandingsSeries[]> {
  const results = await Promise.all(
    teamIds.map(async teamId => {
      try {
        const points = await getTeamWinProgression(teamId, season)
        const meta = TEAM_NAMES[teamId] ?? { name: String(teamId), abbreviation: '' }
        return { teamId, name: meta.name, abbreviation: meta.abbreviation, points }
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is StandingsSeries => r !== null)
}

// ─── Season totals (for the enlarged player columns — real counting stats,
// not just the rolling-window metrics used for trend detection) ───────────

export type SeasonStatRow = { key: string; label: string; value: string }

const PITCHER_SEASON_FIELDS: { key: string; label: string }[] = [
  { key: 'wins', label: 'W' }, { key: 'losses', label: 'L' }, { key: 'saves', label: 'SV' },
  { key: 'era', label: 'ERA' }, { key: 'whip', label: 'WHIP' },
  { key: 'strikeOuts', label: 'K' }, { key: 'strikeoutsPer9Inn', label: 'K/9' },
  { key: 'inningsPitched', label: 'IP' }, { key: 'baseOnBalls', label: 'BB' }, { key: 'homeRuns', label: 'HR' },
]

const BATTER_SEASON_FIELDS: { key: string; label: string }[] = [
  { key: 'avg', label: 'AVG' }, { key: 'obp', label: 'OBP' }, { key: 'slg', label: 'SLG' }, { key: 'ops', label: 'OPS' },
  { key: 'homeRuns', label: 'HR' }, { key: 'rbi', label: 'RBI' }, { key: 'runs', label: 'R' }, { key: 'hits', label: 'H' },
  { key: 'doubles', label: '2B' }, { key: 'triples', label: '3B' }, { key: 'totalBases', label: 'TB' },
  { key: 'baseOnBalls', label: 'BB' }, { key: 'strikeOuts', label: 'K' }, { key: 'hitByPitch', label: 'HBP' },
  { key: 'stolenBases', label: 'SB' }, { key: 'caughtStealing', label: 'CS' }, { key: 'stolenBasePercentage', label: 'SB%' },
  { key: 'atBatsPerHomeRun', label: 'AB/HR' }, { key: 'babip', label: 'BABIP' },
  { key: 'plateAppearances', label: 'PA' }, { key: 'atBats', label: 'AB' },
  { key: 'sacFlies', label: 'SF' }, { key: 'groundIntoDoublePlay', label: 'GIDP' }, { key: 'leftOnBase', label: 'LOB' },
]
export type CareerSeasonRow = { season: number; teamName?: string; stats: SeasonStatRow[] }

// Year-by-year table — one row per real season, straight from MLB's
// yearByYear endpoint. No aggregation needed: each split IS a complete,
// real single-season stat block (same shape getPlayerSeasonStats already
// trusts for the current season), just for a prior year instead.
export async function getBatterCareerTable(id: number): Promise<CareerSeasonRow[]> {
  const splits = await fetchYearByYearHitting(id)
  return splits.map((s: any) => ({
    season: Number(s.season),
    teamName: s.team?.name,
    stats: BATTER_SEASON_FIELDS.map(f => ({
      key: f.key, label: f.label,
      value: s.stat?.[f.key] !== undefined ? String(s.stat[f.key]) : '—',
    })),
  })).sort((a, b) => b.season - a.season)
}

// Pitcher equivalent — same endpoint pattern as fetchYearByYearHitting
// above (group=pitching instead of hitting), no fetchYearByYearPitching
// existed before this. Mirrors a proven-working pattern exactly, not a
// new guess.
async function fetchYearByYearPitching(id: number): Promise<any[]> {
  const res = await fetch(`${MLB_API}/people/${id}/stats?stats=yearByYear&group=pitching`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return (json.stats?.[0]?.splits ?? []).filter((s: any) => s.season)
}

export async function getPitcherCareerTable(id: number): Promise<CareerSeasonRow[]> {
  const splits = await fetchYearByYearPitching(id)
  return splits.map((s: any) => ({
    season: Number(s.season),
    teamName: s.team?.name,
    stats: PITCHER_SEASON_FIELDS.map(f => ({
      key: f.key, label: f.label,
      value: s.stat?.[f.key] !== undefined ? String(s.stat[f.key]) : '—',
    })),
  })).sort((a, b) => b.season - a.season)
}

export async function getPlayerSeasonStats(
  subjectType: 'pitcher' | 'batter', id: number, season: number
): Promise<SeasonStatRow[]> {
  const group = subjectType === 'pitcher' ? 'pitching' : 'hitting'
  const res = await fetch(`${MLB_API}/people/${id}/stats?stats=season&group=${group}&season=${season}`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  const stat = json.stats?.[0]?.splits?.[0]?.stat ?? {}
  const fields = subjectType === 'pitcher' ? PITCHER_SEASON_FIELDS : BATTER_SEASON_FIELDS
  return fields.map(f => ({ key: f.key, label: f.label, value: stat[f.key] !== undefined ? String(stat[f.key]) : '—' }))
}

// ─── Team roster (for the Player Browser team-filter chips) ───────────────

export type RosterPlayer = { id: number; fullName: string; primaryPosition: string }

export async function getTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  const res = await fetch(`${MLB_API}/teams/${teamId}/roster?rosterType=active`)
  if (!res.ok) throw new Error(`MLB API ${res.status}`)
  const json = await res.json()
  return (json.roster ?? [])
    .map((r: any) => ({ id: r.person?.id, fullName: r.person?.fullName ?? '', primaryPosition: r.position?.abbreviation ?? '' }))
    .filter((p: RosterPlayer) => p.id)
}