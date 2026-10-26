// Data for /mlb/scores: one day's games with final scores, decisions and links, plus the "next game" chip.
// Source: MLB Stats API schedule (linescore + decisions hydrated), cached 60 seconds.
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { slugifyGame, type MLBGame } from '@/lib/mlb'

type Raw = MLBGame & {
  gameType?: string; seriesDescription?: string; seriesGameNumber?: number; ifNecessary?: string
  status: { abstractGameState: string; detailedState: string }
  teams: { away: { team: { id: number; name: string; abbreviation?: string }; score?: number }; home: { team: { id: number; name: string; abbreviation?: string }; score?: number } }
  linescore?: { currentInningOrdinal?: string; inningState?: string }
  decisions?: { winner?: { fullName: string }; loser?: { fullName: string }; save?: { fullName: string } }
}
type Sched = { dates?: { date: string; games: Raw[] }[] }
const HYDRATE = 'team,linescore,decisions'
const ROUND: Record<string, string> = { 'World Series': 'WS', 'League Championship Series': 'LCS', 'Division Series': 'DS', 'Wild Card Series': 'WC' }

export type ScoreRow = {
  gamePk: number; slug: string; label: string | null; status: string; final: boolean; live: boolean; startUtc: string
  away: { id: number; abbr: string; name: string; score: number | null }; home: { id: number; abbr: string; name: string; score: number | null }
  decisions: string | null
}
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const shiftDay = (d: string, by: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + by); return iso(x) }
export const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const last = (n?: string) => (n ? n.trim().split(/\s+/).slice(-1)[0] : '')

function toRow(g: Raw): ScoreRow {
  const abs = g.status.abstractGameState
  const final = abs === 'Final', live = abs === 'Live'
  const series = g.seriesDescription && g.seriesDescription !== 'Regular Season' ? (ROUND[g.seriesDescription] ?? g.seriesDescription) : null
  const d = g.decisions
  return {
    gamePk: g.gamePk, slug: slugifyGame(g), final, live, startUtc: g.gameDate,
    label: series && g.seriesGameNumber ? `${series} G${g.seriesGameNumber}${g.ifNecessary === 'Y' ? '*' : ''}` : null,
    status: final ? (g.status.detailedState === 'Final' ? 'Final' : g.status.detailedState) : live ? [g.linescore?.inningState, g.linescore?.currentInningOrdinal].filter(Boolean).join(' ') || 'Live' : /postponed|cancelled|suspended/i.test(g.status.detailedState) ? g.status.detailedState : '',
    away: { id: g.teams.away.team.id, abbr: g.teams.away.team.abbreviation ?? '', name: g.teams.away.team.name, score: g.teams.away.score ?? null },
    home: { id: g.teams.home.team.id, abbr: g.teams.home.team.abbreviation ?? '', name: g.teams.home.team.name, score: g.teams.home.score ?? null },
    decisions: final && d ? [d.winner && `W: ${last(d.winner.fullName)}`, d.loser && `L: ${last(d.loser.fullName)}`, d.save && `S: ${last(d.save.fullName)}`].filter(Boolean).join(' · ') : null,
  }
}

export async function getGamesOn(date: string): Promise<ScoreRow[]> {
  const r = await mlb<Sched>(`/schedule?sportId=1&date=${date}&hydrate=${HYDRATE}`, 60)
  const games = r?.dates?.[0]?.games ?? []
  const order = (g: ScoreRow) => (g.live ? 0 : g.final ? 2 : 1)
  return games.map(toRow).sort((a, b) => order(a) - order(b) || a.startUtc.localeCompare(b.startUtc))
}

/** The most recent day before `date` (within 60 days) that had games. */
export async function lastDayWithGames(date: string): Promise<string | null> {
  const r = await mlb<Sched>(`/schedule?sportId=1&startDate=${shiftDay(date, -60)}&endDate=${shiftDay(date, -1)}`, 600)
  const days = (r?.dates ?? []).filter(d => d.games.length > 0).map(d => d.date).sort()
  return days.length ? days[days.length - 1] : null
}

/** The next scheduled game after `date` within 21 days, for the "Next:" chip. */
export async function nextGameAfter(date: string): Promise<{ date: string; label: string | null; matchup: string } | null> {
  const r = await mlb<Sched>(`/schedule?sportId=1&startDate=${date}&endDate=${shiftDay(date, 21)}&hydrate=team`, 600)
  for (const d of r?.dates ?? []) {
    if (d.date <= date) continue
    const g = d.games.find(x => x.status.abstractGameState !== 'Final')
    if (g) { const row = toRow(g); return { date: d.date, label: row.label, matchup: `${row.away.abbr} at ${row.home.abbr}` } }
  }
  return null
}
