// src/lib/pro-lab-pitcher.ts
//
// Pro Lab — pitcher advanced tab, tier 1 (data already reachable, no new
// pipeline required):
//   - Day/night split                  (MLB Stats API, proven pattern)
//   - Velocity game-by-game            (Statcast statcast_search CSV — UNVERIFIED, see note)
//   - Pitch break game-by-game         (Statcast statcast_search CSV — UNVERIFIED)
//   - HR distance allowed, game-by-game (Statcast statcast_search CSV — UNVERIFIED)
//
// ⚠ FIELD VERIFICATION REQUIRED BEFORE THIS SHIPS ANYWHERE
// This codebase has never hit the `statcast_search` CSV endpoint before —
// only `pitch-arsenal-stats` and `percentile-rankings` are proven (see
// batter-stats.ts). The field names below (`release_speed`, `pfx_x`,
// `pfx_z`, `hit_distance_sc`, `game_date`, `events`) are Baseball Savant's
// documented Statcast column names, but I can't reach baseballsavant.mlb.com
// from this environment to confirm the actual response shape. Run
// `getPitcherVeloLog` against one real pitcher_id first and log the raw
// headers before building any component on top of this — same discipline
// as the MILB_AAA_SPORT_ID flag in fetch_player_form.py.
//
// Empty-state discipline: every function returns [] on failure or missing
// data, never fabricated/interpolated points. Components consuming this
// must render an honest "not enough data" state, not a fake flat line.

// =====================================================
// DAY / NIGHT SPLIT — MLB Stats API (proven source)
// =====================================================

export type DayNightSplit = {
  day: { games: number; era: number | null; whip: number | null; k_per_9: number | null }
  night: { games: number; era: number | null; whip: number | null; k_per_9: number | null }
}

const MLB_API = 'https://statsapi.mlb.com/api/v1'

/**
 * Pulls the pitcher's full game log for the season and splits by day/night
 * using each game's actual first-pitch local time via the schedule endpoint.
 * Two-request approach (game log + schedule dates) because the game log
 * itself doesn't carry day/night — only `dayNight` on the schedule/game
 * feed does.
 */
export async function getPitcherDayNightSplit(
  pitcherId: number,
  season: number = new Date().getFullYear()
): Promise<DayNightSplit | null> {
  try {
    const logRes = await fetch(
      `${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}`,
      { cache: 'no-store' }
    )
    if (!logRes.ok) {
      console.error('[pro-lab] pitcher game log fetch failed:', logRes.status)
      return null
    }
    const logJson = await logRes.json()
    const splits = logJson?.stats?.[0]?.splits as any[] | undefined
    if (!splits || splits.length === 0) return null

    // Each split has a `game.gamePk` — batch-fetch dayNight via schedule,
    // chunked to avoid one enormous query string.
    const gamePks: number[] = splits.map(s => s.game?.gamePk).filter(Boolean)
    if (gamePks.length === 0) return null

    const dayNightByPk = new Map<number, 'day' | 'night'>()
    const CHUNK = 25
    for (let i = 0; i < gamePks.length; i += CHUNK) {
      const chunk = gamePks.slice(i, i + CHUNK)
      const schedRes = await fetch(
        `${MLB_API}/schedule?gamePk=${chunk.join(',')}&sportId=1`,
        { cache: 'no-store' }
      )
      if (!schedRes.ok) continue
      const schedJson = await schedRes.json()
      for (const dateBlock of schedJson?.dates ?? []) {
        for (const g of dateBlock.games ?? []) {
          if (g?.gamePk && g?.dayNight) {
            dayNightByPk.set(g.gamePk, g.dayNight === 'day' ? 'day' : 'night')
          }
        }
      }
    }

    const buckets = {
      day: { er: 0, ip: 0, h: 0, bb: 0, k: 0, games: 0 },
      night: { er: 0, ip: 0, h: 0, bb: 0, k: 0, games: 0 },
    }

    for (const s of splits) {
      const pk = s.game?.gamePk
      const bucket = pk ? dayNightByPk.get(pk) : null
      if (!bucket) continue // unresolved game — skip rather than guess
      const stat = s.stat
      if (!stat) continue
      const ip = parseInnings(stat.inningsPitched)
      buckets[bucket].er += Number(stat.earnedRuns ?? 0)
      buckets[bucket].ip += ip
      buckets[bucket].h += Number(stat.hits ?? 0)
      buckets[bucket].bb += Number(stat.baseOnBalls ?? 0)
      buckets[bucket].k += Number(stat.strikeOuts ?? 0)
      buckets[bucket].games += 1
    }

    const toSplit = (b: typeof buckets.day) => ({
      games: b.games,
      era: b.ip > 0 ? Number(((b.er * 9) / b.ip).toFixed(2)) : null,
      whip: b.ip > 0 ? Number(((b.h + b.bb) / b.ip).toFixed(2)) : null,
      k_per_9: b.ip > 0 ? Number(((b.k * 9) / b.ip).toFixed(2)) : null,
    })

    if (buckets.day.games === 0 && buckets.night.games === 0) return null

    return { day: toSplit(buckets.day), night: toSplit(buckets.night) }
  } catch (err) {
    console.error('[pro-lab] getPitcherDayNightSplit failed:', err)
    return null
  }
}

