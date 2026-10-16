// src/components/admin/story/postgame/copy.ts
//
// Fixed strings for the Postgame Reel. Scouting language only (CLAUDE.md §1).

export const PG_KICKER = 'X9LAB · POSTGAME'
export const PG_FINAL_HEADLINE = 'FINAL'
export const PG_FLOW_KICKER = 'HOW IT UNFOLDED'
export const PG_FLOW_HEADLINE = 'THE GAME FLOW'
export const PG_PLAYS_KICKER = 'KEY PLAYS'
export const PG_PLAYS_HEADLINE = 'THE TURNING POINTS'
export const PG_HITTERS_KICKER = 'AT THE PLATE'
export const PG_HITTERS_HEADLINE = 'TOP HITTERS'
export const PG_PITCHING_KICKER = 'ON THE MOUND'
export const PG_PITCHING_HEADLINE = 'PITCHING LINES'
export const PG_SPRAY_KICKER = 'HITS ON THE FIELD'

export const inningLabel = (half: 'top' | 'bottom', inning: number) => `${half === 'top' ? 'T' : 'B'}${inning}`

/** Clamp a play description so it can never overflow its 2-line slot. */
export const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)
