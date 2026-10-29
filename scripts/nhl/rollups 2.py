"""
scripts/nhl/rollups.py

Sole writer of nhl_deployment_strip and nhl_availability_desk. Also prints the
nhl_ingest_validation report (that table's rows are written by ingest_game.py
per game; this just summarizes them -- see print_validation_report).

DEPLOYMENT STRIP AGGREGATION (an assumption, flagged as such because the build
spec doesn't pin down the exact math -- see the N1 STOP summary):
- toi_* metrics: "value" is a SHARE of the team's own time at that strength
  (player's toi_X_s / team's toi_X_s for the same game, from nhl_team_game_state),
  so a share can never disagree with the seconds beside it. "raw" is the
  player's own seconds, averaged per game over the window -- displayed as
  "14:32 min" per the spec's MetricSpec formatting note, which only makes sense
  as a per-game figure, not a multi-game sum.
- "last" = the most recent single game. "l5"/"season" are ratio-of-sums (sum of
  the player's seconds over the window / sum of the team's seconds over the same
  window) for value, and the mean of the player's own seconds for raw -- ratio-
  of-sums is more robust than averaging per-game ratios when a game's team
  total is small.
- shifts / avg_shift metrics aren't a share of anything: value == raw (a per-
  game mean count or mean seconds), formatted differently per MetricSpec.
- Games with toi_check='fail' are excluded entirely (counted in excluded_games);
  strength metrics (5v5/ev/pp/sh) also exclude strength_check='fail' games.
- This only writes the raw aggregates (counts, sums, games). Which numbers are
  actually SHOWN (hide L5 under 3 games, leave PP/PK unranked below FLOOR) is a
  display-time decision for N2's src/lib/nhl/deployment.ts, per the precompute-
  raw/render-with-rules split used everywhere else in this codebase.

AVAILABILITY DESK: derived only, no injury feed (see N2 lock) -- scratched from
the most recent game's right-rail scratches, "missed last game" from dressed
count over the last 10 team games, roster change from the last two
nhl_roster_snapshots for the team.
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PAGE_SIZE = 1000
WINDOW_N = 5  # NHL's UsageStrip window (NFL uses 3; see usage-strip/types.ts)

METRICS = {
    "nhl_toi_5v5": ("toi_5v5_s", "toi_5v5_s", "share"),
    "nhl_toi_ev": ("toi_ev_s", "toi_ev_s", "share"),
    "nhl_toi_pp": ("toi_pp_s", "toi_pp_s", "share"),
    "nhl_toi_sh": ("toi_sh_s", "toi_sh_s", "share"),
    "nhl_shifts": ("shifts", None, "direct"),
    "nhl_avg_shift": ("avg_shift_s", None, "direct"),
}


def _paginated_select(supabase, table: str, columns: str, filters=None):
    rows = []
    start = 0
    filters = filters or {}
    while True:
        q = supabase.table(table).select(columns)
        for col, val in filters.items():
            q = q.eq(col, val)
        page = q.range(start, start + PAGE_SIZE - 1).execute()
        rows.extend(page.data)
        if len(page.data) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows


def compute_deployment_strip(supabase, season: int) -> int:
    games = _paginated_select(supabase, "nhl_games", "game_id,game_date,home_team_id,away_team_id", {"season": season})
    game_date_by_id = {g["game_id"]: g["game_date"] for g in games}
    team_games: dict[int, list[tuple[str, int]]] = defaultdict(list)
    for g in games:
        team_games[g["home_team_id"]].append((g["game_date"], g["game_id"]))
        team_games[g["away_team_id"]].append((g["game_date"], g["game_id"]))
    for team_id in team_games:
        team_games[team_id].sort()

    player_rows = _paginated_select(
        supabase,
        "nhl_player_game",
        "game_id,player_id,team_id,shifts,avg_shift_s,toi_ev_s,toi_5v5_s,toi_pp_s,toi_sh_s,toi_check,strength_check",
    )
    team_state_rows = _paginated_select(supabase, "nhl_team_game_state", "game_id,team_id,toi_ev_s,toi_5v5_s,toi_pp_s,toi_sh_s")
    team_state_by_game_team = {(r["game_id"], r["team_id"]): r for r in team_state_rows}

    by_player: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in player_rows:
        if row["game_id"] not in game_date_by_id:
            continue  # a different season
        by_player[(row["player_id"], row["team_id"])].append(row)

    out_rows = []
    for (player_id, team_id), rows in by_player.items():
        rows_by_game = {r["game_id"]: r for r in rows}
        ordered_game_ids = [gid for _date, gid in team_games.get(team_id, []) if gid in rows_by_game]

        for metric, (player_col, team_col, kind) in METRICS.items():
            usable = [gid for gid in ordered_game_ids if rows_by_game[gid]["toi_check"] == "pass"]
            if kind == "share":
                usable = [gid for gid in usable if rows_by_game[gid]["strength_check"] == "pass"]
            excluded = len(ordered_game_ids) - len(usable)
            if not usable:
                continue

            last_gid = usable[-1]
            last_raw = rows_by_game[last_gid][player_col]
            last_value = _share(last_raw, team_state_by_game_team.get((last_gid, team_id), {}).get(team_col)) if kind == "share" else last_raw

            l5_ids = usable[-WINDOW_N:]
            l5_raw_vals = [rows_by_game[gid][player_col] for gid in l5_ids]
            l5_raw = sum(l5_raw_vals) / len(l5_raw_vals)
            l5_value = _ratio_of_sums(l5_ids, rows_by_game, team_state_by_game_team, team_id, player_col, team_col) if kind == "share" else l5_raw

            season_raw_vals = [rows_by_game[gid][player_col] for gid in usable]
            season_raw = sum(season_raw_vals) / len(season_raw_vals)
            season_value = (
                _ratio_of_sums(usable, rows_by_game, team_state_by_game_team, team_id, player_col, team_col)
                if kind == "share"
                else season_raw
            )

            out_rows.append(
                {
                    "season": season,
                    "team_id": team_id,
                    "player_id": player_id,
                    "metric": metric,
                    "through_date": game_date_by_id[last_gid],
                    "last_game_id": last_gid,
                    "last_value": last_value,
                    "last_raw": last_raw,
                    "l5_games": len(l5_ids),
                    "l5_value": l5_value,
                    "l5_raw": l5_raw,
                    "season_games": len(usable),
                    "season_value": season_value,
                    "season_raw": season_raw,
                    "excluded_games": excluded,
                }
            )

    if out_rows:
        for i in range(0, len(out_rows), PAGE_SIZE):
            supabase.table("nhl_deployment_strip").upsert(out_rows[i : i + PAGE_SIZE]).execute()
    print(f"[rollups] nhl_deployment_strip: {len(out_rows)} rows")
    return len(out_rows)


def _share(raw: float | None, team_total: float | None) -> float | None:
    if raw is None or not team_total:
        return None
    return round(raw / team_total, 4)


def _ratio_of_sums(game_ids, rows_by_game, team_state_by_game_team, team_id, player_col, team_col) -> float | None:
    player_sum = sum(rows_by_game[gid][player_col] or 0 for gid in game_ids)
    team_sum = sum((team_state_by_game_team.get((gid, team_id)) or {}).get(team_col) or 0 for gid in game_ids)
    if team_sum == 0:
        return None
    return round(player_sum / team_sum, 4)


def compute_availability_desk(supabase, season: int) -> int:
    games = _paginated_select(supabase, "nhl_games", "game_id,game_date,home_team_id,away_team_id,ingest_status", {"season": season})
    finished = [g for g in games if g["ingest_status"] == "ingested"]
    team_games: dict[int, list[dict]] = defaultdict(list)
    for g in finished:
        team_games[g["home_team_id"]].append(g)
        team_games[g["away_team_id"]].append(g)
    for team_id in team_games:
        team_games[team_id].sort(key=lambda g: g["game_date"])

    scratches = _paginated_select(supabase, "nhl_game_scratches", "game_id,team_id,player_id")
    scratches_by_game_team: dict[tuple[int, int], set[int]] = defaultdict(set)
    for s in scratches:
        scratches_by_game_team[(s["game_id"], s["team_id"])].add(s["player_id"])

    dressed_rows = _paginated_select(supabase, "nhl_player_game", "game_id,team_id,player_id")
    dressed_by_game_team: dict[tuple[int, int], set[int]] = defaultdict(set)
    for r in dressed_rows:
        dressed_by_game_team[(r["game_id"], r["team_id"])].add(r["player_id"])

    snapshots = _paginated_select(supabase, "nhl_roster_snapshots", "snapshot_date,team_id,player_id")
    snapshots_by_team: dict[int, list[tuple[str, set[int]]]] = defaultdict(list)
    by_team_date: dict[tuple[int, str], set[int]] = defaultdict(set)
    for s in snapshots:
        by_team_date[(s["team_id"], s["snapshot_date"])].add(s["player_id"])
    for (team_id, snap_date), players in by_team_date.items():
        snapshots_by_team[team_id].append((snap_date, players))
    for team_id in snapshots_by_team:
        snapshots_by_team[team_id].sort(key=lambda t: t[0])

    out_rows = []
    for team_id, team_g in team_games.items():
        last10 = team_g[-10:]
        if not last10:
            continue
        last_game = last10[-1]
        current_roster = snapshots_by_team.get(team_id, [])
        current_players = current_roster[-1][1] if current_roster else set()
        previous_players = current_roster[-2][1] if len(current_roster) >= 2 else None

        all_player_ids: set[int] = set(current_players)
        for g in last10:
            all_player_ids |= dressed_by_game_team.get((g["game_id"], team_id), set())
            all_player_ids |= scratches_by_game_team.get((g["game_id"], team_id), set())

        for player_id in all_player_ids:
            dressed_last10 = sum(1 for g in last10 if player_id in dressed_by_game_team.get((g["game_id"], team_id), set()))
            dressed_last_game = player_id in dressed_by_game_team.get((last_game["game_id"], team_id), set())
            scratched_last_game = player_id in scratches_by_game_team.get((last_game["game_id"], team_id), set())

            if scratched_last_game:
                status = "scratched"
            elif dressed_last_game:
                status = "dressed"
            else:
                status = "not_listed"

            consecutive_missed = 0
            for g in reversed(last10):
                if player_id in dressed_by_game_team.get((g["game_id"], team_id), set()):
                    break
                consecutive_missed += 1

            roster_change = None
            roster_change_date = None
            if previous_players is not None:
                in_current = player_id in current_players
                in_previous = player_id in previous_players
                if in_current and not in_previous:
                    roster_change = "added"
                    roster_change_date = current_roster[-1][0]
                elif in_previous and not in_current:
                    roster_change = "removed"
                    roster_change_date = current_roster[-1][0]

            out_rows.append(
                {
                    "season": season,
                    "team_id": team_id,
                    "player_id": player_id,
                    "status": status,
                    "last_game_id": last_game["game_id"],
                    "dressed_last10": dressed_last10,
                    "team_games_last10": len(last10),
                    "consecutive_missed": consecutive_missed,
                    "on_current_roster": player_id in current_players,
                    "roster_change": roster_change,
                    "roster_change_date": roster_change_date,
                }
            )

    if out_rows:
        for i in range(0, len(out_rows), PAGE_SIZE):
            supabase.table("nhl_availability_desk").upsert(out_rows[i : i + PAGE_SIZE]).execute()
    print(f"[rollups] nhl_availability_desk: {len(out_rows)} rows")
    return len(out_rows)


def print_validation_report(supabase, limit: int = 5) -> None:
    rows = _paginated_select(
        supabase,
        "nhl_ingest_validation",
        "game_id,players,skaters,toi_fail,strength_fail,strength_unchecked,max_toi_err_s,max_strength_err_s,ref_available",
    )
    if not rows:
        print("[rollups] nhl_ingest_validation: no rows yet")
        return
    total_games = len(rows)
    total_toi_fail = sum(r["toi_fail"] for r in rows)
    total_strength_fail = sum(r["strength_fail"] for r in rows)
    total_unchecked = sum(r["strength_unchecked"] for r in rows)
    clean_games = sum(1 for r in rows if r["toi_fail"] == 0 and r["strength_fail"] == 0)

    print(f"[rollups] validation: {total_games} games ingested, {clean_games} fully clean "
          f"({clean_games / total_games:.1%}), {total_toi_fail} toi_fail rows, "
          f"{total_strength_fail} strength_fail rows, {total_unchecked} strength_unchecked rows")

    worst = sorted(rows, key=lambda r: (r["toi_fail"] + r["strength_fail"], r["max_strength_err_s"] or 0), reverse=True)
    print(f"[rollups] {min(limit, len(worst))} worst games:")
    for r in worst[:limit]:
        print(
            f"  game {r['game_id']}: toi_fail={r['toi_fail']} strength_fail={r['strength_fail']} "
            f"unchecked={r['strength_unchecked']} max_toi_err={r['max_toi_err_s']}s max_strength_err={r['max_strength_err_s']}s "
            f"ref_available={r['ref_available']}"
        )


if __name__ == "__main__":
    import argparse

    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(".env.local")
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=20262027)
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    compute_deployment_strip(sb, args.season)
    compute_availability_desk(sb, args.season)
    print_validation_report(sb)
