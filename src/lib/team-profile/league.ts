// src/lib/team-profile/league.ts
//
// League-wide team tables, one row per MLB club, assembled from SIX MLB Stats
// API calls (each returns all 30 teams at once — this is a fixed, tiny
// fan-out, not per-player bursts, so it is safe in the render path with
// fetch revalidation; the Savant CSV rule in CLAUDE.md is about 2 MB files).
// Every field name below was curl-verified against the live response
// (2026-09-20): standings.records[].teamRecords[].records.splitRecords,
// /teams/stats?stats=season|statSplits with sitCodes sp,rp,vl,vr,risp,
// group=hitting|pitching|fielding.
//
// Why a league table at all: the whole team page is about RANK — "5th in
// bullpen ERA" means nothing without the other 29 clubs. Everything that
// gets a rank chip is computed from these rows with one shared helper, so a
// rank can never disagree with the number next to it.
//
// Nothing here is written to a table (read-only), so there is no single-
// writer concern. If page load ever feels slow, this whole module is the
// candidate for a nightly precompute into a `league_team_tables` row.

import { cache } from 'react'
import { MLB_TEAMS } from '@/lib/teams'

const MLB = 'https://statsapi.mlb.com/api/v1'
const REVALIDATE = 1800

// ─── helpers ──────────────────────────────────────────────────────────────

