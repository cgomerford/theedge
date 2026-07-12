// src/lib/team-grades.ts
//
// Roster grades: each player's average percentile rank across their core
// stats, against the FULL league pool (not MLB's official qualified-
// leaders list). Uses /stats?playerPool=ALL — still an inferred, unverified
// endpoint shape, flagged as before.
//
// EXTENDED: now also keeps each individual stat's own percentile and raw
// value (statDetails), not just the averaged grade — reuses the exact same
// pool data already fetched for the average, no extra API calls. This
// powers the click-to-expand percentile-ring detail view.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

const MIN_PA = 10
const MIN_IP = 10

export type StatDetail = { key: string; label: string; value: string; percentile: number | null; ring: boolean }

export type PlayerGrade = {
  personId: number
  grade: string | null
  avgPercentile: number | null
  statsCounted: number
  statDetails: StatDetail[]
}

type PoolEntry = { personId: number; stat: any }

async function fetchLeaguePool(group: 'hitting' | 'pitching', season: number): Promise<PoolEntry[]> {
  try {
    const res = await fetch(
      `${MLB_API}/stats?stats=season&group=${group}&season=${season}&sportId=1&limit=2000&playerPool=ALL`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const json = await res.json()
    const splits = json.stats?.[0]?.splits ?? []
    return splits.map((s: any) => ({ personId: s.player?.id, stat: s.stat ?? {} })).filter((e: PoolEntry) => e.personId)
  } catch (e) {
    console.error('team-grades: league pool fetch failed', e)
    return []
  }
}

function percentileOf(value: number, pool: number[], lowerIsBetter: boolean): number {
  if (pool.length < 2) return 50
  const better = pool.filter(v => (lowerIsBetter ? v > value : v < value)).length
  return Math.round((better / (pool.length - 1)) * 100)
}

function gradeFromPercentile(p: number): string {
  if (p >= 95) return 'A+'
  if (p >= 90) return 'A'
  if (p >= 85) return 'A-'
  if (p >= 80) return 'B+'
  if (p >= 75) return 'B'
  if (p >= 70) return 'B-'
  if (p >= 60) return 'C'
  if (p >= 50) return 'D'
  return 'F'
}

// "core" stats (ring: true, count toward the average grade) and "display"
// stats (ring: true but NOT counted in the average, or ring: false =
// plain number, no percentile computed at all) — matches the screenshot's
// mix of ringed and plain stat rows.
const BATTER_STATS: { key: string; label: string; lowerIsBetter: boolean; core: boolean; ring: boolean; format?: (v: any) => string }[] = [
  { key: 'avg', label: 'AVG', lowerIsBetter: false, core: true, ring: true },
  { key: 'obp', label: 'OBP', lowerIsBetter: false, core: true, ring: true },
  { key: 'slg', label: 'SLG', lowerIsBetter: false, core: true, ring: true },
  { key: 'ops', label: 'OPS', lowerIsBetter: false, core: false, ring: true },
  { key: 'homeRuns', label: 'HR', lowerIsBetter: false, core: true, ring: true },
  { key: 'rbi', label: 'RBI', lowerIsBetter: false, core: false, ring: true },
  { key: 'hits', label: 'H', lowerIsBetter: false, core: false, ring: true },
  { key: 'totalBases', label: 'TB', lowerIsBetter: false, core: false, ring: true },
  { key: 'runs', label: 'R', lowerIsBetter: false, core: false, ring: false },
  { key: 'doubles', label: '2B', lowerIsBetter: false, core: false, ring: false },
  { key: 'triples', label: '3B', lowerIsBetter: false, core: false, ring: false },
  { key: 'atBatsPerHomeRun', label: 'AB/HR', lowerIsBetter: true, core: false, ring: false },
  { key: 'babip', label: 'BABIP', lowerIsBetter: false, core: false, ring: false },
]

const PITCHER_STATS: { key: string; label: string; lowerIsBetter: boolean; core: boolean; ring: boolean }[] = [
  { key: 'era', label: 'ERA', lowerIsBetter: true, core: true, ring: true },
  { key: 'whip', label: 'WHIP', lowerIsBetter: true, core: true, ring: true },
  { key: 'strikeoutsPer9Inn', label: 'K/9', lowerIsBetter: false, core: true, ring: true },
  { key: 'strikeOuts', label: 'K', lowerIsBetter: false, core: false, ring: true },
  { key: 'wins', label: 'W', lowerIsBetter: false, core: false, ring: false },
  { key: 'saves', label: 'SV', lowerIsBetter: false, core: false, ring: false },
  { key: 'inningsPitched', label: 'IP', lowerIsBetter: false, core: false, ring: false },
  { key: 'baseOnBalls', label: 'BB', lowerIsBetter: true, core: false, ring: false },
]

export async function getRosterGrades(rosterPersonIds: number[], season: number): Promise<Record<number, PlayerGrade>> {
  const [hittingPool, pitchingPool] = await Promise.all([
    fetchLeaguePool('hitting', season),
    fetchLeaguePool('pitching', season),
  ])

  const hittingQualified = hittingPool.filter(e => Number(e.stat.plateAppearances ?? 0) >= MIN_PA)
  const pitchingQualified = pitchingPool.filter(e => Number(e.stat.inningsPitched ?? 0) >= MIN_IP)

  const hittingValueLists: Record<string, number[]> = {}
  for (const stat of BATTER_STATS) {
    if (stat.ring) hittingValueLists[stat.key] = hittingQualified.map(e => Number(e.stat[stat.key] ?? 0))
  }
  const pitchingValueLists: Record<string, number[]> = {}
  for (const stat of PITCHER_STATS) {
    if (stat.ring) pitchingValueLists[stat.key] = pitchingQualified.map(e => Number(e.stat[stat.key] ?? 0))
  }

  const hittingByPerson = new Map(hittingQualified.map(e => [e.personId, e.stat]))
  const pitchingByPerson = new Map(pitchingQualified.map(e => [e.personId, e.stat]))

  const out: Record<number, PlayerGrade> = {}

  for (const personId of rosterPersonIds) {
    const battingStat = hittingByPerson.get(personId)
    const pitchingStat = pitchingByPerson.get(personId)

    const corePercentiles: number[] = []
    const statDetails: StatDetail[] = []

    if (battingStat) {
      for (const stat of BATTER_STATS) {
        const raw = battingStat[stat.key]
        if (raw === undefined) continue
        let percentile: number | null = null
        if (stat.ring) {
          const v = Number(raw)
          if (!Number.isNaN(v)) {
            percentile = percentileOf(v, hittingValueLists[stat.key], stat.lowerIsBetter)
            if (stat.core) corePercentiles.push(percentile)
          }
        }
        statDetails.push({ key: stat.key, label: stat.label, value: String(raw), percentile, ring: stat.ring })
      }
    }
    if (pitchingStat) {
      for (const stat of PITCHER_STATS) {
        const raw = pitchingStat[stat.key]
        if (raw === undefined) continue
        let percentile: number | null = null
        if (stat.ring) {
          const v = Number(raw)
          if (!Number.isNaN(v)) {
            percentile = percentileOf(v, pitchingValueLists[stat.key], stat.lowerIsBetter)
            if (stat.core) corePercentiles.push(percentile)
          }
        }
        statDetails.push({ key: stat.key, label: stat.label, value: String(raw), percentile, ring: stat.ring })
      }
    }

    if (corePercentiles.length === 0) {
      out[personId] = { personId, grade: null, avgPercentile: null, statsCounted: 0, statDetails }
      continue
    }

    const avg = Math.round(corePercentiles.reduce((s, v) => s + v, 0) / corePercentiles.length)
    out[personId] = { personId, grade: gradeFromPercentile(avg), avgPercentile: avg, statsCounted: corePercentiles.length, statDetails }
  }

  return out
}