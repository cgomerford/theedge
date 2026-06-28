// src/lib/pregame-stats.ts
//
// Pulls rolling form straight from the MLB Stats API (free, no auth) —
// no new Supabase table, no dependency on edge_predictions. Every external
// call is wrapped so a bad/missing field degrades to an empty section
// instead of throwing.
//
// VERIFY BEFORE TRUSTING IN PROD: statsapi.mlb.com is undocumented
// officially. These field names match the community-reverse-engineered
// shape. Run one real gamePk through this and diff the JSON before relying
// on it for a live Read.

const STATS_API = 'https://statsapi.mlb.com/api/v1'

const ROLLING_WINDOW = 7   // games averaged into each rolling point
const CHART_GAMES = 15     // points shown on each line/bar chart
const PLAYER_ROLLING = 10  // games for player watchlist deltas

export type Hand = 'L' | 'R' | null

export type GamePregameInfo = {
  gamePk: number
  gameDate: string
  homeTeamId: number
  awayTeamId: number
  homeAbbr: string
  awayAbbr: string
  probableHomePitcher: { id: number; name: string; hand: Hand } | null
  probableAwayPitcher: { id: number; name: string; hand: Hand } | null
}

export type RollingSeries = {
  points: number[]        // CHART_GAMES values, oldest → newest
  seasonBaseline: number
  current: number
  deltaVsSeason: number
}

export type TeamPregameStats = {
  teamId: number
  abbr: string
  ops: RollingSeries | null
  era: RollingSeries | null
  errorsPerGame: number[] | null  // raw, not rolling — last CHART_GAMES games
  splitVsHand: { hand: Hand; ops: number; sampleAB: number } | null
}

export type PlayerWatchItem = {
  id: number
  name: string
  position: string
  kind: 'hitter' | 'pitcher'
  rollingSpark: number[]  // last PLAYER_ROLLING games, raw per-game value
  current: number         // rolling OPS or ERA over that window
  deltaVsSeason: number
}

// ---------- fetch helpers ----------

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    // 5-min cache — this is an internal admin tool, not a live in-game feed.
    // Switch to { cache: 'no-store' } if you want always-fresh on every load.
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type GameLogSplit = { date: string; stat: Record<string, any> }

// MLB reports innings pitched as "6.1" meaning 6 and ⅓ — NOT decimal thirds.
// .1 = 1 out, .2 = 2 outs. Get this wrong and every rolling ERA is off.
function ipToOuts(ip: string | number | undefined): number {
  if (ip === undefined) return 0
  const [wholeStr, fracStr] = String(ip).split('.')
  const whole = Number(wholeStr ?? 0)
  const frac = Number(fracStr ?? 0) // already outs (0/1/2), not thirds
  return whole * 3 + frac
}

function extractLine(s: Record<string, any>) {
  return {
    ab: Number(s.atBats ?? 0),
    h: Number(s.hits ?? 0),
    bb: Number(s.baseOnBalls ?? 0),
    hbp: Number(s.hitByPitch ?? 0),
    sf: Number(s.sacFlies ?? 0),
    tb: Number(s.totalBases ?? 0),
  }
}
function addLine(a: ReturnType<typeof extractLine>, b: ReturnType<typeof extractLine>) {
  return { ab: a.ab + b.ab, h: a.h + b.h, bb: a.bb + b.bb, hbp: a.hbp + b.hbp, sf: a.sf + b.sf, tb: a.tb + b.tb }
}
function calcOPS(c: ReturnType<typeof extractLine>): number {
  const pa = c.ab + c.bb + c.hbp + c.sf
  if (pa === 0 || c.ab === 0) return 0
  return (c.h + c.bb + c.hbp) / pa + c.tb / c.ab
}

function computeRollingOPSPoints(games: GameLogSplit[], window: number): number[] {
  if (games.length < window) return []
  const points: number[] = []
  for (let i = window - 1; i < games.length; i++) {
    const slice = games.slice(i - window + 1, i + 1)
    const cum = slice.reduce((acc, g) => addLine(acc, extractLine(g.stat)), {
      ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0,
    })
    points.push(calcOPS(cum))
  }
  return points
}

function computeRollingERAPoints(games: GameLogSplit[], window: number): number[] {
  if (games.length < window) return []
  const points: number[] = []
  for (let i = window - 1; i < games.length; i++) {
    const slice = games.slice(i - window + 1, i + 1)
    let er = 0
    let outs = 0
    for (const g of slice) {
      er += Number(g.stat.earnedRuns ?? 0)
      outs += ipToOuts(g.stat.inningsPitched)
    }
    points.push(outs > 0 ? (er * 9) / (outs / 3) : 0)
  }
  return points
}

