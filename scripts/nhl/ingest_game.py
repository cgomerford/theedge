"""
scripts/nhl/ingest_game.py

Ingests one finished NHL game: fetches boxscore / play-by-play / shiftcharts /
right-rail / skater-timeonice -> runs strength.compute_game() -> upserts the
explicit-column rows into Supabase -> validates against the boxscore and the
timeonice reference -> writes one nhl_ingest_validation row.

Idempotent: every write is an upsert on its primary key, and the per-game
row sets (nhl_pbp_events, nhl_shifts, nhl_strength_timeline, nhl_game_officials,
nhl_game_scratches) are deleted for this game_id before being re-inserted, so a
re-run never duplicates or leaves stale rows. On any fetch error, nhl_games.
ingest_status is set to 'failed' with the reason and nothing partial is written
for this game -- it's picked up again on the next run.

Single writer per table (see create_nhl_core.sql's header comment) -- this
script owns nhl_pbp_events, nhl_shifts, nhl_strength_timeline, nhl_player_game,
nhl_goalie_game, nhl_team_game_state, nhl_game_officials, nhl_game_scratches,
and nhl_ingest_validation. On nhl_games (owned by sync_schedule.py otherwise),
this script only ever touches ingest_status/ingest_error/ingested_at and
home_coach/away_coach -- the latter two because right-rail (fetched only here)
is the only endpoint that has coach names; the schedule endpoint doesn't.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import strength as st
from client import NHLClient

TOI_TOLERANCE_S = 5
STRENGTH_TOLERANCE_S = 5


def _parse_fraction(value: str) -> tuple[int, int]:
    """'0/2' -> (0, 2). Right-rail teamGameStats powerPlay/faceoffWins format."""
    made, attempted = value.split("/")
    return int(made), int(attempted)


def _stat_by_category(team_game_stats: list[dict], category: str) -> dict:
    for row in team_game_stats:
        if row["category"] == category:
            return row
    return {}


def build_game_rows(boxscore: dict, pbp: dict, shifts_payload: dict, right_rail: dict, toi_ref: dict) -> dict:
    """Pure transform: raw API payloads -> the explicit rows every table needs,
    plus the validation summary. No I/O -- testable without Supabase."""
    game_id = boxscore["id"]
    home_id = boxscore["homeTeam"]["id"]
    away_id = boxscore["awayTeam"]["id"]

    shift_rows = shifts_payload.get("data", [])
    result = st.compute_game(boxscore, pbp, shift_rows)

    box_toi: dict[int, int] = {}
    box_shifts: dict[int, int] = {}
    box_stats: dict[int, dict] = {}
    team_of: dict[int, int] = {}
    position_of: dict[int, str] = {}
    sweater_of: dict[int, int] = {}
    for side, team_id in (("awayTeam", away_id), ("homeTeam", home_id)):
        for group in ("forwards", "defense", "goalies"):
            for p in boxscore["playerByGameStats"][side].get(group, []):
                pid = p["playerId"]
                box_toi[pid] = st.parse_mmss(p["toi"])
                box_shifts[pid] = p.get("shifts", 0)
                box_stats[pid] = p
                team_of[pid] = team_id
                position_of[pid] = p["position"]
                sweater_of[pid] = p["sweaterNumber"]

    toi_ref_by_player = {r["playerId"]: r for r in toi_ref.get("data", [])}
    ref_available = len(toi_ref_by_player) > 0

    player_game_rows = []
    goalie_game_rows = []
    toi_fail = 0
    strength_fail = 0
    strength_unchecked = 0
    max_toi_err = 0
    max_strength_err = 0

    for pid, player in result["players"].items():
        if position_of.get(pid) == "G":
            continue  # goalies get their own table below
        box_val = box_toi.get(pid)
        if box_val is None:
            continue
        toi_err = abs(player["toi_s"] - box_val)
        max_toi_err = max(max_toi_err, toi_err)
        toi_check = "pass" if toi_err <= TOI_TOLERANCE_S else "fail"
        if toi_check == "fail":
            toi_fail += 1

        ref = toi_ref_by_player.get(pid)
        if ref is None:
            strength_check = "unchecked"
            strength_unchecked += 1
            ref_ev = ref_pp = ref_sh = None
            s_err = None
        else:
            ref_ev, ref_pp, ref_sh = ref["evTimeOnIce"], ref["ppTimeOnIce"], ref["shTimeOnIce"]
            s_err = max(abs(player["ev_s"] - ref_ev), abs(player["pp_s"] - ref_pp), abs(player["sh_s"] - ref_sh))
            max_strength_err = max(max_strength_err, s_err)
            strength_check = "pass" if s_err <= STRENGTH_TOLERANCE_S else "fail"
            if strength_check == "fail":
                strength_fail += 1

        box = box_stats.get(pid, {})
        player_game_rows.append(
            {
                "game_id": game_id,
                "player_id": pid,
                "team_id": player["team_id"],
                "position": position_of.get(pid),
                "sweater_number": sweater_of.get(pid),
                "goals": box.get("goals"),
                "assists": box.get("assists"),
                "points": box.get("points"),
                "sog": box.get("sog"),
                "hits": box.get("hits"),
                "blocked": box.get("blockedShots"),
                "pim": box.get("pim"),
                "ppg": box.get("powerPlayGoals"),
                "faceoff_pct": box.get("faceoffWinningPctg"),
                "giveaways": box.get("giveaways"),
                "takeaways": box.get("takeaways"),
                "plus_minus": box.get("plusMinus"),
                "box_toi_s": box_val,
                "box_shifts": box_shifts.get(pid),
                "toi_s": player["toi_s"],
                "toi_ev_s": player["ev_s"],
                "toi_5v5_s": player["5v5_s"],
                "toi_pp_s": player["pp_s"],
                "toi_sh_s": player["sh_s"],
                "toi_en_for_s": player["en_for_s"],
                "toi_en_against_s": player["en_against_s"],
                "shifts": player["shifts"],
                "avg_shift_s": round(player["toi_s"] / player["shifts"], 2) if player["shifts"] else None,
                "ref_ev_s": ref_ev,
                "ref_pp_s": ref_pp,
                "ref_sh_s": ref_sh,
                "toi_check": toi_check,
                "strength_check": strength_check,
                "max_toi_err_s": toi_err,
                "max_strength_err_s": s_err,
            }
        )

    for side, team_id in (("awayTeam", away_id), ("homeTeam", home_id)):
        for g in boxscore["playerByGameStats"][side].get("goalies", []):
            pid = g["playerId"]
            player = result["players"].get(pid)
            toi_s = player["toi_s"] if player else st.parse_mmss(g["toi"])
            goalie_game_rows.append(
                {
                    "game_id": game_id,
                    "player_id": pid,
                    "team_id": team_id,
                    "starter": g.get("starter", False),
                    "decision": g.get("decision"),
                    "toi_s": toi_s,
                    "shots_against": g.get("shotsAgainst"),
                    "saves": g.get("saves"),
                    "goals_against": g.get("goalsAgainst"),
                    "ev_sa": _parse_fraction(g["evenStrengthShotsAgainst"])[1] if g.get("evenStrengthShotsAgainst") else None,
                    "ev_saves": _parse_fraction(g["evenStrengthShotsAgainst"])[0] if g.get("evenStrengthShotsAgainst") else None,
                    "pp_sa": _parse_fraction(g["powerPlayShotsAgainst"])[1] if g.get("powerPlayShotsAgainst") else None,
                    "pp_saves": _parse_fraction(g["powerPlayShotsAgainst"])[0] if g.get("powerPlayShotsAgainst") else None,
                    "sh_sa": _parse_fraction(g["shorthandedShotsAgainst"])[1] if g.get("shorthandedShotsAgainst") else None,
                    "sh_saves": _parse_fraction(g["shorthandedShotsAgainst"])[0] if g.get("shorthandedShotsAgainst") else None,
                }
            )

    pbp_rows = []
    offsets = result["offsets"]
    for play in pbp["plays"]:
        offset = offsets.get(play["periodDescriptor"]["number"])
        if offset is None:
            continue  # a period with no REG/OT/SO mapping (shouldn't happen) -- skip rather than guess
        game_sec = offset + st.parse_mmss(play["timeInPeriod"])
        details = play.get("details", {})
        penalty_duration = details.get("duration")
        pbp_rows.append(
            {
                "game_id": game_id,
                "event_id": play["eventId"],
                "sort_order": play["sortOrder"],
                "period": play["periodDescriptor"]["number"],
                "period_type": play["periodDescriptor"]["periodType"],
                "game_sec": game_sec,
                "situation_code": play.get("situationCode"),
                "type_code": play["typeCode"],
                "type_desc_key": play["typeDescKey"],
                "event_owner_team_id": details.get("eventOwnerTeamId"),
                "x_coord": details.get("xCoord"),
                "y_coord": details.get("yCoord"),
                "zone_code": details.get("zoneCode"),
                "shot_type": details.get("shotType"),
                "shooting_player_id": details.get("shootingPlayerId"),
                "scoring_player_id": details.get("scoringPlayerId"),
                "assist1_player_id": details.get("assist1PlayerId"),
                "assist2_player_id": details.get("assist2PlayerId"),
                "goalie_in_net_id": details.get("goalieInNetId"),
                "winning_player_id": details.get("winningPlayerId"),
                "losing_player_id": details.get("losingPlayerId"),
                "hitting_player_id": details.get("hittingPlayerId"),
                "hittee_player_id": details.get("hitteePlayerId"),
                "blocking_player_id": details.get("blockingPlayerId"),
                "committed_by_player_id": details.get("committedByPlayerId"),
                "drawn_by_player_id": details.get("drawnByPlayerId"),
                "penalty_type_code": details.get("typeCode") if play["typeDescKey"] == "penalty" else None,
                "penalty_desc_key": details.get("descKey") if play["typeDescKey"] == "penalty" else None,
                "penalty_minutes": penalty_duration if play["typeDescKey"] == "penalty" else None,
                "reason": details.get("reason"),
                "secondary_reason": details.get("secondaryReason"),
                "home_score": details.get("homeScore"),
                "away_score": details.get("awayScore"),
                "home_defending_side": play.get("homeTeamDefendingSide"),
            }
        )

    sorted_offsets = sorted(result["offsets"].items(), key=lambda kv: kv[1])

    def _period_at(start_sec: int) -> int | None:
        period = None
        for number, offset in sorted_offsets:
            if offset <= start_sec:
                period = number
            else:
                break
        return period

    shift_table_rows = []
    for pid, info in result["player_shifts"].items():
        for start, end in info["intervals"]:
            shift_table_rows.append(
                {
                    "game_id": game_id,
                    "player_id": pid,
                    "team_id": info["team_id"],
                    "period": _period_at(start),
                    "start_sec": start,
                    "end_sec": end,
                }
            )

    timeline_rows = []
    for start, end, home_sk, away_sk, source in result["timeline"]:
        home_goalie_in = st._interval_covers(result["home_goalie_in"], start, end)
        away_goalie_in = st._interval_covers(result["away_goalie_in"], start, end)
        timeline_rows.append(
            {
                "game_id": game_id,
                "start_sec": start,
                "end_sec": end,
                "home_skaters": home_sk,
                "away_skaters": away_sk,
                "home_goalie_in": home_goalie_in,
                "away_goalie_in": away_goalie_in,
                "source": source,
            }
        )

    officials_rows = []
    game_info = right_rail.get("gameInfo", {})
    for ref in game_info.get("referees", []):
        officials_rows.append(
            {
                "game_id": game_id,
                "role": "referee",
                "name": ref["fullName"]["default"],
                "sweater_number": ref.get("sweaterNumber"),
            }
        )
    for lm in game_info.get("linesmen", []):
        officials_rows.append(
            {
                "game_id": game_id,
                "role": "linesman",
                "name": lm["fullName"]["default"],
                "sweater_number": lm.get("sweaterNumber"),
            }
        )

    scratches_rows = []
    for side, team_id in (("awayTeam", away_id), ("homeTeam", home_id)):
        for p in game_info.get(side, {}).get("scratches", []):
            scratches_rows.append({"game_id": game_id, "team_id": team_id, "player_id": p["id"]})

    coaches = {
        "home_coach": game_info.get("homeTeam", {}).get("headCoach", {}).get("default"),
        "away_coach": game_info.get("awayTeam", {}).get("headCoach", {}).get("default"),
    }

    team_game_stats = right_rail.get("teamGameStats", [])
    pp_row = _stat_by_category(team_game_stats, "powerPlay")
    team_state_rows = []
    for side_key, team_id, opp_key in (("away", away_id, "home"), ("home", home_id, "away")):
        pp_goals = pp_attempts = 0
        if pp_row.get(f"{side_key}Value"):
            pp_goals, pp_attempts = _parse_fraction(pp_row[f"{side_key}Value"])
        opp_pp_goals = 0
        if pp_row.get(f"{opp_key}Value"):
            opp_pp_goals, _ = _parse_fraction(pp_row[f"{opp_key}Value"])
        team_state_rows.append(
            {
                "game_id": game_id,
                "team_id": team_id,
                "toi_ev_s": _team_state_seconds(result["timeline"], team_id, home_id, "ev"),
                "toi_5v5_s": _team_state_seconds(result["timeline"], team_id, home_id, "5v5"),
                "toi_pp_s": _team_state_seconds(result["timeline"], team_id, home_id, "pp"),
                "toi_sh_s": _team_state_seconds(result["timeline"], team_id, home_id, "sh"),
                "toi_en_for_s": None,
                "toi_en_against_s": None,
                "pp_opps": pp_attempts,
                "pp_goals": pp_goals,
                "sh_goals_against": opp_pp_goals,
            }
        )

    validation_row = {
        "game_id": game_id,
        "players": len(box_toi),
        "skaters": len(toi_ref_by_player),
        "toi_fail": toi_fail,
        "strength_fail": strength_fail,
        "strength_unchecked": strength_unchecked,
        "max_toi_err_s": max_toi_err,
        "max_strength_err_s": max_strength_err,
        "ref_available": ref_available,
    }

    return {
        "player_game_rows": player_game_rows,
        "goalie_game_rows": goalie_game_rows,
        "pbp_rows": pbp_rows,
        "shift_rows": shift_table_rows,
        "timeline_rows": timeline_rows,
        "officials_rows": officials_rows,
        "scratches_rows": scratches_rows,
        "team_state_rows": team_state_rows,
        "validation_row": validation_row,
        "coaches": coaches,
    }


def _team_state_seconds(timeline: list[tuple[int, int, int, int, str]], team_id: int, home_id: int, state: str) -> int:
    is_home = team_id == home_id
    total = 0
    for start, end, home_sk, away_sk, _source in timeline:
        own = home_sk if is_home else away_sk
        opp = away_sk if is_home else home_sk
        duration = end - start
        if state == "ev" and own == opp:
            total += duration
        elif state == "pp" and own > opp:
            total += duration
        elif state == "sh" and own < opp:
            total += duration
        elif state == "5v5" and own == 5 and opp == 5:
            total += duration
    return total


def ingest_game(client: NHLClient, supabase, game_id: int) -> None:
    try:
        boxscore = client.boxscore(game_id)
        pbp = client.play_by_play(game_id)
        shifts_payload = client.shift_charts(game_id)
        right_rail = client.right_rail(game_id)
        toi_ref = client.time_on_ice(game_id)
    except Exception as exc:  # noqa: BLE001 -- any fetch failure marks this game 'failed', retried next run
        print(f"[ingest_game] fetch error for {game_id}: {exc}")
        supabase.table("nhl_games").update(
            {"ingest_status": "failed", "ingest_error": str(exc)[:500]}
        ).eq("game_id", game_id).execute()
        return

    rows = build_game_rows(boxscore, pbp, shifts_payload, right_rail, toi_ref)

    for table in ("nhl_pbp_events", "nhl_shifts", "nhl_strength_timeline", "nhl_game_officials", "nhl_game_scratches"):
        supabase.table(table).delete().eq("game_id", game_id).execute()

    if rows["pbp_rows"]:
        supabase.table("nhl_pbp_events").upsert(rows["pbp_rows"]).execute()
    if rows["shift_rows"]:
        supabase.table("nhl_shifts").upsert(rows["shift_rows"]).execute()
    if rows["timeline_rows"]:
        supabase.table("nhl_strength_timeline").upsert(rows["timeline_rows"]).execute()
    if rows["officials_rows"]:
        supabase.table("nhl_game_officials").upsert(rows["officials_rows"]).execute()
    if rows["scratches_rows"]:
        supabase.table("nhl_game_scratches").upsert(rows["scratches_rows"]).execute()
    if rows["player_game_rows"]:
        supabase.table("nhl_player_game").upsert(rows["player_game_rows"]).execute()
    if rows["goalie_game_rows"]:
        supabase.table("nhl_goalie_game").upsert(rows["goalie_game_rows"]).execute()
    if rows["team_state_rows"]:
        supabase.table("nhl_team_game_state").upsert(rows["team_state_rows"]).execute()
    supabase.table("nhl_ingest_validation").upsert(rows["validation_row"]).execute()

    supabase.table("nhl_games").update(
        {
            "ingest_status": "ingested",
            "ingest_error": None,
            "ingested_at": "now()",
            **rows["coaches"],
        }
    ).eq("game_id", game_id).execute()

    v = rows["validation_row"]
    print(
        f"[ingest_game] {game_id}: players={v['players']} toi_fail={v['toi_fail']} "
        f"strength_fail={v['strength_fail']} unchecked={v['strength_unchecked']} "
        f"max_toi_err={v['max_toi_err_s']}s max_strength_err={v['max_strength_err_s']}s"
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
    parser.add_argument("game_id", type=int)
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    ingest_game(NHLClient(), sb, args.game_id)
