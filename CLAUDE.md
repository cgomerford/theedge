# CLAUDE.md — The Edge (edgereportdaily.com)

@AGENTS.md

Read this file at the start of every session. It is the source of truth for how this project is built, what it is (and is not), and how to work with George.

---

## 1. What this project is

**The Edge** is a multi-sport analytics platform. George is the sole founder and developer, and is a novice developer — explain the *why* behind changes, not just the *what*.

- **MLB:** live.
- **NFL:** launch deadline was **Sept 9, 2026** (hard). Treat NFL as in-season and verify current state before assuming a feature exists.
- **Future:** NHL/NBA are on the roadmap, not started.
- Originally conceived as "Savant Intel" (AI Statcast pre-game briefings). It is now **The Edge**.

### Product identity: a translation layer
The Edge takes advanced stats and makes them legible to casual fans through **tables, charts and graphics**, while keeping enough depth for hardcore and fantasy users. Prose narrative is supporting material, **not** the core format (it has been deliberately deprioritized).

### Hard content rules (non-negotiable)
- **Not a betting/tips product.** No "picks", "locks", "odds", "value bet", or any gambling-adjacent language anywhere (UI, emails, social, code comments that surface to users). Use **"reads", "leans", "factors"**.
- **The raw Edge Score is internal only.** It must never appear on any public surface, email, or social copy.
- Public display uses **factor-count language**: "X of 8 factors lean TEAM". Do **not** build percentage win-probability meters, "58% | 42%" splits, or confidence gauges derived from the Edge Score.
- Social/X content: factor-count language only, no raw scores, no picks. **Links go in replies, not post bodies.**
- **Empty state over fabricated data. Always.**

---

## 2. Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript, Recharts, `html-to-image` (PNG export) |
| DB | Supabase (Postgres) via `createAdminClient()` (synchronous, **no** `Database` generic → all queries need explicit type casts) |
| Pipelines | Python via GitHub Actions: `pybaseball` / Baseball Savant CSVs, MLB Stats API (free, no auth), `nflreadpy` + Polars for NFL |
| Email | Resend |
| Auth | Custom session cookie `edge_session`; `getCurrentSubscriber()` in `src/lib/auth.ts` |
| Video/export | `ffmpeg.wasm` (single-threaded), Remotion (local CLI, admin-only), `captureStoryToMp4` pipeline |
| Hosting | Vercel; crons in **both** `vercel.json` and `.github/workflows/` |
| Payments | Stripe — **blocked** pending business verification |
| Editor | Tiptap (articles) |

**Charts:** use **Recharts** (already in the stack). Do not introduce Chart.js/Plotly or a paid data provider (e.g. SportsDataIO) without George's explicit say-so.

