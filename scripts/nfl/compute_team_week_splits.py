"""
scripts/nfl/compute_team_week_splits.py

Precomputes one row per (team, game) of play-by-play splits into nfl_team_week_splits,
so the NFL Scout Report / Preview / Postgame pages read a cached row instead of
touching play-by-play at render time (CLAUDE.md: precompute is the architecture).

TABLE OWNERSHIP: this script is the ONLY writer of BOTH nfl_team_week_splits and
nfl_team_form. Never add a second script that writes either. Schema for both:
scripts/sql/create_nfl_team_week_splits.sql

  nfl_team_week_splits  one row per (team, game): the raw per-game sums below.
  nfl_team_form         one row per (team, season): the same sums pre-rolled into
                        season / last-3 / last-5 windows (regular season only), so a page
                        can read all 32 clubs in ~30 KB instead of hundreds of game rows.

What is stored (counts and sums, NOT rates, so the app can roll up L3 / L5 / season
exactly by summing before it divides):
  off      -- the team's offense in that game
  def      -- what that team's DEFENSE allowed in that game (opponent offense vs them)
  ftn_off  -- FTN-charted tendencies of the offense (motion, play action, RPO, box faced)
  ftn_def  -- FTN-charted tendencies faced by the defense (blitz rate, motion faced ...)

Scrimmage-play filter follows the nflfastR convention: pass or rush, EPA present,
no QB kneel/spike, no two-point tries. Sacks are dropbacks but NOT pass attempts.

DELIBERATE EXCLUSION: spread_line / total_line / vegas_wp exist in load_pbp() and are
NOT read here, same brand decision as sync_schedule.py (no odds data in our DB).

NOT AVAILABLE for 2026: personnel groupings, defenders-in-box from participation and
pressure flags -- load_participation() stops at 2025 upstream. FTN's n_defense_box is
used for box counts instead, and pressure is left to nfl_pfr_advstats.

Run order: after sync_schedule.py / sync_team_stats.py, any time (idempotent upsert).
Cron: game-day Mon/Tue after the last game is loaded by nflverse (see workflow).
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time

import nflreadpy as nfl
import polars as pl
from dotenv import load_dotenv
from supabase import Client, create_client

# Dual dotenv fallback: local .env.local (walking up from this file) or exported env (GitHub Actions).
_here = os.path.dirname(os.path.abspath(__file__))
for _d in (os.getcwd(), _here, os.path.dirname(_here), os.path.dirname(os.path.dirname(_here))):
    _p = os.path.join(_d, ".env.local")
    if os.path.exists(_p):
        load_dotenv(_p)
        break

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

TEAM_ALIASES = {"LA": "LAR"}  # nflverse play-by-play uses LA for the Rams; nfl_teams uses LAR


def _clean(v):
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return round(v, 4)
    return v


def metric_exprs() -> list[pl.Expr]:
    """Every aggregate, named m_*. Applied per (game, team) for both offense and defense."""
    P = pl.col("pass").fill_null(0) == 1
    R = pl.col("rush").fill_null(0) == 1
    SK = pl.col("sack").fill_null(0) == 1
    DB = pl.col("qb_dropback").fill_null(0) == 1
    ATT = P & ~SK
    yds = pl.col("yards_gained").fill_null(0)
    epa = pl.col("epa")
    down = pl.col("down")

    def n(cond: pl.Expr) -> pl.Expr:
        return cond.cast(pl.Int64).sum()

    def e(cond: pl.Expr) -> pl.Expr:
        return pl.when(cond).then(epa).otherwise(0.0).sum()

    two_min = (pl.col("half_seconds_remaining").fill_null(9999) <= 120) & pl.col("qtr").is_in([2, 4])
    short_yd = down.is_in([3, 4]) & (pl.col("ydstogo") <= 2)
    return [
        pl.len().alias("m_plays"),
        epa.sum().alias("m_epa"),
        pl.col("success").fill_null(0).sum().alias("m_success_n"),
        n(DB).alias("m_dropbacks"),
        e(DB).alias("m_pass_epa"),
        n(ATT).alias("m_pass_att"),
        pl.when(ATT).then(yds).otherwise(0).sum().alias("m_pass_yds"),
        n(SK).alias("m_sacks"),
        n(R).alias("m_rushes"),
        e(R).alias("m_rush_epa"),
        pl.when(R).then(yds).otherwise(0).sum().alias("m_rush_yds"),
        n((ATT & (yds >= 20)) | (R & (yds >= 10))).alias("m_explosive_n"),
        n(ATT & (yds >= 20)).alias("m_explosive_pass_n"),
        n(R & (yds >= 10)).alias("m_explosive_rush_n"),
        n(R & (yds <= 0)).alias("m_stuff_n"),
        pl.col("interception").fill_null(0).sum().alias("m_ints"),
        pl.col("fumble_lost").fill_null(0).sum().alias("m_fumbles_lost"),
        n(down == 1).alias("m_d1_n"), e(down == 1).alias("m_d1_epa"),
        n(down == 2).alias("m_d2_n"), e(down == 2).alias("m_d2_epa"),
        n(down == 3).alias("m_d3_n"), e(down == 3).alias("m_d3_epa"),
        n(down.is_in([1, 2])).alias("m_early_n"),
        n(down.is_in([1, 2]) & R).alias("m_early_rush_n"),
        n(two_min).alias("m_two_min_n"), e(two_min).alias("m_two_min_epa"),
        n(short_yd).alias("m_short_yd_n"),
        pl.when(short_yd).then(pl.col("success").fill_null(0)).otherwise(0).sum().alias("m_short_yd_success_n"),
        n(down == 3).alias("m_third_n"),
        pl.col("third_down_converted").fill_null(0).sum().alias("m_third_conv_n"),
    ]


def ftn_exprs() -> list[pl.Expr]:
    """FTN-charted aggregates, computed only on plays that joined to an FTN row."""
    F = pl.col("_ftn") == 1
    DB = (pl.col("qb_dropback").fill_null(0) == 1) & F
    R = (pl.col("rush").fill_null(0) == 1) & F
    epa = pl.col("epa")
    mot, pa, rpo = pl.col("is_motion"), pl.col("is_play_action"), pl.col("is_rpo")
    blitz = pl.col("n_blitzers").fill_null(0) > 0
    box = pl.col("n_defense_box").fill_null(0)

    def n(cond: pl.Expr) -> pl.Expr:
        return cond.cast(pl.Int64).sum()

    def e(cond: pl.Expr) -> pl.Expr:
        return pl.when(cond).then(epa).otherwise(0.0).sum()

    return [
        n(F).alias("f_plays"),
        n(F & mot).alias("f_motion_n"), e(F & mot).alias("f_motion_epa"),
        n(F & ~mot).alias("f_nomotion_n"), e(F & ~mot).alias("f_nomotion_epa"),
        n(DB).alias("f_db_n"),
        n(DB & pa).alias("f_pa_n"), e(DB & pa).alias("f_pa_epa"),
        n(DB & ~pa).alias("f_nopa_n"), e(DB & ~pa).alias("f_nopa_epa"),
        n(F & rpo).alias("f_rpo_n"), e(F & rpo).alias("f_rpo_epa"),
        n(F & pl.col("is_screen_pass")).alias("f_screen_n"),
        n(F & pl.col("is_no_huddle")).alias("f_no_huddle_n"),
        n(DB & blitz).alias("f_blitz_n"), e(DB & blitz).alias("f_blitz_epa"),
        n(DB & ~blitz).alias("f_noblitz_n"), e(DB & ~blitz).alias("f_noblitz_epa"),
        n(R & (box > 0)).alias("f_box_n"),
        n(R & (box > 0) & (box <= 6)).alias("f_box_light_n"), e(R & (box > 0) & (box <= 6)).alias("f_box_light_epa"),
        n(R & (box == 7)).alias("f_box_7_n"), e(R & (box == 7)).alias("f_box_7_epa"),
        n(R & (box >= 8)).alias("f_box_stack_n"), e(R & (box >= 8)).alias("f_box_stack_epa"),
    ]


def rollup(df: pl.DataFrame, key: str, prefix: str) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for r in df.to_dicts():
        out[(r["game_id"], r[key])] = {k[len(prefix):]: _clean(v) for k, v in r.items() if k.startswith(prefix)}
    return out


def build_rows(season: int) -> list[dict]:
    print(f"Loading play-by-play for {season}...")
    pbp = nfl.load_pbp([season])
    if pbp.height == 0:
        print("  no plays yet, skipping.")
        return []

    plays = (
        pbp.filter(
            pl.col("season_type").is_in(["REG", "POST"])
            & pl.col("posteam").is_not_null()
            & pl.col("defteam").is_not_null()
            & pl.col("epa").is_not_null()
            & ((pl.col("pass").fill_null(0) == 1) | (pl.col("rush").fill_null(0) == 1))
            & ~pl.col("play_type").is_in(["qb_kneel", "qb_spike"])
            & (pl.col("two_point_attempt").fill_null(0) != 1)
        )
        .with_columns(
            pl.col("posteam").replace(TEAM_ALIASES),
            pl.col("defteam").replace(TEAM_ALIASES),
            pl.col("home_team").replace(TEAM_ALIASES),
        )
    )

    # FTN join. Both play_id columns are cast to Float64 (CLAUDE.md gotcha: mismatched dtypes silently drop the join).
    try:
        ftn = nfl.load_ftn_charting([season])
    except (ValueError, ConnectionError) as ex:
        print(f"  FTN charting unavailable for {season} ({type(ex).__name__}); ftn_* left empty.")
        ftn = None
    if ftn is not None and ftn.height > 0:
        ftn = ftn.select(
            pl.col("nflverse_game_id").alias("game_id"),
            pl.col("nflverse_play_id").cast(pl.Float64).alias("play_id"),
            pl.lit(1).alias("_ftn"),
            pl.col("is_motion").fill_null(False), pl.col("is_play_action").fill_null(False),
            pl.col("is_rpo").fill_null(False), pl.col("is_screen_pass").fill_null(False),
            pl.col("is_no_huddle").fill_null(False),
            pl.col("n_blitzers"), pl.col("n_defense_box"),
        ).unique(subset=["game_id", "play_id"])
        plays = plays.with_columns(pl.col("play_id").cast(pl.Float64)).join(ftn, on=["game_id", "play_id"], how="left")
        plays = plays.with_columns(
            pl.col("_ftn").fill_null(0),
            pl.col("is_motion").fill_null(False), pl.col("is_play_action").fill_null(False),
            pl.col("is_rpo").fill_null(False), pl.col("is_screen_pass").fill_null(False),
            pl.col("is_no_huddle").fill_null(False),
        )
        joined = plays.filter(pl.col("_ftn") == 1).height
        print(f"  {plays.height} scrimmage plays, {joined} matched to FTN charting ({joined / max(plays.height, 1):.0%}).")
    else:
        plays = plays.with_columns(
            pl.lit(0).alias("_ftn"), pl.lit(False).alias("is_motion"), pl.lit(False).alias("is_play_action"),
            pl.lit(False).alias("is_rpo"), pl.lit(False).alias("is_screen_pass"), pl.lit(False).alias("is_no_huddle"),
            pl.lit(None, dtype=pl.Float64).alias("n_blitzers"), pl.lit(None, dtype=pl.Float64).alias("n_defense_box"),
        )

    m, f = metric_exprs(), ftn_exprs()
    off = plays.group_by(["game_id", "posteam"]).agg(m)
    dfn = plays.group_by(["game_id", "defteam"]).agg(m)
    ftn_off = plays.group_by(["game_id", "posteam"]).agg(f)
    ftn_def = plays.group_by(["game_id", "defteam"]).agg(f)

    # Red-zone trips are drive-level: a drive is a trip if any scrimmage play started inside the opponent 20.
    drv_keys = ["game_id", "posteam", "defteam", "fixed_drive"]
    drv = plays.group_by(drv_keys).agg(
        (pl.col("yardline_100") <= 20).any().alias("rz"),
        pl.col("fixed_drive_result").first().alias("res"),
    ).with_columns((pl.col("rz") & (pl.col("res") == "Touchdown")).alias("rz_td"))
    rz_off = drv.group_by(["game_id", "posteam"]).agg(pl.col("rz").cast(pl.Int64).sum().alias("m_rz_trips"), pl.col("rz_td").cast(pl.Int64).sum().alias("m_rz_td"))
    rz_def = drv.group_by(["game_id", "defteam"]).agg(pl.col("rz").cast(pl.Int64).sum().alias("m_rz_trips"), pl.col("rz_td").cast(pl.Int64).sum().alias("m_rz_td"))

    off_d, def_d = rollup(off, "posteam", "m_"), rollup(dfn, "defteam", "m_")
    for (gid, tm), v in rollup(rz_off, "posteam", "m_").items():
        off_d.setdefault((gid, tm), {}).update(v)
    for (gid, tm), v in rollup(rz_def, "defteam", "m_").items():
        def_d.setdefault((gid, tm), {}).update(v)
    fo_d, fd_d = rollup(ftn_off, "posteam", "f_"), rollup(ftn_def, "defteam", "f_")

    meta = (
        plays.group_by(["game_id", "posteam"])
        .agg(pl.col("defteam").first().alias("opp"), pl.col("week").first(), pl.col("season_type").first(), pl.col("home_team").first())
        .to_dicts()
    )
    rows: list[dict] = []
    for r in meta:
        gid, tm = r["game_id"], r["posteam"]
        rows.append(
            {
                "team_id": tm, "season": season, "week": int(r["week"]), "season_type": r["season_type"],
                "game_id": gid, "opponent_id": r["opp"], "is_home": r["home_team"] == tm,
                "off": off_d.get((gid, tm)), "def": def_d.get((gid, tm)),
                "ftn_off": fo_d.get((gid, tm)), "ftn_def": fd_d.get((gid, tm)),
            }
        )
    return rows


def sum_dicts(ds: list[dict | None]) -> dict:
    out: dict = {}
    for d in ds:
        for k, v in (d or {}).items():
            if isinstance(v, (int, float)) and v is not None:
                out[k] = round(out.get(k, 0) + v, 4)
    return out


def window(rs: list[dict]) -> dict:
    return {
        "games": len(rs),
        "off": sum_dicts([r["off"] for r in rs]), "def": sum_dicts([r["def"] for r in rs]),
        "ftn_off": sum_dicts([r["ftn_off"] for r in rs]), "ftn_def": sum_dicts([r["ftn_def"] for r in rs]),
    }


def build_form(rows: list[dict]) -> list[dict]:
    """Regular-season windows per (team, season). Sums, not rates: the app divides after blending."""
    by: dict[tuple[str, int], list[dict]] = {}
    for r in rows:
        if r["season_type"] == "REG":
            by.setdefault((r["team_id"], r["season"]), []).append(r)
    out = []
    for (team, season), rs in by.items():
        rs.sort(key=lambda r: r["week"])
        out.append(
            {"team_id": team, "season": season, "through_week": rs[-1]["week"], "games": len(rs),
             "season_sum": window(rs), "l3": window(rs[-3:]), "l5": window(rs[-5:])}
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", type=int, nargs="+", default=[2025, 2026])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)

    rows: list[dict] = []
    for s in args.seasons:
        rows.extend(build_rows(s))

    form = build_form(rows)
    print(f"\nBuilt {len(rows)} team-game rows and {len(form)} team-season form rows.\n=== SANITY CHECK: first 5 rows ===")
    for r in rows[:5]:
        o = r["off"] or {}
        print(f"  {r['season']} wk{r['week']} {r['team_id']} vs {r['opponent_id']} {'H' if r['is_home'] else 'A'}: "
              f"{o.get('plays')} plays, epa/play {(o.get('epa') or 0) / max(o.get('plays') or 1, 1):+.3f}, "
              f"rz {o.get('rz_td')}/{o.get('rz_trips')}, ftn plays {(r['ftn_off'] or {}).get('plays')}")
    print("  form sample:", [(f["team_id"], f["season"], f["games"], f["l3"]["games"]) for f in form[:5]])
    if len(rows) < 30:
        print(f"WARNING: only {len(rows)} rows (normal early in a season; a full 2025 alone is ~570).")
    if args.dry_run:
        print("--dry-run: nothing written.")
        return

    print(f"\nAbout to upsert {len(rows)} rows into nfl_team_week_splits and {len(form)} into nfl_team_form. Ctrl+C within 5 seconds to abort...")
    time.sleep(5)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    for i in range(0, len(rows), 100):
        batch = rows[i : i + 100]
        supabase.table("nfl_team_week_splits").upsert(batch, on_conflict="team_id,season,week", returning="minimal").execute()
        print(f"  Upserted batch {i // 100 + 1}: {len(batch)} rows")
    for i in range(0, len(form), 50):
        batch = form[i : i + 50]
        supabase.table("nfl_team_form").upsert(batch, on_conflict="team_id,season", returning="minimal").execute()
        print(f"  Upserted form batch {i // 50 + 1}: {len(batch)} rows")
    print(f"\nDone. Upserted {len(rows)} rows into nfl_team_week_splits and {len(form)} into nfl_team_form.")


if __name__ == "__main__":
    main()
