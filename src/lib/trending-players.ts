// src/lib/trending-players.ts
//
// "Trending Players" — top N hottest batters, starting pitchers, and
// relief pitchers per level (MLB / AAA / AA), computed live from true
// game-played windows (not calendar-day averages).
//
// Batters: true last 14 games played, within a 21-day cutoff.
// Starters: true last 4 starts, within a 28-day cutoff (starters pitch
//   every ~5 days, so 14-in-21 or even 4-in-21 isn't reliably findable —
//   28 days is what it takes to comfortably surface 4 starts even
//   through a single skipped turn).
// Relievers: true last 10 appearances, within a 21-day cutoff (looser
//   than batters' 10/14 bar deliberately — a busy reliever might only
//   get 7-8 outings in 3 weeks even fully healthy; this threshold is a
//   judgment call, not something explicitly specified, and worth
//   tightening if it lets through arms that don't feel "trending" in
//   practice).
//
// ARCHITECTURE: batters, starters, and relievers for a given level all
// derive from ONE shared 28-day fetch (schedule + boxscores), not three
// separate fetches over overlapping windows — batters/relievers just
// filter that same fetched data down to their own tighter 21-day cutoff
// before aggregating. This roughly triples the value of every boxscore
// fetch instead of tripling the fetch cost.
//
// COST NOTE: boxscores for Final games are immutable, cached 24h via
// Next's fetch data cache — only the FIRST computation after a cold
// cache pays the full fetch cost. Fetches are batched with limited
// concurrency to avoid hammering statsapi.mlb.com.

import { playerHeadshotUrl, teamLogoUrlPng } from '@/lib/mlb'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type Level = 'mlb' | 'aaa' | 'aa'
export type PitcherRole = 'starter' | 'reliever'

export const LEVEL_SPORT_ID: Record<Level, number> = { mlb: 1, aaa: 11, aa: 12 }
export const LEVEL_LABEL: Record<Level, string> = { mlb: 'MLB', aaa: 'AAA', aa: 'AA' }

const SHARED_WINDOW_DAYS = 28
const BATTER_WINDOW_DAYS = 21
const RELIEVER_WINDOW_DAYS = 21
// Starters use the full SHARED_WINDOW_DAYS directly — no further cutoff.

const GAMES_REQUIRED = 14
const MIN_GAMES_ELIGIBLE = 10

const STARTS_REQUIRED = 4
const MIN_STARTS_ELIGIBLE = 3

const APPEARANCES_REQUIRED = 10
const MIN_APPEARANCES_ELIGIBLE = 6

type GameStatLine = {
  date: string
  ab: number; h: number; tb: number; hr: number
  rbi: number; r: number; bb: number; hbp: number; sf: number
}

type PitcherGameLine = {
  date: string
  outs: number; er: number; h: number; bb: number; k: number
  isStart: boolean
}

export type TrendingBatter = {
  personId: number
  name: string
  teamAbbr: string
  teamName: string
  teamId: number | null
  level: Level
  gamesCounted: number
  ab: number
  h: number
  hr: number
  avg: number
  obp: number
  slg: number
  ops: number
  rbi: number
  r: number
  bb: number
  compositeScore: number
  tweetText: string
  headshot: string
  teamLogo: string | null
}

export type TrendingPitcher = {
  personId: number
  name: string
  teamAbbr: string
  teamName: string
  teamId: number | null
  level: Level
  role: PitcherRole
  gamesCounted: number
  ip: string          // display notation, e.g. "24.1" — thirds, NOT decimal
  ipDecimal: number   // true decimal innings (outs/3), calc/z-score only
  era: number
  whip: number
  k: number
  bb: number
  compositeScore: number
  tweetText: string
  headshot: string
  teamLogo: string | null
}

export type LevelTrendingResult = {
  batters: TrendingBatter[]
  startingPitchers: TrendingPitcher[]
  reliefPitchers: TrendingPitcher[]
}

function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

type GameDescriptor = {
  gamePk: number; date: string
  awayAbbr: string; homeAbbr: string; awayName: string; homeName: string
  awayTeamId: number | null; homeTeamId: number | null
}

