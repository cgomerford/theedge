#!/usr/bin/env python3
"""
backtest_head_and_shoulders.py

Pilot backtest for the "head and shoulders" regression-watch pattern.

QUESTION WE'RE ACTUALLY ANSWERING:
When a hitter's rolling-window OPS traces a head-and-shoulders top (shoulder,
higher head, lower shoulder, then a break below the "neckline" support level),
does that *predict* continued decline better than just picking any random local
peak in a player's season? If not, this is a good-looking shape with no signal
and it should not ship as a real fantasy call.

USAGE
  Sanity-check the detector logic against known synthetic shapes (no network):
    python3 backtest_head_and_shoulders.py --demo

  Run the real backtest against MLB Stats API game logs (needs open network —
  run this on your machine / GitHub Actions runner, not in a sandboxed tool):
    python3 backtest_head_and_shoulders.py --season 2024 --min-pa 400 --limit 25

OUTPUT
  Prints a summary report. Pass --csv out.csv to also dump every detected
  pattern (confirmed or not) with its forward-performance delta, so you can
  eyeball individual cases rather than trust the aggregate.

  If --season returns zero patterns, that's a real result, not a bug — it
  means the shape is rarer in 15-game rolling OPS than it looks on a chart.
  The thresholds below are the first knobs to loosen before concluding that.
"""

from __future__ import annotations  # George's env is Python 3.9 — keeps int | None etc. valid there

import argparse
import csv
from dataclasses import dataclass
from statistics import median

try:
    from scipy import stats as scipy_stats
except ImportError:
    scipy_stats = None

# ── Config (tune these — see the README block at the bottom for what each does) ──

ROLLING_WINDOW = 15          # games in the rolling OPS window
MIN_PEAK_DISTANCE = 8        # min games between two peaks for them to count as separate
MIN_PROMINENCE = 0.035       # min OPS swing for a local max/min to count as a real peak/trough
SHOULDER_SYMMETRY_TOL = 0.30 # shoulders must be within 30% of each other's height (above neckline)
NECKLINE_TOL = 0.025         # the two troughs must be within this many OPS points of each other
HEAD_MARGIN = 0.020          # head must clear each shoulder by at least this many OPS points
CONFIRM_WINDOW = 10          # games after right shoulder to look for a neckline break
FORWARD_WINDOW = 15          # games after the break (or right shoulder) to measure what happens next
MIN_GAMES_FOR_QUALIFY = ROLLING_WINDOW + MIN_PEAK_DISTANCE * 4 + CONFIRM_WINDOW + FORWARD_WINDOW


# ── Data structures ──────────────────────────────────────────────────────────

@dataclass
class Pattern:
    player: str
    left_shoulder_idx: int
    head_idx: int
    right_shoulder_idx: int
    trough1_idx: int
    trough2_idx: int
    neckline: float
    broke_neckline: bool
    break_idx: int | None
    baseline_ops: float           # player's season median rolling OPS
    forward_ops: float | None     # mean rolling OPS over FORWARD_WINDOW games after the signal
    forward_delta: float | None   # forward_ops - baseline_ops (negative = regressed, as predicted)


# ── Step 1: rolling OPS from per-game counting stats ────────────────────────

def rolling_ops_series(games: list[dict], window: int = ROLLING_WINDOW) -> list[float]:
    """
    games: chronological list of {ab, h, 2b, 3b, hr, bb, hbp, sf} per game played.
    Returns rolling-window OPS computed from SUMMED counting stats over the window
    (not an average of single-game OPS values — averaging per-game OPS is the
    wrong math and is exactly the kind of thing that makes a stat noisy for no reason).
    """
    out = []
    for i in range(len(games)):
        if i < window - 1:
            continue
        chunk = games[i - window + 1: i + 1]
        ab = sum(g['ab'] for g in chunk)
        h = sum(g['h'] for g in chunk)
        b2 = sum(g['2b'] for g in chunk)
        b3 = sum(g['3b'] for g in chunk)
        hr = sum(g['hr'] for g in chunk)
        bb = sum(g['bb'] for g in chunk)
        hbp = sum(g['hbp'] for g in chunk)
        sf = sum(g['sf'] for g in chunk)
        tb = h + b2 + 2 * b3 + 3 * hr
        obp_den = ab + bb + hbp + sf
        obp = (h + bb + hbp) / obp_den if obp_den else 0.0
        slg = tb / ab if ab else 0.0
        out.append(obp + slg)
    return out


# ── Step 2: peaks and troughs ────────────────────────────────────────────────

