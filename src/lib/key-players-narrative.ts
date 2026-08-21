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

import type { PitchTypeFitLine } from '@/lib/series-matchup'

export type RecentFormContext = {
  signal: 'heating' | 'cooling'
  metric: string   // e.g. "ERA 1.42 last 3 starts" — pre-formatted by caller
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
 * Picks the single pitch type most responsible for the score — highest
 * usage among put-away pitches, or highest usage overall if none is a
 * put-away pitch. This is the pitch the narrative talks about.
 */
export function pickDrivingPitch(pitchTypeFit: PitchTypeFitLine[]): PitchTypeFitLine | null {
  if (pitchTypeFit.length === 0) return null
  const putAway = pitchTypeFit.filter((p) => p.is_put_away_pitch)
  const pool = putAway.length > 0 ? putAway : pitchTypeFit
  return [...pool].sort((a, b) => (b.pitcher_usage_pct ?? 0) - (a.pitcher_usage_pct ?? 0))[0]
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
 * Batter-facing narrative: "why does this batter beat this pitcher."
 */
export function buildBatterNarrative(
  batterName: string,
  pitcherName: string,
  zone: string,
  pitch: PitchTypeFitLine,
  form: RecentFormContext,
  batSide: string | null,
): string {
  const ba = pitch.velocity_matched_ba != null ? fmtBa(pitch.velocity_matched_ba) : 'a strong number'
  const putAwayClause = pitch.is_put_away_pitch ? "— it's his identified put-away pitch, too" : ''
  const clause = formClause(form)
  const zoneLabel = getZoneLabel(zone, batSide)

  return `${batterName} has shown a real fit against ${pitcherName}'s ${pitch.pitch_name.toLowerCase()}, ` +
    `hitting ${ba} at the velocity he actually throws it ${putAwayClause}. ` +
    `That's the pitch driving the ${zoneLabel} zone${clause ? ', ' + clause : '.'}`
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
): string {
  const putAwayClause = pitch.is_put_away_pitch ? "It's his identified put-away pitch" : null
  const clause = formClause(form)
  const roundedUsage = Math.round(usagePct)
  const zoneLabel = getZoneLabel(zone, batSide)

  const tailParts = [putAwayClause, clause].filter((c): c is string => !!c && c.length > 0)
  const tail = tailParts.length > 0 ? ' ' + tailParts.join(', ') + '.' : ''

  return `${pitcherName}'s ${pitch.pitch_name.toLowerCase()} lives in the ${zoneLabel} zone ${roundedUsage}% of the time he throws it — ` +
    `exactly where ${toughestBatterName} has shown the clearest weakness in the projected lineup.${tail}`
}
import type { Top3Batter } from '@/lib/series-matchup'

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