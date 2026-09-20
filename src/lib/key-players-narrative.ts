/**
 * src/lib/key-players-narrative.ts
 *
 * Builds the "Why This Matchup Works" synthesis sentence for a Key
 * Players candidate — connects zone location + the specific pitch driving
 * the edge into one readable claim, instead of three separate stat boxes
 * with no throughline.
 *
 * DELIBERATELY TEMPLATE-BASED, NOT LLM-GENERATED. The existing pre-game
 * narrative (prediction.narrative / story_lead) is generated somewhere
 * upstream of edge-fetch.ts that this file hasn't seen — wiring a second,
 * independent LLM call here without visibility into that pipeline's
 * conventions (model, prompt structure, error handling) risks diverging
 * from house style. A template is a safe, always-correct default; swap
 * for an LLM call later once the existing pipeline is in view, following
 * the same fixed-beats-variable-emphasis principle already proven there.
 *
 * Recent form is passed in from the CALLER (page.tsx already fetches
 * player_form_signals for ScoutReportTab) — this file does not fetch it
 * itself, same as the scoring functions don't.
 */

import type { PitchTypeFitLine, Top3Batter, Top3BatterPitcherLine } from '@/lib/series-matchup'
import type { ParkFactor } from '@/lib/parks'

export type RecentFormContext = {
  signal: 'heating' | 'cooling'
  metric: string   // e.g. "ERA 1.42 last 3 starts" — pre-formatted by caller
  trend?: number[] // per-game OPS from player_form_signals.trend, oldest → newest
} | null
// ─── Zone labels — single source of truth ────────────────────────────────
// Moved here from Top3KeyPlayersTab.tsx so the narrative text and the
// card UI never drift apart — both now call this same function.
const ZONE_LABELS_RHB: Record<string, string> = {
  '1': 'high, inside', '2': 'high, middle', '3': 'high, outside',
  '4': 'middle, inside', '5': 'middle, middle', '6': 'middle, outside',
  '7': 'low, inside', '8': 'low, middle', '9': 'low, outside',
  '11': 'chase up-in', '12': 'chase up-away',
  '13': 'chase down-in', '14': 'chase down-away',
}
const ZONE_LABELS_LHB: Record<string, string> = {
  '1': 'high, outside', '2': 'high, middle', '3': 'high, inside',
  '4': 'middle, outside', '5': 'middle, middle', '6': 'middle, inside',
  '7': 'low, outside', '8': 'low, middle', '9': 'low, inside',
  '11': 'chase up-away', '12': 'chase up-in',
  '13': 'chase down-away', '14': 'chase down-in',
}
export function getZoneLabel(zone: string, batSide: string | null): string {
  const dict = batSide === 'L' ? ZONE_LABELS_LHB : ZONE_LABELS_RHB
  return dict[zone] ?? `zone ${zone}`
}
/**
 * Picks the single pitch type the narrative should talk about. Evidence
 * first: among pitches with a real velocity-matched sample (and at least 8%
 * usage), the one with the biggest batter edge ('batter' mode) or the
 * biggest pitcher edge ('pitcher' mode). Only when NO pitch has a real
 * sample do we fall back to the old rule (put-away pitch, else most used) —
 * previously that fallback was the only rule, so a pitch with no batter data
 * at all could be named as the driver.
 */
export function pickDrivingPitch(pitchTypeFit: PitchTypeFitLine[], mode: 'batter' | 'pitcher' = 'batter'): PitchTypeFitLine | null {
  if (pitchTypeFit.length === 0) return null
  const real = pitchTypeFit.filter(
    (p) => !p.velocity_matched_low_sample && p.velocity_matched_ba != null && (p.pitcher_usage_pct ?? 0) >= 8,
  )
  if (real.length > 0) {
    const sign = mode === 'batter' ? -1 : 1
    return [...real].sort((a, b) => sign * ((a.velocity_matched_ba as number) - (b.velocity_matched_ba as number)))[0]
  }
  const putAway = pitchTypeFit.filter((p) => p.is_put_away_pitch)
  const pool = putAway.length > 0 ? putAway : pitchTypeFit
  return [...pool].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))[0]
}

