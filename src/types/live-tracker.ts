// src/types/live-tracker.ts
//
// Types for two internal /admin tools — neither is public product surface,
// both exist to help spot and compile content (tweet material) faster than
// scrolling raw box scores. Nothing here is a rating or a prediction; every
// field is a literal derived stat, same discipline as the postgame report.

// ── Live tracker ────────────────────────────────────────────────────────

export type NotableEventCategory =
  | 'no-hitter-watch'
  | 'perfect-game-watch'
  | 'strikeout-milestone'
  | 'multi-hr'
  | 'cycle-watch'
  | 'todays-fastest-pitch'
  | 'todays-hardest-hit'
  | 'blowout'
  | 'walk-off-watch'
  | 'extra-innings'

export interface NotableEvent {
  id: string                 // stable/deterministic — used for client-side dedup
  category: NotableEventCategory
  gamePk: number
  gameSlug: string | null    // null until the game page's slug format is confirmed — see wiring notes
  matchup: string            // "WSH @ PHI"
  inning: number
  halfInning: 'top' | 'bottom'
  headline: string           // ready-to-scan, not necessarily ready-to-tweet
  detail: string
  detectedAt: string         // ISO timestamp, set when the API route builds the payload
}

export interface LiveGameCard {
  gamePk: number
  matchup: string
  awayAbbr: string
  homeAbbr: string
  awayName: string
  homeName: string
  awayTeamId: number
  homeTeamId: number
  awayScore: number
  homeScore: number
  inning: number | null
  inningHalf: 'top' | 'bottom' | null
  status: 'Preview' | 'Live' | 'Final'
}

export interface GameKeyStats {
  gamePk: number
  fastestPitch: { speed: number; pitcherId: number; pitcherName: string; inning: number } | null
  slowestPitch: { speed: number; pitcherId: number; pitcherName: string; typeDescription: string; inning: number } | null
  mostBreak: { breakLength: number; pitcherId: number; pitcherName: string; typeDescription: string; inning: number } | null
  highestSpin: { spinRate: number; pitcherId: number; pitcherName: string; inning: number } | null
  hardestHit: { exitVelo: number; batterId: number; batterName: string; inning: number } | null
  longestHit: { distance: number; batterId: number; batterName: string; inning: number } | null
  longestAtBat: { pitches: number; batterId: number; batterName: string; pitcherId: number; pitcherName: string; inning: number } | null
  mostPatientBatter: { batterId: number; batterName: string; pitchesSeen: number; plateAppearances: number } | null
  biggestInning: { teamAbbreviation: string; runs: number; inning: number } | null
  topSwingAndMiss: { pitcherId: number; pitcherName: string; swStrPct: number; pitchesThrown: number } | null
  rbiLeader: { batterId: number; batterName: string; rbi: number } | null
  runsLeader: { batterId: number; batterName: string; runs: number } | null
  stolenBaseLeader: { batterId: number; batterName: string; stolenBases: number } | null
  hardHitRate: { awayAbbr: string; awayPct: number; homeAbbr: string; homePct: number } | null
}

import type { LinescoreRow } from '@/types/postgame'

export interface LiveGamePanel {
  game: LiveGameCard
  keyStats: GameKeyStats
  events: NotableEvent[]   // flagged/conditional events for this game only, chronological
  linescore: LinescoreRow[] // already computed as part of the aggregation pass — free to expose
}

export interface LiveTrackerPayload {
  asOf: string
  panels: LiveGamePanel[]         // Live games, expandable
  finishedPanels: LiveGamePanel[] // Final games, also expandable — same shape, no live inning ticker
  otherGames: LiveGameCard[]      // Preview only — nothing to show yet, simple row
  headlineEvents: NotableEvent[]  // cross-game "best of today" — small strip, not the main feed
}

// ── Yesterday's stats digest ────────────────────────────────────────────

export type StatNuggetCategory =
  | 'fastest-pitch'
  | 'hardest-hit'
  | 'longest-hit'
  | 'strikeouts'
  | 'swinging-strike-pct'
  | 'multi-hr'
  | 'best-pitching-line'
  | 'longest-at-bat'
  | 'most-patient'
  | 'biggest-inning'
  | 'blowout-margin'

export interface StatNugget {
  id: string
  category: StatNuggetCategory
  rank: number                // 1-based within its category
  headline: string             // short, tweet-draftable
  value: string                // formatted display value, e.g. "101.4 mph"
  playerName: string | null
  teamAbbr: string | null
  opponentAbbr: string | null
  gameSlug: string
}

export interface YesterdayStatsPayload {
  date: string
  gamesIncluded: number
  gamesMissing: number         // games that couldn't be aggregated (no cache, feed unavailable, etc.)
  nuggets: StatNugget[]        // capped at 30, see compileYesterdayStats()
}

// ── Top-3-per-category digest (the A4 printout / PDF export feature) ─────
//
// Distinct from StatNugget above: that's a flat capped-at-30 list tuned for
// tweet drafting. This is a FIXED set of 20 categories, always exactly
// (up to) 3 entries each, built for the printable stat sheet in
// /admin/yesterday-stats. A category with zero qualifying performances
// still appears in the payload with entries: [] — the sheet renders an
// explicit "no qualifying performance" state for it rather than omitting
// the slot, so the print grid never reflows.

export type Top3StatCategory =
  | 'fastest-pitch'
  | 'hardest-hit'
  | 'longest-hr'
  | 'most-strikeouts'
  | 'best-swstr-pct'
  | 'multi-hr'
  | 'best-starter-line'
  | 'highest-spin'
  | 'sharpest-break'
  | 'longest-at-bat'
  | 'most-patient'
  | 'biggest-inning'
  | 'blowout-margin'
  | 'most-rbi'
  | 'most-stolen-bases'
  | 'most-extra-base-hits'
  | 'starter-strike-pct'
  | 'most-bullpen-innings'
  | 'hardest-hit-team'
  | 'most-pitches-starter'

export interface Top3Entry {
  rank: 1 | 2 | 3
  /** null for team-level categories (biggest-inning, blowout-margin,
   *  most-bullpen-innings, hardest-hit-team) — those render a team logo
   *  instead of a headshot, never a fabricated player attribution. */
  playerId: number | null
  playerName: string | null
  teamId: number | null
  teamAbbr: string | null
  opponentAbbr: string | null
  value: string      // formatted display value, e.g. "101.4 mph", "4.2 IP"
  detail: string      // short supporting context, e.g. "7th inning" or "vs PHI"
  gameSlug: string
}

export interface Top3Category {
  category: Top3StatCategory
  label: string           // display label, e.g. "Fastest Pitch"
  entries: Top3Entry[]    // 0-3, always sorted rank 1→3. Never padded to reach 3.
}

export interface Top3StatsPayload {
  date: string
  gamesIncluded: number
  gamesMissing: number
  categories: Top3Category[]   // fixed order, always all 20, even when a category has 0 entries
}