def find_local_extrema(series: list[float], min_distance: int, min_prominence: float):
    """
    Plain local-extrema scan with a minimum spacing and minimum prominence —
    avoids a scipy.signal dependency mismatch across environments and is easy
    to read / adjust. Returns (peak_indices, trough_indices), both sorted.
    """
    n = len(series)
    candidates_max, candidates_min = [], []
    for i in range(1, n - 1):
        if series[i] > series[i - 1] and series[i] >= series[i + 1]:
            candidates_max.append(i)
        if series[i] < series[i - 1] and series[i] <= series[i + 1]:
            candidates_min.append(i)

    def filter_by_prominence_and_distance(idxs, is_max):
        kept = []
        for i in idxs:
            lo = max(0, i - min_distance)
            hi = min(n, i + min_distance + 1)
            local_window = series[lo:hi]
            if is_max:
                prom = series[i] - min(local_window)
            else:
                prom = max(local_window) - series[i]
            if prom >= min_prominence:
                kept.append(i)
        # enforce min_distance between kept points, keeping the more extreme one
        kept.sort()
        pruned = []
        for i in kept:
            if pruned and i - pruned[-1] < min_distance:
                if is_max:
                    if series[i] > series[pruned[-1]]:
                        pruned[-1] = i
                else:
                    if series[i] < series[pruned[-1]]:
                        pruned[-1] = i
            else:
                pruned.append(i)
        return pruned

    peaks = filter_by_prominence_and_distance(candidates_max, True)
    troughs = filter_by_prominence_and_distance(candidates_min, False)
    return peaks, troughs


# ── Step 3: head-and-shoulders matcher ───────────────────────────────────────

def detect_patterns(series: list[float], peaks: list[int], troughs: list[int]) -> list[dict]:
    """
    Scans every (peak, trough, peak, trough, peak) window in chronological order
    and keeps the ones that satisfy the shape constraints. Returns raw index
    tuples; scoring/backtest happens one level up where we have player context.
    """
    found = []
    for a in range(len(peaks) - 2):
        ls, h, rs = peaks[a], peaks[a + 1], peaks[a + 2]
        t1_candidates = [t for t in troughs if ls < t < h]
        t2_candidates = [t for t in troughs if h < t < rs]
        if not t1_candidates or not t2_candidates:
            continue
        t1 = max(t1_candidates, key=lambda t: -series[t])  # the trough closest to neckline height is fine; take any, then check tolerance
        t2 = max(t2_candidates, key=lambda t: -series[t])

        ls_v, h_v, rs_v, t1_v, t2_v = series[ls], series[h], series[rs], series[t1], series[t2]

        if not (h_v - ls_v >= HEAD_MARGIN and h_v - rs_v >= HEAD_MARGIN):
            continue
        shoulder_avg = (ls_v + rs_v) / 2
        if shoulder_avg <= 0:
            continue
        if abs(ls_v - rs_v) / shoulder_avg > SHOULDER_SYMMETRY_TOL:
            continue
        if abs(t1_v - t2_v) > NECKLINE_TOL:
            continue

        found.append({
            'left_shoulder_idx': ls, 'head_idx': h, 'right_shoulder_idx': rs,
            'trough1_idx': t1, 'trough2_idx': t2,
            'neckline': (t1_v + t2_v) / 2,
        })
    return found


# ── Step 4: confirm + forward performance ────────────────────────────────────

def evaluate_pattern(series: list[float], p: dict, player_name: str) -> Pattern:
    rs = p['right_shoulder_idx']
    neckline = p['neckline']
    broke_idx = None
    for i in range(rs + 1, min(len(series), rs + 1 + CONFIRM_WINDOW)):
        if series[i] < neckline:
            broke_idx = i
            break

    baseline = median(series)
    anchor = broke_idx if broke_idx is not None else rs
    fwd_slice = series[anchor + 1: anchor + 1 + FORWARD_WINDOW]
    forward_ops = sum(fwd_slice) / len(fwd_slice) if fwd_slice else None
    forward_delta = (forward_ops - baseline) if forward_ops is not None else None

    return Pattern(
        player=player_name,
        left_shoulder_idx=p['left_shoulder_idx'], head_idx=p['head_idx'],
        right_shoulder_idx=rs, trough1_idx=p['trough1_idx'], trough2_idx=p['trough2_idx'],
        neckline=neckline, broke_neckline=broke_idx is not None, break_idx=broke_idx,
        baseline_ops=baseline, forward_ops=forward_ops, forward_delta=forward_delta,
    )


