/**
 * lib/nfl/queries.ts
 *
 * Server-side data fetching for NFL pages. Follows the established
 * pattern: pages read only from precomputed tables (nfl_games,
 * nfl_team_season_reports, nfl_players), no request-time aggregation
 * of raw weekly data.
 *
 * FIXED from the first version: uses the REAL client --
 * createAdminClient() from '@/lib/supabase', confirmed by reading
 * lib/supabase.ts directly. It's synchronous (no await) and built
 * without a Database generic, so Supabase has no schema to infer row
 * shapes from -- .select("*") resolves to {} without help. Every
 * query below is followed by an explicit cast to a hand-written row
 * interface (matching the actual SQL column names/types from the
 * migration files) rather than relying on inference that isn't there.
 */

import { createAdminClient } from "@/lib/supabase";
import { similarityKeysForPosition } from "@/lib/nfl/player-stats-config";

/**
 * Earliest season with real backfilled data across the NFL pipeline.
 * Matches SEASONS = range(2021, 2027) in every sync script. Any
 * "Career" UI should read this rather than hardcoding "2021" --
 * bumping this later (deeper backfill) should be a one-line change
 * that automatically updates every "since {year}" label in the UI.
 * Pair with a visible note wherever career/multi-year data shows --
 * e.g. "Career stats since 2021 -- earlier seasons coming soon" --
 * so 6 years is never silently presented as a full career.
 */
export const CAREER_DATA_START_SEASON = 2021;

// ---------------------------------------------------------------------
// Row interfaces -- match nfl_*.sql migrations column-for-column.
// Supabase numeric columns return as strings over the JS client, so
// anything declared `numeric` in SQL is typed `string | null` here
// and coerced with Number() at the point of use, not in these types.
// ---------------------------------------------------------------------

interface NflGamesRow {
  game_id: string;
  season: number;
  season_type: string;
  week: number;
  gameday: string;
  gametime: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  game_status: string;
  stadium: string | null;
  roof: string | null;
  surface: string | null;
  temp: number | null;
  wind: number | null;
  referee: string | null;
  div_game: boolean;
  overtime: boolean;
  away_rest: number | null;
  home_rest: number | null;
  home_qb_id: string | null;
  home_qb_name: string | null;
  away_qb_id: string | null;
  away_qb_name: string | null;
}

interface NflTeamsRow {
  team_id: string;
  team_name: string;
  team_nick: string;
  conference: string | null;
  division: string | null;
  team_color: string | null;
  team_color2: string | null;
  team_logo_url: string | null;
  team_wordmark_url: string | null;
}

interface NflTeamSeasonReportsRow {
  team_id: string;
  season: number;
  through_week: number;
  games_played: number;
  off_epa_per_play_szn: string | null;
  def_epa_per_play_szn: string | null;
  off_epa_rank: number | null;
  def_epa_rank: number | null;
  is_reliable_sample: boolean;
  wins: string | null;
  losses: string | null;
  ties: string | null;
  points_for: string | null;
  points_against: string | null;
  points_per_game: string | null;
  points_allowed_per_game: string | null;
}

interface NflEdgeFactorsRow {
  game_id: string;
  edge_team: string | null;
  factors_lean_count: number | null;
  confidence: string | null;
}

interface NflPlayersRow {
  gsis_id: string;
  full_name: string;
  position: string;
  team_id: string;
  jersey_number: number | null;
  headshot_url: string | null;
  height: number | null;
  weight: number | null;
  college: string | null;
  years_exp: number | null;
}

interface NflPlayerStatsWeeklyRow {
  week: number;
  completions: number | null;
  attempts: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  targets: number | null;
  receptions: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
}

interface NflNextGenStatsRow {
  raw_source_json: Record<string, unknown>;
}

interface NflPlayerFormSignalsRow {
  epa_trend_l4: string | null;
  epa_trend_szn: string | null;
  usage_trend_l4: string | null;
  is_reliable_sample: boolean;
}

// ---------------------------------------------------------------------
// Public DTOs -- what the page components actually consume.
// ---------------------------------------------------------------------

export interface NflGameCard {
  gameId: string;
  season: number;
  week: number;
  gameday: string;
  gametime: string | null;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  homeScore: number | null;
  awayScore: number | null;
  gameStatus: string;
  stadium: string | null;
  roof: string | null;
  homeQbName: string | null;
  awayQbName: string | null;
  edge: EdgeSummary | null;
}

export interface TeamSummary {
  teamId: string;
  teamName: string;
  teamNick: string;
  teamColor: string;
  teamColor2: string;
  logoUrl: string;
  record: string | null;
  pointsPerGame: number | null;
  pointsAllowedPerGame: number | null;
  offEpaRank: number | null;
  defEpaRank: number | null;
}

export interface EdgeSummary {
  edgeTeam: string | null;
  factorsLeanCount: number | null;
  confidence: string | null;
}

/**
 * Determines which season to show stats for: 2026 if it has any
 * completed games yet, otherwise falls back to 2025. Checked once
 * per page load (not once per query) -- pass the result into every
 * other function below rather than re-resolving it repeatedly.
 */
export async function getActiveStatsSeason(): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("nfl_games")
    .select("*", { count: "exact", head: true })
    .eq("season", 2026)
    .eq("game_status", "final");
  return count && count > 0 ? 2026 : 2025;
}

export async function getThisWeeksGames(statsSeason: number): Promise<NflGameCard[]> {
  const supabase = createAdminClient();

  const { data: weekRowsRaw } = await supabase
    .from("nfl_games")
    .select("week, game_status, gameday")
    .eq("season", 2026)
    .order("gameday", { ascending: true });
  const weekRows = (weekRowsRaw ?? []) as Pick<NflGamesRow, "week" | "game_status" | "gameday">[];

  if (weekRows.length === 0) return [];

  const upcoming = weekRows.find((g) => g.game_status !== "final");
  const targetWeek = upcoming ? upcoming.week : weekRows[weekRows.length - 1].week;

  const { data: gamesRaw } = await supabase
    .from("nfl_games")
    .select("*")
    .eq("season", 2026)
    .eq("week", targetWeek)
    .order("gametime", { ascending: true });
  const games = (gamesRaw ?? []) as NflGamesRow[];

  if (games.length === 0) return [];

  const teamIds = Array.from(new Set(games.flatMap((g) => [g.home_team, g.away_team])));

  const { data: teamsRaw } = await supabase.from("nfl_teams").select("*").in("team_id", teamIds);
  const teams = (teamsRaw ?? []) as NflTeamsRow[];

  const { data: reportsRaw } = await supabase
    .from("nfl_team_season_reports")
    .select("*")
    .in("team_id", teamIds)
    .eq("season", statsSeason);
  const reports = (reportsRaw ?? []) as NflTeamSeasonReportsRow[];

  const { data: edgesRaw } = await supabase
    .from("nfl_edge_factors")
    .select("game_id, edge_team, factors_lean_count, confidence")
    .in(
      "game_id",
      games.map((g) => g.game_id)
    );
  const edges = (edgesRaw ?? []) as NflEdgeFactorsRow[];

  const teamById = new Map(teams.map((t) => [t.team_id, t]));
  const reportById = new Map(reports.map((r) => [r.team_id, r]));
  const edgeByGame = new Map(edges.map((e) => [e.game_id, e]));

  const toTeamSummary = (teamId: string): TeamSummary => {
    const t = teamById.get(teamId);
    const r = reportById.get(teamId);
    const wins = r?.wins != null ? Number(r.wins) : null;
    const losses = r?.losses != null ? Number(r.losses) : null;
    const ties = r?.ties != null ? Number(r.ties) : null;
    return {
      teamId,
      teamName: t?.team_name ?? teamId,
      teamNick: t?.team_nick ?? teamId,
      teamColor: t?.team_color ?? "#1A1A1A",
      teamColor2: t?.team_color2 ?? "#1A1A1A",
      logoUrl: t?.team_logo_url ?? "",
      record: r && r.games_played > 0 && wins != null && losses != null
        ? `${wins}-${losses}${ties ? `-${ties}` : ""}`
        : null,
      pointsPerGame: r?.points_per_game != null ? Number(r.points_per_game) : null,
      pointsAllowedPerGame: r?.points_allowed_per_game != null ? Number(r.points_allowed_per_game) : null,
      offEpaRank: r?.off_epa_rank ?? null,
      defEpaRank: r?.def_epa_rank ?? null,
    };
  };

  return games.map((g) => {
    const edge = edgeByGame.get(g.game_id);
    return {
      gameId: g.game_id,
      season: g.season,
      week: g.week,
      gameday: g.gameday,
      gametime: g.gametime,
      homeTeam: toTeamSummary(g.home_team),
      awayTeam: toTeamSummary(g.away_team),
      homeScore: g.home_score,
      awayScore: g.away_score,
      gameStatus: g.game_status,
      stadium: g.stadium,
      roof: g.roof,
      homeQbName: g.home_qb_name,
      awayQbName: g.away_qb_name,
      edge: edge
        ? {
            edgeTeam: edge.edge_team,
            factorsLeanCount: edge.factors_lean_count,
            confidence: edge.confidence,
          }
        : null,
    };
  });
}

export interface TeamWithReport {
  teamId: string;
  teamName: string;
  teamNick: string;
  conference: string | null;
  division: string | null;
  teamColor: string;
  teamColor2: string;
  logoUrl: string;
  record: string | null;
  offEpaRank: number | null;
  defEpaRank: number | null;
  /** e.g. "#4 OFF" if off/def rank is top 10, else null. Prefers
   * whichever rank is better when both qualify. */
  topTenBadge: string | null;
}

function computeTopTenBadge(offRank: number | null, defRank: number | null): string | null {
  const candidates: { rank: number; label: string }[] = [];
  if (offRank != null && offRank <= 10) candidates.push({ rank: offRank, label: "OFF" });
  if (defRank != null && defRank <= 10) candidates.push({ rank: defRank, label: "DEF" });
  if (candidates.length === 0) return null;
  const best = candidates.sort((a, b) => a.rank - b.rank)[0];
  return `#${best.rank} ${best.label}`;
}

export async function getAllTeamsWithReports(statsSeason: number): Promise<TeamWithReport[]> {
  const supabase = createAdminClient();

  const { data: teamsRaw } = await supabase.from("nfl_teams").select("*").order("team_id");
  const teams = (teamsRaw ?? []) as NflTeamsRow[];

  const { data: reportsRaw } = await supabase
    .from("nfl_team_season_reports")
    .select("*")
    .eq("season", statsSeason);
  const reports = (reportsRaw ?? []) as NflTeamSeasonReportsRow[];

  const reportById = new Map(reports.map((r) => [r.team_id, r]));

  return teams.map((t) => {
    const r = reportById.get(t.team_id);
    const wins = r?.wins != null ? Number(r.wins) : null;
    const losses = r?.losses != null ? Number(r.losses) : null;
    const ties = r?.ties != null ? Number(r.ties) : null;
    return {
      teamId: t.team_id,
      teamName: t.team_name,
      teamNick: t.team_nick,
      conference: t.conference,
      division: t.division,
      teamColor: t.team_color ?? "#1A1A1A",
      teamColor2: t.team_color2 ?? "#1A1A1A",
      logoUrl: t.team_logo_url ?? "",
      record: r && r.games_played > 0 && wins != null && losses != null
        ? `${wins}-${losses}${ties ? `-${ties}` : ""}`
        : null,
      offEpaRank: r?.off_epa_rank ?? null,
      defEpaRank: r?.def_epa_rank ?? null,
      topTenBadge: computeTopTenBadge(r?.off_epa_rank ?? null, r?.def_epa_rank ?? null),
    };
  });
}

export interface NflPlayerProfile {
  gsisId: string;
  fullName: string;
  position: string;
  teamId: string;
  jerseyNumber: number | null;
  headshotUrl: string | null;
  heightIn: number | null;
  weightLb: number | null;
  college: string | null;
  yearsExp: number | null;
  team: TeamSummary | null;
  statsSeason: number;
  seasonTotals: PlayerSeasonTotals | null;
  gameLog: PlayerGameLogRow[];
  nextGen: Record<string, unknown> | null;
  form: PlayerForm | null;
}

export interface PlayerSeasonTotals {
  gamesPlayed: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  rushingYards: number;
  rushingTds: number;
  receivingYards: number;
  receivingTds: number;
  receptions: number;
  targets: number;
}

export interface PlayerGameLogRow {
  week: number;
  opponent: string | null;
  completions: number | null;
  attempts: number | null;
  passingYards: number | null;
  passingTds: number | null;
  interceptions: number | null;
  carries: number | null;
  rushingYards: number | null;
  rushingTds: number | null;
  targets: number | null;
  receptions: number | null;
  receivingYards: number | null;
  receivingTds: number | null;
}

export interface PlayerForm {
  epaTrendL4: number | null;
  epaTrendSzn: number | null;
  usageTrendL4: number | null;
  isReliableSample: boolean;
}

// ---------------------------------------------------------------------
// Season leaderboards -- QB/WR/RB stat panels + Advanced Stats (NGS).
// Live-aggregated from nfl_player_stats_weekly per position. This is
// a fan-out across many players' weekly rows, which the established
// pattern says should be precomputed -- but at current data volume
// (a few hundred skill-position rows per season) this is a single
// cheap query, not the kind of N+1/sequential-API-call problem the
// precompute-cron pattern exists to solve. Worth revisiting as a
// precomputed table if the leaderboard queries start showing up in
// page-load timing once the season is in full swing.
// ---------------------------------------------------------------------

export interface LeaderRow {
  gsisId: string;
  fullName: string;
  teamId: string;
  headshotUrl: string | null;
  statValue: number;
}

async function getPositionLeaders(
  position: "QB" | "RB" | "WR" | "TE",
  statField: keyof NflPlayerStatsWeeklyRow,
  statsSeason: number,
  limit = 5
): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .eq("position", position);
  const players = (playersRaw ?? []) as Pick<
    NflPlayersRow,
    "gsis_id" | "full_name" | "team_id" | "headshot_url"
  >[];
  const playerIds = players.map((p) => p.gsis_id);
  if (playerIds.length === 0) return [];

  const { data: statsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select(`player_id, ${String(statField)}`)
    .eq("season", statsSeason)
    .in("player_id", playerIds);
  const stats = (statsRaw ?? []) as unknown as { player_id: string; [key: string]: unknown }[];

  const totals = new Map<string, number>();
  for (const row of stats) {
    const v = Number(row[statField as string]) || 0;
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + v);
  }

  const playerById = new Map(players.map((p) => [p.gsis_id, p]));

  return Array.from(totals.entries())
    .map(([gsisId, statValue]) => {
      const p = playerById.get(gsisId);
      return {
        gsisId,
        fullName: p?.full_name ?? gsisId,
        teamId: p?.team_id ?? "",
        headshotUrl: p?.headshot_url ?? null,
        statValue,
      };
    })
    .filter((r) => r.statValue > 0)
    .sort((a, b) => b.statValue - a.statValue)
    .slice(0, limit);
}

export const getQbLeaders = (statsSeason: number, limit = 10) =>
  getPositionLeaders("QB", "passing_yards", statsSeason, limit);
export const getRbLeaders = (statsSeason: number, limit = 10) =>
  getPositionLeaders("RB", "rushing_yards", statsSeason, limit);
export const getWrLeaders = (statsSeason: number, limit = 10) =>
  getPositionLeaders("WR", "receiving_yards", statsSeason, limit);
export const getTeLeaders = (statsSeason: number, limit = 10) =>
  getPositionLeaders("TE", "receiving_yards", statsSeason, limit);

// ---------------------------------------------------------------------
// Defense and Special Teams leaderboards. Sourced from
// nfl_player_defense_stats_weekly / nfl_special_teams_stats_weekly,
// synced by sync_defense_special_teams.py.
// ---------------------------------------------------------------------

async function getDefenseLeaders(
  statField: string,
  statsSeason: number,
  limit = 5
): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: statsRaw } = await supabase
    .from("nfl_player_defense_stats_weekly")
    .select(`player_id, ${statField}`)
    .eq("season", statsSeason);
    const stats = (statsRaw ?? []) as unknown as { player_id: string; [key: string]: unknown }[];

  const totals = new Map<string, number>();
  for (const row of stats) {
    const v = Number(row[statField]) || 0;
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + v);
  }

  return await resolveLeaderRows(totals, limit);
}

/** Turnovers panel: interceptions + forced fumbles + recovered fumbles combined. */
async function getTurnoverLeaders(statsSeason: number, limit = 5): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: statsRaw } = await supabase
    .from("nfl_player_defense_stats_weekly")
    .select("player_id, interceptions, fumbles_forced, fumbles_recovered")
    .eq("season", statsSeason);
  const stats = (statsRaw ?? []) as {
    player_id: string;
    interceptions: number | null;
    fumbles_forced: number | null;
    fumbles_recovered: number | null;
  }[];

  const totals = new Map<string, number>();
  for (const row of stats) {
    const v = (row.interceptions ?? 0) + (row.fumbles_forced ?? 0) + (row.fumbles_recovered ?? 0);
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + v);
  }

  return await resolveLeaderRows(totals, limit);
}

async function getSpecialTeamsLeaders(
  statField: string,
  statsSeason: number,
  limit = 5
): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: statsRaw } = await supabase
    .from("nfl_special_teams_stats_weekly")
    .select(`player_id, ${statField}`)
    .eq("season", statsSeason);
    const stats = (statsRaw ?? []) as unknown as { player_id: string; [key: string]: unknown }[];

  const totals = new Map<string, number>();
  for (const row of stats) {
    const v = Number(row[statField]) || 0;
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + v);
  }

  return await resolveLeaderRows(totals, limit);
}

/** Shared helper: turn a player_id -> total map into ranked LeaderRows with name/team/headshot. */
async function resolveLeaderRows(totals: Map<string, number>, limit: number): Promise<LeaderRow[]> {
  const supabase = createAdminClient();
  const playerIds = Array.from(totals.keys());
  if (playerIds.length === 0) return [];

  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .in("gsis_id", playerIds);
  const playerById = new Map(
    ((playersRaw ?? []) as Pick<NflPlayersRow, "gsis_id" | "full_name" | "team_id" | "headshot_url">[]).map(
      (p) => [p.gsis_id, p]
    )
  );

  return Array.from(totals.entries())
    .map(([gsisId, statValue]) => {
      const p = playerById.get(gsisId);
      return {
        gsisId,
        fullName: p?.full_name ?? gsisId,
        teamId: p?.team_id ?? "",
        headshotUrl: p?.headshot_url ?? null,
        statValue,
      };
    })
    .filter((r) => r.statValue > 0)
    .sort((a, b) => b.statValue - a.statValue)
    .slice(0, limit);
}

export const getInterceptionLeaders = (statsSeason: number, limit = 5) =>
  getDefenseLeaders("interceptions", statsSeason, limit);
export const getTacklesForLossLeaders = (statsSeason: number, limit = 5) =>
  getDefenseLeaders("tackles_for_loss", statsSeason, limit);
export const getTurnoverPlaymakerLeaders = getTurnoverLeaders;
export const getFieldGoalLeaders = (statsSeason: number, limit = 5) =>
  getSpecialTeamsLeaders("fg_made", statsSeason, limit);

/**
 * Season-to-date fantasy points (PPR) leaders across all skill
 * positions -- historical, "how has this player actually scored,"
 * not a projection. See getFantasyProjections() for forward-looking.
 */
export async function getFantasyPointsLeaders(statsSeason: number, limit = 8): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .in("position", ["QB", "RB", "WR", "TE"]);
  const players = (playersRaw ?? []) as Pick<
    NflPlayersRow,
    "gsis_id" | "full_name" | "team_id" | "headshot_url"
  >[];
  const playerIds = players.map((p) => p.gsis_id);
  if (playerIds.length === 0) return [];

  const { data: statsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select("player_id, fantasy_points_ppr")
    .eq("season", statsSeason)
    .in("player_id", playerIds);
  const stats = (statsRaw ?? []) as { player_id: string; fantasy_points_ppr: string | null }[];

  const totals = new Map<string, number>();
  for (const row of stats) {
    const v = Number(row.fantasy_points_ppr) || 0;
    totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + v);
  }

  const playerById = new Map(players.map((p) => [p.gsis_id, p]));

  return Array.from(totals.entries())
    .map(([gsisId, statValue]) => {
      const p = playerById.get(gsisId);
      return {
        gsisId,
        fullName: p?.full_name ?? gsisId,
        teamId: p?.team_id ?? "",
        headshotUrl: p?.headshot_url ?? null,
        statValue,
      };
    })
    .filter((r) => r.statValue > 0)
    .sort((a, b) => b.statValue - a.statValue)
    .slice(0, limit);
}

export interface FantasyProjectionRow extends LeaderRow {
  opponentTeam: string | null;
  matchupFactor: number;
  isReliableSample: boolean;
}

