// src/lib/pro-lab-batter.ts
//
// Pro Lab — batter advanced tab, tier 1. Mirrors pro-lab-pitcher.ts.
//   - Day/night split                (MLB Stats API, proven pattern)
//   - Exit velo game-by-game         (Statcast statcast_search CSV — UNVERIFIED)
//   - HR distance hit, game-by-game  (Statcast statcast_search CSV — UNVERIFIED)
//   - Raw batted-ball coordinates    (Statcast hc_x/hc_y — UNVERIFIED, held
//     here now so #5 (spray chart on real stadium dims) doesn't need a
//     second pass at this endpoint later. NOT rendered by anything yet.)
//
// ⚠ SAME VERIFICATION GATE AS pro-lab-pitcher.ts — these two files share
// one unconfirmed assumption about statcast_search's CSV column names.
// Test both together against one real batter_id + pitcher_id and diff the
// headers against what's coded here before either ships.
//
// Empty-state discipline: [] / null on any missing or unparseable data —
// never fabricated or interpolated.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// =====================================================
// DAY / NIGHT SPLIT — MLB Stats API (proven source)
// =====================================================

export type BatterDayNightSplit = {
  day: { games: number; avg: number | null; obp: number | null; slg: number | null }
  night: { games: number; avg: number | null; obp: number | null; slg: number | null }
}

export async function getBatterDayNightSplit(
  batterId: number,
  season: number = new Date().getFullYear()
): Promise<BatterDayNightSplit | null> {
  try {
    const logRes = await fetch(
      `${MLB_API}/people/${batterId}/stats?stats=gameLog&group=hitting&season=${season}`,
      { cache: 'no-store' }
    )
    if (!logRes.ok) {
      console.error('[pro-lab] batter game log fetch failed:', logRes.status)
      return null
    }
    const logJson = await logRes.json()
    const splits = logJson?.stats?.[0]?.splits as any[] | undefined
    if (!splits || splits.length === 0) return null

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
      day: { ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0, games: 0 },
      night: { ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0, games: 0 },
    }

    for (const s of splits) {
      const pk = s.game?.gamePk
      const bucket = pk ? dayNightByPk.get(pk) : null
      if (!bucket) continue
      const stat = s.stat
      if (!stat) continue
      buckets[bucket].ab += Number(stat.atBats ?? 0)
      buckets[bucket].h += Number(stat.hits ?? 0)
      buckets[bucket].bb += Number(stat.baseOnBalls ?? 0)
      buckets[bucket].hbp += Number(stat.hitByPitch ?? 0)
      buckets[bucket].sf += Number(stat.sacFlies ?? 0)
      buckets[bucket].tb += Number(stat.totalBases ?? 0)
      buckets[bucket].games += 1
    }

    const toSplit = (b: typeof buckets.day) => {
      const obpDenom = b.ab + b.bb + b.hbp + b.sf
      return {
        games: b.games,
        avg: b.ab > 0 ? Number((b.h / b.ab).toFixed(3)) : null,
        obp: obpDenom > 0 ? Number(((b.h + b.bb + b.hbp) / obpDenom).toFixed(3)) : null,
        slg: b.ab > 0 ? Number((b.tb / b.ab).toFixed(3)) : null,
      }
    }

    if (buckets.day.games === 0 && buckets.night.games === 0) return null

    return { day: toSplit(buckets.day), night: toSplit(buckets.night) }
  } catch (err) {
    console.error('[pro-lab] getBatterDayNightSplit failed:', err)
    return null
  }
}

// =====================================================
// EXIT VELO / HR DISTANCE / RAW HIT COORDS — Statcast
// UNVERIFIED — see file header. Same CORS-proxy requirement as
// batter-stats.ts's existing percentile-rankings call.
// =====================================================

export type ExitVeloGamePoint = {
  game_date: string
  opponent: string | null
  avg_exit_velocity: number | null
  max_exit_velocity: number | null
  batted_ball_count: number
}

export type HRHitPoint = {
  game_date: string
  pitcher_name: string | null
  pitch_type: string | null
  exit_velocity: number | null
  hit_distance_ft: number | null
  launch_angle: number | null
}