function parseInnings(ipStr: string | number | null | undefined): number {
  if (ipStr == null) return 0
  const s = String(ipStr)
  if (!s.includes('.')) return Number(s) || 0
  const [whole, outs] = s.split('.')
  const outsNum = Number(outs) || 0
  // MLB format: .1 = 1 out (1/3 inning), .2 = 2 outs (2/3 inning) — NOT decimal tenths
  return Number(whole) + outsNum / 3
}

// =====================================================
// VELOCITY / BREAK / HR DISTANCE — Statcast game logs
// UNVERIFIED — see file header. Requires server-side proxy (CORS blocks
// browser calls to baseballsavant.mlb.com, same as batter-stats.ts).
// =====================================================

export type VeloGamePoint = {
  game_date: string
  opponent: string | null
  avg_velocity: number | null
  max_velocity: number | null
  pitch_count: number
}

export type BreakGamePoint = {
  game_date: string
  pitch_type: string
  avg_horizontal_break: number | null // pfx_x, inches
  avg_vertical_break: number | null   // pfx_z, inches
}

export type HRAllowedPoint = {
  game_date: string
  batter_name: string | null
  pitch_type: string | null
  exit_velocity: number | null
  hit_distance_ft: number | null
  venue: string | null
}

/**
 * Fetches raw Statcast pitch-level rows for one pitcher over a date range
 * via the statcast_search CSV endpoint, then aggregates client-side into
 * per-game points. Single fetch reused by velo/break; HR distance filters
 * to home-run events only.
 *
 * NOTE: column names below (game_date, release_speed, pfx_x, pfx_z,
 * pitch_type, events, hit_distance_sc, launch_speed, player_name, home_team,
 * away_team) are Baseball Savant's documented Statcast CSV schema as of
 * training data — CONFIRM against a live response before trusting.
 */