/**
 * Forward-looking fantasy projections for the next upcoming week,
 * written by compute_fantasy_projections.py. Empty until that script
 * has run against a season with real player-week data (i.e. not
 * pre-season, when there's no game history yet to project from).
 */
export async function getFantasyProjections(limit = 8): Promise<FantasyProjectionRow[]> {
  const supabase = createAdminClient();

  const { data: projRaw } = await supabase
    .from("nfl_fantasy_projections")
    .select("*")
    .order("projected_points_ppr", { ascending: false })
    .limit(limit);
  const projections = (projRaw ?? []) as {
    player_id: string;
    opponent_team: string | null;
    projected_points_ppr: string | null;
    matchup_factor: string | null;
    is_reliable_sample: boolean;
  }[];

  if (projections.length === 0) return [];

  const playerIds = projections.map((p) => p.player_id);
  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .in("gsis_id", playerIds);
  const playerById = new Map(
    ((playersRaw ?? []) as Pick<NflPlayersRow, "gsis_id" | "full_name" | "team_id" | "headshot_url">[]).map(
      (p) => [p.gsis_id, p]
    )
  );

  return projections.map((p) => {
    const player = playerById.get(p.player_id);
    return {
      gsisId: p.player_id,
      fullName: player?.full_name ?? p.player_id,
      teamId: player?.team_id ?? "",
      headshotUrl: player?.headshot_url ?? null,
      statValue: p.projected_points_ppr != null ? Number(p.projected_points_ppr) : 0,
      opponentTeam: p.opponent_team,
      matchupFactor: p.matchup_factor != null ? Number(p.matchup_factor) : 1,
      isReliableSample: p.is_reliable_sample,
    };
  });
}

/**
 * Advanced Stats panel: CPOE leaders from Next Gen Stats passing data
 * (most recent week per QB, not season-aggregated -- NGS doesn't sum
 * cleanly across weeks the way counting stats do).
 */
export async function getAdvancedStatsLeaders(statsSeason: number, limit = 5): Promise<LeaderRow[]> {
  const supabase = createAdminClient();

  const { data: ngsRaw } = await supabase
    .from("nfl_next_gen_stats")
    .select("player_id, team_id, raw_source_json, week")
    .eq("season", statsSeason)
    .eq("stat_type", "passing")
    .order("week", { ascending: false });
  const ngsRows = (ngsRaw ?? []) as {
    player_id: string;
    team_id: string | null;
    raw_source_json: Record<string, unknown>;
    week: number;
  }[];

  // Keep only each player's most recent week.
  const latestByPlayer = new Map<string, (typeof ngsRows)[number]>();
  for (const row of ngsRows) {
    if (!latestByPlayer.has(row.player_id)) latestByPlayer.set(row.player_id, row);
  }

  const playerIds = Array.from(latestByPlayer.keys());
  if (playerIds.length === 0) return [];

  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .in("gsis_id", playerIds);
  const playerById = new Map(
    ((playersRaw ?? []) as Pick<NflPlayersRow, "gsis_id" | "full_name" | "team_id" | "headshot_url">[]).map(
      (p) => [p.gsis_id, p]
    )
  );

  return Array.from(latestByPlayer.values())
    .map((row) => {
      const p = playerById.get(row.player_id);
      const cpoe = Number(row.raw_source_json.completion_percentage_above_expectation) || 0;
      return {
        gsisId: row.player_id,
        fullName: p?.full_name ?? row.player_id,
        teamId: p?.team_id ?? row.team_id ?? "",
        headshotUrl: p?.headshot_url ?? null,
        statValue: cpoe,
      };
    })
    .sort((a, b) => b.statValue - a.statValue)
    .slice(0, limit);
}

export interface StandingsRow {
  teamId: string;
  teamName: string;
  teamNick: string;
  conference: string | null;
  division: string | null;
  logoUrl: string;
  wins: number;
  losses: number;
  ties: number;
  record: string;
}

/** Standings grouped by division, for the sidebar. */
export async function getStandings(statsSeason: number): Promise<StandingsRow[]> {
  const supabase = createAdminClient();

  const { data: teamsRaw } = await supabase.from("nfl_teams").select("*").order("division");
  const teams = (teamsRaw ?? []) as NflTeamsRow[];

  const { data: reportsRaw } = await supabase
    .from("nfl_team_season_reports")
    .select("*")
    .eq("season", statsSeason);
  const reports = (reportsRaw ?? []) as NflTeamSeasonReportsRow[];
  const reportById = new Map(reports.map((r) => [r.team_id, r]));

  return teams
    .map((t) => {
      const r = reportById.get(t.team_id);
      const wins = r?.wins != null ? Number(r.wins) : 0;
      const losses = r?.losses != null ? Number(r.losses) : 0;
      const ties = r?.ties != null ? Number(r.ties) : 0;
      return {
        teamId: t.team_id,
        teamName: t.team_name,
        teamNick: t.team_nick,
        conference: t.conference,
        division: t.division,
        logoUrl: t.team_logo_url ?? "",
        wins,
        losses,
        ties,
        record: `${wins}-${losses}${ties ? `-${ties}` : ""}`,
      };
    })
    .sort((a, b) => {
      if (a.division !== b.division) return (a.division ?? "").localeCompare(b.division ?? "");
      return b.wins - a.wins || a.losses - b.losses;
    });
}

