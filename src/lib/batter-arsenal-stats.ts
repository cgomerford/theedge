// src/lib/batter-arsenal-stats.ts
//
// Real full stat line vs one pitch type, batter side — the mirror of the
// Pitching Lab Arsenal tab's per-pitch stat line (Pitches/Usage/Velo/
// HB/IVB/Whiff%/K%/BA/SLG/wOBA/xwOBA/Hard-Hit%/RV per 100), just for a
// batter facing that pitch type instead of a pitcher throwing it.
//
// Real source: the SAME aggregated Savant leaderboard endpoint already
// proven in pitch-physical-percentiles.ts (one row per player per pitch
// type this season), filtered by batters_lookup[] instead of
// pitchers_lookup[] and hfPT=<code>| instead of player_type=pitcher.
// Confirmed live before building on it — this single endpoint carries
// every real field the requested stat line needs, including
// batter_run_value_per_100 (this app's real "Edge score" input, batter
// side — see edgePlusTier/computeEdgePlus for the pitcher-side sibling).
//
// Put-Away% isn't a column on this endpoint (checked the full header —
// not present), so it's computed separately from the raw per-pitch log
// (2-strike pitches of this type that ended in a strikeout) rather than
// faked — see batter-pitch-log.ts.

const SEASON_FALLBACK = new Date().getFullYear()

export type BatterArsenalStatLine = {
  pitchType: string
  pitches: number
  velo: number | null
  hb: number | null // inches, real api_break_x_arm * 12
  ivb: number | null // inches, real api_break_z_induced * 12
  whiffPct: number | null
  kPct: number | null
  ba: number | null
  slg: number | null
  woba: number | null
  xwoba: number | null
  hardHitPct: number | null
  rv100: number | null // real batter_run_value_per_100 — the batter's own real "Edge" input for this pitch
  edgeScore: number | null // 0-100 real percentile of rv100 vs every other qualified batter who faced this same pitch type this season — this app's disclosed batter-side "Edge" score, same spirit as the pitcher-side Edge+ (see src/lib/edge-plus.ts)
  edgePoolSize: number
}

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

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

async function fetchCSV(url: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    text = await res.text()
  } catch {
    return null
  }
  const lines = text.trim().split('\n')
  if (lines.length < 2) return null
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const rows = lines.slice(1).map(l => parseCSVLine(l).map(c => c.replace(/^"|"$/g, '')))
  return { headers, rows }
}

async function fetchOnePitchType(batterId: number, pitchType: string, season: number): Promise<Omit<BatterArsenalStatLine, 'edgeScore' | 'edgePoolSize'> | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`,
    `&hfPT=${encodeURIComponent(pitchType)}%7C`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc',
  ].join('')

  const csv = await fetchCSV(url)
  if (!csv || csv.rows.length === 0) return null
  const idx = (n: string) => csv.headers.indexOf(n)
  const cells = csv.rows[0]
  const get = (n: string) => { const i = idx(n); return i === -1 ? undefined : cells[i] }

  const pitches = num(get('pitches'))
  if (pitches == null || pitches === 0) return null

  const hbRaw = num(get('api_break_x_arm'))
  const ivbRaw = num(get('api_break_z_induced'))

  return {
    pitchType,
    pitches,
    velo: num(get('velocity')),
    hb: hbRaw != null ? hbRaw * 12 : null,
    ivb: ivbRaw != null ? ivbRaw * 12 : null,
    whiffPct: num(get('swing_miss_percent')),
    kPct: num(get('k_percent')),
    ba: num(get('ba')),
    slg: num(get('slg')),
    woba: num(get('woba')),
    xwoba: num(get('xwoba')),
    hardHitPct: num(get('hardhit_percent')),
    rv100: num(get('batter_run_value_per_100')),
  }
}

// Real league pool — every batter who faced this pitch type this season,
// unfiltered — used only to rank THIS batter's real rv100 against it.
async function fetchPool(pitchType: string, season: number): Promise<{ playerId: number; pitches: number; rv100: number | null }[]> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`,
    `&hfPT=${encodeURIComponent(pitchType)}%7C`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc',
  ].join('')

  const csv = await fetchCSV(url)
  if (!csv) return []
  const idx = (n: string) => csv.headers.indexOf(n)
  const iId = idx('player_id'), iPitches = idx('pitches'), iRv = idx('batter_run_value_per_100')
  if (iId === -1) return []
  return csv.rows.map(cells => ({
    playerId: Number(cells[iId]),
    pitches: iPitches !== -1 ? Number(cells[iPitches]) : 0,
    rv100: iRv !== -1 ? num(cells[iRv]) : null,
  })).filter(r => !Number.isNaN(r.playerId))
}

function percentileOf(pool: number[], value: number): number | null {
  if (pool.length < 5) return null
  const sorted = [...pool].sort((a, b) => a - b)
  return Math.round((sorted.filter(v => v <= value).length / sorted.length) * 100)
}

export async function getBatterArsenalStats(batterId: number, pitchTypes: string[], season = SEASON_FALLBACK): Promise<BatterArsenalStatLine[]> {
  const lines = await Promise.all(pitchTypes.map(pt => fetchOnePitchType(batterId, pt, season)))
  const real = lines.filter((r): r is NonNullable<typeof r> => r !== null)

  const withEdge = await Promise.all(real.map(async line => {
    if (line.rv100 == null) return { ...line, edgeScore: null, edgePoolSize: 0 }
    const pool = await fetchPool(line.pitchType, season)
    const qualified = pool.filter(r => r.pitches >= MIN_POOL_PITCHES && r.rv100 != null)
    const rv100Pool = qualified.map(r => r.rv100 as number)
    return { ...line, edgeScore: percentileOf(rv100Pool, line.rv100), edgePoolSize: qualified.length }
  }))

  return withEdge.sort((a, b) => b.pitches - a.pitches)
}
