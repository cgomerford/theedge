# ARCHIVED — 3D pitcher / broadcast park (parked 2026-10-19)

Parked by George until better graphics are available. Nothing here is imported by the app, scheduled, or served.
The live replacement is the abstract release-point + pitch-break view (`mockups/pitch-view.html`).

| Folder | What it is | To revive |
|---|---|---|
| `pitcher-asset/` | Headless-Blender pipeline: MPFB body + CMU subject 124 pitch -> `pitcher.glb` (see its README for sources, licences and the open MPFB / CMU questions) | `git mv archive/pitch-3d/pitcher-asset scripts/pitcher-asset`; its scripts compute paths relative to `scripts/pitcher-asset`, so they only work from there |
| `models/pitcher.glb` | The built asset (0.23 MB) | copy to `public/models/` |
| `dev-routes/pitch-3d-mockup/` | Night-park broadcast mockup (real pitcher, stand-in park/figures, fake pitches) | move to `src/app/dev/` (404s in production) |
| `dev-routes/pitcher-preview/` | Bare viewer for the GLB | same |
| `data-pipeline/` | Per-pitch Statcast flight table: migration (never applied), writer script, GitHub workflow (cron removed from `.github/workflows` so it cannot run) | apply the migration, move the script/workflow back |
| `pitch-story-3d-mockup.html` | Copy of the earlier capsule-pitcher Pitch Story mockup | reference only |

Open questions that were never settled (needed before shipping the 3D human): MPFB "no rights reserved" for generated bodies is unverified (the add-on code is GPL-3.0-or-later); CMU's "do not resell, even in converted form" vs a publicly served baked clip.
