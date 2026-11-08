// src/lib/milb-shape/translate.ts
//
// "Does this shape carry to MLB?" For a minor-league pitch whose shape has produced good results at its own level, this sets that against what MLB pitches with the same
// movement have produced, and flags the cases where the shape has not worked in MLB. It is a comparison of what has already happened, in two places: pitches shaped like his at his
// level against his level's average, and MLB pitches with that movement (any speed) against the MLB average. It does not say what he will do.
//
//   works at his level  = his shape has saved 0.30+ runs per 100 pitches at his level, or its whiffs per swing sit 2+ points above that level's average
//   works in MLB        = the same test on MLB pitches with that movement
//   fails in MLB        = those MLB pitches have saved 0.20 or more runs per 100 LESS than the MLB average, or whiff 2+ points below it (and do not pass the test above)
// Speed is the other half of the story, so it is added when the caller has it: how much slower or faster he throws than MLB pitches with this movement, and what MLB pitches at his
// speed have done against the same movement at every speed.

export const WORKS_RUNS = 0.3
export const FAILS_RUNS = -0.2
export const WORKS_WHIFF = 0.02
export const SLOW_MPH = 1.5

export type Side = { saved: number | null; whiff: number | null; /** pitches behind the shape's results */ pitches: number }
export type TranslationInput = {
  levelLabel: string
  /** pitches shaped like his at his level, and that level's average whiffs per swing for the pitch */
  level: Side; levelAvgWhiff: number | null
  /** MLB pitches with this movement (any speed), and the MLB average whiffs per swing for the pitch; null when MLB has none */
  mlb: Side | null; mlbAvgWhiff: number | null
  speed?: { veloDiff: number | null; atSpeedWhiff: number | null; allWhiff: number | null; swings: number } | null
}
export type TranslationStatus = 'minors-only' | 'holds' | 'mlb-better' | 'neither' | 'unclear'
export type Translation = { status: TranslationStatus; headline: string; reasons: string[] }

const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`
const runs = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

const verdict = (saved: number | null, whiff: number | null, avg: number | null) => {
  const wd = whiff != null && avg != null ? whiff - avg : null
  return {
    wd,
    works: (saved != null && saved >= WORKS_RUNS) || (wd != null && wd >= WORKS_WHIFF),
    fails: (saved != null && saved <= FAILS_RUNS) || (wd != null && wd <= -WORKS_WHIFF),
  }
}

export function translate(i: TranslationInput): Translation {
  const lv = verdict(i.level.saved, i.level.whiff, i.levelAvgWhiff)
  if (i.level.saved == null && lv.wd == null) return { status: 'unclear', headline: `Too few ${i.levelLabel} pitches shaped like his to say whether the shape works there.`, reasons: [] }
  if (!i.mlb || (i.mlb.saved == null && i.mlb.whiff == null)) return { status: 'unclear', headline: 'Too few MLB pitches with this movement to say how it has done there.', reasons: [] }
  const ml = verdict(i.mlb.saved, i.mlb.whiff, i.mlbAvgWhiff)

  const reasons: string[] = []
  if (i.level.saved != null && i.mlb.saved != null) reasons.push(`Pitches shaped like his have saved ${runs(i.level.saved)} runs per 100 at ${i.levelLabel}; MLB pitches with that movement have saved ${runs(i.mlb.saved)} (${i.mlb.pitches.toLocaleString()} pitches).`)
  if (lv.wd != null && ml.wd != null) reasons.push(`Whiffs per swing against the average at each level: ${pts(lv.wd)} at ${i.levelLabel}, ${pts(ml.wd)} in MLB.`)
  const sp = i.speed
  if (sp && sp.veloDiff != null && Math.abs(sp.veloDiff) >= SLOW_MPH) {
    const slow = sp.veloDiff < 0
    reasons.push(`He throws ${Math.abs(sp.veloDiff).toFixed(1)} mph ${slow ? 'slower' : 'faster'} than MLB pitches with this movement.${sp.atSpeedWhiff != null && sp.allWhiff != null ? ` MLB pitches with it at his speed whiff ${pct(sp.atSpeedWhiff)} per swing against ${pct(sp.allWhiff)} at every speed (${sp.swings.toLocaleString()} swings).` : ''}`)
  }

  const slowHurts = !!(sp && sp.veloDiff != null && sp.veloDiff <= -SLOW_MPH && sp.atSpeedWhiff != null && sp.allWhiff != null && sp.atSpeedWhiff - sp.allWhiff <= -WORKS_WHIFF)
  if (lv.works && ml.fails) return { status: 'minors-only', headline: `It works at ${i.levelLabel}, but pitches with this movement have not worked in MLB.${slowHurts ? ' His speed is part of it: MLB pitches at that speed do worse.' : ''}`, reasons }
  if (lv.works && !ml.works) return { status: 'minors-only', headline: `It is above the ${i.levelLabel} average, but pitches with this movement have only been average in MLB.${slowHurts ? ' His speed is part of it: MLB pitches at that speed do worse.' : ''}`, reasons }
  if (lv.works && ml.works) return { status: 'holds', headline: `It works at ${i.levelLabel} and pitches with this movement have worked in MLB too.${slowHurts ? ' His speed is the exception: MLB pitches at that speed do worse.' : ''}`, reasons }
  if (!lv.works && ml.works) return { status: 'mlb-better', headline: `It is not above the ${i.levelLabel} average, but pitches with this movement have worked in MLB.`, reasons }
  return { status: 'neither', headline: `It is not above average at ${i.levelLabel} or in MLB.`, reasons }
}
