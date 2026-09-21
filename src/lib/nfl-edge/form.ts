// src/lib/nfl-edge/form.ts
//
// League-wide team form: one cached read of nfl_team_form (32 rows per season), plus the maths that
// turns stored SUMS into rates. Sums (not rates) are stored so windows and seasons can be blended
// exactly: add numerators, add denominators, divide once.
//
// Table read: nfl_team_form (writer: scripts/nfl/compute_team_week_splits.py).
// If that table is missing or empty every function returns an empty result and the pages show empty states.
//
// EARLY-SEASON BLEND: a club's first few games say little about it, so the previous season counts
// for a while, fading to zero by game 12. Weight = 0.4 x max(0, 1 - games/12). Every page that uses a
// blended number says so ("includes 2025") — nothing is presented as a pure current-season sample.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'

export type Sums = Record<string, number>
export type FormWindow = { games: number; off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums }
export type FormRow = {
  team_id: string; season: number; through_week: number | null; games: number
  season_sum: FormWindow | null; l3: FormWindow | null; l5: FormWindow | null
}

async function loadFormRaw(season: number): Promise<FormRow[]> {
  const { data, error } = await createAdminClient()
    .from('nfl_team_form')
    .select('team_id,season,through_week,games,season_sum,l3,l5')
    .in('season', [season, season - 1])
  if (error) {
    console.error('[getLeagueForm] Supabase error:', error.message)
    return []
  }
  return (data ?? []) as FormRow[]
}

const cachedForm = unstable_cache(async (season: number) => loadFormRaw(season), ['nfl-edge-form'], { revalidate: 1800 })

/** Cached for 30 minutes, but an empty result (table missing / not computed yet) is never cached, so new data shows up immediately. */
async function loadForm(season: number): Promise<FormRow[]> {
  const cached = await cachedForm(season)
  return cached.length ? cached : loadFormRaw(season)
}

export type LeagueForm = { season: number; cur: Map<string, FormRow>; prior: Map<string, FormRow> }

export async function getLeagueForm(season: number): Promise<LeagueForm> {
  const rows = await loadForm(season)
  const cur = new Map<string, FormRow>()
  const prior = new Map<string, FormRow>()
  for (const r of rows) (r.season === season ? cur : prior).set(r.team_id, r)
  return { season, cur, prior }
}

export function priorWeight(gamesPlayed: number): number {
  return 0.4 * Math.max(0, 1 - gamesPlayed / 12)
}

const add = (a: Sums | undefined, b: Sums | undefined, w = 1): Sums => {
  const out: Sums = { ...(a ?? {}) }
  for (const [k, v] of Object.entries(b ?? {})) out[k] = (out[k] ?? 0) + v * w
  return out
}

export type Blend = { off: Sums; def: Sums; ftn_off: Sums; ftn_def: Sums; games: number; gamesEff: number; priorW: number; usesPrior: boolean }

export function blendWindow(cur: FormWindow | null | undefined, prior: FormWindow | null | undefined, w: number): Blend {
  const p = w > 0 ? prior : null
  return {
    off: add(cur?.off, p?.off, w), def: add(cur?.def, p?.def, w),
    ftn_off: add(cur?.ftn_off, p?.ftn_off, w), ftn_def: add(cur?.ftn_def, p?.ftn_def, w),
    games: cur?.games ?? 0, gamesEff: (cur?.games ?? 0) + (p?.games ?? 0) * w, priorW: w, usesPrior: !!p && (p.games ?? 0) > 0 && w > 0,
  }
}

/** Blended season window for one club (current + faded prior). */
export function teamBlend(lf: LeagueForm, teamId: string): Blend {
  const c = lf.cur.get(teamId)
  const p = lf.prior.get(teamId)
  return blendWindow(c?.season_sum, p?.season_sum, priorWeight(c?.games ?? 0))
}

const div = (a: number | undefined, b: number | undefined): number | null =>
  a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b <= 0 ? null : a / b

/** Every rate a page needs, from one window's sums. `null` = not enough data (never a fabricated zero). */
export type Rates = {
  plays: number
  offEpa: number | null; defEpa: number | null            // EPA per play, offence / allowed
  passEpaO: number | null; passEpaD: number | null        // EPA per dropback
  rushEpaO: number | null; rushEpaD: number | null        // EPA per carry
  successO: number | null; successD: number | null
  explosiveO: number | null; explosiveD: number | null   // share of plays
  stuffO: number | null; stuffD: number | null            // share of carries stopped at/behind the line
  sackAllowed: number | null; sackGen: number | null      // sacks per dropback
  passYpaO: number | null; passYpaD: number | null        // yards per attempt
  rushYpcO: number | null; rushYpcD: number | null
  rzTdO: number | null; rzTdD: number | null; rzTripsO: number; rzTripsD: number
  d1EpaO: number | null; d2EpaO: number | null; d3EpaO: number | null
  d1EpaD: number | null; d2EpaD: number | null; d3EpaD: number | null
  thirdO: number | null; thirdD: number | null
  earlyRunRate: number | null
  twoMinEpaO: number | null; twoMinEpaD: number | null; twoMinN: number
  shortYdO: number | null; shortYdD: number | null; shortYdN: number
  giveaways: number; takeaways: number
  gamesEff: number
}