def control_group_deltas(series: list[float], peaks: list[int], used_peak_idxs: set[int]) -> list[float]:
    """
    For every peak NOT used in a confirmed pattern, measure the same forward
    delta as if it were a signal. This is the control: 'what happens after
    literally any local peak', so we can tell if H&S peaks are special.
    """
    baseline = median(series)
    deltas = []
    for peak in peaks:
        if peak in used_peak_idxs:
            continue
        fwd_slice = series[peak + 1: peak + 1 + FORWARD_WINDOW]
        if len(fwd_slice) < FORWARD_WINDOW // 2:
            continue
        fwd_ops = sum(fwd_slice) / len(fwd_slice)
        deltas.append(fwd_ops - baseline)
    return deltas


# ── Demo mode: synthetic series so the detector logic can be sanity-checked without network ──

def synth_head_and_shoulders(noise_amp=0.006, neckline_break=True):
    import math
    keypoints = [(0, 0.760), (14, 0.840), (22, 0.770), (32, 0.880),
                 (42, 0.775), (50, 0.835),
                 (58, 0.760 if neckline_break else 0.800), (65, 0.700 if neckline_break else 0.790)]
    series = []
    for i in range(66):
        a, b = keypoints[0], keypoints[-1]
        for j in range(len(keypoints) - 1):
            if keypoints[j][0] <= i <= keypoints[j + 1][0]:
                a, b = keypoints[j], keypoints[j + 1]
                break
        t = 0 if b[0] == a[0] else (i - a[0]) / (b[0] - a[0])
        val = a[1] + (b[1] - a[1]) * t
        val += noise_amp * math.sin(i * 1.9)
        series.append(round(val, 4))
    return series


def synth_pure_noise(n=66, base=0.780, amp=0.030, seed_mult=1):
    import math
    return [round(base + amp * math.sin(i * 0.37 * seed_mult) + 0.4 * amp * math.sin(i * 1.21 * seed_mult), 4)
            for i in range(n)]


def run_demo():
    print("=== DEMO: detector sanity check on synthetic series (no real data) ===\n")

    series = synth_head_and_shoulders(neckline_break=True)
    peaks, troughs = find_local_extrema(series, MIN_PEAK_DISTANCE, MIN_PROMINENCE)
    patterns = detect_patterns(series, peaks, troughs)
    print(f"Intentional H&S, neckline breaks: peaks={peaks} troughs={troughs} -> {len(patterns)} pattern(s) found")
    if patterns:
        ev = evaluate_pattern(series, patterns[0], "synthetic-1")
        print(f"  confirmed break: {ev.broke_neckline} (break_idx={ev.break_idx}), forward_delta={ev.forward_delta:.4f}")
    else:
        print("  FAIL — expected to detect the intentional pattern. Check thresholds.")

    series2 = synth_head_and_shoulders(neckline_break=False)
    peaks2, troughs2 = find_local_extrema(series2, MIN_PEAK_DISTANCE, MIN_PROMINENCE)
    patterns2 = detect_patterns(series2, peaks2, troughs2)
    print(f"\nIntentional H&S, neckline holds: -> {len(patterns2)} pattern(s) found (shape detection is independent of the break)")
    if patterns2:
        ev2 = evaluate_pattern(series2, patterns2[0], "synthetic-2")
        print(f"  confirmed break: {ev2.broke_neckline} (expected False)")

    print("\nFalse-positive check on 8 pure-noise series (expect 0-1 spurious patterns, not several):")
    spurious = 0
    for s in range(1, 9):
        noise = synth_pure_noise(seed_mult=s)
        pk, tr = find_local_extrema(noise, MIN_PEAK_DISTANCE, MIN_PROMINENCE)
        pats = detect_patterns(noise, pk, tr)
        spurious += len(pats)
        print(f"  noise series {s}: {len(pats)} pattern(s)")
    print(f"  total spurious patterns across 8 noise series: {spurious}")


# ── Live mode: real MLB Stats API ────────────────────────────────────────────

def fetch_top_hitters(season: int, min_pa: int, limit: int):
    import requests
    url = "https://statsapi.mlb.com/api/v1/stats"
    params = {
        "stats": "season", "group": "hitting", "season": season, "sportId": 1,
        "limit": 200, "sortStat": "onBasePlusSlugging",
    }
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    out = []
    for s in splits:
        pa = int(s["stat"].get("plateAppearances", 0) or 0)
        if pa >= min_pa:
            out.append((s["player"]["id"], s["player"]["fullName"]))
        if len(out) >= limit:
            break
    return out


