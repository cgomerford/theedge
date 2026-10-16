// src/lib/lab/team-pitch-makeup.ts
//
// "Team make-up: pitching" lab experiment — computed on request, the same way
// the Scout Report / game-preview helpers work: a live Savant CSV pull,
// aggregated in TypeScript, with the SMALL aggregated result cached through
// withSavantCache (savant-cache.ts → the existing savant_fetch_cache table).
// No new tables, no cron, no SQL.
//
// One call = one club's season (~25k pitches, pulled in month-sized windows
// because Savant truncates a CSV at 25,000 rows; a window that comes back
// near the cap is split and re-fetched). Raw CSVs are never cached — they
// blow past Next's 2 MB fetch-cache ceiling — only the aggregate is.
//
// Columns used (verified against a live response, 2026-10-14): pitch_type,
// release_speed, pfx_x, pfx_z, release_pos_x, release_pos_z, arm_angle,
// pitcher, player_name, p_throws, home_team, away_team, inning_topbot. The CSV
// starts with a UTF-8 BOM (stripped). Savant's `hfTeam` filter returns only
// that club's PITCHING side; we still derive the pitching team from
// inning_topbot (Top → home, Bot → away) as a guard. Savant says "AZ" where
// MLB_TEAMS says "ARI".
//
// Role split: a pitch is a STARTER pitch when its pitcher threw that club's first
// pitch of the game (min at_bat_number, pitch_number per game_pk) — openers
// count as starters; everything else is BULLPEN. Verified on live games
// (Cole/Rodón/Fried were each game's first pitcher). Runs allowed by role come
// from the MLB Stats API statSplits sitCodes sp/rp (needs limit=100 — the
// default silently returns 50 of 60 rows).
//
// Outcomes (same CSV, no extra pull): description (swing / whiff / called
// strike), zone (1-9 in the zone, 11-14 outside), events (PA-ending result),
// estimated_woba_using_speedangle / woba_value / woba_denom (xwOBA against =
// sum of estimated wOBA, falling back to woba_value when there is no
// estimate, over woba_denom), launch_speed, launch_speed_angle (6 = barrel).
// Whiff = swinging_strike + swinging_strike_blocked + foul_tip + missed_bunt,
// per swing. Savant's own xERA is not published per team and cannot be rebuilt
// from pitch rows, so xwOBA against is the stand-in (same input).
//
// Flight model inputs (for the dashboard's animated pitch flight): plate_x,
// plate_z (where it crossed the plate), ax, az (Statcast acceleration, ft/s^2,
// gravity included), release_pos_y, vy0 / ay (to time the flight), and the
// batter-specific sz_top / sz_bot (average zone height). x-type values are
// arm-side positive like everything else here. The path drawn from these is a
// constant-acceleration MODEL through the averaged release and plate points,
// not a tracked trajectory.
//
// Units: velo mph · h/v break inches, ARM-SIDE POSITIVE (pfx_x flipped for
// right-handers) · release side feet from the rubber's middle, arm-side
// positive · release height feet · arm angle degrees (90 = overhead).

import { MLB_TEAMS } from '@/lib/teams'
import { withSavantCache } from '@/lib/savant-cache'

const SAVANT = 'https://baseballsavant.mlb.com/statcast_search/csv'
const MLB = 'https://statsapi.mlb.com/api/v1'
const TRUNCATION_GUARD = 24000
const MIN_TYPE_PITCHES = 50
const MIN_SPREAD_PITCHES = 150
const MIN_PITCHER_PITCHES = 100
const MIN_N = 30
const NOT_A_PITCH = new Set(['', 'PO', 'IN', 'AB', 'UN', 'FA'])
const CACHE_VERSION = 'v4'
const TTL_SECONDS = 6 * 3600
const SAVANT_ABBREV: Record<string, string> = { ARI: 'AZ' }

export type PitchRow = {
  pitchType: string
  pitches: number
  usagePct: number
  nPitchers: number
  veloAvg: number | null; veloP10: number | null; veloP90: number | null
  hBreak: number | null; vBreak: number | null; hBreakSd: number | null; vBreakSd: number | null
  relSide: number | null; relHeight: number | null; relSideSdIn: number | null; relHeightSdIn: number | null
  armAngle: number | null; armAngleSd: number | null
  whiffPct: number | null
  // flight model inputs (arm-side positive); feet, ft/s^2, seconds
  plateSide: number | null; plateHeight: number | null; accSide: number | null; accVert: number | null
  relY: number | null; flightSec: number | null
}
export type PitcherArm = { id: number; name: string; throws: string; pitches: number; armAngle: number }

