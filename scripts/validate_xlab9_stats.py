#!/usr/bin/env python3
"""
validate_xlab9_stats.py  --  x9Lab (xlab9.com) metric validation pipeline
=========================================================================
Suites validated on a $0 public-data stack (pybaseball Statcast + leaderboards):

  MODULE 1  BCAA (Bases Converted Above Average) and cnRBI (Context-Neutral RBI)
  MODULE 2  DCR (Dynamic Catch Radius, outfield) and ISV (Infield Seam Vulnerability)
  MODULE 3  run_validation_suite(): split-half reliability, holdout Brier/AUC,
            runner-speed independence, "eye test" leaderboards.

Product rules enforced everywhere:
  * plain units (bases, runs, feet, sq ft, degrees)
  * every row carries n and is_qualified (n>=30 standard, n>=15 situational)
  * every metric carries the raw value AND a *_vs_league_avg delta

Usage:
  python validate_xlab9_stats.py --start 2026-05-01 --end 2026-05-31
  python validate_xlab9_stats.py --seasons 2024 2026
"""
from __future__ import annotations

import argparse
import os
import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import stats
from scipy.interpolate import RegularGridInterpolator
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, mean_squared_error, r2_score, roc_auc_score
from sklearn.model_selection import cross_val_predict, train_test_split

warnings.filterwarnings("ignore")

# ----------------------------------------------------------------------------
# CONSTANTS / LOCKED ASSUMPTIONS
# ----------------------------------------------------------------------------
HOME_X, HOME_Y = 125.42, 198.27          # Statcast home-plate pixel coordinates
LEAGUE_SPRINT = 27.0                     # ft/s, MLB-average sprint speed (Statcast unit)
MIN_N_STANDARD = 30
MIN_N_SITUATIONAL = 15
EXCHANGE_T = 0.68                        # s, glove-to-hand exchange
MPH_TO_FPS = 1.467
INFIELD_ARC_FT = 145.0
SEED = 7

K_EVENTS = {"strikeout", "strikeout_double_play"}
BB_EVENTS = {"walk", "intent_walk", "hit_by_pitch", "catcher_interf"}
DP_EVENTS = {"grounded_into_double_play", "double_play", "sac_fly_double_play",
             "sac_bunt_double_play"}
HIT_EVENTS_NO_HR = {"single", "double", "triple"}
OUT_EVENTS = {"field_out", "force_out", "sac_fly", "sac_bunt", "fielders_choice_out",
              "grounded_into_double_play", "double_play", "sac_fly_double_play",
              "sac_bunt_double_play"}

POS_NAME = {3: "1B", 4: "2B", 5: "3B", 6: "SS", 7: "LF", 8: "CF", 9: "RF"}
# standard-depth fielder starting spots (ft; home=origin, +y toward CF, +x toward RF)
OF_POS = {7: (-105.0, 270.0), 8: (0.0, 312.0), 9: (105.0, 270.0)}
INF_POS = {3: (56.0, 76.0), 4: (26.0, 106.0), 5: (-58.0, 80.0), 6: (-28.0, 106.0)}
FIRST_BAG = (63.64, 63.64)
ARM_DEFAULT_MPH = {3: 70.0, 4: 76.0, 5: 84.0, 6: 84.0}   # no public per-player IF arm feed

OF_BUCKETS = {            # name: (LA_lo, LA_hi, EV_min)  -- hi exclusive except High_Fly (<=45)
    "Low_Liner": (10, 20, 90),
    "Gap_Drive": (20, 30, 85),
    "High_Fly": (30, 45, 80),
}
CORRIDORS = {             # name: (lo_deg, hi_deg)
    "3B_Line": (-45, -35), "Hole_5_5": (-28, -18), "Up_Middle": (-6, 6),
    "Hole_3_5": (18, 28), "1B_Line": (35, 45),
}


@dataclass
class Config:
    start: str = "2026-05-01"
    end: str = "2026-05-31"
    cache_dir: str = "x9lab_cache"
    out_dir: str = "x9lab_output"
    arm_csv: str | None = None            # optional CSV: player_id, arm_mph (infield)
    seed: int = SEED


NEEDED_COLS = [
    "game_pk", "game_date", "game_year", "game_type", "at_bat_number", "pitch_number",
    "batter", "stand", "type", "events", "description", "bb_type", "hc_x", "hc_y",
    "launch_speed", "launch_angle", "hit_distance_sc", "hit_location",
    "on_1b", "on_2b", "on_3b", "outs_when_up", "inning", "inning_topbot",
    "home_team", "away_team", "bat_score", "post_bat_score",
] + [f"fielder_{i}" for i in range(2, 10)]


# ----------------------------------------------------------------------------
# DATA LOADING (CSV cached -> Statcast is pulled once)
# ----------------------------------------------------------------------------
def _cpath(cfg: Config, name: str) -> str:
    os.makedirs(cfg.cache_dir, exist_ok=True)
    return os.path.join(cfg.cache_dir, name)


def load_statcast(cfg: Config) -> pd.DataFrame:
    path = _cpath(cfg, f"statcast_{cfg.start}_{cfg.end}.csv")
    if os.path.exists(path):
        print(f"[cache] reading {path}")
        df = pd.read_csv(path, low_memory=False)
    else:
        from pybaseball import cache as pb_cache, statcast
        pb_cache.enable()
        print(f"[pull ] Statcast {cfg.start} -> {cfg.end} (one-time; slow for full seasons)")
        df = statcast(start_dt=cfg.start, end_dt=cfg.end, verbose=False)
        if "game_year" not in df.columns:
            df["game_year"] = pd.to_datetime(df["game_date"]).dt.year
        df = df[[c for c in NEEDED_COLS if c in df.columns]]
        df.to_csv(path, index=False)
    if "game_year" not in df.columns:
        df["game_year"] = pd.to_datetime(df["game_date"]).dt.year
    for c in NEEDED_COLS:
        if c not in df.columns:
            df[c] = np.nan
    df = df[df["game_type"] == "R"].copy()
    print(f"[data ] {len(df):,} regular-season pitches, {df['game_pk'].nunique():,} games")
    return df


@dataclass
class Leaderboards:
    sprint: pd.DataFrame = field(default_factory=pd.DataFrame)   # game_year, player_id, sprint_speed
    jump: pd.DataFrame = field(default_factory=pd.DataFrame)     # game_year, player_id, jump_bonus_ft
    oaa: pd.DataFrame = field(default_factory=pd.DataFrame)      # game_year, player_id, pos, oaa_pct
    arm: pd.DataFrame = field(default_factory=pd.DataFrame)      # player_id, arm_mph
    catch_prob: pd.DataFrame = field(default_factory=pd.DataFrame)
    names: dict = field(default_factory=dict)


