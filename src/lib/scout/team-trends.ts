// src/lib/scout/team-trends.ts
//
// Scout §2 (Form vs skill trends) — team-level game-by-game offense, built from
// two sources merged by gamePk:
//   · Savant's pitch-level search CSV filtered to ONE team batting (contact
//     quality, plate discipline). That pull is ~3–4MB (over Next's 2MB fetch-
//     cache ceiling), so — per savant-cache.ts — we aggregate it to one small row
//     per game and cache THAT in Supabase, never the raw CSV.
//   · The MLB Stats API team game log (AVG/OBP/SLG, runs, HR, SB).
//
// Every row stores SUMS, never rates, so any trailing window is a re-sum. From
// those the module precomputes every window of every stat for the client's
// "pick any stat" explorer (stat-explorer.ts).
//
//   xwOBA  — balls in play with tracking use Savant's estimated wOBA
//            (estimated_woba_using_speedangle); every other PA uses its actual
//            woba_value. Denominator is woba_denom, same as Savant's own.
//   Barrel — launch_speed_angle === 6 over batted balls with a launch_speed.
//   HardHit— launch_speed >= 95 over the same batted balls.
//   Chase  — swings at pitches outside the zone (zone 11–14) / pitches outside it.
//
// Season baselines: Savant's small team leaderboards (xwOBA, wOBA, barrel%,
// hard-hit%) and the MLB Stats API (slash line, K%, BB%, runs/HR/SB per game).
// Stats with no sourced season figure fall back to the average of the games on
// the chart, and the chart labels it that way.

import { withSavantCache } from '@/lib/savant-cache'
import { getStartMarkers } from './game-starts'
import {
  buildRolling, ratio, sumOf, withFallbackBaselines,
  type ExplorerClub, type ExplorerStat, type StatFns,
} from './stat-explorer'

const SAVANT = 'https://baseballsavant.mlb.com'
const MLB_API = 'https://statsapi.mlb.com/api/v1'
const LOOKBACK_DAYS = 40      // ≈ 34–37 team games
const HARD_HIT_MPH = 95
const BARREL_CODE = '6'
const SWEET_LO = 8, SWEET_HI = 32
export const TREND_WINDOWS = [1, 3, 5, 7, 10, 15]
// Rough per-PA standard deviation of wOBA-scale outcomes — only used to size how
// far a window must sit from season before the verdict says it moved.
const PA_SD = 0.45
const MOVE_Z = 1.5
export const MIN_VERDICT_PA = 150

// One row per game: Statcast sums + MLB game-log sums (zeros when a source lacks the game).
export type TeamGameSums = {
  pk: number; date: string
  // Statcast
  pa: number; denom: number; wobaNum: number; xwobaNum: number
  bbe: number; hard: number; barrels: number; sweet: number; evSum: number
  gb: number; ld: number; fb: number
  pitches: number; swings: number; whiffs: number; oPitches: number; oSwings: number
  k: number; bb: number
  // MLB Stats API
  ab: number; h: number; tb: number; hbp: number; sf: number; mbb: number
  runs: number; hr: number; sb: number
}

type StatcastLine = Omit<TeamGameSums, 'ab' | 'h' | 'tb' | 'hbp' | 'sf' | 'mbb' | 'runs' | 'hr' | 'sb'>
type MlbLine = { pk: number; date: string } & Pick<TeamGameSums, 'ab' | 'h' | 'tb' | 'hbp' | 'sf' | 'mbb' | 'runs' | 'hr' | 'sb'>

export type TrendWindow = {
  games: number; pa: number
  xwoba: number | null; woba: number | null
  barrelPct: number | null; hardHitPct: number | null; kBbPct: number | null
}

export type TrendVerdict = {
  tone: 'up' | 'down' | 'lucky' | 'unlucky' | 'even' | 'thin'
  label: string
  detail: string
}

export type TeamTrend = {
  abbr: string
  games: TeamGameSums[]
  l7: TrendWindow; l15: TrendWindow; l30: TrendWindow
  seasonXwoba: number | null; seasonWoba: number | null
  verdict: TrendVerdict
  explorer: ExplorerClub
}

// ─── Stat registry ───────────────────────────────────────────────────────

