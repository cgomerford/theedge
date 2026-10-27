// Development only: runs the /mlb dashboard loaders for any date so the regular-season and postponement cases can be checked
// without waiting for the real day. GET /api/dev/mlb-dashboard-check?date=2026-09-15
import { NextRequest, NextResponse } from 'next/server'
import { getSeasonState, getDashboardGames, getStandingsDash, getHotThisMonth } from '@/lib/mlb-home-dashboard'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const date = req.nextUrl.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date=YYYY-MM-DD' }, { status: 400 })
  const season = await getSeasonState(date)
  const games = await getDashboardGames(date, season.state === 'postseason')
  const divs = await getStandingsDash(date)
  const hot = await getHotThisMonth('hitting', season.state === 'postseason', date)
  const count = (g: string) => games.filter(x => x.group === g).length
  return NextResponse.json({
    season, games: games.length, live: count('live'), upcoming: count('upcoming'), final: count('final'), compact: games.length >= 12,
    states: [...new Set(games.map(g => g.state))], doubleheaders: games.filter(g => g.doubleHeader).map(g => `${g.away.abbr}@${g.home.abbr} G${g.gameNumber}${g.startsAfterGame1 ? ' (after G1)' : ''}`),
    startersWithMix: games.filter(g => g.awayStarter?.mix.length).length, tbd: games.filter(g => !g.awayStarter || !g.homeStarter).length,
    standings: divs.map(d => ({ d: d.name, top: d.teams[0] && { abbr: d.teams[0].abbr, rd: d.teams[0].rd, l10: d.teams[0].l10, wcRank: d.teams[0].wcRank } })),
    hotHitters: hot.slice(0, 3).map(h => `${h.name} ${h.n} PA`),
  })
}
