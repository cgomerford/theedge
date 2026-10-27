// src/lib/scout/abs-consts.ts: ABS constants with no server imports, so the client lab can use them (abs-desk.ts and abs-lab.ts pull in Supabase).
export const MIN_ABS_N = 5           // fewer challenges than this: shown faded
export const MIN_RANK_CHALLENGES = 20
export const MIN_UMP_GAMES = 15

/** Distance bands (inches off the zone edge, + outside) used for the "how close" chart; the same bands are used for the league line and each club. */
export const BANDS: { label: string; lo: number; hi: number }[] = [
  { label: 'Inside, 2+ in', lo: -Infinity, hi: -2 }, { label: 'Inside, 0 to 2 in', lo: -2, hi: 0 }, { label: 'Off the edge, 0 to 1 in', lo: 0, hi: 1 },
  { label: '1 to 2 in off', lo: 1, hi: 2 }, { label: '2 to 3 in off', lo: 2, hi: 3 }, { label: '3 to 4 in off', lo: 3, hi: 4 }, { label: '4+ in off', lo: 4, hi: Infinity },
]
export const bandOf = (d: number) => BANDS.findIndex(b => d >= b.lo && d < b.hi)