/** Results for the pitches in a role. Percentages are 0-100; null when the sample is too thin. */
export type Outcomes = {
  whiffPct: number | null; cswPct: number | null; chasePct: number | null; zonePct: number | null
  kPct: number | null; bbPct: number | null; xwoba: number | null
  hardHitPct: number | null; barrelPct: number | null; avgEv: number | null
}

export type Role = 'all' | 'sp' | 'rp'
export const ROLES: Role[] = ['all', 'sp', 'rp']

/** One club's pitching make-up for one role. */
export type RoleMakeup = {
  pitches: number
  rows: PitchRow[]
  pitcherArms: PitcherArm[]
  armAngleSdPitch: number | null
  armAngleLow: number | null
  armAngleHigh: number | null
  releaseSpreadIn: number | null
  outcomes: Outcomes
  szTop: number | null; szBot: number | null   // average strike-zone top / bottom, feet
}
/** The cached unit: every role for one club + season. */
export type TeamMakeup = { teamId: number; season: number; roles: Record<Role, RoleMakeup> }
export type TeamRuns = { teamId: number; games: number; ip: number; runsAllowed: number; ra9: number | null; era: number | null }
export type TeamRunsByRole = Record<Role, TeamRuns | null>

// ─── small stats helpers (null when the sample is too thin) ───────────────
const mean = (xs: number[]) => (xs.length >= MIN_N ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sd = (xs: number[]) => {
  if (xs.length < MIN_N) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}
const pctl = (xs: number[], p: number) => {
  if (xs.length < MIN_N) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]
}
const rd = (x: number | null, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const num = (v: string | undefined) => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const split = (line: string) => {
    const out: string[] = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') q = !q
      else if (ch === ',' && !q) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }
  const header = split(lines[0] ?? '')
  return { header, rows: lines.slice(1).map(split) }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

async function fetchWindow(abbrev: string, season: number, d0: Date, d1: Date): Promise<{ header: string[]; rows: string[][] }[]> {
  const url = `${SAVANT}?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=pitcher&hfTeam=${abbrev}%7C` +
    `&game_date_gt=${ymd(d0)}&game_date_lt=${ymd(d1)}&type=details`
  let res: Response | null = null
  for (let attempt = 0; attempt < 2 && !res?.ok; attempt++) {     // one retry: Savant is slow under load
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
        cache: 'no-store',
        signal: AbortSignal.timeout(90000),
      })
    } catch (e) {
      if (attempt === 1) throw e
    }
  }
  if (!res || !res.ok) throw new Error(`Savant HTTP ${res?.status ?? 'none'} for ${abbrev} ${ymd(d0)}..${ymd(d1)}`)
  const parsed = parseCsv(await res.text())
  if (parsed.rows.length >= TRUNCATION_GUARD) {
    if (ymd(d0) === ymd(d1)) throw new Error(`Savant window ${ymd(d0)} for ${abbrev} returned ${parsed.rows.length} rows — possible truncation`)
    const mid = addDays(d0, Math.floor((d1.getTime() - d0.getTime()) / 86400000 / 2))
    return [...(await fetchWindow(abbrev, season, d0, mid)), ...(await fetchWindow(abbrev, season, addDays(mid, 1), d1))]
  }
  return [parsed]
}

type P = { ptype: string; pitcher: string; name: string; throws: string; game: string; ab: number; pn: number; velo: number | null; hb: number | null; vb: number | null; rx: number | null; rz: number | null; aa: number | null ; desc: string; zone: number | null; events: string; xw: number | null; wv: number | null; wd: number | null; ls: number | null; lsa: string ; px: number | null; pz: number | null; ax: number | null; az: number | null; ry: number | null; ft: number | null; szt: number | null; szb: number | null }