export async function getPlayerProfile(gsisId: string): Promise<NflPlayerProfile | null> {
  const supabase = createAdminClient();

  const { data: playerRaw } = await supabase
    .from("nfl_players")
    .select("*")
    .eq("gsis_id", gsisId)
    .single();
  const player = playerRaw as NflPlayersRow | null;

  if (!player) return null;

  const { data: teamRaw } = await supabase
    .from("nfl_teams")
    .select("*")
    .eq("team_id", player.team_id)
    .single();
  const team = teamRaw as NflTeamsRow | null;

  const statsSeason = await getActiveStatsSeason();

  const { data: weeklyStatsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select("*")
    .eq("player_id", gsisId)
    .eq("season", statsSeason)
    .order("week", { ascending: true });
  const rows = (weeklyStatsRaw ?? []) as NflPlayerStatsWeeklyRow[];

  const sumField = (field: keyof NflPlayerStatsWeeklyRow): number =>
    rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

  const seasonTotals: PlayerSeasonTotals | null =
    rows.length > 0
      ? {
          gamesPlayed: rows.length,
          passingYards: sumField("passing_yards"),
          passingTds: sumField("passing_tds"),
          interceptions: sumField("interceptions"),
          rushingYards: sumField("rushing_yards"),
          rushingTds: sumField("rushing_tds"),
          receivingYards: sumField("receiving_yards"),
          receivingTds: sumField("receiving_tds"),
          receptions: sumField("receptions"),
          targets: sumField("targets"),
        }
      : null;

  const gameLog: PlayerGameLogRow[] = rows.map((r) => ({
    week: r.week,
    opponent: null,
    completions: r.completions,
    attempts: r.attempts,
    passingYards: r.passing_yards,
    passingTds: r.passing_tds,
    interceptions: r.interceptions,
    carries: r.carries,
    rushingYards: r.rushing_yards,
    rushingTds: r.rushing_tds,
    targets: r.targets,
    receptions: r.receptions,
    receivingYards: r.receiving_yards,
    receivingTds: r.receiving_tds,
  }));

  const ngsType =
    player.position === "QB" ? "passing" : player.position === "RB" ? "rushing" : "receiving";

  const { data: ngsRowsRaw } = await supabase
    .from("nfl_next_gen_stats")
    .select("*")
    .eq("player_id", gsisId)
    .eq("stat_type", ngsType)
    .eq("season", statsSeason)
    .order("week", { ascending: false })
    .limit(1);
  const ngsRows = (ngsRowsRaw ?? []) as NflNextGenStatsRow[];

  const { data: formRowRaw } = await supabase
    .from("nfl_player_form_signals")
    .select("*")
    .eq("player_id", gsisId)
    .single();
  const formRow = formRowRaw as NflPlayerFormSignalsRow | null;

  return {
    gsisId: player.gsis_id,
    fullName: player.full_name,
    position: player.position,
    teamId: player.team_id,
    jerseyNumber: player.jersey_number,
    headshotUrl: player.headshot_url,
    heightIn: player.height,
    weightLb: player.weight,
    college: player.college,
    yearsExp: player.years_exp,
    team: team
      ? {
          teamId: team.team_id,
          teamName: team.team_name,
          teamNick: team.team_nick,
          teamColor: team.team_color ?? "#1A1A1A",
          teamColor2: team.team_color2 ?? "#1A1A1A",
          logoUrl: team.team_logo_url ?? "",
          record: null,
          pointsPerGame: null,
          pointsAllowedPerGame: null,
          offEpaRank: null,
          defEpaRank: null,
        }
      : null,
    statsSeason,
    seasonTotals,
    gameLog,
    nextGen: ngsRows.length > 0 ? ngsRows[0].raw_source_json : null,
    form: formRow
      ? {
          epaTrendL4: formRow.epa_trend_l4 != null ? Number(formRow.epa_trend_l4) : null,
          epaTrendSzn: formRow.epa_trend_szn != null ? Number(formRow.epa_trend_szn) : null,
          usageTrendL4: formRow.usage_trend_l4 != null ? Number(formRow.usage_trend_l4) : null,
          isReliableSample: formRow.is_reliable_sample ?? false,
        }
      : null,
  };
}

// ---------------------------------------------------------------------
// Career data, percentile rail, and similarity model. All three
// share one helper (computePlayerRates) so a rate stat's definition
// -- e.g. "EPA/Dropback = sum(passing_epa) / sum(attempts)" -- only
// exists in one place, not reimplemented three times with a risk of
// drifting out of sync.
// ---------------------------------------------------------------------

const MIN_RELIABLE_GAMES_FOR_COMPARISON = 3;

interface WeeklyStatRow {
  season: number;
  week: number;
  team_id: string;
  completions: number | null;
  attempts: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  passing_epa: number | null;
  cpoe: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  rushing_epa: number | null;
  targets: number | null;
  receptions: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  target_share: number | null;
}

/**
 * Turns a set of weekly rows into per-game rate stats matching the
 * keys defined in lib/nfl/player-stats-config.ts. This is THE single
 * definition of how each rate stat is computed -- career table,
 * percentile rail, and similarity model all call this rather than
 * each computing rates their own way.
 *
 * KNOWN APPROXIMATION: epaPerDropback divides by pass attempts, not
 * true dropbacks (attempts + sacks) -- sacks aren't attributed to a
 * specific passer in nfl_player_stats_weekly, only at the team level.
 * Close enough for ranking purposes (sacks are a small fraction of
 * dropbacks for most QBs) but not exact. Worth fixing if a more
 * precise number becomes important later.
 */
function computePlayerRates(rows: WeeklyStatRow[]): Record<string, number> {
  const games = rows.length;
  if (games === 0) return {};

  const sum = (f: keyof WeeklyStatRow) => rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
  const weightedAvg = (valueField: keyof WeeklyStatRow, weightField: keyof WeeklyStatRow) => {
    let totalWeight = 0;
    let totalValue = 0;
    for (const r of rows) {
      const w = Number(r[weightField]) || 0;
      const v = r[valueField];
      if (v == null || w === 0) continue;
      totalValue += Number(v) * w;
      totalWeight += w;
    }
    return totalWeight > 0 ? totalValue / totalWeight : 0;
  };

  const attempts = sum("attempts");
  const carries = sum("carries");

  return {
    passYdsPerG: sum("passing_yards") / games,
    passTdPerG: sum("passing_tds") / games,
    intPerG: sum("interceptions") / games,
    epaPerDropback: attempts > 0 ? sum("passing_epa") / attempts : 0,
    cpoe: weightedAvg("cpoe", "attempts"),
    rushYdsPerG: sum("rushing_yards") / games,
    rushTdPerG: sum("rushing_tds") / games,
    rushEpaPerCarry: carries > 0 ? sum("rushing_epa") / carries : 0,
    recPerG: sum("receptions") / games,
    recYdsPerG: sum("receiving_yards") / games,
    recTdPerG: sum("receiving_tds") / games,
    targetsPerG: sum("targets") / games,
    targetShare: weightedAvg("target_share", "targets"),
  };
}

export interface CareerSeasonRow {
  season: number;
  teamId: string;
  gamesPlayed: number;
  rates: Record<string, number>;
}

export interface PlayerCareerData {
  seasons: CareerSeasonRow[];
  careerRates: Record<string, number>;
  careerGamesPlayed: number;
  yearSpan: string; // e.g. "2021-2025"
  dataStartSeason: number; // CAREER_DATA_START_SEASON, for the UI's "coming soon" note
}

/**
 * Full season-by-season + career-total rate stats for one player,
 * across every season currently synced (>= CAREER_DATA_START_SEASON).
 * Point lookup for one player -- fine to compute live, same reasoning
 * as getPlayerProfile().
 */
export async function getPlayerCareerData(gsisId: string): Promise<PlayerCareerData | null> {
  const supabase = createAdminClient();

  const { data: rowsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select("*")
    .eq("player_id", gsisId)
    .gte("season", CAREER_DATA_START_SEASON)
    .order("season", { ascending: true });
  const rows = (rowsRaw ?? []) as (WeeklyStatRow & { season: number })[];

  if (rows.length === 0) return null;

  const bySeasonMap = new Map<number, WeeklyStatRow[]>();
  for (const r of rows) {
    if (!bySeasonMap.has(r.season)) bySeasonMap.set(r.season, []);
    bySeasonMap.get(r.season)!.push(r);
  }

  const seasons: CareerSeasonRow[] = Array.from(bySeasonMap.entries())
    .map(([season, seasonRows]) => ({
      season,
      teamId: seasonRows[seasonRows.length - 1].team_id, // most recent team that season, handles in-season trades
      gamesPlayed: seasonRows.length,
      rates: computePlayerRates(seasonRows),
    }))
    .sort((a, b) => a.season - b.season);

  const allSeasons = seasons.map((s) => s.season);
  const yearSpan =
    allSeasons.length === 1 ? `${allSeasons[0]}` : `${Math.min(...allSeasons)}-${Math.max(...allSeasons)}`;

  return {
    seasons,
    careerRates: computePlayerRates(rows),
    careerGamesPlayed: rows.length,
    yearSpan,
    dataStartSeason: CAREER_DATA_START_SEASON,
  };
}

export interface PercentileDial {
  key: string;
  value: number;
  percentile: number; // 0-100
  sampleSize: number; // how many peers this was ranked against
}

/**
 * Ranks this player's current-season rate stats against same-position
 * peers with a reliable sample (>= MIN_RELIABLE_GAMES_FOR_COMPARISON
 * games). Real percentiles from real peers -- see player-stats-config.ts
 * header for why this exists instead of a fabricated grade.
 */
export async function getPlayerPercentiles(gsisId: string, statsSeason: number): Promise<PercentileDial[]> {
  const supabase = createAdminClient();

  const { data: playerRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, position")
    .eq("gsis_id", gsisId)
    .single();
  const player = playerRaw as { gsis_id: string; position: string } | null;
  if (!player) return [];

  const { data: peerPlayersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id")
    .eq("position", player.position);
  const peerIds = ((peerPlayersRaw ?? []) as { gsis_id: string }[]).map((p) => p.gsis_id);
  if (peerIds.length === 0) return [];

  const { data: allRowsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select("*")
    .eq("season", statsSeason)
    .in("player_id", peerIds);
  const allRows = (allRowsRaw ?? []) as (WeeklyStatRow & { player_id: string })[];

  const byPlayer = new Map<string, WeeklyStatRow[]>();
  for (const r of allRows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push(r);
  }

  // Only compare against peers with a reliable sample this season.
  const peerRates: Record<string, number>[] = [];
  let targetRates: Record<string, number> | null = null;
  for (const [playerId, rows] of byPlayer.entries()) {
    if (rows.length < MIN_RELIABLE_GAMES_FOR_COMPARISON) continue;
    const rates = computePlayerRates(rows);
    if (playerId === gsisId) targetRates = rates;
    peerRates.push(rates);
  }

  if (!targetRates || peerRates.length < 5) return []; // too small a comparison pool to mean anything

  const keys = similarityKeysForPosition(player.position);
  const dials: PercentileDial[] = [];
  for (const key of keys) {
    const targetValue = targetRates[key];
    if (targetValue == null) continue;
    const peerValues = peerRates.map((r) => r[key]).filter((v) => v != null);
    if (peerValues.length < 5) continue;
    const countBelow = peerValues.filter((v) => v < targetValue).length;
    const percentile = Math.round((countBelow / peerValues.length) * 100);
    dials.push({ key, value: targetValue, percentile, sampleSize: peerValues.length });
  }

  return dials;
}

export interface SimilarPlayer {
  gsisId: string;
  fullName: string;
  teamId: string;
  headshotUrl: string | null;
  similarityScore: number;
}

/**
 * "Similar to" -- statistical resemblance among same-position peers
 * within CAREER_DATA_START_SEASON onward, NOT a scouting/play-style
 * comparison. Z-score normalizes each similarity-model stat across
 * the peer pool, then ranks by Euclidean distance. Two backs with the
 * same yardage/game will show up as "similar" here even if one is a
 * north-south grinder and the other a shifty scat back -- this
 * measures production profile, not how someone actually plays. Worth
 * saying that plainly in the UI, not just in this comment.
 */
export async function getSimilarPlayers(gsisId: string, limit = 5): Promise<SimilarPlayer[]> {
  const supabase = createAdminClient();

  const { data: playerRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, position")
    .eq("gsis_id", gsisId)
    .single();
  const player = playerRaw as { gsis_id: string; position: string } | null;
  if (!player) return [];

  const keys = similarityKeysForPosition(player.position);
  if (keys.length === 0) return [];

  const { data: peerPlayersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, full_name, team_id, headshot_url")
    .eq("position", player.position);
  const peerPlayers = (peerPlayersRaw ?? []) as Pick<
    NflPlayersRow,
    "gsis_id" | "full_name" | "team_id" | "headshot_url"
  >[];
  const peerIds = peerPlayers.map((p) => p.gsis_id);
  if (peerIds.length === 0) return [];

  const { data: allRowsRaw } = await supabase
    .from("nfl_player_stats_weekly")
    .select("*")
    .gte("season", CAREER_DATA_START_SEASON)
    .in("player_id", peerIds);
  const allRows = (allRowsRaw ?? []) as (WeeklyStatRow & { player_id: string })[];

  const byPlayer = new Map<string, WeeklyStatRow[]>();
  for (const r of allRows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push(r);
  }

  const ratesByPlayer = new Map<string, Record<string, number>>();
  for (const [playerId, rows] of byPlayer.entries()) {
    if (rows.length < MIN_RELIABLE_GAMES_FOR_COMPARISON) continue;
    ratesByPlayer.set(playerId, computePlayerRates(rows));
  }

  const targetRates = ratesByPlayer.get(gsisId);
  if (!targetRates || ratesByPlayer.size < limit + 3) return []; // pool too small for a meaningful comparison

  // Z-score normalize each key across the peer pool.
  const stats: Record<string, { mean: number; std: number }> = {};
  for (const key of keys) {
    const values = Array.from(ratesByPlayer.values())
      .map((r) => r[key])
      .filter((v) => v != null);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    stats[key] = { mean, std: Math.sqrt(variance) || 1 };
  }

  const zVector = (rates: Record<string, number>) =>
    keys.map((k) => ((rates[k] ?? stats[k].mean) - stats[k].mean) / stats[k].std);

  const targetZ = zVector(targetRates);

  const distances: { playerId: string; distance: number }[] = [];
  for (const [playerId, rates] of ratesByPlayer.entries()) {
    if (playerId === gsisId) continue;
    const z = zVector(rates);
    const distance = Math.sqrt(z.reduce((acc, v, i) => acc + (v - targetZ[i]) ** 2, 0));
    distances.push({ playerId, distance });
  }

  distances.sort((a, b) => a.distance - b.distance);
  const top = distances.slice(0, limit);

  const playerById = new Map(peerPlayers.map((p) => [p.gsis_id, p]));
  return top.map((d) => {
    const p = playerById.get(d.playerId);
    return {
      gsisId: d.playerId,
      fullName: p?.full_name ?? d.playerId,
      teamId: p?.team_id ?? "",
      headshotUrl: p?.headshot_url ?? null,
      similarityScore: Math.round(d.distance * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------
// Team page: year-on-year, coverage rollup, injuries, depth chart.
// All scoped to a single team, cheap enough to compute live -- same
// reasoning as the player page's point-lookup queries.
// ---------------------------------------------------------------------

export interface TeamDetail {
  teamId: string;
  teamName: string;
  teamNick: string;
  conference: string | null;
  division: string | null;
  teamColor: string;
  teamColor2: string;
  logoUrl: string;
  wordmarkUrl: string;
  record: string | null;
  pointsPerGame: number | null;
  pointsAllowedPerGame: number | null;
  offEpaRank: number | null;
  defEpaRank: number | null;
}

export async function getTeamDetail(teamId: string, statsSeason: number): Promise<TeamDetail | null> {
  const supabase = createAdminClient();

  const { data: teamRaw } = await supabase.from("nfl_teams").select("*").eq("team_id", teamId).single();
  const team = teamRaw as NflTeamsRow | null;
  if (!team) return null;

  const { data: reportRaw } = await supabase
    .from("nfl_team_season_reports")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .single();
  const r = reportRaw as NflTeamSeasonReportsRow | null;

  const wins = r?.wins != null ? Number(r.wins) : null;
  const losses = r?.losses != null ? Number(r.losses) : null;
  const ties = r?.ties != null ? Number(r.ties) : null;

  return {
    teamId: team.team_id,
    teamName: team.team_name,
    teamNick: team.team_nick,
    conference: team.conference,
    division: team.division,
    teamColor: team.team_color ?? "#1A1A1A",
    teamColor2: team.team_color2 ?? "#1A1A1A",
    logoUrl: team.team_logo_url ?? "",
    wordmarkUrl: team.team_wordmark_url ?? "",
    record: r && r.games_played > 0 && wins != null && losses != null
      ? `${wins}-${losses}${ties ? `-${ties}` : ""}`
      : null,
    pointsPerGame: r?.points_per_game != null ? Number(r.points_per_game) : null,
    pointsAllowedPerGame: r?.points_allowed_per_game != null ? Number(r.points_allowed_per_game) : null,
    offEpaRank: r?.off_epa_rank ?? null,
    defEpaRank: r?.def_epa_rank ?? null,
  };
}

export interface TeamSeasonTrendRow {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  pointsPerGame: number | null;
  pointsAllowedPerGame: number | null;
  offEpaRank: number | null;
  defEpaRank: number | null;
}

/** Year-on-year trend across every backfilled season for this team. */
export async function getTeamYearOverYear(teamId: string): Promise<TeamSeasonTrendRow[]> {
  const supabase = createAdminClient();

  const { data: reportsRaw } = await supabase
    .from("nfl_team_season_reports")
    .select("*")
    .eq("team_id", teamId)
    .order("season", { ascending: true });
  const reports = (reportsRaw ?? []) as NflTeamSeasonReportsRow[];

  return reports
    .filter((r) => r.games_played > 0)
    .map((r) => ({
      season: r.season,
      wins: r.wins != null ? Number(r.wins) : 0,
      losses: r.losses != null ? Number(r.losses) : 0,
      ties: r.ties != null ? Number(r.ties) : 0,
      pointsPerGame: r.points_per_game != null ? Number(r.points_per_game) : null,
      pointsAllowedPerGame: r.points_allowed_per_game != null ? Number(r.points_allowed_per_game) : null,
      offEpaRank: r.off_epa_rank,
      defEpaRank: r.def_epa_rank,
    }));
}

export interface TeamCoverageStats {
  season: number;
  defendersIncluded: number;
  targetsFaced: number;
  completionPctAllowed: number | null;
  yardsPerTargetAllowed: number | null;
  passerRatingAllowed: number | null;
  avgDepthOfTarget: number | null;
  totalPressures: number;
  totalSacks: number;
  totalInterceptions: number;
}

/**
 * Team-level coverage rollup, built from individual defenders' PFR
 * 'def' stat_type rows (nfl_pfr_advstats), weighted by targets faced
 * (def_targets) -- a corner who faced 80 targets should count more
 * than one who faced 5. This is the aggregation step that was flagged
 * as missing back when sync_pfr_advstats.py was first built.
 */
export async function getTeamCoverageStats(teamId: string, statsSeason: number): Promise<TeamCoverageStats | null> {
  const supabase = createAdminClient();

  const { data: rowsRaw } = await supabase
    .from("nfl_pfr_advstats")
    .select("raw_source_json")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .eq("stat_type", "def");
  const rows = (rowsRaw ?? []) as { raw_source_json: Record<string, unknown> }[];

  if (rows.length === 0) return null;

  let targetsFaced = 0;
  let completionsAllowed = 0;
  let yardsAllowed = 0;
  let passerRatingWeightedSum = 0;
  let adotWeightedSum = 0;
  let totalPressures = 0;
  let totalSacks = 0;
  let totalInterceptions = 0;

  for (const row of rows) {
    const d = row.raw_source_json;
    const targets = Number(d.def_targets) || 0;
    targetsFaced += targets;
    completionsAllowed += Number(d.def_completions_allowed) || 0;
    yardsAllowed += Number(d.def_yards_allowed) || 0;
    totalPressures += Number(d.def_pressures) || 0;
    totalSacks += Number(d.def_sacks) || 0;
    totalInterceptions += Number(d.def_ints) || 0;
    if (targets > 0) {
      passerRatingWeightedSum += (Number(d.def_passer_rating_allowed) || 0) * targets;
      adotWeightedSum += (Number(d.def_adot) || 0) * targets;
    }
  }

  return {
    season: statsSeason,
    defendersIncluded: rows.length,
    targetsFaced,
    completionPctAllowed: targetsFaced > 0 ? (completionsAllowed / targetsFaced) * 100 : null,
    yardsPerTargetAllowed: targetsFaced > 0 ? yardsAllowed / targetsFaced : null,
    passerRatingAllowed: targetsFaced > 0 ? passerRatingWeightedSum / targetsFaced : null,
    avgDepthOfTarget: targetsFaced > 0 ? adotWeightedSum / targetsFaced : null,
    totalPressures,
    totalSacks,
    totalInterceptions,
  };
}

export interface TeamInjuryRow {
  playerId: string;
  playerName: string;
  headshotUrl: string | null;
  position: string | null;
  reportStatus: string | null;
  practiceStatus: string | null;
  injury: string | null;
}

/** Most recent week's injury report for a team. */
export async function getTeamInjuries(teamId: string, statsSeason: number): Promise<TeamInjuryRow[]> {
  const supabase = createAdminClient();

  const { data: weekRowsRaw } = await supabase
    .from("nfl_injuries")
    .select("week")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .order("week", { ascending: false })
    .limit(1);
  const weekRows = (weekRowsRaw ?? []) as { week: number }[];
  if (weekRows.length === 0) return [];
  const latestWeek = weekRows[0].week;

  const { data: injuriesRaw } = await supabase
    .from("nfl_injuries")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .eq("week", latestWeek);
  const injuries = (injuriesRaw ?? []) as {
    player_id: string;
    player_name: string;
    report_status: string | null;
    practice_status: string | null;
    injury: string | null;
  }[];

  if (injuries.length === 0) return [];

  const playerIds = injuries.map((i) => i.player_id);
  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, headshot_url, position")
    .in("gsis_id", playerIds);
  const playerById = new Map(
    ((playersRaw ?? []) as { gsis_id: string; headshot_url: string | null; position: string | null }[]).map((p) => [
      p.gsis_id,
      p,
    ])
  );

  return injuries.map((i) => ({
    playerId: i.player_id,
    playerName: i.player_name,
    headshotUrl: playerById.get(i.player_id)?.headshot_url ?? null,
    position: playerById.get(i.player_id)?.position ?? null,
    reportStatus: i.report_status,
    practiceStatus: i.practice_status,
    injury: i.injury,
  }));
}

export interface DepthChartEntry {
  playerId: string | null;
  playerName: string;
  headshotUrl: string | null;
  depthRank: number;
}

export interface DepthChartByPosition {
  position: string;
  players: DepthChartEntry[];
}

/** Current depth chart for a team, grouped by position, ordered by depth rank. */
export async function getTeamDepthChart(teamId: string): Promise<DepthChartByPosition[]> {
  const supabase = createAdminClient();

  const { data: chartRaw } = await supabase
    .from("nfl_depth_charts")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true })
    .order("depth_rank", { ascending: true });
  const chart = (chartRaw ?? []) as {
    player_id: string | null;
    player_name: string;
    position: string;
    depth_rank: number;
  }[];

  if (chart.length === 0) return [];

  const playerIds = chart.map((c) => c.player_id).filter((id): id is string => id != null);
  const { data: playersRaw } = await supabase
    .from("nfl_players")
    .select("gsis_id, headshot_url")
    .in("gsis_id", playerIds);
  const headshotById = new Map(
    ((playersRaw ?? []) as { gsis_id: string; headshot_url: string | null }[]).map((p) => [p.gsis_id, p.headshot_url])
  );

  const byPosition = new Map<string, DepthChartEntry[]>();
  for (const c of chart) {
    if (!byPosition.has(c.position)) byPosition.set(c.position, []);
    byPosition.get(c.position)!.push({
      playerId: c.player_id,
      playerName: c.player_name,
      headshotUrl: c.player_id ? headshotById.get(c.player_id) ?? null : null,
      depthRank: c.depth_rank,
    });
  }

  return Array.from(byPosition.entries()).map(([position, players]) => ({
    position,
    players: players.sort((a, b) => a.depthRank - b.depthRank),
  }));
}

export interface TeamSchemeProfile {
  season: number;
  offPlaysCharted: number;
  offFormationShotgunPct: number | null;
  offFormationUndercenterPct: number | null;
  offFormationPistolPct: number | null;
  offPersonnel11Pct: number | null;
  offPersonnel12Pct: number | null;
  offPersonnel21Pct: number | null;
  offPersonnelOtherPct: number | null;
  offFtnPlaysCharted: number;
  offPlayActionRate: number | null; // null for 2021 -- FTN charting starts 2022
  offMotionRate: number | null;
  offScreenRate: number | null;
  offNoHuddleRate: number | null;
  offRpoRate: number | null;
  defPlaysCharted: number;
  defCoverageClassifiedPct: number | null; // completeness, not a scheme stat -- ~50-65% typical
  defCover0Pct: number | null;
  defCover1Pct: number | null;
  defCover2Pct: number | null;
  defCover3Pct: number | null;
  defCover4Pct: number | null;
  defCover6Pct: number | null;
  defCover9Pct: number | null;
  def2ManPct: number | null;
  defComboPct: number | null;
  defBlownCoveragePct: number | null;
  defManPct: number | null;
  defZonePct: number | null;
  defAvgBoxDefenders: number | null;
  defFtnPlaysCharted: number;
  defBlitzRate: number | null; // null for 2021
}

/** Scheme tendencies for one team-season -- coverage shell, man/zone,
 * formation, personnel, play-action/motion/blitz rates. See
 * sync_team_scheme_profile.py for full methodology and the 2021
 * FTN-charting gap. */
export async function getTeamSchemeProfile(teamId: string, statsSeason: number): Promise<TeamSchemeProfile | null> {
  const supabase = createAdminClient();

  const { data: rowRaw } = await supabase
    .from("nfl_team_scheme_profile")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .single();

  if (!rowRaw) return null;
  const r = rowRaw as Record<string, number | null>;

  return {
    season: statsSeason,
    offPlaysCharted: r.off_plays_charted ?? 0,
    offFormationShotgunPct: r.off_formation_shotgun_pct,
    offFormationUndercenterPct: r.off_formation_undercenter_pct,
    offFormationPistolPct: r.off_formation_pistol_pct,
    offPersonnel11Pct: r.off_personnel_11_pct,
    offPersonnel12Pct: r.off_personnel_12_pct,
    offPersonnel21Pct: r.off_personnel_21_pct,
    offPersonnelOtherPct: r.off_personnel_other_pct,
    offFtnPlaysCharted: r.off_ftn_plays_charted ?? 0,
    offPlayActionRate: r.off_play_action_rate,
    offMotionRate: r.off_motion_rate,
    offScreenRate: r.off_screen_rate,
    offNoHuddleRate: r.off_no_huddle_rate,
    offRpoRate: r.off_rpo_rate,
    defPlaysCharted: r.def_plays_charted ?? 0,
    defCoverageClassifiedPct: r.def_coverage_classified_pct,
    defCover0Pct: r.def_cover0_pct,
    defCover1Pct: r.def_cover1_pct,
    defCover2Pct: r.def_cover2_pct,
    defCover3Pct: r.def_cover3_pct,
    defCover4Pct: r.def_cover4_pct,
    defCover6Pct: r.def_cover6_pct,
    defCover9Pct: r.def_cover9_pct,
    def2ManPct: r.def_2man_pct,
    defComboPct: r.def_combo_pct,
    defBlownCoveragePct: r.def_blown_coverage_pct,
    defManPct: r.def_man_pct,
    defZonePct: r.def_zone_pct,
    defAvgBoxDefenders: r.def_avg_box_defenders,
    defFtnPlaysCharted: r.def_ftn_plays_charted ?? 0,
    defBlitzRate: r.def_blitz_rate,
  };
}

// ---------------------------------------------------------------------
// League context (rank + vs-average), coverage efficacy, route
// profile, and a deterministic key-takeaway headline.
// ---------------------------------------------------------------------

const RANKABLE_SCHEME_KEYS = [
  "offFormationShotgunPct",
  "offPersonnel11Pct",
  "offPersonnel12Pct",
  "offPlayActionRate",
  "offMotionRate",
  "offScreenRate",
  "offRpoRate",
  "defCover1Pct",
  "defCover2Pct",
  "defCover3Pct",
  "defCover4Pct",
  "defCover0Pct",
  "defManPct",
  "defBlitzRate",
  "defAvgBoxDefenders",
] as const;

export type RankableSchemeKey = (typeof RANKABLE_SCHEME_KEYS)[number];

export interface SchemeMetricContext {
  value: number | null;
  leagueAvg: number | null;
  rank: number | null; // 1 = highest raw value across the league -- descriptive ("most"), not "best"
  teamsRanked: number;
}

export interface TeamSchemeContext {
  profile: TeamSchemeProfile;
  metrics: Partial<Record<RankableSchemeKey, SchemeMetricContext>>;
}

const SCHEME_DB_COLUMN: Record<RankableSchemeKey, string> = {
  offFormationShotgunPct: "off_formation_shotgun_pct",
  offPersonnel11Pct: "off_personnel_11_pct",
  offPersonnel12Pct: "off_personnel_12_pct",
  offPlayActionRate: "off_play_action_rate",
  offMotionRate: "off_motion_rate",
  offScreenRate: "off_screen_rate",
  offRpoRate: "off_rpo_rate",
  defCover1Pct: "def_cover1_pct",
  defCover2Pct: "def_cover2_pct",
  defCover3Pct: "def_cover3_pct",
  defCover4Pct: "def_cover4_pct",
  defCover0Pct: "def_cover0_pct",
  defManPct: "def_man_pct",
  defBlitzRate: "def_blitz_rate",
  defAvgBoxDefenders: "def_avg_box_defenders",
};

/**
 * Scheme profile enriched with rank (1-32) and league average for
 * every rankable metric -- e.g. "28% blitz rate, #12 in the league,
 * vs a league average of 24%." Rank is purely descriptive (most/least
 * of something), not a value judgment -- blitzing more isn't "better,"
 * it's just different. Efficacy metrics (getTeamCoverageEfficacy)
 * carry real better/worse direction; frequency metrics here don't.
 */
export async function getTeamSchemeContext(teamId: string, statsSeason: number): Promise<TeamSchemeContext | null> {
  const profile = await getTeamSchemeProfile(teamId, statsSeason);
  if (!profile) return null;

  const supabase = createAdminClient();
  const { data: allRaw } = await supabase.from("nfl_team_scheme_profile").select("*").eq("season", statsSeason);
  const all = (allRaw ?? []) as Record<string, number | string | null>[];

  const metrics: Partial<Record<RankableSchemeKey, SchemeMetricContext>> = {};
  for (const key of RANKABLE_SCHEME_KEYS) {
    const dbCol = SCHEME_DB_COLUMN[key];
    const values = all
      .map((row) => (row[dbCol] != null ? Number(row[dbCol]) : null))
      .filter((v): v is number => v != null);
    if (values.length === 0) continue;

    const teamValue = profile[key] as number | null;
    const leagueAvg = values.reduce((a, b) => a + b, 0) / values.length;
    const rank = teamValue != null ? values.filter((v) => v > teamValue).length + 1 : null;

    metrics[key] = { value: teamValue, leagueAvg, rank, teamsRanked: values.length };
  }

  return { profile, metrics };
}

export interface CoverageEfficacyRow {
  coverageType: string;
  plays: number;
  epaAllowedPerPlay: number | null;
  yardsAllowedPerPlay: number | null;
  redZonePct: number | null;
  successRateAllowed: number | null;
}

/** Coverage-shell efficacy: EPA/yards allowed, red-zone usage, success
 * rate, per coverage type this team plays. Not just frequency -- how
 * well each coverage actually performs. */
export async function getTeamCoverageEfficacy(teamId: string, statsSeason: number): Promise<CoverageEfficacyRow[]> {
  const supabase = createAdminClient();
  const { data: rowsRaw } = await supabase
    .from("nfl_team_coverage_efficacy")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .order("plays", { ascending: false });
  const rows = (rowsRaw ?? []) as {
    coverage_type: string;
    plays: number;
    epa_allowed_per_play: number | null;
    yards_allowed_per_play: number | null;
    red_zone_pct: number | null;
    success_rate_allowed: number | null;
  }[];

  return rows.map((r) => ({
    coverageType: r.coverage_type,
    plays: r.plays,
    epaAllowedPerPlay: r.epa_allowed_per_play != null ? Number(r.epa_allowed_per_play) : null,
    yardsAllowedPerPlay: r.yards_allowed_per_play != null ? Number(r.yards_allowed_per_play) : null,
    redZonePct: r.red_zone_pct != null ? Number(r.red_zone_pct) : null,
    successRateAllowed: r.success_rate_allowed != null ? Number(r.success_rate_allowed) : null,
  }));
}

export interface RouteProfileRow {
  route: string;
  targets: number;
  targetPct: number | null;
  yardsPerTarget: number | null;
  catchRate: number | null;
}

/** Route distribution + efficacy for a team's offense. */
export async function getTeamRouteProfile(teamId: string, statsSeason: number): Promise<RouteProfileRow[]> {
  const supabase = createAdminClient();
  const { data: rowsRaw } = await supabase
    .from("nfl_team_route_profile")
    .select("*")
    .eq("team_id", teamId)
    .eq("season", statsSeason)
    .order("targets", { ascending: false });
  const rows = (rowsRaw ?? []) as {
    route: string;
    targets: number;
    target_pct: number | null;
    yards_per_target: number | null;
    catch_rate: number | null;
  }[];

  return rows.map((r) => ({
    route: r.route,
    targets: r.targets,
    targetPct: r.target_pct != null ? Number(r.target_pct) : null,
    yardsPerTarget: r.yards_per_target != null ? Number(r.yards_per_target) : null,
    catchRate: r.catch_rate != null ? Number(r.catch_rate) : null,
  }));
}

/**
 * Deterministic, template-based headline -- NOT an LLM-generated
 * insight (no NFL narrative pipeline exists yet). Picks the 2-3
 * scheme facts furthest from league average (by absolute rank
 * distance from the middle) and phrases them in plain language,
 * mirroring the style of the "N of 8 factors" framing used elsewhere
 * in the product. Purely rule-based -- if this needs to sound smarter
 * later, that's an LLM narrative task, not a change to this function.
 */
export function generateSchemeTakeaway(context: TeamSchemeContext): string {
  const { metrics } = context;
  const notable: { text: string; distance: number }[] = [];

  const push = (key: RankableSchemeKey, label: string, unit: string) => {
    const m = metrics[key];
    if (!m || m.rank == null || m.value == null) return;
    const distance = Math.abs(m.rank - (m.teamsRanked + 1) / 2);
    notable.push({
      text: `${label} ${m.value.toFixed(0)}${unit} (#${m.rank} in the league)`,
      distance,
    });
  };

  push("defBlitzRate", "Blitzes on", "%");
  push("offPlayActionRate", "Play-action rate", "%");
  push("offMotionRate", "Pre-snap motion on", "%");
  push("defCover1Pct", "Cover 1 usage", "%");
  push("offPersonnel11Pct", "11 personnel usage", "%");

  notable.sort((a, b) => b.distance - a.distance);
  const top = notable.slice(0, 2).map((n) => n.text);

  if (top.length === 0) return "Not enough scheme data yet to summarize.";
  return top.join(", and ") + ".";
}

// ---------------------------------------------------------------------
// QB RADAR CHART
// Append to src/lib/nfl/queries.ts.
//
// IMPORTANT: this assumes nfl_player_stats_weekly already has these
// columns populated by sync_player_stats.py: attempts, completions,
// passing_epa, passing_cpoe, sacks_suffered, passing_air_yards,
// passing_yards_after_catch, passing_20, passing_40, carries,
// rushing_yards, rushing_epa. Run the grep in the chat before using
// this -- if any of those columns are missing/null, this needs a sync
// script extension first, same as the coverage-efficacy build did.
//
// Ground-truth checked against real 2024 Mahomes data before writing
// this: 581 attempts / 392 completions / 26 TD / 11 INT / 36 sacks,
// matching public box scores exactly. An earlier attempt to hand-roll
// these totals from raw pbp came out wrong (617 attempts -- the
// pass_attempt flag was still counting sack plays) -- summing the
// pre-validated weekly fields avoids repeating that mistake.
// ---------------------------------------------------------------------

export interface QbRadarAxis {
  key: string;
  label: string;
  value: number; // raw value, for the tooltip
  percentile: number; // 0-100 vs qualified QBs this season
  higherIsBetter: boolean;
  unit: "%" | "yds" | ""; // how to display `value` -- "" for EPA-style rate stats with no natural unit
}

export interface QbRadarProfile {
  playerId: string;
  season: number;
  attempts: number;
  axes: QbRadarAxis[];
}

const QB_MIN_ATTEMPTS_TO_QUALIFY = 100; // loose floor -- enough to smooth out garbage-time noise, low enough to include part-season starters

interface QbSeasonAgg {
  playerId: string;
  attempts: number;
  completions: number;
  passingYards: number;
  passingEpaTotal: number; // summed across weeks -- passing_epa in the weekly table is per-week total, not per-play average
  passingCpoeSum: number; // attempts-weighted sum, divided by total attempts at the end
  sacksSuffered: number;
  interceptions: number;
  passing20: number;
  passing40: number;
  carries: number;
  rushingYards: number;
  rushingEpaTotal: number;
}

async function fetchQbSeasonAggregates(season: number): Promise<QbSeasonAgg[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select(
      "player_id, attempts, completions, passing_yards, passing_epa, cpoe, interceptions, carries, rushing_yards, rushing_epa"
    )
    .eq("season", season)
    .gt("attempts", 0); // skip weeks where this player didn't throw -- keeps non-QB rows and QB-inactive weeks out of the aggregation

  const rows = (data ?? []) as Record<string, number | string | null>[];
  const byPlayer = new Map<string, QbSeasonAgg>();

  for (const r of rows) {
    const id = r.player_id as string;
    const agg =
      byPlayer.get(id) ??
      ({
        playerId: id,
        attempts: 0,
        completions: 0,
        passingYards: 0,
        passingEpaTotal: 0,
        passingCpoeSum: 0,
        sacksSuffered: 0,
        interceptions: 0,
        passing20: 0,
        passing40: 0,
        carries: 0,
        rushingYards: 0,
        rushingEpaTotal: 0,
      } as QbSeasonAgg);

    const attempts = Number(r.attempts ?? 0);
    agg.attempts += attempts;
    agg.completions += Number(r.completions ?? 0);
    agg.passingYards += Number(r.passing_yards ?? 0);
    agg.passingEpaTotal += Number(r.passing_epa ?? 0);
     agg.passingCpoeSum += Number(r.cpoe ?? 0) * attempts; // weekly CPOE is a per-attempt average -- weight by that week's attempts before summing
    agg.interceptions += Number(r.interceptions ?? 0);
    agg.carries += Number(r.carries ?? 0);
    agg.rushingYards += Number(r.rushing_yards ?? 0);
    agg.rushingEpaTotal += Number(r.rushing_epa ?? 0);

    byPlayer.set(id, agg);
  }

  return Array.from(byPlayer.values()).filter((a) => a.attempts >= QB_MIN_ATTEMPTS_TO_QUALIFY);
}

const RADAR_AXES: { key: string; label: string; higherIsBetter: boolean; unit: "%" | "yds" | "" }[] = [
  { key: "epaPerPlay", label: "EPA / Play", higherIsBetter: true, unit: "" },
  { key: "epaPerPass", label: "EPA / Pass", higherIsBetter: true, unit: "" },
  { key: "epaPerRush", label: "EPA / Rush", higherIsBetter: true, unit: "" },
  { key: "compPct", label: "Comp %", higherIsBetter: true, unit: "%" },
  { key: "cpoe", label: "CPOE", higherIsBetter: true, unit: "%" },
  { key: "ydsPerRush", label: "Yds / Rush", higherIsBetter: true, unit: "yds" },
  { key: "chunkPct", label: "Chunk % (20+)", higherIsBetter: true, unit: "%" },
  { key: "explosivePct", label: "Explosive % (40+)", higherIsBetter: true, unit: "%" },
  { key: "sackPct", label: "Sack %", higherIsBetter: false, unit: "%" },
  { key: "intPct", label: "INT %", higherIsBetter: false, unit: "%" },
];

function derivedMetrics(a: QbSeasonAgg): Record<string, number> {
  const dropbacks = a.attempts + a.sacksSuffered;
  const totalPlays = dropbacks + a.carries;
  return {
    epaPerPlay: totalPlays > 0 ? (a.passingEpaTotal + a.rushingEpaTotal) / totalPlays : 0,
    epaPerPass: a.attempts > 0 ? a.passingEpaTotal / a.attempts : 0,
    epaPerRush: a.carries > 0 ? a.rushingEpaTotal / a.carries : 0,
    compPct: a.attempts > 0 ? (a.completions / a.attempts) * 100 : 0,
    cpoe: a.attempts > 0 ? a.passingCpoeSum / a.attempts : 0,
    ydsPerRush: a.carries > 0 ? a.rushingYards / a.carries : 0,
    chunkPct: a.attempts > 0 ? (a.passing20 / a.attempts) * 100 : 0,
    explosivePct: a.attempts > 0 ? (a.passing40 / a.attempts) * 100 : 0,
    sackPct: dropbacks > 0 ? (a.sacksSuffered / dropbacks) * 100 : 0,
    intPct: a.attempts > 0 ? (a.interceptions / a.attempts) * 100 : 0,
  };
}

/**
 * QB radar profile for one player -- each axis is a percentile (0-100)
 * against every qualified QB (100+ attempts) that season, so the
 * shape is comparable across players regardless of raw stat scale.
 * Raw value is still attached per-axis for the tooltip.
 */
export async function getQbRadarProfile(playerId: string, season: number): Promise<QbRadarProfile | null> {
  const allQbs = await fetchQbSeasonAggregates(season);
  const target = allQbs.find((a) => a.playerId === playerId);
  if (!target) return null;

  const allDerived = allQbs.map((a) => ({ playerId: a.playerId, metrics: derivedMetrics(a) }));
  const targetMetrics = derivedMetrics(target);

  const axes: QbRadarAxis[] = RADAR_AXES.map(({ key, label, higherIsBetter, unit }) => {
    const values = allDerived.map((d) => d.metrics[key]);
    const targetValue = targetMetrics[key];
 
    // Percentile = share of the qualified field this player is better than.
    const better = higherIsBetter
      ? values.filter((v) => v < targetValue).length
      : values.filter((v) => v > targetValue).length;
    const percentile = values.length > 1 ? Math.round((better / (values.length - 1)) * 100) : 50;
 
    return { key, label, value: targetValue, percentile, higherIsBetter, unit };
  });
 

  return { playerId, season, attempts: target.attempts, axes };
}




// ---------------------------------------------------------------------
// LEAGUE-WIDE HOMEPAGE WIDGETS
// Append to src/lib/nfl/queries.ts. Reuses RankableSchemeKey and
// SCHEME_DB_COLUMN already defined earlier in that file -- do not
// duplicate those, this block assumes it's in the same module.
//
// All four functions below read from tables that are already synced
// per-team by sync_team_scheme_profile.py (nfl_team_scheme_profile,
// nfl_team_coverage_efficacy, nfl_team_route_profile). Nothing here
// requires new ingestion -- it's re-aggregating existing rows across
// all 32 teams instead of filtering to one.
// ---------------------------------------------------------------------

// --- 1. League Leaders board -------------------------------------------

export interface LeagueLeaderEntry {
  metricKey: RankableSchemeKey;
  label: string;
  teamId: string;
  value: number;
  leagueAvg: number;
  priorSeasonLeagueAvg: number | null; // for a league-wide trend arrow, not a per-team one
}

const HEADLINE_METRICS: { key: RankableSchemeKey; label: string }[] = [
  { key: "defBlitzRate", label: "Blitz Rate" },
  { key: "offPlayActionRate", label: "Play-Action Rate" },
  { key: "offMotionRate", label: "Pre-Snap Motion" },
  { key: "offFormationShotgunPct", label: "Shotgun Rate" },
  { key: "offPersonnel11Pct", label: "11 Personnel" },
  { key: "defCover1Pct", label: "Cover 1 Usage" },
  { key: "defCover3Pct", label: "Cover 3 Usage" },
  { key: "defManPct", label: "Man Coverage" },
];

async function fetchSchemeRows(season: number): Promise<Record<string, number | string | null>[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("nfl_team_scheme_profile").select("*").eq("season", season);
  return (data ?? []) as Record<string, number | string | null>[];
}

/**
 * "Who leads the league" board -- for each headline scheme metric, the
 * team with the highest raw value this season, the league average, and
 * (if a prior season exists in the table) the prior season's league
 * average so the UI can show whether the league as a whole is trending
 * toward or away from that tendency. This is a league-wide trend, not
 * a per-team one -- individual team trajectories belong on the team
 * page's own Year-on-Year tab.
 */
export async function getLeagueSchemeLeaders(season: number): Promise<LeagueLeaderEntry[]> {
  const [current, prior] = await Promise.all([fetchSchemeRows(season), fetchSchemeRows(season - 1)]);

  const results: LeagueLeaderEntry[] = [];
  for (const { key, label } of HEADLINE_METRICS) {
    const dbCol = SCHEME_DB_COLUMN[key];

    const values = current
      .map((row) => ({ teamId: row.team_id as string, value: row[dbCol] != null ? Number(row[dbCol]) : null }))
      .filter((r): r is { teamId: string; value: number } => r.value != null);
    if (values.length === 0) continue;

    const top = values.reduce((a, b) => (b.value > a.value ? b : a));
    const leagueAvg = values.reduce((sum, r) => sum + r.value, 0) / values.length;

    const priorValues = prior
      .map((row) => (row[dbCol] != null ? Number(row[dbCol]) : null))
      .filter((v): v is number => v != null);
    const priorSeasonLeagueAvg = priorValues.length > 0 ? priorValues.reduce((a, b) => a + b, 0) / priorValues.length : null;

    results.push({ metricKey: key, label, teamId: top.teamId, value: top.value, leagueAvg, priorSeasonLeagueAvg });
  }
  return results;
}

// --- 2. League coverage identity + YoY trend ---------------------------

export interface LeagueCoverageTrendPoint {
  season: number;
  coverageType: string;
  pct: number; // share of all charted defensive plays league-wide that were this coverage type
  epaAllowedPerPlay: number | null; // league-wide, plays-weighted average
  plays: number;
}

/**
 * League-wide coverage-shell identity across every season present in
 * nfl_team_coverage_efficacy -- "how does the NFL actually play
 * defense, and how has that shifted." One query, grouped in memory
 * rather than N queries per season, since the whole table is small
 * (32 teams x ~8 coverage types x however many seasons).
 */
export async function getLeagueCoverageTrend(): Promise<LeagueCoverageTrendPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("nfl_team_coverage_efficacy").select("*");
  const rows = (data ?? []) as {
    season: number;
    coverage_type: string;
    plays: number;
    epa_allowed_per_play: number | null;
  }[];

  // season -> total plays that season, for the pct denominator
  const totalsBySeason = new Map<number, number>();
  for (const r of rows) {
    totalsBySeason.set(r.season, (totalsBySeason.get(r.season) ?? 0) + r.plays);
  }

  // (season, coverageType) -> aggregated plays + weighted EPA
  const grouped = new Map<string, { season: number; coverageType: string; plays: number; epaSum: number }>();
  for (const r of rows) {
    const k = `${r.season}|${r.coverage_type}`;
    const g = grouped.get(k) ?? { season: r.season, coverageType: r.coverage_type, plays: 0, epaSum: 0 };
    g.plays += r.plays;
    g.epaSum += (r.epa_allowed_per_play ?? 0) * r.plays;
    grouped.set(k, g);
  }

  return Array.from(grouped.values())
    .map((g) => ({
      season: g.season,
      coverageType: g.coverageType,
      plays: g.plays,
      pct: (g.plays / (totalsBySeason.get(g.season) ?? g.plays)) * 100,
      epaAllowedPerPlay: g.plays > 0 ? g.epaSum / g.plays : null,
    }))
    .sort((a, b) => a.season - b.season || b.plays - a.plays);
}

// --- 3. League route identity + YoY trend -------------------------------

export interface LeagueRouteTrendPoint {
  season: number;
  route: string;
  pct: number; // share of all charted targets league-wide that went to this route
  yardsPerTarget: number | null;
  targets: number;
}

/** Same shape as getLeagueCoverageTrend, for route distribution. */
export async function getLeagueRouteTrend(): Promise<LeagueRouteTrendPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("nfl_team_route_profile").select("*");
  const rows = (data ?? []) as {
    season: number;
    route: string;
    targets: number;
    yards_per_target: number | null;
  }[];

  const totalsBySeason = new Map<number, number>();
  for (const r of rows) {
    totalsBySeason.set(r.season, (totalsBySeason.get(r.season) ?? 0) + r.targets);
  }

  const grouped = new Map<string, { season: number; route: string; targets: number; yptSum: number }>();
  for (const r of rows) {
    const k = `${r.season}|${r.route}`;
    const g = grouped.get(k) ?? { season: r.season, route: r.route, targets: 0, yptSum: 0 };
    g.targets += r.targets;
    g.yptSum += (r.yards_per_target ?? 0) * r.targets;
    grouped.set(k, g);
  }

  return Array.from(grouped.values())
    .map((g) => ({
      season: g.season,
      route: g.route,
      targets: g.targets,
      pct: (g.targets / (totalsBySeason.get(g.season) ?? g.targets)) * 100,
      yardsPerTarget: g.targets > 0 ? g.yptSum / g.targets : null,
    }))
    .sort((a, b) => a.season - b.season || b.targets - a.targets);
}

// --- 4. Scheme identity map (scatter) -----------------------------------

export interface SchemeIdentityPoint {
  teamId: string;
  x: number;
  y: number;
}

/**
 * All 32 teams plotted on two scheme axes for a single season --
 * e.g. blitz rate x man coverage rate, or shotgun rate x play-action
 * rate. Axis keys are params rather than hardcoded so the homepage can
 * offer a couple of preset axis pairs without a new query per pair.
 * Teams missing either value (e.g. no FTN charting for old seasons)
 * are silently dropped rather than plotted at a fake 0.
 */
export async function getSchemeIdentityMap(
  season: number,
  xKey: RankableSchemeKey,
  yKey: RankableSchemeKey
): Promise<SchemeIdentityPoint[]> {
  const rows = await fetchSchemeRows(season);
  const xCol = SCHEME_DB_COLUMN[xKey];
  const yCol = SCHEME_DB_COLUMN[yKey];

  return rows
    .map((row) => ({
      teamId: row.team_id as string,
      x: row[xCol] != null ? Number(row[xCol]) : null,
      y: row[yCol] != null ? Number(row[yCol]) : null,
    }))
    .filter((r): r is SchemeIdentityPoint => r.x != null && r.y != null);
}

// ---------------------------------------------------------------------
// TEAM STRENGTH SCATTER MAP
// Append to src/lib/nfl/queries.ts.
//
// Reuses off_epa_per_play_szn / def_epa_per_play_szn from
// nfl_team_season_reports -- the exact same raw columns getTeamDetail
// already reads to compute offEpaRank/defEpaRank. Deliberately NOT
// re-deriving these from pbp (even though that's tested and works --
// see the earlier league-leaders build) because reusing the same
// source the team page already trusts guarantees this scatter map can
// never show a different offensive/defensive read than the team's own
// clubhouse page for the same season.
// ---------------------------------------------------------------------

export interface TeamStrengthPoint {
  teamId: string;
  offEpaPerPlay: number;
  defEpaPerPlay: number; // EPA/play ALLOWED -- negative is a good defense, same sign convention as the team page
}

/**
 * One point per team with a real sample this season (games_played > 0
 * AND both EPA columns populated) -- teams with no games yet (e.g.
 * early preseason) are silently dropped rather than plotted at a
 * misleading 0,0.
 */
export async function getTeamStrengthMap(season: number): Promise<TeamStrengthPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_team_season_reports")
    .select("team_id, off_epa_per_play_szn, def_epa_per_play_szn, games_played")
    .eq("season", season);

  const rows = (data ?? []) as {
    team_id: string;
    off_epa_per_play_szn: string | null;
    def_epa_per_play_szn: string | null;
    games_played: number;
  }[];

  return rows
    .filter((r) => r.games_played > 0 && r.off_epa_per_play_szn != null && r.def_epa_per_play_szn != null)
    .map((r) => ({
      teamId: r.team_id,
      offEpaPerPlay: Number(r.off_epa_per_play_szn),
      defEpaPerPlay: Number(r.def_epa_per_play_szn),
    }));
}

// ---------------------------------------------------------------------
// QB ZONE GRID
// Append to src/lib/nfl/queries.ts. Reads nfl_qb_zone_profile, synced
// by sync_qb_zone_profile.py. Replaces the old placeholder QB Room
// data flow entirely -- see chat history for why (literal dot/
// trajectory pass charts aren't buildable without real tracking
// coordinates; this zone-grid style is the honest, verified version).
// ---------------------------------------------------------------------

export interface QbZoneCell {
  passLocation: string; // 'left' | 'middle' | 'right'
  passLength: string; // 'short' | 'deep'
  attempts: number;
  completions: number;
  compPct: number | null;
  cpoe: number | null;
  epaPerAtt: number | null;
  touchdowns: number;
  interceptions: number;
}

export interface QbZoneProfile {
  playerId: string;
  season: number;
  totalAttempts: number; // classified attempts only -- will be a little under the official season total, see sync script header
  cells: QbZoneCell[];
}

/**
 * Season zone profile for one QB. Deliberately COLLAPSES across teams
 * for a player traded mid-season (unlike nfl_player_route_profile,
 * which keeps team_id separate on purpose) -- the route profile
 * needed separation because target_pct is a share of that player's
 * role on that specific team, but a zone grid is meant to show "this
 * player's shape this season" as one picture, and splitting it into
 * two half-empty grids would be less useful than one combined one.
 */
export async function getQbZoneProfile(playerId: string, season: number): Promise<QbZoneProfile | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_qb_zone_profile")
    .select("*")
    .eq("player_id", playerId)
    .eq("season", season);

  const rows = (data ?? []) as {
    pass_location: string;
    pass_length: string;
    attempts: number;
    completions: number;
    cpoe: number | null;
    epa_per_att: number | null;
    touchdowns: number;
    interceptions: number;
  }[];

  if (rows.length === 0) return null;

  // Collapse multi-team rows onto the same (location, length) cell.
  const byZone = new Map<string, QbZoneCell>();
  for (const r of rows) {
    const key = `${r.pass_location}|${r.pass_length}`;
    const cell =
      byZone.get(key) ??
      ({
        passLocation: r.pass_location,
        passLength: r.pass_length,
        attempts: 0,
        completions: 0,
        compPct: null,
        cpoe: null,
        epaPerAtt: null,
        touchdowns: 0,
        interceptions: 0,
      } as QbZoneCell & { cpoeSum: number; epaSum: number });

    const withSums = cell as QbZoneCell & { cpoeSum?: number; epaSum?: number };
    withSums.cpoeSum = (withSums.cpoeSum ?? 0) + (r.cpoe ?? 0) * r.attempts;
    withSums.epaSum = (withSums.epaSum ?? 0) + (r.epa_per_att ?? 0) * r.attempts;
    cell.attempts += r.attempts;
    cell.completions += r.completions;
    cell.touchdowns += r.touchdowns;
    cell.interceptions += r.interceptions;
    byZone.set(key, cell);
  }

  const cells: QbZoneCell[] = Array.from(byZone.values()).map((c) => {
    const withSums = c as QbZoneCell & { cpoeSum?: number; epaSum?: number };
    return {
      ...c,
      compPct: c.attempts > 0 ? (c.completions / c.attempts) * 100 : null,
      cpoe: c.attempts > 0 && withSums.cpoeSum != null ? withSums.cpoeSum / c.attempts : null,
      epaPerAtt: c.attempts > 0 && withSums.epaSum != null ? withSums.epaSum / c.attempts : null,
    };
  });

  return {
    playerId,
    season,
    totalAttempts: cells.reduce((sum, c) => sum + c.attempts, 0),
    cells,
  };
}

export interface ZoneLeagueAverage {
  passLocation: string;
  passLength: string;
  avgCpoe: number;
  avgEpaPerAtt: number;
}

/**
 * League-wide, attempts-weighted average CPOE and EPA/att for each of
 * the 6 zones -- what the zone-grid UI colors cells against (green =
 * better than this zone's league average, not an absolute scale).
 * Matches the "League Avg X" framing in the image-2 reference.
 */
export async function getQbZoneLeagueAverages(season: number): Promise<ZoneLeagueAverage[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("nfl_qb_zone_profile").select("*").eq("season", season);

  const rows = (data ?? []) as {
    pass_location: string;
    pass_length: string;
    attempts: number;
    cpoe: number | null;
    epa_per_att: number | null;
  }[];

  const byZone = new Map<string, { attempts: number; cpoeSum: number; epaSum: number }>();
  for (const r of rows) {
    const key = `${r.pass_location}|${r.pass_length}`;
    const z = byZone.get(key) ?? { attempts: 0, cpoeSum: 0, epaSum: 0 };
    z.attempts += r.attempts;
    z.cpoeSum += (r.cpoe ?? 0) * r.attempts;
    z.epaSum += (r.epa_per_att ?? 0) * r.attempts;
    byZone.set(key, z);
  }

  return Array.from(byZone.entries()).map(([key, z]) => {
    const [passLocation, passLength] = key.split("|");
    return {
      passLocation,
      passLength,
      avgCpoe: z.attempts > 0 ? z.cpoeSum / z.attempts : 0,
      avgEpaPerAtt: z.attempts > 0 ? z.epaSum / z.attempts : 0,
    };
  });
}

// ---------------------------------------------------------------------
// QB SEASON BOX SCORE + PASSER RATING
// Append to src/lib/nfl/queries.ts.
//
// Passer rating formula verified against real data before shipping:
// Tua Tagovailoa's actual 2023 season (560 att, 388 comp, 4624 yds,
// 29 TD, 14 INT) computes to exactly 101.1 with the standard clamped
// NFL formula below -- matches the public number exactly, not an
// approximation. Same box-score fields (attempts, completions,
// passing_yards, passing_tds, interceptions) already proven correct
// in the radar chart build, summed the same way.
// ---------------------------------------------------------------------

export interface QbSeasonBoxScore {
  playerId: string;
  season: number;
  attempts: number;
  completions: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  compPct: number;
  passerRating: number;
}

function computePasserRating(att: number, comp: number, yds: number, td: number, int: number): number {
  if (att === 0) return 0;
  const clamp = (v: number) => Math.max(0, Math.min(2.375, v));
  const a = clamp(((comp / att) - 0.3) * 5);
  const b = clamp(((yds / att) - 3) * 0.25);
  const c = clamp((td / att) * 20);
  const d = clamp(2.375 - (int / att) * 25);
  return ((a + b + c + d) / 6) * 100;
}

export async function getQbSeasonBoxScore(playerId: string, season: number): Promise<QbSeasonBoxScore | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select("attempts, completions, passing_yards, passing_tds, interceptions")
    .eq("player_id", playerId)
    .eq("season", season);

  const rows = (data ?? []) as {
    attempts: number | null;
    completions: number | null;
    passing_yards: number | null;
    passing_tds: number | null;
    interceptions: number | null;
  }[];

  if (rows.length === 0) return null;

  const sum = (f: keyof (typeof rows)[number]) => rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
  const attempts = sum("attempts");
  if (attempts === 0) return null;

  const completions = sum("completions");
  const passingYards = sum("passing_yards");
  const passingTds = sum("passing_tds");
  const interceptions = sum("interceptions");

  return {
    playerId,
    season,
    attempts,
    completions,
    passingYards,
    passingTds,
    interceptions,
    compPct: (completions / attempts) * 100,
    passerRating: computePasserRating(attempts, completions, passingYards, passingTds, interceptions),
  };
}

// ---------------------------------------------------------------------
// PLAYER ROUTE CHART (RB/WR marquee)
// Append to src/lib/nfl/queries.ts. Reads nfl_player_route_profile,
// synced by sync_player_route_profile.py.
// ---------------------------------------------------------------------

export interface PlayerRouteRow {
  route: string;
  targets: number;
  targetPct: number | null;
  yardsPerTarget: number | null;
  catchRate: number | null;
  avgAirYards: number | null;
  avgYac: number | null;
  epaPerTarget: number | null;
  redZonePct: number | null;
  touchdowns: number;
}

export interface PlayerRouteProfile {
  playerId: string;
  season: number;
  teamId: string; // the team this profile represents -- see note below on trades
  rows: PlayerRouteRow[];
}

/**
 * Route profile for one player, one season. If the player has rows
 * for more than one team that season (mid-season trade -- see
 * sync_player_route_profile.py header, 11 such players in 2024 alone),
 * this resolves to whichever team has the most total targets, not a
 * blend of both. A marquee chart needs one coherent picture; showing
 * a merged number across two different offensive contexts would be
 * more misleading than picking the dominant stint and being clear
 * about which team it represents (teamId is returned explicitly so
 * the UI can label it).
 */
export async function getPlayerRouteProfile(playerId: string, season: number): Promise<PlayerRouteProfile | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_route_profile")
    .select("*")
    .eq("player_id", playerId)
    .eq("season", season);

  const rows = (data ?? []) as {
    team_id: string;
    route: string;
    targets: number;
    target_pct: number | null;
    yards_per_target: number | null;
    catch_rate: number | null;
    avg_air_yards: number | null;
    avg_yac: number | null;
    epa_per_target: number | null;
    red_zone_pct: number | null;
    touchdowns: number;
  }[];

  if (rows.length === 0) return null;

  const byTeam = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
    byTeam.get(r.team_id)!.push(r);
  }

  let bestTeam = "";
  let bestTotal = -1;
  for (const [teamId, teamRows] of byTeam.entries()) {
    const total = teamRows.reduce((s, r) => s + r.targets, 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestTeam = teamId;
    }
  }

  const teamRows = byTeam.get(bestTeam)!;
  return {
    playerId,
    season,
    teamId: bestTeam,
    rows: teamRows
      .map((r) => ({
        route: r.route,
        targets: r.targets,
        targetPct: r.target_pct != null ? Number(r.target_pct) : null,
        yardsPerTarget: r.yards_per_target != null ? Number(r.yards_per_target) : null,
        catchRate: r.catch_rate != null ? Number(r.catch_rate) : null,
        avgAirYards: r.avg_air_yards != null ? Number(r.avg_air_yards) : null,
        avgYac: r.avg_yac != null ? Number(r.avg_yac) : null,
        epaPerTarget: r.epa_per_target != null ? Number(r.epa_per_target) : null,
        redZonePct: r.red_zone_pct != null ? Number(r.red_zone_pct) : null,
        touchdowns: r.touchdowns,
      }))
      .sort((a, b) => b.targets - a.targets),
  };
}

// ---------------------------------------------------------------------
// GAME QB LOOKUP -- bridges the ESPN-sourced NFLGame (lib/nfl-schedule.ts)
// to the Supabase-synced nfl_games table, which has home_qb_id/
// away_qb_id from sync_schedule.py. NFLGame itself has no QB id and
// structurally can't -- it's built from ESPN's public scoreboard API,
// which doesn't expose one.
//
// Matches on season + week + team abbreviations. NOT assumed to line
// up cleanly -- ESPN and nflverse have disagreed on team abbreviations
// before in this codebase (the ESPN team-ID map was found "~1/3 wrong"
// during the original NFL build; 'LA' vs 'LAR' bit the route profile
// sync). Alias map handles known mismatches; anything unmapped returns
// null with a console warning rather than silently matching the wrong
// game or guessing.
// ---------------------------------------------------------------------

const ESPN_TO_NFLVERSE_ABBR: Record<string, string> = {
  WSH: "WAS", // ESPN uses WSH, nflverse/nfl_games uses WAS -- confirm against a real row before trusting
  LAR: "LA", // mirror of the pbp/participation alias found during the route profile build
};

export interface GameQbIds {
  homeQbId: string | null;
  homeQbName: string | null;
  awayQbId: string | null;
  awayQbName: string | null;
}

/**
 * Looks up QB gsis_ids for a given game by season/week/team
 * abbreviations, NOT by game_id -- NFLGame.id is an ESPN event id and
 * won't match nfl_games.game_id's nflverse format directly. If either
 * team abbreviation doesn't resolve to a real nfl_games row for that
 * season/week, returns null for that side and logs a warning rather
 * than guessing -- an empty QB Room tab is honest; a wrong QB's zone
 * grid under the wrong team's name is not.
 */
export async function getGameQbIds(
  season: number,
  week: number,
  homeAbbr: string,
  awayAbbr: string
): Promise<GameQbIds> {
  const supabase = createAdminClient();
  const homeCol = ESPN_TO_NFLVERSE_ABBR[homeAbbr] ?? homeAbbr;
  const awayCol = ESPN_TO_NFLVERSE_ABBR[awayAbbr] ?? awayAbbr;

  const { data } = await supabase
    .from("nfl_games")
    .select("home_qb_id, home_qb_name, away_qb_id, away_qb_name, home_team, away_team")
    .eq("season", season)
    .eq("week", week)
    .eq("home_team", homeCol)
    .eq("away_team", awayCol)
    .maybeSingle();

  if (!data) {
    console.warn(
      `getGameQbIds: no nfl_games match for season=${season} week=${week} home=${homeCol} away=${awayCol} ` +
        `(original ESPN abbrs: home=${homeAbbr} away=${awayAbbr}) -- check ESPN_TO_NFLVERSE_ABBR for a missing alias.`
    );
    return { homeQbId: null, homeQbName: null, awayQbId: null, awayQbName: null };
  }

  return {
    homeQbId: data.home_qb_id,
    homeQbName: data.home_qb_name,
    awayQbId: data.away_qb_id,
    awayQbName: data.away_qb_name,
  };
}

// ---------------------------------------------------------------------
// HOMEPAGE RESTRUCTURE -- Trending Reads
// Append to src/lib/nfl/queries.ts.
// ---------------------------------------------------------------------

export interface EditorialPost {
  title: string;
  snippet: string;
  readMinutes: number | null;
  slug: string;
}

/** Empty until a real editorial pipeline writes to nfl_editorial_posts.
 * No placeholder content -- an empty array here is the correct,
 * honest result right now, and the component handles it as a real
 * empty state rather than a bug. */
export async function getTrendingReads(limit = 4): Promise<EditorialPost[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_editorial_posts")
    .select("title, snippet, read_minutes, slug")
    .order("published_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as { title: string; snippet: string; read_minutes: number | null; slug: string }[]).map(
    (r) => ({ title: r.title, snippet: r.snippet, readMinutes: r.read_minutes, slug: r.slug })
  );
}

// ---------------------------------------------------------------------
// PLAYER / TEAM SEARCH
// Append to src/lib/nfl/queries.ts.
// ---------------------------------------------------------------------

export interface SearchResult {
  type: "player" | "team";
  id: string; // gsis_id or team_id
  label: string;
  sublabel: string;
  imageUrl: string | null;
  href: string;
}

/**
 * Combined player + team search by partial name match. Returns empty
 * for queries under 2 characters -- avoids firing a broad ILIKE scan
 * on every single keystroke as someone starts typing.
 *
 * NOT tested against a live database -- written to match the schema
 * shown in nfl_players/nfl_teams elsewhere in this file, but every
 * Supabase-touching query in this session has been unverified against
 * real data (unlike the nflreadpy/pbp claims, which were all curl-
 * verified). Worth a real search test once wired in.
 */
export async function searchPlayersAndTeams(query: string, limit = 8): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = createAdminClient();
  const like = `%${trimmed}%`;

  const [{ data: playersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("nfl_players")
      .select("gsis_id, full_name, position, team_id, headshot_url")
      .ilike("full_name", like)
      .limit(limit),
    supabase
      .from("nfl_teams")
      .select("team_id, team_name, team_nick, team_logo_url")
      .or(`team_name.ilike.${like},team_nick.ilike.${like},team_id.ilike.${like}`)
      .limit(limit),
  ]);

  const players: SearchResult[] = (
    (playersRaw ?? []) as { gsis_id: string; full_name: string; position: string; team_id: string; headshot_url: string | null }[]
  ).map((p) => ({
    type: "player",
    id: p.gsis_id,
    label: p.full_name,
    sublabel: `${p.position} · ${p.team_id}`,
    imageUrl: p.headshot_url,
    href: `/nfl/players/${p.gsis_id}`,
  }));

  const teams: SearchResult[] = (
    (teamsRaw ?? []) as { team_id: string; team_name: string; team_nick: string; team_logo_url: string | null }[]
  ).map((t) => ({
    type: "team",
    id: t.team_id,
    label: t.team_name,
    sublabel: t.team_nick,
    imageUrl: t.team_logo_url,
    href: `/nfl/teams/${t.team_id}`,
  }));

  // Players first -- searching "mahomes" shouldn't surface a coincidental
  // team-name substring match above the actual player.
  return [...players, ...teams].slice(0, limit);
}

// ---------------------------------------------------------------------
// TEAMS STATS TABLE (Savant-style, all 32 teams)
// Append to src/lib/nfl/queries.ts.
// ---------------------------------------------------------------------

export interface TeamStatsTableRow {
  teamId: string;
  logoUrl: string;
  record: string | null;
  pointsPerGame: number | null;
  pointsAllowedPerGame: number | null;
  offEpaPerPlay: number | null;
  defEpaPerPlay: number | null;
  offEpaRank: number | null;
  defEpaRank: number | null;
  blitzRate: number | null;
  playActionRate: number | null;
  shotgunRate: number | null;
}

/**
 * All 32 teams in one flat, sortable row set -- the dense Savant-style
 * table from the wireframe, as opposed to the 8-card League Leaders
 * board (which only shows the single league-wide leader per metric).
 * Joins nfl_team_season_reports (record/EPA) with
 * nfl_team_scheme_profile (blitz/PA/shotgun rates) by team_id --
 * two independent queries, joined in memory since both are small
 * (32 rows each).
 */
export async function getTeamStatsTable(season: number): Promise<TeamStatsTableRow[]> {
  const supabase = createAdminClient();

  const [{ data: teamsRaw }, { data: reportsRaw }, { data: schemeRaw }] = await Promise.all([
    supabase.from("nfl_teams").select("team_id, team_logo_url").order("team_id"),
    supabase.from("nfl_team_season_reports").select("*").eq("season", season),
    supabase.from("nfl_team_scheme_profile").select("team_id, def_blitz_rate, off_play_action_rate, off_formation_shotgun_pct").eq("season", season),
  ]);

  const teams = (teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[];
  const reportById = new Map(
    ((reportsRaw ?? []) as NflTeamSeasonReportsRow[]).map((r) => [r.team_id, r])
  );
  const schemeById = new Map(
    ((schemeRaw ?? []) as { team_id: string; def_blitz_rate: number | null; off_play_action_rate: number | null; off_formation_shotgun_pct: number | null }[]).map(
      (s) => [s.team_id, s]
    )
  );

  return teams.map((t) => {
    const r = reportById.get(t.team_id);
    const s = schemeById.get(t.team_id);
    const wins = r?.wins != null ? Number(r.wins) : null;
    const losses = r?.losses != null ? Number(r.losses) : null;
    const ties = r?.ties != null ? Number(r.ties) : null;
    return {
      teamId: t.team_id,
      logoUrl: t.team_logo_url ?? "",
      record: r && r.games_played > 0 && wins != null && losses != null ? `${wins}-${losses}${ties ? `-${ties}` : ""}` : null,
      pointsPerGame: r?.points_per_game != null ? Number(r.points_per_game) : null,
      pointsAllowedPerGame: r?.points_allowed_per_game != null ? Number(r.points_allowed_per_game) : null,
      offEpaPerPlay: r?.off_epa_per_play_szn != null ? Number(r.off_epa_per_play_szn) : null,
      defEpaPerPlay: r?.def_epa_per_play_szn != null ? Number(r.def_epa_per_play_szn) : null,
      offEpaRank: r?.off_epa_rank ?? null,
      defEpaRank: r?.def_epa_rank ?? null,
      blitzRate: s?.def_blitz_rate ?? null,
      playActionRate: s?.off_play_action_rate ?? null,
      shotgunRate: s?.off_formation_shotgun_pct ?? null,
    };
  });
}

// ---------------------------------------------------------------------
// WR RADAR PROFILE
// Append to src/lib/nfl/queries.ts, directly after getQbRadarProfile's
// closing brace (before the "LEAGUE-WIDE HOMEPAGE WIDGETS" comment).
//
// Same-shape sibling to getQbRadarProfile / fetchQbSeasonAggregates /
// derivedMetrics -- percentile-vs-qualified-field logic is identical,
// only the raw stats and formulas differ.
//
// Built ONLY from columns confirmed to exist in nfl_player_stats_weekly
// via direct query (targets, receptions, receiving_yards, receiving_tds,
// receiving_epa, target_share, air_yards_share, snap_pct). No YAC, no
// raw air-yards total, no drop rate -- those columns don't exist in this
// table, so they're not on the radar. Not substituting a proxy for any
// of them; the radar is honestly 8 axes, not 10 padded with guesses.
// ---------------------------------------------------------------------

export interface WrRadarAxis {
  key: string;
  label: string;
  value: number; // raw value, for the tooltip
  percentile: number; // 0-100 vs qualified WRs this season
  higherIsBetter: boolean;
  unit: "%" | "yds" | "";
}

export interface WrRadarProfile {
  playerId: string;
  season: number;
  targets: number;
  axes: WrRadarAxis[];
}

// Loose floor, same spirit as QB_MIN_ATTEMPTS_TO_QUALIFY -- enough to
// smooth out garbage-time/single-game noise, low enough to include
// part-season starters and WR2/WR3 volume. Adjust if this reads too
// strict/loose once real season data is flowing.
const WR_MIN_TARGETS_TO_QUALIFY = 30;

interface WrSeasonAgg {
  playerId: string;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  receivingEpaTotal: number;
  targetShareSum: number; // simple sum across weeks played, divided by weeksWithShare at the end
  weeksWithTargetShare: number;
  airYardsShareSum: number;
  weeksWithAirYardsShare: number;
  snapPctSum: number;
  weeksWithSnapPct: number;
}

/**
 * NOTE on averaging target_share / air_yards_share / snap_pct: these are
 * per-week percentages (share of that week's team volume/snaps), not
 * counting stats. Averaged as a simple mean across weeks where the value
 * was non-null -- NOT weighted by team pass volume that week, since we
 * don't have team-level weekly attempts in this table to weight against.
 * A snap-count-weighted average would be more precise; flagging this as
 * a simplification rather than silently presenting it as exact, same
 * spirit as fetchQbSeasonAggregates's attempts-weighted CPOE comment.
 */
async function fetchWrSeasonAggregates(season: number): Promise<WrSeasonAgg[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select(
      "player_id, position, targets, receptions, receiving_yards, receiving_tds, receiving_epa, target_share, air_yards_share, snap_pct"
    )
    .eq("season", season)
    .eq("position", "WR")
    .gt("targets", 0); // skip weeks with zero targets -- keeps inactive/DNP weeks out of the aggregation

  const rows = (data ?? []) as Record<string, number | string | null>[];
  const byPlayer = new Map<string, WrSeasonAgg>();

  for (const r of rows) {
    const id = r.player_id as string;
    const agg =
      byPlayer.get(id) ??
      ({
        playerId: id,
        targets: 0,
        receptions: 0,
        receivingYards: 0,
        receivingTds: 0,
        receivingEpaTotal: 0,
        targetShareSum: 0,
        weeksWithTargetShare: 0,
        airYardsShareSum: 0,
        weeksWithAirYardsShare: 0,
        snapPctSum: 0,
        weeksWithSnapPct: 0,
      } as WrSeasonAgg);

    agg.targets += Number(r.targets ?? 0);
    agg.receptions += Number(r.receptions ?? 0);
    agg.receivingYards += Number(r.receiving_yards ?? 0);
    agg.receivingTds += Number(r.receiving_tds ?? 0);
    agg.receivingEpaTotal += Number(r.receiving_epa ?? 0);

    if (r.target_share != null) {
      agg.targetShareSum += Number(r.target_share);
      agg.weeksWithTargetShare += 1;
    }
    if (r.air_yards_share != null) {
      agg.airYardsShareSum += Number(r.air_yards_share);
      agg.weeksWithAirYardsShare += 1;
    }
    if (r.snap_pct != null) {
      agg.snapPctSum += Number(r.snap_pct);
      agg.weeksWithSnapPct += 1;
    }

    byPlayer.set(id, agg);
  }

  return Array.from(byPlayer.values()).filter((a) => a.targets >= WR_MIN_TARGETS_TO_QUALIFY);
}

const WR_RADAR_AXES: { key: string; label: string; higherIsBetter: boolean; unit: "%" | "yds" | "" }[] = [
  { key: "targetShare", label: "Target Share", higherIsBetter: true, unit: "%" },
  { key: "catchRate", label: "Catch %", higherIsBetter: true, unit: "%" },
  { key: "ydsPerTarget", label: "Yds / Target", higherIsBetter: true, unit: "yds" },
  { key: "ydsPerReception", label: "Yds / Rec", higherIsBetter: true, unit: "yds" },
  { key: "tdRate", label: "TD % (of targets)", higherIsBetter: true, unit: "%" },
  { key: "epaPerTarget", label: "EPA / Target", higherIsBetter: true, unit: "" },
  { key: "airYardsShare", label: "Air Yards Share", higherIsBetter: true, unit: "%" },
  { key: "snapPct", label: "Snap %", higherIsBetter: true, unit: "%" },
];

function derivedWrMetrics(a: WrSeasonAgg): Record<string, number> {
  return {
    targetShare: a.weeksWithTargetShare > 0 ? (a.targetShareSum / a.weeksWithTargetShare) * 100 : 0,
    catchRate: a.targets > 0 ? (a.receptions / a.targets) * 100 : 0,
    ydsPerTarget: a.targets > 0 ? a.receivingYards / a.targets : 0,
    ydsPerReception: a.receptions > 0 ? a.receivingYards / a.receptions : 0,
    tdRate: a.targets > 0 ? (a.receivingTds / a.targets) * 100 : 0,
    epaPerTarget: a.targets > 0 ? a.receivingEpaTotal / a.targets : 0,
    airYardsShare: a.weeksWithAirYardsShare > 0 ? (a.airYardsShareSum / a.weeksWithAirYardsShare) * 100 : 0,
    snapPct: a.weeksWithSnapPct > 0 ? (a.snapPctSum / a.weeksWithSnapPct) * 100 : 0,
  };
}

/**
 * WR radar profile for one player -- each axis is a percentile (0-100)
 * against every qualified WR (30+ targets) that season. Same shape as
 * getQbRadarProfile so the frontend component can consume either with
 * one generic renderer.
 */
export async function getWrRadarProfile(playerId: string, season: number): Promise<WrRadarProfile | null> {
  const allWrs = await fetchWrSeasonAggregates(season);
  const target = allWrs.find((a) => a.playerId === playerId);
  if (!target) return null;

  const allDerived = allWrs.map((a) => ({ playerId: a.playerId, metrics: derivedWrMetrics(a) }));
  const targetMetrics = derivedWrMetrics(target);

  const axes: WrRadarAxis[] = WR_RADAR_AXES.map(({ key, label, higherIsBetter, unit }) => {
    const values = allDerived.map((d) => d.metrics[key]);
    const targetValue = targetMetrics[key];
 
    const better = higherIsBetter
      ? values.filter((v) => v < targetValue).length
      : values.filter((v) => v > targetValue).length;
    const percentile = values.length > 1 ? Math.round((better / (values.length - 1)) * 100) : 50;
 
    return { key, label, value: targetValue, percentile, higherIsBetter, unit };
  });
 

  return { playerId, season, targets: target.targets, axes };
}

// ---------------------------------------------------------------------
// TEAM YARDS LEADERS
// Append to src/lib/nfl/queries.ts.
//
// No table in Supabase carries raw team yardage (nfl_team_season_reports
// and nfl_team_stats_weekly are both EPA/efficiency-only, confirmed by
// direct column inspection). Built here by summing passing_yards +
// rushing_yards per team_id across every player-week row in
// nfl_player_stats_weekly for the season -- each play's yardage is
// attributed to exactly one player (the passer or the rusher), so
// summing across all players on a team reconstructs the team total
// with no double-counting. Deliberately NOT summing receiving_yards
// too -- that would double-count every completed pass.
// ---------------------------------------------------------------------

export interface TeamYardsLeaderRow {
  teamId: string;
  logoUrl: string;
  passYards: number;
  rushYards: number;
  totalYards: number;
}

export async function getTeamYardsLeaders(season: number, limit = 10): Promise<TeamYardsLeaderRow[]> {
  const supabase = createAdminClient();

  const [{ data: statsRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("nfl_player_stats_weekly")
      .select("team_id, passing_yards, rushing_yards")
      .eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url"),
  ]);

  const rows = (statsRaw ?? []) as { team_id: string; passing_yards: number | null; rushing_yards: number | null }[];
  const totals = new Map<string, { pass: number; rush: number }>();

  for (const r of rows) {
    if (!r.team_id) continue;
    const cur = totals.get(r.team_id) ?? { pass: 0, rush: 0 };
    cur.pass += Number(r.passing_yards ?? 0);
    cur.rush += Number(r.rushing_yards ?? 0);
    totals.set(r.team_id, cur);
  }

  const logoById = new Map(
    ((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""])
  );

  return Array.from(totals.entries())
    .map(([teamId, v]) => ({
      teamId,
      logoUrl: logoById.get(teamId) ?? "",
      passYards: Math.round(v.pass),
      rushYards: Math.round(v.rush),
      totalYards: Math.round(v.pass + v.rush),
    }))
    .filter((r) => r.totalYards > 0)
    .sort((a, b) => b.totalYards - a.totalYards)
    .slice(0, limit);
}

// ---------------------------------------------------------------------
// TEAM PENALTY LEADERS
// Append to src/lib/nfl/queries.ts. NOT wired into NflTeamYardsLeaders
// yet -- add a 4th "Penalties" tab once nfl_team_penalties_weekly
// actually has rows in it (after fetch_nfl_penalties.py has run
// successfully against verified column names). Wiring an always-empty
// tab into the UI before the data exists just teaches users to ignore
// that tab.
// ---------------------------------------------------------------------

export interface TeamPenaltyLeaderRow {
  teamId: string;
  logoUrl: string;
  penalties: number;
  penaltyYards: number;
}

// Ranked ascending by default (fewest penalties = "best" / most
// disciplined team) -- pass mostPenalized: true to flip it for a
// "most penalized" framing instead.
export async function getTeamPenaltyLeaders(
  season: number,
  limit = 10,
  mostPenalized = false
): Promise<TeamPenaltyLeaderRow[]> {
  const supabase = createAdminClient();

  const [{ data: penRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from("nfl_team_penalties_weekly").select("team_id, penalties, penalty_yards").eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url"),
  ]);

  const rows = (penRaw ?? []) as { team_id: string; penalties: number | null; penalty_yards: number | null }[];
  const totals = new Map<string, { penalties: number; yards: number }>();

  for (const r of rows) {
    if (!r.team_id) continue;
    const cur = totals.get(r.team_id) ?? { penalties: 0, yards: 0 };
    cur.penalties += Number(r.penalties ?? 0);
    cur.yards += Number(r.penalty_yards ?? 0);
    totals.set(r.team_id, cur);
  }

  const logoById = new Map(
    ((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""])
  );

  const list = Array.from(totals.entries())
    .map(([teamId, v]) => ({
      teamId,
      logoUrl: logoById.get(teamId) ?? "",
      penalties: Math.round(v.penalties),
      penaltyYards: Math.round(v.yards),
    }))
    .filter((r) => r.penalties > 0);

  list.sort((a, b) => (mostPenalized ? b.penalties - a.penalties : a.penalties - b.penalties));
  return list.slice(0, limit);
}

// ---------------------------------------------------------------------
// TEAM DEFENSE LEADERS
// Append to src/lib/nfl/queries.ts, near getTeamYardsLeaders.
//
// Aggregated from individual defensive player stats (sacks, tackles for
// loss, interceptions) summed by team_id in nfl_player_defense_stats_weekly.
// Ranked by a combined "defensivePlays" total (sacks + TFL + INTs) --
// three different units added together, which is a simplification, not
// a precise defensive index. Flagging that rather than presenting the
// combined number as more rigorous than it is. Sacks can be fractional
// (shared sacks credited as 0.5 each), so this is NOT rounded to an
// integer like tackle/INT counts are.
// ---------------------------------------------------------------------

export interface TeamDefenseLeaderRow {
  teamId: string;
  logoUrl: string;
  sacks: number;
  tacklesForLoss: number;
  interceptions: number;
  defensivePlays: number; // sacks + TFL + INTs, the ranking value
}

export async function getTeamDefenseLeaders(season: number, limit = 20): Promise<TeamDefenseLeaderRow[]> {
  const supabase = createAdminClient();

  const [{ data: statsRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("nfl_player_defense_stats_weekly")
      .select("team_id, sacks, tackles_for_loss, interceptions")
      .eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url"),
  ]);

  const rows = (statsRaw ?? []) as { team_id: string; sacks: number | null; tackles_for_loss: number | null; interceptions: number | null }[];
  const totals = new Map<string, { sacks: number; tfl: number; ints: number }>();

  for (const r of rows) {
    if (!r.team_id) continue;
    const cur = totals.get(r.team_id) ?? { sacks: 0, tfl: 0, ints: 0 };
    cur.sacks += Number(r.sacks ?? 0);
    cur.tfl += Number(r.tackles_for_loss ?? 0);
    cur.ints += Number(r.interceptions ?? 0);
    totals.set(r.team_id, cur);
  }

  const logoById = new Map(
    ((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""])
  );

  return Array.from(totals.entries())
    .map(([teamId, v]) => ({
      teamId,
      logoUrl: logoById.get(teamId) ?? "",
      sacks: Math.round(v.sacks * 10) / 10,
      tacklesForLoss: Math.round(v.tfl),
      interceptions: Math.round(v.ints),
      defensivePlays: Math.round((v.sacks + v.tfl + v.ints) * 10) / 10,
    }))
    .filter((r) => r.defensivePlays > 0)
    .sort((a, b) => b.defensivePlays - a.defensivePlays)
    .slice(0, limit);
}

// ---------------------------------------------------------------------
// TEAM FIELD GOAL LEADERS
// Append to src/lib/nfl/queries.ts, near the two above.
//
// Season FG% is computed as sum(fg_made) / sum(fg_att) -- NOT an average
// of each week's fg_pct, which would be mathematically wrong (a 1-for-1
// week and a 0-for-3 week don't average to the right season rate).
// ---------------------------------------------------------------------

export interface TeamFgLeaderRow {
  teamId: string;
  logoUrl: string;
  fgMade: number;
  fgAtt: number;
  fgPct: number | null; // null if no attempts on record
}

export async function getTeamFgLeaders(season: number, limit = 15 ): Promise<TeamFgLeaderRow[]> {
  const supabase = createAdminClient();

  const [{ data: stRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("nfl_special_teams_stats_weekly")
      .select("team_id, fg_made, fg_att")
      .eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url"),
  ]);

  const rows = (stRaw ?? []) as { team_id: string; fg_made: number | null; fg_att: number | null }[];
  const totals = new Map<string, { made: number; att: number }>();

  for (const r of rows) {
    if (!r.team_id) continue;
    const cur = totals.get(r.team_id) ?? { made: 0, att: 0 };
    cur.made += Number(r.fg_made ?? 0);
    cur.att += Number(r.fg_att ?? 0);
    totals.set(r.team_id, cur);
  }

  const logoById = new Map(
    ((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""])
  );

  return Array.from(totals.entries())
    .map(([teamId, v]) => ({
      teamId,
      logoUrl: logoById.get(teamId) ?? "",
      fgMade: Math.round(v.made),
      fgAtt: Math.round(v.att),
      fgPct: v.att > 0 ? Math.round((v.made / v.att) * 1000) / 10 : null,
    }))
    .filter((r) => r.fgAtt > 0)
    .sort((a, b) => b.fgMade - a.fgMade)
    .slice(0, limit);
}

// ---------------------------------------------------------------------
// LEAGUE RUSH & PASS TENDENCY TREND
// Append to src/lib/nfl/queries.ts, near getLeagueCoverageTrend.
//
// League-wide, plays-weighted average of rush_epa_per_carry and proe
// (pass rate over expected) per season, from nfl_team_stats_weekly.
// Weighted by plays_offense so a team that only logged a few games in
// a partial season doesn't get equal say to a full 17-game season.
// ---------------------------------------------------------------------

export interface LeagueRushPassTrendPoint {
  season: number;
  rushEpaPerCarry: number | null;
  proe: number | null; // pass rate over expected -- positive = pass-heavier than expected
}

export async function getLeagueRushPassTrend(): Promise<LeagueRushPassTrendPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_team_stats_weekly")
    .select("season, rush_epa_per_carry, proe, plays_offense");

  const rows = (data ?? []) as {
    season: number;
    rush_epa_per_carry: number | null;
    proe: number | null;
    plays_offense: number | null;
  }[];

  const bySeason = new Map<number, { rushSum: number; rushWeight: number; proeSum: number; proeWeight: number }>();
  for (const r of rows) {
    const w = Number(r.plays_offense ?? 0);
    if (w <= 0) continue;
    const g = bySeason.get(r.season) ?? { rushSum: 0, rushWeight: 0, proeSum: 0, proeWeight: 0 };
    if (r.rush_epa_per_carry != null) {
      g.rushSum += Number(r.rush_epa_per_carry) * w;
      g.rushWeight += w;
    }
    if (r.proe != null) {
      g.proeSum += Number(r.proe) * w;
      g.proeWeight += w;
    }
    bySeason.set(r.season, g);
  }

  return Array.from(bySeason.entries())
    .map(([season, g]) => ({
      season,
      rushEpaPerCarry: g.rushWeight > 0 ? g.rushSum / g.rushWeight : null,
      proe: g.proeWeight > 0 ? g.proeSum / g.proeWeight : null,
    }))
    .sort((a, b) => a.season - b.season);
}

// ---------------------------------------------------------------------
// LEAGUE SCHEME EVOLUTION TREND
// Append to src/lib/nfl/queries.ts, near the function above.
//
// League-wide, charted-plays-weighted average of four offensive scheme
// rates per season, from nfl_team_scheme_profile.
// ---------------------------------------------------------------------

export interface LeagueSchemeEvolutionPoint {
  season: number;
  shotgunPct: number | null;
  playActionRate: number | null;
  motionRate: number | null;
  rpoRate: number | null;
}

export async function getLeagueSchemeEvolutionTrend(): Promise<LeagueSchemeEvolutionPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_team_scheme_profile")
    .select("season, off_formation_shotgun_pct, off_play_action_rate, off_motion_rate, off_rpo_rate, off_plays_charted");

  const rows = (data ?? []) as {
    season: number;
    off_formation_shotgun_pct: number | null;
    off_play_action_rate: number | null;
    off_motion_rate: number | null;
    off_rpo_rate: number | null;
    off_plays_charted: number | null;
  }[];

  const bySeason = new Map<number, { shotgunSum: number; paSum: number; motionSum: number; rpoSum: number; weight: number }>();
  for (const r of rows) {
    const w = Number(r.off_plays_charted ?? 0);
    if (w <= 0) continue;
    const g = bySeason.get(r.season) ?? { shotgunSum: 0, paSum: 0, motionSum: 0, rpoSum: 0, weight: 0 };
    g.shotgunSum += Number(r.off_formation_shotgun_pct ?? 0) * w;
    g.paSum += Number(r.off_play_action_rate ?? 0) * w;
    g.motionSum += Number(r.off_motion_rate ?? 0) * w;
    g.rpoSum += Number(r.off_rpo_rate ?? 0) * w;
    g.weight += w;
    bySeason.set(r.season, g);
  }

  return Array.from(bySeason.entries())
    .map(([season, g]) => ({
      season,
      shotgunPct: g.weight > 0 ? g.shotgunSum / g.weight : null,
      playActionRate: g.weight > 0 ? g.paSum / g.weight : null,
      motionRate: g.weight > 0 ? g.motionSum / g.weight : null,
      rpoRate: g.weight > 0 ? g.rpoSum / g.weight : null,
    }))
    .sort((a, b) => a.season - b.season);
}


// ---------------------------------------------------------------------
// BIGGEST RUSH EPA/CARRY MOVER, YEAR OVER YEAR
// Append to src/lib/nfl/queries.ts.
//
// Finds the single player with the largest rush EPA/carry improvement
// between two seasons, from nfl_player_stats_weekly (confirmed real
// columns: player_id, player_name, team_id, carries, rushing_yards,
// rushing_epa -- spans 2021-2025). Requires minCarries in BOTH seasons
// so a player who barely touched the ball one year doesn't produce a
// misleadingly huge swing off a tiny sample.
//
// NOTE: this is a real, defensible efficiency comparison -- NOT the
// same thing as NFL Next Gen Stats' "rush yards over expected" (that
// metric exists in nfl_next_gen_stats but only has 2025 data, so it
// literally cannot support a year-over-year comparison yet).
// ---------------------------------------------------------------------

export interface RushEpaYoyMover {
  playerId: string;
  playerName: string;
  teamId: string;
  season: number;
  priorSeason: number;
  epaPerCarry: number;
  priorEpaPerCarry: number;
  delta: number;
  carries: number;
  rushYards: number;
}

export async function getBiggestRushEpaMover(
  season: number,
  priorSeason: number,
  minCarries = 50,
): Promise<RushEpaYoyMover | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select("player_id, player_name, team_id, season, carries, rushing_yards, rushing_epa")
    .in("season", [season, priorSeason])
    .gt("carries", 0);

  const rows = (data ?? []) as {
    player_id: string;
    player_name: string;
    team_id: string;
    season: number;
    carries: number | null;
    rushing_yards: number | null;
    rushing_epa: number | null;
  }[];

  type Agg = { name: string; team: string; carries: number; yards: number; epaSum: number };
  const bySeasonPlayer = new Map<string, Agg>();

  for (const r of rows) {
    const key = `${r.season}|${r.player_id}`;
    const g = bySeasonPlayer.get(key) ?? { name: r.player_name, team: r.team_id, carries: 0, yards: 0, epaSum: 0 };
    g.carries += Number(r.carries ?? 0);
    g.yards += Number(r.rushing_yards ?? 0);
    g.epaSum += Number(r.rushing_epa ?? 0);
    g.name = r.player_name;
    g.team = r.team_id;
    bySeasonPlayer.set(key, g);
  }

  const playerIds = new Set(rows.map((r) => r.player_id));
  let best: RushEpaYoyMover | null = null;

  for (const pid of playerIds) {
    const curr = bySeasonPlayer.get(`${season}|${pid}`);
    const prior = bySeasonPlayer.get(`${priorSeason}|${pid}`);
    if (!curr || !prior) continue;
    if (curr.carries < minCarries || prior.carries < minCarries) continue;

    const currEpaPerCarry = curr.epaSum / curr.carries;
    const priorEpaPerCarry = prior.epaSum / prior.carries;
    const delta = currEpaPerCarry - priorEpaPerCarry;

    if (!best || delta > best.delta) {
      best = {
        playerId: pid,
        playerName: curr.name,
        teamId: curr.team,
        season,
        priorSeason,
        epaPerCarry: currEpaPerCarry,
        priorEpaPerCarry,
        delta,
        carries: curr.carries,
        rushYards: curr.yards,
      };
    }
  }

  return best;
}

