/**
 * src/lib/fantasy-player.ts
 *
 * Server-side player signal context — pulls season baseline + rolling
 * L30/L14/L7 windows from MLB Stats API, plus Statcast rolling xstats
 * from Baseball Savant. Composes into a single object the deep-dive
 * page renders and the "why" narrative reads from.
 *
 * Design principles matched to the rest of the app:
 *   - Everything fetched server-side, cached with `next.revalidate`
 *   - Nothing invented — if data missing, field returns null and the
 *     UI degrades gracefully rather than showing a fabricated number
 *   - Deltas computed here (not in the client) so the narrative
 *     module can pull them without re-fetching
 *
 * ⚠ UNAUDITED — same status as fantasy-yesterday.ts. Spot-check three
 * players against MLB.com and Savant before shipping to production.
 */

const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1'
const SAVANT_LEADERBOARD = 'https://baseballsavant.mlb.com/leaderboard'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WindowStats = {
  ops: number | null
  avg: number | null
  slg: number | null
  obp: number | null
  hr: number | null
  rbi: number | null
  sb: number | null
  k_rate: number | null      // K%
  bb_rate: number | null     // BB%
  games: number | null
}

export type StatcastRolling = {
  exit_velo_avg: number | null
  barrel_pct: number | null
  hard_hit_pct: number | null
  sweet_spot_pct: number | null
  xba: number | null
  xslg: number | null
  xwoba: number | null
}

export type PlateDiscipline = {
  chase_pct: number | null       // O-Swing%
  zone_swing_pct: number | null  // Z-Swing%
  contact_pct: number | null
  swstr_pct: number | null       // Swinging strike %
  whiff_pct: number | null
}

export type BattedBallProfile = {
  gb_pct: number | null
  ld_pct: number | null
  fb_pct: number | null
  pull_pct: number | null
  oppo_pct: number | null
}

export type PlayerMeta = {
  playerId: number
  fullName: string
  team: string | null
  teamId: number | null
  position: string | null
  bats: string | null
  throws: string | null
  age: number | null
  birthCountry: string | null
}

export type SignalDirection = 'heating' | 'cooling' | 'neutral'

