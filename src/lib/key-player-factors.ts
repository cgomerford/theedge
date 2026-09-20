/**
 * src/lib/key-player-factors.ts
 *
 * The "5 things that mean the matchup favours him" engine behind Top 3 Key
 * Players. Zone fit + pitch-type fit (series-matchup.ts) answer "where and
 * on which pitch"; this file adds every other real signal the model should
 * weigh, each computed from data we already store or can fetch cheaply:
 *
 *   BATTER  — hot zone vs pitcher's location · pitch-type fit vs arsenal ·
 *             career H2H · recent form · platoon split · day/night split ·
 *             spray tendency vs the weakest OAA defender on his pull side ·
 *             pitcher's control / contact weakness · park
 *   PITCHER — his best pitch vs this lineup · zone fit vs lineup · whiff/K
 *             percentile · control (BB%) · GB% with the OAA of the defense
 *             behind him · lineup handedness vs his platoon splits ·
 *             day/night split · last-3-starts form · home/away · park
 *
 * Every builder returns null (or omits the factor) when the data isn't there
 * or the signal isn't strong enough to mention — empty over fabricated.
 * Factors can point either way (`direction`): a "for" factor favours the
 * key player, an "against" factor is a genuine headwind. The card shows the
 * top five "for" factors; "against" factors only backfill a card whose read
 * is thin so a tough-matchup pick is still explained honestly.
 *
 * Nothing here renders raw internal scores. `strength` (0..1) is used only
 * to rank factors and to nudge the series ranking (see contextScore).
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { LG_BA } from '@/lib/pitcher-arsenal'
import { getPitcherRecentStarts } from '@/lib/mlb'
import { fetchHittingSplit, fetchPitchingSplit } from '@/lib/player-splits'
import { computePullProfile, type BatterSpray } from '@/lib/batter-spray'
import { estimateGameScore } from '@/lib/key-player-rating'
import { getZoneLabel, type RecentFormContext } from '@/lib/key-players-narrative'
import type { Top3Batter, Top3BatterPitcherLine } from '@/lib/series-matchup'
import type { Top3Pitcher } from '@/lib/pitcher-series-edge'
import type { LineupBatter, PlayerHands } from '@/lib/lineups'
import type { FielderOaa } from '@/lib/batter-fielding'
import type { ParkFactor } from '@/lib/parks'

// ─── Types ──────────────────────────────────────────────────────────────

export type FactorPitchRow = {
  name: string
  usage: number | null
  ba: number | null
  n: number
  lowSample: boolean
  putAway: boolean
  edge: 'good' | 'bad' | 'even' | null   // from the KEY PLAYER's point of view
}

export type FactorFielder = { pos: string; name: string; oaa: number | null; flag: boolean }

export type FactorVisual =
  | { kind: 'spark'; values: number[]; caption: string; goodAbove: number }
  | { kind: 'split'; rows: { label: string; value: number; display: string; active: boolean }[]; scale: [number, number]; lowerIsBetter: boolean }
  | { kind: 'meter'; rows: { label: string; pct: number; display: string; tone: 'good' | 'bad' | 'mid' }[] }
  | { kind: 'zone'; zone: string; tone: 'edge' | 'tough' }
  | { kind: 'pitches'; rows: FactorPitchRow[]; baLabel: string; nUnit: string }
  | { kind: 'field'; wedge: 'left' | 'right' | null; fielders: FactorFielder[] }
  | { kind: 'stat'; big: string; sub: string; tone: 'edge' | 'tough' }

export type FactorId =
  | 'zone' | 'pitch_fit' | 'h2h' | 'trend' | 'platoon' | 'daynight' | 'spray_defense' | 'control' | 'park'
  | 'lineup_fit' | 'lineup_zone' | 'whiff' | 'walks' | 'groundball_defense' | 'lineup_hands' | 'form' | 'home_away'

export type MatchupFactor = {
  id: FactorId
  direction: 'for' | 'against'
  title: string
  stat: string             // the headline number, e.g. ".312 vs Slider"
  detail: string           // one plain-language sentence explaining it
  strength: number         // 0..1 — ranks factors + feeds contextScore; never rendered raw
  visual: FactorVisual | null
}

export type PitcherProfile = {
  id: number
  era: number | null
  gbRate: number | null
  kPct: number | null
  bbPct: number | null
  whiffPct: number | null
  chaseRate: number | null
  vsLhbBaa: number | null
  vsRhbBaa: number | null
  l3Era: number | null
  l3Innings: number | null
  homeEra: number | null
  awayEra: number | null
  starts: number | null
  // League percentile in "good for the pitcher" terms (higher = better).
  good: { whiff: number | null; k: number | null; bb: number | null; chase: number | null }
}

export type FactorContext = {
  season: number
  dayNight: 'day' | 'night' | null
  park: ParkFactor | null
  formByPlayerId: Record<string, RecentFormContext>
  oaa: Record<string, FielderOaa>
  hands: Map<number, PlayerHands>
  spray: Map<number, BatterSpray>
  pitcherProfiles: Map<number, PitcherProfile>
}

// ─── Formatting helpers ─────────────────────────────────────────────────

const fmt3 = (n: number) => n.toFixed(3).replace(/^0/, '')
const fmtOps = (n: number) => (n >= 1 ? n.toFixed(3) : fmt3(n))
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const lower = (s: string) => s.toLowerCase()
function ordinal(n: number): string {
  const v = Math.round(n)
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] ?? s[m] ?? s[0]}`
}
function surname(full: string): string {
  const parts = full.trim().split(/\s+/)
  return parts[parts.length - 1] ?? full
}
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

// ─── Pitcher profiles (one league query, percentiles computed in-memory) ─

type PoolRow = Record<string, number | null>

const PITCHER_COLS =
  'player_id, innings_pitched, starts, era, gb_rate, k_pct, bb_pct, whiff_pct, chase_rate, vs_lhb_baa, vs_rhb_baa, l3_era, l3_innings, home_era, away_era'

const getPitcherPool = cache(async (season: number): Promise<PoolRow[]> => {
  const { data, error } = await createAdminClient()
    .from('pitcher_stats')
    .select(PITCHER_COLS)
    .eq('season', season)
    .gte('innings_pitched', 40)
  if (error) console.error('key-player-factors: pitcher pool query failed', error.message)
  return (data ?? []) as PoolRow[]
})

function pctRank(pool: number[], v: number): number {
  if (pool.length === 0) return 50
  const below = pool.filter((x) => x < v).length
  const equal = pool.filter((x) => x === v).length
  return Math.round(((below + equal / 2) / pool.length) * 100)
}

export async function getPitcherProfiles(ids: number[], season: number): Promise<Map<number, PitcherProfile>> {
  const out = new Map<number, PitcherProfile>()
  const wanted = Array.from(new Set(ids.filter(Boolean)))
  if (wanted.length === 0) return out

  const pool = await getPitcherPool(season)
  const col = (k: string) => pool.map((r) => num(r[k])).filter((v): v is number => v != null)
  const pools = { whiff: col('whiff_pct'), k: col('k_pct'), bb: col('bb_pct'), chase: col('chase_rate') }

  const rows = new Map<number, PoolRow>(pool.map((r) => [Number(r.player_id), r]))
  const missing = wanted.filter((id) => !rows.has(id))
  if (missing.length > 0) {
    const { data } = await createAdminClient()
      .from('pitcher_stats').select(PITCHER_COLS).eq('season', season).in('player_id', missing)
    for (const r of (data ?? []) as PoolRow[]) rows.set(Number(r.player_id), r)
  }

  for (const id of wanted) {
    const r = rows.get(id)
    if (!r) continue
    const whiff = num(r.whiff_pct), k = num(r.k_pct), bb = num(r.bb_pct), chase = num(r.chase_rate)
    out.set(id, {
      id,
      era: num(r.era),
      gbRate: num(r.gb_rate),
      kPct: k,
      bbPct: bb,
      whiffPct: whiff,
      chaseRate: chase,
      vsLhbBaa: num(r.vs_lhb_baa),
      vsRhbBaa: num(r.vs_rhb_baa),
      l3Era: num(r.l3_era),
      l3Innings: num(r.l3_innings),
      homeEra: num(r.home_era),
      awayEra: num(r.away_era),
      starts: num(r.starts),
      good: {
        whiff: whiff != null ? pctRank(pools.whiff, whiff) : null,
        k: k != null ? pctRank(pools.k, k) : null,
        bb: bb != null ? 100 - pctRank(pools.bb, bb) : null,   // lower walk rate is better
        chase: chase != null ? pctRank(pools.chase, chase) : null,
      },
    })
  }
  return out
}

// ─── Shared factor builders ─────────────────────────────────────────────

function parkFactorFor(park: ParkFactor | null, side: 'L' | 'R' | null): number | null {
  if (!park) return null
  const f = side === 'L' ? park.hr_factor_lhb : side === 'R' ? park.hr_factor_rhb : park.hr_factor
  return f ?? park.hr_factor ?? null
}

function lookupOaa(ctx: FactorContext, d: LineupBatter): number | null {
  const o = ctx.oaa[String(d.player_id)]
  return o ? o.outsAboveAverage : null
}

const INFIELD = ['1B', '2B', '3B', 'SS']
const OUTFIELD = ['LF', 'CF', 'RF']

function fieldersFrom(ctx: FactorContext, defenders: LineupBatter[], flagged: (pos: string) => boolean): FactorFielder[] {
  return defenders
    .filter((d) => INFIELD.includes(d.position) || OUTFIELD.includes(d.position))
    .map((d) => ({ pos: d.position, name: surname(d.player_name), oaa: lookupOaa(ctx, d), flag: flagged(d.position) }))
}

// ─── BATTER factors ─────────────────────────────────────────────────────

function bestLineFor(b: Top3Batter): Top3BatterPitcherLine | null {
  return [...b.per_pitcher].sort(
    (x, y) => (y.zone_score + y.pitch_type_fit_score) - (x.zone_score + x.pitch_type_fit_score),
  )[0] ?? null
}

function batterZoneFactor(b: Top3Batter, line: Top3BatterPitcherLine): MatchupFactor | null {
  const sorted = [...line.zone_fit].sort((a, c) => c.tilt - a.tilt)
  const top = sorted[0]
  const bottom = sorted[sorted.length - 1]
  if (top && top.tilt >= 0.1) {
    const label = getZoneLabel(top.zone, b.bat_side)
    const xw = top.batter_xwoba
    return {
      id: 'zone', direction: 'for', title: 'Hot zone lines up',
      stat: xw != null ? `${fmt3(xw)} xwOBA ${label}` : `${label} zone`,
      detail: `${surname(b.player_name)}'s ${label} zone${xw != null ? ` (${fmt3(xw)} xwOBA)` : ''} is where ${line.pitcher_name} works ${top.pitcher_usage_pct ?? 0}% of the time.`,
      strength: clamp01(top.tilt / 0.5),
      visual: { kind: 'zone', zone: top.zone, tone: 'edge' },
    }
  }
  if (bottom && bottom.tilt <= -0.25) {
    const label = getZoneLabel(bottom.zone, b.bat_side)
    return {
      id: 'zone', direction: 'against', title: 'Cold zone in his sights',
      stat: `${label} is a soft spot`,
      detail: `${line.pitcher_name} lives in the ${label} zone (${bottom.pitcher_usage_pct ?? 0}% of his pitches) — where ${surname(b.player_name)} is weakest.`,
      strength: clamp01(-bottom.tilt / 0.5),
      visual: { kind: 'zone', zone: bottom.zone, tone: 'tough' },
    }
  }
  return null
}

function batterPitchFitFactor(b: Top3Batter, line: Top3BatterPitcherLine): MatchupFactor | null {
  const lines = line.pitch_type_fit
  if (lines.length === 0) return null
  const valid = lines.filter((p) => !p.velocity_matched_low_sample && p.velocity_matched_ba != null && (p.pitcher_usage_pct ?? 0) >= 8)
  if (valid.length === 0) return null

  const edge = (p: (typeof valid)[number]) => (p.velocity_matched_ba as number) - LG_BA
  const best = [...valid].sort((a, c) => edge(c) - edge(a))[0]
  const worst = [...valid].sort((a, c) => edge(a) - edge(c))[0]

  const rows: FactorPitchRow[] = [...lines]
    .sort((a, c) => (c.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))
    .slice(0, 5)
    .map((p) => {
      const ok = !p.velocity_matched_low_sample && p.velocity_matched_ba != null
      const e = ok ? (p.velocity_matched_ba as number) - LG_BA : 0
      return {
        name: p.pitch_name, usage: p.pitcher_usage_pct,
        ba: ok ? p.velocity_matched_ba : null, n: p.velocity_matched_ab,
        lowSample: !ok, putAway: p.is_put_away_pitch,
        edge: !ok ? null : e >= 0.03 ? 'good' : e <= -0.03 ? 'bad' : 'even',
      }
    })
  const visual: FactorVisual = { kind: 'pitches', rows, baLabel: 'His BA at that velo', nUnit: 'AB' }
  const name = surname(b.player_name)

  if (edge(best) >= 0.035) {
    const p = best
    return {
      id: 'pitch_fit', direction: 'for', title: 'Handles his arsenal',
      stat: `${fmt3(p.velocity_matched_ba as number)} vs ${p.pitch_name}`,
      detail: `${name} is hitting ${fmt3(p.velocity_matched_ba as number)} (${p.velocity_matched_ab} AB) against ${lower(p.pitch_name)}s at ${p.pitcher_avg_velo != null ? `${p.pitcher_avg_velo.toFixed(0)}mph` : "the speed he throws it"} — ${line.pitcher_name} uses it ${Math.round(p.pitcher_usage_pct ?? 0)}% of the time${p.is_put_away_pitch ? " and it's his put-away pitch" : ''}.`,
      strength: clamp01(edge(p) / 0.12 + (p.is_put_away_pitch ? 0.15 : 0)),
      visual,
    }
  }
  if (edge(worst) <= -0.05) {
    const p = worst
    return {
      id: 'pitch_fit', direction: 'against', title: 'Struggles with a key pitch',
      stat: `${fmt3(p.velocity_matched_ba as number)} vs ${p.pitch_name}`,
      detail: `${name} is hitting just ${fmt3(p.velocity_matched_ba as number)} (${p.velocity_matched_ab} AB) against ${lower(p.pitch_name)}s at that speed — and ${line.pitcher_name} throws it ${Math.round(p.pitcher_usage_pct ?? 0)}% of the time.`,
      strength: clamp01(-edge(p) / 0.12),
      visual,
    }
  }
  return null
}

function batterH2hFactor(b: Top3Batter, line: Top3BatterPitcherLine): MatchupFactor | null {
  const h = line.h2h
  if (!h || h.ab < 8) return null
  const ops = parseFloat(h.ops)
  if (!Number.isFinite(ops)) return null
  const rec = `${h.hits}-for-${h.ab}${h.home_runs > 0 ? `, ${h.home_runs} HR` : ''}`
  if (ops >= 0.85) {
    return {
      id: 'h2h', direction: 'for', title: 'Owns this pitcher',
      stat: rec,
      detail: `Career vs ${line.pitcher_name}: ${rec}, ${fmtOps(ops)} OPS across ${h.ab} at-bats.`,
      strength: clamp01((ops - 0.75) / 0.5),
      visual: { kind: 'stat', big: fmtOps(ops), sub: `career OPS in ${h.ab} AB`, tone: 'edge' },
    }
  }
  if (ops <= 0.55 && h.ab >= 10) {
    return {
      id: 'h2h', direction: 'against', title: 'Pitcher has his number',
      stat: rec,
      detail: `Career vs ${line.pitcher_name}: ${rec}, ${fmtOps(ops)} OPS across ${h.ab} at-bats.`,
      strength: clamp01((0.7 - ops) / 0.4),
      visual: { kind: 'stat', big: fmtOps(ops), sub: `career OPS in ${h.ab} AB`, tone: 'tough' },
    }
  }
  return null
}

function batterTrendFactor(b: Top3Batter, ctx: FactorContext): MatchupFactor | null {
  const form = ctx.formByPlayerId[String(b.player_id)]
  if (!form) return null
  const heating = form.signal === 'heating'
  const trend = form.trend && form.trend.length >= 4 ? form.trend : null
  let ctxLine = ''
  if (trend) {
    const good = trend.filter((v) => v >= 0.8).length
    const bad = trend.filter((v) => v <= 0.55).length
    ctxLine = heating ? ` ${good} of his last ${trend.length} games were .800+ OPS.` : ` ${bad} of his last ${trend.length} games were .550 or below.`
  }
  return {
    id: 'trend', direction: heating ? 'for' : 'against',
    title: heating ? 'Heating up' : 'Cooling off',
    stat: form.metric,
    detail: `${surname(b.player_name)} is ${heating ? 'trending up' : 'in a slump'} — ${form.metric}.${ctxLine}`,
    strength: 0.55,
    visual: trend ? { kind: 'spark', values: trend, caption: 'OPS, last games', goodAbove: 0.8 } : null,
  }
}

async function batterSplitFactors(b: Top3Batter, line: Top3BatterPitcherLine, ctx: FactorContext): Promise<MatchupFactor[]> {
  const out: MatchupFactor[] = []
  const throws = ctx.hands.get(line.pitcher_id)?.throws ?? null
  const name = surname(b.player_name)

  const [vl, vr, day, night] = await Promise.all([
    throws && !b.switch_hitter ? fetchHittingSplit(b.player_id, ctx.season, 'vl') : Promise.resolve(null),
    throws && !b.switch_hitter ? fetchHittingSplit(b.player_id, ctx.season, 'vr') : Promise.resolve(null),
    ctx.dayNight ? fetchHittingSplit(b.player_id, ctx.season, 'd') : Promise.resolve(null),
    ctx.dayNight ? fetchHittingSplit(b.player_id, ctx.season, 'n') : Promise.resolve(null),
  ])

  const read = (s: Record<string, unknown> | null) => (s ? { ops: num(s.ops), pa: num(s.plateAppearances) ?? 0 } : null)

  // Platoon — how he hits this pitcher's hand vs the other.
  const L = read(vl), R = read(vr)
  if (throws && L?.ops != null && R?.ops != null) {
    const today = throws === 'L' ? L : R
    const other = throws === 'L' ? R : L
    const diff = (today.ops as number) - (other.ops as number)
    if (today.pa >= 50) {
      const rows = [
        { label: 'vs LHP', value: L.ops, display: fmtOps(L.ops), active: throws === 'L' },
        { label: 'vs RHP', value: R.ops, display: fmtOps(R.ops), active: throws === 'R' },
      ]
      const visual: FactorVisual = { kind: 'split', rows, scale: [0.5, 1.1], lowerIsBetter: false }
      const t = today.ops as number
      if ((t >= 0.79 && diff >= 0.05) || t >= 0.85) {
        out.push({
          id: 'platoon', direction: 'for', title: `Mashes ${throws === 'L' ? 'lefties' : 'righties'}`,
          stat: `${fmtOps(t)} OPS vs ${throws}HP`,
          detail: `${line.pitcher_name} throws ${throws === 'L' ? 'left' : 'right'}-handed, and ${name} owns a ${fmtOps(t)} OPS against ${throws}HP this season (${today.pa} PA)${diff >= 0.05 ? ` vs ${fmtOps(other.ops as number)} against the other side` : ''}.`,
          strength: clamp01((t - 0.72) / 0.25), visual,
        })
      } else if (t <= 0.64 && diff <= -0.07) {
        out.push({
          id: 'platoon', direction: 'against', title: `Struggles vs ${throws === 'L' ? 'lefties' : 'righties'}`,
          stat: `${fmtOps(t)} OPS vs ${throws}HP`,
          detail: `${name} has just a ${fmtOps(t)} OPS against ${throws}-handed pitching this season (${today.pa} PA), and ${line.pitcher_name} throws ${throws === 'L' ? 'left' : 'right'}.`,
          strength: clamp01((0.72 - t) / 0.25), visual,
        })
      }
    }
  }

  // Day / night.
  const D = read(day), N = read(night)
  if (ctx.dayNight && D?.ops != null && N?.ops != null) {
    const today = ctx.dayNight === 'day' ? D : N
    const other = ctx.dayNight === 'day' ? N : D
    const diff = (today.ops as number) - (other.ops as number)
    if (today.pa >= 60 && other.pa >= 30) {
      const rows = [
        { label: 'Day', value: D.ops, display: fmtOps(D.ops), active: ctx.dayNight === 'day' },
        { label: 'Night', value: N.ops, display: fmtOps(N.ops), active: ctx.dayNight === 'night' },
      ]
      const visual: FactorVisual = { kind: 'split', rows, scale: [0.5, 1.1], lowerIsBetter: false }
      const t = today.ops as number
      if (t >= 0.76 && diff >= 0.06) {
        out.push({
          id: 'daynight', direction: 'for', title: `Better in ${ctx.dayNight} games`,
          stat: `${fmtOps(t)} OPS ${ctx.dayNight === 'day' ? 'by day' : 'at night'}`,
          detail: `This is a ${ctx.dayNight} game, and ${name} hits ${fmtOps(t)} OPS in those (${today.pa} PA) vs ${fmtOps(other.ops as number)} in ${ctx.dayNight === 'day' ? 'night' : 'day'} games.`,
          strength: clamp01(diff / 0.2), visual,
        })
      } else if (t <= 0.66 && diff <= -0.06) {
        out.push({
          id: 'daynight', direction: 'against', title: `Weaker in ${ctx.dayNight} games`,
          stat: `${fmtOps(t)} OPS ${ctx.dayNight === 'day' ? 'by day' : 'at night'}`,
          detail: `${name} hits just ${fmtOps(t)} OPS in ${ctx.dayNight} games (${today.pa} PA) vs ${fmtOps(other.ops as number)} in ${ctx.dayNight === 'day' ? 'night' : 'day'} games.`,
          strength: clamp01(-diff / 0.2), visual,
        })
      }
    }
  }
  return out
}

function batterSprayDefenseFactor(
  b: Top3Batter, line: Top3BatterPitcherLine, ctx: FactorContext, defenders: LineupBatter[],
): MatchupFactor | null {
  const side = b.bat_side
  const spray = ctx.spray.get(b.player_id)
  if (!spray || (side !== 'L' && side !== 'R')) return null
  const profile = computePullProfile(spray.plays, side, ctx.hands.get(line.pitcher_id)?.throws ?? null)
  if (!profile) return null

  const pair = side === 'R' ? ['3B', 'SS'] : ['1B', '2B']
  const outfielder = side === 'R' ? 'LF' : 'RF'
  const wedge: 'left' | 'right' = side === 'R' ? 'left' : 'right'
  const name = surname(b.player_name)

  const withOaa = (positions: string[]) =>
    defenders
      .filter((d) => positions.includes(d.position))
      .map((d) => ({ d, oaa: lookupOaa(ctx, d) }))
      .filter((x): x is { d: LineupBatter; oaa: number } => x.oaa != null)

  const infield = withOaa(pair).sort((x, y) => x.oaa - y.oaa)
  const outfield = withOaa([outfielder])

  type Cand = { kind: 'gb' | 'air'; target: { d: LineupBatter; oaa: number }; pulled: number; strength: number; dir: 'for' | 'against' }
  const cands: Cand[] = []
  if (profile.gbCount >= 25 && profile.pulledGbPct >= 45 && infield.length > 0) {
    const worst = infield[0], best = infield[infield.length - 1]
    if (worst.oaa <= -3) cands.push({ kind: 'gb', target: worst, pulled: profile.pulledGbPct, dir: 'for', strength: clamp01(-worst.oaa / 12) * clamp01(profile.pulledGbPct / 65) })
    else if (best.oaa >= 5 && infield.every((x) => x.oaa >= 2)) cands.push({ kind: 'gb', target: best, pulled: profile.pulledGbPct, dir: 'against', strength: clamp01(best.oaa / 12) * clamp01(profile.pulledGbPct / 65) })
  }
  if (profile.airCount >= 30 && profile.pulledAirPct >= 38 && outfield.length > 0 && outfield[0].oaa <= -3) {
    cands.push({ kind: 'air', target: outfield[0], pulled: profile.pulledAirPct, dir: 'for', strength: clamp01(-outfield[0].oaa / 10) * clamp01(profile.pulledAirPct / 60) })
  }
  if (cands.length === 0) return null

  const c = cands.sort((x, y) => (x.dir === y.dir ? y.strength - x.strength : x.dir === 'for' ? -1 : 1))[0]
  const t = c.target.d
  const oaaTxt = `${c.target.oaa > 0 ? '+' : ''}${c.target.oaa} OAA`
  const fielders = fieldersFrom(ctx, defenders, (pos) => pos === t.position)
  const where = c.kind === 'gb' ? `${pair[0]}/${pair[1]} side` : `${outfielder} side`
  const what = c.kind === 'gb' ? 'ground balls' : 'fly balls and liners'

  if (c.dir === 'for') {
    return {
      id: 'spray_defense', direction: 'for', title: 'Pulls into a weak defender',
      stat: `${t.position} ${surname(t.player_name)} ${oaaTxt}`,
      detail: `${name} pulls ${c.pulled}% of his ${what} toward the ${where} — where ${surname(t.player_name)} (${t.position}) rates ${oaaTxt}, well below average.`,
      strength: c.strength, visual: { kind: 'field', wedge, fielders },
    }
  }
  return {
    id: 'spray_defense', direction: 'against', title: 'Pulls into a strong glove',
    stat: `${t.position} ${surname(t.player_name)} ${oaaTxt}`,
    detail: `${name} pulls ${c.pulled}% of his ${what} toward the ${where}, where ${surname(t.player_name)} (${t.position}) rates ${oaaTxt}.`,
    strength: c.strength, visual: { kind: 'field', wedge, fielders },
  }
}

function batterVsPitcherWeaknessFactor(b: Top3Batter, line: Top3BatterPitcherLine, ctx: FactorContext): MatchupFactor | null {
  const p = ctx.pitcherProfiles.get(line.pitcher_id)
  if (!p) return null
  const rows: { label: string; pct: number; display: string; tone: 'good' | 'bad' | 'mid' }[] = []
  // From the batter's point of view a LOW pitcher percentile is good news.
  const add = (label: string, pct: number | null, display: string) => {
    if (pct == null) return
    rows.push({ label, pct, display, tone: pct <= 30 ? 'good' : pct >= 70 ? 'bad' : 'mid' })
  }
  add('Whiff%', p.good.whiff, p.whiffPct != null ? `${p.whiffPct.toFixed(1)}%` : '—')
  add('Control', p.good.bb, p.bbPct != null ? `${p.bbPct.toFixed(1)}% BB` : '—')

  const poorControl = p.good.bb != null && p.good.bb <= 30
  const fewMisses = p.good.whiff != null && p.good.whiff <= 30
  if (!poorControl && !fewMisses) return null

  const parts: string[] = []
  if (poorControl) parts.push(`walks ${p.bbPct?.toFixed(1)}% of hitters (${ordinal(100 - (p.good.bb as number))} percentile — a free-pass risk)`)
  if (fewMisses) parts.push(`misses bats just ${p.whiffPct?.toFixed(1)}% of the time (${ordinal(p.good.whiff as number)} percentile)`)
  return {
    id: 'control', direction: 'for', title: poorControl && fewMisses ? 'Hittable, wild starter' : poorControl ? 'Starter puts people on' : 'Starter is hittable',
    stat: poorControl ? `${p.bbPct?.toFixed(1)}% BB rate` : `${p.whiffPct?.toFixed(1)}% whiff`,
    detail: `${line.pitcher_name} ${parts.join(' and ')}.`,
    strength: clamp01((50 - Math.min(p.good.bb ?? 50, p.good.whiff ?? 50)) / 45),
    visual: { kind: 'meter', rows },
  }
}

function parkFactorFactor(side: 'L' | 'R' | null, ctx: FactorContext, subject: 'batter' | 'pitcher'): MatchupFactor | null {
  const f = parkFactorFor(ctx.park, side)
  if (f == null || !ctx.park) return null
  const pct = Math.round(Math.abs(f - 1) * 100)
  const hitterPark = f >= 1.08, pitcherPark = f <= 0.92
  if (!hitterPark && !pitcherPark) return null
  const forSubject = subject === 'batter' ? hitterPark : pitcherPark
  const sideWord = side === 'L' ? 'left-handed ' : side === 'R' ? 'right-handed ' : ''
  return {
    id: 'park', direction: forSubject ? 'for' : 'against',
    title: hitterPark ? 'Hitter-friendly park' : 'Pitcher-friendly park',
    stat: `${hitterPark ? '+' : '−'}${pct}% HR`,
    detail: `${ctx.park.venue_name} ${hitterPark ? 'boosts' : 'suppresses'} home runs for ${sideWord}hitters by about ${pct}% this season.`,
    strength: clamp01(pct / 25),
    visual: { kind: 'stat', big: `${hitterPark ? '+' : '−'}${pct}%`, sub: `HR factor · ${ctx.park.venue_name}`, tone: forSubject ? 'edge' : 'tough' },
  }
}

export async function buildBatterFactors(
  b: Top3Batter, ctx: FactorContext, defenders: LineupBatter[],
): Promise<MatchupFactor[]> {
  const line = bestLineFor(b)
  if (!line) return []
  const splits = await batterSplitFactors(b, line, ctx)
  const all = [
    batterZoneFactor(b, line),
    batterPitchFitFactor(b, line),
    batterH2hFactor(b, line),
    batterTrendFactor(b, ctx),
    ...splits,
    batterSprayDefenseFactor(b, line, ctx, defenders),
    batterVsPitcherWeaknessFactor(b, line, ctx),
    parkFactorFactor(b.bat_side === 'L' || b.bat_side === 'R' ? b.bat_side : null, ctx, 'batter'),
  ].filter((f): f is MatchupFactor => !!f)
  return selectFactors(all)
}

// ─── PITCHER factors ────────────────────────────────────────────────────

function lineupHandCounts(hitters: { bat_side?: string | null; switch_hitter?: boolean }[], throws: 'L' | 'R' | null) {
  let left = 0, right = 0
  for (const h of hitters) {
    if (h.bat_side === 'L') left++
    else if (h.bat_side === 'R') right++
    else if (h.switch_hitter && throws) {
      if (throws === 'R') left++
      else right++
    }   // switch hitters bat from the platoon-advantaged side
  }
  return { left, right }
}

function pitcherLineupFitFactor(p: Top3Pitcher): MatchupFactor | null {
  const batters = p.per_batter
  if (batters.length < 5) return null
  const arsenal = batters[0].pitch_type_fit
  if (arsenal.length === 0) return null

  type Agg = { name: string; usage: number | null; putAway: boolean; bas: number[] }
  const byPitch = new Map<string, Agg>()
  for (const a of arsenal) byPitch.set(a.pitch_type, { name: a.pitch_name, usage: a.pitcher_usage_pct, putAway: a.is_put_away_pitch, bas: [] })
  for (const b of batters) {
    for (const l of b.pitch_type_fit) {
      if (l.velocity_matched_low_sample || l.velocity_matched_ba == null) continue
      byPitch.get(l.pitch_type)?.bas.push(l.velocity_matched_ba)
    }
  }
  const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

  const rows: FactorPitchRow[] = [...byPitch.values()]
    .sort((a, c) => (c.usage ?? 0) - (a.usage ?? 0)).slice(0, 5)
    .map((a) => {
      const ok = a.bas.length >= 3
      const ba = ok ? avg(a.bas) : null
      const e = ba != null ? ba - LG_BA : 0
      return {
        name: a.name, usage: a.usage, ba: ba != null ? Math.round(ba * 1000) / 1000 : null,
        n: a.bas.length, lowSample: !ok, putAway: a.putAway,
        edge: ba == null ? null : e <= -0.03 ? 'good' : e >= 0.03 ? 'bad' : 'even',
      }
    })
  const visual: FactorVisual = { kind: 'pitches', rows, baLabel: 'Lineup BA at that velo', nUnit: 'hitters' }

  const eligible = [...byPitch.values()].filter((a) => a.bas.length >= 4 && (a.usage ?? 0) >= 10)
  if (eligible.length === 0) return null
  const best = [...eligible].sort((a, c) => avg(a.bas) - avg(c.bas))[0]
  const worst = [...eligible].sort((a, c) => avg(c.bas) - avg(a.bas))[0]
  const surnameP = surname(p.pitcher_name)

  if (avg(best.bas) <= LG_BA - 0.03) {
    const weak = best.bas.filter((v) => v <= 0.225).length
    return {
      id: 'lineup_fit', direction: 'for', title: 'Lineup can\'t square his best pitch',
      stat: `${weak} of ${best.bas.length} hitters ≤ .225 vs ${best.name}`,
      detail: `Projected hitters average just ${fmt3(avg(best.bas))} against ${lower(best.name)}s at ${surnameP}'s speed — ${weak} of ${best.bas.length} with a real sample are at .225 or worse.`,
      strength: clamp01((LG_BA - avg(best.bas)) / 0.09 + (best.putAway ? 0.1 : 0)), visual,
    }
  }
  if (avg(worst.bas) >= LG_BA + 0.04) {
    const strong = worst.bas.filter((v) => v >= 0.28).length
    return {
      id: 'lineup_fit', direction: 'against', title: 'Lineup handles a key pitch',
      stat: `${strong} of ${worst.bas.length} hitters ≥ .280 vs ${worst.name}`,
      detail: `Projected hitters average ${fmt3(avg(worst.bas))} against ${lower(worst.name)}s at ${surnameP}'s speed — a pitch he throws ${Math.round(worst.usage ?? 0)}% of the time.`,
      strength: clamp01((avg(worst.bas) - LG_BA) / 0.09), visual,
    }
  }
  return null
}

function pitcherLineupZoneFactor(p: Top3Pitcher, batSideMajority: 'L' | 'R' | null): MatchupFactor | null {
  const m = p.per_batter.length
  if (m < 5) return null
  const leaning = p.per_batter.filter((b) => b.pitcher_edge_score > 0.03).length

  const zones = new Map<string, { sum: number; n: number; usage: number }>()
  for (const b of p.per_batter) {
    for (const c of b.zone_fit) {
      const z = zones.get(c.zone) ?? { sum: 0, n: 0, usage: c.pitcher_usage_pct ?? 0 }
      z.sum += c.tilt; z.n += 1
      zones.set(c.zone, z)
    }
  }
  const ranked = [...zones.entries()].map(([zone, z]) => ({ zone, mean: z.sum / z.n, usage: z.usage }))
  const soft = [...ranked].sort((a, c) => a.mean - c.mean)[0]
  if (!soft) return null
  const label = getZoneLabel(soft.zone, batSideMajority)

  if (leaning >= Math.ceil(m * 0.55) && soft.mean <= -0.05) {
    return {
      id: 'lineup_zone', direction: 'for', title: 'His locations beat this lineup',
      stat: `${leaning} of ${m} hitters lean his way`,
      detail: `${leaning} of ${m} projected hitters grade in ${surname(p.pitcher_name)}'s favour against his zone mix — the softest spot is ${label} (${soft.usage}% of his pitches).`,
      strength: clamp01(leaning / m),
      visual: { kind: 'zone', zone: soft.zone, tone: 'edge' },
    }
  }
  if (leaning <= Math.floor(m * 0.25)) {
    const hot = [...ranked].sort((a, c) => c.mean - a.mean)[0]
    return {
      id: 'lineup_zone', direction: 'against', title: 'Lineup punishes his locations',
      stat: `only ${leaning} of ${m} hitters lean his way`,
      detail: `Just ${leaning} of ${m} projected hitters grade in ${surname(p.pitcher_name)}'s favour against his zone mix.`,
      strength: clamp01((m - leaning) / m - 0.3),
      visual: hot ? { kind: 'zone', zone: hot.zone, tone: 'tough' } : null,
    }
  }
  return null
}

function pitcherWhiffFactor(p: Top3Pitcher, prof: PitcherProfile): MatchupFactor | null {
  const w = prof.good.whiff, k = prof.good.k, ch = prof.good.chase
  const best = Math.max(w ?? 0, k ?? 0)
  const rows: { label: string; pct: number; display: string; tone: 'good' | 'bad' | 'mid' }[] = []
  const add = (label: string, pct: number | null, display: string) => {
    if (pct != null) rows.push({ label, pct, display, tone: pct >= 70 ? 'good' : pct <= 30 ? 'bad' : 'mid' })
  }
  add('Whiff%', w, prof.whiffPct != null ? `${prof.whiffPct.toFixed(1)}%` : '—')
  add('K%', k, prof.kPct != null ? `${prof.kPct.toFixed(1)}%` : '—')
  add('Chase%', ch, prof.chaseRate != null ? `${prof.chaseRate.toFixed(1)}%` : '—')

  if (best >= 65) {
    return {
      id: 'whiff', direction: 'for', title: 'Misses bats',
      stat: `${prof.whiffPct?.toFixed(1) ?? '—'}% whiff · ${ordinal(w ?? 0)} pct`,
      detail: `${surname(p.pitcher_name)} generates whiffs at a ${ordinal(w ?? 0)}-percentile rate${k != null ? ` and strikes out ${prof.kPct?.toFixed(1)}% of hitters (${ordinal(k)} percentile)` : ''}.`,
      strength: clamp01((best - 50) / 45), visual: { kind: 'meter', rows },
    }
  }
  if (w != null && w <= 25) {
    return {
      id: 'whiff', direction: 'against', title: 'Rarely misses bats',
      stat: `${prof.whiffPct?.toFixed(1)}% whiff · ${ordinal(w)} pct`,
      detail: `${surname(p.pitcher_name)}'s whiff rate sits in the ${ordinal(w)} percentile — hitters make contact against him.`,
      strength: clamp01((50 - w) / 45), visual: { kind: 'meter', rows },
    }
  }
  return null
}

function pitcherControlFactor(p: Top3Pitcher, prof: PitcherProfile): MatchupFactor | null {
  const g = prof.good.bb
  if (g == null || prof.bbPct == null) return null
  const visual: FactorVisual = { kind: 'meter', rows: [{ label: 'BB control', pct: g, display: `${prof.bbPct.toFixed(1)}% BB`, tone: g >= 70 ? 'good' : g <= 30 ? 'bad' : 'mid' }] }
  if (g >= 65) {
    return {
      id: 'walks', direction: 'for', title: 'Rarely gives free passes',
      stat: `${prof.bbPct.toFixed(1)}% BB · ${ordinal(g)} pct`,
      detail: `${surname(p.pitcher_name)} walks just ${prof.bbPct.toFixed(1)}% of hitters — ${ordinal(g)} percentile for control.`,
      strength: clamp01((g - 50) / 45), visual,
    }
  }
  if (g <= 25) {
    return {
      id: 'walks', direction: 'against', title: 'Walks too many',
      stat: `${prof.bbPct.toFixed(1)}% BB · ${ordinal(g)} pct`,
      detail: `${surname(p.pitcher_name)} walks ${prof.bbPct.toFixed(1)}% of hitters — ${ordinal(g)} percentile for control.`,
      strength: clamp01((50 - g) / 45), visual,
    }
  }
  return null
}

function pitcherGroundballDefenseFactor(
  p: Top3Pitcher, prof: PitcherProfile, ctx: FactorContext, defenders: LineupBatter[],
): MatchupFactor | null {
  const gb = prof.gbRate
  if (gb == null) return null
  const sum = (positions: string[]) => {
    const xs = defenders.filter((d) => positions.includes(d.position)).map((d) => lookupOaa(ctx, d)).filter((v): v is number => v != null)
    return xs.length >= Math.max(2, positions.length - 1) ? xs.reduce((s, v) => s + v, 0) : null
  }
  const name = surname(p.pitcher_name)
  const flyBall = gb <= 40
  const positions = flyBall ? OUTFIELD : INFIELD
  const total = sum(positions)
  if (total == null || (!flyBall && gb < 47)) return null
  if (flyBall && gb > 40) return null

  const fielders = fieldersFrom(ctx, defenders, (pos) => positions.includes(pos))
  const sign = (n: number) => `${n > 0 ? '+' : ''}${n}`
  const kind = flyBall ? 'outfield' : 'infield'
  if (total >= 4) {
    return {
      id: 'groundball_defense', direction: 'for',
      title: flyBall ? 'Outfield has his back' : 'Ground balls meet a good infield',
      stat: `${gb.toFixed(0)}% GB · ${kind} ${sign(total)} OAA`,
      detail: `${name} ${flyBall ? `is a fly-ball pitcher (${gb.toFixed(0)}% ground balls) and his outfield` : `induces ${gb.toFixed(0)}% ground balls, and the infield behind him`} grades ${sign(total)} outs above average combined.`,
      strength: clamp01(total / 14), visual: { kind: 'field', wedge: null, fielders },
    }
  }
  if (total <= -4) {
    return {
      id: 'groundball_defense', direction: 'against',
      title: flyBall ? 'Outfield behind him is shaky' : 'Ground balls meet a shaky infield',
      stat: `${gb.toFixed(0)}% GB · ${kind} ${sign(total)} OAA`,
      detail: `${name} ${flyBall ? `allows fly balls (${gb.toFixed(0)}% GB) and` : `relies on ground balls (${gb.toFixed(0)}% GB), but`} the ${kind} behind him grades ${sign(total)} outs above average combined.`,
      strength: clamp01(-total / 14), visual: { kind: 'field', wedge: null, fielders },
    }
  }
  return null
}

function pitcherLineupHandsFactor(
  p: Top3Pitcher, prof: PitcherProfile, hitters: { bat_side?: string | null; switch_hitter?: boolean }[], throws: 'L' | 'R' | null,
): MatchupFactor | null {
  if (prof.vsLhbBaa == null || prof.vsRhbBaa == null || hitters.length < 6) return null
  const { left, right } = lineupHandCounts(hitters, throws)
  const dominant: 'L' | 'R' | null = right >= 5 ? 'R' : left >= 5 ? 'L' : null
  if (!dominant) return null
  const count = dominant === 'R' ? right : left
  const baa = dominant === 'R' ? prof.vsRhbBaa : prof.vsLhbBaa
  const rows = [
    { label: 'vs LHB', value: prof.vsLhbBaa, display: fmt3(prof.vsLhbBaa), active: dominant === 'L' },
    { label: 'vs RHB', value: prof.vsRhbBaa, display: fmt3(prof.vsRhbBaa), active: dominant === 'R' },
  ]
  const visual: FactorVisual = { kind: 'split', rows, scale: [0.18, 0.34], lowerIsBetter: true }
  const word = dominant === 'R' ? 'right-handed' : 'left-handed'
  if (baa <= 0.235) {
    return {
      id: 'lineup_hands', direction: 'for', title: `Lineup is ${dominant === 'R' ? 'righty' : 'lefty'}-heavy — his strength`,
      stat: `${fmt3(baa)} BAA vs ${dominant}HB`,
      detail: `${count} of ${hitters.length} projected hitters bat ${word}, and ${surname(p.pitcher_name)} holds ${dominant === 'R' ? 'righties' : 'lefties'} to a ${fmt3(baa)} average this season.`,
      strength: clamp01((0.26 - baa) / 0.08), visual,
    }
  }
  if (baa >= 0.275) {
    return {
      id: 'lineup_hands', direction: 'against', title: `Lineup is ${dominant === 'R' ? 'righty' : 'lefty'}-heavy — his weakness`,
      stat: `${fmt3(baa)} BAA vs ${dominant}HB`,
      detail: `${count} of ${hitters.length} projected hitters bat ${word}, and ${dominant === 'R' ? 'righties' : 'lefties'} hit ${fmt3(baa)} against ${surname(p.pitcher_name)} this season.`,
      strength: clamp01((baa - 0.25) / 0.08), visual,
    }
  }
  return null
}

async function pitcherDayNightFactor(p: Top3Pitcher, ctx: FactorContext): Promise<MatchupFactor | null> {
  if (!ctx.dayNight) return null
  const [d, n] = await Promise.all([
    fetchPitchingSplit(p.pitcher_id, ctx.season, 'd'),
    fetchPitchingSplit(p.pitcher_id, ctx.season, 'n'),
  ])
  if (!d || !n) return null
  const D = { ops: num(d.ops), bf: num(d.battersFaced) ?? 0 }
  const N = { ops: num(n.ops), bf: num(n.battersFaced) ?? 0 }
  if (D.ops == null || N.ops == null) return null
  const today = ctx.dayNight === 'day' ? D : N
  const other = ctx.dayNight === 'day' ? N : D
  if (today.bf < 60 || other.bf < 40) return null
  const diff = (today.ops as number) - (other.ops as number)   // negative = better today
  const rows = [
    { label: 'Day', value: D.ops, display: `${fmtOps(D.ops)} OPS`, active: ctx.dayNight === 'day' },
    { label: 'Night', value: N.ops, display: `${fmtOps(N.ops)} OPS`, active: ctx.dayNight === 'night' },
  ]
  const visual: FactorVisual = { kind: 'split', rows, scale: [0.55, 0.9], lowerIsBetter: true }
  const t = today.ops as number
  const name = surname(p.pitcher_name)
  if (t <= 0.69 && diff <= -0.05) {
    return {
      id: 'daynight', direction: 'for', title: `Sharper in ${ctx.dayNight} games`,
      stat: `${fmtOps(t)} OPS against ${ctx.dayNight === 'day' ? 'by day' : 'at night'}`,
      detail: `Hitters post just ${fmtOps(t)} OPS against ${name} in ${ctx.dayNight} games (${today.bf} BF) vs ${fmtOps(other.ops as number)} in ${ctx.dayNight === 'day' ? 'night' : 'day'} games.`,
      strength: clamp01(-diff / 0.15), visual,
    }
  }
  if (t >= 0.78 && diff >= 0.06) {
    return {
      id: 'daynight', direction: 'against', title: `Rougher in ${ctx.dayNight} games`,
      stat: `${fmtOps(t)} OPS against ${ctx.dayNight === 'day' ? 'by day' : 'at night'}`,
      detail: `Hitters post ${fmtOps(t)} OPS against ${name} in ${ctx.dayNight} games (${today.bf} BF) vs ${fmtOps(other.ops as number)} in ${ctx.dayNight === 'day' ? 'night' : 'day'} games.`,
      strength: clamp01(diff / 0.15), visual,
    }
  }
  return null
}

async function pitcherFormFactor(p: Top3Pitcher, prof: PitcherProfile): Promise<MatchupFactor | null> {
  if (prof.l3Era == null || prof.era == null || (prof.l3Innings ?? 0) < 12) return null
  const cooling = prof.l3Era >= prof.era + 1.5
  const heating = prof.l3Era <= prof.era - 0.8 && prof.l3Era <= 3.5
  if (!heating && !cooling) return null

  const starts = await getPitcherRecentStarts(p.pitcher_id, 5)
  const values = [...starts].reverse().map((s) => estimateGameScore(s.ip, s.h, s.er, s.so, s.bb))
  const name = surname(p.pitcher_name)
  return {
    id: 'form', direction: heating ? 'for' : 'against',
    title: heating ? 'Locked in lately' : 'Struggling lately',
    stat: `${prof.l3Era.toFixed(2)} ERA last 3 starts`,
    detail: `${name} has a ${prof.l3Era.toFixed(2)} ERA over his last 3 starts (${prof.l3Innings?.toFixed(1)} IP) against ${prof.era.toFixed(2)} on the season.`,
    strength: clamp01(Math.abs(prof.l3Era - prof.era) / 3),
    visual: values.length >= 3 ? { kind: 'spark', values, caption: 'Game score (est.), last starts', goodAbove: 55 } : null,
  }
}

function pitcherHomeAwayFactor(p: Top3Pitcher, prof: PitcherProfile, isHome: boolean): MatchupFactor | null {
  if (prof.homeEra == null || prof.awayEra == null || (prof.starts ?? 0) < 12) return null
  const today = isHome ? prof.homeEra : prof.awayEra
  const other = isHome ? prof.awayEra : prof.homeEra
  const rows = [
    { label: 'Home', value: prof.homeEra, display: `${prof.homeEra.toFixed(2)} ERA`, active: isHome },
    { label: 'Away', value: prof.awayEra, display: `${prof.awayEra.toFixed(2)} ERA`, active: !isHome },
  ]
  const visual: FactorVisual = { kind: 'split', rows, scale: [1.5, 6.5], lowerIsBetter: true }
  const name = surname(p.pitcher_name)
  const where = isHome ? 'at home' : 'on the road'
  if (today <= 3.4 && other - today >= 1) {
    return {
      id: 'home_away', direction: 'for', title: isHome ? 'Better at home' : 'Better on the road',
      stat: `${today.toFixed(2)} ERA ${where}`,
      detail: `${name} has a ${today.toFixed(2)} ERA ${where} this season vs ${other.toFixed(2)} ${isHome ? 'away' : 'at home'}.`,
      strength: clamp01((other - today) / 3), visual,
    }
  }
  if (today >= 4.8 && today - other >= 1) {
    return {
      id: 'home_away', direction: 'against', title: isHome ? 'Weaker at home' : 'Weaker on the road',
      stat: `${today.toFixed(2)} ERA ${where}`,
      detail: `${name} has a ${today.toFixed(2)} ERA ${where} this season vs ${other.toFixed(2)} ${isHome ? 'away' : 'at home'}.`,
      strength: clamp01((today - other) / 3), visual,
    }
  }
  return null
}

export async function buildPitcherFactors(
  p: Top3Pitcher, ctx: FactorContext, teamDefenders: LineupBatter[], opposingHitters: LineupBatter[], isHome: boolean,
): Promise<MatchupFactor[]> {
  const prof = ctx.pitcherProfiles.get(p.pitcher_id)
  const throws = ctx.hands.get(p.pitcher_id)?.throws ?? null
  const { left, right } = lineupHandCounts(opposingHitters, throws)
  const majority: 'L' | 'R' | null = right > left ? 'R' : left > right ? 'L' : null

  const [dayNight, form] = await Promise.all([
    pitcherDayNightFactor(p, ctx),
    prof ? pitcherFormFactor(p, prof) : Promise.resolve(null),
  ])

  const all = [
    pitcherLineupFitFactor(p),
    pitcherLineupZoneFactor(p, majority),
    prof ? pitcherWhiffFactor(p, prof) : null,
    prof ? pitcherControlFactor(p, prof) : null,
    prof ? pitcherGroundballDefenseFactor(p, prof, ctx, teamDefenders) : null,
    prof ? pitcherLineupHandsFactor(p, prof, opposingHitters, throws) : null,
    dayNight,
    form,
    prof ? pitcherHomeAwayFactor(p, prof, isHome) : null,
    parkFactorFactor(null, ctx, 'pitcher'),
  ].filter((f): f is MatchupFactor => !!f)
  return selectFactors(all)
}

// ─── Selection + ranking nudge ──────────────────────────────────────────

/**
 * Top five factors. "For" factors lead, strongest first. Headwinds only
 * backfill when fewer than three real "for" factors exist, so a thin card is
 * explained honestly instead of padded with weak positives.
 */
export function selectFactors(all: MatchupFactor[]): MatchupFactor[] {
  const byStrength = (a: MatchupFactor, b: MatchupFactor) => b.strength - a.strength
  const forF = all.filter((f) => f.direction === 'for').sort(byStrength)
  const against = all.filter((f) => f.direction === 'against').sort(byStrength)
  const picked = forF.slice(0, 5)
  if (picked.length < 3) picked.push(...against.slice(0, Math.min(2, 5 - picked.length)))
  return picked
}

// Zone / pitch-type fit already drive the base series score — don't count
// them twice when nudging the ranking.
const ALREADY_IN_BASE = new Set<FactorId>(['zone', 'pitch_fit', 'lineup_fit', 'lineup_zone'])

/** Extra ranking weight from the signals the base score doesn't see. */
export function contextScore(factors: MatchupFactor[]): number {
  let s = 0
  for (const f of factors) {
    if (ALREADY_IN_BASE.has(f.id)) continue
    s += (f.direction === 'for' ? 1 : -1) * f.strength * 0.1
  }
  return Math.max(-0.4, Math.min(0.4, Math.round(s * 100) / 100))
}