async function getGamePksForWindow(sportId: number, lookbackDays: number): Promise<GameDescriptor[]> {
  const start = dateNDaysAgo(lookbackDays)
  const end = dateNDaysAgo(0)
  const url = `${MLB_API}/schedule?sportId=${sportId}&startDate=${start}&endDate=${end}&gameType=R`
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) {
      console.error(`[trending] schedule fetch failed for sportId ${sportId}: ${res.status}`)
      return []
    }
    const data = await res.json()
    const out: GameDescriptor[] = []
    for (const d of data.dates ?? []) {
      for (const g of d.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        out.push({
          gamePk: g.gamePk,
          date: d.date,
          awayAbbr: g.teams?.away?.team?.abbreviation ?? '—',
          homeAbbr: g.teams?.home?.team?.abbreviation ?? '—',
          awayName: g.teams?.away?.team?.name ?? '—',
          homeName: g.teams?.home?.team?.name ?? '—',
          awayTeamId: g.teams?.away?.team?.id ?? null,
          homeTeamId: g.teams?.home?.team?.id ?? null,
        })
      }
    }
    console.log(`[trending] sportId ${sportId}: ${out.length} final games in window ${start}..${end}`)
    return out
  } catch (e) {
    console.error(`[trending] schedule fetch threw for sportId ${sportId}:`, e)
    return []
  }
}

async function getBoxscore(gamePk: number): Promise<any | null> {
  const url = `${MLB_API}/game/${gamePk}/boxscore`
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.error(`[trending] boxscore(${gamePk}) threw:`, e)
    return null
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fetchLevelWindow(sportId: number, days: number): Promise<{ games: GameDescriptor[]; boxByGamePk: Map<number, any> }> {
  const games = await getGamePksForWindow(sportId, days)
  if (games.length === 0) return { games: [], boxByGamePk: new Map() }
  const results = await mapWithConcurrency(games, 12, async (g) => ({ g, box: await getBoxscore(g.gamePk) }))
  const missing = results.filter((r) => !r.box).length
  if (missing > 0) console.warn(`[trending] ${missing}/${games.length} boxscore fetches failed for a ${days}-day window (sportId ${sportId})`)
  const boxByGamePk = new Map<number, any>()
  for (const { g, box } of results) if (box) boxByGamePk.set(g.gamePk, box)
  return { games, boxByGamePk }
}

function zScoreFn(values: number[]): (v: number) => number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const sd = Math.sqrt(variance) || 1
  return (v: number) => (v - mean) / sd
}

function buildBatterTweetText(b: { name: string; teamAbbr: string; avg: number; ops: number; hr: number; rbi: number; r: number; gamesCounted: number }, level: Level): string {
  const avgStr = b.avg.toFixed(3).replace(/^0/, '')
  const opsStr = b.ops.toFixed(3).replace(/^0/, '')
  const hrPart = b.hr > 0 ? `${b.hr} HR, ` : ''
  const levelTag = level === 'mlb' ? '#MLB' : level === 'aaa' ? '#MiLB #TripleA' : '#MiLB #DoubleA'
  return `${b.name} (${b.teamAbbr}) is heating up — ${avgStr} AVG, ${opsStr} OPS, ${hrPart}${b.rbi} RBI, ${b.r} R over his last ${b.gamesCounted}. ${levelTag} ⊕`
}

function buildPitcherTweetText(
  p: { name: string; teamAbbr: string; era: number; whip: number; k: number; ip: string; gamesCounted: number; role: PitcherRole },
  level: Level,
): string {
  const levelTag = level === 'mlb' ? '#MLB' : level === 'aaa' ? '#MiLB #TripleA' : '#MiLB #DoubleA'
  const roleWord = p.role === 'starter' ? `over his last ${p.gamesCounted} starts` : `over his last ${p.gamesCounted} outings`
  return `${p.name} (${p.teamAbbr}) is dealing — ${p.era.toFixed(2)} ERA, ${p.whip.toFixed(2)} WHIP, ${p.k} K in ${p.ip} IP ${roleWord}. ${levelTag} ⊕`
}

// ── Batters ──────────────────────────────────────────────────────────