def _cached_lb(cfg, name, year, fn):
    path = _cpath(cfg, f"lb_{name}_{year}.csv")
    if os.path.exists(path):
        return pd.read_csv(path)
    try:
        df = fn()
        df.to_csv(path, index=False)
        return df
    except Exception as e:  # network / schema problems must never kill the run
        print(f"[warn ] leaderboard '{name}' {year} unavailable ({type(e).__name__}); using defaults")
        return pd.DataFrame()


def _names_from(df: pd.DataFrame) -> dict:
    if df.empty or "player_id" not in df.columns:
        return {}
    if {"first_name", "last_name"} <= set(df.columns):
        nm = (df["first_name"].astype(str) + " " + df["last_name"].astype(str)).str.strip()
    else:
        col = next((c for c in df.columns if "name" in c.lower()), None)
        if col is None:
            return {}
        nm = df[col].astype(str).map(lambda s: " ".join(reversed([p.strip() for p in s.split(",")])))
    return dict(zip(df["player_id"].astype(int), nm))


def load_leaderboards(cfg: Config, years) -> Leaderboards:
    lb = Leaderboards()
    sp, jm, oa, cp = [], [], [], []
    for y in sorted(set(int(v) for v in years)):
        try:
            import pybaseball as pb
        except Exception:
            pb = None
        if pb is not None:
            s = _cached_lb(cfg, "sprint", y, lambda: pb.statcast_sprint_speed(y, min_opp=10))
            if not s.empty and {"player_id", "sprint_speed"} <= set(s.columns):
                lb.names.update(_names_from(s))
                sp.append(s[["player_id", "sprint_speed"]].assign(game_year=y))
            j = _cached_lb(cfg, "jump", y, lambda: pb.statcast_outfielder_jump(y, min_att=10))
            if not j.empty and "player_id" in j.columns:
                cols = [c for c in j.columns if any(k in c.lower() for k in ("reaction", "burst", "route"))
                        and "rel_league" in c.lower()]
                print(f"[info ] {y} jump columns summed as ft vs league: {cols}")
                if cols:
                    jm.append(pd.DataFrame({"player_id": j["player_id"],
                                            "jump_bonus_ft": j[cols].sum(axis=1),
                                            "game_year": y}))
            for p in (3, 4, 5, 6):
                o = _cached_lb(cfg, f"oaa{p}", y,
                               lambda p=p: pb.statcast_outs_above_average(y, p, min_att=1))
                if not o.empty and {"player_id", "outs_above_average"} <= set(o.columns):
                    oa.append(pd.DataFrame({"player_id": o["player_id"], "pos": p, "game_year": y,
                                            "oaa_pct": o["outs_above_average"].rank(pct=True)}))
            c = _cached_lb(cfg, "catchprob", y, lambda: pb.statcast_outfield_catch_probability(y, min_opp=5))
            if not c.empty:
                cp.append(c.assign(game_year=y))
    lb.sprint = pd.concat(sp) if sp else pd.DataFrame(columns=["game_year", "player_id", "sprint_speed"])
    lb.jump = pd.concat(jm) if jm else pd.DataFrame(columns=["game_year", "player_id", "jump_bonus_ft"])
    lb.oaa = pd.concat(oa) if oa else pd.DataFrame(columns=["game_year", "player_id", "pos", "oaa_pct"])
    lb.catch_prob = pd.concat(cp) if cp else pd.DataFrame()
    if cfg.arm_csv and os.path.exists(cfg.arm_csv):
        lb.arm = pd.read_csv(cfg.arm_csv)[["player_id", "arm_mph"]]
    else:
        lb.arm = pd.DataFrame(columns=["player_id", "arm_mph"])
    return lb


def lookup_names(cfg: Config, ids, lb: Leaderboards) -> dict:
    names = dict(lb.names)
    ids = [int(i) for i in pd.unique(pd.Series(ids).dropna())]
    missing = [i for i in ids if i not in names]
    path = _cpath(cfg, "names.csv")
    known = {}
    if os.path.exists(path):
        c = pd.read_csv(path)
        known = dict(zip(c["id"].astype(int), c["name"]))
    still = [i for i in missing if i not in known]
    if still:
        try:
            from pybaseball import playerid_reverse_lookup
            r = playerid_reverse_lookup(still, key_type="mlbam")
            for row in r.itertuples():
                known[int(row.key_mlbam)] = f"{str(row.name_first).title()} {str(row.name_last).title()}"
            pd.DataFrame({"id": list(known), "name": list(known.values())}).to_csv(path, index=False)
        except Exception as e:
            print(f"[warn ] name lookup unavailable ({type(e).__name__}); showing MLBAM ids")
    names.update({k: v for k, v in known.items() if k in missing})
    return names


# ----------------------------------------------------------------------------
# SHARED HELPERS
# ----------------------------------------------------------------------------
def spray_angles(hc_x, hc_y, stand):
    """arctan((hc_x-125.42)/(198.27-hc_y)) in degrees. +deg = right side of field."""
    dx = np.asarray(hc_x, float) - HOME_X
    dy = HOME_Y - np.asarray(hc_y, float)
    spray = np.degrees(np.arctan2(dx, dy))        # == arctan(dx/dy) whenever dy > 0
    sit = spray                                    # situational right-side angle
    pull = np.where(np.asarray(stand) == "L", spray, -spray)   # +deg = pull side for both
    return spray, sit, pull


def pick_fielder(df: pd.DataFrame, loc_col: str = "hit_location") -> np.ndarray:
    out = np.full(len(df), np.nan)
    loc = df[loc_col].to_numpy(float)
    for p in range(2, 10):
        m = loc == p
        if m.any():
            out[m] = df.loc[m, f"fielder_{p}"].to_numpy(float)
    return out


def attach_sprint(df, lb, id_col, out_col):
    if lb.sprint.empty:
        df[out_col] = np.nan
        return df
    s = lb.sprint.rename(columns={"player_id": id_col, "sprint_speed": out_col})
    s[id_col] = s[id_col].astype(float)
    return df.drop(columns=[out_col], errors="ignore").merge(
        s[["game_year", id_col, out_col]], on=["game_year", id_col], how="left")


def finalize(df, n_col, thresh, rate_cols=(), total_cols=()):
    """Add is_qualified and *_vs_league_avg deltas (league rate = pooled over ALL rows)."""
    df = df.copy()
    df["is_qualified"] = df[n_col] >= thresh
    for c in rate_cols:      # already a per-row/per-100 rate -> pooled mean weighted by n
        lg = np.average(df[c].fillna(0), weights=df[n_col].clip(lower=1))
        df[f"{c}_vs_league_avg"] = df[c] - lg
    for c in total_cols:     # totals -> compare to what league-rate would have produced at same n
        lg_rate = df[c].sum() / max(df[n_col].sum(), 1)
        df[f"{c}_vs_league_avg"] = df[c] - lg_rate * df[n_col]
    return df


