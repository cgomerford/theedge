import { MLB_TEAMS } from '@/lib/mlb-assets'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// =====================================================
// TYPES
// =====================================================

export type BatterStatcast = {
  xba: number | null
  xslg: number | null
  xwoba: number | null
  barrel_pct: number | null
  hard_hit_pct: number | null
  sweet_spot_pct: number | null
  avg_exit_velocity: number | null
  max_exit_velocity: number | null
  sprint_speed: number | null
  k_pct: number | null
  bb_pct: number | null
}

export type BatterSplits = {
  last_7:  { avg: string; obp: string; slg: string; ops: string; pa: number; runs: number; rbi: number; walks: number; games: number } | null
  last_14: { avg: string; obp: string; slg: string; ops: string; pa: number; runs: number; rbi: number; walks: number; games: number } | null
  last_30: { avg: string; obp: string; slg: string; ops: string; pa: number; runs: number; rbi: number; walks: number; games: number } | null
  vs_lhp:  { avg: string; obp: string; slg: string; ops: string; pa: number } | null
  vs_rhp:  { avg: string; obp: string; slg: string; ops: string; pa: number } | null
}

export type BatterVsPitcher = {
  avg: string
  obp: string
  slg: string
  ops: string
  ab: number
  hits: number
  home_runs: number
  strikeouts: number
  walks: number
}

export type BatterSeasonStats = {
  avg: string
  obp: string
  slg: string
  ops: string
  home_runs: number
  rbi: number
  runs: number
  stolen_bases: number
  strikeouts: number
  walks: number
  pa: number
  hits: number
  doubles: number
  triples: number
  babip: string
  iso: string
}

// =====================================================
// SEASON STATS — MLB Stats API
// =====================================================