export const OFFENSE_STATS: ExplorerStat[] = [
  { key: 'xwoba', label: 'xwOBA', group: 'Contact quality', format: 'r3', higherIsBetter: true, hint: 'Expected wOBA — what the contact deserved, using exit velocity and launch angle. Skill, without the luck.' },
  { key: 'woba', label: 'wOBA', group: 'Contact quality', format: 'r3', higherIsBetter: true, hint: 'Weighted on-base average — actual results, credit given for each way of reaching base.' },
  { key: 'barrelPct', label: 'Barrel%', group: 'Contact quality', format: 'pct', higherIsBetter: true, hint: 'Share of batted balls hit at the speed and angle that produce the most damage.' },
  { key: 'hardHitPct', label: 'Hard-Hit%', group: 'Contact quality', format: 'pct', higherIsBetter: true, hint: 'Share of batted balls hit 95 mph or harder.' },
  { key: 'avgEv', label: 'Avg exit velo', group: 'Contact quality', format: 'mph', higherIsBetter: true, hint: 'Average exit velocity on batted balls.' },
  { key: 'sweetPct', label: 'Sweet-spot%', group: 'Contact quality', format: 'pct', higherIsBetter: true, hint: 'Share of batted balls launched between 8° and 32°.' },
  { key: 'gbPct', label: 'Ground-ball%', group: 'Contact quality', format: 'pct', higherIsBetter: false, hint: 'Share of batted balls on the ground.' },
  { key: 'fbPct', label: 'Fly-ball%', group: 'Contact quality', format: 'pct', higherIsBetter: null, hint: 'Share of batted balls hit in the air (fly balls, not pop-ups).' },
  { key: 'avg', label: 'AVG', group: 'Results', format: 'r3', higherIsBetter: true, hint: 'Batting average.' },
  { key: 'obp', label: 'OBP', group: 'Results', format: 'r3', higherIsBetter: true, hint: 'On-base percentage.' },
  { key: 'slg', label: 'SLG', group: 'Results', format: 'r3', higherIsBetter: true, hint: 'Slugging percentage.' },
  { key: 'ops', label: 'OPS', group: 'Results', format: 'r3', higherIsBetter: true, hint: 'On-base plus slugging.' },
  { key: 'runsPerGame', weight: 'game' as const, label: 'Runs / game', group: 'Results', format: 'num2', higherIsBetter: true, hint: 'Runs scored per game in the window.' },
  { key: 'hrPerGame', weight: 'game' as const, label: 'HR / game', group: 'Results', format: 'num2', higherIsBetter: true, hint: 'Home runs per game in the window.' },
  { key: 'sbPerGame', weight: 'game' as const, label: 'SB / game', group: 'Results', format: 'num2', higherIsBetter: true, hint: 'Stolen bases per game in the window.' },
  { key: 'kPct', label: 'K%', group: 'Plate discipline', format: 'pct', higherIsBetter: false, hint: 'Strikeouts per plate appearance.' },
  { key: 'bbPct', label: 'BB%', group: 'Plate discipline', format: 'pct', higherIsBetter: true, hint: 'Walks per plate appearance.' },
  { key: 'kbbPct', label: 'K%−BB%', group: 'Plate discipline', format: 'pct', higherIsBetter: false, hint: 'Strikeout rate minus walk rate — lower is better for a lineup.' },
  { key: 'whiffPct', label: 'Whiff%', group: 'Plate discipline', format: 'pct', higherIsBetter: false, hint: 'Share of swings that miss.' },
  { key: 'chasePct', label: 'Chase%', group: 'Plate discipline', format: 'pct', higherIsBetter: false, hint: 'Share of pitches outside the zone that the lineup swings at.' },
  { key: 'swingPct', label: 'Swing%', group: 'Plate discipline', format: 'pct', higherIsBetter: null, hint: 'Share of all pitches the lineup swings at.' },
]

export const OFFENSE_TILES = ['barrelPct', 'hardHitPct', 'kbbPct']