def md_table(df: pd.DataFrame, cols, fmt=2) -> str:
    def f(v):
        if isinstance(v, (float, np.floating)):
            return f"{v:.{fmt}f}" if np.isfinite(v) else "n/a"
        return str(v)
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    out += ["| " + " | ".join(f(v) for v in r) + " |" for r in df[cols].itertuples(index=False)]
    return "\n".join(out)


# ----------------------------------------------------------------------------
# MODULE 1 -- PLATE APPEARANCE TABLE, GHOST RUNNERS, BASE ADVANCEMENT
# ----------------------------------------------------------------------------
KEYS = ["game_pk", "at_bat_number"]


def build_pa_table(sc: pd.DataFrame) -> pd.DataFrame:
    sc = sc.sort_values(KEYS + ["pitch_number"]).reset_index(drop=True)
    first = sc.groupby(KEYS, sort=False).head(1).set_index(KEYS)
    last = sc.groupby(KEYS, sort=False).tail(1).set_index(KEYS)
    pa = pd.DataFrame(index=last.index)
    for c in ["game_date", "game_year", "batter", "stand", "events", "bb_type", "hc_x", "hc_y",
              "launch_speed", "launch_angle", "hit_distance_sc", "hit_location", "inning",
              "inning_topbot", "home_team", "away_team"] + [f"fielder_{i}" for i in range(2, 10)]:
        pa[c] = last[c]
    pa["outs_last"] = last["outs_when_up"]
    pa["outs_first"] = first["outs_when_up"].reindex(pa.index)
    for b in (1, 2, 3):
        pa[f"t{b}"] = last[f"on_{b}b"]                           # runners at the terminal pitch
        pa[f"i{b}"] = first[f"on_{b}b"].reindex(pa.index)        # runners on Pitch 1 (ghost-restored)
    pa["runs_on_play"] = (last["post_bat_score"] - last["bat_score"]).clip(lower=0)
    pa["runs_mid_ab"] = (last["bat_score"] - first["bat_score"].reindex(pa.index)).clip(lower=0)
    pa = pa.reset_index()

    bit = lambda s: s.notna().to_numpy().astype(int)
    pa["init_code"] = bit(pa.i1) + 2 * bit(pa.i2) + 4 * bit(pa.i3)
    pa["term_code"] = bit(pa.t1) + 2 * bit(pa.t2) + 4 * bit(pa.t3)
    pa["init_base_state"] = bit(pa.i1).astype(str) + bit(pa.i2).astype(str) + bit(pa.i3).astype(str)
    pa["term_base_state"] = bit(pa.t1).astype(str) + bit(pa.t2).astype(str) + bit(pa.t3).astype(str)

    # --- ghost runner: init runners absent at terminal pitch beyond those who scored mid-AB
    n_init = bit(pa.i1) + bit(pa.i2) + bit(pa.i3)
    surv = np.zeros(len(pa), int)
    for b in (1, 2, 3):
        r = pa[f"i{b}"].to_numpy(float)
        present = ~np.isnan(r)
        in_term = (r == pa.t1.to_numpy(float)) | (r == pa.t2.to_numpy(float)) | (r == pa.t3.to_numpy(float))
        surv += (present & in_term).astype(int)
    pa["n_erased_mid_ab"] = np.maximum(0, n_init - surv - pa["runs_mid_ab"].to_numpy())
    pa["runner_erased_mid_ab"] = pa["n_erased_mid_ab"] > 0

    # --- classify PA outcome
    ev = pa["events"].fillna("")
    incomplete = ev.str.contains("caught_stealing|pickoff|other_out|stolen_base") | (ev == "")
    pa["pa_type"] = np.select(
        [incomplete, ev.isin(K_EVENTS), ev.isin(BB_EVENTS)], ["INCOMPLETE", "K", "BB"], "BIP")
    pa["is_dp"] = ev.isin(DP_EVENTS).astype(int)
    pa["is_field_error"] = (ev == "field_error")

    # --- next PA's Pitch-1 base state (same half-inning) = post-play state
    grp = pa.groupby(["game_pk", "inning", "inning_topbot"], sort=False)
    for b in (1, 2, 3):
        pa[f"n{b}"] = grp[f"i{b}"].shift(-1)

    adv, runner_runs = _bases_advanced(pa)
    pa["bases_advanced"] = adv
    pa["runner_runs"] = runner_runs
    pa["bases_converted"] = adv - pa["is_dp"]            # GIDP = -1 base converted
    # runner-driven RBI (batter's own HR run excluded; K/DP/error = 0)
    bip_rbi = np.where((pa.pa_type == "BIP") & (pa.is_dp == 0) & (~pa.is_field_error), runner_runs, 0)
    bb_rbi = np.where((pa.pa_type == "BB") & (pa.term_code == 7), 1, 0)
    pa["rbi_runner"] = np.where(pa.pa_type == "BIP", bip_rbi, np.where(pa.pa_type == "BB", bb_rbi, 0))

    pa["spray_angle_deg"], pa["sit_spray_angle"], pa["pull_spray_angle"] = spray_angles(
        pa.hc_x, pa.hc_y, pa.stand)
    # lead runner (most advanced) at the terminal pitch
    t1, t2, t3 = (pa[f"t{b}"].to_numpy(float) for b in (1, 2, 3))
    pa["lead_runner_id"] = np.where(~np.isnan(t3), t3, np.where(~np.isnan(t2), t2, t1))
    pa["defense_team"] = np.where(pa.inning_topbot == "Top", pa.home_team, pa.away_team)
    return pa


def _bases_advanced(pa: pd.DataFrame):
    runner_runs = (pa["runs_on_play"] - (pa["events"] == "home_run").astype(int)).clip(lower=0).to_numpy()
    adv = np.zeros(len(pa))
    remaining = runner_runs.copy()
    missing = {}
    for b in (1, 2, 3):
        r = pa[f"t{b}"].to_numpy(float)
        present = ~np.isnan(r)
        newb = np.zeros(len(pa))
        for nb in (1, 2, 3):
            newb = np.where(present & (r == pa[f"n{nb}"].to_numpy(float)), nb, newb)
        adv += np.where(present & (newb > 0), newb - b, 0)
        missing[b] = present & (newb == 0)        # scored OR retired
    for b in (3, 2, 1):                           # lead-most missing runners are the ones who scored
        m = missing[b] & (remaining > 0)
        adv += np.where(m, 4 - b, 0)
        remaining = remaining - m.astype(int)
    return adv, runner_runs


def forced_adv(code):
    b1, b2, b3 = (code & 1), (code >> 1) & 1, (code >> 2) & 1
    return b1 + (b1 & b2) + (b1 & b2 & b3)


FEATS = ["launch_speed", "launch_angle", "spray_angle_deg", "outs_when_up",
         "term_base_state", "lead_runner_sprint_speed"]


def _X(ev, la, sp, outs, code, speed):
    return np.column_stack([ev, la, sp, outs, code, speed]).astype(float)