export function ratesOf(b: { off: Sums; def: Sums; gamesEff?: number }): Rates {
  const o = b.off, d = b.def
  return {
    plays: o.plays ?? 0,
    offEpa: div(o.epa, o.plays), defEpa: div(d.epa, d.plays),
    passEpaO: div(o.pass_epa, o.dropbacks), passEpaD: div(d.pass_epa, d.dropbacks),
    rushEpaO: div(o.rush_epa, o.rushes), rushEpaD: div(d.rush_epa, d.rushes),
    successO: div(o.success_n, o.plays), successD: div(d.success_n, d.plays),
    explosiveO: div(o.explosive_n, o.plays), explosiveD: div(d.explosive_n, d.plays),
    stuffO: div(o.stuff_n, o.rushes), stuffD: div(d.stuff_n, d.rushes),
    sackAllowed: div(o.sacks, o.dropbacks), sackGen: div(d.sacks, d.dropbacks),
    passYpaO: div(o.pass_yds, o.pass_att), passYpaD: div(d.pass_yds, d.pass_att),
    rushYpcO: div(o.rush_yds, o.rushes), rushYpcD: div(d.rush_yds, d.rushes),
    rzTdO: div(o.rz_td, o.rz_trips), rzTdD: div(d.rz_td, d.rz_trips), rzTripsO: o.rz_trips ?? 0, rzTripsD: d.rz_trips ?? 0,
    d1EpaO: div(o.d1_epa, o.d1_n), d2EpaO: div(o.d2_epa, o.d2_n), d3EpaO: div(o.d3_epa, o.d3_n),
    d1EpaD: div(d.d1_epa, d.d1_n), d2EpaD: div(d.d2_epa, d.d2_n), d3EpaD: div(d.d3_epa, d.d3_n),
    thirdO: div(o.third_conv_n, o.third_n), thirdD: div(d.third_conv_n, d.third_n),
    earlyRunRate: div(o.early_rush_n, o.early_n),
    twoMinEpaO: div(o.two_min_epa, o.two_min_n), twoMinEpaD: div(d.two_min_epa, d.two_min_n), twoMinN: o.two_min_n ?? 0,
    shortYdO: div(o.short_yd_success_n, o.short_yd_n), shortYdD: div(d.short_yd_success_n, d.short_yd_n), shortYdN: o.short_yd_n ?? 0,
    giveaways: (o.ints ?? 0) + (o.fumbles_lost ?? 0), takeaways: (d.ints ?? 0) + (d.fumbles_lost ?? 0),
    gamesEff: b.gamesEff ?? 0,
  }
}

/** FTN-charted rates. Null when FTN did not chart enough plays. */
export type FtnRates = {
  plays: number
  motionRate: number | null; paRate: number | null; rpoRate: number | null; screenRate: number | null; noHuddleRate: number | null
  blitzFaced: number | null       // offence: share of dropbacks blitzed
  blitzGen: number | null         // defence: blitz rate
  motionEpa: number | null; noMotionEpa: number | null
  paEpa: number | null; noPaEpa: number | null
  blitzEpa: number | null; noBlitzEpa: number | null
  boxLight: number | null; boxStack: number | null; boxLightEpa: number | null; box7Epa: number | null; boxStackEpa: number | null
  boxN: number; dbN: number
}

export function ftnRatesOf(s: Sums): FtnRates {
  return {
    plays: s.plays ?? 0,
    motionRate: div(s.motion_n, s.plays), paRate: div(s.pa_n, s.db_n), rpoRate: div(s.rpo_n, s.plays),
    screenRate: div(s.screen_n, s.plays), noHuddleRate: div(s.no_huddle_n, s.plays),
    blitzFaced: div(s.blitz_n, s.db_n), blitzGen: div(s.blitz_n, s.db_n),
    motionEpa: div(s.motion_epa, s.motion_n), noMotionEpa: div(s.nomotion_epa, s.nomotion_n),
    paEpa: div(s.pa_epa, s.pa_n), noPaEpa: div(s.nopa_epa, s.nopa_n),
    blitzEpa: div(s.blitz_epa, s.blitz_n), noBlitzEpa: div(s.noblitz_epa, s.noblitz_n),
    boxLight: div(s.box_light_n, s.box_n), boxStack: div(s.box_stack_n, s.box_n),
    boxLightEpa: div(s.box_light_epa, s.box_light_n), box7Epa: div(s.box_7_epa, s.box_7_n), boxStackEpa: div(s.box_stack_epa, s.box_stack_n),
    boxN: s.box_n ?? 0, dbN: s.db_n ?? 0,
  }
}

// ── league distribution helpers ─────────────────────────────────────────────

export function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1) }
export function sd(a: number[]): number {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1))
}

/** 0–100 percentile of `v` among `all` (100 = best). `higherBetter=false` flips it. */
export function percentile(v: number | null, all: number[], higherBetter = true): number | null {
  if (v == null || all.length < 2) return null
  const below = all.filter(x => (higherBetter ? x < v : x > v)).length
  const equal = all.filter(x => x === v).length
  return Math.round(((below + equal / 2) / all.length) * 100)
}

/** 1-based rank among `all` (1 = best). */
export function rankOf(v: number | null, all: number[], higherBetter = true): number | null {
  if (v == null || all.length < 2) return null
  return 1 + all.filter(x => (higherBetter ? x > v : x < v)).length
}

export type LeagueRates = Map<string, Rates>

export function leagueRates(lf: LeagueForm): LeagueRates {
  const out: LeagueRates = new Map()
  const ids = new Set([...lf.cur.keys(), ...lf.prior.keys()])
  for (const id of ids) out.set(id, ratesOf(teamBlend(lf, id)))
  return out
}

export function column(lr: LeagueRates, pick: (r: Rates) => number | null): number[] {
  return [...lr.values()].map(pick).filter((x): x is number => x != null)
}