const OFFENSE_FNS: StatFns<TeamGameSums> = {
  xwoba: (g) => ratio(sumOf(g, (x) => x.xwobaNum), sumOf(g, (x) => x.denom)),
  woba: (g) => ratio(sumOf(g, (x) => x.wobaNum), sumOf(g, (x) => x.denom)),
  barrelPct: (g) => ratio(sumOf(g, (x) => x.barrels), sumOf(g, (x) => x.bbe), 100),
  hardHitPct: (g) => ratio(sumOf(g, (x) => x.hard), sumOf(g, (x) => x.bbe), 100),
  avgEv: (g) => ratio(sumOf(g, (x) => x.evSum), sumOf(g, (x) => x.bbe)),
  sweetPct: (g) => ratio(sumOf(g, (x) => x.sweet), sumOf(g, (x) => x.bbe), 100),
  gbPct: (g) => ratio(sumOf(g, (x) => x.gb), sumOf(g, (x) => x.bbe), 100),
  fbPct: (g) => ratio(sumOf(g, (x) => x.fb), sumOf(g, (x) => x.bbe), 100),
  avg: (g) => ratio(sumOf(g, (x) => x.h), sumOf(g, (x) => x.ab)),
  obp: (g) => ratio(sumOf(g, (x) => x.h + x.mbb + x.hbp), sumOf(g, (x) => x.ab + x.mbb + x.hbp + x.sf)),
  slg: (g) => ratio(sumOf(g, (x) => x.tb), sumOf(g, (x) => x.ab)),
  ops: (g) => {
    const obp = ratio(sumOf(g, (x) => x.h + x.mbb + x.hbp), sumOf(g, (x) => x.ab + x.mbb + x.hbp + x.sf))
    const slg = ratio(sumOf(g, (x) => x.tb), sumOf(g, (x) => x.ab))
    return obp != null && slg != null ? obp + slg : null
  },
  runsPerGame: (g) => ratio(sumOf(g, (x) => x.runs), g.length),
  hrPerGame: (g) => ratio(sumOf(g, (x) => x.hr), g.length),
  sbPerGame: (g) => ratio(sumOf(g, (x) => x.sb), g.length),
  kPct: (g) => ratio(sumOf(g, (x) => x.k), sumOf(g, (x) => x.pa), 100),
  bbPct: (g) => ratio(sumOf(g, (x) => x.bb), sumOf(g, (x) => x.pa), 100),
  kbbPct: (g) => ratio(sumOf(g, (x) => x.k - x.bb), sumOf(g, (x) => x.pa), 100),
  whiffPct: (g) => ratio(sumOf(g, (x) => x.whiffs), sumOf(g, (x) => x.swings), 100),
  chasePct: (g) => ratio(sumOf(g, (x) => x.oSwings), sumOf(g, (x) => x.oPitches), 100),
  swingPct: (g) => ratio(sumOf(g, (x) => x.swings), sumOf(g, (x) => x.pitches), 100),
}

// ─── CSV ─────────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0])
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Statcast per-game aggregation ───────────────────────────────────────

const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const SWING = new Set([...WHIFF, 'foul', 'foul_tip', 'foul_bunt', 'bunt_foul_tip'])
const isSwing = (d: string) => SWING.has(d) || d.startsWith('hit_into_play')

function emptyStatcast(pk: number, date: string): StatcastLine {
  return { pk, date, pa: 0, denom: 0, wobaNum: 0, xwobaNum: 0, bbe: 0, hard: 0, barrels: 0, sweet: 0, evSum: 0, gb: 0, ld: 0, fb: 0, pitches: 0, swings: 0, whiffs: 0, oPitches: 0, oSwings: 0, k: 0, bb: 0 }
}