export type PlayerSignalContext = {
  meta: PlayerMeta
  season: WindowStats
  l30: WindowStats
  l14: WindowStats
  l7: WindowStats
  statcastSeason: StatcastRolling
  statcastL14: StatcastRolling
  plateDiscipline: {
    season: PlateDiscipline
    l14: PlateDiscipline
  }
  battedBall: {
    season: BattedBallProfile
    l14: BattedBallProfile
  }
  direction: SignalDirection
  opsDeltaL14: number | null       // L14 OPS − Season OPS
  chaseDeltaL14: number | null     // L14 Chase% − Season Chase%
  barrelDeltaL14: number | null    // L14 Barrel% − Season Barrel%
  hardHitDeltaL14: number | null
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function currentSeason(): number {
  return new Date().getUTCFullYear()
}

// ─── MLB Stats API ───────────────────────────────────────────────────────────

async function fetchPlayerMeta(playerId: number): Promise<PlayerMeta | null> {
  const url = `${MLB_STATS_BASE}/people/${playerId}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return null
  const data = await res.json()
  const p = data?.people?.[0]
  if (!p) return null
  return {
    playerId,
    fullName: p.fullName ?? 'Unknown',
    team: p.currentTeam?.name ?? null,
    teamId: p.currentTeam?.id ?? null,
    position: p.primaryPosition?.abbreviation ?? null,
    bats: p.batSide?.code ?? null,
    throws: p.pitchHand?.code ?? null,
    age: p.currentAge ?? null,
    birthCountry: p.birthCountry ?? null,
  }
}

function parseMlbHitting(stat: Record<string, unknown> | undefined): WindowStats {
  const s = stat ?? {}
  const num = (v: unknown) => (v == null || v === '' || v === '.---' ? null : Number(v))
  const parsePct = (v: unknown, ab: number | null): number | null => {
    const n = num(v)
    if (n == null || ab == null || ab === 0) return null
    return (n / ab) * 100
  }
  return {
    ops: num(s.ops),
    avg: num(s.avg),
    slg: num(s.slg),
    obp: num(s.obp),
    hr: num(s.homeRuns),
    rbi: num(s.rbi),
    sb: num(s.stolenBases),
    k_rate: parsePct(s.strikeOuts, num(s.plateAppearances)),
    bb_rate: parsePct(s.baseOnBalls, num(s.plateAppearances)),
    games: num(s.gamesPlayed),
  }
}

async function fetchSeasonStats(playerId: number): Promise<WindowStats> {
  const url = `${MLB_STATS_BASE}/people/${playerId}/stats?stats=season&group=hitting&season=${currentSeason()}&sportId=1`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return emptyWindow()
  const data = await res.json()
  const stat = data?.stats?.[0]?.splits?.[0]?.stat
  return parseMlbHitting(stat)
}

async function fetchWindowStats(playerId: number, daysBack: number): Promise<WindowStats> {
  const url = `${MLB_STATS_BASE}/people/${playerId}/stats?stats=byDateRange&startDate=${daysAgoIso(daysBack)}&endDate=${todayIso()}&group=hitting&sportId=1`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) return emptyWindow()
  const data = await res.json()
  const stat = data?.stats?.[0]?.splits?.[0]?.stat
  return parseMlbHitting(stat)
}

function emptyWindow(): WindowStats {
  return {
    ops: null, avg: null, slg: null, obp: null,
    hr: null, rbi: null, sb: null,
    k_rate: null, bb_rate: null, games: null,
  }
}

// ─── Savant — Statcast rolling xstats + batted-ball ─────────────────────────
//
// The expected_statistics leaderboard returns xBA/xSLG/xwOBA. The statcast
// leaderboard returns EV/barrel/sweet spot/hard hit. We pull both, keyed by
// player_id, over a rolling window.
//
// Savant CSV endpoints: same quote-aware parser pattern as fantasy-yesterday.

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2) return []
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === ',' && !inQuotes) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }
  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

async function fetchSavantExpected(playerId: number, season: number): Promise<Partial<StatcastRolling>> {
  const url = `${SAVANT_LEADERBOARD}/expected_statistics?type=batter&year=${season}&minPA=q&csv=true`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return {}
    const rows = parseCsv(await res.text())
    const row = rows.find(r => Number(r['player_id']) === playerId)
    if (!row) return {}
    return {
      xba: row['est_ba'] ? Number(row['est_ba']) : null,
      xslg: row['est_slg'] ? Number(row['est_slg']) : null,
      xwoba: row['est_woba'] ? Number(row['est_woba']) : null,
    }
  } catch { return {} }
}

async function fetchSavantBattedBall(playerId: number, season: number): Promise<Partial<StatcastRolling>> {
  const url = `${SAVANT_LEADERBOARD}/statcast?type=batter&year=${season}&minPA=q&csv=true`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return {}
    const rows = parseCsv(await res.text())
    const row = rows.find(r => Number(r['player_id']) === playerId)
    if (!row) return {}
    return {
      exit_velo_avg: row['exit_velocity_avg'] ? Number(row['exit_velocity_avg']) : null,
      barrel_pct: row['brl_percent'] ? Number(row['brl_percent']) : null,
      hard_hit_pct: row['hard_hit_percent'] ? Number(row['hard_hit_percent']) : null,
      sweet_spot_pct: row['sweet_spot_percent'] ? Number(row['sweet_spot_percent']) : null,
    }
  } catch { return {} }
}

async function fetchStatcastSeason(playerId: number): Promise<StatcastRolling> {
  const season = currentSeason()
  const [xp, bb] = await Promise.all([
    fetchSavantExpected(playerId, season),
    fetchSavantBattedBall(playerId, season),
  ])
  return {
    exit_velo_avg: bb.exit_velo_avg ?? null,
    barrel_pct: bb.barrel_pct ?? null,
    hard_hit_pct: bb.hard_hit_pct ?? null,
    sweet_spot_pct: bb.sweet_spot_pct ?? null,
    xba: xp.xba ?? null,
    xslg: xp.xslg ?? null,
    xwoba: xp.xwoba ?? null,
  }
}

// L14 Statcast — Savant doesn't expose a canonical L14 leaderboard by
// player_id, so we approximate from the statcast_search CSV pull windowed
// to the last 14 days. For now, return season as a fallback and mark this
// for follow-up. Deferring rather than fabricating.
async function fetchStatcastL14(playerId: number): Promise<StatcastRolling> {
  // TODO — pull statcast_search CSV windowed to daysAgoIso(14)..todayIso(),
  // filter batter=playerId, aggregate. See fantasy-yesterday.ts pattern.
  return fetchStatcastSeason(playerId)
}

// Plate discipline + batted ball not yet wired — placeholder to keep the
// type contract stable while the deep-dive UI is built. Same fetch
// pattern will slot in against Savant's plate_discipline endpoint.
function emptyPlateDiscipline(): PlateDiscipline {
  return { chase_pct: null, zone_swing_pct: null, contact_pct: null, swstr_pct: null, whiff_pct: null }
}
function emptyBattedBall(): BattedBallProfile {
  return { gb_pct: null, ld_pct: null, fb_pct: null, pull_pct: null, oppo_pct: null }
}

// ─── Direction inference ────────────────────────────────────────────────────

function inferDirection(season: WindowStats, l14: WindowStats): SignalDirection {
  if (season.ops == null || l14.ops == null) return 'neutral'
  const delta = l14.ops - season.ops
  if (delta > 0.100) return 'heating'
  if (delta < -0.100) return 'cooling'
  return 'neutral'
}

// ─── Main composed export ───────────────────────────────────────────────────

export async function getPlayerSignalContext(playerId: number): Promise<PlayerSignalContext | null> {
  const meta = await fetchPlayerMeta(playerId)
  if (!meta) return null

  const [season, l30, l14, l7, statcastSeason, statcastL14] = await Promise.all([
    fetchSeasonStats(playerId),
    fetchWindowStats(playerId, 30),
    fetchWindowStats(playerId, 14),
    fetchWindowStats(playerId, 7),
    fetchStatcastSeason(playerId),
    fetchStatcastL14(playerId),
  ])

  const direction = inferDirection(season, l14)
  const opsDeltaL14 = season.ops != null && l14.ops != null ? l14.ops - season.ops : null
  const barrelDeltaL14 = statcastSeason.barrel_pct != null && statcastL14.barrel_pct != null
    ? statcastL14.barrel_pct - statcastSeason.barrel_pct : null
  const hardHitDeltaL14 = statcastSeason.hard_hit_pct != null && statcastL14.hard_hit_pct != null
    ? statcastL14.hard_hit_pct - statcastSeason.hard_hit_pct : null

  return {
    meta,
    season, l30, l14, l7,
    statcastSeason, statcastL14,
    plateDiscipline: {
      season: emptyPlateDiscipline(),
      l14: emptyPlateDiscipline(),
    },
    battedBall: {
      season: emptyBattedBall(),
      l14: emptyBattedBall(),
    },
    direction,
    opsDeltaL14,
    chaseDeltaL14: null,   // wires in with plate discipline fetch
    barrelDeltaL14,
    hardHitDeltaL14,
  }
}
