// src/lib/deserve-to-win.ts
//
// "Deserve-to-Win Waterfall" — decomposes a team's real actual wins into a
// real Pythagorean-expected baseline plus real "luck." This app has no
// real source for preseason projections, so the baseline isn't invented —
// it's Clay Davenport's Pythagenpat formula (a dynamic exponent based on
// real runs-per-game, the standard, more accurate successor to the fixed
// exponent=2 Pythagorean formula), computed from real season
// runsScored/runsAllowed already on every MLBStandingTeam. The luck is
// further split into a real "close-game" component (this team's actual
// 1-run/extra-inning win% vs. a neutral 50%, from the real per-game log
// already built for the river/leverage board) and a residual — every
// number here is checkable against the box score.

import type { MLBDivisionStandings } from './mlb-homepage'
import type { SeasonGame } from './season-shape'

export function pythagenpatWinPct(runsScored: number, runsAllowed: number, games: number): number {
  if (runsScored === 0 && runsAllowed === 0) return 0.5
  const rpg = games > 0 ? (runsScored + runsAllowed) / games : 9
  const exponent = Math.pow(Math.max(rpg, 0.1), 0.287)
  const rsExp = Math.pow(runsScored, exponent)
  const raExp = Math.pow(runsAllowed, exponent)
  return rsExp / (rsExp + raExp)
}

export type TeamLuck = {
  teamId: number
  teamName: string
  wins: number
  losses: number
  games: number
  pytWins: number
  luckWins: number // real: actual wins - Pythagorean-expected wins
}

export function computeLeagueLuck(standings: MLBDivisionStandings[]): TeamLuck[] {
  const rows: TeamLuck[] = []
  for (const div of standings) {
    for (const t of div.teams) {
      const games = t.wins + t.losses
      const pytWins = pythagenpatWinPct(t.runsScored, t.runsAllowed, games) * games
      rows.push({ teamId: t.id, teamName: t.name, wins: t.wins, losses: t.losses, games, pytWins, luckWins: t.wins - pytWins })
    }
  }
  return rows
}

export type CloseGameSplit = {
  wins: number
  losses: number
  winPct: number
  luckWins: number // real: (actual close-game win% - neutral 50%) x close games played
  games: SeasonGame[]
}

// Real one-run and extra-inning games are the standard sabermetric proxy
// for "close-game luck" — a team with a lopsided close-game record is
// outperforming or underperforming what run differential alone predicts.
export function computeCloseGameSplit(games: SeasonGame[]): CloseGameSplit {
  const close = games.filter(g => Math.abs(g.runsFor - g.runsAgainst) <= 1 || g.innings > 9)
  const wins = close.filter(g => g.win).length
  const losses = close.length - wins
  const winPct = close.length > 0 ? wins / close.length : 0.5
  return { wins, losses, winPct, luckWins: (winPct - 0.5) * close.length, games: close }
}