function aggregateBatters(games: GameDescriptor[], boxByGamePk: Map<number, any>, level: Level, count: number): TrendingBatter[] {
  const cutoff = dateNDaysAgo(BATTER_WINDOW_DAYS)
  const relevantGames = games.filter((g) => g.date >= cutoff)

  const byPlayer = new Map<number, { name: string; teamAbbr: string; teamName: string; teamId: number | null; lines: GameStatLine[] }>()

  for (const g of relevantGames) {
    const box = boxByGamePk.get(g.gamePk)
    if (!box) continue
    for (const side of ['away', 'home'] as const) {
      const players = box.teams?.[side]?.players ?? {}
      const teamAbbr = side === 'away' ? g.awayAbbr : g.homeAbbr
      const teamName = side === 'away' ? g.awayName : g.homeName
      const teamId = side === 'away' ? g.awayTeamId : g.homeTeamId
      for (const p of Object.values(players) as any[]) {
        const bat = p.stats?.batting
        if (!bat || (bat.plateAppearances ?? 0) === 0) continue
        const personId = p.person?.id
        const name = p.person?.fullName
        if (!personId || !name) continue
        if (!byPlayer.has(personId)) byPlayer.set(personId, { name, teamAbbr, teamName, teamId, lines: [] })
        byPlayer.get(personId)!.lines.push({
          date: g.date,
          ab: Number(bat.atBats ?? 0),
          h: Number(bat.hits ?? 0),
          tb: Number(bat.totalBases ?? 0),
          hr: Number(bat.homeRuns ?? 0),
          rbi: Number(bat.rbi ?? 0),
          r: Number(bat.runs ?? 0),
          bb: Number(bat.baseOnBalls ?? 0),
          hbp: Number(bat.hitByPitch ?? 0),
          sf: Number(bat.sacFlies ?? 0),
        })
      }
    }
  }

  type Agg = {
    personId: number; name: string; teamAbbr: string; teamName: string; teamId: number | null
    gamesCounted: number; ab: number; h: number; hr: number; avg: number; obp: number; slg: number; ops: number
    rbi: number; r: number; bb: number
  }
  const aggregates: Agg[] = []

  for (const [personId, info] of byPlayer.entries()) {
    const sorted = [...info.lines].sort((a, b) => b.date.localeCompare(a.date))
    const window = sorted.slice(0, GAMES_REQUIRED)
    if (window.length < MIN_GAMES_ELIGIBLE) continue

    let ab = 0, h = 0, tb = 0, hr = 0, rbi = 0, r = 0, bb = 0, hbp = 0, sf = 0
    for (const l of window) { ab += l.ab; h += l.h; tb += l.tb; hr += l.hr; rbi += l.rbi; r += l.r; bb += l.bb; hbp += l.hbp; sf += l.sf }
    if (ab === 0) continue

    const avg = h / ab
    const obpDenom = ab + bb + hbp + sf
    const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0
    const slg = tb / ab
    const ops = obp + slg

    aggregates.push({
      personId, name: info.name, teamAbbr: info.teamAbbr, teamName: info.teamName, teamId: info.teamId,
      gamesCounted: window.length, ab, h, hr, avg, obp, slg, ops, rbi, r, bb,
    })
  }

  console.log(`[trending] level ${level} batters: ${aggregates.length} players with >= ${MIN_GAMES_ELIGIBLE} games in window`)
  if (aggregates.length === 0) return []

  const zAvg = zScoreFn(aggregates.map((a) => a.avg))
  const zOps = zScoreFn(aggregates.map((a) => a.ops))
  const zObp = zScoreFn(aggregates.map((a) => a.obp))
  const zRbi = zScoreFn(aggregates.map((a) => a.rbi))
  const zR = zScoreFn(aggregates.map((a) => a.r))
  const zBb = zScoreFn(aggregates.map((a) => a.bb))

  const ranked = aggregates
    .map((a) => ({ ...a, compositeScore: zAvg(a.avg) + zOps(a.ops) + zObp(a.obp) + zRbi(a.rbi) + zR(a.r) + zBb(a.bb) }))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, count)

  return ranked.map((a) => ({
    personId: a.personId, name: a.name, teamAbbr: a.teamAbbr, teamName: a.teamName, teamId: a.teamId, level,
    gamesCounted: a.gamesCounted, ab: a.ab, h: a.h, hr: a.hr, avg: a.avg, obp: a.obp, slg: a.slg, ops: a.ops,
    rbi: a.rbi, r: a.r, bb: a.bb, compositeScore: a.compositeScore,
    tweetText: buildBatterTweetText(a, level),
    headshot: playerHeadshotUrl(a.personId, 300),
    teamLogo: a.teamId != null ? teamLogoUrlPng(a.teamId, 200) : null,
  }))
}