def _hgb_reg():
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05, max_depth=4,
                                         min_samples_leaf=20, random_state=SEED)


def _hgb_clf(depth=4, it=200):
    return HistGradientBoostingClassifier(max_iter=it, learning_rate=0.05, max_depth=depth,
                                          min_samples_leaf=20, random_state=SEED)


def prepare_offense(pa: pd.DataFrame, lb: Leaderboards) -> pd.DataFrame:
    pa = attach_sprint(pa.copy(), lb, "lead_runner_id", "lead_runner_sprint_speed")
    pa["lead_speed_filled"] = pa["lead_runner_sprint_speed"].fillna(LEAGUE_SPRINT)
    return pa


def training_rows(pa):
    return pa[(pa.pa_type == "BIP") & (pa.term_code > 0) & (~pa.is_field_error)]


def fit_offense_models(train: pd.DataFrame):
    X = _X(train.launch_speed, train.launch_angle, train.spray_angle_deg, train.outs_last,
           train.term_code, train.lead_speed_filled)
    m_bc = _hgb_reg().fit(X, train["bases_converted"].to_numpy(float))
    m_rbi = _hgb_reg().fit(X, train["rbi_runner"].to_numpy(float))
    return m_bc, m_rbi


def score_offense(pa: pd.DataFrame, models) -> pd.DataFrame:
    """Per-PA counterfactuals for every plate appearance with runners on at Pitch 1."""
    m_bc, m_rbi = models
    o = pa[(pa.pa_type != "INCOMPLETE") & (pa.init_code > 0)].copy()
    erased = o.runner_erased_mid_ab.to_numpy()
    o["eff_code"] = np.where(erased, o.init_code, o.term_code)       # restore ghost runners
    o["eff_outs"] = np.where(erased, o.outs_first, o.outs_last)
    bip = (o.pa_type == "BIP").to_numpy()
    bb = (o.pa_type == "BB").to_numpy()
    kk = (o.pa_type == "K").to_numpy()

    def pred(model, code, outs, speed):
        X = _X(o.launch_speed, o.launch_angle, o.spray_angle_deg, outs, code, speed)
        return np.where(np.asarray(code) > 0, model.predict(X), 0.0)

    neutral = np.full(len(o), LEAGUE_SPRINT)
    # Fielding errors: model uses true contact quality (EV/LA/spray), not the defender's miscue.
    xbc_restored = pred(m_bc, o.eff_code, o.eff_outs, neutral)
    xrbi_restored = pred(m_rbi, o.eff_code, o.eff_outs, neutral)
    xrbi_term_neutral = pred(m_rbi, o.term_code, o.outs_last, neutral)
    xrbi_term_actual = pred(m_rbi, o.term_code, o.outs_last, o.lead_speed_filled)

    forced_eff = forced_adv(o.eff_code.to_numpy())
    forced_term = forced_adv(o.term_code.to_numpy())
    o["xBC_Neutral"] = np.where(bip, xbc_restored, np.where(bb, forced_eff, 0.0))   # K -> 0
    o["cnRBI"] = np.where(bip, xrbi_restored, np.where(bb, (o.eff_code == 7).astype(float), 0.0))
    # Strikeout after mid-AB CS/PO: soRBI = 0.0 by rule (kk rows are 0 above and below)
    o["Actual_RBI"] = o["rbi_runner"].astype(float)
    o["Robbed_RBI_CS_PO"] = np.where(erased & bip, xrbi_restored - xrbi_term_neutral,
                         np.where(erased & bb, (o.init_code == 7).astype(float) - (o.term_code == 7), 0.0))
    o.loc[kk, "Robbed_RBI_CS_PO"] = 0.0
    o["Robbed_RBI_Runner_Speed"] = np.where(bip, xrbi_term_neutral - xrbi_term_actual, 0.0)

    # batter-owned actual bases converted (K=0; BB=forced; BIP=advanced - DP) for the baseline
    o["bc_actual_batter"] = np.where(bip, o.bases_converted, np.where(bb, forced_term, 0.0))
    base = o[~o.runner_erased_mid_ab].groupby(["eff_code", "eff_outs"])["bc_actual_batter"].mean()
    o["League_Avg_BC_For_State"] = [base.get((c, u), np.nan) for c, u in zip(o.eff_code, o.eff_outs)]
    o["League_Avg_BC_For_State"] = o["League_Avg_BC_For_State"].fillna(o["bc_actual_batter"].mean())
    o["BCAA"] = o["xBC_Neutral"] - o["League_Avg_BC_For_State"]
    return o


def offense_player_table(o: pd.DataFrame, names: dict) -> pd.DataFrame:
    cols = ["Actual_RBI", "cnRBI", "BCAA", "Robbed_RBI_CS_PO", "Robbed_RBI_Runner_Speed"]
    g = o.groupby(["batter", "game_year"])
    t = g[cols].sum()
    t["n_opp"] = g.size()
    t = t.reset_index()
    for c in cols:
        t[f"{c}_per100"] = t[c] / t["n_opp"] * 100
    t["Robbed_RBI_total"] = t["Robbed_RBI_CS_PO"] + t["Robbed_RBI_Runner_Speed"]
    t = finalize(t, "n_opp", MIN_N_SITUATIONAL,
                 rate_cols=[f"{c}_per100" for c in cols], total_cols=cols + ["Robbed_RBI_total"])
    t.insert(0, "player", t["batter"].map(lambda i: names.get(int(i), str(int(i)))))
    return t.sort_values("BCAA", ascending=False)


# ----------------------------------------------------------------------------
# MODULE 2 -- BATTED BALL TABLE, OUTFIELD DCR, INFIELD ISV
# ----------------------------------------------------------------------------
def _build_flight_tables():
    """Drag-adjusted flight (Euler, quadratic drag) -> hang time (s) and range (ft) grids."""
    evs, las = np.arange(60, 121, 1.0), np.arange(5, 61, 1.0)
    EV, LA = np.meshgrid(evs, las, indexing="ij")
    v0, th = EV * 0.44704, np.radians(LA)
    vx, vy = v0 * np.cos(th), v0 * np.sin(th)
    x, y, t = np.zeros_like(v0), np.full_like(v0, 1.0), np.zeros_like(v0)
    T, R = np.full(v0.shape, np.nan), np.full(v0.shape, np.nan)
    landed = np.zeros(v0.shape, bool)
    k, g, dt = 0.0045, 9.81, 0.005
    for _ in range(int(12 / dt)):
        v = np.hypot(vx, vy)
        vx = vx - k * v * vx * dt
        vy = vy - (g + k * v * vy) * dt
        x, y, t = x + vx * dt, y + vy * dt, t + dt
        new = (~landed) & (y <= 0.8) & (vy < 0)
        T[new], R[new] = t[new], x[new] * 3.28084
        landed |= new
        if landed.all():
            break
    return (RegularGridInterpolator((evs, las), T, bounds_error=False, fill_value=None),
            RegularGridInterpolator((evs, las), R, bounds_error=False, fill_value=None))


