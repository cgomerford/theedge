"""
scripts/nfl/compute_team_reports.py

Aggregates nfl_team_stats_weekly + nfl_games into nfl_team_season_reports
-- the precomputed table game pages and team hubs actually read. No
external data pulled here; this is pure aggregation of what's already
in Supabase, same role as compute_player_form.py plays for players.

Run AFTER sync_team_stats.py and sync_schedule.py have populated their
tables. Safe to re-run any time (recomputes from scratch each run).

METHODOLOGY:
  - Season-to-date EPA/success-rate/PROE are PLAY-WEIGHTED averages
    across weeks, not a flat mean of weekly averages -- a 70-play week
    should count more than a 40-play week. Plays_offense/plays_defense
    from nfl_team_stats_weekly are the weights.
  - Last-4 figures use the same weighting, restricted to each team's
    4 most recent weeks with data.
  - Rankings: off_epa_rank sorts descending (higher EPA/play = better
    offense = rank 1). def_epa_rank sorts ASCENDING (lower/negative
    EPA/play allowed = better defense = rank 1) -- don't flip this by
    accident, it's the opposite sort direction from offense.
  - W-L record and points for/against come from nfl_games directly
    (game_status = 'final'), not from team_stats_weekly.
  - is_reliable_sample = games_played >= MIN_RELIABLE_GAMES (3),
    mirroring the MIN_RELIABLE_AB pattern from the MLB side.

NOTE: requires Python 3.10+ to match the rest of the NFL pipeline,
though this script itself doesn't touch nflreadpy/Polars -- plain
Python + the Supabase client would run fine on 3.9 too, but kept
consistent with the other NFL scripts' venv for simplicity.
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
SEASONS_TO_COMPUTE = list(range(2021, 2027))  # matches the backfill range in every
                                                # sync script -- was stuck at [2025, 2026]
                                                # from before the 6-season backfill decision,
                                                # never updated. Team pages' year-on-year view
                                                # needs this to match the raw data's actual range.


def weighted_avg(values_weights: list[tuple[float, int]]) -> float | None:
    """Plays-weighted average, skipping None values."""
    pairs = [(v, w) for v, w in values_weights if v is not None and w]
    total_weight = sum(w for _, w in pairs)
    if total_weight == 0:
        return None
    return sum(v * w for v, w in pairs) / total_weight


def compute_reports(supabase: Client, season: int) -> list[dict]:
    stats_resp = supabase.table("nfl_team_stats_weekly").select("*").eq("season", season).execute()
    games_resp = supabase.table("nfl_games").select("*").eq("season", season).eq("game_status", "final").execute()

    stats_by_team: dict[str, list[dict]] = defaultdict(list)
    for row in stats_resp.data:
        stats_by_team[row["team_id"]].append(row)

    # W-L/points from nfl_games -- a team can be home or away per game.
    record_by_team: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "ties": 0, "points_for": 0, "points_against": 0, "games": 0})
    for g in games_resp.data:
        home, away = g["home_team"], g["away_team"]
        hs, as_ = g["home_score"], g["away_score"]
        if hs is None or as_ is None:
            continue
        for team, pf, pa in [(home, hs, as_), (away, as_, hs)]:
            r = record_by_team[team]
            r["points_for"] += pf
            r["points_against"] += pa
            r["games"] += 1
            if pf > pa:
                r["wins"] += 1
            elif pf < pa:
                r["losses"] += 1
            else:
                r["ties"] += 1

    reports = []
    for team_id, weeks in stats_by_team.items():
        weeks_sorted = sorted(weeks, key=lambda w: w["week"])
        last4 = weeks_sorted[-4:]

        off_epa_szn = weighted_avg([(w["off_epa_per_play"], w["plays_offense"]) for w in weeks_sorted])
        def_epa_szn = weighted_avg([(w["def_epa_per_play"], w["plays_defense"]) for w in weeks_sorted])
        off_success_szn = weighted_avg([(w["off_success_rate"], w["plays_offense"]) for w in weeks_sorted])
        def_success_szn = weighted_avg([(w["def_success_rate"], w["plays_defense"]) for w in weeks_sorted])
        proe_szn = weighted_avg([(w["proe"], w["plays_offense"]) for w in weeks_sorted])
        turnover_margin_szn = sum(w["turnover_margin"] for w in weeks_sorted if w["turnover_margin"] is not None)

        off_epa_l4 = weighted_avg([(w["off_epa_per_play"], w["plays_offense"]) for w in last4])
        def_epa_l4 = weighted_avg([(w["def_epa_per_play"], w["plays_defense"]) for w in last4])

        rec = record_by_team.get(team_id, {"wins": 0, "losses": 0, "ties": 0, "points_for": 0, "points_against": 0, "games": 0})
        games_played = len(weeks_sorted)

        reports.append(
            {
                "team_id": team_id,
                "season": season,
                "through_week": weeks_sorted[-1]["week"] if weeks_sorted else 0,
                "games_played": games_played,
                "off_epa_per_play_szn": off_epa_szn,
                "def_epa_per_play_szn": def_epa_szn,
                "off_success_rate_szn": off_success_szn,
                "def_success_rate_szn": def_success_szn,
                "proe_szn": proe_szn,
                "turnover_margin_szn": turnover_margin_szn,
                "off_epa_per_play_l4": off_epa_l4,
                "def_epa_per_play_l4": def_epa_l4,
                "is_reliable_sample": games_played >= MIN_RELIABLE_GAMES,
                "wins": rec["wins"],
                "losses": rec["losses"],
                "ties": rec["ties"],
                "points_for": rec["points_for"],
                "points_against": rec["points_against"],
                "points_per_game": rec["points_for"] / rec["games"] if rec["games"] else None,
                "points_allowed_per_game": rec["points_against"] / rec["games"] if rec["games"] else None,
            }
        )

    # Rankings computed after the fact, across all teams' szn EPA.
    # off: higher is better (descending). def: lower/more negative
    # EPA allowed is better (ascending) -- opposite sort direction,
    # do not flip this by accident.
    ranked_off = sorted([r for r in reports if r["off_epa_per_play_szn"] is not None], key=lambda r: -r["off_epa_per_play_szn"])
    for i, r in enumerate(ranked_off):
        r["off_epa_rank"] = i + 1

    ranked_def = sorted([r for r in reports if r["def_epa_per_play_szn"] is not None], key=lambda r: r["def_epa_per_play_szn"])
    for i, r in enumerate(ranked_def):
        r["def_epa_rank"] = i + 1

    for r in reports:
        r.setdefault("off_epa_rank", None)
        r.setdefault("def_epa_rank", None)

    return reports


def main() -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    for season in SEASONS_TO_COMPUTE:
        print(f"Computing team season reports for {season}...")
        reports = compute_reports(supabase, season)
        print(f"Computed {len(reports)} team reports.\n")

        print("=== SANITY CHECK: first 3 rows ===")
        for r in reports[:3]:
            print(r)
        print()

        if len(reports) == 0:
            print(f"No team reports to upsert for {season} (no games played yet). Nothing to do -- expected for a future season, not an error.\n")
            continue

        if len(reports) < 20:
            print(f"WARNING: expected close to 32 teams for {season}, got {len(reports)}. Check if this seems too low.")

        print(f"About to upsert {len(reports)} rows for {season} into nfl_team_season_reports. Aborting in 5 seconds (Ctrl+C to cancel)...")
        time.sleep(5)

        result = supabase.table("nfl_team_season_reports").upsert(reports, on_conflict="team_id,season").execute()
        print(f"Done. Upserted {len(result.data)} team reports for {season}.\n")


if __name__ == "__main__":
    main()