// ── Pitchers (shared extraction, role-split aggregation) ────────────

function extractPitcherLines(
  games: GameDescriptor[],
  boxByGamePk: Map<number, any>,
): Map<number, { name: string; teamAbbr: string; teamName: string; teamId: number | null; lines: PitcherGameLine[] }> {
  const byPlayer = new Map<number, { name: string; teamAbbr: string; teamName: string; teamId: number | null; lines: PitcherGameLine[] }>()

  for (const g of games) {
    const box = boxByGamePk.get(g.gamePk)
    if (!box) continue
    for (const side of ['away', 'home'] as const) {
      const players = box.teams?.[side]?.players ?? {}
      const teamAbbr = side === 'away' ? g.awayAbbr : g.homeAbbr
      const teamName = side === 'away' ? g.awayName : g.homeName
      const teamId = side === 'away' ? g.awayTeamId : g.homeTeamId
      for (const p of Object.values(players) as any[]) {
        const pit = p.stats?.pitching
        if (!pit || (pit.outs ?? 0) === 0) continue
        const personId = p.person?.id
        const name = p.person?.fullName
        if (!personId || !name) continue
        if (!byPlayer.has(personId)) byPlayer.set(personId, { name, teamAbbr, teamName, teamId, lines: [] })
        byPlayer.get(personId)!.lines.push({
          date: g.date,
          outs: Number(pit.outs ?? 0),
          er: Number(pit.earnedRuns ?? 0),
          h: Number(pit.hits ?? 0),
          bb: Number(pit.baseOnBalls ?? 0),
          k: Number(pit.strikeOuts ?? 0),
          // gamesStarted is 0/1 PER GAME in a boxscore's single-game
          // pitching stat block — this is the per-appearance start flag,
          // not a season total.
          isStart: (pit.gamesStarted ?? 0) > 0,
        })
      }
    }
  }
  return byPlayer
}

// Innings-pitched notation is thirds, not decimal — "6.1" means 6 and
// 1/3 innings, NOT 6.1 innings. Summing the raw strings would be
// mathematically wrong; outs (a real integer count) is the correct thing
// to sum, converted to display notation only at the end.
function formatIp(outs: number): string {
  const whole = Math.floor(outs / 3)
  const remainder = outs % 3
  return `${whole}.${remainder}`
}

type PitcherAgg = {
  personId: number; name: string; teamAbbr: string; teamName: string; teamId: number | null
  gamesCounted: number; outs: number; ipDecimal: number; ip: string
  era: number; whip: number; k: number; bb: number
}