_HANG, _RANGE = _build_flight_tables()


def hang_time(ev, la):
    ev, la = np.clip(np.asarray(ev, float), 60, 120), np.clip(np.asarray(la, float), 5, 60)
    return _HANG(np.column_stack([ev, la]))


def flight_range_ft(ev, la):
    ev, la = np.clip(np.asarray(ev, float), 60, 120), np.clip(np.asarray(la, float), 5, 60)
    return _RANGE(np.column_stack([ev, la]))


def build_batted_balls(sc: pd.DataFrame, lb: Leaderboards) -> pd.DataFrame:
    bb = sc[(sc["type"] == "X") & sc["launch_speed"].notna() & sc["launch_angle"].notna()
            & sc["hc_x"].notna() & sc["hit_location"].notna()].copy()
    bb["spray_angle_deg"], bb["sit_spray_angle"], bb["pull_spray_angle"] = spray_angles(
        bb.hc_x, bb.hc_y, bb.stand)
    bb["defense_team"] = np.where(bb.inning_topbot == "Top", bb.home_team, bb.away_team)
    bb["fielder_id"] = pick_fielder(bb)
    bb["batter"] = bb["batter"].astype(float)
    bb = attach_sprint(bb, lb, "batter", "batter_sprint")
    bb["batter_sprint_f"] = bb["batter_sprint"].fillna(LEAGUE_SPRINT)
    bb["runner_on_1b"] = bb["on_1b"].notna()
    bb["bases_empty"] = bb[["on_1b", "on_2b", "on_3b"]].isna().all(axis=1)
    bb["result_out"] = bb["events"].isin(OUT_EVENTS)
    bb["result_hit"] = bb["events"].isin(HIT_EVENTS_NO_HR)
    return bb


# ---------------- Outfield: Dynamic Catch Radius ----------------
def _run_dist_ft(T, sprint_fps):
    """Feet a fielder can cover in hang time T: 0.80 s reaction + 0.9 s acceleration, 92% route efficiency."""
    return 0.92 * sprint_fps * np.maximum(T - 0.80 - 0.90, 0.0)


def outfield_dcr(bb: pd.DataFrame, lb: Leaderboards, names: dict):
    of = bb[bb.hit_location.isin([7, 8, 9]) & (bb.launch_angle >= 10)
            & (bb.result_out | bb.result_hit)].copy()
    la, ev = of.launch_angle, of.launch_speed
    of["bucket"] = np.select(
        [(la >= 10) & (la < 20) & (ev >= 90), (la >= 20) & (la < 30) & (ev >= 85),
         (la >= 30) & (la <= 45) & (ev >= 80)], list(OF_BUCKETS), default="")
    of = of[of.bucket != ""].copy()
    of["caught"] = of.result_out.astype(int)
    of = attach_sprint(of, lb, "fielder_id", "of_sprint")
    of["of_sprint_f"] = of["of_sprint"].fillna(LEAGUE_SPRINT)
    if not lb.jump.empty:
        j = lb.jump.rename(columns={"player_id": "fielder_id"})
        j["fielder_id"] = j["fielder_id"].astype(float)
        of = of.merge(j[["game_year", "fielder_id", "jump_bonus_ft"]], on=["game_year", "fielder_id"], how="left")
    else:
        of["jump_bonus_ft"] = np.nan
    of["jump_f"] = of["jump_bonus_ft"].fillna(0.0)
    of["T_hang"] = hang_time(of.launch_speed, of.launch_angle)
    d = np.where(of.hit_distance_sc.notna(), of.hit_distance_sc, flight_range_ft(of.launch_speed, of.launch_angle))
    th = np.radians(of.spray_angle_deg)
    lx, ly = d * np.sin(th), d * np.cos(th)
    fx = of.hit_location.map({p: v[0] for p, v in OF_POS.items()})
    fy = of.hit_location.map({p: v[1] for p, v in OF_POS.items()})
    of["D_req_ft"] = np.hypot(lx - fx, ly - fy)
    of["reach_ft"] = _run_dist_ft(of.T_hang, of.of_sprint_f) + of.jump_f
    of["slack_ft"] = of.reach_ft - of.D_req_ft
    of = of.dropna(subset=["T_hang", "D_req_ft", "fielder_id"])

    rows, fits = [], {}
    for bname, sub in of.groupby("bucket"):
        y = sub.caught.to_numpy()
        if len(np.unique(y)) < 2 or len(sub) < 20:
            a, b = 0.0, 0.15
        else:
            lr = LogisticRegression(C=1e6, max_iter=500).fit(sub[["slack_ft"]], y)
            a, b = float(lr.intercept_[0]), max(float(lr.coef_[0][0]), 0.02)
        p = 1 / (1 + np.exp(-(a + b * sub.slack_ft)))
        of.loc[sub.index, "p_catch"] = p
        of.loc[sub.index, "info"] = b * p * (1 - p)
        fits[bname] = (a, b, float(sub.T_hang.median()), len(sub))
    of["resid"] = of.caught - of.p_catch

    for (fid, yr, bname), s in of.groupby(["fielder_id", "game_year", "bucket"]):
        a, b, T_med, _ = fits[bname]
        n = len(s)
        reach = float(_run_dist_ft(T_med, s.of_sprint_f.iloc[0]) + s.jump_f.iloc[0])
        adj = np.clip(s.resid.sum() / max(s["info"].sum(), 1e-6), -25, 25) * n / (n + 30)
        rows.append(dict(fielder_id=fid, game_year=yr, bucket=bname, n=n,
                         catches=int(s.caught.sum()), exp_catches=float(s.p_catch.sum()),
                         sprint_ft_s=float(s.of_sprint_f.iloc[0]), jump_bonus_ft=float(s.jump_f.iloc[0]),
                         CR_50_ft=reach + a / b + adj, CR_90_ft=reach + (a - 2.1972) / b + adj))
    t = pd.DataFrame(rows)
    if t.empty:
        return t, of
    lg50 = t.groupby("bucket").apply(lambda d: np.average(d.CR_50_ft, weights=d.n)).rename("league_CR_50_ft")
    lg90 = t.groupby("bucket").apply(lambda d: np.average(d.CR_90_ft, weights=d.n)).rename("league_CR_90_ft")
    t = t.join(lg50, on="bucket").join(lg90, on="bucket")
    # roll up to ALL buckets (n-weighted)
    allr = []
    for (fid, yr), s in t.groupby(["fielder_id", "game_year"]):
        w = s.n
        allr.append(dict(fielder_id=fid, game_year=yr, bucket="ALL", n=int(w.sum()),
                         catches=int(s.catches.sum()), exp_catches=s.exp_catches.sum(),
                         sprint_ft_s=s.sprint_ft_s.iloc[0], jump_bonus_ft=s.jump_bonus_ft.iloc[0],
                         CR_50_ft=np.average(s.CR_50_ft, weights=w), CR_90_ft=np.average(s.CR_90_ft, weights=w),
                         league_CR_50_ft=np.average(s.league_CR_50_ft, weights=w),
                         league_CR_90_ft=np.average(s.league_CR_90_ft, weights=w)))
    t = pd.concat([t, pd.DataFrame(allr)], ignore_index=True)
    t["Grass_Covered_SqFt"] = np.pi * t.CR_50_ft ** 2
    t["Turf_Erased_SqFt"] = np.pi * (t.CR_50_ft ** 2 - t.league_CR_50_ft ** 2)
    t["CR_50_ft_vs_league_avg"] = t.CR_50_ft - t.league_CR_50_ft
    t["CR_90_ft_vs_league_avg"] = t.CR_90_ft - t.league_CR_90_ft
    t["Turf_Erased_SqFt_vs_league_avg"] = t.Turf_Erased_SqFt          # league avg is 0 by construction
    t["is_qualified"] = t.n >= MIN_N_STANDARD
    t.insert(0, "player", t.fielder_id.map(lambda i: names.get(int(i), str(int(i)))))
    return t.sort_values(["bucket", "Turf_Erased_SqFt"], ascending=[True, False]), of