/**
 * The confirmed starter this batter matches up best against. Everything
 * headline-shaped (driving pitch, driving zone, narrative) should describe
 * this line — previously it used per_pitcher[0], i.e. simply the FIRST game
 * of the series, whatever his numbers were.
 */
export function bestBatterLine(batter: Top3Batter): Top3BatterPitcherLine | null {
  return [...batter.per_pitcher].sort(
    (a, b) => (b.zone_score + b.pitch_type_fit_score) - (a.zone_score + a.pitch_type_fit_score),
  )[0] ?? null
}

function fmtBa(ba: number): string {
  return ba.toFixed(3).replace(/^0/, '')
}

function formClause(form: RecentFormContext): string {
  if (!form) return ''
  return form.signal === 'heating'
    ? `and recent form backs it up — ${form.metric}`
    : `though recent form has cooled — ${form.metric}`
}

/**
 * "Is there a real gap in this pitcher's arsenal" — a genuinely different
 * signal from the zone/pitch-type fit: not "is this pitch bad," but "does
 * he even HAVE a real third pitch to change the batter's look." Computed
 * from the same PitchTypeFitLine[] already passed to the narrative
 * builders (pitcher_usage_pct per pitch type) — no new fetch. A "real"
 * pitch is one thrown at least 12% of the time; two or fewer real pitches
 * is a genuine two-pitch mix (below that, elite closers/relievers aside,
 * there's no real third weapon to keep a lineup off balance).
 */
export function arsenalGapClause(pitchTypeFit: PitchTypeFitLine[]): string | null {
  if (pitchTypeFit.length < 2) return null
  const real = pitchTypeFit.filter((p) => (p.pitcher_usage_pct ?? 0) >= 12)
  if (real.length > 2) return null
  const names = [...real].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))
    .map((p) => p.pitch_name.toLowerCase())
  const joined = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0] ?? 'one pitch'
  return `He's really a ${names.length}-pitch mix here — ${joined} account for nearly everything he throws, with no real third weapon to change the batter's eye level or timing.`
}

/**
 * Real park-factor clause — from lib/parks.ts's park_factors table
 * (season-scoped, side-specific HR factors). Only mentioned when it's
 * genuinely notable (±8% or more) in either direction; a near-neutral
 * park isn't part of the story and shouldn't pad the sentence.
 */
export function parkFactorClause(park: ParkFactor | null, batSide: string | null): string | null {
  if (!park) return null
  const factor = batSide === 'L' ? park.hr_factor_lhb : batSide === 'R' ? park.hr_factor_rhb : park.hr_factor
  if (factor == null) return null
  const sideWord = batSide === 'L' ? 'left-handed' : batSide === 'R' ? 'right-handed' : ''
  if (factor >= 1.08) {
    return `${park.venue_name} adds to it — a real ${Math.round((factor - 1) * 100)}% home-run bump for ${sideWord} hitters here this season.`
  }
  if (factor <= 0.92) {
    return `Working against it: ${park.venue_name} suppresses home runs for ${sideWord} hitters by about ${Math.round((1 - factor) * 100)}% this season.`
  }
  return null
}

/**
 * Batter-facing narrative: "why does this batter beat this pitcher."
 */
export function buildBatterNarrative(
  batterName: string,
  pitcherName: string,
  zone: string,
  pitch: PitchTypeFitLine,
  form: RecentFormContext,
  batSide: string | null,
  fullArsenal: PitchTypeFitLine[] = [],
  park: ParkFactor | null = null,
): string {
  const hasBa = pitch.velocity_matched_ba != null && !pitch.velocity_matched_low_sample
  const putAwayClause = pitch.is_put_away_pitch ? " — it's his identified put-away pitch, too" : ''
  const clause = formClause(form)
  const zoneLabel = getZoneLabel(zone, batSide)

  // Never claim a hitting number we don't have: with no real velocity-matched
  // sample the sentence rests on the zone fit alone.
  const base = hasBa
    ? `${batterName} has shown a real fit against ${pitcherName}'s ${pitch.pitch_name.toLowerCase()}, ` +
      `hitting ${fmtBa(pitch.velocity_matched_ba as number)} at the velocity he actually throws it${putAwayClause}. ` +
      `That's the pitch driving the ${zoneLabel} zone${clause ? ', ' + clause : '.'}`
    : `${batterName}'s ${zoneLabel} zone lines up with where ${pitcherName} works, and ${pitcherName}'s ${pitch.pitch_name.toLowerCase()} is the pitch he leans on there${putAwayClause}${clause ? ', ' + clause : '.'}`

  const extra = [arsenalGapClause(fullArsenal), parkFactorClause(park, batSide)]
    .filter((c): c is string => !!c)
  return extra.length > 0 ? `${base} ${extra.join(' ')}` : base
}

