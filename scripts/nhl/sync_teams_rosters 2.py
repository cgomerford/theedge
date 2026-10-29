"""
scripts/nhl/sync_teams_rosters.py

Sole writer of nhl_teams, nhl_players and nhl_roster_snapshots.

Team colour has no clean free source -- the schedule/boxscore endpoints only
ship logo URLs (barred, never fetched for their image data here) -- so this
walks the schedule back from today to find each team's most recent finished
game, fetches that game's shiftcharts once, and reads the team's hexValue from
it. Computes a readable text colour with a standard luminance threshold,
matching the spirit of the hand-curated text_on_primary values in
src/lib/teams.ts without guessing at a palette no free endpoint actually
provides. Team IDs are resolved from the same schedule walk (the roster
endpoint has no team-id field), so this makes one schedule call per day
walked and one shiftcharts call per distinct game actually needed -- not
one of each per team.

No headshot field is read from the roster payload (see client.py's strip).
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client import NHLClient

CURRENT_SEASON = 20262027
LOOKBACK_DAYS = 21  # covers any early-season gap; one schedule call per day walked

TEAM_ABBREVS = [
    "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ", "DAL", "DET",
    "EDM", "FLA", "LAK", "MIN", "MTL", "NSH", "NJD", "NYI", "NYR", "OTT",
    "PHI", "PIT", "SJS", "SEA", "STL", "TBL", "TOR", "UTA", "VAN", "VGK",
    "WSH", "WPG",
]


def _relative_luminance(hex_color: str) -> float:
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def text_on_hex(hex_color: str | None) -> str:
    if not hex_color:
        return "#FFFFFF"
    return "#000000" if _relative_luminance(hex_color) > 0.5 else "#FFFFFF"


def resolve_team_ids_and_latest_games(
    client: NHLClient,
) -> tuple[dict[str, int], dict[str, int], dict[str, dict[str, str]]]:
    """One pass over the last LOOKBACK_DAYS of schedule, walking from today
    backwards, filling in team_id, latest finished game_id, and name fields
    for every abbrev as soon as each is first seen (most recent wins, since we
    walk newest-first and never overwrite). Name fields come from here because
    the roster endpoint (client.roster) has none at all."""
    team_ids: dict[str, int] = {}
    latest_game: dict[str, int] = {}
    names: dict[str, dict[str, str]] = {}
    today = date.today()
    for days_back in range(LOOKBACK_DAYS):
        if len(team_ids) == len(TEAM_ABBREVS) and len(latest_game) == len(TEAM_ABBREVS):
            break
        day = today - timedelta(days=days_back)
        payload = client.schedule(day.isoformat())
        for week in payload.get("gameWeek", []):
            for game in week.get("games", []):
                for side in ("awayTeam", "homeTeam"):
                    abbrev = game[side]["abbrev"]
                    team_ids.setdefault(abbrev, game[side]["id"])
                    if abbrev not in names:
                        place = game[side]["placeName"]["default"]
                        common = game[side]["commonName"]["default"]
                        names[abbrev] = {"place_name": place, "common_name": common, "full_name": f"{place} {common}"}
                    if game["gameState"] == "OFF":
                        latest_game.setdefault(abbrev, game["id"])
    return team_ids, latest_game, names


def fetch_team_colors(client: NHLClient, latest_game: dict[str, int]) -> dict[str, str]:
    """One shiftcharts fetch per distinct game (most games cover two teams at
    once, so this is roughly half as many calls as there are teams)."""
    colors: dict[str, str] = {}
    game_to_abbrevs: dict[int, list[str]] = {}
    for abbrev, game_id in latest_game.items():
        game_to_abbrevs.setdefault(game_id, []).append(abbrev)

    for game_id, abbrevs in game_to_abbrevs.items():
        shifts = client.shift_charts(game_id)
        for row in shifts.get("data", []):
            team_abbrev = row.get("teamAbbrev")
            if team_abbrev in abbrevs and team_abbrev not in colors and row.get("hexValue"):
                colors[team_abbrev] = row["hexValue"]
    return colors


def sync_teams(client: NHLClient, supabase) -> dict[str, int]:
    team_ids, latest_game, names = resolve_team_ids_and_latest_games(client)
    colors = fetch_team_colors(client, latest_game)

    team_rows = []
    player_rows = []
    snapshot_rows = []
    today = date.today().isoformat()

    for abbrev in TEAM_ABBREVS:
        team_id = team_ids.get(abbrev)
        if team_id is None:
            print(f"[sync_teams_rosters] WARNING: could not resolve team_id for {abbrev} in the last {LOOKBACK_DAYS} days, skipping")
            continue

        roster = client.roster(abbrev, CURRENT_SEASON)
        if not (roster.get("forwards") or roster.get("defensemen") or roster.get("goalies")):
            print(f"[sync_teams_rosters] WARNING: empty roster for {abbrev}")
            continue

        color_hex = colors.get(abbrev)
        name_fields = names.get(abbrev, {})
        team_rows.append(
            {
                "team_id": team_id,
                "abbrev": abbrev,
                "place_name": name_fields.get("place_name"),
                "common_name": name_fields.get("common_name"),
                "full_name": name_fields.get("full_name"),
                "color_hex": color_hex,
                "text_on_hex": text_on_hex(color_hex),
            }
        )

        for group, forced_position in (("forwards", None), ("defensemen", None), ("goalies", "G")):
            for p in roster.get(group, []):
                pid = p["id"]
                position_code = forced_position or p.get("positionCode")
                player_rows.append(
                    {
                        "player_id": pid,
                        "first_name": p["firstName"]["default"],
                        "last_name": p["lastName"]["default"],
                        "full_name": f"{p['firstName']['default']} {p['lastName']['default']}",
                        "position_code": position_code,
                        "shoots_catches": p.get("shootsCatches"),
                        "sweater_number": p.get("sweaterNumber"),
                        "team_id": team_id,
                        "birth_date": p.get("birthDate"),
                        "height_in": p.get("heightInInches"),
                        "weight_lb": p.get("weightInPounds"),
                    }
                )
                snapshot_rows.append(
                    {
                        "snapshot_date": today,
                        "team_id": team_id,
                        "player_id": pid,
                        "position_code": position_code,
                    }
                )

    if team_rows:
        supabase.table("nhl_teams").upsert(team_rows).execute()
    if player_rows:
        supabase.table("nhl_players").upsert(player_rows).execute()
    if snapshot_rows:
        supabase.table("nhl_roster_snapshots").upsert(snapshot_rows).execute()

    print(f"[sync_teams_rosters] teams={len(team_rows)} players={len(player_rows)} snapshot_rows={len(snapshot_rows)}")
    return {"teams": len(team_rows), "players": len(player_rows), "snapshots": len(snapshot_rows)}


if __name__ == "__main__":
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(".env.local")
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    sync_teams(NHLClient(), sb)
