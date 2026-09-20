// Traditional fielding stats via MLB's documented fielding stat group —
// confirmed reachable 2026-07-14 via the same /people/{id}/stats endpoint
// everything else in this codebase already uses. NOT advanced defensive
// metrics (no OAA/DRS/UZR — those are Statcast/proprietary-derived,
// unavailable). Labeled honestly as traditional fielding, not a
// substitute for modern defensive value stats.

import { withSavantCache } from '@/lib/savant-cache'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type FieldingStats = {
  position: string
  gamesPlayed: number
  assists: number
  putOuts: number
  errors: number
  chances: number
  fieldingPct: string
  rangeFactorPerGame: string | null
  doublePlays: number
}

// Confirmed real 2026-07-14 via csv=true on the outs_above_average
// leaderboard — genuine Statcast defensive metric, not a proprietary
// closed model (correcting an earlier wrong assumption that lumped this
// in with Stuff+/xFIP as unreachable).
export type OutsAboveAverage = {
  outsAboveAverage: number
  fieldingRunsPrevented: number
  oaaInFront: number
  oaaLateralToward3B: number
  oaaLateralToward1B: number
  oaaBehind: number
  oaaVsRHH: number
  oaaVsLHH: number
  actualSuccessRate: string
  estimatedSuccessRate: string
  diffSuccessRate: string
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

export type FielderOaa = OutsAboveAverage & {
  playerId: number
  name: string
  team: string
  position: string
}

/**
 * The whole league's OAA in ONE fetch, cached in Supabase (12h) via
 * withSavantCache — the leaderboard CSV is the same file regardless of which
 * player you want, so the old per-player getOutsAboveAverage re-downloaded
 * it uncached for every lookup. Key Players needs ~18 fielders per game.
 */
export async function getLeagueOaa(season: number): Promise<Record<string, FielderOaa>> {
  return withSavantCache(`oaa_league_${season}`, 12 * 3600, async () => {
    const url = `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&startYear=${season}&endYear=${season}&split=no&team=&range=year&min=1&pos=&roles=&viz=hide&csv=true`
    const out: Record<string, FielderOaa> = {}
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,*/*',
        },
      })
      if (!res.ok) return out
      const lines = (await res.text()).replace(/^\uFEFF/, '').trim().split('\n')
      if (lines.length < 2) return out
      const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const idx = (key: string) => headers.indexOf(key)
      const idIdx = idx('player_id')
      if (idIdx === -1) return out

      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i]).map(c => c.replace(/"/g, ''))
        const playerId = Number(cells[idIdx])
        if (!playerId) continue
        const get = (key: string) => { const j = idx(key); return j === -1 ? null : cells[j] }
        const num = (key: string) => { const v = parseFloat(get(key) ?? ''); return isNaN(v) ? 0 : v }
        out[String(playerId)] = {
          playerId,
          name: get('last_name, first_name') ?? '',
          team: get('display_team_name') ?? '',
          position: get('primary_pos_formatted') ?? '',
          outsAboveAverage: num('outs_above_average'),
          fieldingRunsPrevented: num('fielding_runs_prevented'),
          oaaInFront: num('outs_above_average_infront'),
          oaaLateralToward3B: num('outs_above_average_lateral_toward3bline'),
          oaaLateralToward1B: num('outs_above_average_lateral_toward1bline'),
          oaaBehind: num('outs_above_average_behind'),
          oaaVsRHH: num('outs_above_average_rhh'),
          oaaVsLHH: num('outs_above_average_lhh'),
          actualSuccessRate: get('actual_success_rate_formatted') ?? '—',
          estimatedSuccessRate: get('adj_estimated_success_rate_formatted') ?? '—',
          diffSuccessRate: get('diff_success_rate_formatted') ?? '—',
        }
      }
    } catch (err) {
      console.error('[batter-fielding] league OAA fetch failed:', err)
    }
    return out
  })
}

export async function getOutsAboveAverage(playerId: number, season: number): Promise<OutsAboveAverage | null> {
  const league = await getLeagueOaa(season)
  return league[String(playerId)] ?? null
}

export async function getBatterFielding(playerId: number, season: number): Promise<FieldingStats | null> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=season&group=fielding&sportId=1&season=${season}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const s = data.stats?.[0]?.splits?.[0]?.stat
    if (!s) return null
    return {
      position: s.position?.abbreviation ?? '—',
      gamesPlayed: s.gamesPlayed ?? 0,
      assists: s.assists ?? 0,
      putOuts: s.putOuts ?? 0,
      errors: s.errors ?? 0,
      chances: s.chances ?? 0,
      fieldingPct: s.fielding ?? '—',
      rangeFactorPerGame: s.rangeFactorPerGame ?? null,
      doublePlays: s.doublePlays ?? 0,
    }
  } catch (err) {
    console.error('[batter-fielding] fetch failed:', err)
    return null
  }
}