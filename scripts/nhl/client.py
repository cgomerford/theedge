"""
scripts/nhl/client.py

Plain-HTTP client for the free NHL API (api-web.nhle.com/v1, api.nhle.com/stats/rest/en).

DELIBERATE DEVIATION FROM THE BUILD SPEC: the spec asks for nhl-api-py==3.3.0
(the `nhlpy` package). Confirmed by installing it and inspecting the source on
4 Oct 2026: its method surface matches this project's verified endpoints exactly
(schedule.daily_schedule, game_center.boxscore / play_by_play / shift_chart_data /
season_series_matchup, teams.team_roster — no method for skater/timeonice, which
matches the spec's note to hit that one directly) -- but its HttpClient builds a
fresh httpx.Client() per call with no way to inject headers, so it cannot send the
custom User-Agent the politeness lock below requires. Hitting the endpoints
directly means we control headers, backoff and field-stripping ourselves, against
the exact same hosts/paths the wrapper would have used.

POLITENESS LOCK (CLAUDE.md / the build spec):
- MAX_CONCURRENT = 6 in-flight requests (semaphore).
- A global token bucket caps the sustained rate at NHL_REQS_PER_SEC (env; default
  1.0, matching Kit's ~1 req/s guidance for backfills -- nhl-sync.yml passes 3.0
  for the nightly/game-night runs). This is the reconciliation the spec calls for
  between Kit's "~1 req/s" and George's "~6 concurrent": concurrency bounds how many
  requests can be in flight at once, the token bucket bounds how often new ones start.
- Exponential backoff with jitter on 429/5xx, 5 tries, base 2s.
- Every payload is run through strip_payload() before it's returned or cached, as a
  safety net. The real guarantee against leaking a URL/logo/headshot/odds value into
  Supabase is that every writer (ingest_game.py etc.) only ever reads the explicit
  fields it stores -- this strip is defense in depth for the raw cache, not the only
  layer.
"""

from __future__ import annotations

import os
import random
import threading
import time
from typing import Any

import requests

USER_AGENT = "TheEdge-prototype/0.1 (+cgomerford@gmail.com)"

API_WEB = "https://api-web.nhle.com/v1"
API_STATS = "https://api.nhle.com/stats/rest/en"

MAX_CONCURRENT = 6
DEFAULT_REQS_PER_SEC = float(os.environ.get("NHL_REQS_PER_SEC", "1.0"))

# Key names stripped recursively from every payload, built from the fields actually
# seen on the five verified endpoints (schedule, boxscore, play-by-play, shiftcharts,
# right-rail, roster) on 4 Oct 2026. Not claimed to be exhaustive -- see the docstring.
_BLOCKED_KEYS = {
    "logo",
    "darkLogo",
    "headshot",
    "heroImage",
    "threeMinRecap",
    "threeMinRecapFr",
    "condensedGame",
    "gameCenterLink",
    "highlightClip",
    "highlightClipFr",
    "highlightClipSharingUrl",
    "highlightClipSharingUrlFr",
    "discreteClip",
    "discreteClipFr",
    "pptReplayUrl",
    "gameVideo",
    "gameReports",
    "oddsPartners",
}


def strip_payload(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: strip_payload(v) for k, v in obj.items() if k not in _BLOCKED_KEYS}
    if isinstance(obj, list):
        return [strip_payload(v) for v in obj]
    return obj


class _TokenBucket:
    """Caps the sustained request rate across every thread sharing this client."""

    def __init__(self, rate_per_sec: float) -> None:
        self._interval = 1.0 / rate_per_sec
        self._lock = threading.Lock()
        self._next_slot = time.monotonic()

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next_slot)
            self._next_slot = slot + self._interval
        delay = slot - now
        if delay > 0:
            time.sleep(delay)


class NHLApiError(RuntimeError):
    pass


class NHLClient:
    def __init__(
        self,
        reqs_per_sec: float = DEFAULT_REQS_PER_SEC,
        max_concurrent: int = MAX_CONCURRENT,
        timeout: float = 15.0,
    ) -> None:
        self._bucket = _TokenBucket(reqs_per_sec)
        self._semaphore = threading.Semaphore(max_concurrent)
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT})

    @staticmethod
    def _backoff_seconds(attempt: int) -> float:
        base = 2.0 * (2**attempt)
        return base + random.uniform(0, base * 0.25)

    def _get(self, url: str, params: dict | None = None) -> dict:
        last_error: Exception | None = None
        for attempt in range(5):
            self._bucket.wait()
            with self._semaphore:
                try:
                    resp = self._session.get(url, params=params, timeout=self._timeout)
                except requests.RequestException as exc:
                    last_error = exc
                    time.sleep(self._backoff_seconds(attempt))
                    continue
            if resp.status_code == 429 or resp.status_code >= 500:
                last_error = NHLApiError(f"{resp.status_code} from {url}")
                time.sleep(self._backoff_seconds(attempt))
                continue
            resp.raise_for_status()
            return strip_payload(resp.json())
        raise NHLApiError(f"GET {url} failed after 5 attempts") from last_error

    # -- one method per verified endpoint --

    def schedule(self, date: str) -> dict:
        """date = 'YYYY-MM-DD'."""
        return self._get(f"{API_WEB}/schedule/{date}")

    def boxscore(self, game_id: int) -> dict:
        return self._get(f"{API_WEB}/gamecenter/{game_id}/boxscore")

    def play_by_play(self, game_id: int) -> dict:
        return self._get(f"{API_WEB}/gamecenter/{game_id}/play-by-play")

    def shift_charts(self, game_id: int) -> dict:
        return self._get(f"{API_STATS}/shiftcharts", params={"cayenneExp": f"gameId={game_id}"})

    def time_on_ice(self, game_id: int) -> dict:
        """Validation-only reference. Never displayed. Can return {"data":[],"total":0}
        for some playoff games (confirmed live for game 2025030417) -- callers must
        treat an empty response as 'unchecked', not as zero skaters."""
        return self._get(
            f"{API_STATS}/skater/timeonice",
            params={"isAggregate": "false", "isGame": "true", "limit": 100, "cayenneExp": f"gameId={game_id}"},
        )

    def right_rail(self, game_id: int) -> dict:
        return self._get(f"{API_WEB}/gamecenter/{game_id}/right-rail")

    def roster(self, team_abbr: str, season: int) -> dict:
        return self._get(f"{API_WEB}/roster/{team_abbr}/{season}")
