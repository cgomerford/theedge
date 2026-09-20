// src/lib/edge-plus.ts
//
// "Edge+" — this app's OWN composite pitch grade, explicitly not a claim
// of the industry Stuff+ (confirmed unavailable from any real source this
// app has access to — see pitch-type-percentiles.ts's header). Built from
// real, already-computed league percentiles (velo, movement, whiff%,
// hard-hit%, xwOBA, put-away%, spin rate, release extension — see
// pitch-physical-percentiles.ts), combined into one 0-100 number — the
// formula is shown, not hidden, and every input is a real percentile
// against this season's same-pitch-type league pool (min 20 pitches to
// enter that pool).
//
// The 4 "stuff" weights (spin/extension/velo/movement) are NOT hand-picked
// — they're scaled from a real OLS regression (scripts/
// derive_edge_plus_weights.py, re-runnable against live Savant data):
// xwOBA-goodness percentile ~ spin% + extension% + velo% + movement%,
// pooled across N=3,066 real (pitcher × pitch-type) rows spanning every
// common pitch type (percentiles computed WITHIN each pitch type first,
// so a slider's spin isn't compared to a sinker's). Two model
// specifications (percentile-rank and within-type z-score) agreed on
// direction and rough magnitude: extension and spin were the strongest
// standalone predictors, velo close behind, and movement the weakest and
// least stable of the four (its raw coefficient was actually slightly
// negative in both specs — under-powered/noisy rather than a real
// "more break hurts" finding, so its weight was floored low instead of
// zeroed or flipped negative, which would contradict how Movement is
// shown as a positive percentile everywhere else in this app).
//
// HONEST CAVEAT, disclosed in the UI too: R^2 for this regression was
// ~0.7-0.9% — physical stuff traits ALONE explain very little of real
// outcome variance at this simple linear level (matches the broader
// sabermetric finding that command/location/sequencing dominate; this
// app covers those separately — Hot Zone Overlay, Sequencing tab). These
// weights are real and model-derived, not a black box, but they carry
// real uncertainty, which is why they're disclosed rather than hidden
// behind a single misleadingly precise-looking number.
//
// Extension is weighted highest among the physical components — both the
// regression AND the mechanical intuition agree: more extension means
// the ball leaves the hand closer to the plate, so the batter gets real
// less reaction time on an identical pitch.
//
// Release point/arm angle are still NOT folded in — no real league pool
// to rank a specific slot as "better" or "worse" (unlike spin/extension/
// movement, where a direction is at least defensible), so they stay as
// real supporting numbers alongside Edge+, not blended into the score.
//
// One deliberate manual override on top of the regression: velo's weight
// was pulled down and moved to whiff% instead. Reasoning — velo is a raw
// input, not a result; a faster pitch with no deception, movement, or
// command doesn't whiff anybody (the regression's own R^2 shows raw
// stuff alone barely predicts outcomes). Whiff% is a REAL result that
// already reflects however velo, movement, spin, extension, and location
// actually combined on that pitch — so it should outweigh any single
// physical input, velo included. This is a product judgment call, not a
// regression output, and is called out here as exactly that.
//
// SECOND override, found by spot-checking real pitches against what
// people actually think is good: Jesús Luzardo's sweeper — one of the
// best in the league this season (whiff% 96th percentile, put-away% 95th,
// K% 90th, xwOBA 89th, all real, all same-pitch-type league pool) — was
// scoring a mere ~64 ("Average") under the old weights, because its
// movement percentile happened to be 0 and its extension 4th — both
// genuinely real, but both drawn from the SAME weak regression (R^2 <1%,
// see above) that already told us physical traits barely predict
// outcomes. Letting a near-zero reading on an unreliable input erase a
// dominant real result isn't "the model working," it's the model's own
// noise overpowering its own signal. Fix: the stuff-trait budget was cut
// roughly in half again (37% -> 15% of total weight) and reallocated to
// the 4 real outcome components (63% -> 85%), keeping each side's
// internal relative proportions from before. Re-scored, Luzardo's
// sweeper lands at 76 ("Above average") — still honestly short of
// "Elite" (its hard-hit% is only 55th percentile), but no longer
// contradicted by noise the way a bare "Average" label was.

import type { PitchGradeStat } from './pitch-type-percentiles'

export const EDGE_PLUS_WEIGHTS: Record<string, number> = {
  whiff_percent: 0.31,
  hard_hit_percent: 0.20,
  est_woba: 0.20,
  put_away_percent: 0.14,
  extension: 0.06,
  spin_rate: 0.05,
  avg_velocity: 0.03,
  movement: 0.01,
}

// R^2 of the regression that derived the 4 stuff weights above — shown
// in the UI alongside the score so the real, modest explanatory power
// isn't overstated by a clean-looking 0-100 number.
export const STUFF_MODEL_R2 = 0.0093
export const STUFF_MODEL_N = 3066

export type EdgePlusComponent = {
  key: string
  label: string
  value: string // real formatted value (e.g. "2170 rpm"), for hover detail — not just the percentile
  percentile: number | null
  weight: number
  contribution: number | null // percentile * weight, null if no real percentile to contribute
}

export type EdgePlusResult = {
  score: number | null
  components: EdgePlusComponent[]
}

export function computeEdgePlus(stats: PitchGradeStat[]): EdgePlusResult {
  const components: EdgePlusComponent[] = []
  let weightedSum = 0
  let totalWeight = 0

  for (const [key, weight] of Object.entries(EDGE_PLUS_WEIGHTS)) {
    const stat = stats.find(s => s.key === key)
    const percentile = stat?.percentile ?? null
    components.push({
      key, label: stat?.label ?? key, value: stat?.value ?? '—', percentile, weight,
      contribution: percentile != null ? Math.round(percentile * weight * 10) / 10 : null,
    })
    if (percentile != null) { weightedSum += percentile * weight; totalWeight += weight }
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null
  return { score, components }
}

export function edgePlusTier(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'Unranked', color: '#a8a29e' }
  if (score >= 85) return { label: 'Elite', color: '#059669' }
  if (score >= 65) return { label: 'Above average', color: '#65A30D' }
  if (score >= 40) return { label: 'Average', color: '#D97706' }
  return { label: 'Below average', color: '#DC2626' }
}
