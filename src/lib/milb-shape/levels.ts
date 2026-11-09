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

export type Level = 'mlb' | 'aaa' | 'fsl' | 'afl' | 'st'
export type MilbLevel = Exclude<Level, 'mlb'>
/**
 * The two exhibition levels: the Arizona Fall League and Spring Training. They are short (a few weeks of games), so they carry only a small minimum (30 pitches for a pitcher to be listed, see limits.ts):
 * every tracked pitch is kept in the tables and every map square is shown, labelled by its sample instead of being hidden. Spring Training has no arm angle in Savant's data and the Arizona Fall League has no arm angle,
 * run value or expected stats (its pitches come from the game feed), so those are pending there, never filled in.
 */
export type ExhibitionLevel = 'afl' | 'st'

export const LEVELS: readonly Level[] = ['mlb', 'aaa', 'fsl', 'afl', 'st'] as const
export const DEFAULT_LEVEL: Level = 'mlb'

export const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'Triple-A', fsl: 'Florida State League', afl: 'Arizona Fall League', st: 'Spring Training' }
export const LEVEL_SHORT: Record<Level, string> = { mlb: 'MLB', aaa: 'Triple-A', fsl: 'FSL', afl: 'AFL', st: 'Spring' }

/** Stats API sport ids (schedule and team lookups). Single-A (14) holds three leagues; only one is the Florida State League. */
export const SPORT_ID: Record<MilbLevel, number> = { aaa: 11, fsl: 14, afl: 17, st: 1 }
/** Stats API league ids expected for each level. aaa has two leagues. Spring Training is the major-league clubs' own games (sport 1, game type S), so it has no league id to check. */
export const EXPECTED_LEAGUES: Record<MilbLevel, readonly number[]> = { aaa: [117, 112], fsl: [123], afl: [119], st: [] }
export const AFL_LEAGUE_ID = 119
export const FSL_LEAGUE_NAME = 'Florida State League'

export const isLevel = (x: unknown): x is Level => x === 'mlb' || x === 'aaa' || x === 'fsl' || x === 'afl' || x === 'st'
export const isMilb = (l: Level): l is MilbLevel => l !== 'mlb'
export const isExhibition = (l: Level): l is ExhibitionLevel => l === 'afl' || l === 'st'
/** Anything unrecognised is MLB, so a bad or missing ?level= never reaches a minor-league table. */
export const parseLevel = (x: unknown): Level => (isLevel(x) ? x : DEFAULT_LEVEL)

/** The season a minor-league view shows: the one asked for if it is a plausible year, else this year. */
export function parseSeason(x: unknown, now = new Date().getFullYear()): number {
  const n = Number(x)
  return Number.isInteger(n) && n >= 2021 && n <= now + 1 ? n : now
}