// ---------------------------------------------------------------------
// BIGGEST MOVERS, YEAR OVER YEAR -- PASS / RECEIVING / FANTASY / TEAM
// Append to src/lib/nfl/queries.ts, near getBiggestRushEpaMover.
//
// Same pattern as getBiggestRushEpaMover: player (or team) present in
// both seasons, minimum volume floor in both, biggest positive delta
// wins. All columns confirmed real and multi-year (2021-2025) --
// same nfl_player_stats_weekly table already used for rush.
// ---------------------------------------------------------------------

export interface PassEpaYoyMover {
  playerId: string; playerName: string; teamId: string;
  season: number; priorSeason: number;
  epaPerAtt: number; priorEpaPerAtt: number; delta: number;
  attempts: number; passYards: number;
}

export async function getBiggestPassEpaMover(
  season: number, priorSeason: number, minAttempts = 100,
): Promise<PassEpaYoyMover | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select("player_id, player_name, team_id, season, attempts, passing_yards, passing_epa")
    .in("season", [season, priorSeason])
    .gt("attempts", 0);

  const rows = (data ?? []) as { player_id: string; player_name: string; team_id: string; season: number; attempts: number | null; passing_yards: number | null; passing_epa: number | null }[];

  type Agg = { name: string; team: string; att: number; yards: number; epaSum: number };
  const bySeasonPlayer = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.season}|${r.player_id}`;
    const g = bySeasonPlayer.get(key) ?? { name: r.player_name, team: r.team_id, att: 0, yards: 0, epaSum: 0 };
    g.att += Number(r.attempts ?? 0);
    g.yards += Number(r.passing_yards ?? 0);
    g.epaSum += Number(r.passing_epa ?? 0);
    g.name = r.player_name; g.team = r.team_id;
    bySeasonPlayer.set(key, g);
  }

  const playerIds = new Set(rows.map((r) => r.player_id));
  let best: PassEpaYoyMover | null = null;
  for (const pid of playerIds) {
    const curr = bySeasonPlayer.get(`${season}|${pid}`);
    const prior = bySeasonPlayer.get(`${priorSeason}|${pid}`);
    if (!curr || !prior || curr.att < minAttempts || prior.att < minAttempts) continue;
    const currE = curr.epaSum / curr.att, priorE = prior.epaSum / prior.att, delta = currE - priorE;
    if (!best || delta > best.delta) {
      best = { playerId: pid, playerName: curr.name, teamId: curr.team, season, priorSeason, epaPerAtt: currE, priorEpaPerAtt: priorE, delta, attempts: curr.att, passYards: curr.yards };
    }
  }
  return best;
}

export interface RecEpaYoyMover {
  playerId: string; playerName: string; teamId: string;
  season: number; priorSeason: number;
  epaPerTarget: number; priorEpaPerTarget: number; delta: number;
  targets: number; recYards: number;
}

export async function getBiggestReceivingEpaMover(
  season: number, priorSeason: number, minTargets = 30,
): Promise<RecEpaYoyMover | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select("player_id, player_name, team_id, season, targets, receiving_yards, receiving_epa")
    .in("season", [season, priorSeason])
    .gt("targets", 0);

  const rows = (data ?? []) as { player_id: string; player_name: string; team_id: string; season: number; targets: number | null; receiving_yards: number | null; receiving_epa: number | null }[];

  type Agg = { name: string; team: string; tgt: number; yards: number; epaSum: number };
  const bySeasonPlayer = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.season}|${r.player_id}`;
    const g = bySeasonPlayer.get(key) ?? { name: r.player_name, team: r.team_id, tgt: 0, yards: 0, epaSum: 0 };
    g.tgt += Number(r.targets ?? 0);
    g.yards += Number(r.receiving_yards ?? 0);
    g.epaSum += Number(r.receiving_epa ?? 0);
    g.name = r.player_name; g.team = r.team_id;
    bySeasonPlayer.set(key, g);
  }

  const playerIds = new Set(rows.map((r) => r.player_id));
  let best: RecEpaYoyMover | null = null;
  for (const pid of playerIds) {
    const curr = bySeasonPlayer.get(`${season}|${pid}`);
    const prior = bySeasonPlayer.get(`${priorSeason}|${pid}`);
    if (!curr || !prior || curr.tgt < minTargets || prior.tgt < minTargets) continue;
    const currE = curr.epaSum / curr.tgt, priorE = prior.epaSum / prior.tgt, delta = currE - priorE;
    if (!best || delta > best.delta) {
      best = { playerId: pid, playerName: curr.name, teamId: curr.team, season, priorSeason, epaPerTarget: currE, priorEpaPerTarget: priorE, delta, targets: curr.tgt, recYards: curr.yards };
    }
  }
  return best;
}

