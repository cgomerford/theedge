# pitcher-asset — builds `public/models/pitcher.glb`

A faceless, stylised, skinned human with a **real recorded baseball pitch** on it, made entirely by scripts in headless Blender.
No clicking in Blender, no video, no hand animation.

```bash
bash scripts/pitcher-asset/build.sh      # ~10 s once the downloads exist; re-runnable
```

Pipeline (`build.sh` runs it in order): `make_body.py` → `work/body.blend` → `retarget.py` → `work/rigged.blend` → `export.py` → `public/models/pitcher.glb`,
then `render_previews.py` (4 PNGs in `preview/`) and the acceptance checks (`verify_glb.py`, `verify_motion.py`, `test/run_three_test.mjs`).

## Sources, versions, licences (verified on 2026-10-19)

| What | Exact source | Version | Licence — what I verified |
|---|---|---|---|
| Blender | https://www.blender.org/download/ (macOS app) | **5.2.2 LTS** (brief said 4.x; MPFB requires ≥ 4.2) | GPL |
| MPFB (MakeHuman Plugin For Blender) | Blender extensions: https://extensions.blender.org/add-ons/mpfb/ — file `https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip` (SHA-256 `c075b3e9…2dad`, checked by `build.sh`). MakeHuman's own downloads page confirms MPFB is now distributed through the extensions platform. | **2.0.18** (released 2026-10-11) | The add-on's `blender_manifest.toml` and the extensions index both say **GPL-3.0-or-later** (the *code*). **I could not verify the "no rights reserved / CC0" statement for the base mesh or generated characters**: the package has no base-mesh licence file (only a *default* of CC0 for assets users create), and the MakeHuman pages I fetched did not state it. **Please confirm MakeHuman's licence terms for exported characters before shipping.** |
| Motion capture | CMU Graphics Lab Motion Capture Database, subject **124** "Sports Related Motions", trials **1** and **2** = "Baseball Pitch" (120 fps). `http://mocap.cs.cmu.edu/subjects/124/124.asf`, `…/124_01.amc`, `…/124_02.amc`. Trial list: `http://mocap.cs.cmu.edu/search.php?subjectnumber=124` | 2 trials | CMU terms (quoted from http://mocap.cs.cmu.edu/): *"This data is free for use in research projects. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form."* Acknowledgement they ask for: *"The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."* |
| ASF/AMC → BVH | **`amc2bvh.py` in this folder (written for this project)** | — | Own code. No maintained converter exists: the cgspeed BVH conversion page returns 404, `sxaxmz/amc2bvh` was last touched in 2021 and has no licence, PyPI `bvh-converter` goes BVH→CSV. |
| three.js (test only) | `three@0.160.0` from jsDelivr, used by `test/three_load.html` | 0.160.0 | MIT |

**CMU caution — please read.** The raw `.asf/.amc` files are never committed and never placed in `/public` (they are in `downloads/`, git-ignored).
`pitcher.glb` does contain a *baked animation derived from* trial 124_02, and it is served publicly. Using the animation inside a commercial product is allowed;
CMU's "do not resell the data directly, even in converted form" means the clip must not be offered as a standalone download/product. The glTF is
reachable by URL, so someone could save it. That is a judgement call for you; the acknowledgement text above should go on the site's credits page either way.

## What was built

* **Body** (`make_body.py`) — MPFB `HumanService.create_human` → macro sliders (male, muscle 0.70, weight 0.42) with the height macro bisected to **6′2.0″ (1.8796 m)**;
  `TargetService.bake_targets`; MPFB's built-in **`mixamo` rig** (bones are already `mixamorig:Hips/Spine/Spine1/Spine2/Neck/Head/…` with matching weights; the
  brief's `BONE_MAP` game_engine→Mixamo table is kept in the script as the fallback if `RIG_NAME = 'game_engine'` is chosen); helper geometry deleted; head melted into a
  featureless egg (Taubin smoothing + ellipsoid projection + deleting inward-facing faces), eyes/brows/teeth gone with the helper geometry; **11,850 triangles**.
  Materials (flat, no textures): skin and shirt `#1A1A1A` r0.55, pants `#FAF8F3` r0.80, right sleeve and cap brim `#FF5722` r0.55. Cap = half UV-sphere dome + flat brim, skinned 100% to the Head bone.
  MPFB ships **no clothing assets** (zero `.mhclo` files; they are separate asset packs), so the shirt/pants/sleeve are material regions cut by clean planes.
* **Animation** (`retarget.py`) — CMU 124_01 (1 pitch) and 124_02 (2 pitches) → three candidates, scored; the best is retargeted by **rest-pose-offset retargeting**
  (`R_target(f) = [R_src(f)·R_src_rest⁻¹]·A·R_target_rest`, `A` = the rotation that lines the two rigs' rest bones up, i.e. both rigs "in the same T-pose"; root location = scaled hips displacement),
  foot-locked with two-bone leg IK (contacts = ankle within 5 cm of the floor, held until 9 cm; the pelvis is nudged toward any anchor out of reach), Gaussian-smoothed (σ = 2 source frames,
  not the throwing arm within ±3 output frames of release), trimmed, resampled to **30 fps**, baked into actions **`delivery`** (66 frames, 2.2 s), **`set`** (1 frame) and **`idle_ready`** (30-frame hold of the last frame).
  The subject throws **right-handed** (right hand peak 11.4 m/s vs 6.2), so no mirroring was needed; the mirror path exists (`PITCHER_FORCE_MIRROR=1` smoke-tested that it runs, not that it looks right).
* **Export** (`export.py`) — glTF binary, skinned, **Draco**-compressed, no images/textures, extras on the armature node:
  `releaseFrame` = **45** (0-based frame of peak forward hand speed, nudged to the first frame the hand is ahead of the front foot), `fps` = **30**, `stretchFrame` = **28** (see note), plus `footStrikeFrame` = 41 and `forwardXY` = the throwing direction in the source scene.
  **0.23 MB**.

### Candidate scoring (logged by `retarget.py`)

| Pitch | Front-foot slide after strike | Largest single-frame bone rotation | Result |
|---|---|---|---|
| 124_01 | 9.31 in | 66.8° | rejected (slide) |
| **124_02, pitch 1** | **0.00 in** | **81.3° (RightArm)** | **chosen** |
| 124_02, pitch 2 | 0.00 in | 119.0° (RightHand) | rejected (wrist flip) |

## Acceptance results (all measured on the exported file, not inside the solver)

| Check | Result |
|---|---|
| GLB loads in three.js (`GLTFLoader` + `DRACOLoader`, headless Chrome) | **PASS** — 6 skinned meshes, 11,850 tris, 52 bones, 3 clips, extras read back |
| Bone names match the Mixamo map; `delivery` exists; `releaseFrame` set | **PASS** |
| Front-foot slide after strike < 0.5 in (re-imported GLB, frame by frame) | **PASS** — 0.00 in |
| No bone flips/twists > 90° frame to frame | **PASS** — largest 81.3° (RightArm at frame 50) — margin is thin |
| Face has no features; no logos/text anywhere | **PASS** with caveats — see below |
| Sources/versions/licences listed | this file; **the MPFB "no rights reserved" claim is unverified** |

## Known defects and judgement calls

* **Faint dark smudges remain where the eye sockets were** (invisible from behind, which is the site's broadcast camera). The jersey/pants hem and the sleeve edge are slightly jagged (polygon-level cuts).
* The front-leg lift in this take is a wide, nearly straight **kick** — that is how the subject moved, not a retarget error. The fingers are not animated (rest pose).
* Heads-tall: the head was enlarged 4% toward 7.5 heads, but my crude chin-detection measures **≈ 7.9** on the final mesh; I did not verify 7.5. The MPFB `proportions` macro had no effect on this build (identical results for 0.5–1.0), so it is fixed at 0.80.
* `stretchFrame` is not defined in the brief; I used the frame of **peak leg lift** (the moment a stretch-style delivery would shorten). Tell me if you meant something else.
* Foot slide is measured for the **front** foot only; the pivot foot is locked while on the floor but not independently measured.
* The Draco output is identical in content between runs (bones, clips, frames) but **not byte-identical** (one Draco buffer differs by a byte).
* glTF is Y-up. The throwing direction in glTF XZ is ≈ (−0.185, +0.983), i.e. he travels toward +Z; the page rotates the model so that matches the plate. The animation includes root motion (the stride).

## Files

`build.sh` · `make_body.py` · `retarget.py` · `export.py` · `amc2bvh.py` · `preview.py` + `render_previews.py` · `verify_glb.py` · `verify_motion.py` · `test/three_load.html` + `test/run_three_test.mjs`
Git-ignored (never commit): `downloads/` (MPFB zip, CMU files), `work/` (.blend files, BVH, reports).
