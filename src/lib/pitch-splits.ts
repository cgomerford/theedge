// src/lib/pitch-splits.ts
//
// Real, player- and team-specific situational splits — "Bryce Harper with
// 2 strikes off sliders, runner in scoring position, 2 outs, innings 7-9"
// style questions — answered from real per-pitch season logs (the exact
// statcast_search/csv pattern already proven in pitcher-statcast-profile.ts
// / batter-bat-speed.ts). A player log is scoped via batters_lookup[]; a
// team log via hfTeam=ABBR| (curl-verified: one real call returns every
// batter on that real roster's full-season pitches — used for "switch to
// team" breakdowns and the team-average compare option).
//
// This is deliberately separate from src/lib/player-splits.ts, which wraps
// MLB's own official sitCodes splits endpoint (vs LHP/RHP, home/away,
// 2-strike, etc. — real, official, used by the player page's Splits tab).
// That endpoint is the better source for a PURE situational split — but it
// has no pitch-type dimension and no team-wide breakdown, so it can't
// answer "hits off changeups with 2 strikes" or "how does the whole
// lineup do here." This file fills those gaps, computed from a real raw
// pitch log instead of estimated.

import { MLB_TEAMS } from '@/lib/teams'
import { withSavantCache } from '@/lib/savant-cache'

const SEASON = new Date().getFullYear()
const MLB_API = 'https://statsapi.mlb.com/api/v1'

