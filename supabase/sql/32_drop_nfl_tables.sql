-- Deletes every NFL table (29 tables, about 200 MB). NOT run yet: George runs this himself in the Supabase SQL Editor.
-- This cannot be undone. All of these tables are listed in one statement, so the links between them are dropped together.
-- If Supabase answers "cannot drop ... because other objects depend on it", paste the message to Claude instead of adding CASCADE.
drop table if exists
  public.nfl_depth_charts, public.nfl_edge_factors, public.nfl_edge_score_history, public.nfl_editorial_posts, public.nfl_fantasy_projections,
  public.nfl_game_postgame, public.nfl_games, public.nfl_injuries, public.nfl_next_gen_stats, public.nfl_pfr_advstats,
  public.nfl_player_defense_stats_weekly, public.nfl_player_form_signals, public.nfl_player_route_profile, public.nfl_player_stats_weekly, public.nfl_players,
  public.nfl_qb_coverage_pressure_plays, public.nfl_qb_zone_profile, public.nfl_snap_counts, public.nfl_special_teams_stats_weekly, public.nfl_team_coverage_efficacy,
  public.nfl_team_form, public.nfl_team_penalties_weekly, public.nfl_team_route_profile, public.nfl_team_scheme_profile, public.nfl_team_season_reports,
  public.nfl_team_stats_weekly, public.nfl_team_week_splits, public.nfl_teams, public.nfl_wr_coverage_pressure_plays;
