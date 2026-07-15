// src/lib/player-splits.ts
//
// Wraps MLB Stats API sitCodes endpoint for every split we display on the
// Splits tab. Free tier, no auth. Returns null-safe rows with '—' fallback
// applied downstream. Small-sample rule: any split with < 20 PA (batter)
// or < 20 BF (pitcher) is filtered out here, not displayed as data.

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const MIN_SAMPLE_PA = 20
const MIN_SAMPLE_BF = 20

export interface SplitLine {
  label: string
  sitCode: string
  pa?: number
  ab?: number
  avg?: string
  obp?: string
  slg?: string
  ops?: string
  hr?: number
  so?: number
  bb?: number
  // Pitcher-specific
  bf?: number
  ip?: string
  era?: string
  whip?: string
  k9?: string
  bb9?: string
  baa?: string
}

export interface PlayerSplitsData {
  handedness: SplitLine[]
  homeAway: SplitLine[]
  daynight: SplitLine[]
  monthly: SplitLine[]
  count: SplitLine[]
  situational: SplitLine[]
  leverage: SplitLine[]
}

const HITTING_SITS: Array<{ label: string; sit: string; bucket: keyof PlayerSplitsData }> = [
  { label: 'vs LHP', sit: 'vl', bucket: 'handedness' },
  { label: 'vs RHP', sit: 'vr', bucket: 'handedness' },
  { label: 'Home', sit: 'h', bucket: 'homeAway' },
  { label: 'Away', sit: 'a', bucket: 'homeAway' },
  { label: 'Day', sit: 'd', bucket: 'daynight' },
  { label: 'Night', sit: 'n', bucket: 'daynight' },
  { label: 'RISP', sit: 'risp', bucket: 'situational' },
  { label: 'Bases empty', sit: 'e', bucket: 'situational' },
  { label: 'Bases loaded', sit: 'l', bucket: 'situational' },
  { label: '2-out RISP', sit: '2Orisp', bucket: 'situational' },
  { label: 'Ahead in count', sit: 'ah', bucket: 'count' },
  { label: 'Behind in count', sit: 'be', bucket: 'count' },
  { label: '2-strike', sit: 'ts', bucket: 'count' },
  { label: 'First pitch', sit: 'fp', bucket: 'count' },
  { label: 'High leverage', sit: 'hilev', bucket: 'leverage' },
  { label: 'Medium leverage', sit: 'medlev', bucket: 'leverage' },
  { label: 'Low leverage', sit: 'lolev', bucket: 'leverage' },
]

const PITCHING_SITS: Array<{ label: string; sit: string; bucket: keyof PlayerSplitsData }> = [
  { label: 'vs LHB', sit: 'vl', bucket: 'handedness' },
  { label: 'vs RHB', sit: 'vr', bucket: 'handedness' },
  { label: 'Home', sit: 'h', bucket: 'homeAway' },
  { label: 'Away', sit: 'a', bucket: 'homeAway' },
  { label: 'Day', sit: 'd', bucket: 'daynight' },
  { label: 'Night', sit: 'n', bucket: 'daynight' },
  { label: 'RISP', sit: 'risp', bucket: 'situational' },
  { label: 'Bases empty', sit: 'e', bucket: 'situational' },
  { label: 'High leverage', sit: 'hilev', bucket: 'leverage' },
  { label: 'Medium leverage', sit: 'medlev', bucket: 'leverage' },
  { label: 'Low leverage', sit: 'lolev', bucket: 'leverage' },
]

// ─── Batter fetch ─────────────────────────────────────────────────────────

async function fetchHittingSplit(playerId: number, season: number, sitCode: string): Promise<any | null> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=${sitCode}&gameType=R`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    return json?.stats?.[0]?.splits?.[0]?.stat ?? null
  } catch {
    return null
  }
}

async function fetchPitchingSplit(playerId: number, season: number, sitCode: string): Promise<any | null> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=statSplits&group=pitching&season=${season}&sitCodes=${sitCode}&gameType=R`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    return json?.stats?.[0]?.splits?.[0]?.stat ?? null
  } catch {
    return null
  }
}

