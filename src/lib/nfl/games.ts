// src/lib/nfl/games.ts
// Read-only query layer for nfl_games. Written by scripts/nfl_scoreboard_ingest.py --
// do not write to this table from application code.
//
// Supabase `int`/`numeric` columns can come back as strings depending on the
// client -- home_score/away_score/week are wrapped in Number() below per
// project convention, even though this table types them as int.

import { createAdminClient } from '@/lib/supabase'

export interface NFLGameLeader {
  category: string | null;
  display_value: string | null;
  athlete_name: string | null;
  athlete_id: string | null;
  team_id: string | null;
}

export interface NFLGame {
  gameId: string;
  seasonYear: number;
  seasonType: number;
  week: number;
  startDate: string;
  homeTeamId: string;
  homeTeamAbbrev: string;
  awayTeamId: string;
  awayTeamAbbrev: string;
  homeScore: number;
  awayScore: number;
  isComplete: boolean;
  statusDetail: string | null;
  leaders: NFLGameLeader[];
}

function mapRow(row: any): NFLGame {
  return {
    gameId: row.game_id,
    seasonYear: Number(row.season_year),
    seasonType: Number(row.season_type),
    week: Number(row.week),
    startDate: row.start_date,
    homeTeamId: row.home_team_id,
    homeTeamAbbrev: row.home_team_abbrev,
    awayTeamId: row.away_team_id,
    awayTeamAbbrev: row.away_team_abbrev,
    homeScore: Number(row.home_score),
    awayScore: Number(row.away_score),
    isComplete: row.is_complete,
    statusDetail: row.status_detail,
    leaders: row.leaders ?? [],
  };
}

/**
 * Most recent completed games league-wide, for the homepage's "recent NFL"
 * widget. Defaults to preseason (seasonType 1) since that's all that exists
 * right now -- swap to 2 once the regular season starts. Consider making
 * this a required param instead of a default once both season types have data,
 * so a stale default doesn't silently show the wrong slate.
 */
export async function getRecentNFLGames(
  limit = 6,
  seasonType = 1
): Promise<NFLGame[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("nfl_games")
    .select("*")
    .eq("season_type", seasonType)
    .eq("is_complete", true)
    .order("start_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentNFLGames error:", error);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * Games for a single team (home or away), most recent first. Used on the
 * team homepage for a "recent results" module.
 */
export async function getTeamNFLGames(
  espnTeamId: string,
  limit = 5
): Promise<NFLGame[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("nfl_games")
    .select("*")
    .or(`home_team_id.eq.${espnTeamId},away_team_id.eq.${espnTeamId}`)
    .eq("is_complete", true)
    .order("start_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getTeamNFLGames error:", error);
    return [];
  }
  return (data ?? []).map(mapRow);
}