/**
 * src/lib/key-players.ts
 *
 * "Top 3 Key Players" — merges batter reads (series-matchup.ts) with the
 * pitcher read (pitcher-series-edge.ts) into ONE ranked list of 3. Pure
 * competition on score — no guaranteed pitcher slot (see prior discussion:
 * a quota would bump a genuinely stronger batter just to fill a category,
 * which is the opposite of "key players").
 *
 * Persists via key_players_snapshot, frozen at first pitch by the cron
 * (see /api/cron/key-players-snapshot). Stores WHO, WHY (structured +
 * narrative text), never raw scores (brand rule).
 */

import { createAdminClient } from '@/lib/supabase'
import type { Top3Batter } from '@/lib/series-matchup'
import type { Top3Pitcher } from '@/lib/pitcher-series-edge'
import { pickDrivingPitch, buildBatterNarrative, buildPitcherNarrative, buildStarterSummarySentence, type RecentFormContext } from '@/lib/key-players-narrative'
// ─── Types ──────────────────────────────────────────────────────────────

export type KeyPlayerCandidate =
  | { kind: 'batter'; score: number; batter: Top3Batter }
  | { kind: 'pitcher'; score: number; pitcher: Top3Pitcher }

export type KeyPlayersLean = 'edge' | 'neutral' | 'tough'

export type KeyPlayerSnapshotRow = {
  game_pk: number
  game_slug: string
  game_date: string
  team_id: number
  opposing_team_id: number
  rank: 1 | 2 | 3
  player_type: 'batter' | 'pitcher'
  player_id: number
  player_name: string
  lean: KeyPlayersLean
  reason_summary: Record<string, unknown>
  narrative: string | null
}

// ─── Ranking — pure competition, see file header ─────────────────────────

export function rankKeyPlayers(batters: Top3Batter[], pitcher: Top3Pitcher | null): KeyPlayerCandidate[] {
  const candidates: KeyPlayerCandidate[] = batters.map((b) => ({ kind: 'batter' as const, score: b.series_score, batter: b }))
  if (pitcher) candidates.push({ kind: 'pitcher' as const, score: pitcher.series_score, pitcher })
  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 3)
}

function leanFromScore(score: number): KeyPlayersLean {
  if (score > 0.03) return 'edge'
  if (score < -0.03) return 'tough'
  return 'neutral'
}

// ─── Snapshot build ─────────────────────────────────────────────────────

/**
 * formByPlayerId is caller-supplied — page.tsx already fetches
 * player_form_signals for ScoutReportTab (_awayHotStreaks/_homeHotStreaks).
 * Pass a Map<playerId, RecentFormContext> built from that same data, keyed
 * by player_id, rather than re-fetching it here.
 */