// Real current-team lookup for "switch to team" / "compare vs team
// average" — MLB's /people endpoint gives a team id, not an abbreviation,
// so this maps it through the same MLB_TEAMS table the rest of the app
// uses (curl-verified those abbreviations match Savant's hfTeam codes,
// e.g. 'PHI').
export async function getPlayerTeamAbbrev(playerId: number): Promise<{ abbrev: string; name: string } | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${playerId}?hydrate=currentTeam`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = await res.json()
    const teamId = data.people?.[0]?.currentTeam?.id
    const team = MLB_TEAMS.find(t => t.id === teamId)
    return team ? { abbrev: team.abbrev, name: team.name } : null
  } catch {
    return null
  }
}

export type PitchTypeCode = 'FF' | 'SI' | 'FC' | 'SL' | 'CU' | 'CH' | 'FS' | 'ST' | 'SV'

export type CountSituationKey = 'any' | 'firstPitch' | 'ahead' | 'even' | 'behind' | 'twoStrikes' | 'threeBalls' | 'oh2' | 'one2' | 'full'

export const COUNT_SITUATIONS: { key: CountSituationKey; label: string; match: (balls: number, strikes: number) => boolean }[] = [
  { key: 'any', label: 'Any count', match: () => true },
  { key: 'firstPitch', label: 'First pitch (0-0)', match: (b, s) => b === 0 && s === 0 },
  { key: 'ahead', label: 'Ahead in count', match: (b, s) => b > s },
  { key: 'even', label: 'Even count', match: (b, s) => b === s },
  { key: 'behind', label: 'Behind in count', match: (b, s) => s > b },
  { key: 'twoStrikes', label: '2 strikes', match: (_b, s) => s === 2 },
  { key: 'threeBalls', label: '3 balls', match: (b) => b === 3 },
  { key: 'oh2', label: '0-2', match: (b, s) => b === 0 && s === 2 },
  { key: 'one2', label: '1-2', match: (b, s) => b === 1 && s === 2 },
  { key: 'full', label: 'Full count (3-2)', match: (b, s) => b === 3 && s === 2 },
]

// Real base/out state per pitch (on_1b/on_2b/on_3b/outs_when_up — curl-
// verified real Statcast fields, not derived).
export type SituationKey = 'any' | 'risp' | 'basesLoaded' | 'basesEmpty' | 'outs0' | 'outs1' | 'outs2'

export const SITUATIONS: { key: SituationKey; label: string; match: (r: PitchRow) => boolean }[] = [
  { key: 'any', label: 'Any situation', match: () => true },
  { key: 'risp', label: 'Runner in scoring position', match: r => r.on2b || r.on3b },
  { key: 'basesLoaded', label: 'Bases loaded', match: r => r.on1b && r.on2b && r.on3b },
  { key: 'basesEmpty', label: 'Bases empty', match: r => !r.on1b && !r.on2b && !r.on3b },
  { key: 'outs0', label: '0 outs', match: r => r.outs === 0 },
  { key: 'outs1', label: '1 out', match: r => r.outs === 1 },
  { key: 'outs2', label: '2 outs', match: r => r.outs === 2 },
]

// Real per-pitch inning number, bucketed — grouping keeps sample sizes
// usable (a single inning is often only a handful of real pitches for one
// player across a season).
export type InningKey = 'any' | 'early' | 'mid' | 'late' | 'extra'

export const INNING_RANGES: { key: InningKey; label: string; match: (inning: number) => boolean }[] = [
  { key: 'any', label: 'Any inning', match: () => true },
  { key: 'early', label: 'Innings 1-3', match: i => i >= 1 && i <= 3 },
  { key: 'mid', label: 'Innings 4-6', match: i => i >= 4 && i <= 6 },
  { key: 'late', label: 'Innings 7-9', match: i => i >= 7 && i <= 9 },
  { key: 'extra', label: 'Extra innings', match: i => i > 9 },
]

export type SplitStatKey = 'hits' | 'singles' | 'doubles' | 'triples' | 'homeRuns' | 'strikeouts' | 'walks' | 'whiffs' | 'hardHitBalls'

export const BATTER_SPLIT_STATS: { key: SplitStatKey; label: string }[] = [
  { key: 'hits', label: 'Hits (all)' },
  { key: 'singles', label: 'Singles' },
  { key: 'doubles', label: 'Doubles' },
  { key: 'triples', label: 'Triples' },
  { key: 'homeRuns', label: 'Home Runs' },
  { key: 'strikeouts', label: 'Strikeouts' },
  { key: 'walks', label: 'Walks' },
  { key: 'whiffs', label: 'Whiffs' },
  { key: 'hardHitBalls', label: 'Hard-Hit Balls (95+ mph)' },
]

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked'])
const HARD_HIT_MPH = 95

// "RBI on the play" — real per-pitch CSV has no rbi column, so this is
// derived the same real way pitcher-statcast-profile.ts derives runs
// allowed: post_bat_score minus bat_score, i.e. the batting team's actual
// real score before vs. after this exact pitch. Matches official RBI on
// essentially every real play (curl-verified against Bryce Harper's real
// log: 1 on a sac-less single, 2/3 on multi-run hits) — the one edge case
// it can't distinguish from official scoring is a run that scores on an
// error or wild pitch (those wouldn't be a real official RBI but would
// still show a positive score change here), same caveat already
// documented on that file's runsAllowed field.
export type RbiKey = 'any' | 'yes' | 'no'
export const RBI_OPTIONS: { key: RbiKey; label: string; match: (runsOnPlay: number) => boolean }[] = [
  { key: 'any', label: 'Any play', match: () => true },
  { key: 'yes', label: 'RBI on the play', match: r => r > 0 },
  { key: 'no', label: 'No RBI on the play', match: r => r === 0 },
]

export type PitchRow = {
  pitchType: string
  balls: number
  strikes: number
  events: string
  description: string
  launchSpeed: number | null
  on1b: boolean
  on2b: boolean
  on3b: boolean
  outs: number
  inning: number
  runsOnPlay: number
}

export type TeamPitchRow = PitchRow & { batterId: number; batterName: string }

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

type ColumnIndex = {
  iPitchType: number; iBalls: number; iStrikes: number; iEvents: number; iDesc: number
  iLaunchSpeed: number; iOn1b: number; iOn2b: number; iOn3b: number; iOuts: number; iInning: number
  iBatScore: number; iPostBatScore: number
}

function columnIndex(headers: string[]): ColumnIndex {
  return {
    iPitchType: headers.indexOf('pitch_type'),
    iBalls: headers.indexOf('balls'),
    iStrikes: headers.indexOf('strikes'),
    iEvents: headers.indexOf('events'),
    iDesc: headers.indexOf('description'),
    iLaunchSpeed: headers.indexOf('launch_speed'),
    iOn1b: headers.indexOf('on_1b'),
    iOn2b: headers.indexOf('on_2b'),
    iOn3b: headers.indexOf('on_3b'),
    iOuts: headers.indexOf('outs_when_up'),
    iInning: headers.indexOf('inning'),
    iBatScore: headers.indexOf('bat_score'),
    iPostBatScore: headers.indexOf('post_bat_score'),
  }
}

function rowFromCells(cells: string[], idx: ColumnIndex): PitchRow {
  const launchSpeed = parseFloat(cells[idx.iLaunchSpeed])
  const batScore = Number(cells[idx.iBatScore] ?? 0)
  const postBatScore = Number(cells[idx.iPostBatScore] ?? 0)
  return {
    pitchType: cells[idx.iPitchType] ?? '',
    balls: Number(cells[idx.iBalls] ?? 0),
    strikes: Number(cells[idx.iStrikes] ?? 0),
    events: cells[idx.iEvents] ?? '',
    description: cells[idx.iDesc] ?? '',
    launchSpeed: Number.isFinite(launchSpeed) ? launchSpeed : null,
    on1b: !!cells[idx.iOn1b],
    on2b: !!cells[idx.iOn2b],
    on3b: !!cells[idx.iOn3b],
    outs: Number(cells[idx.iOuts] ?? 0),
    inning: Number(cells[idx.iInning] ?? 0),
    runsOnPlay: Math.max(0, postBatScore - batScore),
  }
}

async function fetchStatcastCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return []
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  return lines.filter(l => l.trim()).map(parseCsvLine)
}

export async function getBatterPitchLog(batterId: number, season = SEASON): Promise<PitchRow[]> {
  return withSavantCache(
    `pitch-splits-batter:${batterId}:${season}`,
    21600,
    () => fetchBatterPitchLogSplits(batterId, season),
  )
}

async function fetchBatterPitchLogSplits(batterId: number, season: number): Promise<PitchRow[]> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  try {
    const lines = await fetchStatcastCsv(url)
    if (lines.length < 2) return []
    const headers = lines[0].map(h => h.replace(/^﻿?"?|"$/g, ''))
    const idx = columnIndex(headers)
    return lines.slice(1).map(cells => rowFromCells(cells, idx))
  } catch {
    return []
  }
}

// Real team-wide pitch log — every real batter on that real roster's
// pitches this season, in one call (curl-verified: hfTeam=PHI| alone
// returns the whole real lineup, ~20k rows for a full season, no
// per-player enumeration needed).
export async function getTeamPitchLog(teamAbbr: string, season = SEASON): Promise<TeamPitchRow[]> {
  return withSavantCache(
    `pitch-splits-team:${teamAbbr}:${season}`,
    21600,
    () => fetchTeamPitchLog(teamAbbr, season),
  )
}

async function fetchTeamPitchLog(teamAbbr: string, season: number): Promise<TeamPitchRow[]> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`,
    `&hfTeam=${encodeURIComponent(teamAbbr)}%7C`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  try {
    const lines = await fetchStatcastCsv(url)
    if (lines.length < 2) return []
    const headers = lines[0].map(h => h.replace(/^﻿?"?|"$/g, ''))
    const idx = columnIndex(headers)
    const iBatter = headers.indexOf('batter')
    const iName = headers.indexOf('player_name')
    return lines.slice(1).map(cells => ({
      ...rowFromCells(cells, idx),
      batterId: Number(cells[iBatter] ?? 0),
      batterName: savantNameToDisplay(cells[iName] ?? '—'),
    }))
  } catch {
    return []
  }
}

