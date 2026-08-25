// src/lib/player-statcast-history.ts
//
// On-demand, cached year-on-year Statcast history — pitches seen, barrels,
// pitch-type breakdown — per player, back to the start of the Statcast era
// (2015). NOT a nightly pipeline script: unlike fetch_pitch_arsenals.py etc,
// this fetches lazily per player on first page view and caches in Supabase,
// since running a 12-season Savant pull for all ~780 rostered players
// nightly would be wasteful — most players' pages are never visited most
// nights.
//
// Confirmed columns via `curl | head -3` against a real 2023 CSV response
// (see chat): pitch_type, game_year, launch_speed_angle, type (S/B/X pitch
// result). One column's MEANING is not curl-verifiable, flagged honestly:
// launch_speed_angle's 1-6 categorical scale (6 = Barrel) is Statcast's
// published public convention, not something visible in the raw CSV itself.
// Spot-check against a known barrel before fully trusting in production,
// same spirit as debug_game.ts verification elsewhere in this codebase.
//
// CACHING RULE: a completed past season's row is fetched once and never
// re-fetched (is_final = true, permanent). Only the current in-progress
// season (is_final = false) gets re-pulled on each cache-miss check, since
// that season's totals grow as games are played.

import { createClient } from '@supabase/supabase-js'

const STATCAST_ERA_START = 2015

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type SeasonStatcastRow = {
  season: number
  pitchesSeen: number
  battedBallEvents: number
  barrels: number
  barrelPct: number | null
  pitchTypeBreakdown: Record<string, number>
  isFinal: boolean
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

async function fetchSeasonFromSavant(
  playerId: number, season: number, playerType: 'batter' | 'pitcher'
): Promise<SeasonStatcastRow | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?player_id=${playerId}&player_type=${playerType}&season=${season}&type=${playerType}&game_type=R&csv=true`,
  ].join('')

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', 'Accept': 'text/csv,*/*' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null

    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
    const pitchTypeIdx = headers.indexOf('pitch_type')
    const lsaIdx = headers.indexOf('launch_speed_angle')
    const typeIdx = headers.indexOf('type')

    if (pitchTypeIdx === -1 || typeIdx === -1) return null

    let pitchesSeen = 0
    let battedBallEvents = 0
    let barrels = 0
    const pitchTypeBreakdown: Record<string, number> = {}

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      pitchesSeen++

      const pt = cells[pitchTypeIdx]
      if (pt && pt !== 'null' && pt !== '') {
        pitchTypeBreakdown[pt] = (pitchTypeBreakdown[pt] ?? 0) + 1
      }

      const resultType = cells[typeIdx]
      if (resultType === 'X') {
        battedBallEvents++
        const lsa = lsaIdx !== -1 ? cells[lsaIdx] : null
        if (lsa === '6') barrels++
      }
    }

    if (pitchesSeen === 0) return null

    return {
      season,
      pitchesSeen,
      battedBallEvents,
      barrels,
      barrelPct: battedBallEvents > 0 ? Math.round((barrels / battedBallEvents) * 1000) / 10 : null,
      pitchTypeBreakdown,
      isFinal: season < new Date().getFullYear(),
    }
  } catch (err) {
    console.error(`[player-statcast-history] Savant fetch failed for ${playerId}/${season}:`, err)
    return null
  }
}
async function upsertSeasonRow(playerId: number, row: SeasonStatcastRow) {
  const { error } = await supa.from('player_statcast_history').upsert({
    player_id: playerId,
    season: row.season,
    pitches_seen: row.pitchesSeen,
    batted_ball_events: row.battedBallEvents,
    barrels: row.barrels,
    barrel_pct: row.barrelPct,
    pitch_type_breakdown: row.pitchTypeBreakdown,
    is_final: row.isFinal,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'player_id,season' })
  if (error) console.error(`[player-statcast-history] upsert failed for player ${playerId}, season ${row.season}:`, error.message)
}

// Small concurrency window rather than one big Promise.all across ~11
// seasons — a dozen simultaneous CSV pulls to Savant per player risks
// looking like abuse; 4-at-a-time is a reasonable middle ground.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}

export async function getPlayerStatcastHistory(
  playerId: number, subject: 'batter' | 'pitcher'
): Promise<SeasonStatcastRow[]> {
  const currentYear = new Date().getFullYear()
  const allSeasons = Array.from(
    { length: currentYear - STATCAST_ERA_START + 1 },
    (_, i) => STATCAST_ERA_START + i
  )

  const { data: cached } = await supa
    .from('player_statcast_history')
    .select('*')
    .eq('player_id', playerId)
    .in('season', allSeasons)

  const cachedBySeasons = new Map((cached ?? []).map(r => [r.season, r]))

  // Fetch a season fresh if: never cached, OR cached but marked not-final
  // (i.e. it was last fetched during that same in-progress season).
  const seasonsToFetch = allSeasons.filter(season => {
    const row = cachedBySeasons.get(season)
    return !row || row.is_final === false
  })

  if (seasonsToFetch.length > 0) {
    const fresh = await mapWithConcurrency(seasonsToFetch, 4, s => fetchSeasonFromSavant(playerId, s, subject))
    for (const row of fresh) {
      if (row) {
        await upsertSeasonRow(playerId, row)
        cachedBySeasons.set(row.season, {
          player_id: playerId, season: row.season, pitches_seen: row.pitchesSeen,
          batted_ball_events: row.battedBallEvents, barrels: row.barrels, barrel_pct: row.barrelPct,
          pitch_type_breakdown: row.pitchTypeBreakdown, is_final: row.isFinal,
        })
      }
    }
  }

  return allSeasons
    .map(season => {
      const row = cachedBySeasons.get(season)
      if (!row) return null
      return {
        season,
        pitchesSeen: row.pitches_seen ?? 0,
        battedBallEvents: row.batted_ball_events ?? 0,
        barrels: row.barrels ?? 0,
        barrelPct: row.barrel_pct ?? null,
        pitchTypeBreakdown: row.pitch_type_breakdown ?? {},
        isFinal: row.is_final ?? true,
      }
    })
    .filter((r): r is SeasonStatcastRow => r !== null && r.pitchesSeen > 0)
}