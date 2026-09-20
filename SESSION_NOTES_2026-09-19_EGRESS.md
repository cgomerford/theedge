# Supabase egress — handoff (2026-09-19)

**Problem:** the project exceeded Supabase's **5 GB monthly egress** limit (confirmed by George: it was egress).
**Not the problem:** storage. All tables together are only ~430 MB, so dropping tables will not help.
Egress = data Supabase sends *out* (every `select` result). It is driven by *how often* big rows are read, not by how many tables exist.

## Evidence so far (table sizes, from the size query)

| Table | Size | Rows | ≈ per row | Notes |
|---|---|---|---|---|
| `pitch_events` | 115 MB | 455k | 250 B | used by Statcast event scripts (writes), no `src/` reader found |
| `nfl_player_stats_weekly` | 74 MB | 31k | 2.4 KB | NFL |
| `key_players_snapshot` | 31 MB | 2.4k | **~13 KB** | JSONB; read by `src/lib/key-players.ts` |
| `edge_predictions` | 23 MB | 1.7k | **~13 KB** | JSONB; read by share pages, cron, admin |
| `savant_fetch_cache` | 20 MB | 312 | **~65 KB** | JSONB blobs; read by `src/lib/savant-cache.ts` (`withSavantCache`) |
| `game_previews` | 9 MB | 1.8k | ~5 KB | `raw_data` JSONB; read by 8+ components/pages |

Total DB ≈ 430 MB. A 5 GB month means these rows are being re-read thousands of times.

## Ranked suspects (unconfirmed — verify before fixing)

1. **`savant_fetch_cache` (~65 KB/row).** Every Scout Report render calls `withSavantCache` many times (team trends, alignment, pop-time, sprint, OAA, poptime…). Pages have `revalidate = 60`, so each regeneration can pull ~1 MB+. Bots/crawlers hitting many game URLs multiply this.
2. **ISR revalidate too short for finished games.** Scout report `revalidate = 60`, postgame `300`. A *final* game's data never changes — finished-game pages could use a day or more.
3. **Whole-table loads in `src/lib/scout/`:** `getAbsRows()` (all ~7.4k `abs_challenge_log` rows) and `getSbRows()` (all `sb_attempt_log` rows, paginated) — cached in-process only 10 min per serverless instance, so cold instances re-read everything. Better: per-team queries + a shared cache, or precompute.
4. **`game_previews.raw_data` read separately by many components in one request** (`KeyPlayersSlotAsync`, game page, scout, postgame, share pages…). Dedupe with React `cache()` and select only the fields needed.
5. **`select('*')` on big-JSON tables:** 83 `select('*')` calls in `src/`. Notably `src/app/mlb/[slug]/page.tsx:183` (`game_previews`), `share/page.tsx`, `mlb/[slug]/share/page.tsx`, `cron/grade-predictions`.
6. **`force-dynamic` pages** (never cached): `/tonight`, `/fantasy/*` (10 pages), `/nfl/[slug]`, admin pages. Each hit re-queries Supabase.
7. **My own local testing.** `.env.local` points at the *production* Supabase project, and `next dev` doesn't cache — every localhost render of the Scout/Postgame pages (dozens today) counted against egress. Probably hundreds of MB, not GBs, but real. Fix: a separate dev Supabase project (or a read-only dev key) so testing doesn't burn prod egress.
8. **Crawlers / link previews / share-card image routes** (`/api/share-card/[gamePk]`) hitting `edge_predictions`.

## Step 1 next session — confirm the top offenders (5 minutes)

Supabase dashboard → **Reports → API** (requests by endpoint/table over the month) and **Settings → Usage** (egress by day, so a spike date can be matched to a deploy/crawler). Then in the SQL editor:

```sql
-- heaviest queries by rows returned (needs pg_statements enabled; on by default in Supabase)
select left(query, 140) as query, calls, rows,
       round(rows::numeric / nullif(calls, 0), 1) as rows_per_call
from pg_stat_statements
order by rows desc
limit 25;
```

```sql
-- average row size per table (bytes) — big JSONB tables are the egress multipliers
select relname as table_name, n_live_tup as rows,
       pg_size_pretty(pg_total_relation_size(relid) / greatest(n_live_tup, 1)) as avg_row
from pg_stat_user_tables
order by pg_total_relation_size(relid) / greatest(n_live_tup, 1) desc
limit 20;
```

`rows × avg_row × calls` per query ≈ egress. That ranks the fixes above with evidence instead of guesses.

## Fix plan (in this order; smallest change first)

1. **Longer cache on finished games** — set `revalidate` to 86400 (or higher) on scout-report and postgame when the game is Final; keep short only for live/upcoming.
2. **`savant_fetch_cache`:** add an in-process memo in `withSavantCache` (same key within a warm instance = no DB read), raise TTLs where the data is daily, and don't refetch per section (several sections read the same keys).
3. **Slim the selects:** replace `select('*')` on `game_previews`, `edge_predictions`, `key_players_snapshot` with the specific columns; wrap `game_previews` reads in React `cache()` so one request reads it once.
4. **`src/lib/scout/abs-desk.ts` / `situations.ts`:** query per team (and per date window) instead of loading the whole log; or precompute per-team JSON nightly.
5. **Bot control:** check Vercel logs for crawler traffic on `/mlb/*` and `/api/share-card/*`; add `robots.txt` rules / rate limits if it's bots.
6. **Separate dev project** so local testing stops counting.
7. **Pragmatic backstop:** Supabase **Pro** (~$25/mo) includes 250 GB egress — a legitimate option if traffic is genuinely growing, but fix the obvious waste first.

## Tables we can safely drop/prune (secondary — helps size, not egress)

Not confirmed unused yet; verify each has no reader/writer before dropping (rename to `_trash_<name>` for a day first):
empty/near-empty: `articles`(0 rows), `nfl_editorial_posts`, `ultimate_team_squads`, `batter_venue_adjusted_spray`, `series_context`(0), `nfl_teams`(0), `nfl_team_season_reports`(0).
Prune old rows (not drop): `savant_fetch_cache` (expired keys), `fantasy_ownership_history` (134k rows, 14 MB), `pitch_events`.
Leave NFL alone (in-season).

---

## Everything else in flight (so a `/clear` loses nothing)

- **Scout Report:** `SESSION_NOTES_2026-09-19_SCOUT_REPORT.md` — all 12 sections live plus iteration 2 (§1 roster makeup, §5 at-bat-when-running, §8/§6 info popovers, §10 metric toggle in red/blue, §11 late-innings tab, §12 manager sheet with print). **SQL still to run** (before pushing the script): `scripts/sql/add_sb_batter_context.sql`, `add_late_inning_log.sql`, optional `add_player_contracts.sql`; then backfill `python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>`, then `fetch_batter_hot_zones.py`.
- **Postgame:** `SESSION_NOTES_2026-09-19_POSTGAME.md` — page rebuilt in Scout format; §1–5 live (final, swing chart, top performers, box score, hand-scored scorecard with PDF download); §6–13 free and §14–22 Pro are registered as "coming next". Next sections suggested: §8 ABS & challenges, §9 bullpen used tonight.
- **X card mockup:** parked (`mockups/x-scout-card.html`).
- **Known lint error not mine:** `src/components/postgame/RadarChart.tsx` (`cumulativeAngle`).
- Nothing has been committed to git this session.
