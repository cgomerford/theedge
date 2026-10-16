// src/lib/lab/player-streaks.ts
//
// Client-safe types + streak maths for the Lab "Players" panel. A streak is a
// run of consecutive games in which a player did something. Games where the
// player had no chance to (e.g. a defensive replacement with no at-bat) are
// skipped rather than breaking the run, the same way the official hit streak
// treats walk-only games.

export type GameLine = {
  d: string        // date, YYYY-MM-DD
  o: number        // opponent team id
  home: boolean
  pa: number; ab: number; h: number; d2: number; d3: number; hr: number
  r: number; rbi: number; bb: number; hbp: number; k: number; sb: number
  ps?: boolean     // postseason game
}

export type PlayerLog = { id: number; name: string; pos: string; bats: string; games: GameLine[] }
export type PitcherRef = { id: number; name: string; hand: string }
export type TeamPlayers = { teamId: number; season: number; hitters: PlayerLog[]; pitchers: PitcherRef[] }

export type StreakDef = {
  key: string
  label: string
  blurb: string
  eligible: (g: GameLine) => boolean
  hit: (g: GameLine) => boolean
}

const played = (g: GameLine) => g.pa > 0
export const STREAKS: StreakDef[] = [
  { key: 'hit', label: 'Hit streak', blurb: 'Consecutive games with a hit', eligible: g => g.ab > 0, hit: g => g.h > 0 },
  { key: 'onbase', label: 'On-base streak', blurb: 'Consecutive games reaching base', eligible: played, hit: g => g.h + g.bb + g.hbp > 0 },
  { key: 'multi', label: 'Multi-hit games', blurb: 'Consecutive games with 2+ hits', eligible: g => g.ab > 0, hit: g => g.h >= 2 },
  { key: 'xbh', label: 'Extra-base hits', blurb: 'Consecutive games with a double, triple or homer', eligible: g => g.ab > 0, hit: g => g.d2 + g.d3 + g.hr > 0 },
  { key: 'hr', label: 'Home runs', blurb: 'Consecutive games with a homer', eligible: played, hit: g => g.hr > 0 },
  { key: 'rbi', label: 'RBI', blurb: 'Consecutive games driving in a run', eligible: played, hit: g => g.rbi > 0 },
  { key: 'run', label: 'Runs scored', blurb: 'Consecutive games scoring', eligible: played, hit: g => g.r > 0 },
  { key: 'walk', label: 'Walks', blurb: 'Consecutive games drawing a walk', eligible: played, hit: g => g.bb > 0 },
  { key: 'sb', label: 'Stolen bases', blurb: 'Consecutive games with a steal', eligible: played, hit: g => g.sb > 0 },
  { key: 'nok', label: 'No strikeouts', blurb: 'Consecutive games without striking out', eligible: played, hit: g => g.k === 0 },
  { key: 'hitless', label: 'Hitless (cold)', blurb: 'Consecutive games without a hit', eligible: g => g.ab > 0, hit: g => g.h === 0 },
]
export const STREAK_BY_KEY = new Map(STREAKS.map(s => [s.key, s]))

export type StreakResult = {
  current: number; currentFrom: string | null
  longest: number; longestFrom: string | null; longestTo: string | null
  /** dates of the games inside the current run, for highlighting */
  currentDates: Set<string>
  /** every qualifying game in the active run / the best run, oldest first */
  currentGames: GameLine[]
  longestGames: GameLine[]
}

export function streakOf(games: GameLine[], def: StreakDef): StreakResult {
  const log = [...games].sort((a, b) => a.d.localeCompare(b.d))
  let run: GameLine[] = []
  let best: GameLine[] = []
  for (const g of log) {
    if (!def.eligible(g)) continue
    if (def.hit(g)) { run.push(g); if (run.length > best.length) best = [...run] } else run = []
  }
  return {
    current: run.length, currentFrom: run[0]?.d ?? null,
    longest: best.length, longestFrom: best[0]?.d ?? null, longestTo: best[best.length - 1]?.d ?? null,
    currentDates: new Set(run.map(g => g.d)), currentGames: run, longestGames: best,
  }
}

export function lineText(g: GameLine): string {
  const bits = [`${g.h}-${g.ab}`]
  if (g.hr) bits.push(g.hr === 1 ? 'HR' : `${g.hr} HR`)
  if (g.d2) bits.push(g.d2 === 1 ? '2B' : `${g.d2} 2B`)
  if (g.d3) bits.push('3B')
  if (g.rbi) bits.push(`${g.rbi} RBI`)
  if (g.bb) bits.push(g.bb === 1 ? 'BB' : `${g.bb} BB`)
  if (g.k) bits.push(g.k === 1 ? 'K' : `${g.k} K`)
  if (g.sb) bits.push(g.sb === 1 ? 'SB' : `${g.sb} SB`)
  return bits.join(', ')
}

export type H2HLine = { pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; k: number; avg: string; ops: string }

export type History = Record<number, GameLine[]>
