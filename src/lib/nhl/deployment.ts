/**
 * src/lib/nhl/deployment.ts
 *
 * Reads nhl_deployment_strip (written by scripts/nhl/rollups.py) and turns it
 * into <UsageStrip>'s StripData shape. toNhlStripData() is the pure half --
 * no I/O, unit-tested in scripts/test_nhl_deployment.ts -- getDeploymentStrip()
 * is the thin Supabase-reading wrapper around it.
 *
 * HONEST-N RULES (from the N2 lock):
 * - L5 is only meaningful with >= 3 games in the window; below that, every
 *   row's l3Pct/l3Snaps (this component's "L{windowN}" column) is nulled out
 *   and the honest-n foot line says "last game" instead of "5 games".
 * - PP/PK strips (nhl_toi_pp / nhl_toi_sh): rank only players whose raw
 *   season PP (or SH) seconds clear PP_PK_FLOOR_S. That constant is left
 *   null until George sets it after seeing the real N1 distribution (open
 *   question 2) -- while null, nobody is "ranked" (this component has no
 *   rank display at all, so that's already true), rows are just sorted by
 *   raw seconds descending either way.
 * - Every card gets an honest-n foot line: "{n} games · {total} team
 *   {metric} minutes" plus an excluded-games note when applicable.
 */

import { createAdminClient } from '@/lib/supabase'
import { METRIC_SPECS, type NhlDeploymentMetric, type StripData, type StripRow } from '@/lib/usage-strip/types'

const PAGE_SIZE = 1000

// Left null deliberately -- see the module docstring and open question 2 in
// the N1/N2 STOP summaries. Once George sets a value (season PP/SH seconds),
// rows below it should be deprioritized in sort order, not hidden.
export const PP_PK_FLOOR_S: number | null = null

interface NhlDeploymentStripRow {
  team_id: number
  player_id: number
  metric: NhlDeploymentMetric
  through_date: string | null
  last_value: string | null
  last_raw: string | null
  l5_games: number | null
  l5_value: string | null
  l5_raw: string | null
  season_games: number | null
  season_value: string | null
  season_raw: string | null
  excluded_games: number | null
}

interface PlayerLookup {
  full_name: string
  position_code: string | null
  sweater_number: number | null
}

export function toNhlStripData(
  rows: NhlDeploymentStripRow[],
  players: Map<number, PlayerLookup>,
  opts: { metric: NhlDeploymentMetric; limit?: number },
): StripData {
  const spec = METRIC_SPECS[opts.metric]
  const isPpOrPk = opts.metric === 'nhl_toi_pp' || opts.metric === 'nhl_toi_sh'

  const stripRows: StripRow[] = rows.map((r) => {
    const player = players.get(r.player_id)
    const l5Games = r.l5_games ?? 0
    const showL5 = l5Games >= 3
    return {
      playerId: r.player_id,
      name: player?.full_name ?? `Player ${r.player_id}`,
      position: player?.position_code ?? null,
      lastPct: r.last_value != null ? Number(r.last_value) : null,
      l3Pct: showL5 && r.l5_value != null ? Number(r.l5_value) : null,
      seasonPct: r.season_value != null ? Number(r.season_value) : null,
      lastSnaps: r.last_raw != null ? Number(r.last_raw) : null,
      l3Snaps: showL5 && r.l5_raw != null ? Number(r.l5_raw) : null,
      seasonSnaps: r.season_raw != null ? Number(r.season_raw) : null,
      n: l5Games,
    }
  })

  // PP/PK: sort by raw season seconds descending (no rank number is ever
  // shown -- see PP_PK_FLOOR_S's docstring -- this is display ORDER only).
  if (isPpOrPk) {
    stripRows.sort((a, b) => (b.seasonSnaps ?? 0) - (a.seasonSnaps ?? 0))
  }

  const limited = opts.limit ? stripRows.slice(0, opts.limit) : stripRows

  const totalExcluded = rows.reduce((sum, r) => sum + (r.excluded_games ?? 0), 0)
  const anyL5 = rows.some((r) => (r.l5_games ?? 0) >= 3)
  const gamesLabel = anyL5 ? `${Math.max(...rows.map((r) => r.l5_games ?? 0), 0)} games` : 'last game'
  const totalRawSeconds = rows.reduce((sum, r) => sum + (r.l5_raw != null ? Number(r.l5_raw) : 0), 0)
  const totalMinutes = Math.round(totalRawSeconds / 60)
  const unitLabel = spec.rawUnit === 'min' ? `team ${spec.label.toLowerCase()} minutes` : spec.rawUnit
  const excludedNote = totalExcluded > 0 ? ` · ${totalExcluded} game${totalExcluded === 1 ? '' : 's'} excluded (ice-time check failed)` : ''

  return {
    rows: limited,
    extraFoot: `${gamesLabel} · ${totalMinutes} ${unitLabel}${excludedNote}`,
  }
}

export async function getDeploymentStrip(
  teamId: number,
  season: number,
  metric: NhlDeploymentMetric,
  limit?: number,
): Promise<StripData> {
  const supa = createAdminClient()
  const rows: NhlDeploymentStripRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supa
      .from('nhl_deployment_strip')
      .select('team_id,player_id,metric,through_date,last_value,last_raw,l5_games,l5_value,l5_raw,season_games,season_value,season_raw,excluded_games')
      .eq('team_id', teamId)
      .eq('season', season)
      .eq('metric', metric)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      console.error('[getDeploymentStrip] Supabase error:', error.message)
      break
    }
    rows.push(...((data ?? []) as NhlDeploymentStripRow[]))
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (rows.length === 0) {
    return { rows: [], extraFoot: METRIC_SPECS[metric].emptyCopy }
  }

  const playerIds = rows.map((r) => r.player_id)
  const { data: playerRows, error: playerError } = await supa
    .from('nhl_players')
    .select('player_id,full_name,position_code,sweater_number')
    .in('player_id', playerIds)
  if (playerError) {
    console.error('[getDeploymentStrip] Supabase error reading nhl_players:', playerError.message)
  }
  const players = new Map<number, PlayerLookup>(
    (playerRows ?? []).map((p) => [p.player_id as number, p as PlayerLookup]),
  )

  return toNhlStripData(rows, players, { metric, limit })
}