async function computeTeamMakeup(teamId: number, season: number): Promise<TeamMakeup | null> {
  const team = MLB_TEAMS.find(t => t.id === teamId)
  if (!team) return null
  const abbrev = SAVANT_ABBREV[team.abbrev] ?? team.abbrev

  // Month-sized windows covering the whole regular season (Mar 15 → Nov 5).
  const windows: [Date, Date][] = []
  for (let m = 2; m <= 10; m++) {
    const start = m === 2 ? new Date(Date.UTC(season, 2, 15)) : new Date(Date.UTC(season, m, 1))
    const end = m === 10 ? new Date(Date.UTC(season, 10, 5)) : new Date(Date.UTC(season, m + 1, 0))
    windows.push([start, end])
  }

  const chunks: { header: string[]; rows: string[][] }[] = []
  for (let i = 0; i < windows.length; i += 2) {           // two windows at a time — polite to Savant
    const batch = await Promise.all(windows.slice(i, i + 2).map(([a, b]) => fetchWindow(abbrev, season, a, b)))
    chunks.push(...batch.flat())
  }

  const all: P[] = []
  for (const { header, rows } of chunks) {
    const col = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>
    for (const need of ['pitch_type', 'release_speed', 'pfx_x', 'pfx_z', 'release_pos_x', 'release_pos_z', 'arm_angle', 'pitcher', 'player_name', 'p_throws', 'home_team', 'away_team', 'inning_topbot', 'game_pk', 'at_bat_number', 'pitch_number', 'description', 'zone', 'events', 'estimated_woba_using_speedangle', 'woba_value', 'woba_denom', 'launch_speed', 'launch_speed_angle', 'plate_x', 'plate_z', 'ax', 'az', 'ay', 'vy0', 'release_pos_y', 'sz_top', 'sz_bot']) {
      if (!(need in col)) throw new Error(`[computeTeamMakeup] Savant CSV is missing column ${need}`)
    }
    for (const r of rows) {
      const ptype = r[col.pitch_type] ?? ''
      if (NOT_A_PITCH.has(ptype)) continue
      const pitchingTeam = r[col.inning_topbot] === 'Top' ? r[col.home_team] : r[col.away_team]
      if (pitchingTeam !== abbrev) continue
      const throws = r[col.p_throws] ?? ''
      const flip = throws === 'R' ? -1 : 1               // arm-side positive for both hands
      const k = (v: string, m: number) => { const x = num(v); return x == null ? null : x * m }
      all.push({
        ptype, pitcher: r[col.pitcher], name: r[col.player_name] ?? '', throws, game: r[col.game_pk],
        ab: Number(r[col.at_bat_number]), pn: Number(r[col.pitch_number]),
        velo: k(r[col.release_speed], 1), hb: k(r[col.pfx_x], 12 * flip), vb: k(r[col.pfx_z], 12),
        rx: k(r[col.release_pos_x], flip), rz: k(r[col.release_pos_z], 1), aa: k(r[col.arm_angle], 1),
        desc: r[col.description] ?? '', zone: k(r[col.zone], 1), events: r[col.events] ?? '',
        xw: k(r[col.estimated_woba_using_speedangle], 1), wv: k(r[col.woba_value], 1), wd: k(r[col.woba_denom], 1),
        ls: k(r[col.launch_speed], 1), lsa: r[col.launch_speed_angle] ?? '',
        px: k(r[col.plate_x], flip), pz: k(r[col.plate_z], 1), ax: k(r[col.ax], flip), az: k(r[col.az], 1),
        ry: k(r[col.release_pos_y], 1), ft: flightSeconds(num(r[col.release_pos_y]), num(r[col.vy0]), num(r[col.ay])),
        szt: k(r[col.sz_top], 1), szb: k(r[col.sz_bot], 1),
      })
    }
  }
  if (all.length === 0) return null                       // never cache or show a fabricated empty club

  // Starter of each game = pitcher of the club's first pitch of that game.
  const first = new Map<string, P>()
  for (const p of all) {
    const f = first.get(p.game)
    if (!f || p.ab < f.ab || (p.ab === f.ab && p.pn < f.pn)) first.set(p.game, p)
  }
  const isSp = (p: P) => first.get(p.game)?.pitcher === p.pitcher

  return {
    teamId, season,
    roles: { all: aggregate(all), sp: aggregate(all.filter(isSp)), rp: aggregate(all.filter(p => !isSp(p))) },
  }
}

/** Seconds from release to the front of the plate: 50 ft -> 17/12 ft with (vy0, ay), plus release -> 50 ft at vy0. */
function flightSeconds(relY: number | null, vy0: number | null, ay: number | null): number | null {
  if (relY == null || vy0 == null || ay == null || vy0 >= 0 || ay <= 0) return null
  const disc = vy0 * vy0 - 2 * ay * (50 - 17 / 12)
  if (disc < 0) return null
  const t50 = (-vy0 - Math.sqrt(disc)) / ay
  return t50 + Math.max(0, relY - 50) / -vy0
}

const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt'])
const SWING = new Set([...WHIFF, 'foul', 'hit_into_play', 'foul_bunt', 'bunt_foul_tip'])
const K_EVENTS = new Set(['strikeout', 'strikeout_double_play'])
const MIN_PA = 100
const pc = (a: number, b: number, min: number) => (b >= min ? rd((100 * a) / b, 1) : null)

