// src/lib/admin-team-card.ts
//
// Data for the admin "Team Snapshot" X graphic (TeamSnapshotCard). One cached
// league-wide table (getLeagueTables) feeds every club, so each rank is a
// position among the clubs that have the number — a missing value is null and
// renders as an empty cell, never a substitute.
//
// Postseason mode reads the same MLB Stats API endpoints with gameType=P
// (curl-verified: 12 clubs, pitching rows carry wins/losses). Ranks are then
// among the clubs that played in October, not all 30.
//
// Table ownership: read-only. This writes nothing to Supabase.

import { getLeagueTables, metric, fmt, hitLine, pitLine, mlbJson, splitsOf, ipToDecimal, type LeagueTables, type LeagueTeamRow, type Split } from '@/lib/team-profile/league'
import { MLB_TEAMS } from '@/lib/teams'

export type SnapshotMetric = { label: string; display: string; rank: number | null; of: number }
export type SnapshotGroup = { title: string; metrics: SnapshotMetric[] }

export type SnapshotMode = 'regular' | 'postseason'

export type TeamSnapshotData = {
  mode: SnapshotMode
  gp: number
  teamId: number
  name: string
  abbrev: string
  league: 'AL' | 'NL'
  division: string
  primary: string
  secondary: string
  text: string
  w: number
  l: number
  rs: number
  ra: number
  diff: number
  streak: string
  divRank: number
  season: number
  groups: SnapshotGroup[]
}

type Def = { key: string; label: string; higherIsBetter: boolean; fmt: (v: number) => string; get: (r: LeagueTeamRow) => number | null }

const GROUPS: { title: string; defs: Def[] }[] = [
  {
    title: 'Offense',
    defs: [
      { key: 'rpg', label: 'Runs / game', higherIsBetter: true, fmt: fmt.dec2, get: r => r.hit?.rPerG ?? null },
      { key: 'ops', label: 'OPS', higherIsBetter: true, fmt: fmt.rate3, get: r => r.hit?.ops ?? null },
      { key: 'hrg', label: 'HR / game', higherIsBetter: true, fmt: fmt.dec2, get: r => r.hit?.hrPerG ?? null },
      { key: 'k', label: 'Strikeout %', higherIsBetter: false, fmt: fmt.pct1, get: r => r.hit?.kPct ?? null },
    ],
  },
  {
    title: 'Pitching',
    defs: [
      { key: 'era', label: 'ERA', higherIsBetter: false, fmt: fmt.dec2, get: r => r.pit?.era ?? null },
      { key: 'fip', label: 'FIP', higherIsBetter: false, fmt: fmt.dec2, get: r => r.pit?.fip ?? null },
      { key: 'whip', label: 'WHIP', higherIsBetter: false, fmt: fmt.dec2, get: r => r.pit?.whip ?? null },
      { key: 'pk', label: 'Strikeout %', higherIsBetter: true, fmt: fmt.pct1, get: r => r.pit?.kPct ?? null },
    ],
  },
  {
    title: 'Bullpen',
    defs: [
      { key: 'rpera', label: 'Bullpen ERA', higherIsBetter: false, fmt: fmt.dec2, get: r => r.rp?.era ?? null },
      { key: 'rpsv', label: 'Save %', higherIsBetter: true, fmt: fmt.pct1, get: r => r.rp?.savePct ?? null },
    ],
  },
]