function aggregatePitcherGroup(
  byPlayer: Map<number, { name: string; teamAbbr: string; teamName: string; teamId: number | null; lines: PitcherGameLine[] }>,
  role: PitcherRole,
  gamesRequired: number,
  minEligible: number,
  level: Level,
  count: number,
): TrendingPitcher[] {
  const aggregates: PitcherAgg[] = []

  for (const [personId, info] of byPlayer.entries()) {
    const roleLines = info.lines.filter((l) => (role === 'starter' ? l.isStart : !l.isStart))
    const sorted = [...roleLines].sort((a, b) => b.date.localeCompare(a.date))
    const window = sorted.slice(0, gamesRequired)
    if (window.length < minEligible) continue

    let outs = 0, er = 0, h = 0, bb = 0, k = 0
    for (const l of window) { outs += l.outs; er += l.er; h += l.h; bb += l.bb; k += l.k }
    if (outs === 0) continue

    const ipDecimal = outs / 3
    const era = (er * 27) / outs
    const whip = (3 * (bb + h)) / outs

    aggregates.push({
      personId, name: info.name, teamAbbr: info.teamAbbr, teamName: info.teamName, teamId: info.teamId,
      gamesCounted: window.length, outs, ipDecimal, ip: formatIp(outs), era, whip, k, bb,
    })
  }

  console.log(`[trending] level ${level} ${role}s: ${aggregates.length} players with >= ${minEligible} ${role === 'starter' ? 'starts' : 'appearances'} in window`)
  if (aggregates.length === 0) return []

  // ERA/WHIP/BB are "lower is better" — the opposite direction from
  // every batter stat and from K/IP here — so their z-scores are
  // negated before summing, keeping "higher composite = hotter" a
  // consistent rule across batters and both pitcher roles.
  const zEra = zScoreFn(aggregates.map((a) => a.era))
  const zWhip = zScoreFn(aggregates.map((a) => a.whip))
  const zK = zScoreFn(aggregates.map((a) => a.k))
  const zBb = zScoreFn(aggregates.map((a) => a.bb))
  const zIp = zScoreFn(aggregates.map((a) => a.ipDecimal))

  const ranked = aggregates
    .map((a) => ({
      ...a,
      compositeScore: -zEra(a.era) + -zWhip(a.whip) + zK(a.k) + -zBb(a.bb) + zIp(a.ipDecimal),
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, count)

  return ranked.map((a) => ({
    personId: a.personId, name: a.name, teamAbbr: a.teamAbbr, teamName: a.teamName, teamId: a.teamId, level, role,
    gamesCounted: a.gamesCounted, ip: a.ip, ipDecimal: a.ipDecimal, era: a.era, whip: a.whip, k: a.k, bb: a.bb,
    compositeScore: a.compositeScore,
    tweetText: buildPitcherTweetText(
      { name: a.name, teamAbbr: a.teamAbbr, era: a.era, whip: a.whip, k: a.k, ip: a.ip, gamesCounted: a.gamesCounted, role },
      level,
    ),
    headshot: playerHeadshotUrl(a.personId, 300),
    teamLogo: a.teamId != null ? teamLogoUrlPng(a.teamId, 200) : null,
  }))
}

// ── Top-level per-level orchestration ────────────────────────────────

export async function getAllTrendingForLevel(level: Level, count = 5): Promise<LevelTrendingResult> {
  const sportId = LEVEL_SPORT_ID[level]
  const { games, boxByGamePk } = await fetchLevelWindow(sportId, SHARED_WINDOW_DAYS)

  if (games.length === 0) {
    console.warn(`[trending] no games found for level ${level} in ${SHARED_WINDOW_DAYS}-day window — returning empty`)
    return { batters: [], startingPitchers: [], reliefPitchers: [] }
  }

  const batters = aggregateBatters(games, boxByGamePk, level, count)

  const pitcherByPlayer = extractPitcherLines(games, boxByGamePk)

  // Starters use the full shared window directly.
  const startingPitchers = aggregatePitcherGroup(pitcherByPlayer, 'starter', STARTS_REQUIRED, MIN_STARTS_ELIGIBLE, level, count)

  // Relievers get re-filtered down to the tighter 21-day window — same
  // underlying extracted lines, different cutoff, no extra fetch.
  const relieverCutoff = dateNDaysAgo(RELIEVER_WINDOW_DAYS)
  const relieverByPlayer = new Map<number, { name: string; teamAbbr: string; teamName: string; teamId: number | null; lines: PitcherGameLine[] }>()
  for (const [id, info] of pitcherByPlayer.entries()) {
    const filteredLines = info.lines.filter((l) => l.date >= relieverCutoff)
    if (filteredLines.length > 0) relieverByPlayer.set(id, { ...info, lines: filteredLines })
  }
  const reliefPitchers = aggregatePitcherGroup(relieverByPlayer, 'reliever', APPEARANCES_REQUIRED, MIN_APPEARANCES_ELIGIBLE, level, count)

  return { batters, startingPitchers, reliefPitchers }
}

export async function getAllLevelsTrending(count = 5): Promise<Record<Level, LevelTrendingResult>> {
  const [mlb, aaa, aa] = await Promise.all([
    getAllTrendingForLevel('mlb', count),
    getAllTrendingForLevel('aaa', count),
    getAllTrendingForLevel('aa', count),
  ])
  return { mlb, aaa, aa }
}