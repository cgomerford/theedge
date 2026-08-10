// src/lib/savant.ts
//
// Baseball Savant (Statcast) data layer for the Scout Report.
// Pulls pitch-arsenal stats + velocity directly from Savant CSV endpoints
// and maps them into ArsenalPitch / PitcherForScout shapes used by scout.ts.
//
// Endpoints (public CSV downloads):
//   https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?...&csv=true
//   https://baseballsavant.mlb.com/leaderboard/pitch-arsenals?...&csv=true

import type { ArsenalPitch, PitcherForScout } from './scout'

// ─── Pitch type codes used by Savant ─────────────────────────────────────────
const PITCH_NAMES: Record<string, string> = {
  FF: '4-Seam Fastball',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  CH: 'Changeup',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  FS: 'Splitter',
  ST: 'Sweeper',
  SV: 'Slurve',
  KN: 'Knuckleball',
  FO: 'Forkball',
  SC: 'Screwball',
  EP: 'Eephus',
}

// Columns from pitch-arsenal-stats CSV that map to ArsenalPitch
type SavantArsenalRow = {
  player_id: number
  last_name_first_name?: string
  team_name_alt?: string
  pitch_type: string
  pitch_name: string
  pitches: number | null
  pitch_usage: number | null      // already a percent, e.g. 51.7
  ba: number | null
  whiff_percent: number | null    // already a percent, e.g. 16.6
  put_away: number | null         // already a percent, e.g. 19.4
  est_ba: number | null
  est_woba: number | null
  hard_hit_percent: number | null // already a percent
  k_percent: number | null
  run_value_per_100: number | null
}

type VelocityRow = {
  pitcher: number
  // dynamic keys: ff_avg_speed, si_avg_speed, ...
  [key: string]: number | string | null
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, '').trim()
  if (!clean) return []

  const lines = clean.split(/\r?\n/)
  if (lines.length < 2) return []

  // Header may include quoted "last_name, first_name"
  const headerLine = lines[0]
  const headers = splitCsvLine(headerLine).map(h =>
    h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/\s+/g, '_')
  )

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length === 0) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').replace(/^"|"$/g, '').trim()
    })
    rows.push(row)
  }
  return rows
}

/** Minimal CSV line splitter that respects quoted fields with commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      cur += c
    } else if (c === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function num(v: string | undefined | null): number | null {
  if (v == null || v === '' || v === 'null') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (compatible; ScoutReport/1.0; +https://baseballsavant.mlb.com)'

async function fetchSavantCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { Accept: 'text/csv,text/plain,*/*', 'User-Agent': UA },
    // Next.js: avoid caching stale season data too long in production if desired
    // next: { revalidate: 3600 },
  })
  if (!res.ok) {
    throw new Error(`Savant fetch failed ${res.status}: ${url}`)
  }
  const text = await res.text()
  // Savant sometimes returns HTML error pages
  if (text.trimStart().startsWith('<!') || text.includes('<html')) {
    throw new Error(`Savant returned HTML instead of CSV: ${url}`)
  }
  return parseCsv(text)
}

/**
 * Full-season pitch arsenal outcome stats (whiff, put-away, xwOBA, usage, …)
 * from Baseball Savant Pitch Arsenal Stats leaderboard.
 */
export async function fetchSavantArsenalStats(year: number, minPitches = 25): Promise<SavantArsenalRow[]> {
  const url =
    `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats` +
    `?type=pitcher&pitchType=&year=${year}&team=&min=${minPitches}&csv=true`

  const raw = await fetchSavantCsv(url)
  const rows: SavantArsenalRow[] = []

  for (const r of raw) {
    // Header variants: "player_id" or after normalize
    const playerId = num(r['player_id']) ?? num(r['pitcher'])
    const pitchType = (r['pitch_type'] || '').toUpperCase()
    if (playerId == null || !pitchType) continue

    const name =
      r['last_name,_first_name'] ||
      r['last_name, first_name'] ||
      r['name'] ||
      undefined
    const team = r['team_name_alt'] || r['team'] || undefined

    rows.push({
      player_id: playerId,
      last_name_first_name: name,
      team_name_alt: team,
      pitch_type: pitchType,
      pitch_name: r['pitch_name'] || PITCH_NAMES[pitchType] || pitchType,
      pitches: num(r['pitches']),
      pitch_usage: num(r['pitch_usage']),
      ba: num(r['ba']),
      whiff_percent: num(r['whiff_percent']),
      put_away: num(r['put_away']),
      est_ba: num(r['est_ba']),
      est_woba: num(r['est_woba']),
      hard_hit_percent: num(r['hard_hit_percent']),
      k_percent: num(r['k_percent']),
      run_value_per_100: num(r['run_value_per_100']),
    })
  }

  return rows
}