# ---------------- Infield: Dual-Clock Reach + Seam Openness ----------------
def _arm_map(lb):
    return dict(zip(lb.arm.player_id.astype(float), lb.arm.arm_mph)) if not lb.arm.empty else {}


def _oaa_pct(ib, lb, p, ids):
    if lb.oaa.empty:
        return np.full(len(ib), 0.5)
    o = lb.oaa[lb.oaa.pos == p].rename(columns={"player_id": "_id"})
    o["_id"] = o["_id"].astype(float)
    tmp = pd.DataFrame({"game_year": ib.game_year.to_numpy(), "_id": ids})
    return tmp.merge(o[["game_year", "_id", "oaa_pct"]], on=["game_year", "_id"], how="left")["oaa_pct"] \
        .fillna(0.5).to_numpy()


def infield_model(bb: pd.DataFrame, lb: Leaderboards, names: dict):
    ib = bb[bb.hit_location.isin([3, 4, 5, 6]) & (bb.launch_angle < 15)
            & (bb.result_out | bb.result_hit)].copy().reset_index(drop=True)
    ib["out"] = ib.result_out.astype(int)
    # Clock 1 -- time for the ball to reach the 145-ft arc under turf deceleration a = 0.25*v0
    v0 = ib.launch_speed.to_numpy() * MPH_TO_FPS
    a = 0.25 * v0
    disc = v0 ** 2 - 2 * a * INFIELD_ARC_FT
    ib["T_pass"] = np.where(disc > 0, (v0 - np.sqrt(np.maximum(disc, 0))) / a, 3.0)
    th = np.radians(ib.spray_angle_deg.to_numpy())
    arms = _arm_map(lb)

    dist, c1, c2n = {}, {}, {}
    c2_assigned = np.zeros(len(ib))
    for p, (px, py) in INF_POS.items():
        ids = ib[f"fielder_{p}"].to_numpy(float)
        v_lat = 9.0 + 3.0 * (_oaa_pct(ib, lb, p, ids) - 0.5)              # ~7.5-10.5 ft/s effective lateral
        arm = np.array([arms.get(i, ARM_DEFAULT_MPH[p]) for i in ids])
        throw = np.hypot(px - FIRST_BAG[0], py - FIRST_BAG[1]) if p != 3 else 20.0   # 1B flips to P
        dist[p] = np.abs(px * np.cos(th) - py * np.sin(th))               # perpendicular distance to ball path
        c1[p] = v_lat * np.maximum(ib.T_pass.to_numpy() - 0.45, 0) + 3.0  # 0.45 s first step, +3 ft dive
        t2_of = lambda spd: 90.0 / spd - EXCHANGE_T - throw / (arm * MPH_TO_FPS)
        c2n[p] = v_lat * np.maximum(t2_of(LEAGUE_SPRINT) - 0.45, 0) + 3.0
        ib[f"_c2_{p}"] = v_lat * np.maximum(t2_of(ib.batter_sprint_f.to_numpy()) - 0.45, 0) + 3.0
    loc = ib.hit_location.to_numpy()
    pick = lambda d: np.select([loc == p for p in INF_POS], [d[p] for p in INF_POS])
    ib["Clock1_Reach_ft"] = pick(c1)
    ib["Clock2_Reach_ft"] = np.select([loc == p for p in INF_POS], [ib[f"_c2_{p}"] for p in INF_POS])
    ib["Effective_Lateral_Reach_ft"] = np.minimum(ib.Clock1_Reach_ft, ib.Clock2_Reach_ft)
    ib["lateral_dist_ft"] = pick(dist)
    ib["gap_ft"] = ib.lateral_dist_ft - ib.Effective_Lateral_Reach_ft
    # Team seam openness uses a neutral (27 ft/s) batter so it does not depend on opposing speed
    open_each = np.column_stack([dist[p] - np.minimum(c1[p], c2n[p]) for p in INF_POS])
    ib["open_ft"] = np.maximum(open_each.min(axis=1), 0.0)
    ib["open_deg"] = np.degrees(ib.open_ft / INFIELD_ARC_FT)
    ib["runner_on_1b_holding"] = ib.runner_on_1b.astype(int)

    # Seam Out Probability model (out-of-fold for leaderboards/reliability)
    SEAM_FEATS = ["launch_speed", "launch_angle", "spray_angle_deg", "gap_ft", "runner_on_1b_holding", "T_pass"]
    X, y = ib[SEAM_FEATS].to_numpy(float), ib.out.to_numpy()
    if len(ib) >= 60 and len(np.unique(y)) == 2:
        ib["p_out"] = cross_val_predict(_hgb_clf(3, 150), X, y, cv=3, method="predict_proba")[:, 1]
    else:
        ib["p_out"] = y.mean() if len(ib) else np.nan
    ib["out_oe"] = ib.out - ib.p_out
    ib["hit"] = ib.result_hit.astype(int)
    ib["p_hit"] = 1 - ib.p_out

    # --- fielder (IR) table
    ib["pos"] = ib.hit_location.map(POS_NAME)
    ir = ib.groupby(["fielder_id", "game_year", "pos"]).agg(
        n=("out", "size"), Clock1_Reach_ft=("Clock1_Reach_ft", "mean"),
        Effective_Lateral_Reach_ft=("Effective_Lateral_Reach_ft", "mean"),
        outs_above_expected=("out_oe", "sum")).reset_index()
    for c in ("Clock1_Reach_ft", "Effective_Lateral_Reach_ft"):
        lg = ib.groupby("pos")[c].mean()
        ir[f"{c}_vs_league_avg"] = ir[c] - ir["pos"].map(lg)
    ir["is_qualified"] = ir.n >= MIN_N_STANDARD
    ir.insert(0, "player", ir.fielder_id.map(lambda i: names.get(int(i), str(int(i)))))

    # --- team seam table
    ang = ib.spray_angle_deg
    corr = np.select([(ang >= lo) & (ang <= hi) for lo, hi in CORRIDORS.values()], list(CORRIDORS), "")
    ib["corridor"] = corr
    h35 = ib.corridor == "Hole_3_5"
    ib.loc[h35 & ib.runner_on_1b, "corridor"] = "Hole_3_5__Runner_On_1B_Holding"
    ib.loc[h35 & ib.bases_empty, "corridor"] = "Hole_3_5__Bases_Empty"
    # bare 'Hole_3_5' rows = runners only on 2B/3B: outside the Holding/Bases_Empty split, excluded from seams
    seam = ib[(ib.corridor != "") & (ib.corridor != "Hole_3_5")]
    team = seam.groupby(["defense_team", "game_year", "corridor"]).agg(
        n=("out", "size"), open_ft=("open_ft", "mean"), open_deg=("open_deg", "mean"),
        BA_allowed_empirical=("hit", "mean"), xBA_allowed_model=("p_hit", "mean")).reset_index()
    for c in ("open_ft", "open_deg", "BA_allowed_empirical", "xBA_allowed_model"):
        lg = seam.groupby("corridor")[{"open_ft": "open_ft", "open_deg": "open_deg",
                                       "BA_allowed_empirical": "hit", "xBA_allowed_model": "p_hit"}[c]].mean()
        team[f"{c}_vs_league_avg"] = team[c] - team["corridor"].map(lg)
    team["is_qualified"] = np.where(team.corridor.str.startswith("Hole_3_5"),
                                    team.n >= MIN_N_SITUATIONAL, team.n >= MIN_N_STANDARD)
    return ir, team.sort_values(["corridor", "open_ft"], ascending=[True, False]), ib