export function buildKeyPlayersSnapshotRows(
  gamePk: number,
  gameSlug: string,
  gameDate: string,
  teamId: number,
  opposingTeamId: number,
  candidates: KeyPlayerCandidate[],
  formByPlayerId: Map<number, RecentFormContext>,
): KeyPlayerSnapshotRow[] {
  return candidates.map((c, i) => {
    const rank = (i + 1) as 1 | 2 | 3
    const lean = leanFromScore(c.score)

    if (c.kind === 'batter') {
      const topLine = c.batter.per_pitcher[0] ?? null
      const drivingPitch = topLine ? pickDrivingPitch(topLine.pitch_type_fit) : null
      const zone = topLine ? [...topLine.zone_fit].sort((a, b) => b.tilt - a.tilt)[0]?.zone ?? null : null
      const form = formByPlayerId.get(c.batter.player_id) ?? null

      const narrative = (topLine && drivingPitch && zone)
        ? buildBatterNarrative(c.batter.player_name, topLine.pitcher_name, zone, drivingPitch, form, c.batter.bat_side)
        : null

      return {
        game_pk: gamePk, game_slug: gameSlug, game_date: gameDate,
        team_id: teamId, opposing_team_id: opposingTeamId, rank,
        player_type: 'batter', player_id: c.batter.player_id, player_name: c.batter.player_name,
        lean, narrative,
        reason_summary: {
          kind: 'batter',
          vs_pitcher_name: topLine?.pitcher_name ?? null,
          zone_score: topLine?.zone_score ?? null,
          pitch_type_fit_score: topLine?.pitch_type_fit_score ?? null,
          games_used: c.batter.games_used,
     driving_pitch: drivingPitch?.pitch_name ?? null,
          driving_zone: zone,
          starter_summary: buildStarterSummarySentence(c.batter),
          per_starter: c.batter.per_pitcher.map((p) => ({
            pitcher_name: p.pitcher_name,
            combined_score: Math.round((p.zone_score + p.pitch_type_fit_score) * 100) / 100,
          })),
          bat_side: c.batter.bat_side,
          // FULL matchup options for the selector — not just the top one
          matchup_options: c.batter.per_pitcher.map((p) => ({
            key: String(p.pitcher_id),
            label: p.pitcher_name,
            bat_side: c.batter.bat_side,
            zone_fit: p.zone_fit,
            pitch_zone_fit: p.pitch_zone_fit,
            pitch_type_fit: p.pitch_type_fit,
          })),
        },
      }
    }
    const tough = c.pitcher.toughest_matchup
    const drivingPitch = tough ? pickDrivingPitch(tough.pitch_type_fit) : null
    const zone = tough ? [...tough.zone_fit].sort((a, b) => a.tilt - b.tilt)[0]?.zone ?? null : null // most negative = pitcher-favorable
    const form = formByPlayerId.get(c.pitcher.pitcher_id) ?? null

    const narrative = (tough && drivingPitch && zone)
      ? buildPitcherNarrative(c.pitcher.pitcher_name, tough.batter_name, zone, drivingPitch, drivingPitch.pitcher_usage_pct ?? 0, form, tough.bat_side)
      : null

    return {
      game_pk: gamePk, game_slug: gameSlug, game_date: gameDate,
      team_id: teamId, opposing_team_id: opposingTeamId, rank,
      player_type: 'pitcher', player_id: c.pitcher.pitcher_id, player_name: c.pitcher.pitcher_name,
      lean, narrative,
reason_summary: {
        kind: 'pitcher',
        opposing_team_id: c.pitcher.opposing_team_id,
        toughest_matchup_batter_id: tough?.batter_id ?? null,
        toughest_matchup_batter_name: tough?.batter_name ?? null,
        toughest_matchup_score: tough?.pitcher_edge_score ?? null,
        batters_used: c.pitcher.batters_used,
        driving_pitch: drivingPitch?.pitch_name ?? null,
        driving_zone: zone,
        // FULL matchup options — every projected lineup batter, not just the toughest
        matchup_options: c.pitcher.per_batter.map((b) => ({
          key: String(b.batter_id),
          label: b.batter_name,
          bat_side: b.bat_side,
          zone_fit: b.zone_fit,
          pitch_zone_fit: b.pitch_zone_fit,
          pitch_type_fit: b.pitch_type_fit,
        })),
      },
    }
  })
}

// ─── Snapshot write (cron only) ──────────────────────────────────────────

export async function writeKeyPlayersSnapshot(rows: KeyPlayerSnapshotRow[]): Promise<{ written: number; failed: number }> {
  if (rows.length === 0) return { written: 0, failed: 0 }
  const supa = createAdminClient()
  let written = 0, failed = 0

  for (const row of rows) {
    const { error } = await supa.from('key_players_snapshot').upsert(
      {
        game_pk: row.game_pk, game_slug: row.game_slug, game_date: row.game_date,
        team_id: row.team_id, opposing_team_id: row.opposing_team_id, rank: row.rank,
        player_type: row.player_type, player_id: row.player_id, player_name: row.player_name,
        lean: row.lean, reason_summary: row.reason_summary, narrative: row.narrative,
        snapshotted_at: new Date().toISOString(),
      },
      { onConflict: 'game_pk,team_id,rank' },
    )
    if (error) { console.error('key-players snapshot upsert failed', error); failed++ }
    else written++
  }
  return { written, failed }
}

// ─── Snapshot read (game page) ───────────────────────────────────────────

export type KeyPlayersSnapshot = {
  team_id: number
  opposing_team_id: number
  rank: 1 | 2 | 3
  player_type: 'batter' | 'pitcher'
  player_id: number
  player_name: string
  lean: KeyPlayersLean
  reason_summary: Record<string, any>
  narrative: string | null
}

export async function getKeyPlayersSnapshot(gamePk: number): Promise<KeyPlayersSnapshot[]> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('key_players_snapshot')
    .select('team_id, opposing_team_id, rank, player_type, player_id, player_name, lean, reason_summary, narrative')
    .eq('game_pk', gamePk)
    .order('team_id', { ascending: true })
    .order('rank', { ascending: true })

  if (error || !data) return []
  return data as KeyPlayersSnapshot[]
}