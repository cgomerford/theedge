"""
scripts/nhl/strength.py

Pure functions that reconstruct per-second on-ice strength (EV/PP/SH/5v5, empty-net)
from shift-chart and play-by-play data. No I/O -- everything here takes plain dicts/
lists and returns plain dicts/lists, so it's unit-testable without touching Supabase
or the network (see tests/test_strength.py).

Unit: one game-second. game_sec = seconds elapsed since puck drop of period 1,
counting period lengths that vary by period type (see period_offsets()).

WHY A SIMULATION AT ALL: the boxscore has no EV/PP/SH split for skaters, only total
TOI. We rebuild strength from the penalty events ourselves (anchored against the
observed situationCode on each play, since our simulation can miss things the real
officials' clock wouldn't -- e.g. a penalty that ends early for a reason not
represented in the penalty event list).

VALIDATED (see N1 STOP summary): against the real fixture game 2026020022
(CHI@BUF, 3 Oct 2026) -- total TOI matches the boxscore within +/-5s for all 40
skater/goalie appearances, and EV/PP/SH matches the skater/timeonice reference
exactly for all 36 skaters. That is one game; the acceptance bar in the spec
(27 games, two known failures) could not be fully reproduced in this pass since
the other 26 games' shift/PBP data were not individually re-fetched and spot-
checked here -- see the open question in the STOP summary about broader validation.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

REG_PERIOD_SEC = 1200
REG_SEASON_OT_SEC = 300
PLAYOFF_OT_SEC = 1200

# Penalty type codes that create ice-time (a unit a player must serve).
_SERVING_CODES = {"MIN", "BEN", "MAJ", "MAT"}
_NO_EFFECT_CODES = {"MIS", "GMIS", "GAM", "PS"}


def parse_mmss(value: str) -> int:
    minutes, seconds = value.split(":")
    return int(minutes) * 60 + int(seconds)


def period_offsets(periods: list[tuple[int, str]], game_type: int) -> tuple[dict[int, int], dict[int, int], set[int]]:
    """
    periods: list of (period_number, period_type) pairs seen in the game's PBP,
    e.g. [(1,'REG'),(2,'REG'),(3,'REG'),(4,'OT')]. Order by period_number.

    Returns (offsets, lengths, so_periods):
      offsets[period_number]  = game_sec at the start of that period
      lengths[period_number]  = that period's length in seconds (0 for SO)
      so_periods              = set of period numbers that are a shootout (excluded
                                 from every TOI/strength computation)
    """
    offsets: dict[int, int] = {}
    lengths: dict[int, int] = {}
    so_periods: set[int] = set()
    cursor = 0
    for number, period_type in sorted(set(periods)):
        offsets[number] = cursor
        if period_type == "REG":
            length = REG_PERIOD_SEC
        elif period_type == "OT":
            length = REG_SEASON_OT_SEC if game_type == 2 else PLAYOFF_OT_SEC
        elif period_type == "SO":
            length = 0
            so_periods.add(number)
        else:
            length = REG_PERIOD_SEC
        lengths[number] = length
        cursor += length
    return offsets, lengths, so_periods


def union_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """De-duplicates and merges overlapping/adjacent [start,end) second intervals.
    Never sums durations -- the shift chart has duplicate and overlapping rows."""
    if not intervals:
        return []
    ordered = sorted(intervals)
    merged = [list(ordered[0])]
    for start, end in ordered[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(s, e) for s, e in merged]


def build_player_shifts(
    shift_rows: list[dict],
    offsets: dict[int, int],
    so_periods: set[int],
) -> dict[int, dict]:
    """
    shift_rows: raw rows from the shiftcharts endpoint (typeCode, period, startTime,
    endTime, playerId, teamId -- extra fields ignored).

    Returns {player_id: {"team_id": int, "intervals": [(start_sec, end_sec), ...]}}
    with intervals unioned (never summed) and SO-period rows dropped.
    """
    by_player: dict[int, list[tuple[int, int]]] = defaultdict(list)
    team_by_player: dict[int, int] = {}
    for row in shift_rows:
        if row.get("typeCode") != 517:
            continue
        period = row["period"]
        if period in so_periods or period not in offsets:
            continue
        offset = offsets[period]
        start = offset + parse_mmss(row["startTime"])
        end = offset + parse_mmss(row["endTime"])
        if end <= start:
            continue
        pid = row["playerId"]
        by_player[pid].append((start, end))
        team_by_player[pid] = row["teamId"]
    return {
        pid: {"team_id": team_by_player[pid], "intervals": union_intervals(ivs)}
        for pid, ivs in by_player.items()
    }


def total_toi(intervals: list[tuple[int, int]]) -> int:
    return sum(e - s for s, e in intervals)


def parse_situation_code(code: str) -> dict:
    """
    4 chars: [awayGoalieIn, awaySkaters, homeSkaters, homeGoalieIn].
    Skater digits include the extra attacker when that team's goalie is pulled
    (e.g. '0651' = away pulled the goalie for a 6th attacker). "Strength" skaters
    below strip that extra attacker so EV/PP/SH classification isn't thrown off
    by an empty-net situation -- see algorithm step 5 in the build spec.
    """
    away_goalie_in = code[0] == "1"
    home_goalie_in = code[3] == "1"
    away_skaters_raw = int(code[1])
    home_skaters_raw = int(code[2])
    return {
        "away_goalie_in": away_goalie_in,
        "home_goalie_in": home_goalie_in,
        "away_skaters": away_skaters_raw - (0 if away_goalie_in else 1),
        "home_skaters": home_skaters_raw - (0 if home_goalie_in else 1),
    }


def observed_points_from_plays(
    plays: list[dict],
    offsets: dict[int, int],
    so_periods: set[int],
) -> list[tuple[int, int, int]]:
    """
    Builds the anchor_timeline() input from raw PBP plays.

    TRAP (found by validating against the real fixture game): several plays can
    share the same game_sec with DIFFERENT situationCodes -- e.g. a `penalty`
    event still carries the pre-penalty code, and the `faceoff` event one row
    later (same second) carries the new one. Plays arrive in `sortOrder`, so a
    later reading at the same second is the correct one. Naively sorting the
    (game_sec, home_skaters, away_skaters) tuples -- which is what you'd reach
    for first -- silently re-orders same-second ties by VALUE instead of by
    what actually happened first, which fed stale pre-penalty states into the
    anchor and produced strength-split errors up to 34s on the fixture game.
    This function sorts by sortOrder and lets the later same-second reading win.
    """
    by_time: dict[int, tuple[int, int]] = {}
    for play in sorted(plays, key=lambda p: p["sortOrder"]):
        if play["periodDescriptor"]["number"] in so_periods:
            continue
        code = play.get("situationCode")
        if not code:
            continue
        offset = offsets.get(play["periodDescriptor"]["number"])
        if offset is None:
            continue
        game_sec = offset + parse_mmss(play["timeInPeriod"])
        parsed = parse_situation_code(code)
        by_time[game_sec] = (parsed["home_skaters"], parsed["away_skaters"])
    return sorted((t, h, a) for t, (h, a) in by_time.items())


def cancel_coincidental(penalties_at_time: list[dict]) -> list[dict]:
    """Same game_sec, opposite teams, equal duration -> both cancel (no strength
    change). Only ever two teams in an NHL game, so this is a straight pairing."""
    by_team: dict[int, list[int]] = defaultdict(list)
    for idx, p in enumerate(penalties_at_time):
        by_team[p["team_id"]].append(idx)
    teams = list(by_team.keys())
    if len(teams) != 2:
        return list(penalties_at_time)
    team_a, team_b = teams
    cancelled: set[int] = set()
    used_b: set[int] = set()
    for i in by_team[team_a]:
        for j in by_team[team_b]:
            if j in used_b:
                continue
            if penalties_at_time[i]["duration_min"] == penalties_at_time[j]["duration_min"]:
                cancelled.add(i)
                cancelled.add(j)
                used_b.add(j)
                break
    return [p for idx, p in enumerate(penalties_at_time) if idx not in cancelled]


def _penalty_to_units(penalty: dict) -> list[dict]:
    """A double minor becomes two 2-minute units sharing one group_id. FIFO
    queueing alone isn't enough to keep them sequential -- if both of a team's
    slots are open when the double minor is created, a naive queue happily
    starts both halves at once. try_fill_slot refuses to start a unit while a
    same-group_id sibling is still serving, which is what actually keeps the
    two halves consecutive."""
    code = penalty["type_code"]
    duration_min = penalty["duration_min"]
    if code in _NO_EFFECT_CODES:
        return []
    if code not in _SERVING_CODES:
        return []
    if code == "MIN" and duration_min == 4:
        return [
            {"duration_sec": 120, "releasable": True},
            {"duration_sec": 120, "releasable": True},
        ]
    if code in ("MIN", "BEN"):
        return [{"duration_sec": duration_min * 60, "releasable": True}]
    # MAJ / MAT: majors are never released early by a PP goal.
    return [{"duration_sec": duration_min * 60, "releasable": False}]


@dataclass
class _ServingUnit:
    end_sec: int
    releasable: bool
    uid: int
    group_id: int


@dataclass
class _TeamPenaltyState:
    queue: list[dict] = field(default_factory=list)
    serving: list[_ServingUnit] = field(default_factory=list)


def simulate_penalties(
    penalty_events: list[dict],
    goal_events: list[dict],
    game_end_sec: int,
    home_team_id: int,
    away_team_id: int,
) -> list[tuple[int, int, int, int]]:
    """
    penalty_events: [{"game_sec", "team_id" (penalised team), "type_code", "duration_min"}]
    goal_events: [{"game_sec", "team_id" (scoring team)}]

    Returns breakpoints as a sorted list of (game_sec, home_serving, away_serving)
    -- the serving COUNT per team (0-2), not skaters. Converting serving count to
    skaters is period-type-dependent (regulation vs regular-season OT vs playoff
    OT), so that's done by the caller (build_strength_timeline) per segment.
    """
    by_time: dict[int, list[dict]] = defaultdict(list)
    for p in penalty_events:
        by_time[p["game_sec"]].append(p)

    states = {home_team_id: _TeamPenaltyState(), away_team_id: _TeamPenaltyState()}
    uid_counter = 0

    # event heap entries: (time, seq, kind, payload) -- seq breaks ties deterministically
    events: list[tuple[int, int, str, dict]] = []
    seq = 0
    for t in sorted(by_time.keys()):
        pruned = cancel_coincidental(by_time[t])
        for p in pruned:
            events.append((t, seq, "penalty", p))
            seq += 1
    for g in goal_events:
        events.append((g["game_sec"], seq, "goal", g))
        seq += 1

    breakpoints: list[tuple[int, int, int]] = [(0, 0, 0)]

    def serving_count(team_id: int) -> int:
        return len(states[team_id].serving)

    def record_breakpoint(t: int) -> None:
        breakpoints.append((t, serving_count(home_team_id), serving_count(away_team_id)))

    def try_fill_slot(team_id: int, now: int) -> None:
        state = states[team_id]
        while len(state.serving) < 2 and state.queue:
            serving_groups = {u.group_id for u in state.serving}
            if state.queue[0]["group_id"] in serving_groups:
                break  # a sibling half is still serving -- wait, don't let a later item jump ahead
            unit_spec = state.queue.pop(0)
            unit_uid = _next_uid()
            end_sec = now + unit_spec["duration_sec"]
            state.serving.append(
                _ServingUnit(end_sec=end_sec, releasable=unit_spec["releasable"], uid=unit_uid, group_id=unit_spec["group_id"])
            )
            events.append((end_sec, seq_next(), "slot_free", {"team_id": team_id, "uid": unit_uid}))
            record_breakpoint(now)

    _uid_box = [0]

    def _next_uid() -> int:
        _uid_box[0] += 1
        return _uid_box[0]

    _group_box = [0]

    def _next_group_id() -> int:
        _group_box[0] += 1
        return _group_box[0]

    _seq_box = [seq]

    def seq_next() -> int:
        _seq_box[0] += 1
        return _seq_box[0]

    # Process strictly in time order; re-sort as new events are appended.
    processed = 0
    while processed < len(events):
        events.sort(key=lambda e: (e[0], e[1]))
        time_, _, kind, payload = events[processed]
        processed += 1
        if time_ > game_end_sec:
            continue

        if kind == "penalty":
            units = _penalty_to_units(payload)
            if not units:
                continue
            group_id = _next_group_id()
            for unit in units:
                unit["group_id"] = group_id
            states[payload["team_id"]].queue.extend(units)
            try_fill_slot(payload["team_id"], time_)

        elif kind == "slot_free":
            team_id = payload["team_id"]
            uid = payload["uid"]
            state = states[team_id]
            state.serving = [u for u in state.serving if u.uid != uid]
            record_breakpoint(time_)
            try_fill_slot(team_id, time_)

        elif kind == "goal":
            scoring = payload["team_id"]
            conceding = home_team_id if scoring == away_team_id else away_team_id
            if serving_count(conceding) > serving_count(scoring):
                conceding_state = states[conceding]
                releasable = [u for u in conceding_state.serving if u.releasable]
                if releasable:
                    earliest = min(releasable, key=lambda u: u.end_sec)
                    conceding_state.serving = [u for u in conceding_state.serving if u.uid != earliest.uid]
                    record_breakpoint(time_)
                    try_fill_slot(conceding, time_)

    breakpoints.sort(key=lambda b: b[0])
    # Collapse consecutive duplicates.
    collapsed: list[tuple[int, int, int]] = [breakpoints[0]]
    for bp in breakpoints[1:]:
        if bp[1:] != collapsed[-1][1:]:
            collapsed.append(bp)
    return collapsed


def skaters_for(period_type: str, game_type: int, serving_self: int, serving_opp: int) -> int:
    serving_self = min(2, serving_self)
    serving_opp = min(2, serving_opp)
    if period_type == "OT" and game_type == 2:
        return min(5, 3 + serving_opp)
    return max(1, 5 - serving_self)


def build_sim_segments(
    serving_breakpoints: list[tuple[int, int, int]],
    period_bounds: list[tuple[int, int, str]],
    game_type: int,
    game_end_sec: int,
) -> list[tuple[int, int, int, int]]:
    """
    period_bounds: [(start_sec, end_sec, period_type), ...] for non-SO periods only.

    Returns [(start, end, home_skaters, away_skaters), ...] covering every
    non-SO second of the game, splitting at both penalty breakpoints and period
    boundaries (strength rules change at the REG/OT line).
    """
    cut_points = sorted({b[0] for b in serving_breakpoints} | {p[0] for p in period_bounds} | {game_end_sec})
    segments: list[tuple[int, int, int, int]] = []
    for start, end in zip(cut_points[:-1], cut_points[1:]):
        period_type = _period_type_at(start, period_bounds)
        if period_type is None:
            continue  # inside an excluded (SO) gap
        home_serving, away_serving = _serving_at(start, serving_breakpoints)
        home_skaters = skaters_for(period_type, game_type, home_serving, away_serving)
        away_skaters = skaters_for(period_type, game_type, away_serving, home_serving)
        segments.append((start, end, home_skaters, away_skaters))
    return segments


def _period_type_at(t: int, period_bounds: list[tuple[int, int, str]]) -> str | None:
    for start, end, ptype in period_bounds:
        if start <= t < end:
            return ptype
    return None


def _serving_at(t: int, breakpoints: list[tuple[int, int, int]]) -> tuple[int, int]:
    current = (0, 0)
    for bp_time, home, away in breakpoints:
        if bp_time > t:
            break
        current = (home, away)
    return current


def anchor_timeline(
    sim_segments: list[tuple[int, int, int, int]],
    observed_points: list[tuple[int, int, int]],
) -> list[tuple[int, int, int, int, str]]:
    """
    observed_points: [(game_sec, home_skaters_observed, away_skaters_observed), ...]
    sorted ascending, one per PBP event carrying a situationCode (SO-period events
    already excluded by the caller).

    "If [observed and sim] disagree, trust the observed code from that event until
    the simulation next changes state" (build spec, TOI + STRENGTH ALGORITHM step 4):
    implemented as a small state machine -- every sim-segment boundary re-syncs to
    sim's own predicted value; every observed point that disagrees with the current
    value switches to anchor mode until the next re-sync.
    """
    if not sim_segments:
        return []
    boundaries = sorted({s[0] for s in sim_segments} | {p[0] for p in observed_points} | {sim_segments[-1][1]})
    result: list[tuple[int, int, int, int, str]] = []
    mode = "sim"
    current_home, current_away = sim_segments[0][2], sim_segments[0][3]
    obs_by_time = {p[0]: (p[1], p[2]) for p in observed_points}
    sim_starts = {s[0]: (s[2], s[3]) for s in sim_segments}

    for start, end in zip(boundaries[:-1], boundaries[1:]):
        if start in sim_starts:
            mode = "sim"
            current_home, current_away = sim_starts[start]
        if start in obs_by_time:
            obs_home, obs_away = obs_by_time[start]
            if (obs_home, obs_away) != (current_home, current_away):
                mode = "anchor"
                current_home, current_away = obs_home, obs_away
        result.append((start, end, current_home, current_away, mode))
    return result


def classify_player_seconds(
    player_intervals: list[tuple[int, int]],
    team_is_home: bool,
    timeline: list[tuple[int, int, int, int, str]],
    own_goalie_in: list[tuple[int, int]],
    opp_goalie_in: list[tuple[int, int]],
) -> dict[str, int]:
    """
    Walks a player's shift intervals against the final (anchored) strength timeline
    and buckets seconds into ev/pp/sh/5v5/en_for/en_against.

    own == opp skaters -> EV (includes the 0651-type empty-net case, per spec);
    own > opp -> PP; own < opp -> SH.
    5v5 additionally requires both teams at 5 skaters AND both goalies in net.
    en_for  = seconds the opponent's goalie is pulled (this player's team benefits).
    en_against = seconds this player's own team's goalie is pulled.
    """
    totals = {"ev": 0, "pp": 0, "sh": 0, "5v5": 0, "en_for": 0, "en_against": 0}
    for shift_start, shift_end in player_intervals:
        for seg_start, seg_end, home_sk, away_sk, _source in timeline:
            overlap_start = max(shift_start, seg_start)
            overlap_end = min(shift_end, seg_end)
            if overlap_end <= overlap_start:
                continue
            seconds = overlap_end - overlap_start
            own_sk = home_sk if team_is_home else away_sk
            opp_sk = away_sk if team_is_home else home_sk
            if own_sk == opp_sk:
                totals["ev"] += seconds
            elif own_sk > opp_sk:
                totals["pp"] += seconds
            else:
                totals["sh"] += seconds
            if own_sk == 5 and opp_sk == 5:
                own_goalie = _interval_covers(own_goalie_in, overlap_start, overlap_end)
                opp_goalie = _interval_covers(opp_goalie_in, overlap_start, overlap_end)
                if own_goalie and opp_goalie:
                    totals["5v5"] += seconds
            if not _interval_covers(opp_goalie_in, overlap_start, overlap_end):
                totals["en_for"] += seconds
            if not _interval_covers(own_goalie_in, overlap_start, overlap_end):
                totals["en_against"] += seconds
    return totals


def compute_game(boxscore: dict, play_by_play: dict, shift_rows: list[dict]) -> dict:
    """
    Ties every pure function above together for one game. Still pure (no I/O) --
    takes the three already-fetched payloads and returns plain dicts. This is
    the single orchestration path shared by ingest_game.py and the test suite,
    so there is exactly one place that can get the event ordering wrong (see
    observed_points_from_plays' docstring for the trap that already bit this once).

    Returns:
      {
        "home_team_id", "away_team_id", "game_type", "game_end_sec",
        "offsets": {period_number: game_sec_at_start}, "so_periods": {period_numbers},
        "timeline": [(start,end,home_skaters,away_skaters,source), ...],
        "players": {player_id: {"team_id", "toi_s", "ev_s", "pp_s", "sh_s",
                                 "5v5_s", "en_for_s", "en_against_s", "shifts"}},
        "player_shifts": {player_id: {"team_id", "intervals": [(start,end),...]}},
        "home_goalie_in": [...], "away_goalie_in": [...],
      }
    """
    home_id = boxscore["homeTeam"]["id"]
    away_id = boxscore["awayTeam"]["id"]
    game_type = boxscore["gameType"]

    periods_seen = sorted(
        {(p["periodDescriptor"]["number"], p["periodDescriptor"]["periodType"]) for p in play_by_play["plays"]}
    )
    offsets, lengths, so_periods = period_offsets(periods_seen, game_type)
    period_bounds = [(offsets[n], offsets[n] + lengths[n], ptype) for n, ptype in periods_seen if n not in so_periods]
    game_end_sec = max(end for _, end, _ in period_bounds)

    player_shifts = build_player_shifts(shift_rows, offsets, so_periods)

    penalty_events: list[dict] = []
    goal_events: list[dict] = []
    for play in play_by_play["plays"]:
        if play["periodDescriptor"]["number"] in so_periods:
            continue
        offset = offsets[play["periodDescriptor"]["number"]]
        game_sec = offset + parse_mmss(play["timeInPeriod"])
        if play["typeDescKey"] == "penalty":
            details = play["details"]
            penalty_events.append(
                {
                    "game_sec": game_sec,
                    "team_id": details["eventOwnerTeamId"],
                    "type_code": details["typeCode"],
                    "duration_min": details["duration"],
                }
            )
        elif play["typeDescKey"] == "goal":
            goal_events.append({"game_sec": game_sec, "team_id": play["details"]["eventOwnerTeamId"]})

    breakpoints = simulate_penalties(penalty_events, goal_events, game_end_sec, home_id, away_id)
    sim_segments = build_sim_segments(breakpoints, period_bounds, game_type, game_end_sec)
    observed = observed_points_from_plays(play_by_play["plays"], offsets, so_periods)
    timeline = anchor_timeline(sim_segments, observed)

    def goalie_ids(side: str) -> list[int]:
        return [g["playerId"] for g in boxscore["playerByGameStats"][side]["goalies"]]

    def goalie_union(ids: list[int]) -> list[tuple[int, int]]:
        intervals: list[tuple[int, int]] = []
        for gid in ids:
            if gid in player_shifts:
                intervals.extend(player_shifts[gid]["intervals"])
        return union_intervals(intervals)

    home_goalie_in = goalie_union(goalie_ids("homeTeam"))
    away_goalie_in = goalie_union(goalie_ids("awayTeam"))

    players: dict[int, dict] = {}
    for pid, info in player_shifts.items():
        team_is_home = info["team_id"] == home_id
        own_goalie = home_goalie_in if team_is_home else away_goalie_in
        opp_goalie = away_goalie_in if team_is_home else home_goalie_in
        cls = classify_player_seconds(info["intervals"], team_is_home, timeline, own_goalie, opp_goalie)
        players[pid] = {
            "team_id": info["team_id"],
            "toi_s": total_toi(info["intervals"]),
            "ev_s": cls["ev"],
            "pp_s": cls["pp"],
            "sh_s": cls["sh"],
            "5v5_s": cls["5v5"],
            "en_for_s": cls["en_for"],
            "en_against_s": cls["en_against"],
            "shifts": len(info["intervals"]),
        }

    return {
        "home_team_id": home_id,
        "away_team_id": away_id,
        "game_type": game_type,
        "game_end_sec": game_end_sec,
        "offsets": offsets,
        "so_periods": so_periods,
        "timeline": timeline,
        "players": players,
        "player_shifts": player_shifts,
        "home_goalie_in": home_goalie_in,
        "away_goalie_in": away_goalie_in,
    }


def _interval_covers(intervals: list[tuple[int, int]], start: int, end: int) -> bool:
    """True if [start,end) is fully inside the union of intervals (goalie in net
    the whole time)."""
    for s, e in intervals:
        if s <= start and end <= e:
            return True
    return False
