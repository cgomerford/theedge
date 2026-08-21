// src/lib/mlb-leaders.ts
//
// SEASON leaders — /stats/leaders. Live.
//
// WINDOW leaders:
//   - since_all_star / since_trade_deadline (any group) — /stats?byDateRange.
//   - last_15/30/45, BATTING — also byDateRange, calendar-day proxy.
//   - last_15/30/45, PITCHING, role=starter (default) — last N actual STARTS,
//     via game logs.
//   - last_15/30/45, PITCHING, role=reliever (or category === 'saves',
//     forced) — last N actual APPEARANCES (gamesStarted === 0), with a
//     minimum-innings floor scaled to N (9 IP @ 15 apps, 18 @ 30, 27 @ 45)
//     so mop-up arms with lots of one-out appearances don't qualify.
//   Innings floor only enforced for rate stats (ERA/WHIP/K9) — Saves/Wins/K
//     just need N real appearances, no extra IP requirement.
//   TEMP DIAGNOSTICS (console.warn) in both pitching paths — strip once confirmed.
//
// BUCKET leaders — still needs the Statcast event pipeline. Stubbed.
//
// Reliever pool source confirmed via curl: leaderCategories=gamesPitched
// (API internally labels it leaderCategory:'gamesPlayed', but the query
// param 'gamesPitched' is what actually works).
export { getBucketLeaders } from './mlb-buckets'
export type { BucketResult, BucketRow } from './mlb-buckets'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const SEASON = new Date().getFullYear()

const ALL_STAR_GAME_DATE = '2026-07-14'
const TRADE_DEADLINE_DATE = '2026-08-03'
const STARTER_POOL_SIZE = 150
const RELIEVER_POOL_SIZE = 150
const RELIEVER_POOL_LEADER_CATEGORY = 'gamesPitched' // confirmed via curl

// ─── Types ────────────────────────────────────────────────────────────────

export type LeaderRow = {
  rank: number
  name: string
  teamAbbr: string
  headshot: string
  statValue: string
  personId: number
}

export type LeaderCategory = {
  slug: string
  sortStat: string
  order: 'asc' | 'desc'
  label: string
  fullLabel: string
  group: 'batting' | 'pitching'
  format?: 'avg' | 'era' | 'int'
}

export type LeaderWindow =
  | 'season' | 'since_all_star' | 'since_trade_deadline'
  | 'last_15' | 'last_30' | 'last_45'

export type PitcherRole = 'starter' | 'reliever'

export type WindowResult =
  | { available: true; rows: LeaderRow[] }
  | { available: false; reason: string }

export type BucketDefinition = {
  slug: string
  label: string
  unit: string
  thresholds: number[]
}


type PitcherAgg = {
  personId: number
  name: string
  teamAbbr: string
  games: number
  outs: number
  earnedRuns: number
  walks: number
  hits: number
  strikeOuts: number
  wins: number
  saves: number
}

// ─── Windows ────────────────────────────────────────────────────────────

export const LEADER_WINDOWS: { key: LeaderWindow; label: string; available: boolean }[] = [
  { key: 'season',               label: 'Full season',          available: true },
  { key: 'since_all_star',       label: 'Since All-Star break',  available: true },
  { key: 'since_trade_deadline', label: 'Since trade deadline',  available: true },
  { key: 'last_15',              label: 'Last 15 games',         available: true },
  { key: 'last_30',              label: 'Last 30 games',         available: true },
  { key: 'last_45',              label: 'Last 45 games',         available: true },
]

// ─── Stat categories ──────────────────────────────────────────────────────

