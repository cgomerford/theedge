#!/usr/bin/env python3
"""
scripts/build_hitter_clusters.py

Builds hitter_clusters and hitter_cluster_defs (supabase/migrations/20261030160000_second_look_game_plan.sql): "hitters like him", grouped by how each batter
chases, misses and does damage against fastballs, breaking balls and offspeed pitches. Used when a hitter's own sample is too small.

TABLE OWNERSHIP: this script is the SINGLE writer of hitter_clusters and hitter_cluster_defs. It rebuilds one season at a time.

Per batter and per pitcher hand (one fit for 'vs RHP', one for 'vs LHP'), for each pitch group, three figures:
  chase    swings at pitches outside the strike zone (Statcast zones 11-14) / pitches outside the zone
  whiff    swinging strikes (incl. foul tips) / swings
  damage   mean xwOBA (estimated_woba) on balls in play that have a launch reading
Pitch groups: fastballs FF, SI, FC | breaking SL, ST, SV, CU, KC, CS | offspeed CH, FS, FO, SC, EP.
A batter gets a cluster only if EVERY one of the nine figures meets its minimum (MIN_CHASE_PITCHES, MIN_SWINGS, MIN_CONTACT below); under that he gets no row, never a guess.
The nine figures are standardised (z-score across the retained batters) and grouped with k-means (plain numpy: k-means++ start, 30 restarts, fixed seed). Quality is the
mean silhouette. Run with --k-scan first to print the silhouette for k = 6 to 10 (writes nothing), then --k <n> to write. Each cluster gets a plain label from its
centroid: the two figures that sit furthest from the average, in words.

Usage:
  python3 scripts/build_hitter_clusters.py --season 2026 --k-scan
  python3 scripts/build_hitter_clusters.py --season 2026 --k 8 [--dry-run]
Prints the cluster table and 5 sample rows, then waits 5 seconds (Ctrl+C aborts) before writing.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

GROUPS = {"fastballs": {"FF", "SI", "FC"}, "breaking": {"SL", "ST", "SV", "CU", "KC", "CS"}, "offspeed": {"CH", "FS", "FO", "SC", "EP"}}
GROUP_OF = {t: g for g, ts in GROUPS.items() for t in ts}
GROUP_NAME = {"fastballs": "fastballs", "breaking": "breaking balls", "offspeed": "offspeed pitches"}
MIN_CHASE_PITCHES = 30    # pitches outside the zone he has seen in the group
MIN_SWINGS = 30           # swings in the group
MIN_CONTACT = 10          # balls in play with a launch reading in the group
WHIFFS = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
FEATURES = [f"{m}_{g}" for g in GROUPS for m in ("chase", "whiff", "damage")]
COLS = "id,batter_id,p_throws,pitch_type,zone,description,estimated_woba"


def read_season(sb, season):
    rows, last, t0 = [], 0, time.time()
    while True:
        for attempt in range(4):
            try:
                got = (sb.table("pitch_events").select(COLS).gte("game_date", f"{season}-01-01").lt("game_date", f"{season + 1}-01-01")
                       .gt("id", last).order("id").limit(1000).execute().data)
                break
            except Exception as e:
                print(f"  retry {attempt + 1} after id {last}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit("Giving up: the database kept refusing. Nothing was written.")
        if not got:
            return rows
        rows.extend(got)
        last = got[-1]["id"]
        if len(rows) % 100000 < 1000:
            print(f"  read {len(rows):,} pitches ({time.time() - t0:.0f}s)")


def batter_table(rows):
    """{(batter, p_throws): {group: counters}}"""
    acc = defaultdict(lambda: {g: {"oz": 0, "oz_swing": 0, "swings": 0, "whiffs": 0, "bip": 0, "xw": 0.0} for g in GROUPS})
    for r in rows:
        g = GROUP_OF.get(r["pitch_type"] or "")
        if g is None or r["p_throws"] not in ("L", "R") or not r["batter_id"]:
            continue
        c = acc[(r["batter_id"], r["p_throws"])][g]
        d = r["description"] or ""
        swing = d in WHIFFS or d in FOULS or d.startswith("hit_into_play")
        z = r["zone"]
        if z is not None and 11 <= int(z) <= 14:
            c["oz"] += 1
            c["oz_swing"] += swing
        if swing:
            c["swings"] += 1
            c["whiffs"] += d in WHIFFS
        if d.startswith("hit_into_play") and r["estimated_woba"] is not None:
            c["bip"] += 1
            c["xw"] += float(r["estimated_woba"])
    return acc


def features_of(groups):
    """The nine figures and the samples behind them, or None if any minimum is missed."""
    vals, samples = [], {}
    for g, c in groups.items():
        if c["oz"] < MIN_CHASE_PITCHES or c["swings"] < MIN_SWINGS or c["bip"] < MIN_CONTACT:
            return None
        vals += [c["oz_swing"] / c["oz"], c["whiffs"] / c["swings"], c["xw"] / c["bip"]]
        samples[g] = {"out_of_zone_pitches": c["oz"], "swings": c["swings"], "contact": c["bip"]}
    return vals, samples


def kmeans(X, k, seed=7, restarts=30, iters=100):
    rng = np.random.default_rng(seed)
    best = (None, None, np.inf)
    for _ in range(restarts):
        cent = [X[rng.integers(len(X))]]
        for _ in range(k - 1):
            d2 = np.min(((X[:, None, :] - np.array(cent)[None]) ** 2).sum(2), axis=1)
            cent.append(X[rng.choice(len(X), p=d2 / d2.sum())] if d2.sum() > 0 else X[rng.integers(len(X))])
        cent = np.array(cent)
        for _ in range(iters):
            lab = ((X[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
            new = np.array([X[lab == j].mean(0) if (lab == j).any() else cent[j] for j in range(k)])
            if np.allclose(new, cent):
                break
            cent = new
        inertia = ((X - cent[lab]) ** 2).sum()
        if inertia < best[2]:
            best = (lab, cent, inertia)
    return best[0], best[1]


def silhouette(X, lab):
    D = np.sqrt(((X[:, None, :] - X[None]) ** 2).sum(2))
    s = np.zeros(len(X))
    ks = np.unique(lab)
    for i in range(len(X)):
        own = lab == lab[i]
        if own.sum() <= 1:
            continue
        a = D[i, own].sum() / (own.sum() - 1)
        b = min(D[i, lab == j].mean() for j in ks if j != lab[i])
        s[i] = (b - a) / max(a, b)
    return float(s.mean())


def label_of(zc):
    """Plain words for a centroid (z-scores): the two figures furthest from average."""
    phrases = []
    for f, z in zip(FEATURES, zc):
        m, g = f.split("_", 1)
        w = GROUP_NAME[g]
        if abs(z) < 0.5:
            continue
        up = z > 0
        text = {"chase": f"chases {w}" if up else f"lays off {w}", "whiff": f"swings and misses at {w}" if up else f"rarely misses {w}",
                "damage": f"does damage on {w}" if up else f"little damage on {w}"}[m]
        phrases.append((abs(z), text))
    phrases.sort(reverse=True)
    top = [t for _, t in phrases[:2]]
    return ", ".join(top) if top else "close to the league average everywhere"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--k", type=int)
    ap.add_argument("--k-scan", action="store_true", help="print the silhouette for k = 6 to 10 and stop")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not a.k and not a.k_scan:
        sys.exit("Choose --k-scan (look at the silhouettes) or --k <n> (fit and write).")
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)
    rows = read_season(sb, a.season)
    acc = batter_table(rows)
    print(f"{len(rows):,} pitches read; {len(acc):,} batter-by-hand lines.")

    fits, defs, out = {}, [], []
    for hand, vs in (("R", "vs RHP"), ("L", "vs LHP")):
        keep = [(b, features_of(g)) for (b, h), g in acc.items() if h == hand]
        kept = [(b, f) for b, f in keep if f is not None]
        print(f"\n{vs}: {len(kept):,} batters meet every minimum of {len(keep):,} (minimums: {MIN_CHASE_PITCHES} out-of-zone pitches, {MIN_SWINGS} swings, {MIN_CONTACT} contact, per pitch group).")
        if len(kept) < 40:
            print("  Too few batters to cluster. Nothing for this hand.")
            continue
        X = np.array([f[0] for _, f in kept])
        mu, sd = X.mean(0), X.std(0)
        Z = (X - mu) / np.where(sd == 0, 1, sd)
        if a.k_scan:
            for k in range(6, 11):
                lab, _ = kmeans(Z, k)
                print(f"  k={k}: silhouette {silhouette(Z, lab):.3f}  (sizes {sorted(np.bincount(lab).tolist(), reverse=True)})")
            continue
        lab, cent = kmeans(Z, a.k)
        sil = silhouette(Z, lab)
        order = np.argsort(-np.bincount(lab, minlength=a.k))          # biggest cluster is id 0
        remap = {int(old): new for new, old in enumerate(order)}
        print(f"  k={a.k}: silhouette {sil:.3f}")
        for old in order:
            new = remap[int(old)]
            real = cent[old] * np.where(sd == 0, 1, sd) + mu
            lbl = label_of(cent[old])
            n = int((lab == old).sum())
            print(f"    cluster {new}: {n:>4} hitters  {lbl}")
            defs.append({"season": a.season, "stand_vs": vs, "cluster_id": new, "label": lbl, "centroid": {f: round(float(v), 4) for f, v in zip(FEATURES, real)},
                         "n_hitters": n, "k": a.k, "silhouette": round(sil, 3)})
        for (b, (vals, samples)), l in zip(kept, lab):
            out.append({"season": a.season, "batter_id": int(b), "stand_vs": vs, "cluster_id": remap[int(l)],
                        "features": {"values": {f: round(float(v), 4) for f, v in zip(FEATURES, vals)}, "samples": samples}})
    if a.k_scan:
        print("\nScan only: nothing written.")
        return
    print("\nFirst 5 hitter rows:")
    for r in out[:5]:
        print(r)
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("hitter_clusters").delete().eq("season", a.season).execute()
    sb.table("hitter_cluster_defs").delete().eq("season", a.season).execute()
    sb.table("hitter_cluster_defs").insert(defs).execute()
    for i in range(0, len(out), 500):
        sb.table("hitter_clusters").insert(out[i:i + 500]).execute()
    print(f"Done. {len(out):,} hitters, {len(defs)} clusters.")


if __name__ == "__main__":
    main()
