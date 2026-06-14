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
  last_7:  { avg: string; obp: string; slg: string; ops: string; pa: number } | null
  last_14: { avg: string; obp: string; slg: string; ops: string; pa: number } | null
  last_30: { avg: string; obp: string; slg: string; ops: string; pa: number } | null
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

export async function getBatterVsPitcher(
  batterId: number,
  pitcherId: number
): Promise<BatterVsPitcher | null> {
  try {
    const url = `${MLB_API}/people/${batterId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}`
    const res = await fetch(url, { cache: 'no-store' })
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
export async function getBatterStatcast(
  playerId: number
): Promise<BatterStatcast | null> {
  const season = new Date().getFullYear()
  const url = `https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=batter&year=${season}&csv=true`

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/csv,*/*',
      },
    })

    console.log(`[Statcast] Response status: ${res.status}, content-type: ${res.headers.get('content-type')}`)

    if (!res.ok) {
      console.error('[Statcast] Fetch failed:', res.status)
      return null
    }

    const text = await res.text()
    console.log(`[Statcast] Response length: ${text.length}, first 200 chars:`, text.substring(0, 200))

    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      console.error('[Statcast] CSV has fewer than 2 lines')
      return null
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    console.log('[Statcast] CSV headers:', headers.slice(0, 15))

    const idIdx = headers.findIndex(h => h === 'player_id' || h === 'playerid' || h === 'mlbam_id')
    if (idIdx === -1) {
      console.error('[Statcast] No player_id column found. Headers:', headers)
      return null
    }

    let playerRow: string[] | null = null
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      if (cells[idIdx] === String(playerId)) {
        playerRow = cells
        break
      }
    }

    if (!playerRow) {
      console.log(`[Statcast] Player ${playerId} not found in leaderboard (below qualifier threshold)`)
      return null
    }

    const get = (key: string): number | null => {
      const idx = headers.indexOf(key)
      if (idx === -1) return null
      const val = parseFloat(playerRow![idx])
      return isNaN(val) ? null : val
    }

    return {
      xba:               get('xba'),
      xslg:              get('xslg'),
      xwoba:             get('xwoba'),
      barrel_pct:        get('brl_percent') ?? get('barrel_batted_rate'),
      hard_hit_pct:      get('hard_hit_percent') ?? get('hardhit_percent'),
      sweet_spot_pct:    get('sweet_spot_percent'),
      avg_exit_velocity: get('exit_velocity_avg') ?? get('avg_hit_speed'),
      max_exit_velocity: get('max_hit_speed'),
      sprint_speed:      get('sprint_speed'),
      k_pct:             get('k_percent'),
      bb_pct:            get('bb_percent'),
    }
  } catch (err) {
    console.error('[Statcast] Fetch failed:', err)
    return null
  }
}