export const LEADER_CATEGORIES: LeaderCategory[] = [
  { slug: 'onBasePlusSlugging',           sortStat: 'ops',               order: 'desc', label: 'OPS',  fullLabel: 'On-base + Slugging', group: 'batting',  format: 'avg' },
  { slug: 'battingAverage',               sortStat: 'avg',               order: 'desc', label: 'AVG',  fullLabel: 'Batting Average',    group: 'batting',  format: 'avg' },
  { slug: 'sluggingPercentage',           sortStat: 'slg',               order: 'desc', label: 'SLG',  fullLabel: 'Slugging %',         group: 'batting',  format: 'avg' },
  { slug: 'onBasePercentage',             sortStat: 'obp',               order: 'desc', label: 'OBP',  fullLabel: 'On-base %',          group: 'batting',  format: 'avg' },
  { slug: 'homeRuns',                     sortStat: 'homeRuns',          order: 'desc', label: 'HR',   fullLabel: 'Home Runs',          group: 'batting',  format: 'int' },
  { slug: 'rbi',                          sortStat: 'rbi',               order: 'desc', label: 'RBI',  fullLabel: 'Runs Batted In',     group: 'batting',  format: 'int' },
  { slug: 'hits',                         sortStat: 'hits',              order: 'desc', label: 'H',    fullLabel: 'Hits',               group: 'batting',  format: 'int' },
  { slug: 'runs',                         sortStat: 'runs',              order: 'desc', label: 'R',    fullLabel: 'Runs',               group: 'batting',  format: 'int' },
  { slug: 'stolenBases',                  sortStat: 'stolenBases',       order: 'desc', label: 'SB',   fullLabel: 'Stolen Bases',       group: 'batting',  format: 'int' },
  { slug: 'earnedRunAverage',             sortStat: 'era',               order: 'asc',  label: 'ERA',  fullLabel: 'Earned Run Average', group: 'pitching', format: 'era' },
  { slug: 'walksAndHitsPerInningPitched', sortStat: 'whip',              order: 'asc',  label: 'WHIP', fullLabel: 'Walks + Hits / IP',  group: 'pitching', format: 'avg' },
  { slug: 'strikeOuts',                   sortStat: 'strikeOuts',        order: 'desc', label: 'K',    fullLabel: 'Strikeouts',         group: 'pitching', format: 'int' },
  { slug: 'wins',                         sortStat: 'wins',              order: 'desc', label: 'W',    fullLabel: 'Wins',               group: 'pitching', format: 'int' },
  { slug: 'saves',                        sortStat: 'saves',             order: 'desc', label: 'SV',   fullLabel: 'Saves',              group: 'pitching', format: 'int' },
  { slug: 'strikeoutsPer9Inn',            sortStat: 'strikeoutsPer9Inn', order: 'desc', label: 'K/9',  fullLabel: 'Strikeouts / 9',     group: 'pitching', format: 'avg' },
]

