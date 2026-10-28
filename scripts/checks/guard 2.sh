#!/usr/bin/env bash
# guard.sh <paths...>: copy-lint + identifier / logo / lg: / render-fetch / font / isPro checks.
# Exits non-zero on any failure. Source of truth for banned words: scripts/checks/copy-lint.ts
cd "$(dirname "$0")/../.." || exit 1
[ $# -eq 0 ] && { echo "usage: guard.sh <paths...>"; exit 2; }
fail=0

# ripgrep if installed, else grep -E (macOS grep handles \b). Usage: search <pattern> [--tsx] <paths...>
if command -v rg >/dev/null 2>&1; then HAVE_RG=1; else HAVE_RG=0; fi
search() {
  local pat="$1"; shift
  local tsx=0; [ "$1" = "--tsx" ] && { tsx=1; shift; }
  if [ $HAVE_RG -eq 1 ]; then
    if [ $tsx -eq 1 ]; then rg -n -g '*.tsx' "$pat" "$@"; else rg -n "$pat" "$@"; fi
  else
    if [ $tsx -eq 1 ]; then grep -rnE --include='*.tsx' "$pat" "$@"; else grep -rnE "$pat" "$@"; fi
  fi
}
echo "== 1. copy-lint"; npx tsx scripts/checks/copy-lint.ts "$@" || fail=1

echo "== 2. lean identifiers"
search "TiltGauge|LeanPill|computeEdgeRead|leanLabel|LEAN_Z|EdgeRead|edge_score|factors_lean|nfl_edge_factors|nfl_edge_score_history" "$@" && fail=1


# Legacy violations that existed before the guard (8 Oct 2026) are listed in guard-baseline.txt as
# "<check><TAB><file>". They are reported but do not fail. Any file NOT in the baseline fails.
BASELINE="scripts/checks/guard-baseline.txt"
in_baseline() { grep -qxF "$1"$'\t'"$2" "$BASELINE" 2>/dev/null; }
split_hits() { # $1=check name; stdin = grep hits "file:line:text"
  local legacy="" new=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    f="${line%%:*}"
    if in_baseline "$1" "$f"; then legacy+="$line"$'\n'; else new+="$line"$'\n'; fi
  done
  [ -n "$legacy" ] && echo "(legacy, in baseline, not failed: $(echo -n "$legacy" | cut -d: -f1 | sort -u | tr '\n' ' '))"
  if [ -n "$new" ]; then echo "$new"; return 1; fi
  return 0
}

echo "== 3. logos / headshots"
hits=$(search "\b(headshot|teamLogo)\(|espncdn|assets\.nhle|img\.mlbstatic|<img[^>]*(logo|headshot)" "$@")
echo "$hits" | split_hits logos || { echo "FAIL: logo/headshot"; fail=1; }

echo "== 4. lg: classes"
hits=$(search "\blg:" --tsx "$@")
echo "$hits" | split_hits lg || { echo "FAIL: lg: class"; fail=1; }

echo "== 5. fetch( in render paths"
hits=$(search "fetch\(" "$@" 2>/dev/null | grep -vE "^(scripts/|src/app/api/cron/|src/lib/email/)" | grep -E "^(src/app/.*page\.tsx|src/components/|src/lib/)" | grep -v "\.server-fetch-allowed\.ts")
echo "$hits" | split_hits fetch || { echo "FAIL: fetch in a render path"; fail=1; }

echo "== 6. banned fonts — Red Hat Display is the ONLY font (.ts/.tsx only)"
hits=$(search "Fraunces|Bebas|JetBrains|Space Mono|Courier|monospace|Caveat|font-mono|font-serif|Georgia" "$@" | grep -E "\.tsx?:")
echo "$hits" | split_hits fonts || { echo "FAIL: banned font"; fail=1; }

echo "== 7. isPro defaults (reported, not failed)"
search "isPro[[:space:]]*[:=][[:space:]]*true|is_pro[[:space:]]*\?\?[[:space:]]*true|isPro\?:.*=[[:space:]]*true|NODE_ENV === 'development'" "$@"

[ $fail -eq 0 ] && echo "GUARD OK" || echo "GUARD FAILED"
exit $fail
