/**
 * src/lib/series-top3-snapshot.ts
 *
 * Cron-backed summary of "Top 3 For The Series" for the MLB homepage.
 *
 * The homepage cannot call getSeriesTop3() live for every series in
 * today's slate — ~15 series × 2 teams, each already doing several nested
 * fetches (schedule lookup, zone arsenal, pitch-type arsenal, a full raw
 * Statcast CSV pull per batter). That's fine for one game page on demand;
 * it is not fine on every homepage load. Instead, a daily cron computes
 * this once for the whole slate and writes a lightweight summary to
 * `series_top3_snapshot`. The homepage reads that table — fast, no live
 * external calls.
 *
 * REQUIRED MIGRATION (run once, not included here — this file assumes the
 * table already exists):
 *
 *   create table series_top3_snapshot (
 *     id             uuid primary key default gen_random_uuid(),
 *     game_date      date not null,
 *     team_id        integer not null,
 *     opposing_team_id integer not null,
 *     game_slug      text not null,
 *     edge_count     integer not null default 0,
 *     top3_summary   jsonb not null default '[]',
 *     computed_at    timestamptz not null default now(),
 *     unique (game_date, team_id)
 *   );
 *
 * top3_summary shape: [{ player_id, player_name, lean: 'edge' | 'neutral' | 'tough' }]
 * — intentionally minimal. No raw scores stored (brand rule — internal
 * numbers never leave the scoring layer), and no zone/pitch-type detail —
 * that level of depth is exactly what the game page link is for.
 */

import { createAdminClient } from '@/lib/supabase'

export type Top3SnapshotBatterSummary = {
  player_id: number
  player_name: string
  lean: 'edge' | 'neutral' | 'tough'
}

export type Top3Snapshot = {
  team_id: number
  opposing_team_id: number
  game_slug: string
  edge_count: number
  top3_summary: Top3SnapshotBatterSummary[]
}

function leanFromScore(score: number): Top3SnapshotBatterSummary['lean'] {
  if (score > 0.03) return 'edge'
  if (score < -0.03) return 'tough'
  return 'neutral'
}

/**
 * Called by the cron route only — builds the minimal summary row from a
 * full SeriesTop3Result, stripping internal scores down to plain leans
 * before anything gets written to a table the homepage reads from.
 */
export function buildSnapshotRow(
  teamId: number,
  opposingTeamId: number,
  gameSlug: string,
  result: { batters: { player_id: number; player_name: string; series_score: number }[] },
): Top3Snapshot {
  const summary = result.batters.map((b) => ({
    player_id: b.player_id,
    player_name: b.player_name,
    lean: leanFromScore(b.series_score),
  }))
  return {
    team_id: teamId,
    opposing_team_id: opposingTeamId,
    game_slug: gameSlug,
    edge_count: summary.filter((s) => s.lean === 'edge').length,
    top3_summary: summary,
  }
}

/**
 * Reads today's snapshot for the homepage — one query, all series at once,
 * keyed by team_id for easy lookup per game card.
 */
export async function getTodaysTop3Snapshots(gameDate: string): Promise<Map<number, Top3Snapshot>> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('series_top3_snapshot')
    .select('team_id, opposing_team_id, game_slug, edge_count, top3_summary')
    .eq('game_date', gameDate)

  const map = new Map<number, Top3Snapshot>()
  if (error || !data) return map

  for (const row of data) {
    map.set(row.team_id, {
      team_id: row.team_id,
      opposing_team_id: row.opposing_team_id,
      game_slug: row.game_slug,
      edge_count: row.edge_count,
      top3_summary: row.top3_summary ?? [],
    })
  }
  return map
}