export const BUCKET_DEFINITIONS: BucketDefinition[] = [
  { slug: 'era_by_velo',  label: 'Best ERA on high-velo pitches', unit: 'mph',    thresholds: [95, 97, 99, 101] },
  { slug: 'ev_hit_count', label: 'Hardest-hit balls (count)',      unit: 'mph EV', thresholds: [100, 105, 110, 115] },
  { slug: 'hr_distance',  label: 'Home runs by distance',          unit: 'ft',     thresholds: [400, 420, 440, 460, 480] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatValue(raw: string | number, format?: LeaderCategory['format']): string {
  const n = Number(raw)
  if (Number.isNaN(n)) return String(raw)
  if (format === 'era') return n.toFixed(2)
  if (format === 'avg') return n.toFixed(3).replace(/^0\./, '.')
  if (format === 'int') return String(Math.round(n))
  return String(raw)
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function ipToOuts(ip: string | undefined): number {
  if (!ip) return 0
  const [whole, frac] = ip.split('.').map(Number)
  return (whole || 0) * 3 + (frac || 0)
}

function resolveWindowDates(window: LeaderWindow): { startDate: string; endDate: string } | null {
  const today = new Date()
  const endDate = isoDate(today)
  if (window === 'since_all_star') return { startDate: ALL_STAR_GAME_DATE, endDate }
  if (window === 'since_trade_deadline') return { startDate: TRADE_DEADLINE_DATE, endDate }
  const daysBack = window === 'last_15' ? 15 : window === 'last_30' ? 30 : window === 'last_45' ? 45 : null
  if (daysBack === null) return null
  const start = new Date(today)
  start.setDate(start.getDate() - daysBack)
  return { startDate: isoDate(start), endDate }
}

function qualifyThresholds(startDate: string, endDate: string): { minPA: number; minIP: number } {
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000))
  return { minPA: Math.round(days * 2.3), minIP: Math.round(days * 0.42) }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function computeStatValue(cat: LeaderCategory, a: { outs: number; earnedRuns: number; walks: number; hits: number; strikeOuts: number; wins: number; saves: number }): number {
  const innings = a.outs / 3
  if (cat.sortStat === 'era') return innings > 0 ? (a.earnedRuns / innings) * 9 : Infinity
  if (cat.sortStat === 'whip') return innings > 0 ? (a.walks + a.hits) / innings : Infinity
  if (cat.sortStat === 'strikeoutsPer9Inn') return innings > 0 ? (a.strikeOuts / innings) * 9 : 0
  if (cat.sortStat === 'strikeOuts') return a.strikeOuts
  if (cat.sortStat === 'wins') return a.wins
  if (cat.sortStat === 'saves') return a.saves
  return 0
}

// ─── Season leaders (live) ──────────────────────────────────────────────

export async function getSeasonLeaders(categorySlug: string, limit = 15): Promise<LeaderRow[]> {
  const cat = LEADER_CATEGORIES.find(c => c.slug === categorySlug)
  const statGroup = cat?.group === 'batting' ? 'hitting' : 'pitching'
  const url = `${MLB_API}/stats/leaders?leaderCategories=${categorySlug}&season=${SEASON}&limit=${limit}&sportId=1&statGroup=${statGroup}`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) { console.error(`MLB leaders ${categorySlug}: HTTP ${res.status}`); return [] }
    const data = await res.json()
    const leaders = data.leagueLeaders?.[0]?.leaders ?? []
    return leaders.map((l: any, i: number) => {
      const personId = l.person?.id ?? 0
      return {
        rank: l.rank ?? i + 1,
        name: l.person?.fullName ?? '—',
        teamAbbr: l.team?.abbreviation ?? l.team?.name?.split(' ').slice(-1)[0] ?? '—',
        personId,
        headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`,
        statValue: formatValue(l.value, cat?.format),
      }
    })
  } catch (e) {
    console.error(`MLB leaders ${categorySlug} error:`, e)
    return []
  }
}

// ─── Pitching starts-based windows (last 15/30/45 STARTS) — WITH DIAGNOSTICS ──

async function getPitcherStartsLeaders(cat: LeaderCategory, numStarts: number, limit: number): Promise<WindowResult> {
  try {
    const poolUrl = `${MLB_API}/stats/leaders?leaderCategories=gamesStarted&season=${SEASON}&limit=${STARTER_POOL_SIZE}&sportId=1&statGroup=pitching`
    const poolRes = await fetch(poolUrl, { next: { revalidate: 3600 } })
    if (!poolRes.ok) return { available: false, reason: `MLB API returned HTTP ${poolRes.status} building the starter pool.` }
    const poolData = await poolRes.json()
    const pool: { personId: number; name: string; teamAbbr: string }[] = (poolData.leagueLeaders?.[0]?.leaders ?? []).map((l: any) => ({
      personId: l.person?.id ?? 0,
      name: l.person?.fullName ?? '—',
      teamAbbr: l.team?.abbreviation ?? l.team?.name?.split(' ').slice(-1)[0] ?? '—',
    }))

    let dHttpFail = 0, dNotEnough = 0, dException = 0, dOk = 0
    let loggedShape = false

    const aggregates = await mapWithConcurrency(pool, 15, async (p): Promise<PitcherAgg | null> => {
      try {
        const logUrl = `${MLB_API}/people/${p.personId}/stats?stats=gameLog&group=pitching&season=${SEASON}`
        const res = await fetch(logUrl, { next: { revalidate: 3600 } })
        if (!res.ok) { dHttpFail++; return null }
        const data = await res.json()
        const splits: any[] = data.stats?.[0]?.splits ?? []

        if (!loggedShape && splits.length > 0) {
          loggedShape = true
          console.warn('[DIAG:starts] first split keys:', Object.keys(splits[0]))
          console.warn('[DIAG:starts] date-like fields:', {
            date: splits[0].date, gameDate: splits[0].gameDate,
            game: splits[0].game, officialDate: splits[0].officialDate,
          })
        }

        const starts = splits
          .filter(s => Number(s.stat?.gamesStarted ?? 0) === 1)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, numStarts)

        if (starts.length < numStarts) { dNotEnough++; return null }

        const agg: PitcherAgg = {
          personId: p.personId, name: p.name, teamAbbr: p.teamAbbr,
          games: starts.length, outs: 0, earnedRuns: 0, walks: 0, hits: 0, strikeOuts: 0, wins: 0, saves: 0,
        }
        for (const s of starts) {
          const st = s.stat ?? {}
          agg.outs += ipToOuts(st.inningsPitched)
          agg.earnedRuns += Number(st.earnedRuns ?? 0)
          agg.walks += Number(st.baseOnBalls ?? 0)
          agg.hits += Number(st.hits ?? 0)
          agg.strikeOuts += Number(st.strikeOuts ?? 0)
          agg.wins += Number(st.wins ?? 0)
          agg.saves += Number(st.saves ?? 0)
        }
        dOk++
        return agg
      } catch (e) {
        dException++
        console.warn('[DIAG:starts] per-pitcher exception:', p.personId, e)
        return null
      }
    })

    console.warn(`[DIAG:starts] pool=${pool.length} ok=${dOk} httpFail=${dHttpFail} notEnough=${dNotEnough} exception=${dException}`)

    const qualified = aggregates.filter((a): a is PitcherAgg => a !== null)
    const ranked = qualified
      .map(a => ({ ...a, value: computeStatValue(cat, a) }))
      .sort((x, y) => cat.order === 'asc' ? x.value - y.value : y.value - x.value)
      .slice(0, limit)

    const rows: LeaderRow[] = ranked.map((a, i) => ({
      rank: i + 1,
      name: a.name,
      teamAbbr: a.teamAbbr,
      personId: a.personId,
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${a.personId}/headshot/67/current`,
      statValue: formatValue(a.value, cat.format),
    }))

    return { available: true, rows }
  } catch (e) {
    console.error(`Pitcher starts leaders error (${cat.slug}, last ${numStarts} starts):`, e)
    return { available: false, reason: 'MLB API request failed building the starts-based leaderboard.' }
  }
}