### Environment
- Mac / zsh. Working dir: `/Users/georgecomerford/Documents/theedge`
- Python: `python3` (3.9 locally), venv `venv-nfl` for NFL scripts. Use `from __future__ import annotations` for union types.
- **The repo lives in iCloud Drive**, which can create duplicate `.next/types` files. Fix: `rm -rf .next`.
- Env var names differ by context — **support both with a fallback**:
  - `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (workflows map these onto either naming set — check the workflow's `env:` block; Python scripts use a dual-dotenv fallback)
- `.env*` is gitignored. Never print or commit secrets.

---

## 3. Architecture rules

### Precompute is the architecture
Live fan-out to external APIs during page render was the root cause of every performance/reliability failure (game pages were pulling 18+ Baseball Savant CSVs at 2–2.5 MB each plus MLB Stats API bursts → `ECONNRESET`, timeouts).

**The pattern:** `cron (GitHub Actions) → Python script → Supabase table → page reads cached row(s)`.

- Never fetch Baseball Savant CSVs in the render path — they exceed the Next.js 2 MB fetch-cache ceiling. Precompute and store.
- Schema locked → data layer confirmed → precompute cron → **then** page wiring. In that order.
- **Single writer per Supabase table.** Never let two scripts write the same column; document table ownership in a code comment at the top of the writer.
- Slow upstream cron dependencies matter: e.g. `compute_regression_watch.py` (10:00 UTC) must run *after* `fetch_ultimate_team_pool.py` and the pitcher-stats refresh. When adding a cron, state what it depends on and pick the time accordingly.
- After adding or editing any cron, check **both** `vercel.json` and `.github/workflows/` (the `key-players-snapshot` cron was once missing from `vercel.json` entirely; orphaned workflows have happened before).
- Slow server data goes behind `<Suspense>` in async Server Components (e.g. `ScoutSlotAsync` on the MLB game page halved stream time).

### Error handling
- Data functions return `null` / `[]` on failure with an explicit prefixed log:
  `console.error('[fnName] Supabase error:', error.message)`
- No silent failures. No fabricated fallbacks.
- Publishing flows are explicit steps (e.g. articles: `createArticle` makes a draft; `publishArticle` sets `status` + `published_at` together).

---

## 4. Known gotchas (learned the hard way)

**Supabase / Postgres**
- `numeric` columns come back as **strings** → always coerce with `Number()`.
- PostgREST caps at **1,000 rows** → paginate or use an RPC.

**MLB**
- MLB Stats API rejects concurrent bursts from one process (`ECONNRESET`). Throttle with `MAX_CONCURRENT = 6` (`throttledMlbFetch` utility; only partially applied so far, e.g. `streaks.ts`).
- Statcast CSVs can carry a UTF-8 **BOM** that silently corrupts the first header → velocity-matched pitch-type contributions returned null. Strip the BOM.
- Wrong MLB Stats API endpoint caused empty stat columns on the minor-league team page; per-player fetching fixed it. Verify the endpoint returns the fields you need.

**NFL**
- `load_participation()` → `load_pbp()` join: `left_on=['nflverse_game_id','play_id']`, `right_on=['game_id','play_id']`, with `pl.col('play_id').cast(pl.Float64)` on **both** frames.
- **ESPN team ID maps are corrupted** — verify every ID against a live curl. Team ID reconciliation (LAR, ARI) must be fixed before coverage-matchup data is trusted.
- Coverage type values use underscores (`COVER_3`, `2_MAN`) — use an explicit mapping, not string replace.

**React / components**
- Positional destructuring of `Promise.all` breaks when you add a fetch mid-array (everything after shifts). Put new fetches in a **separate** `Promise.all` block.
- **`isPro` must never default to `true`** (this leaked to logged-out users before). Every component takes `isPro` as a **required prop**; never infer or default it. Don't add `proOnly` redirects to nav components (`FantasySubNav.tsx` caused a hard-navigation bug).
- Tailwind v4/Turbopack responsive class generation is unreliable → for responsive layout use inline styles or `<style>` blocks with plain CSS `@media`.
- Clamp/normalize percentages (`normPct()`) and give bullpen/scouting cards defensive fallbacks; a duplicated `UmpireScoutingCard` render was a past bug.

**Python scripts**
- Print a **5-row sanity sample and give an abort window before any upsert**.
- Dual dotenv fallback (local vs GitHub Actions naming).
- Note workflows currently pin mixed Python versions (3.9 and 3.11); write code that works on 3.9.

---

## 5. Feature map (where things live)

| Area | Notes |
|---|---|
| MLB game page | `src/app/mlb/[slug]/page.tsx` — **primary active workstream** (perf + architecture). Scout Report: pitcher hot zones, zone arsenal, batter zones, spray charts, TTO pipeline v2, `BatterZoneArsenalGrid`, `BatterAttackPlanCard` (thread pitcher handedness correctly), umpire scouting module, batting tab (Statcast radar, OPS trend, handedness splits, H2H) |
| Post-game | `src/lib/postgame.ts`, `PostGameReportTab.tsx`, route `/mlb/[slug]/postgame`; pitch-count heatmaps, spray charts, performer leaderboards, win-probability line, umpire missed calls, manager decisions. Dev preview: `/dev/postgame-preview/[gamePk]` |
| Email | Resend. Pre-game daily digest cron + post-game recap cron (polls for finished games). Both use **bearer-token auth** and a dedup table (`postgame_email_log`) to prevent double-sends |
| Team pages | `TeamDugoutView.tsx` (lineup optimizer, bullpen usage, pitcher workload grid, inning-usage combo charts); GM Lab (`GmLabContent.tsx`, `src/lib/team-transactions.ts`) |
| Fantasy | `FantasyHub.tsx`, `FantasySubNav.tsx`, Weekly Wrap at `/fantasy/wrap`, minor-league team page (`TeamMiniDugout` pattern) |
| NFL | QB Room, WR Room, OC/DC pages, `nfl_situational_tendencies`, `nfl_team_scheme_profile`, `sync_qb_coverage_pressure.py`, `sync_wr_coverage_pressure.py`, Madden-style SVG formation/coverage diagrams, game pages, homepage, Fantasy Hub wireframe |
| Admin | `GamePreviewTeaser` (animated video export, ffmpeg concat with cross-slide transitions), `TrendingPlayersSection` (MLB/AAA/AA), Scout Report Graphic, articles editor (`src/lib/articles.ts`) |
| Narrative | Claude prompt system split into **Free** and **Pro** voice profiles |

---

## 6. Brand & design system

- Colors: cream `#FAF8F3`, orange `#FF5722`, yellow `#FDE047`, black `#1A1A1A`
- Type: **Fraunces** (serif), **Bebas Neue** (display), **JetBrains Mono** (data)
- **Zero border-radius** (exceptions: team / Dugout pages)
- Section markers: `⊕` / `§`
- Prefer visual, mobile-friendly deliverables. Mobile rendering pass is still outstanding.