async function fetchMonthlyHitting(playerId: number, season: number): Promise<SplitLine[]> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=byMonth&group=hitting&season=${season}&gameType=R`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    const splits = json?.stats?.[0]?.splits ?? []
    const monthNames = ['', 'Jan', 'Feb', 'March/April', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
    return splits
      .map((s: any) => {
       const pa = Number(stat.plateAppearances ?? stat.atBats ?? 0)
if (pa < MIN_SAMPLE_PA) return null
        return {
          label: monthNames[s.month] ?? `Month ${s.month}`,
          sitCode: `m${s.month}`,
          pa,
          ab: Number(s.stat?.atBats ?? 0),
          avg: s.stat?.avg ?? '—',
          obp: s.stat?.obp ?? '—',
          slg: s.stat?.slg ?? '—',
          ops: s.stat?.ops ?? '—',
          hr: Number(s.stat?.homeRuns ?? 0),
          so: Number(s.stat?.strikeOuts ?? 0),
          bb: Number(s.stat?.baseOnBalls ?? 0),
        } as SplitLine
      })
      .filter(Boolean) as SplitLine[]
  } catch {
    return []
  }
}

async function fetchMonthlyPitching(playerId: number, season: number): Promise<SplitLine[]> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=byMonth&group=pitching&season=${season}&gameType=R`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    const splits = json?.stats?.[0]?.splits ?? []
    const monthNames = ['', 'Jan', 'Feb', 'March/April', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
    return splits
      .map((s: any) => {
        const bf = Number(s.stat?.battersFaced ?? 0)
        if (bf < MIN_SAMPLE_BF) return null
        return {
          label: monthNames[s.month] ?? `Month ${s.month}`,
          sitCode: `m${s.month}`,
          bf,
          ip: s.stat?.inningsPitched ?? '—',
          era: s.stat?.era ?? '—',
          whip: s.stat?.whip ?? '—',
          k9: s.stat?.strikeoutsPer9Inn ?? '—',
          bb9: s.stat?.walksPer9Inn ?? '—',
          baa: s.stat?.avg ?? '—',
        } as SplitLine
      })
      .filter(Boolean) as SplitLine[]
  } catch {
    return []
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function getPlayerSplits(
  playerId: number,
  isPitcher: boolean,
  season = new Date().getFullYear(),
): Promise<PlayerSplitsData> {
  const empty: PlayerSplitsData = {
    handedness: [], homeAway: [], daynight: [], monthly: [], count: [], situational: [], leverage: [],
  }

  const configs = isPitcher ? PITCHING_SITS : HITTING_SITS
  const fetches = configs.map(async cfg => {
    const stat = isPitcher
      ? await fetchPitchingSplit(playerId, season, cfg.sit)
      : await fetchHittingSplit(playerId, season, cfg.sit)
    if (!stat) return null

    if (isPitcher) {
      const bf = Number(stat.battersFaced ?? 0)
      if (bf < MIN_SAMPLE_BF) return null
      return {
        bucket: cfg.bucket,
        row: {
          label: cfg.label,
          sitCode: cfg.sit,
          bf,
          ip: stat.inningsPitched ?? '—',
          era: stat.era ?? '—',
          whip: stat.whip ?? '—',
          k9: stat.strikeoutsPer9Inn ?? '—',
          bb9: stat.walksPer9Inn ?? '—',
          baa: stat.avg ?? '—',
        } as SplitLine,
      }
    } else {
      const pa = Number(stat.plateAppearances ?? 0)
      if (pa < MIN_SAMPLE_PA) return null
      return {
        bucket: cfg.bucket,
        row: {
          label: cfg.label,
          sitCode: cfg.sit,
          pa,
          ab: Number(stat.atBats ?? 0),
          avg: stat.avg ?? '—',
          obp: stat.obp ?? '—',
          slg: stat.slg ?? '—',
          ops: stat.ops ?? '—',
          hr: Number(stat.homeRuns ?? 0),
          so: Number(stat.strikeOuts ?? 0),
          bb: Number(stat.baseOnBalls ?? 0),
        } as SplitLine,
      }
    }
  })

  const [splitResults, monthly] = await Promise.all([
    Promise.all(fetches),
    isPitcher ? fetchMonthlyPitching(playerId, season) : fetchMonthlyHitting(playerId, season),
  ])

  for (const r of splitResults) {
    if (!r) continue
    empty[r.bucket].push(r.row)
  }
  empty.monthly = monthly

  return empty
}