// ─── Reliever appearance-based windows (last 15/30/45 APPEARANCES) ──

async function getRelieverAppearanceLeaders(cat: LeaderCategory, numAppearances: number, minIP: number, limit: number): Promise<WindowResult> {
  try {
    const poolUrl = `${MLB_API}/stats/leaders?leaderCategories=${RELIEVER_POOL_LEADER_CATEGORY}&season=${SEASON}&limit=${RELIEVER_POOL_SIZE}&sportId=1&statGroup=pitching`
    const poolRes = await fetch(poolUrl, { next: { revalidate: 3600 } })
    if (!poolRes.ok) return { available: false, reason: `MLB API returned HTTP ${poolRes.status} building the reliever pool.` }
    const poolData = await poolRes.json()
    const pool: { personId: number; name: string; teamAbbr: string }[] = (poolData.leagueLeaders?.[0]?.leaders ?? []).map((l: any) => ({
      personId: l.person?.id ?? 0,
      name: l.person?.fullName ?? '—',
      teamAbbr: l.team?.abbreviation ?? l.team?.name?.split(' ').slice(-1)[0] ?? '—',
    }))

    let dHttpFail = 0, dNotEnoughApps = 0, dNotEnoughIP = 0, dException = 0, dOk = 0

    const aggregates = await mapWithConcurrency(pool, 15, async (p): Promise<PitcherAgg | null> => {
      try {
        const logUrl = `${MLB_API}/people/${p.personId}/stats?stats=gameLog&group=pitching&season=${SEASON}`
        const res = await fetch(logUrl, { next: { revalidate: 3600 } })
        if (!res.ok) { dHttpFail++; return null }
        const data = await res.json()
        const splits: any[] = data.stats?.[0]?.splits ?? []

        const appearances = splits
          .filter(s => Number(s.stat?.gamesStarted ?? 0) === 0 && Number(s.stat?.gamesPlayed ?? 0) === 1)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, numAppearances)

        if (appearances.length < numAppearances) { dNotEnoughApps++; return null }

        const agg: PitcherAgg = {
          personId: p.personId, name: p.name, teamAbbr: p.teamAbbr,
          games: appearances.length, outs: 0, earnedRuns: 0, walks: 0, hits: 0, strikeOuts: 0, wins: 0, saves: 0,
        }
        for (const s of appearances) {
          const st = s.stat ?? {}
          agg.outs += ipToOuts(st.inningsPitched)
          agg.earnedRuns += Number(st.earnedRuns ?? 0)
          agg.walks += Number(st.baseOnBalls ?? 0)
          agg.hits += Number(st.hits ?? 0)
          agg.strikeOuts += Number(st.strikeOuts ?? 0)
          agg.wins += Number(st.wins ?? 0)
          agg.saves += Number(st.saves ?? 0)
        }

        // Innings floor only protects RATE stats (ERA/WHIP/K9) from small-sample
        // flukes. Saves/Wins/K are counting stats — no innings requirement.
        const isRateStatCategory = cat.sortStat === 'era' || cat.sortStat === 'whip' || cat.sortStat === 'strikeoutsPer9Inn'
        if (isRateStatCategory && agg.outs / 3 < minIP) { dNotEnoughIP++; return null }

        dOk++
        return agg
      } catch (e) {
        dException++
        console.warn('[DIAG:relief] per-pitcher exception:', p.personId, e)
        return null
      }
    })

    console.warn(`[DIAG:relief] pool=${pool.length} ok=${dOk} httpFail=${dHttpFail} notEnoughApps=${dNotEnoughApps} notEnoughIP=${dNotEnoughIP} exception=${dException}`)

    const qualified = aggregates.filter((a): a is PitcherAgg => a !== null)
    const ranked = qualified
      .map(a => ({ ...a, value: computeStatValue(cat, a) }))
      .sort((x, y) => cat.order === 'asc' ? x.value - y.value : y.value - x.value)
      .slice(0, limit)

    const rows: LeaderRow[] = ranked.map((a, i) => ({
      rank: i + 1,
      name: a.name,
      teamAbbr: a.teamAbbr,
      personId: a.personId,
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${a.personId}/headshot/67/current`,
      statValue: formatValue(a.value, cat.format),
    }))

    return { available: true, rows }
  } catch (e) {
    console.error(`Reliever appearance leaders error (${cat.slug}, last ${numAppearances} appearances, min ${minIP} IP):`, e)
    return { available: false, reason: 'MLB API request failed building the reliever leaderboard.' }
  }
}

// ─── Window leaders (dispatcher) ───────────────────────────────────────────

export async function getWindowLeaders(
  categorySlug: string,
  window: LeaderWindow,
  limit = 15,
  pitcherRole: PitcherRole = 'starter'
): Promise<WindowResult> {
  if (window === 'season') {
    const rows = await getSeasonLeaders(categorySlug, limit)
    return { available: true, rows }
  }

  const cat = LEADER_CATEGORIES.find(c => c.slug === categorySlug)
  if (!cat) return { available: false, reason: 'Unknown category.' }

  if (cat.group === 'pitching' && (window === 'last_15' || window === 'last_30' || window === 'last_45')) {
    const numGames = window === 'last_15' ? 15 : window === 'last_30' ? 30 : 45
    const useReliever = pitcherRole === 'reliever' || cat.slug === 'saves'
    if (useReliever) {
      const minIP = Math.round(numGames * 0.6) // 15→9, 30→18, 45→27
      return getRelieverAppearanceLeaders(cat, numGames, minIP, limit)
    }
    return getPitcherStartsLeaders(cat, numGames, limit)
  }

  const dates = resolveWindowDates(window)
  if (!dates) return { available: false, reason: 'Unknown window.' }

  const { startDate, endDate } = dates
  const { minPA, minIP } = qualifyThresholds(startDate, endDate)
  const statGroup = cat.group === 'batting' ? 'hitting' : 'pitching'

  const url = `${MLB_API}/stats?stats=byDateRange&group=${statGroup}&season=${SEASON}&sportId=1` +
    `&startDate=${startDate}&endDate=${endDate}&sortStat=${cat.sortStat}&order=${cat.order}&limit=100`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) { console.error(`MLB window leaders ${categorySlug}/${window}: HTTP ${res.status}`); return { available: false, reason: `MLB API returned HTTP ${res.status}.` } }
    const data = await res.json()
    const splits: any[] = data.stats?.[0]?.splits ?? []

    const qualified = splits.filter(s => {
      const stat = s.stat ?? {}
      if (cat.group === 'batting') return Number(stat.plateAppearances ?? 0) >= minPA
      return (Number(stat.outsPitched ?? 0) / 3) >= minIP
    })

    const rows: LeaderRow[] = qualified.slice(0, limit).map((s: any, i: number) => {
      const personId = s.player?.id ?? 0
      return {
        rank: i + 1,
        name: s.player?.fullName ?? '—',
        teamAbbr: s.team?.abbreviation ?? s.team?.name?.split(' ').slice(-1)[0] ?? '—',
        personId,
        headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`,
        statValue: formatValue(s.stat?.[cat.sortStat], cat.format),
      }
    })

    return { available: true, rows }
  } catch (e) {
    console.error(`MLB window leaders ${categorySlug}/${window} error:`, e)
    return { available: false, reason: 'MLB API request failed.' }
  }
}

// ─── Bucket leaders (EV / velo / HR distance) ──────────────────────────────

