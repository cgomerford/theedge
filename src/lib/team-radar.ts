// src/lib/team-radar.ts
//
// "Most rounded team" radar — 20 axes, 10 pitching + 10 batting, each
// team's real season line ranked as a percentile against the other 29
// teams (same percentileRank methodology as every other radar in this
// app).
//
// FIP has no field in MLB's bulk stats endpoint, so it's computed here
// from real team (and, for the roster breakdown, real per-player) HR/BB/
// HBP/K/IP totals, using a real league-wide FIP constant derived from
// THIS season's actual league ERA — not a hardcoded historical constant
// (those drift year to year): cFIP = leagueERA - ((13*HR + 3*(BB+HBP) -
// 2*K) / IP), the standard FanGraphs definition.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type TeamRadarAxisKey =
  | 'era' | 'whip' | 'fip' | 'k9' | 'bb9' | 'hr9' | 'kbb' | 'saves' | 'holds' | 'shutouts'
  | 'avg' | 'obp' | 'slg' | 'ops' | 'hr' | 'rbi' | 'runs' | 'sb' | 'doubles' | 'walks'

export const TEAM_RADAR_AXES: { key: TeamRadarAxisKey; label: string; group: 'Pitching' | 'Batting'; higherIsBetter: boolean; fmt: (v: number) => string }[] = [
  { key: 'era', label: 'ERA', group: 'Pitching', higherIsBetter: false, fmt: v => v.toFixed(2) },
  { key: 'whip', label: 'WHIP', group: 'Pitching', higherIsBetter: false, fmt: v => v.toFixed(2) },
  { key: 'fip', label: 'FIP', group: 'Pitching', higherIsBetter: false, fmt: v => v.toFixed(2) },
  { key: 'k9', label: 'K/9', group: 'Pitching', higherIsBetter: true, fmt: v => v.toFixed(1) },
  { key: 'bb9', label: 'BB/9', group: 'Pitching', higherIsBetter: false, fmt: v => v.toFixed(1) },
  { key: 'hr9', label: 'HR/9', group: 'Pitching', higherIsBetter: false, fmt: v => v.toFixed(1) },
  { key: 'kbb', label: 'K/BB', group: 'Pitching', higherIsBetter: true, fmt: v => v.toFixed(2) },
  { key: 'saves', label: 'Saves', group: 'Pitching', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'holds', label: 'Holds', group: 'Pitching', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'shutouts', label: 'Shutouts', group: 'Pitching', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'avg', label: 'AVG', group: 'Batting', higherIsBetter: true, fmt: v => v.toFixed(3).replace(/^0/, '') },
  { key: 'obp', label: 'OBP', group: 'Batting', higherIsBetter: true, fmt: v => v.toFixed(3).replace(/^0/, '') },
  { key: 'slg', label: 'SLG', group: 'Batting', higherIsBetter: true, fmt: v => v.toFixed(3).replace(/^0/, '') },
  { key: 'ops', label: 'OPS', group: 'Batting', higherIsBetter: true, fmt: v => v.toFixed(3).replace(/^0/, '') },
  { key: 'hr', label: 'HR', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'rbi', label: 'RBI', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'runs', label: 'Runs', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'sb', label: 'SB', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'doubles', label: '2B', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
  { key: 'walks', label: 'BB', group: 'Batting', higherIsBetter: true, fmt: v => String(Math.round(v)) },
]

export type TeamRadarRow = {
  teamId: number
  teamName: string
  values: Record<TeamRadarAxisKey, number>
}

export function fipConstant(totalHR: number, totalBB: number, totalHBP: number, totalK: number, totalIP: number, totalER: number): number {
  const leagueERA = totalIP > 0 ? (totalER * 9) / totalIP : 4.0
  const rawFip = totalIP > 0 ? (13 * totalHR + 3 * (totalBB + totalHBP) - 2 * totalK) / totalIP : 0
  return leagueERA - rawFip
}

export function computeFIP(hr: number, bb: number, hbp: number, k: number, ip: number, cFIP: number): number {
  if (ip <= 0) return 0
  return Math.round((((13 * hr + 3 * (bb + hbp) - 2 * k) / ip) + cFIP) * 100) / 100
}

type Split = { team: { id: number; name: string }; stat: Record<string, string | number | undefined> }

function pitchingValues(pit: Split['stat'], cFIP: number): Record<'era' | 'whip' | 'fip' | 'k9' | 'bb9' | 'hr9' | 'kbb' | 'saves' | 'holds' | 'shutouts', number> {
  const ip = parseFloat(String(pit.inningsPitched ?? '0'))
  return {
    era: parseFloat(String(pit.era ?? '0')),
    whip: parseFloat(String(pit.whip ?? '0')),
    fip: computeFIP(Number(pit.homeRuns ?? 0), Number(pit.baseOnBalls ?? 0), Number(pit.hitBatsmen ?? 0), Number(pit.strikeOuts ?? 0), ip, cFIP),
    k9: parseFloat(String(pit.strikeoutsPer9Inn ?? '0')),
    bb9: parseFloat(String(pit.walksPer9Inn ?? '0')),
    hr9: parseFloat(String(pit.homeRunsPer9 ?? '0')),
    kbb: parseFloat(String(pit.strikeoutWalkRatio ?? '0')),
    saves: Number(pit.saves ?? 0),
    holds: Number(pit.holds ?? 0),
    shutouts: Number(pit.shutouts ?? 0),
  }
}

function battingValues(bat: Split['stat']): Record<'avg' | 'obp' | 'slg' | 'ops' | 'hr' | 'rbi' | 'runs' | 'sb' | 'doubles' | 'walks', number> {
  return {
    avg: parseFloat(String(bat.avg ?? '0')),
    obp: parseFloat(String(bat.obp ?? '0')),
    slg: parseFloat(String(bat.slg ?? '0')),
    ops: parseFloat(String(bat.ops ?? '0')),
    hr: Number(bat.homeRuns ?? 0),
    rbi: Number(bat.rbi ?? 0),
    runs: Number(bat.runs ?? 0),
    sb: Number(bat.stolenBases ?? 0),
    doubles: Number(bat.doubles ?? 0),
    walks: Number(bat.baseOnBalls ?? 0),
  }
}

export async function getTeamRadarStats(season: number): Promise<{ rows: TeamRadarRow[]; cFIP: number }> {
  const [hitRes, pitRes] = await Promise.all([
    fetch(`${MLB_API}/teams/stats?stats=season&group=hitting&sportId=1&season=${season}`, { next: { revalidate: 3600 } }),
    fetch(`${MLB_API}/teams/stats?stats=season&group=pitching&sportId=1&season=${season}`, { next: { revalidate: 3600 } }),
  ])
  if (!hitRes.ok || !pitRes.ok) return { rows: [], cFIP: 0 }

  const [hitData, pitData] = await Promise.all([hitRes.json(), pitRes.json()])
  const hitSplits: Split[] = hitData.stats?.[0]?.splits ?? []
  const pitSplits: Split[] = pitData.stats?.[0]?.splits ?? []

  let totalHR = 0, totalBB = 0, totalHBP = 0, totalK = 0, totalIP = 0, totalER = 0
  for (const s of pitSplits) {
    const st = s.stat
    totalHR += Number(st.homeRuns ?? 0)
    totalBB += Number(st.baseOnBalls ?? 0)
    totalHBP += Number(st.hitBatsmen ?? 0)
    totalK += Number(st.strikeOuts ?? 0)
    totalIP += parseFloat(String(st.inningsPitched ?? '0'))
    totalER += Number(st.earnedRuns ?? 0)
  }
  const cFIP = fipConstant(totalHR, totalBB, totalHBP, totalK, totalIP, totalER)

  const pitByTeam = new Map<number, Split['stat']>(pitSplits.map(s => [s.team.id, s.stat]))

  const rows = hitSplits
    .filter(s => pitByTeam.has(s.team.id))
    .map((s): TeamRadarRow => ({
      teamId: s.team.id,
      teamName: s.team.name,
      values: { ...pitchingValues(pitByTeam.get(s.team.id)!, cFIP), ...battingValues(s.stat) },
    }))

  return { rows, cFIP }
}

export function percentileRank(value: number, all: number[], higherIsBetter = true): number {
  if (all.length <= 1) return 100
  let below = 0, equal = 0
  for (const v of all) {
    if (higherIsBetter ? v < value : v > value) below++
    else if (v === value) equal++
  }
  return Math.round(((below + equal / 2) / all.length) * 100)
}

// ── Per-player roster breakdown — lazy-fetched client-side per team, only
// when that team is showing in the slideshow (not all 30 upfront). One
// hydrated roster call returns every player who's appeared for that team
// this season with their individual season stats already attached. Every
// pitcher carries his FULL pitching line (all 10 pitching axes) and every
// batter his full batting line (all 10 batting axes) — hovering any one
// point shows the same comprehensive line regardless of which axis you're
// on, not just that one stat.

export type RadarPlayerLine = {
  personId: number
  name: string
  headshot: string
  ip?: number
  pa?: number
} & Partial<Record<TeamRadarAxisKey, number>>

type StatBlock = { group?: { displayName?: string }; splits?: { stat?: Record<string, string | number | undefined> }[] }
type RosterEntry = { person: { id: number; fullName: string; stats?: StatBlock[] } }

export async function getTeamRosterBreakdown(teamId: number, season: number, cFIP: number): Promise<{ pitchers: RadarPlayerLine[]; batters: RadarPlayerLine[] }> {
  const hydrate = encodeURIComponent(`person(stats(group=[hitting,pitching],type=season,season=${season}))`)
  const res = await fetch(`${MLB_API}/teams/${teamId}/roster?rosterType=fullSeason&season=${season}&hydrate=${hydrate}`)
  if (!res.ok) return { pitchers: [], batters: [] }
  const data = await res.json()
  const roster: RosterEntry[] = data.roster ?? []

  const pitchers: RadarPlayerLine[] = []
  const batters: RadarPlayerLine[] = []

  for (const r of roster) {
    const p = r.person
    const headshot = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${p.id}/headshot/67/current`
    const pitchStats = p.stats?.find(s => s.group?.displayName === 'pitching')?.splits?.[0]?.stat
    const hitStats = p.stats?.find(s => s.group?.displayName === 'hitting')?.splits?.[0]?.stat

    if (pitchStats) {
      const ip = parseFloat(String(pitchStats.inningsPitched ?? '0'))
      if (ip > 0) {
        pitchers.push({ personId: p.id, name: p.fullName, headshot, ip, ...pitchingValues(pitchStats, cFIP) })
      }
    }
    if (hitStats) {
      const pa = Number(hitStats.plateAppearances ?? 0)
      if (pa > 0) {
        batters.push({ personId: p.id, name: p.fullName, headshot, pa, ...battingValues(hitStats) })
      }
    }
  }

  pitchers.sort((a, b) => (b.ip ?? 0) - (a.ip ?? 0))
  batters.sort((a, b) => (b.pa ?? 0) - (a.pa ?? 0))
  return { pitchers, batters }
}
