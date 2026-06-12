// src/lib/nfl-game.ts
// Fetches NFL game data from Supabase for the game page.
// Combines nfl_game_data (box scores) + nfl_team_stats (season stats) + nfl_edge_scores.

import { createAdminClient } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NFLGameDBData = {
  id: number
  event_id: string
  slug: string
  season: number
  week: number
  date: string
  status: string
  home_team_id: string
  home_team_abbr: string
  home_team_name: string
  home_team_logo: string
  away_team_id: string
  away_team_abbr: string
  away_team_name: string
  away_team_logo: string
  home_score: number | null
  away_score: number | null
  venue_name: string | null
  venue_city: string | null
  is_dome: boolean
  broadcast: string | null
  home_record: string | null
  away_record: string | null
  home_pass_yards: number | null
  home_rush_yards: number | null
  home_total_yards: number | null
  home_turnovers: number | null
  home_third_down_pct: string | null
  home_red_zone_pct: string | null
  home_time_of_possession: string | null
  away_pass_yards: number | null
  away_rush_yards: number | null
  away_total_yards: number | null
  away_turnovers: number | null
  away_third_down_pct: string | null
  away_red_zone_pct: string | null
  away_time_of_possession: string | null
}

export type NFLTeamStatsData = {
  team_id: string
  season: number
  abbreviation: string
  name: string
  wins: number
  losses: number
  ties: number
  win_pct: number | null
  points_for: number | null
  points_against: number | null
  pass_yards_per_game: number | null
  pass_yards_total: number | null
  pass_tds: number | null
  pass_ints: number | null
  completion_pct: number | null
  pass_yards_per_attempt: number | null
  pass_sacks_allowed: number | null
  rush_yards_per_game: number | null
  rush_yards_total: number | null
  rush_tds: number | null
  rush_yards_per_carry: number | null
  points_per_game: number | null
  red_zone_pct: number | null
  third_down_pct: number | null
  def_points_allowed_per_game: number | null
  def_pass_yards_allowed: number | null
  def_rush_yards_allowed: number | null
  def_total_yards_allowed: number | null
  def_sacks: number | null
  def_interceptions: number | null
  def_turnovers_forced: number | null
  def_third_down_pct_allowed: number | null
  def_red_zone_pct_allowed: number | null
}

export type NFLEdgeScoreData = {
  edge_score: number | null
  confidence_tier: string | null
  predicted_winner: string | null
  narrative_free: string | null
  narrative_pro: string | null
  comp_qb: number | null
  comp_oline: number | null
  comp_pass_defense: number | null
  comp_run_game: number | null
  comp_home_field: number | null
  comp_rest_travel: number | null
  comp_weather: number | null
  comp_injuries: number | null
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

export async function getNFLGameBySlugDB(slug: string): Promise<NFLGameDBData | null> {
  const supa = createAdminClient()
  const { data } = await supa
    .from('nfl_game_data')
    .select('*')
    .eq('slug', slug)
    .single()
    .then(r => r, () => ({ data: null }))
  return data ?? null
}

export async function getNFLTeamStats(
  teamId: string,
  season: number = 2025
): Promise<NFLTeamStatsData | null> {
  const supa = createAdminClient()
  const { data } = await supa
    .from('nfl_team_stats')
    .select('*')
    .eq('team_id', teamId)
    .eq('season', season)
    .single()
    .then(r => r, () => ({ data: null }))
  return data ?? null
}

export async function getNFLEdgeScore(slug: string): Promise<NFLEdgeScoreData | null> {
  const supa = createAdminClient()
  const { data } = await supa
    .from('nfl_edge_scores')
    .select('*')
    .eq('slug', slug)
    .single()
    .then(r => r, () => ({ data: null }))
  return data ?? null
}

// ── Combined fetch for game page ──────────────────────────────────────────────

export async function getNFLGamePageData(slug: string) {
  const [dbGame, edgeScore] = await Promise.all([
    getNFLGameBySlugDB(slug),
    getNFLEdgeScore(slug),
  ])

  // Get team stats using team IDs from the game record
  let homeStats: NFLTeamStatsData | null = null
  let awayStats: NFLTeamStatsData | null = null

  if (dbGame) {
    const season = dbGame.season ?? 2025
    ;[homeStats, awayStats] = await Promise.all([
      getNFLTeamStats(dbGame.home_team_id, season),
      getNFLTeamStats(dbGame.away_team_id, season),
    ])
  }

  return {
    dbGame,
    homeStats,
    awayStats,
    edgeScore: edgeScore?.edge_score ?? null,
    narrative: edgeScore?.narrative_free ?? null,
  }
}