---

## 7. Product direction (from the mid-2026 competitor review)

**Positioning:** the accessible-yet-deep pre-game intelligence layer. Savant, FanGraphs, databallr, Natural Stat Trick / Evolving Hockey and PFF serve experts with dense data; The Athletic serves readers with narrative. The Edge sits between: clear visuals + transparent factors, with depth on demand.

**Priorities (in order):**
1. **Game pages are the core product** — more factors, richer interactive visuals (heatmaps, spray charts, radar, trend lines, sortable/color-coded tables), clickable factors with explanations and sources.
2. Player pages / Pro Lab (`/mlb/players/[id]/lab`: pitcher mechanics/fatigue, approach/results, batter DNA; sweep-reveal animation; admin-only MP4 export via Remotion) and Batting Lab / Pitching Lab (Pro-gated).
3. NFL game-page wiring, then NFL Fantasy Hub (coverage matchup explainer, waiver recommendations, trade grades with **now-value and dynasty-value shown separately**).
4. Trust/transparency: glossary ("Learn the Language"), data-source notes, "how factors work" page.
5. SEO (homepage copy, team/player discovery terms), mobile pass, Stripe once verified.

**Where the review conflicts with house rules — house rules win:**
- Review suggested a "who has the edge" percentage meter → use **factor counts / tilt bars** instead.
- Review suggested publishing "our edges were X% accurate" → **do not build without George deciding the framing** (risks reading as betting-adjacent).
- Review suggested Chart.js/Plotly and SportsDataIO → stay on **Recharts** and free public APIs.
- Review favoured a long LLM narrative as the hero → narrative stays **supporting**.

---

## 8. How to work with George

**Sequencing**
1. **Diagnose before patching.** Reproduce, read the real code/logs, then change.
2. **Verify externals with curl** before writing any parser. Field names come from the live response, never from documentation or memory. Treat pasted terminal output as ground truth.
3. **Mockup-first:** get an HTML mockup approved before building a React component (George can waive this explicitly).
4. **Schema locked → data layer → precompute cron → UI wiring.**
5. **One file (or one concern) at a time**, and confirm before moving on. Don't sprawl across many files unasked.

**Delivering changes**
- Surgical edits: minimal, exact changes. Large structural changes: complete file replacement rather than a diff.
- Give step-by-step instructions **with the rationale** for each step.
- Run a TypeScript check / build after changes and report the result; don't claim something works without verifying it.
- When removing dead code (e.g. the ~190-line hot-streaks / `scoutInputs` block in `page.tsx`), confirm what's dead before deleting.

**Before you finish any task, check:**
- [ ] No betting language; no raw Edge Score exposed
- [ ] `isPro` passed as a required prop, never defaulted
- [ ] `Number()` coercion on Supabase numerics; pagination if >1,000 rows
- [ ] No live Savant/MLB fan-out added to a render path
- [ ] Single writer per table respected
- [ ] Errors logged with `[fnName]` prefix; `null`/`[]` returned, nothing fabricated

---

## 9. Open items / active bugs

- Finish cleanup of dead variables in `src/app/mlb/[slug]/page.tsx` (pending removal of ~190-line hot-streaks/`scoutInputs` block after a fresh paste of lines ~600–790).
- Move remaining live-fetched game-page data (Savant CSVs, MLB Stats API calls) into nightly precompute crons — temporary stubs are currently in place.
- `ECONNRESET` bursts when Savant fetch stubs are removed; extend `throttledMlbFetch` beyond `streaks.ts`.
- NFL: wire game pages to `nfl_situational_tendencies` and other precomputed tables; create `nfl_player_coverage_splits` materialized table; fix team-ID reconciliation; curl-verify the Sleeper ownership endpoint before wiring.
- Vercel plan tier (Hobby vs Pro) vs cron schedule support; confirm production migration for `postgame_email_log`.
- Pro-tier gating: needs a `tier` column on `subscribers` before Stripe-based gating; Stripe activation blocked on business verification.
- Mobile rendering pass.