/**
 * Pitcher-facing narrative: "why does this pitcher beat that batter" —
 * headline example is the toughest_matchup batter, not the full lineup
 * average (see pitcher-series-edge.ts's per-batter breakdown).
 */
export function buildPitcherNarrative(
  pitcherName: string,
  toughestBatterName: string,
  zone: string,
  pitch: PitchTypeFitLine,
  usagePct: number,
  form: RecentFormContext,
  batSide: string | null,
  park: ParkFactor | null = null,
): string {
  const putAwayClause = pitch.is_put_away_pitch ? "It's his identified put-away pitch" : null
  const clause = formClause(form)
  const roundedUsage = Math.round(usagePct)
  const zoneLabel = getZoneLabel(zone, batSide)

  const tailParts = [putAwayClause, clause].filter((c): c is string => !!c && c.length > 0)
  const tail = tailParts.length > 0 ? ' ' + tailParts.join(', ') + '.' : ''

  const base = `${pitcherName} leans on his ${pitch.pitch_name.toLowerCase()} (${roundedUsage}% of his pitches) and works the ${zoneLabel} zone — ` +
    `exactly where ${toughestBatterName} has shown the clearest weakness in the projected lineup.${tail}`

  // Park clause reads pitcher-favoring here (suppressed power helps him,
  // not a batter-side "adds to it" framing) — only worth a sentence when
  // it's genuinely working in his favor.
  const parkFactor = batSide === 'L' ? park?.hr_factor_lhb : batSide === 'R' ? park?.hr_factor_rhb : park?.hr_factor
  if (park && parkFactor != null && parkFactor <= 0.92) {
    return `${base} ${park.venue_name} helps too — it suppresses home runs for ${batSide === 'L' ? 'left-handed' : batSide === 'R' ? 'right-handed' : ''} hitters by about ${Math.round((1 - parkFactor) * 100)}% this season.`
  }
  return base
}

/**
 * "Favourable vs Verlander, Ohtani — not vs Skubal." Built from the
 * batter's per-confirmed-starter lines, which already exist — this was
 * always computable, just never surfaced anywhere in the UI.
 */
export function buildStarterSummarySentence(batter: Top3Batter): string {
  const lines = batter.per_pitcher.map((p) => ({
    name: p.pitcher_name,
    lean: (p.zone_score + p.pitch_type_fit_score) > 0.03 ? 'edge' as const
      : (p.zone_score + p.pitch_type_fit_score) < -0.03 ? 'tough' as const
      : 'neutral' as const,
  }))

  const edgeNames = lines.filter((l) => l.lean === 'edge').map((l) => l.name)
  const toughNames = lines.filter((l) => l.lean === 'tough').map((l) => l.name)

  if (edgeNames.length === 0 && toughNames.length === 0) {
    return `Neutral read across ${lines.length} confirmed starter${lines.length === 1 ? '' : 's'} in this series.`
  }
  if (edgeNames.length > 0 && toughNames.length === 0) {
    return `Favourable matchup vs ${edgeNames.join(', ')}.`
  }
  if (edgeNames.length === 0 && toughNames.length > 0) {
    return `Tough matchup vs ${toughNames.join(', ')}.`
  }
  return `Favourable matchup vs ${edgeNames.join(', ')} — not vs ${toughNames.join(', ')}.`
}