/**
 * Average velocity by pitch type from Savant Pitch Arsenals leaderboard.
 * Returns map: playerId → { FF: 97.5, SL: 85.1, ... }
 */
export async function fetchSavantPitchVelocity(
  year: number,
  minPitches = 25,
): Promise<Map<number, Record<string, number>>> {
  const url =
    `https://baseballsavant.mlb.com/leaderboard/pitch-arsenals` +
    `?year=${year}&min=${minPitches}&type=avg_speed&hand=&csv=true`

  const raw = await fetchSavantCsv(url)
  const map = new Map<number, Record<string, number>>()

  // Columns look like: ff_avg_speed, si_avg_speed, ...
  for (const r of raw) {
    const pid = num(r['pitcher']) ?? num(r['player_id'])
    if (pid == null) continue
    const speeds: Record<string, number> = {}
    for (const [key, val] of Object.entries(r)) {
      const m = key.match(/^([a-z]{2})_avg_speed$/)
      if (!m) continue
      const code = m[1].toUpperCase()
      const v = num(val)
      if (v != null) speeds[code] = v
    }
    if (Object.keys(speeds).length > 0) map.set(pid, speeds)
  }
  return map
}

// ─── Map → ArsenalPitch ──────────────────────────────────────────────────────

export function savantRowToArsenalPitch(
  row: SavantArsenalRow,
  velocity: number | null = null,
): ArsenalPitch {
return {
    pitch_type: row.pitch_type,
    pitch_name: row.pitch_name || PITCH_NAMES[row.pitch_type] || row.pitch_type,
    count: row.pitches,
    // Savant pitch_usage is already a percent (e.g. 51.7)
    percentage: row.pitch_usage,
    avg_velocity: velocity,
    // Savant whiff_percent / put_away / hard_hit are already percents
    whiff_percent: row.whiff_percent,
    put_away_percent: row.put_away,
    est_woba: row.est_woba,
    hard_hit_percent: row.hard_hit_percent,
    ba_against: row.est_ba ?? row.ba,
  }
}

/**
 * Build ArsenalPitch[] for one pitcher from Savant season data.
 * Sorted by usage descending.
 */
export function buildArsenalForPitcher(
  playerId: number,
  arsenalRows: SavantArsenalRow[],
  velocityMap?: Map<number, Record<string, number>>,
): ArsenalPitch[] {
  const speeds = velocityMap?.get(playerId)
  return arsenalRows
    .filter(r => r.player_id === playerId)
    .map(r => savantRowToArsenalPitch(r, speeds?.[r.pitch_type] ?? null))
    .filter(p => (p.percentage ?? 0) > 0)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
}

/** Coerce MLBAM id whether it arrives as number or string. */
function asPlayerId(id: number | string | null | undefined): number | null {
  if (id == null || id === '') return null
  const n = typeof id === 'number' ? id : Number(id)
  return Number.isFinite(n) ? n : null
}

/**
 * Fetch full Savant arsenal + velocity for a season, indexed by player_id.
 * minPitches defaults to 1 so no starter is dropped early in the year.
 */
export async function fetchSavantArsenalsByPlayer(
  year: number,
  minPitches = 1,
): Promise<{
  arsenals: Map<number, ArsenalPitch[]>
  pitchCounts: Map<number, number>
}> {
  const [rows, velo] = await Promise.all([
    fetchSavantArsenalStats(year, minPitches),
    fetchSavantPitchVelocity(year, minPitches).catch(() => new Map<number, Record<string, number>>()),
  ])

  const arsenals = new Map<number, ArsenalPitch[]>()
  const pitchCounts = new Map<number, number>()
  const seen = new Set<number>()

  for (const r of rows) {
    seen.add(r.player_id)
    pitchCounts.set(r.player_id, (pitchCounts.get(r.player_id) ?? 0) + (r.pitches ?? 0))
  }

  for (const pid of seen) {
    arsenals.set(pid, buildArsenalForPitcher(pid, rows, velo))
  }

  return { arsenals, pitchCounts }
}