async function fetchStatcastLines(abbr: string, gameDate: string): Promise<StatcastLine[]> {
  const year = gameDate.slice(0, 4)
  const params = new URLSearchParams({
    all: 'true', hfGT: 'R|', hfSea: `${year}|`, player_type: 'batter', type: 'details',
    team: abbr, game_date_gt: shiftDays(gameDate, -LOOKBACK_DAYS), game_date_lt: shiftDays(gameDate, -1),
    min_pitches: '0', min_results: '0', group_by: 'name', sort_col: 'pitches', sort_order: 'desc',
  })
  // no-store: the body is over Next's 2MB fetch-cache limit anyway.
  const res = await fetch(`${SAVANT}/statcast_search/csv?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(25000) })
  if (!res.ok) return []
  const rows = parseCsv(await res.text())

  const byGame = new Map<number, StatcastLine>()
  for (const r of rows) {
    const pk = num(r.game_pk)
    if (pk == null) continue
    let g = byGame.get(pk)
    if (!g) { g = emptyStatcast(pk, r.game_date); byGame.set(pk, g) }

    // Every row is a pitch.
    g.pitches += 1
    const swung = isSwing(r.description ?? '')
    if (swung) g.swings += 1
    if (WHIFF.has(r.description ?? '')) g.whiffs += 1
    const zone = num(r.zone)
    if (zone != null && zone >= 11) { g.oPitches += 1; if (swung) g.oSwings += 1 }

    const events = r.events
    if (!events) continue // only the PA-ending pitch carries an event
    g.pa += 1
    const denom = num(r.woba_denom) ?? 0
    const wobaValue = num(r.woba_value) ?? 0
    const launch = num(r.launch_speed)
    const angle = num(r.launch_angle)
    const est = num(r.estimated_woba_using_speedangle)
    g.denom += denom
    g.wobaNum += wobaValue
    g.xwobaNum += r.type === 'X' && launch != null && est != null ? est : wobaValue
    if (r.type === 'X' && launch != null) {
      g.bbe += 1
      g.evSum += launch
      if (launch >= HARD_HIT_MPH) g.hard += 1
      if (r.launch_speed_angle === BARREL_CODE) g.barrels += 1
      if (angle != null && angle >= SWEET_LO && angle <= SWEET_HI) g.sweet += 1
      if (r.bb_type === 'ground_ball') g.gb += 1
      else if (r.bb_type === 'line_drive') g.ld += 1
      else if (r.bb_type === 'fly_ball') g.fb += 1
    }
    if (events === 'strikeout' || events === 'strikeout_double_play') g.k += 1
    if (events === 'walk' || events === 'intent_walk') g.bb += 1
  }
  return [...byGame.values()].sort((a, b) => a.date.localeCompare(b.date) || a.pk - b.pk)
}

async function fetchMlbGameLog(teamId: number, year: string): Promise<Map<number, MlbLine>> {
  const out = new Map<number, MlbLine>()
  try {
    const res = await fetch(`${MLB_API}/teams/${teamId}/stats?stats=gameLog&group=hitting&season=${year}`, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return out
    const splits = (await res.json())?.stats?.[0]?.splits ?? []
    for (const s of splits) {
      const pk = s.game?.gamePk
      if (!pk) continue
      const st = s.stat ?? {}
      out.set(pk, {
        pk, date: s.date,
        ab: st.atBats ?? 0, h: st.hits ?? 0, tb: st.totalBases ?? 0, hbp: st.hitByPitch ?? 0, sf: st.sacFlies ?? 0,
        mbb: st.baseOnBalls ?? 0, runs: st.runs ?? 0, hr: st.homeRuns ?? 0, sb: st.stolenBases ?? 0,
      })
    }
  } catch { /* stats that need the game log just come back null */ }
  return out
}

function mergeGames(statcast: StatcastLine[], mlb: Map<number, MlbLine>): TeamGameSums[] {
  return statcast.map((s) => {
    const m = mlb.get(s.pk)
    return { ...s, ab: m?.ab ?? 0, h: m?.h ?? 0, tb: m?.tb ?? 0, hbp: m?.hbp ?? 0, sf: m?.sf ?? 0, mbb: m?.mbb ?? 0, runs: m?.runs ?? 0, hr: m?.hr ?? 0, sb: m?.sb ?? 0 }
  })
}

// ─── Window summary (for the L7/L15/L30 table + verdict) ─────────────────

export function summarize(lines: TeamGameSums[]): TrendWindow {
  return {
    games: lines.length,
    pa: sumOf(lines, (g) => g.pa),
    xwoba: OFFENSE_FNS.xwoba(lines), woba: OFFENSE_FNS.woba(lines),
    barrelPct: OFFENSE_FNS.barrelPct(lines), hardHitPct: OFFENSE_FNS.hardHitPct(lines), kBbPct: OFFENSE_FNS.kbbPct(lines),
  }
}

// ─── Baselines ───────────────────────────────────────────────────────────

async function fetchBaselines(abbr: string, teamId: number, year: string): Promise<Record<string, number | null>> {
  const base: Record<string, number | null> = {}
  const get = async (url: string) => {
    try {
      const r = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(10000) })
      return r.ok ? r : null
    } catch { return null }
  }
  const [xs, sc, ts] = await Promise.all([
    get(`${SAVANT}/leaderboard/expected_statistics?type=batter-team&year=${year}&position=&team=&min=1&csv=true`),
    get(`${SAVANT}/leaderboard/statcast?type=batter-team&year=${year}&position=&team=&min=1&csv=true`),
    get(`${MLB_API}/teams/${teamId}/stats?stats=season&group=hitting&season=${year}`),
  ])
  if (xs) {
    const row = parseCsv(await xs.text()).find((r) => r.team_id === abbr)
    if (row) { base.xwoba = num(row.est_woba); base.woba = num(row.woba) }
  }
  if (sc) {
    const row = parseCsv(await sc.text()).find((r) => r.team_id === abbr)
    if (row) { base.hardHitPct = num(row.ev95percent); base.barrelPct = num(row.brl_percent) }
  }
  if (ts) {
    const s = (await ts.json())?.stats?.[0]?.splits?.[0]?.stat
    if (s) {
      const games = s.gamesPlayed || 0, pa = s.plateAppearances || 0
      base.avg = num(s.avg); base.obp = num(s.obp); base.slg = num(s.slg); base.ops = num(s.ops)
      if (games > 0) { base.runsPerGame = s.runs / games; base.hrPerGame = s.homeRuns / games; base.sbPerGame = s.stolenBases / games }
      if (pa > 0) {
        base.kPct = (s.strikeOuts / pa) * 100; base.bbPct = (s.baseOnBalls / pa) * 100
        base.kbbPct = ((s.strikeOuts - s.baseOnBalls) / pa) * 100
      }
    }
  }
  return base
}

// ─── Verdict — plain language, with the sample it rests on ───────────────

export function buildVerdict(l15: TrendWindow, seasonXwoba: number | null): TrendVerdict {
  const fmt = (v: number) => v.toFixed(3).replace(/^0/, '')
  if (l15.pa < MIN_VERDICT_PA || l15.xwoba == null) {
    return { tone: 'thin', label: 'Too few games to compare', detail: `Only ${l15.pa} plate appearances in the window.` }
  }
  const n = `${l15.games} games · ${l15.pa} PA`
  const gap = l15.woba != null ? l15.woba - l15.xwoba : 0
  const z = seasonXwoba != null ? (l15.xwoba - seasonXwoba) / (PA_SD / Math.sqrt(l15.pa)) : 0

  if (seasonXwoba != null && z >= MOVE_Z) return { tone: 'up', label: 'Running above their season level', detail: `Last 15 games: xwOBA ${fmt(l15.xwoba)} vs ${fmt(seasonXwoba)} for the season (${n}).` }
  if (seasonXwoba != null && z <= -MOVE_Z) return { tone: 'down', label: 'Running below their season level', detail: `Last 15 games: xwOBA ${fmt(l15.xwoba)} vs ${fmt(seasonXwoba)} for the season (${n}).` }
  if (gap >= 0.03) return { tone: 'lucky', label: 'Results ahead of contact quality', detail: `wOBA ${fmt(l15.woba as number)} vs xwOBA ${fmt(l15.xwoba)} over the last 15 games — the box score is better than the contact (${n}).` }
  if (gap <= -0.03) return { tone: 'unlucky', label: 'Contact quality ahead of results', detail: `wOBA ${fmt(l15.woba as number)} vs xwOBA ${fmt(l15.xwoba)} over the last 15 games — hitting the ball harder than the box score shows (${n}).` }
  return { tone: 'even', label: 'In line with their season', detail: `Last 15 games: xwOBA ${fmt(l15.xwoba)}${seasonXwoba != null ? ` vs ${fmt(seasonXwoba)} for the season` : ''} (${n}).` }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getTeamTrend(teamId: number, abbr: string, gameDate: string, name: string): Promise<TeamTrend | null> {
  try {
    const year = gameDate.slice(0, 4)
    const [statcast, mlb, baselines] = await Promise.all([
      withSavantCache<StatcastLine[]>(`scout-team-trend:v2:${abbr}:${gameDate}`, 6 * 3600, () => fetchStatcastLines(abbr, gameDate)),
      fetchMlbGameLog(teamId, year),
      fetchBaselines(abbr, teamId, year),
    ])
    if (!statcast || statcast.length === 0) return null
    const games = mergeGames(statcast, mlb)
    const l15 = summarize(games.slice(-15))
    const { rolling, samples } = buildRolling(games, TREND_WINDOWS, OFFENSE_FNS, (w) => sumOf(w, (g) => g.pa))
    const markers = await getStartMarkers(teamId, games.map((g) => g.pk), games.map((g) => g.date), 'lineup')
    return {
      abbr, games,
      l7: summarize(games.slice(-7)), l15, l30: summarize(games.slice(-30)),
      seasonXwoba: baselines.xwoba ?? null, seasonWoba: baselines.woba ?? null,
      verdict: buildVerdict(l15, baselines.xwoba ?? null),
      explorer: {
        abbr, name, dates: games.map((g) => g.date), pks: games.map((g) => g.pk), markers, windows: TREND_WINDOWS, rolling, samples,
        baseline: withFallbackBaselines(OFFENSE_STATS.map((s) => s.key), baselines, 'Season', games, OFFENSE_FNS),
      },
    }
  } catch (err) {
    console.error('[scout] team trend failed:', abbr, err)
    return null
  }
}