function outcomesOf(ps: P[]): Outcomes {
  let swings = 0, whiffs = 0, called = 0, outZone = 0, outSwing = 0, zoned = 0, inZone = 0
  let pa = 0, ks = 0, bbs = 0, xwNum = 0, xwDen = 0, bip = 0, hard = 0, barrels = 0, evSum = 0
  for (const p of ps) {
    const sw = SWING.has(p.desc), wh = WHIFF.has(p.desc)
    if (sw) swings++
    if (wh) whiffs++
    if (p.desc === 'called_strike') called++
    if (p.zone != null) {
      zoned++
      if (p.zone <= 9) inZone++
      else { outZone++; if (sw) outSwing++ }
    }
    if (p.events) {
      pa++
      if (K_EVENTS.has(p.events)) ks++
      if (p.events === 'walk' || p.events === 'intent_walk') bbs++
      if (p.wd === 1) { xwNum += p.xw ?? p.wv ?? 0; xwDen++ }
    }
    if (p.desc === 'hit_into_play' && p.ls != null) {
      bip++; evSum += p.ls
      if (p.ls >= 95) hard++
      if (p.lsa === '6') barrels++
    }
  }
  return {
    whiffPct: pc(whiffs, swings, MIN_N), cswPct: pc(called + whiffs, ps.length, MIN_N), chasePct: pc(outSwing, outZone, MIN_N),
    zonePct: pc(inZone, zoned, MIN_N), kPct: pc(ks, pa, MIN_PA), bbPct: pc(bbs, pa, MIN_PA),
    xwoba: xwDen >= MIN_PA ? rd(xwNum / xwDen, 3) : null,
    hardHitPct: pc(hard, bip, MIN_PA), barrelPct: pc(barrels, bip, MIN_PA), avgEv: bip >= MIN_PA ? rd(evSum / bip, 1) : null,
  }
}

function aggregate(pitches: P[]): RoleMakeup {
  const total = pitches.length
  type M = Record<'velo' | 'hb' | 'vb' | 'rx' | 'rz' | 'aa' | 'px' | 'pz' | 'ax' | 'az' | 'ry' | 'ft', number[]> & { n: number; swings: number; whiffs: number; pitchers: Set<string> }
  const byType = new Map<string, M>()
  const byPitcher = new Map<string, { name: string; throws: string; n: number; aa: number[] }>()
  const allAa: number[] = []
  for (const p of pitches) {
    let m = byType.get(p.ptype)
    if (!m) byType.set(p.ptype, m = { velo: [], hb: [], vb: [], rx: [], rz: [], aa: [], px: [], pz: [], ax: [], az: [], ry: [], ft: [], n: 0, swings: 0, whiffs: 0, pitchers: new Set() })
    m.n++
    if (SWING.has(p.desc)) m.swings++
    if (WHIFF.has(p.desc)) m.whiffs++
    m.pitchers.add(p.pitcher)
    for (const key of ['velo', 'hb', 'vb', 'rx', 'rz', 'aa', 'px', 'pz', 'ax', 'az', 'ry', 'ft'] as const) if (p[key] != null) m[key].push(p[key] as number)
    let q = byPitcher.get(p.pitcher)
    if (!q) byPitcher.set(p.pitcher, q = { name: p.name, throws: p.throws, n: 0, aa: [] })
    q.n++
    if (p.aa != null) { q.aa.push(p.aa); allAa.push(p.aa) }
  }

  let spreadNum = 0, spreadDen = 0
  const rows: PitchRow[] = []
  for (const [ptype, m] of byType) {
    if (m.n < MIN_TYPE_PITCHES) continue
    const sdx = sd(m.rx), sdz = sd(m.rz)
    if (m.n >= MIN_SPREAD_PITCHES && sdx != null && sdz != null) {
      spreadNum += m.n * Math.hypot(sdx, sdz) * 12
      spreadDen += m.n
    }
    rows.push({
      pitchType: ptype, pitches: m.n, usagePct: rd((100 * m.n) / total, 1) as number, nPitchers: m.pitchers.size,
      veloAvg: rd(mean(m.velo)), veloP10: rd(pctl(m.velo, 0.1)), veloP90: rd(pctl(m.velo, 0.9)),
      hBreak: rd(mean(m.hb), 1), vBreak: rd(mean(m.vb), 1), hBreakSd: rd(sd(m.hb), 1), vBreakSd: rd(sd(m.vb), 1),
      relSide: rd(mean(m.rx)), relHeight: rd(mean(m.rz)),
      relSideSdIn: rd(sdx == null ? null : sdx * 12, 1), relHeightSdIn: rd(sdz == null ? null : sdz * 12, 1),
      armAngle: rd(mean(m.aa), 1), armAngleSd: rd(sd(m.aa), 1),
      whiffPct: m.swings >= MIN_N ? rd((100 * m.whiffs) / m.swings, 1) : null,
      plateSide: rd(mean(m.px), 2), plateHeight: rd(mean(m.pz), 2), accSide: rd(mean(m.ax), 1), accVert: rd(mean(m.az), 1),
      relY: rd(mean(m.ry), 2), flightSec: rd(mean(m.ft), 3),
    })
  }
  rows.sort((a, b) => b.pitches - a.pitches)

  const pitcherArms: PitcherArm[] = [...byPitcher.entries()]
    .filter(([, p]) => p.n >= MIN_PITCHER_PITCHES && p.aa.length >= MIN_N)
    .map(([id, p]) => ({ id: Number(id), name: p.name, throws: p.throws, pitches: p.n, armAngle: rd(p.aa.reduce((a, b) => a + b, 0) / p.aa.length, 1) as number }))
    .sort((a, b) => a.armAngle - b.armAngle)

  return {
    pitches: total, rows, pitcherArms,
    armAngleSdPitch: rd(sd(allAa)),
    armAngleLow: pitcherArms[0]?.armAngle ?? null,
    armAngleHigh: pitcherArms[pitcherArms.length - 1]?.armAngle ?? null,
    releaseSpreadIn: spreadDen ? rd(spreadNum / spreadDen) : null,
    outcomes: outcomesOf(pitches),
    szTop: rd(mean(pitches.flatMap(p => (p.szt == null ? [] : [p.szt]))), 2),
    szBot: rd(mean(pitches.flatMap(p => (p.szb == null ? [] : [p.szb]))), 2),
  }
}