export interface FantasyYoyMover {
  playerId: string; playerName: string; teamId: string;
  season: number; priorSeason: number;
  points: number; priorPoints: number; delta: number;
}

export async function getBiggestFantasyMover(
  season: number, priorSeason: number, minGames = 6,
): Promise<FantasyYoyMover | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_player_stats_weekly")
    .select("player_id, player_name, team_id, season, week, fantasy_points_ppr")
    .in("season", [season, priorSeason]);

  const rows = (data ?? []) as { player_id: string; player_name: string; team_id: string; season: number; week: number; fantasy_points_ppr: number | null }[];

  type Agg = { name: string; team: string; games: number; points: number };
  const bySeasonPlayer = new Map<string, Agg>();
  for (const r of rows) {
    if (r.fantasy_points_ppr == null) continue;
    const key = `${r.season}|${r.player_id}`;
    const g = bySeasonPlayer.get(key) ?? { name: r.player_name, team: r.team_id, games: 0, points: 0 };
    g.games += 1;
    g.points += Number(r.fantasy_points_ppr);
    g.name = r.player_name; g.team = r.team_id;
    bySeasonPlayer.set(key, g);
  }

  const playerIds = new Set(rows.map((r) => r.player_id));
  let best: FantasyYoyMover | null = null;
  for (const pid of playerIds) {
    const curr = bySeasonPlayer.get(`${season}|${pid}`);
    const prior = bySeasonPlayer.get(`${priorSeason}|${pid}`);
    if (!curr || !prior || curr.games < minGames || prior.games < minGames) continue;
    const delta = curr.points - prior.points;
    if (!best || delta > best.delta) {
      best = { playerId: pid, playerName: curr.name, teamId: curr.team, season, priorSeason, points: curr.points, priorPoints: prior.points, delta };
    }
  }
  return best;
}