# ----------------------------------------------------------------------------
# PIPELINE
# ----------------------------------------------------------------------------
def run_pipeline(cfg: Config) -> dict:
    sc = load_statcast(cfg)
    lb = load_leaderboards(cfg, sc["game_year"].unique())
    pa = prepare_offense(build_pa_table(sc), lb)
    models = fit_offense_models(training_rows(pa))
    o = score_offense(pa, models)
    bb = build_batted_balls(sc, lb)
    ids = pd.concat([o.batter, bb.fielder_id]).dropna()
    names = lookup_names(cfg, ids, lb)
    off_players = offense_player_table(o, names)
    dcr, of_balls = outfield_dcr(bb, lb, names)
    ir, isv, if_balls = infield_model(bb, lb, names)
    os.makedirs(cfg.out_dir, exist_ok=True)
    for nm, df in [("bcaa_cnrbi_players", off_players), ("dcr_outfielders", dcr),
                   ("ir_infielders", ir), ("isv_team_seams", isv)]:
        df.to_csv(os.path.join(cfg.out_dir, f"{nm}.csv"), index=False)
    print(f"[out  ] CSVs written to {cfg.out_dir}/")
    return dict(cfg=cfg, sc=sc, lb=lb, pa=pa, opp=o, bb=bb, names=names, off_players=off_players,
                dcr=dcr, of_balls=of_balls, ir=ir, isv=isv, if_balls=if_balls)


# ----------------------------------------------------------------------------
# MODULE 3 -- VALIDATION SUITE
# ----------------------------------------------------------------------------
def split_half(df, id_col, val_col, order_cols, min_half=8):
    d = df.sort_values(order_cols).copy()
    d["_k"] = d.groupby(id_col).cumcount()
    odd = d[d._k % 2 == 1].groupby(id_col)[val_col].agg(["mean", "count"])
    even = d[d._k % 2 == 0].groupby(id_col)[val_col].agg(["mean", "count"])
    j = odd.join(even, lsuffix="_o", rsuffix="_e", how="inner")
    j = j[(j.count_o >= min_half) & (j.count_e >= min_half)]
    if len(j) < 5:
        return dict(players=len(j), r=np.nan, sb=np.nan, n_avg=np.nan, n_req=np.nan, note="too few players")
    r = stats.pearsonr(j.mean_o, j.mean_e)[0]
    sb = 2 * r / (1 + r) if r > -1 else np.nan
    n_avg = float((j.count_o + j.count_e).mean())
    if np.isfinite(sb) and sb > 0:
        n_req = n_avg * (0.70 * (1 - sb)) / (sb * 0.30)
        note = "already >= 0.70" if sb >= 0.70 else ""
    else:
        n_req, note = np.nan, "r <= 0: not estimable"
    return dict(players=len(j), r=r, sb=sb, n_avg=n_avg, n_req=n_req, note=note)


def _bin_metrics(y, p, base_rate_train):
    return dict(brier=brier_score_loss(y, p), auc=roc_auc_score(y, p) if len(np.unique(y)) == 2 else np.nan,
                brier_base=brier_score_loss(y, np.full(len(y), base_rate_train)), n=len(y))


def _top_bottom(title, df, val, n_col, qual_col, label_cols, k=10):
    print(f"\n### {title}")
    q = df[df[qual_col]]
    note = ""
    if len(q) < 2 * k:
        q, note = df, f" _(only {int(df[qual_col].sum())} qualified rows in this window; showing all rows, check is_qualified)_"
    cols = label_cols + [val, n_col, qual_col]
    print(f"**Top {k}**{note}\n" + md_table(q.sort_values(val, ascending=False).head(k), cols))
    print(f"\n**Bottom {k}**\n" + md_table(q.sort_values(val, ascending=True).head(k), cols))