/** Cached per club + season. Returns null (and logs) on any upstream failure. */
export async function getTeamMakeup(teamId: number, season: number): Promise<TeamMakeup | null> {
  try {
    return await withSavantCache(`lab:team-makeup:${CACHE_VERSION}:${season}:${teamId}`, TTL_SECONDS, () => computeTeamMakeup(teamId, season))
  } catch (e) {
    console.error('[getTeamMakeup] failed:', teamId, e instanceof Error ? e.message : e)
    return null
  }
}

function ipOf(v: unknown): number {
  const [whole, frac] = String(v).split('.')
  return (parseInt(whole, 10) || 0) + (frac === '1' ? 1 / 3 : frac === '2' ? 2 / 3 : 0)
}
function runsRow(teamId: number, st: Record<string, string | number>): TeamRuns {
  const ip = ipOf(st.inningsPitched)
  const runs = Number(st.runs)
  const era = Number(st.era)
  return { teamId, games: Number(st.gamesPlayed), ip, runsAllowed: runs, ra9: ip ? rd((runs * 9) / ip) : null, era: Number.isFinite(era) ? era : null }
}

/** Runs allowed for all 30 clubs, whole staff + starters + bullpen: two small MLB Stats API calls. */
export async function getTeamRuns(season: number): Promise<Record<number, TeamRunsByRole>> {
  const out: Record<number, TeamRunsByRole> = {}
  const slot = (id: number) => (out[id] ??= { all: null, sp: null, rp: null })
  try {
    const [whole, split] = await Promise.all([
      fetch(`${MLB}/teams/stats?stats=season&group=pitching&season=${season}&sportIds=1&gameType=R`, { next: { revalidate: 1800 } }),
      fetch(`${MLB}/teams/stats?stats=statSplits&sitCodes=sp,rp&group=pitching&season=${season}&sportIds=1&gameType=R&limit=100`, { next: { revalidate: 1800 } }),
    ])
    if (!whole.ok || !split.ok) throw new Error(`HTTP ${whole.status}/${split.status}`)
    type Split = { team: { id: number }; split?: { code?: string }; stat: Record<string, string | number> }
    for (const s of ((await whole.json()).stats?.[0]?.splits ?? []) as Split[]) slot(s.team.id).all = runsRow(s.team.id, s.stat)
    for (const b of ((await split.json()).stats ?? []) as { splits: Split[] }[]) {
      for (const s of b.splits) {
        const code = s.split?.code
        if (code === 'sp' || code === 'rp') slot(s.team.id)[code] = runsRow(s.team.id, s.stat)
      }
    }
  } catch (e) {
    console.error('[getTeamRuns] failed:', e instanceof Error ? e.message : e)
  }
  return out
}
