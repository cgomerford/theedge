/**
 * src/lib/fantasy-yesterday.ts
 *
 * "What actually happened last night" — K's, hits, XBH from MLB Stats API's
 * byDateRange leaders, and max exit velocity from a direct Savant
 * statcast_search CSV pull for the same date.
 *
 * ⚠ UNAUDITED — built to the documented shape of both endpoints but not yet
 * verified against live data. Before this goes live, spot-check 3-4 known
 * results against MLB.com box scores the same way the pitching tab was
 * audited (see build notes, 2026-07-14). Don't trust the numbers blind.
 */

const MLB_STATS_BASE = 'https://statsapi.mlb.com/api/v1'
const SAVANT_SEARCH_CSV = 'https://baseballsavant.mlb.com/statcast_search/csv'

// ─── Types ────────────────────────────────────────────────────────────────────

export type HittingLeader = {
  playerId: number
  name: string
  team: string
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  xbh: number
  atBats: number
}

export type PitchingLeader = {
  playerId: number
  name: string
  team: string
  strikeOuts: number
  inningsPitched: string
}

export type ExitVeloLeader = {
  playerId: number | null
  name: string
  maxExitVelo: number
  avgExitVelo: number
  battedBallCount: number
}

export type YesterdaysSignals = {
  date: string
  hittingLeaders: HittingLeader[]   // sorted by XBH desc
  hitsLeaders: HittingLeader[]      // sorted by hits desc
  strikeoutLeaders: PitchingLeader[]
  exitVeloLeaders: ExitVeloLeader[]
}

// ─── Date helper ─────────────────────────────────────────────────────────────

export function getYesterdayDateStr(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

// ─── MLB Stats API — hitting/pitching byDateRange leaders ──────────────────

async function fetchHittingLeaders(date: string): Promise<HittingLeader[]> {
  const url = `${MLB_STATS_BASE}/stats?stats=byDateRange&startDate=${date}&endDate=${date}&group=hitting&sportId=1&limit=500`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`MLB hitting leaders fetch failed: ${res.status}`)
  const data = await res.json()

  const splits = data?.stats?.[0]?.splits ?? []
  return splits
    .map((s: any) => {
      const stat = s.stat ?? {}
      const doubles = Number(stat.doubles ?? 0)
      const triples = Number(stat.triples ?? 0)
      const homeRuns = Number(stat.homeRuns ?? 0)
      return {
        playerId: s.player?.id,
        name: s.player?.fullName ?? 'Unknown',
        team: s.team?.abbreviation ?? '',
        hits: Number(stat.hits ?? 0),
        doubles,
        triples,
        homeRuns,
        xbh: doubles + triples + homeRuns,
        atBats: Number(stat.atBats ?? 0),
      } as HittingLeader
    })
    .filter((r: HittingLeader) => r.atBats > 0)
}

async function fetchPitchingLeaders(date: string): Promise<PitchingLeader[]> {
  const url = `${MLB_STATS_BASE}/stats?stats=byDateRange&startDate=${date}&endDate=${date}&group=pitching&sportId=1&limit=500`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`MLB pitching leaders fetch failed: ${res.status}`)
  const data = await res.json()

  const splits = data?.stats?.[0]?.splits ?? []
  return splits
    .map((s: any) => ({
      playerId: s.player?.id,
      name: s.player?.fullName ?? 'Unknown',
      team: s.team?.abbreviation ?? '',
      strikeOuts: Number(s.stat?.strikeOuts ?? 0),
      inningsPitched: s.stat?.inningsPitched ?? '0.0',
    } as PitchingLeader))
    .filter((r: PitchingLeader) => r.strikeOuts > 0)
}

// ─── Savant — exit velocity, direct CSV pull for one date ──────────────────
//
// Quote-aware CSV parser — naive split(',') misaligns columns whenever a
// field contains a comma (confirmed gotcha, see series-pitches.ts precedent).

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2) return []

  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
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

async function fetchExitVeloLeaders(date: string, minBattedBalls = 1): Promise<ExitVeloLeader[]> {
  const params = new URLSearchParams({
    all: 'true',
    hfGT: 'R|',
    game_date_gt: date,
    game_date_lt: date,
    type: 'details',
  })
  const res = await fetch(`${SAVANT_SEARCH_CSV}?${params.toString()}`, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Savant exit velo fetch failed: ${res.status}`)
  const csv = await res.text()
  const rows = parseCsv(csv)

  const byBatter = new Map<string, { name: string; playerId: number | null; velos: number[] }>()
  for (const row of rows) {
    const ev = parseFloat(row['launch_speed'])
    if (!row['launch_speed'] || Number.isNaN(ev)) continue
    const name = row['player_name'] ?? 'Unknown'
    const key = row['batter'] || name
    if (!byBatter.has(key)) {
      byBatter.set(key, {
        name,
        playerId: row['batter'] ? Number(row['batter']) : null,
        velos: [],
      })
    }
    byBatter.get(key)!.velos.push(ev)
  }

  return Array.from(byBatter.values())
    .filter(b => b.velos.length >= minBattedBalls)
    .map(b => ({
      playerId: b.playerId,
      name: b.name,
      maxExitVelo: Math.max(...b.velos),
      avgExitVelo: b.velos.reduce((a, v) => a + v, 0) / b.velos.length,
      battedBallCount: b.velos.length,
    }))
    .sort((a, b) => b.maxExitVelo - a.maxExitVelo)
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function getYesterdaysSignals(): Promise<YesterdaysSignals> {
  const date = getYesterdayDateStr()

  const [hitting, pitching, exitVelo] = await Promise.all([
    fetchHittingLeaders(date).catch(err => { console.error('[fantasy-yesterday] hitting:', err); return [] }),
    fetchPitchingLeaders(date).catch(err => { console.error('[fantasy-yesterday] pitching:', err); return [] }),
    fetchExitVeloLeaders(date).catch(err => { console.error('[fantasy-yesterday] exit velo:', err); return [] }),
  ])

  return {
    date,
    hittingLeaders: [...hitting].sort((a, b) => b.xbh - a.xbh).slice(0, 15),
    hitsLeaders: [...hitting].sort((a, b) => b.hits - a.hits).slice(0, 15),
    strikeoutLeaders: [...pitching].sort((a, b) => b.strikeOuts - a.strikeOuts).slice(0, 15),
    exitVeloLeaders: exitVelo.slice(0, 15),
  }
}