export async function getBatterSeasonStats(
  playerId: number
): Promise<BatterSeasonStats | null> {
  const season = new Date().getFullYear()
  const url = `${MLB_API}/people/${playerId}/stats?stats=season&group=hitting&season=${season}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const s = data.stats?.[0]?.splits?.[0]?.stat
    if (!s) return null

    const avg = parseFloat(s.avg ?? '0')
    const slg = parseFloat(s.slg ?? '0')
    const iso = slg && avg ? (slg - avg).toFixed(3) : '—'

    return {
      avg:          s.avg              ?? '—',
      obp:          s.obp              ?? '—',
      slg:          s.slg              ?? '—',
      ops:          s.ops              ?? '—',
      home_runs:    s.homeRuns         ?? 0,
      rbi:          s.rbi              ?? 0,
      runs:         s.runs             ?? 0,
      stolen_bases: s.stolenBases      ?? 0,
      strikeouts:   s.strikeOuts       ?? 0,
      walks:        s.baseOnBalls      ?? 0,
      pa:           s.plateAppearances ?? 0,
      hits:         s.hits             ?? 0,
      doubles:      s.doubles          ?? 0,
      triples:      s.triples          ?? 0,
      babip:        s.babip            ?? '—',
      iso,
    }
  } catch (err) {
    console.error('Batter season stats fetch failed:', err)
    return null
  }
}

// =====================================================
// RECENT FORM SPLITS — MLB Stats API
// =====================================================

export async function getBatterSplits(
  playerId: number
): Promise<BatterSplits> {
  const season = new Date().getFullYear()
  const today = new Date()

  // Helper to format YYYY-MM-DD
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Build date ranges for L7, L14, L30
  const endDate = fmt(today)
  const date7   = fmt(new Date(today.getTime() - 7  * 24 * 60 * 60 * 1000))
  const date14  = fmt(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000))
  const date30  = fmt(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))

  // Fetch byDateRange stats — more reliable than sitCodes
 async function fetchDateRange(startDate: string, endDate: string) {
    try {
      const url = `${MLB_API}/people/${playerId}/stats?stats=byDateRange&group=hitting&startDate=${startDate}&endDate=${endDate}&season=${season}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      const s = data.stats?.[0]?.splits?.[0]?.stat
      if (!s) return null
      return {
        avg:   s.avg              ?? '—',
        obp:   s.obp              ?? '—',
        slg:   s.slg              ?? '—',
        ops:   s.ops              ?? '—',
        pa:    s.plateAppearances ?? 0,
        runs:  s.runs             ?? 0,
        rbi:   s.rbi              ?? 0,
        walks: s.baseOnBalls      ?? 0,
        games: s.gamesPlayed      ?? 0,
      }
    } catch {
      return null
    }
  }

  // Fetch vs handedness — use statSplits with vl/vr codes
  async function fetchSplit(sitCode: string) {
    try {
      const url = `${MLB_API}/people/${playerId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=${sitCode}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      const s = data.stats?.[0]?.splits?.[0]?.stat
      if (!s) return null
      return {
        avg: s.avg              ?? '—',
        obp: s.obp              ?? '—',
        slg: s.slg              ?? '—',
        ops: s.ops              ?? '—',
        pa:  s.plateAppearances ?? 0,
      }
    } catch {
      return null
    }
  }

  const [last_7, last_14, last_30, vs_lhp, vs_rhp] = await Promise.all([
    fetchDateRange(date7,  endDate),
    fetchDateRange(date14, endDate),
    fetchDateRange(date30, endDate),
    fetchSplit('vl'),
    fetchSplit('vr'),
  ])

  return { last_7, last_14, last_30, vs_lhp, vs_rhp }
}

// =====================================================
// VS PITCHER (H2H) — MLB Stats API
// =====================================================

// 2026-09-17: was `cache: 'no-store'` with no request timeout — every
// call hit MLB live with zero caching, and a stalled connection blocked
// on undici's ~10s default connect timeout. Under series-matchup.ts's
// concurrent per-batter-per-game fan-out (9 batters x N games x 2 teams)
// that produced 20+ ECONNRESET/ConnectTimeoutError failures in one page
// load (2026-09-08 dev log) and got this call site disabled entirely.
// Fixed at the source instead of staying disabled: real caching (career
// H2H between two specific players changes at most once a day, when they
// actually face each other) plus a bounded timeout so one slow connection
// can't stall the batch.
export async function getBatterVsPitcher(
  batterId: number,
  pitcherId: number
): Promise<BatterVsPitcher | null> {
  try {
    const url = `${MLB_API}/people/${batterId}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${pitcherId}`
    const res = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const s = data.stats?.[0]?.splits?.[0]?.stat
    if (!s) return null

    return {
      avg:        s.avg         ?? '—',
      obp:        s.obp         ?? '—',
      slg:        s.slg         ?? '—',
      ops:        s.ops         ?? '—',
      ab:         s.atBats      ?? 0,
      hits:       s.hits        ?? 0,
      home_runs:  s.homeRuns    ?? 0,
      strikeouts: s.strikeOuts  ?? 0,
      walks:      s.baseOnBalls ?? 0,
    }
  } catch (err) {
    console.error('Batter vs pitcher fetch failed:', err)
    return null
  }
}

// =====================================================
// STATCAST — Baseball Savant CSV endpoint
// =====================================================
// =====================================================
// STATCAST — Baseball Savant CSV endpoints
// Two leaderboards, not one — expected_statistics for xBA/xSLG/xwOBA,
// statcast for exit velo/barrel/sweet-spot. This is the same chain
// already proven working in BattingTabContent.tsx's fetchStatcastClientSide;
// the old single-endpoint percentile-rankings version below it was
// returning null for most players (wrong column names + high PA bar).
// =====================================================
export async function getBatterStatcast(playerId: number): Promise<BatterStatcast | null> {
  const season = new Date().getFullYear()

  async function fetchSavantCSV(url: string): Promise<Record<string, string> | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', 'Accept': 'text/csv,*/*' },
        cache: 'no-store',
      })
      if (!res.ok) return null
      const text = await res.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return null
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const idIdx = headers.findIndex(h => h === 'player_id' || h === 'playerid' || h === 'mlbam_id' || h === 'batter')
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
    fetchSavantCSV(`https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${season}&position=&team=&min=10&csv=true`),
    fetchSavantCSV(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${season}&position=&team=&min=10&csv=true`),
  ])

  if (!expectedStats) return null

  const num = (obj: Record<string, string> | null, key: string): number | null => {
    if (!obj) return null
    const val = parseFloat(obj[key] ?? '')
    return isNaN(val) ? null : val
  }

  return {
    xba: num(expectedStats, 'est_ba'),
    xslg: num(expectedStats, 'est_slg'),
    xwoba: num(expectedStats, 'est_woba'),
    barrel_pct: num(evStats, 'brl_percent'),
    hard_hit_pct: num(evStats, 'ev95percent'),
    sweet_spot_pct: num(evStats, 'anglesweetspotpercent'),
    avg_exit_velocity: num(evStats, 'avg_hit_speed'),
    max_exit_velocity: num(evStats, 'max_hit_speed'),
    sprint_speed: null,
    k_pct: null,
    bb_pct: null,
  }
}

