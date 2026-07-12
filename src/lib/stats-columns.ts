// src/lib/stats-columns.ts
//
// Single source of truth for /stats table columns. Table headers, sort keys,
// chart axis dropdowns, and (later) CSV export all read from here.
//
// Data sources per subject type (this matters for stats-data.ts):
// - PITCHER: single Supabase query against `pitcher_stats` (season, real
//   column names below). Fast — one query returns every pitcher.
// - BATTER: no season-stats table exists yet. getBatterSeasonStats() in
//   batter-stats.ts fetches ONE PLAYER AT A TIME from the live MLB Stats API,
//   and getBatterStatcast() pulls from a Savant CSV leaderboard (all players,
//   one fetch — this part's fine). The per-player MLB API call is the
//   problem: a full qualified-batter table is 150-200+ live calls per page
//   load if built naively. See the note in stats-data.ts before building it.
//
// `advanced: true` columns are known FanGraphs-only gaps (era_minus,
// fip_minus, xfip_minus, war) — present in the schema, null for ~everyone.
// Hide the row/cell when null, same convention as player-card-stats.ts.

export type SubjectType = 'batter' | 'pitcher'

export type StatColumn = {
  key: string
  label: string
  format?: (v: number) => string
  higherIsBetter?: boolean
  advanced?: boolean // hide when null — known data gap, not a bug
}

