// src/lib/admin-dashboard-cards.ts
//
// Feeds StatCardPanel from /admin/dashboard. Separate file from
// admin-dashboard.ts on purpose: that file's existing exports
// (getDailyPerformance, getTodaysReads, buildSnips) are TEAM-level —
// built from edge_predictions components and used for the Snip Studio
// X-post drafts. This file is PLAYER-level — built from MLB IDs +
// streaks.ts — and feeds a genuinely different feature (the stat card
// image generator), so it gets its own module rather than overloading
// admin-dashboard.ts's job.
//
// Requires edge_predictions to carry home_pitcher_id / away_pitcher_id /
// home_team_id / away_team_id (confirmed present — adjust the exact
// column names below if yours differ).
//
// ─────────────────────────────────────────────────────────────────────────
// TYPING NOTE — read this if you hit a Supabase type error here again
// ─────────────────────────────────────────────────────────────────────────
// `GenericStringError` is what supabase-js's generated types collapse a
// row into when it can't match the .select() string against a known
// schema — this happens when createAdminClient() isn't built with
// `createClient<Database>(url, key)` using real generated DB types (run
// `npx supabase gen types typescript` to generate them). Without that
// generic, supabase-js has no schema to check column names against, and
// in some supabase-js versions the fallback for "unknown schema" is this
// error-shaped type rather than a plain `any`/`Record<string, unknown>`.
//
// Casting the RESULT (`data as GameRow[]`, `data as Record<string, unknown>[]`)
// doesn't work here because TypeScript already considers the two types
// non-overlapping before the cast runs — `unknown` is the only type you can
// cast a `GenericStringError[]` into directly, and you have to cast it to
// THAT exactly, then re-cast from there. That's what queryUntyped() below
// does, once, in one place, so the workaround is contained and doesn't
// repeat at every call site.
//
// The proper long-term fix is generating real Supabase types and binding
// them to the client (see above) — then this whole queryUntyped() helper
// becomes unnecessary and you can go back to normal typed .select() calls.
// ─────────────────────────────────────────────────────────────────────────
//
// REVISION NOTE (2026-06-24): initial build, companion to StatCardPanel.tsx.
// REVISION NOTE (2026-06-24, fix): removed `as GameRow[]` cast — broke on
// an untyped Supabase client.
// REVISION NOTE (2026-06-24, fix 2): removed `as Record<string,unknown>[]`
// cast too — same root cause, the query itself types as GenericStringError[]
// before any cast runs. Routed through `unknown` once via queryUntyped().

import { createAdminClient } from '@/lib/supabase'
import { aggregateGameStreaks } from '@/lib/streaks'
import type { StatCardSourceData } from '@/app/admin/cards/StatCardPanel'

const supa = createAdminClient()

// ── Team abbreviation lookup ─────────────────────────────────────────────
const TEAM_ABBR: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
}

function abbr(teamId: number | null | undefined): string {
  if (!teamId) return '—'
  return TEAM_ABBR[teamId] ?? '—'
}

function fmtDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── The one place that touches the untyped result ────────────────────────
// Takes whatever supabase-js handed back (typed as GenericStringError[] or
// similar on this client) and hands it onward as plain unknown rows. This
// is the ONLY line in the file that does the `as unknown as X` double-cast
// — every other function below works with normal, safely-typed data.
function toRawRows(data: unknown): Record<string, any>[] {
  return (data ?? []) as unknown as Record<string, any>[]
}

type GameRowShape = {
  game_pk: number
  home_team_id: number | null
  away_team_id: number | null
  home_pitcher_id: number | null
  away_pitcher_id: number | null
  home_pitcher_name: string | null
  away_pitcher_name: string | null
  home_pitcher_vs_opponent_record: string | null
  home_pitcher_vs_opponent_era: string | null
  away_pitcher_vs_opponent_record: string | null
  away_pitcher_vs_opponent_era: string | null
}

function readRow(row: Record<string, any>): GameRowShape {
  return {
    game_pk: Number(row.game_pk ?? 0),
    home_team_id: row.home_team_id != null ? Number(row.home_team_id) : null,
    away_team_id: row.away_team_id != null ? Number(row.away_team_id) : null,
    home_pitcher_id: row.home_pitcher_id != null ? Number(row.home_pitcher_id) : null,
    away_pitcher_id: row.away_pitcher_id != null ? Number(row.away_pitcher_id) : null,
    home_pitcher_name: row.home_pitcher_name ?? null,
    away_pitcher_name: row.away_pitcher_name ?? null,
    home_pitcher_vs_opponent_record: row.home_pitcher_vs_opponent_record ?? null,
    home_pitcher_vs_opponent_era: row.home_pitcher_vs_opponent_era ?? null,
    away_pitcher_vs_opponent_record: row.away_pitcher_vs_opponent_record ?? null,
    away_pitcher_vs_opponent_era: row.away_pitcher_vs_opponent_era ?? null,
  }
}

