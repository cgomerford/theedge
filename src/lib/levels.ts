// src/lib/levels.ts
//
// The one list of professional baseball levels the site shows, keyed by the MLB Stats API sportId.
// Verified against GET /api/v1/sports (2026-11-11): 1 MLB, 11 Triple-A, 12 Double-A, 13 High-A, 14 Single-A, 16 Rookie, 17 Winter Leagues.
// (player-levels.ts used to call 13 "A", which hid Single-A and Rookie ball. It should use this list.)

export const LEVELS = [
  { key: 'mlb', label: 'MLB', name: 'Major League', sportId: 1 },
  { key: 'aaa', label: 'AAA', name: 'Triple-A', sportId: 11 },
  { key: 'aa', label: 'AA', name: 'Double-A', sportId: 12 },
  { key: 'higha', label: 'High-A', name: 'High-A', sportId: 13 },
  { key: 'a', label: 'A', name: 'Single-A', sportId: 14 },
  { key: 'rk', label: 'Rookie', name: 'Rookie', sportId: 16 },
  // Winter Leagues (sportId 17) hold the Arizona Fall League, where clubs send prospects after the minor-league season.
  { key: 'winter', label: 'Fall/Winter', name: 'Fall and Winter League', sportId: 17 },
] as const

export type LevelKey = typeof LEVELS[number]['key']

export const LEVEL_BY_SPORT_ID: Record<number, typeof LEVELS[number]> = Object.fromEntries(LEVELS.map(l => [l.sportId, l]))
export const SPORT_IDS = LEVELS.map(l => l.sportId).join(',')
