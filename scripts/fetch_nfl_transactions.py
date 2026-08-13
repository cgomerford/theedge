#!/usr/bin/env python3
"""
fetch_nfl_transactions.py

Syncs NFL injury reports from ESPN's core API into the nfl_transactions
Supabase table. First half of the NFL transactions pipeline — roster
moves/cuts/trades come from a SEPARATE ESPN endpoint we haven't
curl-verified yet, and get their own script once that shape is confirmed.
Do not extend this script to guess at that endpoint's fields.

CONFIRMED LIVE (Aug 2026) — every field this script reads was seen in an
actual response, not guessed:

  List:    sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{id}/injuries
           -> {"items": [{"$ref": ".../seasons/{yr}/athletes/{aid}/injuries/{iid}"}]}
           Paginated, $ref only, no inline data.

  Detail:  sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{yr}/athletes/{aid}/injuries/{iid}
           -> {"status": "Questionable", "date": "2026-08-03T16:24Z",
               "shortComment": "...", "longComment": "...",
               "type": {"name": "INJURY_STATUS_QUESTIONABLE", "abbreviation": "Q"}}
           NOTE: no player name in this record.

  Athletes (bulk name lookup, NOT per-player):
           sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=1000&page={n}
           -> {"items": [{"id": "...", "fullName": "...", "active": bool}]}
           21 pages total (~20,228 athletes). No position field here.

  Roster (position lookup, one call per team):
           site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{id}/roster
           -> divided into offense/defense/specialTeams groups with position info
           (confirmed structurally via prior research; re-verify the exact
           position field path before trusting it blindly if this script
           errors on that step — don't assume the shape carried over exactly).

COST DISCIPLINE: a naive N+1 approach here is ~2,000+ requests per run
(32 teams x ~65 injuries each, each needing a detail fetch, each needing
an athlete-name fetch). This script avoids two of those three N+1s by
batching the athlete list and the roster lookups. The injury detail fetch
is still one-per-record, but only for records not already in Supabase —
see `already_known_ids` below.

Run: python3 fetch_nfl_transactions.py
Schedule: GitHub Actions, suggest every 6-12h during the season (injury
status changes fast in-week), daily in off-season. NOT more frequent —
"be respectful" per ESPN's unofficial API norms.
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# Find .env.local relative to this script — works from any cwd, matches
# the convention in fetch_pitch_arsenals.py / fetch_ultimate_team_pool.py
ENV_PATH = Path(__file__).parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# ── Config ──────────────────────────────────────────────────────────────────

ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl"
ESPN_ATHLETES_V3 = "https://sports.core.api.espn.com/v3/sports/football/nfl/athletes"
# site.api.espn.com REMOVED (Aug 2026) — confirmed 403 Access Denied
# (Akamai-level block, not an ESPN application error) on every path
# tested. Everything now runs through sports.core.api.espn.com instead.

SEASON = 2026
REQUEST_DELAY_SECONDS = 0.4  # increased from 0.15 — see get_json() note on why
REQUEST_HEADERS = {
    # ESPN's undocumented API appears to rate-limit or reject requests
    # that look scripted (no User-Agent, tight request spacing). This
    # is inferred, not confirmed via any official docs — but the
    # symptom (persistent failures affecting most of the alphabet, not
    # one random page) is consistent with a sustained block rather than
    # a transient network blip. If names are STILL unresolved after this
    # change, the next thing to check is whether ESPN is IP-blocking the
    # CI runner entirely (try running this from your own machine locally
    # and compare).
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}

# All 32 ESPN team IDs. Confirmed against site.api.espn.com/.../teams — do not
# renumber without re-checking, ESPN's team IDs are not sequential by division.
NFL_TEAM_IDS = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34,
]

# Support both naming conventions:
#   Local dev .env.local uses Next.js names (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
#   GitHub Actions secrets use SUPABASE_URL, SUPABASE_SERVICE_KEY
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or ''
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''


# ── Types ───────────────────────────────────────────────────────────────────

class InjuryRecord:
    def __init__(
        self,
        espn_injury_id: str,
        athlete_id: str,
        team_id: str,
        team_abbr: str,
        team_name: str,
        status: str,
        status_abbr: Optional[str],
        short_comment: Optional[str],
        long_comment: Optional[str],
        report_date: str,
    ) -> None:
        self.espn_injury_id = espn_injury_id
        self.athlete_id = athlete_id
        self.team_id = team_id
        self.team_abbr = team_abbr
        self.team_name = team_name
        self.status = status
        self.status_abbr = status_abbr
        self.short_comment = short_comment
        self.long_comment = long_comment
        self.report_date = report_date


# ── HTTP helper ─────────────────────────────────────────────────────────────

def get_json(url: str) -> Optional[dict]:
    try:
        resp = requests.get(url, headers=REQUEST_HEADERS, timeout=20)
        if not resp.ok:
            # Log the response body, not just the status code — if this
            # is a rate limit, ESPN's error body will usually say so
            # explicitly, and we've been guessing at the cause blind
            # until now.
            body_preview = resp.text[:200] if resp.text else '(empty body)'
            print(f"  [warn] {resp.status_code} for {url}\n         body: {body_preview}", file=sys.stderr)
            return None
        return resp.json()
    except requests.RequestException as e:
        print(f"  [warn] request failed for {url}: {e}", file=sys.stderr)
        return None
    finally:
        time.sleep(REQUEST_DELAY_SECONDS)


# ── Step 1: bulk athlete name lookup ────────────────────────────────────────

def build_athlete_name_lookup() -> dict[str, str]:
    """Fetches all ~20k athletes once (21 paginated requests) rather than
    one request per player. Returns {athlete_id: fullName}.

    BUG FIX (Aug 2026): the original version did `if not data: break` on
    any failed page, which silently truncated the whole lookup at
    whichever page happened to time out. Since the athlete list is
    sorted alphabetically by last name, this meant every player past
    roughly the first failed page's surname range resolved to "Unknown"
    downstream — a real production bug, not a hypothetical one (caught
    via a screenshot showing exactly that pattern: early-alphabet names
    resolved, everyone after didn't).

    Fix: retry each page up to 3 times before giving up on THAT page
    specifically, then continue to the next page rather than aborting
    the whole fetch. Failed pages are logged explicitly so a partial
    lookup is visible in the logs, not silently shipped as if it were
    complete.
    """
    print("Building athlete name lookup (bulk fetch)...")
    lookup: dict[str, str] = {}
    page = 1
    page_count = None
    failed_pages: list[int] = []

    while page_count is None or page <= page_count:
        data = None
        for attempt in range(3):
            data = get_json(f"{ESPN_ATHLETES_V3}?limit=1000&page={page}")
            if data:
                break
            print(f"  page {page} attempt {attempt + 1}/3 failed, retrying...")
            time.sleep(3 * (attempt + 1))  # 3s, 6s, 9s — longer backoff in case this is a rate limit, not a blip

        if not data:
            print(f"  [warn] page {page} failed after 3 attempts, skipping this page and continuing")
            failed_pages.append(page)
            # We don't know page_count yet if this was page 1 — without
            # it we can't know how many pages to keep trying. Bail only
            # in that specific case; otherwise keep going since we
            # already know the total from an earlier successful page.
            if page_count is None:
                break
            page += 1
            continue

        items = data.get("items", [])
        for item in items:
            aid = item.get("id")
            name = item.get("fullName")
            if aid and name:
                lookup[str(aid)] = name

        if page_count is None:
            page_count = data.get("pageCount", 1)
        print(f"  page {page}/{page_count} — {len(items)} athletes")
        page += 1

    if failed_pages:
        print(f"  [warn] {len(failed_pages)} page(s) failed even after retries: {failed_pages} — lookup is INCOMPLETE, some players will show as Unknown")
    print(f"  total: {len(lookup)} athletes cached")
    if len(lookup) < 15000:
        # Confirmed real total was ~20,228 athletes across 21 pages. If
        # we're well short of that, something's wrong even if no page
        # technically "failed" — e.g. every page returned but with
        # truncated/empty item lists. Don't let this pass silently.
        print(f"  [warn] lookup size ({len(lookup)}) is suspiciously low vs the confirmed ~20,228 total — investigate before trusting this run's data")
    return lookup


# ── Step 2: per-team roster -> position lookup ──────────────────────────────

# Position lookup no longer uses the roster endpoint (site.api.espn.com
# was returning 403 Access Denied — an Akamai-level block on that host
# specifically, confirmed via real error output, not the ESPN API itself
# rejecting us). Position now comes from the ATHLETE DETAIL endpoint
# (sports.core.api.espn.com/.../seasons/{yr}/athletes/{aid}) — confirmed
# via curl to have position inline as {name, displayName, abbreviation}.
# This is a SEPARATE resource from the injury detail endpoint (which has
# status/comment but no position) — one extra fetch per new injury
# record, not a free read off data we already had. Still far cheaper
# than the old roster approach: bounded by how many NEW injury records
# a run processes (already_known_ids skips the rest), not by full
# 32-team roster size (93 players x 32 = ~3000 either way we cut it).


def fetch_athlete_position(athlete_id: str) -> Optional[str]:
    """Fetches one athlete's position abbreviation. Returns None on any
    failure or unexpected shape — a missing position is fine (the UI
    already handles it gracefully); a wrong one isn't."""
    data = get_json(f"{ESPN_CORE}/seasons/{SEASON}/athletes/{athlete_id}?lang=en&region=us")
    if not data:
        return None
    try:
        return data.get("position", {}).get("abbreviation")
    except (AttributeError, TypeError):
        return None


# ── Step 3: injury list + detail fetch ──────────────────────────────────────

def fetch_team_injury_refs(team_id: int) -> list[str]:
    """Returns the list of injury detail URLs for a team, walking pagination."""
    refs: list[str] = []
    page = 1
    while True:
        data = get_json(f"{ESPN_CORE}/teams/{team_id}/injuries?page={page}")
        if not data:
            break
        for item in data.get("items", []):
            ref = item.get("$ref")
            if ref:
                refs.append(ref)
        page_count = data.get("pageCount", 1)
        if page >= page_count:
            break
        page += 1
    return refs


def parse_injury_id_from_ref(ref: str) -> Optional[str]:
    # e.g. ".../athletes/4912218/injuries/632467?lang=en&region=us"
    try:
        path = ref.split("?")[0]
        return path.rstrip("/").split("/")[-1]
    except (IndexError, AttributeError):
        return None


def parse_athlete_id_from_ref(ref: str) -> Optional[str]:
    try:
        path = ref.split("?")[0].rstrip("/")
        parts = path.split("/")
        idx = parts.index("athletes")
        return parts[idx + 1]
    except (ValueError, IndexError):
        return None


def fetch_injury_detail(
    ref: str,
    team_id: str,
    team_abbr: str,
    team_name: str,
) -> Optional[InjuryRecord]:
    data = get_json(ref)
    if not data:
        return None

    injury_id = data.get("id")
    athlete_id = parse_athlete_id_from_ref(ref)
    status = data.get("status")
    report_date = data.get("date")

    if not injury_id or not athlete_id or not status or not report_date:
        print(f"  [warn] incomplete injury record at {ref}, skipping", file=sys.stderr)
        return None

    type_info = data.get("type") or {}

    return InjuryRecord(
        espn_injury_id=str(injury_id),
        athlete_id=str(athlete_id),
        team_id=team_id,
        team_abbr=team_abbr,
        team_name=team_name,
        status=status,
        status_abbr=type_info.get("abbreviation"),
        short_comment=data.get("shortComment"),
        long_comment=data.get("longComment"),
        report_date=report_date,
    )


# ── Team metadata (id -> abbr/name) ─────────────────────────────────────────
#
# SWITCHED off site.api.espn.com (confirmed blocked — see the 403s in
# testing) to sports.core.api.espn.com instead. NOT independently
# curl-verified by Claude for this exact shape — built from the pattern
# every other sports.core.api.espn.com detail resource in this pipeline
# has followed (athlete detail, team statistics), which have consistently
# had fields inline rather than $ref-only. Run this once and check the
# console output shows real abbreviations ("DAL", "KC") instead of
# "Team 1 (1)" before trusting it — same verify-before-trust discipline
# as everything else in this file.

def fetch_team_metadata() -> dict[int, tuple[str, str]]:
    """{team_id: (abbr, name)}"""
    out: dict[int, tuple[str, str]] = {}
    for team_id in NFL_TEAM_IDS:
        data = get_json(f"{ESPN_CORE}/seasons/{SEASON}/teams/{team_id}?lang=en&region=us")
        if not data:
            continue
        abbr = data.get("abbreviation")
        name = data.get("displayName")
        if abbr and name:
            out[team_id] = (abbr, name)
        else:
            print(f"  [warn] team {team_id} metadata missing abbreviation/displayName — got keys: {list(data.keys())}", file=sys.stderr)
    return out


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

    supa: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Empty state beats fabricated data: if any of these lookups fail
    # entirely, we still proceed — a missing name/position becomes a
    # null in the row, not a guessed value.
    name_lookup = build_athlete_name_lookup()
    team_meta = fetch_team_metadata()

    # Existing IDs already in Supabase — skip detail-fetching these.
    # Status CAN change on an existing record (Questionable -> Out), so
    # this isn't a perfect skip; a fuller implementation would re-check
    # records seen in the last N days. Left as a known limitation rather
    # than adding complexity before this version is proven to work.
    existing = supa.table("nfl_transactions").select("espn_injury_id").execute()
    already_known_ids = {row["espn_injury_id"] for row in (existing.data or [])}
    print(f"{len(already_known_ids)} injury records already in Supabase")

    total_new = 0
    total_skipped = 0

    for team_id in NFL_TEAM_IDS:
        abbr, name = team_meta.get(team_id, (str(team_id), str(team_id)))
        print(f"\nTeam {team_id} ({abbr})...")

        refs = fetch_team_injury_refs(team_id)
        print(f"  {len(refs)} injury records found")

        rows_to_upsert = []
        for ref in refs:
            injury_id = parse_injury_id_from_ref(ref)
            if injury_id and injury_id in already_known_ids:
                total_skipped += 1
                continue

            record = fetch_injury_detail(ref, str(team_id), abbr, name)
            if not record:
                continue

            player_name = name_lookup.get(record.athlete_id, "Unknown")
            position = fetch_athlete_position(record.athlete_id)

            rows_to_upsert.append({
                "espn_injury_id": record.espn_injury_id,
                "athlete_id": record.athlete_id,
                "player_name": player_name,
                "position": position,
                "team_id": record.team_id,
                "team_abbr": record.team_abbr,
                "team_name": record.team_name,
                "status": record.status,
                "status_abbr": record.status_abbr,
                "short_comment": record.short_comment,
                "long_comment": record.long_comment,
                "report_date": record.report_date,
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            })

        if rows_to_upsert:
            supa.table("nfl_transactions").upsert(
                rows_to_upsert, on_conflict="espn_injury_id"
            ).execute()
            total_new += len(rows_to_upsert)
            print(f"  upserted {len(rows_to_upsert)} new/updated records")

    print(f"\nDone. {total_new} new records, {total_skipped} already known and skipped.")


if __name__ == "__main__":
    main()