// =====================================================
// TOP-N BATTERS BY PLATE APPEARANCES — bulk season stats
// =====================================================
//
// One MLB Stats API call returns up to `limit` batters' FULL season line
// (HR/2B/3B/SLG/etc.), ranked by plate appearances — real everyday
// regulars, not a stat-specific leaderboard skewed toward one skill (the
// way a home-run leaderboard is skewed toward power hitters). This is the
// bulk equivalent of calling getBatterSeasonStats() once per player: same
// underlying data, one request instead of up to 100, and it doubles as
// the pool definition for "top 100 qualified batters" used by the
// bat-speed radar/neural charts (see src/app/page.tsx).

export type TopBatter = { personId: number; name: string; teamAbbr: string; seasonStats: BatterSeasonStats }

export async function getTopBattersByPlateAppearances(limit = 100): Promise<TopBatter[]> {
  const season = new Date().getFullYear()
  const url = `${MLB_API}/stats?stats=season&group=hitting&sportId=1&season=${season}&limit=${limit}&sortStat=plateAppearances&order=desc`

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const data = await res.json()
    const splits: unknown[] = data.stats?.[0]?.splits ?? []

    return splits.map((sp): TopBatter | null => {
      const row = sp as { stat?: Record<string, unknown>; team?: { id?: number }; player?: { id?: number; fullName?: string } }
      const s = row.stat
      const player = row.player
      if (!s || !player?.id || !player.fullName) return null

      const avg = parseFloat(String(s.avg ?? '0'))
      const slg = parseFloat(String(s.slg ?? '0'))
      const iso = slg && avg ? (slg - avg).toFixed(3) : '—'

      return {
        personId: player.id,
        name: player.fullName,
        teamAbbr: MLB_TEAMS[row.team?.id ?? -1]?.abbr ?? '—',
        seasonStats: {
          avg: String(s.avg ?? '—'),
          obp: String(s.obp ?? '—'),
          slg: String(s.slg ?? '—'),
          ops: String(s.ops ?? '—'),
          home_runs: Number(s.homeRuns ?? 0),
          rbi: Number(s.rbi ?? 0),
          runs: Number(s.runs ?? 0),
          stolen_bases: Number(s.stolenBases ?? 0),
          strikeouts: Number(s.strikeOuts ?? 0),
          walks: Number(s.baseOnBalls ?? 0),
          pa: Number(s.plateAppearances ?? 0),
          hits: Number(s.hits ?? 0),
          doubles: Number(s.doubles ?? 0),
          triples: Number(s.triples ?? 0),
          babip: String(s.babip ?? '—'),
          iso,
        },
      }
    }).filter((r): r is TopBatter => r !== null)
  } catch (err) {
    console.error('getTopBattersByPlateAppearances fetch failed:', err)
    return []
  }
}