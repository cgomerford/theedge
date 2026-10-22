#!/usr/bin/env bash
# build.sh — build public/models/pitcher.glb from scratch (idempotent: re-running reuses downloads and overwrites outputs).
#   bash scripts/pitcher-asset/build.sh
# Needs: Blender 4.2+ (tested on 5.2.2 LTS), python3, curl, node (for the three.js load test), Google Chrome (same test).
# Blender is found from $BLENDER, then `blender` on PATH, then the macOS app bundle.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p downloads work preview

# --- 0. Blender ---------------------------------------------------------------------------------------------------------
BLENDER="${BLENDER:-$(command -v blender || true)}"
[ -z "$BLENDER" ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ] && BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
if [ -z "$BLENDER" ]; then
  echo "Blender not found. macOS: brew install --cask blender   (then: ln -s /Applications/Blender.app/Contents/MacOS/Blender /usr/local/bin/blender)"; exit 1
fi
VER="$("$BLENDER" --version | head -1)"; echo "== $VER ($BLENDER)"
MAJOR="$(echo "$VER" | sed -E 's/Blender ([0-9]+)\.([0-9]+).*/\1/')"; MINOR="$(echo "$VER" | sed -E 's/Blender ([0-9]+)\.([0-9]+).*/\2/')"
if [ "$MAJOR" -lt 4 ] || { [ "$MAJOR" -eq 4 ] && [ "$MINOR" -lt 2 ]; }; then echo "MPFB 2.0.x needs Blender 4.2 or newer"; exit 1; fi
export BLENDER

# --- 1. downloads (never committed; see .gitignore) -----------------------------------------------------------------------
MPFB_VER=2.0.18
MPFB_SHA=c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad
MPFB_URL="https://extensions.blender.org/download/sha256:${MPFB_SHA}/add-on-mpfb-v${MPFB_VER}.zip"
MPFB_ZIP="downloads/mpfb-${MPFB_VER}.zip"
if [ ! -f "$MPFB_ZIP" ]; then echo "== downloading MPFB ${MPFB_VER}"; curl -fsSL -o "$MPFB_ZIP" "$MPFB_URL"; fi
echo "${MPFB_SHA}  ${MPFB_ZIP}" | shasum -a 256 -c - >/dev/null || { echo "MPFB checksum mismatch"; exit 1; }
for f in 124.asf 124_01.amc 124_02.amc; do   # CMU asks people not to crawl the database: three small files, fetched once
  [ -f "downloads/$f" ] || { echo "== downloading CMU $f"; curl -fsSL -o "downloads/$f" "http://mocap.cs.cmu.edu/subjects/124/$f"; }
done

# --- 2. MPFB installed + enabled (persisted in the user's Blender preferences) ---------------------------------------------
if ! "$BLENDER" -b --python-expr "import importlib; importlib.import_module('bl_ext.user_default.mpfb')" >/dev/null 2>&1; then
  echo "== installing + enabling MPFB ${MPFB_VER}"
  "$BLENDER" -b --factory-startup --command extension install-file -r user_default --enable "$MPFB_ZIP"
fi

# --- 3. build ------------------------------------------------------------------------------------------------------------
"$BLENDER" -b -P make_body.py                      2>&1 | grep -E "MAKE_BODY|Error|Traceback" || true
"$BLENDER" -b work/body.blend -P retarget.py       2>&1 | grep -E "RETARGET|Error|Traceback" || true
"$BLENDER" -b work/rigged.blend -P export.py       2>&1 | grep -E "EXPORT|Error|Traceback" || true
python3 render_previews.py "$BLENDER"

# --- 4. acceptance checks (non-zero exit if any fail) -----------------------------------------------------------------------
python3 verify_glb.py
"$BLENDER" -b --factory-startup -P verify_motion.py 2>&1 | grep -E "VERIFY: (PASS|FAIL|summary)"
node test/run_three_test.mjs | head -8
echo "== done: ../../public/models/pitcher.glb"