export interface TeamEpaYoyMover {
  teamId: string; logoUrl: string;
  season: number; priorSeason: number;
  offEpaPerPlay: number; priorOffEpaPerPlay: number; delta: number;
}

export async function getBiggestTeamOffenseMover(
  season: number, priorSeason: number,
): Promise<TeamEpaYoyMover | null> {
  const supabase = createAdminClient();
  const [{ data: reportsRaw }, { data: teamsRaw }] = await Promise.all([
    supabase.from("nfl_team_season_reports").select("team_id, season, off_epa_per_play_szn, games_played").in("season", [season, priorSeason]),
    supabase.from("nfl_teams").select("team_id, team_logo_url"),
  ]);

  const rows = (reportsRaw ?? []) as { team_id: string; season: number; off_epa_per_play_szn: string | null; games_played: number }[];
  const logoById = new Map(((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""]));

  const byKey = new Map<string, number>();
  for (const r of rows) {
    if (r.games_played <= 0 || r.off_epa_per_play_szn == null) continue;
    byKey.set(`${r.season}|${r.team_id}`, Number(r.off_epa_per_play_szn));
  }

  const teamIds = new Set(rows.map((r) => r.team_id));
  let best: TeamEpaYoyMover | null = null;
  for (const tid of teamIds) {
    const curr = byKey.get(`${season}|${tid}`);
    const prior = byKey.get(`${priorSeason}|${tid}`);
    if (curr == null || prior == null) continue;
    const delta = curr - prior;
    if (!best || delta > best.delta) {
      best = { teamId: tid, logoUrl: logoById.get(tid) ?? "", season, priorSeason, offEpaPerPlay: curr, priorOffEpaPerPlay: prior, delta };
    }
  }
  return best;
}

