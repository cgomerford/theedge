"""
scripts/nfl/compute_fantasy_projections.py

Computes fantasy point projections for the upcoming week's games into
nfl_fantasy_projections. Pure aggregation of data already in Supabase
-- no external pull.

METHODOLOGY (deliberately simple and fully transparent -- see
migration 009's comments for the same explanation, kept in sync):

  1. base_rate_ppr: the player's own PPR points, weighted average of
     their last 4 games with data (most recent games weighted more --
     weights [1,2,3,4] oldest to newest of the four).
     A player with fewer than MIN_RELIABLE_GAMES (3) games this
     season gets is_reliable_sample = false, and the UI should treat
     that projection with real caution, not present it with equal
     confidence to an established player's.

  2. matchup_factor: how many PPR points the opponent allows to this
     player's position, relative to the league average allowed to
     that position. Computed from actual weekly results (fantasy_points_ppr
     summed by opponent_team + position, divided by games), not a
     model. Clamped to [0.7, 1.3] so a defense that's faced one
     unusually good or bad performance doesn't produce an absurd
     multiplier off a tiny sample.

  3. projected_points_ppr = base_rate_ppr * matchup_factor

This is NOT machine-learned and doesn't account for injuries, weather,
game script, pace, or vegas implied totals. It's a first, explainable
version -- two factors, both inspectable on the row itself. Treat any
future improvement as a methodology change that should update this
docstring and migration 009's comments together, not drift silently
out of sync with them.

NOTE: requires Python 3.10+ to match the rest of the NFL pipeline.
"""

from __future__ import annotations

import os
import sys
import time
from collections import defaultdict

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
    sys.exit(1)

MIN_RELIABLE_GAMES = 3
RECENCY_WEIGHTS = [1, 2, 3, 4]  # oldest to newest of the last 4 games
MATCHUP_FACTOR_MIN = 0.7
MATCHUP_FACTOR_MAX = 1.3
SCHEDULE_SEASON = 2026  # which season's games/opponents we're projecting FOR


def resolve_stats_season(supabase: Client) -> int:
    """
    Which season's player history to build projections FROM. Mirrors
    the same fallback logic as getActiveStatsSeason() in queries.ts --
    use SCHEDULE_SEASON's own stats if any exist yet, otherwise fall
    back to the prior season. Pre-season, this means week 1
    projections are built from each player's last 4 games of LAST
    season, and matchup factors from last season's full-year
    points-allowed-by-position -- not nothing, and not fabricated,
    just the most recent real data available.

    NOTE: a rookie or new-to-the-league player with zero prior-season
    games will correctly get no projection at all until they have at
    least one game of real data. That's an honest gap, not a bug --
    don't backfill it with a league-average guess.
    """
    resp = (
        supabase.table("nfl_player_stats_weekly")
        .select("player_id", count="exact", head=True)
        .eq("season", SCHEDULE_SEASON)
        .execute()
    )
    if resp.count and resp.count > 0:
        return SCHEDULE_SEASON
    return SCHEDULE_SEASON - 1


def fetch_all(supabase: Client, table: str, columns: str, eq_filters: dict | None = None) -> list[dict]:
    """
    Paginates through .select() results 1000 rows at a time.

    Supabase/PostgREST caps a single .select() response at 1000 rows
    by default -- confirmed this was silently truncating nfl_players
    (3,826 rows) and nfl_player_stats_weekly (6,396 rows for 2025)
    down to their first 1000, which is why the first version of this
    script computed 0 projections despite real underlying data. Every
    earlier script's reads happened to stay under 1000 rows, so this
    hadn't surfaced until a query this size. Worth keeping in mind for
    any future query expected to return more than ~1000 rows.
    """
    all_rows: list[dict] = []
    page_size = 1000
    start = 0
    while True:
        q = supabase.table(table).select(columns)
        if eq_filters:
            for k, v in eq_filters.items():
                q = q.eq(k, v)
        q = q.range(start, start + page_size - 1)
        batch = q.execute().data
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return all_rows


def weighted_form_rate(games: list[dict]) -> float | None:
    """Recency-weighted average PPR points over up to the last 4 games."""
    if not games:
        return None
    recent = games[-4:]
    weights = RECENCY_WEIGHTS[-len(recent):]
    total_weight = sum(weights)
    return sum(g["fantasy_points_ppr"] * w for g, w in zip(recent, weights)) / total_weight