def fetch_game_log(player_id: int, season: int):
    import requests
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
    params = {"stats": "gameLog", "group": "hitting", "season": season}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    games = []
    for s in splits:
        st = s["stat"]
        games.append({
            'date': s.get('date'),
            'ab': int(st.get('atBats', 0) or 0),
            'h': int(st.get('hits', 0) or 0),
            '2b': int(st.get('doubles', 0) or 0),
            '3b': int(st.get('triples', 0) or 0),
            'hr': int(st.get('homeRuns', 0) or 0),
            'bb': int(st.get('baseOnBalls', 0) or 0),
            'hbp': int(st.get('hitByPitch', 0) or 0),
            'sf': int(st.get('sacFlies', 0) or 0),
        })
    games.sort(key=lambda g: g['date'] or '')
    return games


def run_live(season: int, min_pa: int, limit: int, csv_path: str | None):
    print(f"=== LIVE BACKTEST: {season} season, top {limit} qualified hitters (PA >= {min_pa}) ===\n")
    hitters = fetch_top_hitters(season, min_pa, limit)
    print(f"Pulled {len(hitters)} qualified hitters.\n")

    all_patterns: list[Pattern] = []
    control_deltas: list[float] = []
    skipped = 0

    for pid, name in hitters:
        games = fetch_game_log(pid, season)
        if len(games) < MIN_GAMES_FOR_QUALIFY:
            skipped += 1
            continue
        series = rolling_ops_series(games)
        peaks, troughs = find_local_extrema(series, MIN_PEAK_DISTANCE, MIN_PROMINENCE)
        raw_patterns = detect_patterns(series, peaks, troughs)
        used_peaks = set()
        for rp in raw_patterns:
            used_peaks.update([rp['left_shoulder_idx'], rp['head_idx'], rp['right_shoulder_idx']])
            all_patterns.append(evaluate_pattern(series, rp, name))
        control_deltas.extend(control_group_deltas(series, peaks, used_peaks))

    print(f"Scanned {len(hitters) - skipped} players with enough games (skipped {skipped} — short seasons / call-ups).")
    print(f"Total head-and-shoulders shapes found: {len(all_patterns)}")
    confirmed = [p for p in all_patterns if p.broke_neckline]
    print(f"  of which confirmed (neckline broke within {CONFIRM_WINDOW} games): {len(confirmed)}")
    print(f"  unconfirmed (shape formed, support held): {len(all_patterns) - len(confirmed)}\n")

    def summarize(label, deltas):
        deltas = [d for d in deltas if d is not None]
        if not deltas:
            print(f"{label}: n=0 — no data")
            return
        print(f"{label}: n={len(deltas)}, mean forward delta={sum(deltas)/len(deltas):+.4f} OPS, "
              f"median={median(deltas):+.4f}, negative (regressed) in {sum(1 for d in deltas if d < 0)}/{len(deltas)}")

    confirmed_deltas = [p.forward_delta for p in confirmed]
    unconfirmed_deltas = [p.forward_delta for p in all_patterns if not p.broke_neckline]
    summarize("Confirmed pattern (broke neckline)", confirmed_deltas)
    summarize("Unconfirmed pattern (shape only, no break)", unconfirmed_deltas)
    summarize("Control (any random local peak)", control_deltas)

    if scipy_stats and len([d for d in confirmed_deltas if d is not None]) >= 2 and len(control_deltas) >= 2:
        t, pval = scipy_stats.ttest_ind(
            [d for d in confirmed_deltas if d is not None], control_deltas, equal_var=False)
        print(f"\nWelch's t-test, confirmed-pattern delta vs control delta: t={t:.2f}, p={pval:.3f}")
        print("CAVEAT: with this sample size, treat this as directional, not a verdict. "
              "Multiple comparisons across players/seasons were not corrected for.")
    else:
        print("\n(Not enough confirmed instances yet for a meaningful significance test — "
              "this alone is useful information about how rare the pattern actually is.)")

    if csv_path:
        with open(csv_path, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['player', 'broke_neckline', 'break_idx', 'baseline_ops', 'forward_ops', 'forward_delta'])
            for p in all_patterns:
                w.writerow([p.player, p.broke_neckline, p.break_idx,
                            f"{p.baseline_ops:.4f}", f"{p.forward_ops:.4f}" if p.forward_ops else '',
                            f"{p.forward_delta:.4f}" if p.forward_delta is not None else ''])
        print(f"\nWrote per-pattern detail to {csv_path}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true', help="Run the synthetic sanity check, no network needed.")
    ap.add_argument('--season', type=int, default=2024)
    ap.add_argument('--min-pa', type=int, default=400)
    ap.add_argument('--limit', type=int, default=25)
    ap.add_argument('--csv', type=str, default=None)
    args = ap.parse_args()

    if args.demo:
        run_demo()
    else:
        run_live(args.season, args.min_pa, args.limit, args.csv)