/** MLB returns numbers as strings ('.279', '3.07', '-.--'). Coerce; junk → null. */
export function num(v: unknown): number | null {
  if (v == null || v === '' || v === '-' || v === '-.--' || v === '.---') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** '545.1' (MLB baseball notation: .1 = 1/3) → 545.333 */
export function ipToDecimal(v: unknown): number {
  const s = String(v ?? '0')
  const [whole, frac] = s.split('.')
  return (parseInt(whole, 10) || 0) + (frac === '1' ? 1 / 3 : frac === '2' ? 2 / 3 : 0)
}

async function mlbJson(url: string, tag: string): Promise<any | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) {
      console.error(`[${tag}] MLB API error:`, res.status)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error(`[${tag}]`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── types ────────────────────────────────────────────────────────────────

export type HitLine = {
  g: number; pa: number; ab: number; h: number; r: number; hr: number; bb: number; so: number
  sb: number; cs: number; doubles: number
  avg: number | null; obp: number | null; slg: number | null; ops: number | null
  iso: number | null; kPct: number | null; bbPct: number | null; rPerG: number | null; hrPerG: number | null
}

export type PitLine = {
  g: number; gs: number; ip: number; er: number; bf: number
  era: number | null; whip: number | null; so: number; bb: number; hr: number
  kPct: number | null; bbPct: number | null; k9: number | null; bb9: number | null; hr9: number | null
  fip: number | null
  saves: number; holds: number; blownSaves: number; saveOpps: number
  savePct: number | null
  ipPerGame: number | null
  gbFbRatio: number | null   // groundOuts / airOuts — MLB's "GO/AO"; >1 = ground-ball lean
  pitches: number
}

export type SplitRecord = { w: number; l: number }

export type LeagueTeamRow = {
  id: number; name: string; abbr: string
  st: {
    w: number; l: number; pct: number; gp: number; rs: number; ra: number; diff: number
    streak: string; divRank: number; leagueRank: number; sportRank: number
    gb: string; wcgb: string; divChamp: boolean; clinched: boolean; elim: string; magic: string
    splits: Record<string, SplitRecord>
  }
  hit: HitLine | null
  pit: PitLine | null
  sp: PitLine | null       // starters only
  rp: PitLine | null       // relievers only
  vl: HitLine | null       // offense vs left-handed pitching
  vr: HitLine | null
  risp: HitLine | null     // offense with runners in scoring position
  fld: { errors: number; fpct: number | null; sbAllowed: number; csMade: number; csPct: number | null; pickoffs?: number; wildPitches: number; passedBall: number } | null
}

export type LeagueTables = { season: number; cFIP: number; rows: LeagueTeamRow[] }

// ─── line builders ────────────────────────────────────────────────────────

function hitLine(s: Record<string, unknown> | undefined): HitLine | null {
  if (!s) return null
  const pa = Number(s.plateAppearances ?? 0)
  const ab = Number(s.atBats ?? 0)
  const g = Number(s.gamesPlayed ?? 0)
  const avg = num(s.avg), slg = num(s.slg)
  return {
    g, pa, ab, h: Number(s.hits ?? 0), r: Number(s.runs ?? 0), hr: Number(s.homeRuns ?? 0),
    bb: Number(s.baseOnBalls ?? 0), so: Number(s.strikeOuts ?? 0),
    sb: Number(s.stolenBases ?? 0), cs: Number(s.caughtStealing ?? 0), doubles: Number(s.doubles ?? 0),
    avg, obp: num(s.obp), slg, ops: num(s.ops),
    iso: avg != null && slg != null ? slg - avg : null,
    kPct: pa > 0 ? Number(s.strikeOuts ?? 0) / pa : null,
    bbPct: pa > 0 ? Number(s.baseOnBalls ?? 0) / pa : null,
    rPerG: g > 0 ? Number(s.runs ?? 0) / g : null,
    hrPerG: g > 0 ? Number(s.homeRuns ?? 0) / g : null,
  }
}

function pitLine(s: Record<string, unknown> | undefined, cFIP: number): PitLine | null {
  if (!s) return null
  const ip = ipToDecimal(s.inningsPitched)
  const bf = Number(s.battersFaced ?? 0)
  const so = Number(s.strikeOuts ?? 0), bb = Number(s.baseOnBalls ?? 0), hr = Number(s.homeRuns ?? 0), hbp = Number(s.hitBatsmen ?? 0)
  const saves = Number(s.saves ?? 0), bs = Number(s.blownSaves ?? 0)
  const air = Number(s.airOuts ?? 0), gnd = Number(s.groundOuts ?? 0)
  return {
    g: Number(s.gamesPitched ?? s.gamesPlayed ?? 0), gs: Number(s.gamesStarted ?? 0), ip, er: Number(s.earnedRuns ?? 0), bf,
    era: num(s.era), whip: num(s.whip), so, bb, hr,
    kPct: bf > 0 ? so / bf : null, bbPct: bf > 0 ? bb / bf : null,
    k9: ip > 0 ? (so * 9) / ip : null, bb9: ip > 0 ? (bb * 9) / ip : null, hr9: ip > 0 ? (hr * 9) / ip : null,
    fip: ip > 0 ? (13 * hr + 3 * (bb + hbp) - 2 * so) / ip + cFIP : null,
    saves, holds: Number(s.holds ?? 0), blownSaves: bs, saveOpps: Number(s.saveOpportunities ?? 0),
    savePct: saves + bs > 0 ? saves / (saves + bs) : null,
    ipPerGame: Number(s.gamesPitched ?? s.gamesPlayed ?? 0) > 0 ? ip / Number(s.gamesPitched ?? s.gamesPlayed) : null,
    gbFbRatio: air > 0 ? gnd / air : null,
    pitches: Number(s.numberOfPitches ?? 0),
  }
}

// ─── loader ───────────────────────────────────────────────────────────────

type Split = { team?: { id?: number; name?: string }; stat?: Record<string, unknown>; split?: { code?: string } }
const splitsOf = (json: any): Split[] => json?.stats?.[0]?.splits ?? []

export const getLeagueTables = cache(async (season: number): Promise<LeagueTables | null> => {
  const q = `season=${season}&sportIds=1&limit=100`
  const [standings, hit, pit, pitSplit, hitSplit, fld] = await Promise.all([
    mlbJson(`${MLB}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`, 'getLeagueTables:standings'),
    mlbJson(`${MLB}/teams/stats?stats=season&group=hitting&${q}`, 'getLeagueTables:hitting'),
    mlbJson(`${MLB}/teams/stats?stats=season&group=pitching&${q}`, 'getLeagueTables:pitching'),
    mlbJson(`${MLB}/teams/stats?stats=statSplits&group=pitching&sitCodes=sp,rp&${q}`, 'getLeagueTables:sp-rp'),
    mlbJson(`${MLB}/teams/stats?stats=statSplits&group=hitting&sitCodes=vl,vr,risp&${q}`, 'getLeagueTables:hit-splits'),
    mlbJson(`${MLB}/teams/stats?stats=season&group=fielding&${q}`, 'getLeagueTables:fielding'),
  ])
  if (!standings || !hit || !pit) {
    console.error('[getLeagueTables] missing a required table (standings/hitting/pitching)')
    return null
  }

  // League FIP constant from THIS season's totals (same definition as
  // lib/team-radar.ts: cFIP = lgERA - raw FIP).
  let hr = 0, bb = 0, hbp = 0, so = 0, ip = 0, er = 0
  for (const s of splitsOf(pit)) {
    const st = s.stat ?? {}
    hr += Number(st.homeRuns ?? 0); bb += Number(st.baseOnBalls ?? 0); hbp += Number(st.hitBatsmen ?? 0)
    so += Number(st.strikeOuts ?? 0); ip += ipToDecimal(st.inningsPitched); er += Number(st.earnedRuns ?? 0)
  }
  const cFIP = ip > 0 ? (er * 9) / ip - (13 * hr + 3 * (bb + hbp) - 2 * so) / ip : 3.1

  const byTeam = <T,>(splits: Split[], pick?: (s: Split) => boolean) => {
    const m = new Map<number, Record<string, unknown>>()
    for (const s of splits) if (s.team?.id && (!pick || pick(s))) m.set(s.team.id, s.stat ?? {})
    return m
  }
  const hitM = byTeam(splitsOf(hit)), pitM = byTeam(splitsOf(pit))
  const spM = byTeam(splitsOf(pitSplit), s => s.split?.code === 'sp'), rpM = byTeam(splitsOf(pitSplit), s => s.split?.code === 'rp')
  const vlM = byTeam(splitsOf(hitSplit), s => s.split?.code === 'vl'), vrM = byTeam(splitsOf(hitSplit), s => s.split?.code === 'vr')
  const rispM = byTeam(splitsOf(hitSplit), s => s.split?.code === 'risp')
  const fldM = byTeam(splitsOf(fld))

  const rows: LeagueTeamRow[] = []
  for (const rec of standings.records ?? []) {
    for (const t of rec.teamRecords ?? []) {
      const id: number = t.team?.id
      const meta = MLB_TEAMS.find(x => x.id === id)
      if (!id || !meta) continue
      const splits: Record<string, SplitRecord> = {}
      for (const sr of t.records?.splitRecords ?? []) splits[sr.type] = { w: Number(sr.wins), l: Number(sr.losses) }
      const f = fldM.get(id)
      rows.push({
        id, name: meta.name, abbr: meta.abbrev,
        st: {
          w: Number(t.wins), l: Number(t.losses), pct: Number(t.winningPercentage), gp: Number(t.gamesPlayed),
          rs: Number(t.runsScored), ra: Number(t.runsAllowed), diff: Number(t.runDifferential),
          streak: t.streak?.streakCode ?? '', divRank: Number(t.divisionRank), leagueRank: Number(t.leagueRank), sportRank: Number(t.sportRank),
          gb: String(t.gamesBack ?? '-'), wcgb: String(t.wildCardGamesBack ?? '-'),
          divChamp: !!t.divisionChamp, clinched: !!t.clinched, elim: String(t.eliminationNumber ?? '-'), magic: String(t.magicNumber ?? '-'),
          splits,
        },
        hit: hitLine(hitM.get(id)), pit: pitLine(pitM.get(id), cFIP),
        sp: pitLine(spM.get(id), cFIP), rp: pitLine(rpM.get(id), cFIP),
        vl: hitLine(vlM.get(id)), vr: hitLine(vrM.get(id)), risp: hitLine(rispM.get(id)),
        fld: f ? {
          errors: Number(f.errors ?? 0), fpct: num(f.fielding), sbAllowed: Number(f.stolenBases ?? 0), csMade: Number(f.caughtStealing ?? 0),
          csPct: num(f.caughtStealingPercentage), wildPitches: Number(f.wildPitches ?? 0), passedBall: Number(f.passedBall ?? 0),
        } : null,
      })
    }
  }
  if (rows.length === 0) return null
  return { season, cFIP, rows }
})

// ─── ranking ──────────────────────────────────────────────────────────────

export type Metric = {
  key: string
  label: string
  value: number | null
  display: string
  rank: number | null      // 1 = best in MLB
  of: number
  leagueAvg: number | null
  leagueDisplay: string
  higherIsBetter: boolean
  /** every club's value, ascending — powers the Pro distribution strips (30 small numbers) */
  dist: number[]
}

type MetricDef = { key: string; label: string; higherIsBetter: boolean; fmt: (v: number) => string }

/** Rank `teamId` inside an arbitrary {id, value} list (null values are excluded, never guessed). */
export function metricFromValues(all: { id: number; v: number | null }[], teamId: number, def: MetricDef): Metric {
  const vals = all.filter((x): x is { id: number; v: number } => x.v != null)
  const mine = vals.find(x => x.id === teamId)?.v ?? null
  const better = mine == null ? null : vals.filter(x => (def.higherIsBetter ? x.v > mine : x.v < mine)).length + 1
  const avg = vals.length > 0 ? vals.reduce((a, x) => a + x.v, 0) / vals.length : null
  return {
    key: def.key, label: def.label, value: mine, display: mine == null ? '—' : def.fmt(mine),
    rank: better, of: vals.length, leagueAvg: avg, leagueDisplay: avg == null ? '—' : def.fmt(avg),
    higherIsBetter: def.higherIsBetter,
    dist: vals.map(x => x.v).sort((a, b) => a - b),
  }
}

/** Metric for `teamId` from the league table; `get` pulls the value off a row. */
export function metric(tables: LeagueTables, teamId: number, def: MetricDef & { get: (r: LeagueTeamRow) => number | null }): Metric {
  return metricFromValues(tables.rows.map(r => ({ id: r.id, v: def.get(r) })), teamId, def)
}

export const fmt = {
  rate3: (v: number) => v.toFixed(3).replace(/^0/, ''),
  dec2: (v: number) => v.toFixed(2),
  dec1: (v: number) => v.toFixed(1),
  pct1: (v: number) => `${(v * 100).toFixed(1)}%`,
  int: (v: number) => String(Math.round(v)),
  signed: (v: number) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v))),
}

export { ordinal } from '@/lib/ordinal'