def run_validation_suite(cfg: Config | None = None, res: dict | None = None):
    cfg = cfg or Config()
    res = res or run_pipeline(cfg)
    o, pa, of_balls, if_balls = res["opp"], res["pa"], res["of_balls"], res["if_balls"]
    print(f"\n# x9Lab Validation Report  ({cfg.start} to {cfg.end})\n")
    print(f"PAs with runners on at Pitch 1: **{len(o):,}** | ghost-runner PAs: **{int(o.runner_erased_mid_ab.sum()):,}** "
          f"| OF balls: **{len(of_balls):,}** | IF balls: **{len(if_balls):,}**")

    # ---------------- Test 1: odd/even split-half ----------------
    print("\n## Test 1 - Odd/Even Split-Half Reliability (Spearman-Brown)\n")
    t1 = []
    ordc = ["game_date", "game_pk", "at_bat_number"]
    t1.append(("BCAA (per PA, batter)", split_half(o, "batter", "BCAA", ordc)))
    t1.append(("cnRBI (per PA, batter)", split_half(o, "batter", "cnRBI", ordc)))
    if len(of_balls):
        t1.append(("OF catch above expected (per ball)",
                   split_half(of_balls, "fielder_id", "resid", ["game_date", "game_pk", "at_bat_number"])))
    if len(if_balls):
        t1.append(("IF outs above expected (per ball)",
                   split_half(if_balls, "fielder_id", "out_oe", ["game_date", "game_pk", "at_bat_number"])))
    rows = [dict(metric=m, players=r["players"], r_odd_even=r["r"], spearman_brown=r["sb"],
                 n_avg_per_player=r["n_avg"], n_for_0_70=np.ceil(r["n_req"]) if np.isfinite(r["n_req"]) else np.nan,
                 note=r["note"]) for m, r in t1]
    print(md_table(pd.DataFrame(rows), list(rows[0])))

    # ---------------- Test 2: holdout calibration ----------------
    print("\n## Test 2 - Out-of-Sample Calibration (20% holdout)\n")
    out = []
    tr = training_rows(pa)
    if len(tr) >= 100:
        Xall = _X(tr.launch_speed, tr.launch_angle, tr.spray_angle_deg, tr.outs_last, tr.term_code, tr.lead_speed_filled)
        for label, ycol, thr in [("xBC_Neutral: P(runner advances >= 1 base)", "bases_converted", 0.5),
                                 ("cnRBI: P(RBI > 0)", "rbi_runner", 0.5)]:
            yb = (tr[ycol].to_numpy() > 0).astype(int)
            Xa, Xb, ya, yb_ = train_test_split(Xall, yb, test_size=0.2, random_state=cfg.seed,
                                               stratify=yb if min(yb.sum(), len(yb) - yb.sum()) > 5 else None)
            clf = _hgb_clf().fit(Xa, ya)
            m = _bin_metrics(yb_, clf.predict_proba(Xb)[:, 1], ya.mean())
            out.append(dict(model=label, n_test=m["n"], brier=m["brier"], brier_const_baseline=m["brier_base"],
                            roc_auc=m["auc"]))
        yr = tr["bases_converted"].to_numpy(float)
        Xa, Xb, ya, yb_ = train_test_split(Xall, yr, test_size=0.2, random_state=cfg.seed)
        reg = _hgb_reg().fit(Xa, ya)
        pr = reg.predict(Xb)
        print(f"xBC_Neutral regressor (bases converted): holdout RMSE **{mean_squared_error(yb_, pr) ** 0.5:.3f}** "
              f"vs constant **{mean_squared_error(yb_, np.full(len(yb_), ya.mean())) ** 0.5:.3f}**, "
              f"R^2 **{r2_score(yb_, pr):.3f}** (n_test={len(yb_)})\n")
    if len(if_balls) >= 100:
        S = ["launch_speed", "launch_angle", "spray_angle_deg", "gap_ft", "runner_on_1b_holding", "T_pass"]
        X, y = if_balls[S].to_numpy(float), if_balls["out"].to_numpy()
        Xa, Xb, ya, yb_ = train_test_split(X, y, test_size=0.2, random_state=cfg.seed,
                                           stratify=y if min(y.sum(), len(y) - y.sum()) > 5 else None)
        m = _bin_metrics(yb_, _hgb_clf(3, 150).fit(Xa, ya).predict_proba(Xb)[:, 1], ya.mean())
        out.append(dict(model="Seam Out Probability (IF)", n_test=m["n"], brier=m["brier"],
                        brier_const_baseline=m["brier_base"], roc_auc=m["auc"]))
    print(md_table(pd.DataFrame(out), ["model", "n_test", "brier", "brier_const_baseline", "roc_auc"], 3)
          if out else "_Not enough rows for a holdout split in this window._")

    # ---------------- Test 3: runner-speed independence ----------------
    print("\n## Test 3 - Runner Speed Independence (|r| < 0.05 required)\n")
    chk = []
    a = o.dropna(subset=["lead_runner_sprint_speed"])
    if len(a) > 10:
        r, p = stats.pearsonr(a.BCAA, a.lead_runner_sprint_speed)
        chk.append(dict(metric="BCAA vs lead-runner sprint speed", n=len(a), pearson_r=r, p_value=p, passes=abs(r) < 0.05))
    b = if_balls.dropna(subset=["batter_sprint"])
    if len(b) > 10:
        r, p = stats.pearsonr(b.Clock1_Reach_ft, b.batter_sprint)
        chk.append(dict(metric="Clock 1 IF reach vs batter sprint speed", n=len(b), pearson_r=r, p_value=p, passes=abs(r) < 0.05))
    print(md_table(pd.DataFrame(chk), ["metric", "n", "pearson_r", "p_value", "passes"], 3) if chk else
          "_No sprint-speed rows joined (leaderboard unavailable) - test skipped._")
    print("\n_Note: with small n, sampling noise alone can exceed |r| = 0.05; read together with n and p._")

    # ---------------- Test 4: eye-test leaderboards ----------------
    print("\n## Test 4 - Eye-Test Leaderboards (n shown on every row)")
    op = res["off_players"].copy()
    _top_bottom("BCAA (total bases converted above average)", op, "BCAA", "n_opp", "is_qualified", ["player", "game_year"])
    _top_bottom("Robbed RBIs (CS/PO + slow runners)", op, "Robbed_RBI_total", "n_opp", "is_qualified", ["player", "game_year"])
    d = res["dcr"]
    if len(d):
        _top_bottom("Outfield Turf Erased (sq ft, all buckets)", d[d.bucket == "ALL"], "Turf_Erased_SqFt", "n",
                    "is_qualified", ["player", "game_year", "CR_50_ft", "Grass_Covered_SqFt"])
    isv = res["isv"]
    for c in ["Hole_5_5", "Hole_3_5__Runner_On_1B_Holding", "Hole_3_5__Bases_Empty"]:
        t = isv[isv.corridor == c]
        if len(t):
            _top_bottom(f"Team seam openness - {c} (ft open; higher = more vulnerable)", t, "open_ft", "n",
                        "is_qualified", ["defense_team", "game_year", "open_deg", "xBA_allowed_model"])
    print("\n_End of report._")


def parse_args():
    ap = argparse.ArgumentParser(description="x9Lab BCAA/cnRBI + DCR/ISV validation pipeline")
    ap.add_argument("--start", default="2026-05-01")
    ap.add_argument("--end", default="2026-05-31")
    ap.add_argument("--seasons", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    help="full-season mode, e.g. --seasons 2024 2026")
    ap.add_argument("--cache-dir", default="x9lab_cache")
    ap.add_argument("--out-dir", default="x9lab_output")
    ap.add_argument("--arm-csv", default=None, help="optional CSV with player_id,arm_mph for infielders")
    a = ap.parse_args()
    if a.seasons:
        a.start, a.end = f"{a.seasons[0]}-03-15", f"{a.seasons[1]}-11-15"
    return Config(start=a.start, end=a.end, cache_dir=a.cache_dir, out_dir=a.out_dir, arm_csv=a.arm_csv)


if __name__ == "__main__":
    run_validation_suite(parse_args())