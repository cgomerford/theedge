// src/lib/pitch-physical-percentiles.ts
//
// Real league-wide spin rate + release extension percentiles, per pitch
// type — pulled live from Baseball Savant's own aggregated leaderboard
// CSV (the same statcast_search endpoint used elsewhere in this app —
// pitcher-pitch-log.ts, pitcher-start-trends.ts — but WITHOUT
// type=details and filtered to one pitch type via hfPT, which makes
// Savant return one row PER PITCHER for that pitch type this season,
// genuinely computed by Savant from every real pitch of that type
// league-wide). Confirmed live before building on it: this response
// includes real spin_rate and release_extension columns that aren't
// present anywhere in this app's Supabase pitch_arsenals cache, which is
// why those two were previously shown as real-but-unranked numbers
// instead of Edge+ components (see edge-plus.ts) — this closes that gap.

const SEASON_FALLBACK = new Date().getFullYear()
const MIN_POOL_PITCHES = 20

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

type PhysicalRow = { playerId: number; spinRate: number | null; extension: number | null; pitches: number }

async function fetchLeaguePool(pitchType: string, season: number): Promise<PhysicalRow[]> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=pitcher`,
    `&hfPT=${encodeURIComponent(pitchType)}%7C`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return []
    text = await res.text()
  } catch {
    return []
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (n: string) => headers.indexOf(n)
  const iId = idx('player_id'), iSpin = idx('spin_rate'), iExt = idx('release_extension'), iPitches = idx('pitches')
  if (iId === -1) return []

  const out: PhysicalRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const playerId = Number(cells[iId])
    if (Number.isNaN(playerId)) continue
    const spinRate = iSpin !== -1 ? Number(cells[iSpin]) : NaN
    const extension = iExt !== -1 ? Number(cells[iExt]) : NaN
    const pitches = iPitches !== -1 ? Number(cells[iPitches]) : NaN
    out.push({
      playerId,
      spinRate: Number.isNaN(spinRate) ? null : spinRate,
      extension: Number.isNaN(extension) ? null : extension,
      pitches: Number.isNaN(pitches) ? 0 : pitches,
    })
  }
  return out
}

function percentileOf(pool: number[], value: number): number | null {
  if (pool.length < 5) return null
  const sorted = [...pool].sort((a, b) => a - b)
  return Math.round((sorted.filter(v => v <= value).length / sorted.length) * 100)
}

export async function getPitchPhysicalPercentiles(playerId: number, pitchType: string, season = SEASON_FALLBACK): Promise<{
  spin: { value: number | null; percentile: number | null }
  extension: { value: number | null; percentile: number | null }
  poolSize: number
}> {
  const rows = await fetchLeaguePool(pitchType, season)
  const qualified = rows.filter(r => r.pitches >= MIN_POOL_PITCHES)
  const self = rows.find(r => r.playerId === playerId)

  const spinPool = qualified.map(r => r.spinRate).filter((v): v is number => v != null)
  const extPool = qualified.map(r => r.extension).filter((v): v is number => v != null)

  const spinValue = self?.spinRate ?? null
  const extValue = self?.extension ?? null

  return {
    spin: { value: spinValue, percentile: spinValue != null ? percentileOf(spinPool, spinValue) : null },
    extension: { value: extValue, percentile: extValue != null ? percentileOf(extPool, extValue) : null },
    poolSize: qualified.length,
  }
}