export type StatCategory = {
  key: string
  label: string
  cols: StatColumn[]
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%` // MLB API / Supabase store these as 0-1 decimals, not 0-100
const pct100 = (v: number) => `${v.toFixed(1)}%`       // Savant CSV fields already come as 0-100
const rate3 = (v: number) => v.toFixed(3).replace(/^0/, '')
const rate2 = (v: number) => v.toFixed(2)
const rate1 = (v: number) => v.toFixed(1)

// ── BATTER ──────────────────────────────────────────────────────────────
// Overview: getBatterSeasonStats() (live MLB API, per-player)
// Statcast:  getBatterStatcast() (Savant CSV leaderboard, all-players-in-one-fetch)
export const BATTER_CATEGORIES: StatCategory[] = [
  {
    key: 'overview', label: 'Overview',
    cols: [
      { key: 'games', label: 'G' }, // only populated via the bulk league fetch — see stats-data.ts note
      { key: 'pa', label: 'PA' },
      { key: 'hits', label: 'H' },
      { key: 'avg', label: 'AVG', format: v => v.toFixed(3).replace(/^0/, '') },   // string from API, parse before format
      { key: 'obp', label: 'OBP', format: v => v.toFixed(3).replace(/^0/, '') },
      { key: 'slg', label: 'SLG', format: v => v.toFixed(3).replace(/^0/, '') },
      { key: 'ops', label: 'OPS', format: v => v.toFixed(3) },
      { key: 'home_runs', label: 'HR' },
      { key: 'rbi', label: 'RBI' },
      { key: 'stolen_bases', label: 'SB' },
      { key: 'iso', label: 'ISO', format: rate3 },
      { key: 'babip', label: 'BABIP', format: rate3 },
    ],
  },
  {
    key: 'statcast', label: 'Statcast',
    cols: [
      { key: 'avg_exit_velocity', label: 'Avg EV', format: rate1 },
      { key: 'max_exit_velocity', label: 'Max EV', format: rate1 },
      { key: 'barrel_pct', label: 'Barrel%', format: pct100 },
      { key: 'hard_hit_pct', label: 'HardHit%', format: pct100 },
      { key: 'sweet_spot_pct', label: 'Sweet Spot%', format: pct100 },
      { key: 'xba', label: 'xBA', format: rate3 },
      { key: 'xslg', label: 'xSLG', format: rate3 },
      { key: 'xwoba', label: 'xwOBA', format: rate3 },
    ],
  },
  {
    key: 'discipline', label: 'Plate discipline',
    cols: [
      { key: 'bb_pct', label: 'BB%', format: pct100 },
      { key: 'k_pct', label: 'K%', format: pct100, higherIsBetter: false },
      { key: 'walks', label: 'BB' },
      { key: 'strikeouts', label: 'K', higherIsBetter: false },
    ],
  },
  {
    key: 'baserunning', label: 'Baserunning',
    cols: [
      { key: 'stolen_bases', label: 'SB' },
      { key: 'sprint_speed', label: 'Sprint spd', format: v => `${rate1(v)} ft/s` },
    ],
  },
]

// ── PITCHER ─────────────────────────────────────────────────────────────
// All from `pitcher_stats` (single Supabase query, season row per pitcher).
export const PITCHER_CATEGORIES: StatCategory[] = [
  {
    key: 'overview', label: 'Overview',
    cols: [
      { key: 'games_played', label: 'G' },
      { key: 'starts', label: 'GS' },
      { key: 'innings_pitched', label: 'IP', format: rate1 },
      { key: 'wins', label: 'W' },
      { key: 'losses', label: 'L' },
      { key: 'era', label: 'ERA', format: rate2, higherIsBetter: false },
      { key: 'whip', label: 'WHIP', format: rate2, higherIsBetter: false },
      { key: 'k_per_9', label: 'K/9', format: rate1 },
      { key: 'bb_per_9', label: 'BB/9', format: rate1, higherIsBetter: false },
      { key: 'fip', label: 'FIP', format: rate2, higherIsBetter: false },
    ],
  },
  {
    key: 'statcast', label: 'Statcast',
    cols: [
      { key: 'avg_exit_velocity', label: 'Avg EV agn', format: rate1, higherIsBetter: false },
      { key: 'hard_hit_pct', label: 'HardHit% agn', format: pct, higherIsBetter: false },
      { key: 'barrel_pct', label: 'Barrel% agn', format: pct, higherIsBetter: false },
      { key: 'xera', label: 'xERA', format: rate2, higherIsBetter: false },
      { key: 'xwoba_allowed', label: 'xwOBA agn', format: rate3, higherIsBetter: false },
      { key: 'swstr_pct', label: 'SwStr%', format: pct },
      { key: 'chase_rate', label: 'Chase%', format: pct },
    ],
  },
  {
    key: 'command', label: 'Command',
    cols: [
      { key: 'k_per_9', label: 'K/9', format: rate1 },
      { key: 'bb_per_9', label: 'BB/9', format: rate1, higherIsBetter: false },
      { key: 'k_bb_ratio', label: 'K/BB', format: rate2 },
      { key: 'first_pitch_strike_pct', label: 'F-Strike%', format: pct },
      { key: 'zone_contact_rate', label: 'Zone Contact%', format: pct },
      { key: 'quality_start_pct', label: 'QS%', format: pct },
    ],
  },
  {
    key: 'batted_ball', label: 'Batted ball',
    cols: [
      { key: 'gb_rate', label: 'GB%', format: pct },
      { key: 'line_drive_pct', label: 'LD%', format: pct },
      { key: 'flyball_pct', label: 'FB%', format: pct },
      { key: 'hr_per_fb', label: 'HR/FB', format: pct },
      { key: 'soft_contact_pct', label: 'Soft%', format: pct },
      { key: 'hard_contact_pct', label: 'Hard%', format: pct, higherIsBetter: false },
    ],
  },
  {
    key: 'advanced', label: 'Advanced (FanGraphs)',
    cols: [
      { key: 'era_minus', label: 'ERA-', format: v => String(Math.round(v)), higherIsBetter: false, advanced: true },
      { key: 'fip_minus', label: 'FIP-', format: v => String(Math.round(v)), higherIsBetter: false, advanced: true },
      { key: 'xfip_minus', label: 'xFIP-', format: v => String(Math.round(v)), higherIsBetter: false, advanced: true },
      { key: 'war', label: 'WAR', format: rate1, advanced: true },
    ],
  },
]

export function categoriesFor(subject: SubjectType): StatCategory[] {
  return subject === 'batter' ? BATTER_CATEGORIES : PITCHER_CATEGORIES
}

export const POSITIONS: Record<SubjectType, string[]> = {
  batter: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'],
  pitcher: ['SP', 'RP'],
}

// Career chart y-axis stat per subject type.
export const SIGNATURE_STAT: Record<SubjectType, string> = {
  batter: 'ops',
  pitcher: 'era',
}