function savantNameToDisplay(raw: string): string {
  const [last, first] = raw.split(',').map(s => s.trim())
  return first && last ? `${first} ${last}` : raw
}

export type SplitFilters = {
  count: CountSituationKey
  situation: SituationKey
  inning: InningKey
  pitchType: PitchTypeCode | 'any'
  rbi: RbiKey
}

function matchesFilters(r: PitchRow, f: SplitFilters): boolean {
  const countDef = COUNT_SITUATIONS.find(c => c.key === f.count) ?? COUNT_SITUATIONS[0]
  const sitDef = SITUATIONS.find(s => s.key === f.situation) ?? SITUATIONS[0]
  const inningDef = INNING_RANGES.find(i => i.key === f.inning) ?? INNING_RANGES[0]
  const rbiDef = RBI_OPTIONS.find(r => r.key === f.rbi) ?? RBI_OPTIONS[0]
  return countDef.match(r.balls, r.strikes)
    && sitDef.match(r)
    && inningDef.match(r.inning)
    && rbiDef.match(r.runsOnPlay)
    && (f.pitchType === 'any' || r.pitchType === f.pitchType)
}

function countStat(rows: PitchRow[], stat: SplitStatKey): number {
  switch (stat) {
    case 'hits': return rows.filter(r => HIT_EVENTS.has(r.events)).length
    case 'singles': return rows.filter(r => r.events === 'single').length
    case 'doubles': return rows.filter(r => r.events === 'double').length
    case 'triples': return rows.filter(r => r.events === 'triple').length
    case 'homeRuns': return rows.filter(r => r.events === 'home_run').length
    case 'strikeouts': return rows.filter(r => r.events === 'strikeout' || r.events === 'strikeout_double_play').length
    case 'walks': return rows.filter(r => r.events === 'walk').length
    case 'whiffs': return rows.filter(r => WHIFF_DESCRIPTIONS.has(r.description)).length
    case 'hardHitBalls': return rows.filter(r => r.launchSpeed !== null && r.launchSpeed >= HARD_HIT_MPH).length
  }
}