/**
 * Single-pitcher fetch — useful for debugging.
 * Always overwrites arsenal with Savant numbers.
 */
export async function getPitcherArsenalFromSavant(
  playerId: number | string,
  year: number = new Date().getFullYear(),
): Promise<{ arsenal: ArsenalPitch[]; pitchCount: number }> {
  const pid = asPlayerId(playerId)
  if (pid == null) return { arsenal: [], pitchCount: 0 }
  const { arsenals, pitchCounts } = await fetchSavantArsenalsByPlayer(year, 1)
  return {
    arsenal: arsenals.get(pid) ?? [],
    pitchCount: pitchCounts.get(pid) ?? 0,
  }
}

/**
 * Attach Baseball Savant arsenal data onto a PitcherForScout.
 *
 * MUST run on the server (Savant blocks browser CORS).
 * MUST receive a real MLBAM player_id (number or numeric string).
 * ALWAYS replaces pitcher.arsenal when Savant returns rows — never keeps stale mix.
 */
export async function hydratePitcherFromSavant(
  pitcher: PitcherForScout,
  year: number = new Date().getFullYear(),
  cache?: {
    arsenals: Map<number, ArsenalPitch[]>
    pitchCounts: Map<number, number>
  },
): Promise<PitcherForScout> {
  const pid = asPlayerId(pitcher.player_id)
  if (pid == null) {
    console.warn('[savant] hydrate skipped — missing player_id for', pitcher.player_name)
    return pitcher
  }

  const data = cache ?? (await fetchSavantArsenalsByPlayer(year, 1))
  const arsenal = data.arsenals.get(pid) ?? []
  const pitchCount = data.pitchCounts.get(pid) ?? 0

  if (arsenal.length === 0) {
    console.warn(
      `[savant] no arsenal rows for player_id=${pid} (${pitcher.player_name}) year=${year}. Keeping prior arsenal.`,
    )
    return pitcher
  }

  // Force numeric player_id so downstream lookups stay consistent
  return {
    ...pitcher,
    player_id: pid,
    arsenal, // full replace — this is the whole point
    season_pitches_thrown: pitchCount > 0 ? pitchCount : pitcher.season_pitches_thrown,
  }
}

/**
 * Hydrate both starters for a matchup from a single Savant season pull.
 * Call this in a Server Component / route handler, never in the browser.
 */
export async function hydrateMatchupPitchersFromSavant(
  homePitcher: PitcherForScout | null,
  awayPitcher: PitcherForScout | null,
  year: number = new Date().getFullYear(),
): Promise<{
  homePitcher: PitcherForScout | null
  awayPitcher: PitcherForScout | null
  source: 'baseball-savant'
  year: number
}> {
  const cache = await fetchSavantArsenalsByPlayer(year, 1)

  const home = homePitcher
    ? await hydratePitcherFromSavant(homePitcher, year, cache)
    : null
  const away = awayPitcher
    ? await hydratePitcherFromSavant(awayPitcher, year, cache)
    : null

  // Sanity log — remove once confirmed in production
  if (home?.arsenal?.length) {
    const top = home.arsenal[0]
    console.info(
      `[savant] ${home.player_name}: ${home.arsenal.length} pitches · top ${top.pitch_name} ${top.percentage}% usage, ${top.whiff_percent}% whiff, xwOBA ${top.est_woba}`,
    )
  }
  if (away?.arsenal?.length) {
    const top = away.arsenal[0]
    console.info(
      `[savant] ${away.player_name}: ${away.arsenal.length} pitches · top ${top.pitch_name} ${top.percentage}% usage, ${top.whiff_percent}% whiff, xwOBA ${top.est_woba}`,
    )
  }

  return { homePitcher: home, awayPitcher: away, source: 'baseball-savant', year }
}

// ─── Sample tag helper for scout lines ───────────────────────────────────────

export function savantSampleTag(pitchCount?: number | null, year?: number): string {
  const y = year ?? new Date().getFullYear()
  if (pitchCount != null && pitchCount > 0) {
    return `n=${pitchCount.toLocaleString()} · Baseball Savant ${y}`
  }
  return `Baseball Savant · ${y}`
}
