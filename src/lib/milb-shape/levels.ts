// src/lib/milb-shape/levels.ts
//
// The levels the Pitch Shape Lab can show. Shared by the importer, the server readers and the client selector, so a level means one thing everywhere.
// MLB is the default and always the existing behaviour; Triple-A and the Florida State League come from separate tables (never mixed into MLB rows).
//
// League identities were read from the MLB Stats API on 2026-11-08 (GET /api/v1/teams?sportId=11|14&season=2026):
//   Triple-A  = sport 11: International League (league id 117) and Pacific Coast League (112)
//   Florida State League = league id 123 inside Single-A (sport 14), alongside the Carolina League (122) and California League (110)
// The importer re-derives these from the API every run (see league.ts) and refuses to continue if the Florida State League cannot be found, so the ids below are
// only the expectation it checks the API against, never a shortcut.

export type Level = 'mlb' | 'aaa' | 'fsl'
export type MilbLevel = Exclude<Level, 'mlb'>

export const LEVELS: readonly Level[] = ['mlb', 'aaa', 'fsl'] as const
export const DEFAULT_LEVEL: Level = 'mlb'

export const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'Triple-A', fsl: 'Florida State League' }
export const LEVEL_SHORT: Record<Level, string> = { mlb: 'MLB', aaa: 'Triple-A', fsl: 'FSL' }

/** Stats API sport ids (schedule and team lookups). Single-A (14) holds three leagues; only one is the Florida State League. */
export const SPORT_ID: Record<MilbLevel, number> = { aaa: 11, fsl: 14 }
/** Stats API league ids expected for each level. aaa has two leagues. */
export const EXPECTED_LEAGUES: Record<MilbLevel, readonly number[]> = { aaa: [117, 112], fsl: [123] }
export const FSL_LEAGUE_NAME = 'Florida State League'

export const isLevel = (x: unknown): x is Level => x === 'mlb' || x === 'aaa' || x === 'fsl'
export const isMilb = (l: Level): l is MilbLevel => l !== 'mlb'
/** Anything unrecognised is MLB, so a bad or missing ?level= never reaches a minor-league table. */
export const parseLevel = (x: unknown): Level => (isLevel(x) ? x : DEFAULT_LEVEL)

/** The season a minor-league view shows: the one asked for if it is a plausible year, else this year. */
export function parseSeason(x: unknown, now = new Date().getFullYear()): number {
  const n = Number(x)
  return Number.isInteger(n) && n >= 2021 && n <= now + 1 ? n : now
}