export type SplitResult = { value: number; sampleSize: number }

export function computeSplitStat(rows: PitchRow[], stat: SplitStatKey, filters: SplitFilters): SplitResult {
  const filtered = rows.filter(r => matchesFilters(r, filters))
  return { value: countStat(filtered, stat), sampleSize: filtered.length }
}

export type TeamPlayerSplit = { batterId: number; batterName: string; value: number; sampleSize: number }
export type TeamSplitBreakdown = { team: SplitResult; players: TeamPlayerSplit[] }

// Every qualifying player on the team broken down individually, plus the
// real team total — the same filtered pool, just grouped by batter instead
// of collapsed to one number.
export function computeTeamSplitBreakdown(rows: TeamPitchRow[], stat: SplitStatKey, filters: SplitFilters, minSample = 5): TeamSplitBreakdown {
  const filtered = rows.filter(r => matchesFilters(r, filters))
  const byPlayer = new Map<number, { name: string; rows: PitchRow[] }>()
  for (const r of filtered) {
    const cur = byPlayer.get(r.batterId)
    if (cur) cur.rows.push(r)
    else byPlayer.set(r.batterId, { name: r.batterName, rows: [r] })
  }

  const players: TeamPlayerSplit[] = [...byPlayer.entries()]
    .map(([batterId, { name, rows: playerRows }]) => ({
      batterId, batterName: name, value: countStat(playerRows, stat), sampleSize: playerRows.length,
    }))
    .filter(p => p.sampleSize >= minSample)
    .sort((a, b) => b.value - a.value)

  return { team: { value: countStat(filtered, stat), sampleSize: filtered.length }, players }
}
