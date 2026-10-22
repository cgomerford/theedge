#!/usr/bin/env python3
"""scripts/verify/savant_fields_check.py

Read-only check of which fields the Baseball Savant pitch feed actually returns, one date
from 2026 and one from 2025. Field names/strings come from the LIVE response, not memory.

Writes NOTHING to Supabase. Only output: docs/fields/savant_<date>.json (one per date).

Usage:
  python3 scripts/verify/savant_fields_check.py
  python3 scripts/verify/savant_fields_check.py 2026-09-15 2025-09-15

Python 3.9 compatible (typing.Optional / List, no `X | None`).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Dict, List, Optional

import pandas as pd
from pybaseball import statcast

DEFAULT_DATES = ["2026-09-15", "2025-09-15"]

FIELDS = [
    "pitch_type", "p_throws", "stand", "release_speed", "pfx_x", "pfx_z", "arm_angle",
    "release_extension", "release_pos_z", "description", "type", "launch_speed",
    "launch_angle", "estimated_woba_using_speedangle", "game_year", "plate_x", "plate_z",
    "balls", "strikes",
]

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "fields")


def field_report(df: pd.DataFrame) -> Dict[str, Dict[str, Optional[object]]]:
    report = {}  # type: Dict[str, Dict[str, Optional[object]]]
    for f in FIELDS:
        if f not in df.columns:
            report[f] = {"status": "MISSING", "dtype": None, "non_null_share": None}
        else:
            report[f] = {
                "status": "ok",
                "dtype": str(df[f].dtype),
                "non_null_share": round(float(df[f].notna().mean()), 4),
            }
    return report


def check_date(date: str) -> Dict[str, object]:
    print("\n" + "=" * 78)
    print("DATE {}".format(date))
    print("=" * 78)
    df = statcast(start_dt=date, end_dt=date)
    if df is None or len(df) == 0:
        print("  no rows returned (off day or feed not populated)")
        return {"date": date, "total_rows": 0}

    # Strip a stray BOM from the first header, per CLAUDE.md gotcha (no-op when absent).
    df.columns = [str(c).lstrip("﻿") for c in df.columns]

    print("total rows: {}".format(len(df)))
    cols = list(df.columns)
    print("columns ({}):".format(len(cols)))
    print("  " + ", ".join(cols))

    report = field_report(df)
    print("\n{:<34}{:<10}{:<12}{}".format("field", "status", "dtype", "non-null"))
    for f in FIELDS:
        r = report[f]
        share = "-" if r["non_null_share"] is None else "{:.1%}".format(r["non_null_share"])
        print("{:<34}{:<10}{:<12}{}".format(f, r["status"], r["dtype"] or "-", share))

    missing = [f for f in FIELDS if report[f]["status"] == "MISSING"]  # type: List[str]
    print("\nMISSING: {}".format(missing if missing else "none"))

    present = [f for f in FIELDS if f not in missing]
    sample = df[present].head(5)
    print("\n5 sample rows:")
    print(sample.to_string())

    descriptions = {}  # type: Dict[str, int]
    if "description" in df.columns:
        vc = df["description"].value_counts(dropna=False)
        descriptions = {str(k): int(v) for k, v in vc.items()}
    print("\ndistinct description values (count):")
    for k, v in descriptions.items():
        print("  {:<40}{}".format(k, v))

    return {
        "date": date,
        "total_rows": int(len(df)),
        "columns": cols,
        "fields": report,
        "missing": missing,
        "sample_rows": json.loads(sample.to_json(orient="records")),
        "description_counts": descriptions,
    }


def main(argv: List[str]) -> int:
    dates = argv[1:] if len(argv) > 1 else DEFAULT_DATES
    os.makedirs(OUT_DIR, exist_ok=True)
    for date in dates:
        result = check_date(date)
        path = os.path.abspath(os.path.join(OUT_DIR, "savant_{}.json".format(date)))
        with open(path, "w") as fh:
            json.dump(result, fh, indent=2)
        print("\nsaved {}".format(path))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
