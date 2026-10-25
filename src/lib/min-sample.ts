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
} as const

export type MinSampleKey = keyof typeof MIN_SAMPLE

export function meetsMin(key: MinSampleKey, n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_SAMPLE[key]
}