function build(tables: LeagueTables, mode: SnapshotMode): TeamSnapshotData[] {
  const out: TeamSnapshotData[] = []
  for (const row of tables.rows) {
    const t = MLB_TEAMS.find(x => x.id === row.id)
    if (!t) continue
    out.push({
      mode,
      gp: Number(row.st.gp),
      teamId: row.id,
      name: t.name,
      abbrev: t.abbrev,
      league: t.league,
      division: `${t.league} ${t.division}`,
      primary: t.primary_color,
      secondary: t.secondary_color,
      text: t.text_on_primary,
      w: Number(row.st.w), l: Number(row.st.l),
      rs: Number(row.st.rs), ra: Number(row.st.ra), diff: Number(row.st.diff),
      streak: row.st.streak,
      divRank: Number(row.st.divRank),
      season: tables.season,
      groups: GROUPS.map(g => ({
        title: g.title,
        metrics: g.defs.map(d => {
          const m = metric(tables, row.id, d)
          return { label: d.label, display: m.display, rank: m.rank, of: m.of }
        }),
      })),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Regular-season snapshots for every club, or [] when the league table is unavailable. */
export async function getTeamSnapshots(season: number): Promise<TeamSnapshotData[]> {
  const tables = await getLeagueTables(season)
  if (!tables) {
    console.error('[getTeamSnapshots] league tables unavailable for', season)
    return []
  }
  return build(tables, 'regular')
}

/** Postseason snapshots (clubs that have played an October game), or [] when none/unavailable. */
export async function getPostseasonSnapshots(season: number): Promise<TeamSnapshotData[]> {
  const MLB = 'https://statsapi.mlb.com/api/v1'
  const q = `season=${season}&sportIds=1&gameType=P&limit=100`
  const [hit, pit, split] = await Promise.all([
    mlbJson(`${MLB}/teams/stats?stats=season&group=hitting&${q}`, 'getPostseasonSnapshots:hitting'),
    mlbJson(`${MLB}/teams/stats?stats=season&group=pitching&${q}`, 'getPostseasonSnapshots:pitching'),
    mlbJson(`${MLB}/teams/stats?stats=statSplits&group=pitching&sitCodes=rp&${q}`, 'getPostseasonSnapshots:rp'),
  ])
  if (!hit || !pit) {
    console.error('[getPostseasonSnapshots] missing hitting/pitching table')
    return []
  }
  const pitSplits = splitsOf(pit)
  if (pitSplits.length === 0) return []   // postseason not started — empty state, not zeros

  // League FIP constant from the postseason pool itself (same definition as getLeagueTables).
  let hr = 0, bb = 0, hbp = 0, so = 0, ip = 0, er = 0
  for (const sp of pitSplits) {
    const st = sp.stat ?? {}
    hr += Number(st.homeRuns ?? 0); bb += Number(st.baseOnBalls ?? 0); hbp += Number(st.hitBatsmen ?? 0)
    so += Number(st.strikeOuts ?? 0); ip += ipToDecimal(st.inningsPitched); er += Number(st.earnedRuns ?? 0)
  }
  const cFIP = ip > 0 ? (er * 9) / ip - (13 * hr + 3 * (bb + hbp) - 2 * so) / ip : 3.1

  const byTeam = (splits: Split[], pick?: (s: Split) => boolean) => {
    const m = new Map<number, Record<string, unknown>>()
    for (const sp of splits) if (sp.team?.id && (!pick || pick(sp))) m.set(sp.team.id, sp.stat ?? {})
    return m
  }
  const hitM = byTeam(splitsOf(hit)), pitM = byTeam(pitSplits)
  const rpM = byTeam(splitsOf(split), sp => sp.split?.code === 'rp')

  const rows: LeagueTeamRow[] = []
  for (const [id, p] of pitM) {
    const meta = MLB_TEAMS.find(x => x.id === id)
    const h = hitM.get(id)
    if (!meta || !h) continue
    const rs = Number(h.runs ?? 0), ra = Number(p.runs ?? 0)
    rows.push({
      id, name: meta.name, abbr: meta.abbrev,
      st: {
        w: Number(p.wins ?? 0), l: Number(p.losses ?? 0), pct: 0, gp: Number(p.gamesPlayed ?? 0),
        rs, ra, diff: rs - ra, streak: '', divRank: 0, leagueRank: 0, sportRank: 0,
        gb: '-', wcgb: '-', divChamp: false, clinched: false, elim: '-', magic: '-', splits: {},
      },
      hit: hitLine(h), pit: pitLine(p, cFIP), sp: null, rp: pitLine(rpM.get(id), cFIP),
      vl: null, vr: null, risp: null, fld: null,
    })
  }
  if (rows.length === 0) return []
  return build({ season, cFIP, rows }, 'postseason')
}
