"""
scripts/nhl/tests/test_strength.py

Run with: python3 -m pytest scripts/nhl/tests/test_strength.py -v

Fixture game 2026020022 (CHI@BUF, 3 Oct 2026, final 3-4) was curled live on
4 Oct 2026 and stripped of every URL/logo/headshot/odds field (see client.py's
strip_payload -- the committed JSON under tests/fixtures/2026020022/ has none).
It has 21 blocked shots (2 of them a same-team block), a 59s empty-net window at
the end, and no OT/SO, which is why the synthetic cases below cover OT/SO/stacking
separately rather than relying on a second real fixture.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import strength as st

FIXTURE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "2026020022")


def _load(name: str) -> dict:
    with open(os.path.join(FIXTURE_DIR, f"{name}.json")) as f:
        return json.load(f)


def _box_toi(boxscore: dict) -> dict[int, int]:
    out = {}
    for side in ("awayTeam", "homeTeam"):
        for group in ("forwards", "defense", "goalies"):
            for p in boxscore["playerByGameStats"][side].get(group, []):
                out[p["playerId"]] = st.parse_mmss(p["toi"])
    return out


def _fixture_game() -> dict:
    boxscore = _load("boxscore")
    pbp = _load("play-by-play")
    shifts = _load("shiftcharts")["data"]
    return st.compute_game(boxscore, pbp, shifts)


# -- (a) total TOI within +/-5s of the boxscore, every player --


def test_total_toi_matches_boxscore_within_5_seconds():
    boxscore = _load("boxscore")
    result = _fixture_game()
    box_toi = _box_toi(boxscore)
    # 40 boxscore appearances (36 skaters + 2 goalies/side); two of those are
    # backups who never left the bench (00:00 TOI) and so have no shift rows
    # at all -- correctly absent from result["players"], not a bug.
    assert len(box_toi) == 40
    for pid, box_val in box_toi.items():
        our_val = result["players"].get(pid, {}).get("toi_s", 0)
        assert abs(our_val - box_val) <= 5, f"player {pid}: ours={our_val} box={box_val}"


# -- (b) EV/PP/SH matches the skater/timeonice reference exactly, every skater --


def test_strength_split_matches_timeonice_reference_exactly():
    toi_ref = _load("timeonice")["data"]
    ref_by_player = {r["playerId"]: r for r in toi_ref}
    result = _fixture_game()
    checked = 0
    for pid, player in result["players"].items():
        ref = ref_by_player.get(pid)
        if ref is None:
            continue  # goalies aren't in the skater reference
        assert player["ev_s"] == ref["evTimeOnIce"], f"player {pid} EV: ours={player['ev_s']} ref={ref['evTimeOnIce']}"
        assert player["pp_s"] == ref["ppTimeOnIce"], f"player {pid} PP: ours={player['pp_s']} ref={ref['ppTimeOnIce']}"
        assert player["sh_s"] == ref["shTimeOnIce"], f"player {pid} SH: ours={player['sh_s']} ref={ref['shTimeOnIce']}"
        checked += 1
    assert checked == 36, f"expected 36 skaters in the reference, got {checked}"


# -- (c) blocked-shot eventOwnerTeamId == the shooter's team, except 2 same-team blocks --


def test_blocked_shot_owner_is_shooting_team():
    pbp = _load("play-by-play")
    roster_team = {r["playerId"]: r["teamId"] for r in pbp["rosterSpots"]}
    blocked = [p for p in pbp["plays"] if p["typeDescKey"] == "blocked-shot"]
    assert len(blocked) == 21

    same_team_blocks = 0
    for play in blocked:
        details = play["details"]
        owner = details["eventOwnerTeamId"]
        shooter_team = roster_team[details["shootingPlayerId"]]
        blocker_team = roster_team[details["blockingPlayerId"]]
        assert owner == shooter_team, f"event {play['eventId']}: owner {owner} != shooter's team {shooter_team}"
        if blocker_team == shooter_team:
            same_team_blocks += 1
    assert same_team_blocks == 2
    non_teammate_blocks = len(blocked) - same_team_blocks
    assert non_teammate_blocks == 19


# -- (d) the empty-net window classifies EV for skaters and counts in toi_en_* --


def test_empty_net_window_is_ev_and_counted():
    boxscore = _load("boxscore")
    result = _fixture_game()
    away_goalie_id = boxscore["playerByGameStats"]["awayTeam"]["goalies"][0]["playerId"]
    away_goalie_toi = st.parse_mmss(boxscore["playerByGameStats"]["awayTeam"]["goalies"][0]["toi"])
    assert away_goalie_toi == 3541  # 59s pulled for the extra attacker, confirmed live

    en_seconds_seen = [p["en_for_s"] + p["en_against_s"] for p in result["players"].values()]
    assert any(s > 0 for s in en_seconds_seen), "expected at least one player with empty-net seconds"

    # No skater's ev+pp+sh should silently drop the empty-net seconds: they must
    # land in exactly one of ev/pp/sh in addition to being counted in en_for/en_against.
    for player in result["players"].values():
        assert player["ev_s"] + player["pp_s"] + player["sh_s"] == player["toi_s"]


# ===================== synthetic cases (e) =====================


def _make_bounds(period_type: str, length: int, n: int = 1) -> list[tuple[int, int, str]]:
    return [(i * length, (i + 1) * length, period_type) for i in range(n)]


def test_coincidental_minors_cancel():
    # Same second, opposite teams, equal duration -> no strength change.
    penalties = [
        {"game_sec": 100, "team_id": 1, "type_code": "MIN", "duration_min": 2},
        {"game_sec": 100, "team_id": 2, "type_code": "MIN", "duration_min": 2},
    ]
    breakpoints = st.simulate_penalties(penalties, [], game_end_sec=1200, home_team_id=1, away_team_id=2)
    # Only the initial (0,0,0) breakpoint should exist -- nothing ever serves.
    assert breakpoints == [(0, 0, 0)]


def test_pp_goal_releases_earliest_ending_minor():
    # Team 2 takes a minor at t=0 (2 min). Team 1 scores a PP goal at t=50.
    penalties = [{"game_sec": 0, "team_id": 2, "type_code": "MIN", "duration_min": 2}]
    goals = [{"game_sec": 50, "team_id": 1}]
    breakpoints = st.simulate_penalties(penalties, goals, game_end_sec=1200, home_team_id=1, away_team_id=2)
    # away(2) serving: 1 at t=0, released at t=50 by the PP goal (not at the
    # natural t=120 end).
    by_time = {t: (h, a) for t, h, a in breakpoints}
    assert by_time[0] == (0, 1)
    assert by_time[50] == (0, 0)
    assert 120 not in by_time


def test_double_minor_second_half_starts_at_release_second():
    # Team 2 takes a double minor (duration=4) at t=0. Team 1 scores a PP goal
    # at t=30: only the first half ends: the second half starts at t=30 and
    # runs to t=150, not released early by this same goal.
    penalties = [{"game_sec": 0, "team_id": 2, "type_code": "MIN", "duration_min": 4}]
    goals = [{"game_sec": 30, "team_id": 1}]
    breakpoints = st.simulate_penalties(penalties, goals, game_end_sec=1200, home_team_id=1, away_team_id=2)
    by_time = {t: (h, a) for t, h, a in breakpoints}
    assert by_time[0] == (0, 1)
    assert by_time[30] == (0, 1)  # second half starts immediately -- still 1 serving
    assert by_time[150] == (0, 0)  # second half's natural end (30 + 120)


def test_three_penalties_stack_to_5v3_with_third_queued():
    # Team 2 takes three minors at t=0, 10, 20 -- at most 2 serve at once, so
    # the third queues and starts when the first one's slot frees at t=120.
    penalties = [
        {"game_sec": 0, "team_id": 2, "type_code": "MIN", "duration_min": 2},
        {"game_sec": 10, "team_id": 2, "type_code": "MIN", "duration_min": 2},
        {"game_sec": 20, "team_id": 2, "type_code": "MIN", "duration_min": 2},
    ]
    breakpoints = st.simulate_penalties(penalties, [], game_end_sec=1200, home_team_id=1, away_team_id=2)
    by_time = {t: (h, a) for t, h, a in breakpoints}
    assert by_time[0] == (0, 1)
    assert by_time[10] == (0, 2)  # 5-on-3 (two serving, capped at 2)
    assert 20 not in by_time  # third penalty queues, no immediate state change
    assert by_time[120] == (0, 2)  # first one ends, third immediately fills the slot
    assert by_time[130] == (0, 1)  # second one ends (started t=10, 120s -> t=130)
    assert by_time[240] == (0, 0)  # third one ends (started t=120, 120s -> t=240)


def test_regular_season_ot_3v3_becomes_4v3_on_penalty():
    breakpoints = st.simulate_penalties(
        [{"game_sec": 10, "team_id": 2, "type_code": "MIN", "duration_min": 2}],
        [],
        game_end_sec=300,
        home_team_id=1,
        away_team_id=2,
    )
    bounds = _make_bounds("OT", 300)
    segments = st.build_sim_segments(breakpoints, bounds, game_type=2, game_end_sec=300)
    by_start = {s[0]: (s[2], s[3]) for s in segments}
    assert by_start[0] == (3, 3)  # base 3v3
    assert by_start[10] == (4, 3)  # team 1 (home) gets a 4th skater; team 2 stays at 3


def test_duplicate_shift_rows_union_to_right_total():
    rows = [
        {"typeCode": 517, "period": 1, "startTime": "00:00", "endTime": "00:50", "playerId": 1, "teamId": 10},
        {"typeCode": 517, "period": 1, "startTime": "00:00", "endTime": "00:50", "playerId": 1, "teamId": 10},
        {"typeCode": 517, "period": 1, "startTime": "00:30", "endTime": "01:10", "playerId": 1, "teamId": 10},
    ]
    offsets = {1: 0}
    shifts = st.build_player_shifts(rows, offsets, so_periods=set())
    # Union of [0,50) and [0,50) and [30,70) -> [0,70), not 50+50+40=140.
    assert shifts[1]["intervals"] == [(0, 70)]
    assert st.total_toi(shifts[1]["intervals"]) == 70


def test_so_period_excluded_from_toi():
    rows = [
        {"typeCode": 517, "period": 1, "startTime": "00:00", "endTime": "00:50", "playerId": 1, "teamId": 10},
        {"typeCode": 517, "period": 5, "startTime": "00:00", "endTime": "00:20", "playerId": 1, "teamId": 10},
    ]
    offsets = {1: 0, 5: 3900}
    shifts = st.build_player_shifts(rows, offsets, so_periods={5})
    assert shifts[1]["intervals"] == [(0, 50)]
    assert st.total_toi(shifts[1]["intervals"]) == 50


if __name__ == "__main__":
    import pytest

    raise SystemExit(pytest.main([__file__, "-v"]))