async function fetchStatcastPitcherRows(
  pitcherId: number,
  season: number
): Promise<Record<string, string>[] | null> {
  const params = new URLSearchParams({
    all: 'true',
    hfPT: '',
    hfAB: '',
    hfGT: 'R|', // regular season
    hfPR: '',
    hfZ: '',
    hfStadium: '',
    hfBBL: '',
    hfNewZones: '',
    hfPull: '',
    hfC: '',
    hfSea: `${season}|`,
    hfSit: '',
    player_type: 'pitcher',
    hfOuts: '',
    opponent: '',
    pitcher_throws: '',
    batter_stands: '',
    hfSA: '',
    game_date_gt: '',
    game_date_lt: '',
    hfInfield: '',
    team: '',
    position: '',
    hfOutfield: '',
    hfRO: '',
    home_road: '',
    pitchers_lookup: String(pitcherId),
    type: 'details',
  })
  const url = `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })
    if (!res.ok) {
      console.error('[pro-lab] statcast_search fetch failed:', res.status)
      return null
    }
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    console.log('[pro-lab] statcast_search headers (verify these):', headers)

    const rows: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? '' })
      rows.push(row)
    }
    return rows
  } catch (err) {
    console.error('[pro-lab] fetchStatcastPitcherRows failed:', err)
    return null
  }
}

export async function getPitcherVeloLog(
  pitcherId: number,
  season: number = new Date().getFullYear()
): Promise<VeloGamePoint[]> {
  const rows = await fetchStatcastPitcherRows(pitcherId, season)
  if (!rows) return []

  const byGame = new Map<string, { velos: number[]; opponent: string | null }>()
  for (const r of rows) {
    const date = r['game_date']
    const speed = parseFloat(r['release_speed'])
    if (!date || isNaN(speed)) continue
    if (!byGame.has(date)) {
      byGame.set(date, { velos: [], opponent: r['away_team'] || r['home_team'] || null })
    }
    byGame.get(date)!.velos.push(speed)
  }

  return Array.from(byGame.entries())
    .map(([game_date, { velos, opponent }]) => ({
      game_date,
      opponent,
      avg_velocity: velos.length ? Number((velos.reduce((a, b) => a + b, 0) / velos.length).toFixed(1)) : null,
      max_velocity: velos.length ? Number(Math.max(...velos).toFixed(1)) : null,
      pitch_count: velos.length,
    }))
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
}

export async function getPitcherBreakLog(
  pitcherId: number,
  season: number = new Date().getFullYear()
): Promise<BreakGamePoint[]> {
  const rows = await fetchStatcastPitcherRows(pitcherId, season)
  if (!rows) return []

  const key = (date: string, pt: string) => `${date}__${pt}`
  const byGamePitch = new Map<string, { h: number[]; v: number[] }>()

  for (const r of rows) {
    const date = r['game_date']
    const pitchType = r['pitch_type'] || r['pitch_name']
    const px = parseFloat(r['pfx_x'])
    const pz = parseFloat(r['pfx_z'])
    if (!date || !pitchType) continue
    const k = key(date, pitchType)
    if (!byGamePitch.has(k)) byGamePitch.set(k, { h: [], v: [] })
    if (!isNaN(px)) byGamePitch.get(k)!.h.push(px)
    if (!isNaN(pz)) byGamePitch.get(k)!.v.push(pz)
  }

  return Array.from(byGamePitch.entries())
    .map(([k, { h, v }]) => {
      const [game_date, pitch_type] = k.split('__')
      return {
        game_date,
        pitch_type,
        // Statcast pfx values are in feet — convert to inches (×12) to match
        // how break is normally displayed. Confirm units against real data.
        avg_horizontal_break: h.length ? Number(((h.reduce((a, b) => a + b, 0) / h.length) * 12).toFixed(1)) : null,
        avg_vertical_break: v.length ? Number(((v.reduce((a, b) => a + b, 0) / v.length) * 12).toFixed(1)) : null,
      }
    })
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
}

export async function getPitcherHRAllowedLog(
  pitcherId: number,
  season: number = new Date().getFullYear()
): Promise<HRAllowedPoint[]> {
  const rows = await fetchStatcastPitcherRows(pitcherId, season)
  if (!rows) return []

  return rows
    .filter(r => r['events'] === 'home_run')
    .map(r => {
      const dist = parseFloat(r['hit_distance_sc'])
      const ev = parseFloat(r['launch_speed'])
      return {
        game_date: r['game_date'] || '',
        batter_name: r['player_name'] || null,
        pitch_type: r['pitch_type'] || null,
        exit_velocity: isNaN(ev) ? null : Number(ev.toFixed(1)),
        hit_distance_ft: isNaN(dist) ? null : Math.round(dist),
        venue: r['home_team'] || null, // venue name not in this row set — join against schedule if needed
      }
    })
    .filter(p => p.game_date)
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
}