// ---------------------------------------------------------------------
// QB ROOM — NGS PASSING PROFILES
// Append to src/lib/nfl/queries.ts.
//
// Built from nfl_next_gen_stats where stat_type='passing' -- the real
// data lives inside raw_source_json (confirmed via direct query: fields
// include attempts, avg_intended_air_yards, avg_completed_air_yards,
// avg_air_yards_differential, avg_air_yards_to_sticks, aggressiveness,
// completion_percentage_above_expectation, avg_time_to_throw,
// player_display_name). This table is 2025-only -- no prior-season
// comparison possible yet (same constraint as the rush-mover card).
//
// Season aggregate is attempts-weighted across weeks, not a simple
// average of weekly averages -- a 40-attempt week should count more
// than a 12-attempt week.
//
// Tags (Downfield / Checkdown / Rusher) are percentile-based against
// the qualified field this season, not hardcoded thresholds -- "top
// quartile of intended air yards" scales naturally as the league's
// depth-of-target norms shift year to year, unlike a fixed "9+ yards
// = downfield" cutoff would.
// ---------------------------------------------------------------------

export type QbTag = 'Downfield' | 'Checkdown' | 'Rusher';

export interface QbNgsSeasonProfile {
  playerId: string;
  playerName: string;
  teamId: string;
  teamColor: string | null;
  headshotUrl: string | null;
  season: number;
  attempts: number;
  avgIntendedAirYards: number;
  avgCompletedAirYards: number;
  avgAirYardsDifferential: number;
  avgAirYardsToSticks: number;
  aggressiveness: number;
  completionPctAboveExpectation: number;
  avgTimeToThrow: number;
  rushEpaPerCarry: number | null;
  carries: number;
  tags: QbTag[];
}

const QB_NGS_MIN_ATTEMPTS = 100;

export async function getQbNgsSeasonProfiles(season: number): Promise<QbNgsSeasonProfile[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("player_id, team_id, season, week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "passing");

  const rows = (data ?? []) as { player_id: string; team_id: string; season: number; week: number; raw_source_json: any }[];

  type Agg = {
    name: string; team: string; attemptsSum: number;
    iayW: number; cayW: number; diffW: number; sticksW: number; aggW: number; cpoeW: number; tttW: number;
  };
  const byPlayer = new Map<string, Agg>();

  for (const r of rows) {
    const j = r.raw_source_json ?? {};
    const att = Number(j.attempts ?? 0);
    if (att <= 0) continue;
    const g = byPlayer.get(r.player_id) ?? {
      name: j.player_display_name ?? r.player_id, team: r.team_id,
      attemptsSum: 0, iayW: 0, cayW: 0, diffW: 0, sticksW: 0, aggW: 0, cpoeW: 0, tttW: 0,
    };
    g.attemptsSum += att;
    g.iayW += Number(j.avg_intended_air_yards ?? 0) * att;
    g.cayW += Number(j.avg_completed_air_yards ?? 0) * att;
    g.diffW += Number(j.avg_air_yards_differential ?? 0) * att;
    g.sticksW += Number(j.avg_air_yards_to_sticks ?? 0) * att;
    g.aggW += Number(j.aggressiveness ?? 0) * att;
    g.cpoeW += Number(j.completion_percentage_above_expectation ?? 0) * att;
    g.tttW += Number(j.avg_time_to_throw ?? 0) * att;
    g.name = j.player_display_name ?? g.name;
    g.team = r.team_id;
    byPlayer.set(r.player_id, g);
  }

 const [{ data: rushRaw }, { data: playersRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("nfl_player_stats_weekly")
      .select("player_id, carries, rushing_epa")
      .eq("season", season)
      .eq("position", "QB")
      .gt("carries", 0),
    supabase.from("nfl_players").select("gsis_id, headshot_url"),
    supabase.from("nfl_teams").select("team_id, team_color"),
  ]);
  const rushRows = (rushRaw ?? []) as { player_id: string; carries: number | null; rushing_epa: number | null }[];
  const rushByPlayer = new Map<string, { carries: number; epaSum: number }>();
  for (const r of rushRows) {
    const cur = rushByPlayer.get(r.player_id) ?? { carries: 0, epaSum: 0 };
    cur.carries += Number(r.carries ?? 0);
    cur.epaSum += Number(r.rushing_epa ?? 0);
    rushByPlayer.set(r.player_id, cur);
  }
  const headshotById = new Map(
    ((playersRaw ?? []) as { gsis_id: string; headshot_url: string | null }[]).map((p) => [p.gsis_id, p.headshot_url])
  );
  const colorByTeam = new Map(
    ((teamsRaw ?? []) as { team_id: string; team_color: string | null }[]).map((t) => [t.team_id, t.team_color])
  );
 
  const profiles: QbNgsSeasonProfile[] = Array.from(byPlayer.entries())
    .filter(([, g]) => g.attemptsSum >= QB_NGS_MIN_ATTEMPTS)
    .map(([playerId, g]) => {
      const rush = rushByPlayer.get(playerId);
      return {
        playerId, playerName: g.name, teamId: g.team,
        teamColor: colorByTeam.get(g.team) ?? null,
        headshotUrl: headshotById.get(playerId) ?? null,
        season,
        attempts: Math.round(g.attemptsSum),
        avgIntendedAirYards: g.iayW / g.attemptsSum,
        avgCompletedAirYards: g.cayW / g.attemptsSum,
        avgAirYardsDifferential: g.diffW / g.attemptsSum,
        avgAirYardsToSticks: g.sticksW / g.attemptsSum,
        aggressiveness: g.aggW / g.attemptsSum,
        completionPctAboveExpectation: g.cpoeW / g.attemptsSum,
        avgTimeToThrow: g.tttW / g.attemptsSum,
        rushEpaPerCarry: rush && rush.carries > 0 ? rush.epaSum / rush.carries : null,
        carries: rush?.carries ?? 0,
        tags: [],
      };
    });

  const n = profiles.length;
  const byIay = [...profiles].sort((a, b) => a.avgIntendedAirYards - b.avgIntendedAirYards);
  const byCarries = [...profiles].sort((a, b) => a.carries - b.carries);
  const downfieldFloor = byIay[Math.floor(n * 0.75)]?.avgIntendedAirYards ?? Infinity;
  const checkdownCeiling = byIay[Math.floor(n * 0.25)]?.avgIntendedAirYards ?? -Infinity;
  const rusherFloor = byCarries[Math.floor(n * 0.75)]?.carries ?? Infinity;

  for (const p of profiles) {
    if (p.avgIntendedAirYards >= downfieldFloor) p.tags.push('Downfield');
    if (p.avgIntendedAirYards <= checkdownCeiling) p.tags.push('Checkdown');
    if (p.carries >= rusherFloor && p.carries > 20) p.tags.push('Rusher');
  }

  return profiles.sort((a, b) => b.attempts - a.attempts);
}

export interface QbNgsWeeklyPoint {
  week: number;
  intendedAirYards: number | null;
  completedAirYards: number | null;
  attempts: number;
}

export async function getQbNgsWeekly(playerId: string, season: number): Promise<QbNgsWeeklyPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "passing")
    .eq("player_id", playerId)
    .order("week");

  const rows = (data ?? []) as { week: number; raw_source_json: any }[];
  return rows
    .map((r) => {
      const j = r.raw_source_json ?? {};
      return {
        week: r.week,
        intendedAirYards: j.avg_intended_air_yards ?? null,
        completedAirYards: j.avg_completed_air_yards ?? null,
        attempts: Number(j.attempts ?? 0),
      };
    })
    .filter((p) => p.attempts > 0);
}

// ---------------------------------------------------------------------
// QB ROOM — ALL-QB WEEKLY GRID
// Append to src/lib/nfl/queries.ts, near getQbNgsWeekly.
//
// Same source as getQbNgsWeekly, but for every qualified QB at once
// (for the rows=QBs, columns=weeks heatmap) rather than one player.
// Qualification: same QB_NGS_MIN_ATTEMPTS floor as getQbNgsSeasonProfiles,
// applied by cross-referencing that function's output rather than
// re-deriving the threshold logic twice.
// ---------------------------------------------------------------------

export interface QbWeeklyGridRow {
  playerId: string;
  playerName: string;
  teamId: string;
  weeks: { week: number; intendedAirYards: number | null; attempts: number }[];
}

export async function getQbNgsWeeklyGrid(season: number): Promise<QbWeeklyGridRow[]> {
  const [profiles, supabase] = await Promise.all([
    getQbNgsSeasonProfiles(season),
    Promise.resolve(createAdminClient()),
  ]);

  const qualifiedIds = new Set(profiles.map((p) => p.playerId));
  const nameById = new Map(profiles.map((p) => [p.playerId, { name: p.playerName, team: p.teamId }]));

  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("player_id, week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "passing");

  const rows = (data ?? []) as { player_id: string; week: number; raw_source_json: any }[];

  const byPlayer = new Map<string, { week: number; intendedAirYards: number | null; attempts: number }[]>();
  for (const r of rows) {
    if (!qualifiedIds.has(r.player_id)) continue;
    const j = r.raw_source_json ?? {};
    const att = Number(j.attempts ?? 0);
    if (att <= 0) continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({ week: r.week, intendedAirYards: j.avg_intended_air_yards ?? null, attempts: att });
    byPlayer.set(r.player_id, list);
  }

  return Array.from(byPlayer.entries())
    .map(([playerId, weeks]) => ({
      playerId,
      playerName: nameById.get(playerId)?.name ?? playerId,
      teamId: nameById.get(playerId)?.team ?? '',
      weeks: weeks.sort((a, b) => a.week - b.week),
    }))
    .sort((a, b) => b.weeks.reduce((s, w) => s + w.attempts, 0) - a.weeks.reduce((s, w) => s + w.attempts, 0));
}

// ---------------------------------------------------------------------
// QB COVERAGE / PRESSURE / FORMATION SPLITS
// Append to src/lib/nfl/queries.ts.
// ---------------------------------------------------------------------

export interface QbCoverageSplit {
  coverageType: string;
  attempts: number;
  completions: number;
  compPct: number;
  epaPerAtt: number;
}

export async function getQbCoverageSplits(playerId: string, season: number): Promise<QbCoverageSplit[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_qb_coverage_pressure_plays")
    .select("coverage_type, attempts, completions, epa_sum")
    .eq("player_id", playerId)
    .eq("season", season)
    .not("coverage_type", "is", null);

  const rows = (data ?? []) as { coverage_type: string; attempts: number; completions: number; epa_sum: number | null }[];
  const byType = new Map<string, { attempts: number; completions: number; epaSum: number }>();
  for (const r of rows) {
    const g = byType.get(r.coverage_type) ?? { attempts: 0, completions: 0, epaSum: 0 };
    g.attempts += r.attempts;
    g.completions += r.completions;
    g.epaSum += r.epa_sum ?? 0;
    byType.set(r.coverage_type, g);
  }

  return Array.from(byType.entries())
    .map(([coverageType, g]) => ({
      coverageType,
      attempts: g.attempts,
      completions: g.completions,
      compPct: g.attempts > 0 ? (g.completions / g.attempts) * 100 : 0,
      epaPerAtt: g.attempts > 0 ? g.epaSum / g.attempts : 0,
    }))
    .filter((s) => s.attempts >= 5) // small-sample guard, same spirit as everywhere else in this file
    .sort((a, b) => b.attempts - a.attempts);
}

export interface QbPressureSplit {
  pressured: boolean;
  attempts: number;
  completions: number;
  compPct: number;
  epaPerAtt: number;
}

export async function getQbPressureSplits(playerId: string, season: number): Promise<QbPressureSplit[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_qb_coverage_pressure_plays")
    .select("was_pressure, attempts, completions, epa_sum")
    .eq("player_id", playerId)
    .eq("season", season)
    .not("was_pressure", "is", null);

  const rows = (data ?? []) as { was_pressure: boolean; attempts: number; completions: number; epa_sum: number | null }[];
  const byPressure = new Map<boolean, { attempts: number; completions: number; epaSum: number }>();
  for (const r of rows) {
    const g = byPressure.get(r.was_pressure) ?? { attempts: 0, completions: 0, epaSum: 0 };
    g.attempts += r.attempts;
    g.completions += r.completions;
    g.epaSum += r.epa_sum ?? 0;
    byPressure.set(r.was_pressure, g);
  }

  return Array.from(byPressure.entries()).map(([pressured, g]) => ({
    pressured,
    attempts: g.attempts,
    completions: g.completions,
    compPct: g.attempts > 0 ? (g.completions / g.attempts) * 100 : 0,
    epaPerAtt: g.attempts > 0 ? g.epaSum / g.attempts : 0,
  }));
}

export interface QbFormationSplit {
  formation: string;
  plays: number;
  pct: number;
}

export async function getQbFormationRate(playerId: string, season: number): Promise<QbFormationSplit[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_qb_formation_plays")
    .select("offense_formation, plays")
    .eq("player_id", playerId)
    .eq("season", season);

  const rows = (data ?? []) as { offense_formation: string; plays: number }[];
  const byFormation = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byFormation.set(r.offense_formation, (byFormation.get(r.offense_formation) ?? 0) + r.plays);
    total += r.plays;
  }

  return Array.from(byFormation.entries())
    .map(([formation, plays]) => ({ formation, plays, pct: total > 0 ? (plays / total) * 100 : 0 }))
    .sort((a, b) => b.plays - a.plays);
}

// League-wide: who plays shotgun the most, ranked -- one row per QB
// with just their shotgun %, for a leaderboard rather than a per-QB
// breakdown.
export interface QbShotgunLeaderRow {
  playerId: string;
  shotgunPct: number;
  totalPlays: number;
}

export async function getShotgunRateLeaders(season: number, limit = 15): Promise<QbShotgunLeaderRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_qb_formation_plays")
    .select("player_id, offense_formation, plays")
    .eq("season", season);

  const rows = (data ?? []) as { player_id: string; offense_formation: string; plays: number }[];
  const byPlayer = new Map<string, { shotgun: number; total: number }>();
  for (const r of rows) {
    const g = byPlayer.get(r.player_id) ?? { shotgun: 0, total: 0 };
    g.total += r.plays;
    if (r.offense_formation === "SHOTGUN") g.shotgun += r.plays;
    byPlayer.set(r.player_id, g);
  }

  return Array.from(byPlayer.entries())
    .map(([playerId, g]) => ({ playerId, shotgunPct: g.total > 0 ? (g.shotgun / g.total) * 100 : 0, totalPlays: g.total }))
    .filter((r) => r.totalPlays >= 50)
    .sort((a, b) => b.shotgunPct - a.shotgunPct)
    .slice(0, limit);
}

// ---------------------------------------------------------------------
// WR ROOM — NGS RECEIVING PROFILES
// Append to src/lib/nfl/queries.ts. Mirrors getQbNgsSeasonProfiles
// exactly -- same attempts-weighted-by-targets aggregation pattern,
// same percentile-based tagging idea, adapted to receiving fields
// confirmed real: targets, receptions, catch_percentage, avg_cushion,
// avg_separation, avg_intended_air_yards, avg_yac, avg_expected_yac,
// avg_yac_above_expectation, percent_share_of_intended_air_yards.
// ---------------------------------------------------------------------

