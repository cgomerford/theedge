// Minimum sample sizes. Below these, show "Small sample (n = X)" instead of a number.
export const MIN_SAMPLE = {
  h2hPA: 10,
  batterPercentilePA: 50,
  hardHitBBE: 25,
  pitcherPercentileBF: 50,
  arsenalPitchesPerType: 25,
  whiffSwings: 10,
  zonePitchesSeen: 100,
  zoneCellPitches: 15,
  whatChangedPA: 30,
  whatChangedBF: 30,
  splitPA: 20,
  teamGames: 10,
  sprayBBE: 25,
  vsPitchTypeSeen: 30,
  shapePitchesPerType: 25,
  secondLookGroup: 5,         // second at-bats in each group (opened with the same pitch / with something else) before a rate is shown
  gamePlanFirstPitch: 50,     // 0-0 pitches a hitter has seen against the hand before his own swing rate is used
  gamePlanOpenerAbs: 15,      // league at-bats behind an opener line on the Game Plan Card
  gamePlanTwoStrikeSwings: 30, // swings behind a two-strike whiff rate
  gamePlanDamageBip: 40,      // balls in play against the hand before his own damage zones are used
  kStructurePAs: 30,          // plate appearances in a time-through before a strikeout rate is shown
  kStructureKs: 15,           // strikeouts in a time-through before the pitch mixes behind them are shown
  secondLookLine: 15,         // pairs behind a single "second look" sentence on the Game Plan Card
} as const

export type MinSampleKey = keyof typeof MIN_SAMPLE

export function meetsMin(key: MinSampleKey, n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_SAMPLE[key]
}
