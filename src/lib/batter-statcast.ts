// src/lib/batter-statcast.ts
//
// Extracted from BattingTabContent.tsx's fetchStatcastClientSide() —
// was defined inline in a 'use client' component, needed here too for
// the server-rendered post-game report. Same function, single owner now.
// BattingTabContent.tsx should import this instead of keeping its own
// copy (see note at the bottom of this file for the one-line swap).

import type { BatterStatcast } from '@/lib/batter-stats'

export async function fetchStatcastClientSide(playerId: number): Promise<BatterStatcast | null> {
  const season = new Date().getFullYear()

  async function fetchSavantCSV(url: string): Promise<Record<string, string> | null> {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/csv,*/*' } })
      if (!res.ok) return null
      const text = await res.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const idIdx = headers.findIndex(h =>
        h === 'player_id' || h === 'playerid' || h === 'mlbam_id' || h === 'batter'
      )
      if (idIdx === -1) return null
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
        if (cells[idIdx] === String(playerId)) {
          return Object.fromEntries(headers.map((h, idx) => [h, cells[idx]]))
        }
      }
      return null
    } catch {
      return null
    }
  }

  const [expectedStats, evStats] = await Promise.all([
    fetchSavantCSV(
      `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&position=&team=&min=10&csv=true`
    ),
    fetchSavantCSV(
      `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&position=&team=&min=10&csv=true`
    ),
  ])

  if (!expectedStats) return null

  const num = (obj: Record<string, string> | null, key: string): number | null => {
    if (!obj) return null
    const val = parseFloat(obj[key] ?? '')
    return isNaN(val) ? null : val
  }

  return {
    xba:               num(expectedStats, 'est_ba'),
    xslg:              num(expectedStats, 'est_slg'),
    xwoba:             num(expectedStats, 'est_woba'),
    barrel_pct:        num(evStats, 'brl_percent'),
    hard_hit_pct:      num(evStats, 'ev95percent'),
    sweet_spot_pct:    num(evStats, 'anglesweetspotpercent'),
    avg_exit_velocity: num(evStats, 'avg_hit_speed'),
    max_exit_velocity: num(evStats, 'max_hit_speed'),
    sprint_speed:      null,
    k_pct:             null,
    bb_pct:            null,
  }
}