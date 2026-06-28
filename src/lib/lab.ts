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

function ipToOuts(ip: string | number): number {
  const [whole, frac = '0'] = String(ip).split('.')
  return parseInt(whole, 10) * 3 + parseInt(frac, 10)
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

// ─── Player league leaders ──────────────────────────────────────────────────

export const LEADER_METRICS: Record<
  'era' | 'whip' | 'k9' | 'ops' | 'slg' | 'obp',
  { label: string; group: 'pitching' | 'hitting'; leaderCategory: string }
> = {
  era:  { label: 'ERA leaders',  group: 'pitching', leaderCategory: 'earnedRunAverage' },
  whip: { label: 'WHIP leaders', group: 'pitching', leaderCategory: 'walksAndHitsPerInningPitched' },
  k9:   { label: 'K/9 leaders',  group: 'pitching', leaderCategory: 'strikeoutsPer9Inn' },
  ops:  { label: 'OPS leaders',  group: 'hitting',  leaderCategory: 'onBasePlusSlugging' },
  slg:  { label: 'SLG leaders',  group: 'hitting',  leaderCategory: 'sluggingPercentage' },
  obp:  { label: 'OBP leaders',  group: 'hitting',  leaderCategory: 'onBasePercentage' },
}

export type LeaderRow = {
  rank: number
  personId: number
  teamId?: number // used for AL/NL classification — see LEAGUE_BY_TEAM_ID
  name: string
  team: string
  value: number
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
      // Team season totals usually include a pre-computed OPS directly —
      // fall back to computing it from raw counts if that field is absent.
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
const TEAM_NAMES: Record<number, { name: string; abbreviation: string }> = {
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