export type WrTag = 'Deep Threat' | 'Possession' | 'YAC Merchant';

export interface WrNgsSeasonProfile {
  playerId: string;
  playerName: string;
  teamId: string;
  teamColor: string | null;
  headshotUrl: string | null;
  season: number;
  targets: number;
  receptions: number;
  catchPct: number;
  avgCushion: number;
  avgSeparation: number;
  avgIntendedAirYards: number;
  avgYac: number;
  avgExpectedYac: number;
  avgYacAboveExpectation: number;
  targetShareOfAirYards: number; // percent_share_of_intended_air_yards
  tags: WrTag[];
}

const WR_NGS_MIN_TARGETS = 30;

export async function getWrNgsSeasonProfiles(season: number): Promise<WrNgsSeasonProfile[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("player_id, team_id, season, week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "receiving");

  const rows = (data ?? []) as { player_id: string; team_id: string; season: number; week: number; raw_source_json: any }[];

  type Agg = {
    name: string; team: string; targetsSum: number; receptionsSum: number;
    cushionW: number; sepW: number; iayW: number; yacW: number; eyacW: number; yacAeW: number; shareW: number;
  };
  const byPlayer = new Map<string, Agg>();

  for (const r of rows) {
    const j = r.raw_source_json ?? {};
    const tgt = Number(j.targets ?? 0);
    if (tgt <= 0) continue;
    const g = byPlayer.get(r.player_id) ?? {
      name: j.player_display_name ?? r.player_id, team: r.team_id,
      targetsSum: 0, receptionsSum: 0, cushionW: 0, sepW: 0, iayW: 0, yacW: 0, eyacW: 0, yacAeW: 0, shareW: 0,
    };
    g.targetsSum += tgt;
    g.receptionsSum += Number(j.receptions ?? 0);
    g.cushionW += Number(j.avg_cushion ?? 0) * tgt;
    g.sepW += Number(j.avg_separation ?? 0) * tgt;
    g.iayW += Number(j.avg_intended_air_yards ?? 0) * tgt;
    g.yacW += Number(j.avg_yac ?? 0) * tgt;
    g.eyacW += Number(j.avg_expected_yac ?? 0) * tgt;
    g.yacAeW += Number(j.avg_yac_above_expectation ?? 0) * tgt;
    g.shareW += Number(j.percent_share_of_intended_air_yards ?? 0) * tgt;
    g.name = j.player_display_name ?? g.name;
    g.team = r.team_id;
    byPlayer.set(r.player_id, g);
  }

  const { data: playersRaw } = await supabase.from("nfl_players").select("gsis_id, headshot_url");
  const { data: teamsRaw } = await supabase.from("nfl_teams").select("team_id, team_color");
  const headshotById = new Map(((playersRaw ?? []) as { gsis_id: string; headshot_url: string | null }[]).map((p) => [p.gsis_id, p.headshot_url]));
  const colorByTeam = new Map(((teamsRaw ?? []) as { team_id: string; team_color: string | null }[]).map((t) => [t.team_id, t.team_color]));

  const profiles: WrNgsSeasonProfile[] = Array.from(byPlayer.entries())
    .filter(([, g]) => g.targetsSum >= WR_NGS_MIN_TARGETS)
    .map(([playerId, g]) => ({
      playerId, playerName: g.name, teamId: g.team,
      teamColor: colorByTeam.get(g.team) ?? null,
      headshotUrl: headshotById.get(playerId) ?? null,
      season,
      targets: Math.round(g.targetsSum),
      receptions: Math.round(g.receptionsSum),
      catchPct: g.targetsSum > 0 ? (g.receptionsSum / g.targetsSum) * 100 : 0,
      avgCushion: g.cushionW / g.targetsSum,
      avgSeparation: g.sepW / g.targetsSum,
      avgIntendedAirYards: g.iayW / g.targetsSum,
      avgYac: g.yacW / g.targetsSum,
      avgExpectedYac: g.eyacW / g.targetsSum,
      avgYacAboveExpectation: g.yacAeW / g.targetsSum,
      targetShareOfAirYards: g.shareW / g.targetsSum,
      tags: [],
    }));

  const n = profiles.length;
  const byIay = [...profiles].sort((a, b) => a.avgIntendedAirYards - b.avgIntendedAirYards);
  const byYacAe = [...profiles].sort((a, b) => a.avgYacAboveExpectation - b.avgYacAboveExpectation);
  const deepThreatFloor = byIay[Math.floor(n * 0.75)]?.avgIntendedAirYards ?? Infinity;
  const possessionCeiling = byIay[Math.floor(n * 0.25)]?.avgIntendedAirYards ?? -Infinity;
  const yacMerchantFloor = byYacAe[Math.floor(n * 0.75)]?.avgYacAboveExpectation ?? Infinity;

  for (const p of profiles) {
    if (p.avgIntendedAirYards >= deepThreatFloor) p.tags.push('Deep Threat');
    if (p.avgIntendedAirYards <= possessionCeiling) p.tags.push('Possession');
    if (p.avgYacAboveExpectation >= yacMerchantFloor) p.tags.push('YAC Merchant');
  }

  return profiles.sort((a, b) => b.targets - a.targets);
}

export interface WrNgsWeeklyPoint {
  week: number;
  targets: number;
  receptions: number;
  avgSeparation: number | null;
  avgYacAboveExpectation: number | null;
}

export async function getWrNgsWeekly(playerId: string, season: number): Promise<WrNgsWeeklyPoint[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "receiving")
    .eq("player_id", playerId)
    .order("week");

  const rows = (data ?? []) as { week: number; raw_source_json: any }[];
  return rows
    .map((r) => {
      const j = r.raw_source_json ?? {};
      return {
        week: r.week,
        targets: Number(j.targets ?? 0),
        receptions: Number(j.receptions ?? 0),
        avgSeparation: j.avg_separation ?? null,
        avgYacAboveExpectation: j.avg_yac_above_expectation ?? null,
      };
    })
    .filter((p) => p.targets > 0);
}

export interface WrWeeklyGridRow {
  playerId: string;
  playerName: string;
  teamId: string;
  weeks: { week: number; avgSeparation: number | null; targets: number }[];
}

export async function getWrNgsWeeklyGrid(season: number): Promise<WrWeeklyGridRow[]> {
  const [profiles, supabase] = await Promise.all([
    getWrNgsSeasonProfiles(season),
    Promise.resolve(createAdminClient()),
  ]);

  const qualifiedIds = new Set(profiles.map((p) => p.playerId));
  const nameById = new Map(profiles.map((p) => [p.playerId, { name: p.playerName, team: p.teamId }]));

  const { data } = await supabase
    .from("nfl_next_gen_stats")
    .select("player_id, week, raw_source_json")
    .eq("season", season)
    .eq("stat_type", "receiving");

  const rows = (data ?? []) as { player_id: string; week: number; raw_source_json: any }[];
  const byPlayer = new Map<string, { week: number; avgSeparation: number | null; targets: number }[]>();
  for (const r of rows) {
    if (!qualifiedIds.has(r.player_id)) continue;
    const j = r.raw_source_json ?? {};
    const tgt = Number(j.targets ?? 0);
    if (tgt <= 0) continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push({ week: r.week, avgSeparation: j.avg_separation ?? null, targets: tgt });
    byPlayer.set(r.player_id, list);
  }

  return Array.from(byPlayer.entries())
    .map(([playerId, weeks]) => ({
      playerId,
      playerName: nameById.get(playerId)?.name ?? playerId,
      teamId: nameById.get(playerId)?.team ?? '',
      weeks: weeks.sort((a, b) => a.week - b.week),
    }))
    .sort((a, b) => b.weeks.reduce((s, w) => s + w.targets, 0) - a.weeks.reduce((s, w) => s + w.targets, 0));
}// ---------------------------------------------------------------------
// WR COVERAGE / PRESSURE SPLITS
// Append to src/lib/nfl/queries.ts. Reads nfl_wr_coverage_pressure_plays
// (run scripts/nfl/sync_wr_coverage_pressure.py first). Field names
// intentionally match QbCoverageSplit/QbPressureSplit's shape so the
// existing NflQbCoverageChart/NflQbPressureChart components can render
// WR data too -- attempts=targets, completions=receptions -- no need
// for duplicate chart components.
// ---------------------------------------------------------------------

export async function getWrCoverageSplits(playerId: string, season: number): Promise<QbCoverageSplit[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_wr_coverage_pressure_plays")
    .select("coverage_type, targets, receptions, epa_sum")
    .eq("player_id", playerId)
    .eq("season", season)
    .not("coverage_type", "is", null);

  const rows = (data ?? []) as { coverage_type: string; targets: number; receptions: number; epa_sum: number | null }[];
  const byType = new Map<string, { targets: number; receptions: number; epaSum: number }>();
  for (const r of rows) {
    const g = byType.get(r.coverage_type) ?? { targets: 0, receptions: 0, epaSum: 0 };
    g.targets += r.targets;
    g.receptions += r.receptions;
    g.epaSum += r.epa_sum ?? 0;
    byType.set(r.coverage_type, g);
  }

  return Array.from(byType.entries())
    .map(([coverageType, g]) => ({
      coverageType,
      attempts: g.targets,
      completions: g.receptions,
      compPct: g.targets > 0 ? (g.receptions / g.targets) * 100 : 0,
      epaPerAtt: g.targets > 0 ? g.epaSum / g.targets : 0,
    }))
    .filter((s) => s.attempts >= 5)
    .sort((a, b) => b.attempts - a.attempts);
}

export async function getWrPressureSplits(playerId: string, season: number): Promise<QbPressureSplit[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("nfl_wr_coverage_pressure_plays")
    .select("was_pressure, targets, receptions, epa_sum")
    .eq("player_id", playerId)
    .eq("season", season)
    .not("was_pressure", "is", null);

  const rows = (data ?? []) as { was_pressure: boolean; targets: number; receptions: number; epa_sum: number | null }[];
  const byPressure = new Map<boolean, { targets: number; receptions: number; epaSum: number }>();
  for (const r of rows) {
    const g = byPressure.get(r.was_pressure) ?? { targets: 0, receptions: 0, epaSum: 0 };
    g.targets += r.targets;
    g.receptions += r.receptions;
    g.epaSum += r.epa_sum ?? 0;
    byPressure.set(r.was_pressure, g);
  }

  return Array.from(byPressure.entries()).map(([pressured, g]) => ({
    pressured,
    attempts: g.targets,
    completions: g.receptions,
    compPct: g.targets > 0 ? (g.receptions / g.targets) * 100 : 0,
    epaPerAtt: g.targets > 0 ? g.epaSum / g.targets : 0,
  }));
}

// ---------------------------------------------------------------------
// OFFENSIVE / DEFENSIVE COORDINATOR PAGES — DATA LAYER
// Append to src/lib/nfl/queries.ts. No new ingestion needed -- all
// from nfl_team_scheme_profile, nfl_team_coverage_efficacy, and
// nfl_player_stats_weekly (already-used columns).
// ---------------------------------------------------------------------

export interface OffCoordinatorTeamRow {
  teamId: string;
  logoUrl: string;
  teamColor: string | null;
  topFormation: string;
  topFormationPct: number;
  passPct: number;
  runPct: number;
}

export async function getOffCoordinatorLeaderboard(season: number): Promise<OffCoordinatorTeamRow[]> {
  const supabase = createAdminClient();
  const [{ data: schemeRaw }, { data: teamsRaw }, { data: statsRaw }] = await Promise.all([
    supabase
      .from("nfl_team_scheme_profile")
      .select("team_id, off_formation_shotgun_pct, off_formation_undercenter_pct, off_formation_pistol_pct")
      .eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url, team_color"),
    supabase.from("nfl_player_stats_weekly").select("team_id, attempts, carries").eq("season", season),
  ]);
 
  const logoById = new Map(((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null; team_color: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""]));
  const colorById = new Map(((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null; team_color: string | null }[]).map((t) => [t.team_id, t.team_color]));
  const playCountByTeam = new Map<string, { pass: number; run: number }>();
  for (const r of (statsRaw ?? []) as { team_id: string; attempts: number | null; carries: number | null }[]) {
    if (!r.team_id) continue;
    const g = playCountByTeam.get(r.team_id) ?? { pass: 0, run: 0 };
    g.pass += Number(r.attempts ?? 0);
    g.run += Number(r.carries ?? 0);
    playCountByTeam.set(r.team_id, g);
  }

  const rows = (schemeRaw ?? []) as {
    team_id: string;
    off_formation_shotgun_pct: number | null;
    off_formation_undercenter_pct: number | null;
    off_formation_pistol_pct: number | null;
  }[];

  return rows
    .map((r) => {
      const formations: [string, number][] = [
        ["SHOTGUN", r.off_formation_shotgun_pct ?? 0],
        ["UNDER CENTER", r.off_formation_undercenter_pct ?? 0],
        ["PISTOL", r.off_formation_pistol_pct ?? 0],
      ];
      formations.sort((a, b) => b[1] - a[1]);
      const plays = playCountByTeam.get(r.team_id) ?? { pass: 0, run: 0 };
      const total = plays.pass + plays.run;
   return {
        teamId: r.team_id,
        logoUrl: logoById.get(r.team_id) ?? "",
        teamColor: colorById.get(r.team_id) ?? null,
        topFormation: formations[0][0],
        topFormationPct: formations[0][1],
        passPct: total > 0 ? (plays.pass / total) * 100 : 0,
        runPct: total > 0 ? (plays.run / total) * 100 : 0,
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
}

export interface DefCoordinatorTeamRow {
  teamId: string;
  logoUrl: string;
  teamColor: string | null;
  topCoverage: string;
  topCoveragePct: number;
  mostSusceptibleCoverage: string;
  mostSusceptibleEpa: number;
}

export async function getDefCoordinatorLeaderboard(season: number): Promise<DefCoordinatorTeamRow[]> {
  const supabase = createAdminClient();
  const [{ data: schemeRaw }, { data: teamsRaw }, { data: efficacyRaw }] = await Promise.all([
    supabase
      .from("nfl_team_scheme_profile")
      .select("team_id, def_cover0_pct, def_cover1_pct, def_cover2_pct, def_cover3_pct, def_cover4_pct, def_cover6_pct, def_cover9_pct, def_2man_pct, def_combo_pct")
      .eq("season", season),
    supabase.from("nfl_teams").select("team_id, team_logo_url, team_color"),
    supabase.from("nfl_team_coverage_efficacy").select("team_id, coverage_type, plays, epa_allowed_per_play").eq("season", season),
  ]);
 
  const logoById = new Map(((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null; team_color: string | null }[]).map((t) => [t.team_id, t.team_logo_url ?? ""]));
  const colorById = new Map(((teamsRaw ?? []) as { team_id: string; team_logo_url: string | null; team_color: string | null }[]).map((t) => [t.team_id, t.team_color]));
  const efficacyByTeam = new Map<string, { coverageType: string; plays: number; epa: number }[]>();
  for (const r of (efficacyRaw ?? []) as { team_id: string; coverage_type: string; plays: number; epa_allowed_per_play: number | null }[]) {
    const list = efficacyByTeam.get(r.team_id) ?? [];
    list.push({ coverageType: r.coverage_type, plays: r.plays, epa: r.epa_allowed_per_play ?? 0 });
    efficacyByTeam.set(r.team_id, list);
  }

  const COVERAGE_LABELS: Record<string, string> = {
    def_cover0_pct: "COVER 0", def_cover1_pct: "COVER 1", def_cover2_pct: "COVER 2", def_cover3_pct: "COVER 3",
    def_cover4_pct: "COVER 4", def_cover6_pct: "COVER 6", def_cover9_pct: "COVER 9", def_2man_pct: "2-MAN", def_combo_pct: "COMBO",
  };

  const rows = (schemeRaw ?? []) as Record<string, string | number | null>[];

  return rows
    .map((r) => {
      const teamId = r.team_id as string;
      const entries = Object.entries(COVERAGE_LABELS).map(([col, label]) => [label, Number(r[col] ?? 0)] as [string, number]);
      entries.sort((a, b) => b[1] - a[1]);

      const efficacyList = (efficacyByTeam.get(teamId) ?? []).filter((e) => e.plays >= 15); // small-sample guard
      efficacyList.sort((a, b) => b.epa - a.epa); // highest EPA allowed = most susceptible
      const worst = efficacyList[0];

        return {
        teamId,
        logoUrl: logoById.get(teamId) ?? "",
        teamColor: colorById.get(teamId) ?? null,
        topCoverage: entries[0][0],
        topCoveragePct: entries[0][1],
        mostSusceptibleCoverage: worst ? worst.coverageType.replace(/_/g, ' ') : 'N/A',
        mostSusceptibleEpa: worst ? worst.epa : 0,
      };
    })
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
}

export interface TeamFormationBreakdown {
  formations: { label: string; pct: number }[];
  personnel: { label: string; pct: number }[];
  passPct: number;
  runPct: number;
}

export async function getTeamFormationBreakdown(teamId: string, season: number): Promise<TeamFormationBreakdown | null> {
  const supabase = createAdminClient();
  const [{ data: schemeRaw }, { data: statsRaw }] = await Promise.all([
    supabase.from("nfl_team_scheme_profile").select("*").eq("team_id", teamId).eq("season", season).single(),
    supabase.from("nfl_player_stats_weekly").select("attempts, carries").eq("team_id", teamId).eq("season", season),
  ]);

  if (!schemeRaw) return null;
  const s = schemeRaw as Record<string, number | null>;

  let pass = 0, run = 0;
  for (const r of (statsRaw ?? []) as { attempts: number | null; carries: number | null }[]) {
    pass += Number(r.attempts ?? 0);
    run += Number(r.carries ?? 0);
  }
  const total = pass + run;

  return {
    formations: [
      { label: "SHOTGUN", pct: s.off_formation_shotgun_pct ?? 0 },
      { label: "UNDER CENTER", pct: s.off_formation_undercenter_pct ?? 0 },
      { label: "PISTOL", pct: s.off_formation_pistol_pct ?? 0 },
    ].sort((a, b) => b.pct - a.pct),
    personnel: [
      { label: "11", pct: s.off_personnel_11_pct ?? 0 },
      { label: "12", pct: s.off_personnel_12_pct ?? 0 },
      { label: "21", pct: s.off_personnel_21_pct ?? 0 },
      { label: "OTHER", pct: s.off_personnel_other_pct ?? 0 },
    ].sort((a, b) => b.pct - a.pct),
    passPct: total > 0 ? (pass / total) * 100 : 0,
    runPct: total > 0 ? (run / total) * 100 : 0,
  };
}

export interface TeamCoverageBreakdown {
  coverages: { label: string; pct: number; epaAllowedPerPlay: number | null; plays: number }[];
  manPct: number;
  zonePct: number;
  blitzRate: number;
}

export async function getTeamCoverageBreakdown(teamId: string, season: number): Promise<TeamCoverageBreakdown | null> {
  const supabase = createAdminClient();
  const [{ data: schemeRaw }, { data: efficacyRaw }] = await Promise.all([
    supabase.from("nfl_team_scheme_profile").select("*").eq("team_id", teamId).eq("season", season).single(),
    supabase.from("nfl_team_coverage_efficacy").select("coverage_type, plays, epa_allowed_per_play").eq("team_id", teamId).eq("season", season),
  ]);

  if (!schemeRaw) return null;
  const s = schemeRaw as Record<string, number | null>;
  const efficacyByType = new Map(
    ((efficacyRaw ?? []) as { coverage_type: string; plays: number; epa_allowed_per_play: number | null }[]).map((e) => [e.coverage_type, e])
  );

  const COVERAGE_LABELS: Record<string, string> = {
    def_cover0_pct: "COVER 0", def_cover1_pct: "COVER 1", def_cover2_pct: "COVER 2", def_cover3_pct: "COVER 3",
    def_cover4_pct: "COVER 4", def_cover6_pct: "COVER 6", def_cover9_pct: "COVER 9", def_2man_pct: "2-MAN", def_combo_pct: "COMBO",
  };

  const coverages = Object.entries(COVERAGE_LABELS)
    .map(([col, label]) => {
      const efficacyKey = label.replace(' ', '_'); // matches how sync_team_scheme_profile.py names coverage_type, e.g. "COVER_3"
      const eff = efficacyByType.get(efficacyKey);
      return {
        label,
        pct: s[col] ?? 0,
        epaAllowedPerPlay: eff?.epa_allowed_per_play ?? null,
        plays: eff?.plays ?? 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return {
    coverages,
    manPct: s.def_man_pct ?? 0,
    zonePct: s.def_zone_pct ?? 0,
    blitzRate: s.def_blitz_rate ?? 0,
  };
}