/** Raw hit coordinate — feeds the future spray chart (#5). Not consumed anywhere yet. */
export type BattedBallCoord = {
  game_date: string
  hc_x: number | null
  hc_y: number | null
  events: string | null // 'single' | 'double' | 'home_run' | 'field_out' etc.
  venue_home_team: string | null // needed later to pick the right stadium outline
}

async function fetchStatcastBatterRows(
  batterId: number,
  season: number
): Promise<Record<string, string>[] | null> {
  const params = new URLSearchParams({
    all: 'true',
    hfPT: '',
    hfAB: '',
    hfGT: 'R|',
    hfPR: '',
    hfZ: '',
    hfStadium: '',
    hfBBL: '',
    hfNewZones: '',
    hfPull: '',
    hfC: '',
    hfSea: `${season}|`,
    hfSit: '',
    player_type: 'batter',
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
    batters_lookup: String(batterId),
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
      console.error('[pro-lab] statcast_search (batter) fetch failed:', res.status)
      return null
    }
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    console.log('[pro-lab] statcast_search (batter) headers (verify these):', headers)

    const rows: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? '' })
      rows.push(row)
    }
    return rows
  } catch (err) {
    console.error('[pro-lab] fetchStatcastBatterRows failed:', err)
    return null
  }
}

export async function getBatterExitVeloLog(
  batterId: number,
  season: number = new Date().getFullYear()
): Promise<ExitVeloGamePoint[]> {
  const rows = await fetchStatcastBatterRows(batterId, season)
  if (!rows) return []

  const byGame = new Map<string, { velos: number[]; opponent: string | null }>()
  for (const r of rows) {
    const date = r['game_date']
    const speed = parseFloat(r['launch_speed'])
    if (!date || isNaN(speed)) continue // ball-in-play rows only — takes/whiffs have no launch_speed
    if (!byGame.has(date)) {
      byGame.set(date, { velos: [], opponent: r['home_team'] || r['away_team'] || null })
    }
    byGame.get(date)!.velos.push(speed)
  }

  return Array.from(byGame.entries())
    .map(([game_date, { velos, opponent }]) => ({
      game_date,
      opponent,
      avg_exit_velocity: velos.length ? Number((velos.reduce((a, b) => a + b, 0) / velos.length).toFixed(1)) : null,
      max_exit_velocity: velos.length ? Number(Math.max(...velos).toFixed(1)) : null,
      batted_ball_count: velos.length,
    }))
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
}

export async function getBatterHRLog(
  batterId: number,
  season: number = new Date().getFullYear()
): Promise<HRHitPoint[]> {
  const rows = await fetchStatcastBatterRows(batterId, season)
  if (!rows) return []

  return rows
    .filter(r => r['events'] === 'home_run')
    .map(r => {
      const dist = parseFloat(r['hit_distance_sc'])
      const ev = parseFloat(r['launch_speed'])
      const la = parseFloat(r['launch_angle'])
      return {
        game_date: r['game_date'] || '',
        pitcher_name: r['pitcher_name'] || r['player_name'] || null,
        pitch_type: r['pitch_type'] || null,
        exit_velocity: isNaN(ev) ? null : Number(ev.toFixed(1)),
        hit_distance_ft: isNaN(dist) ? null : Math.round(dist),
        launch_angle: isNaN(la) ? null : Number(la.toFixed(1)),
      }
    })
    .filter(p => p.game_date)
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
}

/**
 * Held for #5 (spray chart on real stadium dimensions) — returns every
 * batted-ball event with its raw Statcast field coordinate. Do not render
 * this against a generic/placeholder field outline; wait for the stadium
 * geometry dataset so the dots land on real wall distances.
 */
export async function getBatterBattedBallCoords(
  batterId: number,
  season: number = new Date().getFullYear()
): Promise<BattedBallCoord[]> {
  const rows = await fetchStatcastBatterRows(batterId, season)
  if (!rows) return []

  return rows
    .filter(r => r['type'] === 'X') // 'X' = ball in play, per Statcast convention
    .map(r => {
      const x = parseFloat(r['hc_x'])
      const y = parseFloat(r['hc_y'])
      return {
        game_date: r['game_date'] || '',
        hc_x: isNaN(x) ? null : x,
        hc_y: isNaN(y) ? null : y,
        events: r['events'] || null,
        venue_home_team: r['home_team'] || null,
      }
    })
    .filter(p => p.game_date && p.hc_x != null && p.hc_y != null)
}