// ---------- game info ----------

export async function getGamePregameInfo(gamePk: number): Promise<GamePregameInfo | null> {
  const url = `${STATS_API}/schedule?gamePk=${gamePk}&hydrate=team,probablePitcher,linescore`
  const data = await safeFetchJson<any>(url)
  const game = data?.dates?.[0]?.games?.[0]
  if (!game) return null

  const home = game.teams?.home
  const away = game.teams?.away

  return {
    gamePk,
    gameDate: game.gameDate,
    homeTeamId: home?.team?.id,
    awayTeamId: away?.team?.id,
    homeAbbr: home?.team?.abbreviation ?? '???',
    awayAbbr: away?.team?.abbreviation ?? '???',
    probableHomePitcher: home?.probablePitcher
      ? { id: home.probablePitcher.id, name: home.probablePitcher.fullName, hand: home.probablePitcher.pitchHand?.code ?? null }
      : null,
    probableAwayPitcher: away?.probablePitcher
      ? { id: away.probablePitcher.id, name: away.probablePitcher.fullName, hand: away.probablePitcher.pitchHand?.code ?? null }
      : null,
  }
}

// ---------- team game logs + season baselines ----------

async function getTeamGameLog(
  teamId: number,
  group: 'hitting' | 'pitching' | 'fielding',
  season: number,
  neededGames: number,
): Promise<GameLogSplit[] | null> {
  const url = `${STATS_API}/teams/${teamId}/stats?stats=gameLog&group=${group}&season=${season}&gameType=R`
  const data = await safeFetchJson<any>(url)
  const splits: GameLogSplit[] = data?.stats?.[0]?.splits ?? []
  if (!splits.length) return null
  // gameLog usually comes back newest-first — normalize oldest → newest
  const sorted = [...splits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return sorted.slice(-neededGames)
}

async function getTeamSeasonStat(
  teamId: number,
  group: 'hitting' | 'pitching',
  season: number,
): Promise<Record<string, any> | null> {
  const url = `${STATS_API}/teams/${teamId}/stats?stats=season&group=${group}&season=${season}&gameType=R`
  const data = await safeFetchJson<any>(url)
  return data?.stats?.[0]?.splits?.[0]?.stat ?? null
}

// sitCodes vl/vr are the MLB Stats API split codes for "vs left" / "vs right".
// Min-sample guard mirrors the same instinct as the RISP work in the V5 model —
// a small-sample "matchup edge" is worse than no take at all.
async function getTeamSplitVsHand(
  teamId: number,
  hand: Hand,
  season: number,
): Promise<{ ops: number; sampleAB: number } | null> {
  if (!hand) return null
  const sitCode = hand === 'L' ? 'vl' : 'vr'
  const url = `${STATS_API}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}&gameType=R&sitCodes=${sitCode}`
  const data = await safeFetchJson<any>(url)
  const stat = data?.stats?.[0]?.splits?.[0]?.stat
  if (!stat) return null
  const ops = parseFloat(stat.ops ?? '0')
  const sampleAB = Number(stat.atBats ?? 0)
  if (!ops || sampleAB < 20) return null
  return { ops, sampleAB }
}

export async function getTeamPregameStats(
  teamId: number,
  abbr: string,
  opposingPitcherHand: Hand,
  season: number,
): Promise<TeamPregameStats> {
  const needed = ROLLING_WINDOW + CHART_GAMES

  const [hittingLog, pitchingLog, fieldingLog, seasonHitting, seasonPitching, splitVsHand] = await Promise.all([
    getTeamGameLog(teamId, 'hitting', season, needed),
    getTeamGameLog(teamId, 'pitching', season, needed),
    getTeamGameLog(teamId, 'fielding', season, CHART_GAMES),
    getTeamSeasonStat(teamId, 'hitting', season),
    getTeamSeasonStat(teamId, 'pitching', season),
    getTeamSplitVsHand(teamId, opposingPitcherHand, season),
  ])

  let ops: RollingSeries | null = null
  if (hittingLog && seasonHitting) {
    const points = computeRollingOPSPoints(hittingLog, ROLLING_WINDOW).slice(-CHART_GAMES)
    const seasonBaseline = parseFloat(seasonHitting.ops ?? '0')
    if (points.length && seasonBaseline) {
      const current = points[points.length - 1]
      ops = { points, seasonBaseline, current, deltaVsSeason: current - seasonBaseline }
    }
  }

  let era: RollingSeries | null = null
  if (pitchingLog && seasonPitching) {
    const points = computeRollingERAPoints(pitchingLog, ROLLING_WINDOW).slice(-CHART_GAMES)
    const seasonBaseline = parseFloat(seasonPitching.era ?? '0')
    if (points.length && seasonBaseline) {
      const current = points[points.length - 1]
      era = { points, seasonBaseline, current, deltaVsSeason: current - seasonBaseline }
    }
  }

  const errorsPerGame = fieldingLog ? fieldingLog.map((g) => Number(g.stat.errors ?? 0)) : null

  return {
    teamId,
    abbr,
    ops,
    era,
    errorsPerGame,
    splitVsHand: splitVsHand ? { hand: opposingPitcherHand, ...splitVsHand } : null,
  }
}

// ---------- player watchlist ----------

async function getPlayerSeasonStat(
  playerId: number,
  group: 'hitting' | 'pitching',
  season: number,
): Promise<Record<string, any> | null> {
  const url = `${STATS_API}/people/${playerId}/stats?stats=season&group=${group}&season=${season}&gameType=R`
  const data = await safeFetchJson<any>(url)
  return data?.stats?.[0]?.splits?.[0]?.stat ?? null
}

export async function getPlayerWatchlist(
  players: { id: number; name: string; position: string }[],
  season: number,
): Promise<PlayerWatchItem[]> {
  const results = await Promise.all(
    players.map(async (p) => {
      const isPitcher = p.position === 'P' || p.position === 'SP' || p.position === 'RP'
      const group = isPitcher ? 'pitching' : 'hitting'

      const url = `${STATS_API}/people/${p.id}/stats?stats=gameLog&group=${group}&season=${season}&gameType=R`
      const data = await safeFetchJson<any>(url)
      const splits: GameLogSplit[] = data?.stats?.[0]?.splits ?? []
      if (!splits.length) return null

      const sorted = [...splits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const recent = sorted.slice(-PLAYER_ROLLING)
      const seasonStat = await getPlayerSeasonStat(p.id, group, season)
      if (!seasonStat) return null

      if (isPitcher) {
        const spark = recent.map((g) => {
          const outs = ipToOuts(g.stat.inningsPitched)
          return outs > 0 ? (Number(g.stat.earnedRuns ?? 0) * 9) / (outs / 3) : 0
        })
        const cumER = recent.reduce((a, g) => a + Number(g.stat.earnedRuns ?? 0), 0)
        const cumOuts = recent.reduce((a, g) => a + ipToOuts(g.stat.inningsPitched), 0)
        const current = cumOuts > 0 ? (cumER * 9) / (cumOuts / 3) : 0
        const seasonBaseline = parseFloat(seasonStat.era ?? '0')
        return {
          id: p.id, name: p.name, position: p.position, kind: 'pitcher' as const,
          rollingSpark: spark, current, deltaVsSeason: current - seasonBaseline,
        }
      }

      const spark = recent.map((g) => calcOPS(extractLine(g.stat)))
      const cum = recent.reduce((acc, g) => addLine(acc, extractLine(g.stat)), { ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0 })
      const current = calcOPS(cum)
      const seasonBaseline = parseFloat(seasonStat.ops ?? '0')
      return {
        id: p.id, name: p.name, position: p.position, kind: 'hitter' as const,
        rollingSpark: spark, current, deltaVsSeason: current - seasonBaseline,
      }
    }),
  )
  return results.filter((r): r is PlayerWatchItem => r !== null)
}

// ---------- orchestrator ----------

export type LineupPlayerIds = {
  home: { id: number; name: string; position: string }[]
  away: { id: number; name: string; position: string }[]
}

export async function getDataRoomBundle(gamePk: number, lineupPlayerIds?: LineupPlayerIds) {
  const info = await getGamePregameInfo(gamePk)
  if (!info) return null

  const season = new Date(info.gameDate).getFullYear()

  const [homeStats, awayStats] = await Promise.all([
    getTeamPregameStats(info.homeTeamId, info.homeAbbr, info.probableAwayPitcher?.hand ?? null, season),
    getTeamPregameStats(info.awayTeamId, info.awayAbbr, info.probableHomePitcher?.hand ?? null, season),
  ])

  const [homeWatchlist, awayWatchlist] = await Promise.all([
    lineupPlayerIds?.home?.length ? getPlayerWatchlist(lineupPlayerIds.home, season) : Promise.resolve([]),
    lineupPlayerIds?.away?.length ? getPlayerWatchlist(lineupPlayerIds.away, season) : Promise.resolve([]),
  ])

  return { info, homeStats, awayStats, homeWatchlist, awayWatchlist }
}