def main() -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    stats_season = resolve_stats_season(supabase)
    print(f"Schedule season: {SCHEDULE_SEASON}. Building player history/matchup data from: {stats_season}.\n")

    games_resp = supabase.table("nfl_games").select("*").eq("season", SCHEDULE_SEASON).order("gameday").execute()
    games = games_resp.data
    if not games:
        print(f"No games found for season {SCHEDULE_SEASON}. Nothing to project.")
        return

    upcoming = [g for g in games if g["game_status"] != "final"]
    if not upcoming:
        print("No upcoming games -- season appears complete or not yet loaded. Nothing to project.")
        return
    target_week = upcoming[0]["week"]
    week_games = [g for g in upcoming if g["week"] == target_week]
    print(f"Projecting for season {SCHEDULE_SEASON}, week {target_week} ({len(week_games)} games)...")

    team_matchup: dict[str, tuple[str, str]] = {}
    for g in week_games:
        team_matchup[g["home_team"]] = (g["game_id"], g["away_team"])
        team_matchup[g["away_team"]] = (g["game_id"], g["home_team"])

    stats = fetch_all(
        supabase,
        "nfl_player_stats_weekly",
        "player_id, team_id, opponent_team, week, position, fantasy_points_ppr",
        {"season": stats_season},
    )
    if not stats:
        print(f"No player stats found for season {stats_season} either. Nothing to project.")
        return

    players_data = fetch_all(supabase, "nfl_players", "gsis_id, position, team_id")
    position_by_player = {p["gsis_id"]: p["position"] for p in players_data}
    team_by_player = {p["gsis_id"]: p["team_id"] for p in players_data}

    allowed_totals: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in stats:
        pos = position_by_player.get(row["player_id"])
        if not pos or row["opponent_team"] is None or row["fantasy_points_ppr"] is None:
            continue
        allowed_totals[(row["opponent_team"], pos)].append(float(row["fantasy_points_ppr"]))

    league_avg_by_position: dict[str, float] = {}
    for pos in set(p for _, p in allowed_totals.keys()):
        all_vals = [v for (_, p), vals in allowed_totals.items() if p == pos for v in vals]
        league_avg_by_position[pos] = sum(all_vals) / len(all_vals) if all_vals else 0.0

    history_by_player: dict[str, list[dict]] = defaultdict(list)
    for row in stats:
        if row["fantasy_points_ppr"] is not None:
            history_by_player[row["player_id"]].append(row)
    for player_id in history_by_player:
        history_by_player[player_id].sort(key=lambda r: r["week"])

    projections = []
    for player_id, games_history in history_by_player.items():
        team_id = team_by_player.get(player_id)
        position = position_by_player.get(player_id)
        if not team_id or not position or team_id not in team_matchup:
            continue

        game_id, opponent = team_matchup[team_id]

        base_rate = weighted_form_rate(games_history)
        if base_rate is None:
            continue

        league_avg = league_avg_by_position.get(position)
        opp_allowed_vals = allowed_totals.get((opponent, position), [])
        if league_avg and opp_allowed_vals:
            opp_allowed_avg = sum(opp_allowed_vals) / len(opp_allowed_vals)
            raw_factor = opp_allowed_avg / league_avg if league_avg > 0 else 1.0
            matchup_factor = max(MATCHUP_FACTOR_MIN, min(MATCHUP_FACTOR_MAX, raw_factor))
        else:
            matchup_factor = 1.0

        games_used = min(len(games_history), 4)

        projections.append(
            {
                "player_id": player_id,
                "game_id": game_id,
                "season": SCHEDULE_SEASON,
                "week": target_week,
                "position": position,
                "opponent_team": opponent,
                "base_rate_ppr": round(base_rate, 2),
                "matchup_factor": round(matchup_factor, 3),
                "projected_points_ppr": round(base_rate * matchup_factor, 2),
                "games_used": games_used,
                "is_reliable_sample": games_used >= MIN_RELIABLE_GAMES,
            }
        )

    print(f"Computed {len(projections)} player projections.\n")
    print("=== SANITY CHECK: first 5 rows ===")
    for p in sorted(projections, key=lambda x: -x["projected_points_ppr"])[:5]:
        print(p)
    print()

    if len(projections) == 0:
        print("Nothing to upsert.")
        return

    print(f"About to upsert {len(projections)} rows into nfl_fantasy_projections. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    batch_size = 100
    total_upserted = 0
    for i in range(0, len(projections), batch_size):
        batch = projections[i : i + batch_size]
        result = supabase.table("nfl_fantasy_projections").upsert(batch, on_conflict="player_id,game_id").execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total projections.")


if __name__ == "__main__":
    main()