/**
 * Pulls today's slate, fetches live streak/trend data per game (same
 * functions narrative.ts's cron already calls via aggregateGameStreaks),
 * and shapes the result into StatCardSourceData for StatCardPanel.
 */
export async function getTodaysStatCardData(date: string): Promise<StatCardSourceData> {
  const empty: StatCardSourceData = {
    date_label: fmtDateLabel(date),
    hot_batters: [],
    pitcher_trends: [],
    h2h_pitchers: [],
  }

  const { data, error } = await supa
    .from('edge_predictions')
    .select(
      'game_pk, home_team_id, away_team_id, home_pitcher_id, away_pitcher_id, ' +
      'home_pitcher_name, away_pitcher_name, ' +
      'home_pitcher_vs_opponent_record, home_pitcher_vs_opponent_era, ' +
      'away_pitcher_vs_opponent_record, away_pitcher_vs_opponent_era',
    )
    .eq('game_date', date)

  if (error) {
    console.error('getTodaysStatCardData: fetch failed', error)
    return empty
  }

  const rows = toRawRows(data).map(readRow)

  if (rows.length === 0) return empty

  const hot_batters: StatCardSourceData['hot_batters'] = []
  const pitcher_trends: StatCardSourceData['pitcher_trends'] = []
  const h2h_pitchers: StatCardSourceData['h2h_pitchers'] = []

  // One game at a time rather than Promise.all across the whole slate —
  // aggregateGameStreaks already fans out internally (roster + per-batter
  // gamelog calls), so running every game concurrently on top of that
  // risks hammering the MLB API rate limit. Admin page, not time-critical.
  for (const row of rows) {
    if (!row.home_team_id || !row.away_team_id) continue

    const streaks = await aggregateGameStreaks(
      row.home_team_id,
      row.away_team_id,
      row.home_pitcher_id,
      row.home_pitcher_name,
      row.away_pitcher_id,
      row.away_pitcher_name,
    ).catch((err) => {
      console.error(`getTodaysStatCardData: streaks failed for game ${row.game_pk}`, err)
      return null
    })

    if (!streaks) continue

    const homeAbbr = abbr(row.home_team_id)
    const awayAbbr = abbr(row.away_team_id)

    for (const b of streaks.home_hot_batters) {
      hot_batters.push({
        player_name: b.player_name,
        team_abbr: homeAbbr,
        position: b.position,
        on_base_streak: b.on_base_streak,
        hit_streak: b.hit_streak,
        last_5_avg: b.last_5_avg,
        last_5_obp: b.last_5_obp,
        hits_last_10: b.hits_last_10,
      })
    }
    for (const b of streaks.away_hot_batters) {
      hot_batters.push({
        player_name: b.player_name,
        team_abbr: awayAbbr,
        position: b.position,
        on_base_streak: b.on_base_streak,
        hit_streak: b.hit_streak,
        last_5_avg: b.last_5_avg,
        last_5_obp: b.last_5_obp,
        hits_last_10: b.hits_last_10,
      })
    }

    if (streaks.home_pitcher) {
      pitcher_trends.push({
        player_name: streaks.home_pitcher.player_name,
        team_abbr: homeAbbr,
        last_3_era: streaks.home_pitcher.last_3_era,
        last_3_k_per_9: streaks.home_pitcher.last_3_k_per_9,
        last_3_bb_per_9: streaks.home_pitcher.last_3_bb_per_9,
        hr_allowed_last_3: streaks.home_pitcher.hr_allowed_last_3,
        current_scoreless_innings: streaks.home_pitcher.current_scoreless_innings,
      })
    }
    if (streaks.away_pitcher) {
      pitcher_trends.push({
        player_name: streaks.away_pitcher.player_name,
        team_abbr: awayAbbr,
        last_3_era: streaks.away_pitcher.last_3_era,
        last_3_k_per_9: streaks.away_pitcher.last_3_k_per_9,
        last_3_bb_per_9: streaks.away_pitcher.last_3_bb_per_9,
        hr_allowed_last_3: streaks.away_pitcher.hr_allowed_last_3,
        current_scoreless_innings: streaks.away_pitcher.current_scoreless_innings,
      })
    }

    if (row.home_pitcher_name && row.home_pitcher_vs_opponent_record && row.home_pitcher_vs_opponent_era) {
      h2h_pitchers.push({
        player_name: row.home_pitcher_name,
        team_abbr: homeAbbr,
        opponent_abbr: awayAbbr,
        record: row.home_pitcher_vs_opponent_record,
        era: row.home_pitcher_vs_opponent_era,
      })
    }
    if (row.away_pitcher_name && row.away_pitcher_vs_opponent_record && row.away_pitcher_vs_opponent_era) {
      h2h_pitchers.push({
        player_name: row.away_pitcher_name,
        team_abbr: awayAbbr,
        opponent_abbr: homeAbbr,
        record: row.away_pitcher_vs_opponent_record,
        era: row.away_pitcher_vs_opponent_era,
      })
    }
  }

  return {
    date_label: fmtDateLabel(date),
    hot_batters,
    pitcher_trends,
    h2h_pitchers,
  }
}