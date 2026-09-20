// src/lib/season-shape.ts
//
// "Season Shape River" — one team's real season, Opening Day to today, as
// a rolling run-differential stream instead of the usual cumulative W-L
// ticker. Every input is real:
//   - per-game runs for/against: /schedule?teamId=X&season=Y&hydrate=team,linescore
//     (same endpoint + shape already proven by getTeamWinProgression in
//     src/lib/lab.ts, just asking for scores too instead of only isWinner)
//   - opponent quality band: the opponent's real, season-to-date win% (from
//     the standings the homepage already fetches) averaged over the same
//     rolling window, so a hot stretch against last-place teams reads
//     differently from one against the league's best
//   - event ticks: real MLB transactions (/transactions?teamId=X), typeCode
//     'TR' (trade), 'CU' (call-up), 'SGN' (major-league signing), and 'SC'
//     entries whose description contains "injured list" + "placed" (an IL
//     move) — curl-verified against the live endpoint, not guessed
//
// No preseason projections, no fabricated trend — just this team's real
// games, real transactions, and real opponent strength.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type SeasonGame = {
  gameIndex: number
  date: string
  gamePk: number
  opponentId: number
  opponentName: string
  home: boolean
  runsFor: number
  runsAgainst: number
  win: boolean
  innings: number
}

type ScheduleTeamSide = {
  team: { id: number; name: string }
  score?: number
  isWinner?: boolean
}
type ScheduleGame = {
  gamePk: number
  officialDate: string
  status?: { abstractGameState?: string }
  teams: { home: ScheduleTeamSide; away: ScheduleTeamSide }
  linescore?: { currentInning?: number; teams?: { home?: { runs?: number }; away?: { runs?: number } } }
}
type ScheduleResponse = { dates?: { games: ScheduleGame[] }[] }

export async function getTeamGameLog(teamId: number, season: number): Promise<SeasonGame[]> {
  const res = await fetch(`${MLB_API}/schedule?teamId=${teamId}&season=${season}&gameType=R&sportId=1&hydrate=team,linescore`)
  if (!res.ok) return []
  const data: ScheduleResponse = await res.json()

  const games: SeasonGame[] = []
  let idx = 0
  for (const d of data.dates ?? []) {
    for (const g of d.games) {
      if (g.status?.abstractGameState !== 'Final') continue
      const isHome = g.teams.home.team.id === teamId
      const mine = isHome ? g.teams.home : g.teams.away
      const theirs = isHome ? g.teams.away : g.teams.home
      const runsFor = mine.score ?? (isHome ? g.linescore?.teams?.home?.runs : g.linescore?.teams?.away?.runs)
      const runsAgainst = theirs.score ?? (isHome ? g.linescore?.teams?.away?.runs : g.linescore?.teams?.home?.runs)
      if (runsFor === undefined || runsAgainst === undefined) continue
      idx++
      games.push({
        gameIndex: idx,
        date: g.officialDate,
        gamePk: g.gamePk,
        opponentId: theirs.team.id,
        opponentName: theirs.team.name,
        home: isHome,
        runsFor,
        runsAgainst,
        win: !!mine.isWinner,
        innings: g.linescore?.currentInning ?? 9,
      })
    }
  }
  return games
}

export type RiverPoint = {
  gameIndex: number
  date: string
  rollingDiff: number
  opponentWinPct: number
  cumWin: number
  cumLoss: number
}

// Rolling sum of real run differential over a trailing window (10 games by
// default), with the window's average real opponent win% riding alongside
// it so the two can be read together.
export function buildRiver(games: SeasonGame[], opponentWinPctById: Map<number, number>, window = 10): RiverPoint[] {
  const points: RiverPoint[] = []
  let cumWin = 0, cumLoss = 0
  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    if (g.win) cumWin++; else cumLoss++
    const slice = games.slice(Math.max(0, i - window + 1), i + 1)
    const rollingDiff = slice.reduce((s, x) => s + (x.runsFor - x.runsAgainst), 0)
    const oppPcts = slice.map(x => opponentWinPctById.get(x.opponentId) ?? 0.5)
    const opponentWinPct = oppPcts.reduce((s, x) => s + x, 0) / oppPcts.length
    points.push({ gameIndex: g.gameIndex, date: g.date, rollingDiff, opponentWinPct, cumWin, cumLoss })
  }
  return points
}

export type StreakTick = { gameIndex: number; date: string; length: number; type: 'win' | 'loss' }

// Real winning/losing streaks of minLength+ games, tick placed on the
// streak's final game.
export function findStreaks(games: SeasonGame[], minLength = 4): StreakTick[] {
  const ticks: StreakTick[] = []
  let runType: 'win' | 'loss' | null = null
  let runStart = 0
  for (let i = 0; i <= games.length; i++) {
    const g = games[i]
    const t: 'win' | 'loss' | null = g ? (g.win ? 'win' : 'loss') : null
    if (t !== runType) {
      if (runType && i - runStart >= minLength) {
        ticks.push({ gameIndex: games[i - 1].gameIndex, date: games[i - 1].date, length: i - runStart, type: runType })
      }
      runType = t
      runStart = i
    }
  }
  return ticks
}

export type TransactionTick = {
  gameIndex: number
  date: string
  type: 'trade' | 'callup' | 'signing' | 'il'
  description: string
}

export type MlbTransaction = {
  date: string
  typeCode: string
  description: string
  person?: { id: number; fullName: string }
  toTeam?: { id: number }
}

export async function getTeamSeasonTransactions(teamId: number, season: number): Promise<MlbTransaction[]> {
  const res = await fetch(`${MLB_API}/transactions?teamId=${teamId}&startDate=${season}-01-01&endDate=${season}-12-01`)
  if (!res.ok) return []
  const data = await res.json()
  return data.transactions ?? []
}

// Real transactions, filtered to the moves actually worth marking on the
// river and aligned to the nearest game played on/after that date.
export function tagTransactions(games: SeasonGame[], transactions: MlbTransaction[]): TransactionTick[] {
  if (games.length === 0) return []
  const ticks: TransactionTick[] = []

  for (const t of transactions) {
    let type: TransactionTick['type'] | null = null
    if (t.typeCode === 'TR') type = 'trade'
    else if (t.typeCode === 'CU') type = 'callup'
    else if (t.typeCode === 'SGN') type = 'signing'
    else if (t.typeCode === 'SC' && /injured list/i.test(t.description) && /^[^.]*\bplaced\b/i.test(t.description)) type = 'il'
    if (!type) continue

    // Nearest game on/after the transaction date (falls back to the last
    // game if the move landed after the season's final game in our log).
    const game = games.find(g => g.date >= t.date) ?? games[games.length - 1]
    ticks.push({ gameIndex: game.gameIndex, date: t.date, type, description: t.description })
  }
  return ticks
}
