// src/components/SidebarSlotAsync.tsx
//
// Async Server Component for the right-rail sidebar (visible on every tab
// except Scout), extracted from mlb/[slug]/page.tsx's slotSidebar block so
// it streams independently under <Suspense> instead of blocking the whole
// page on standings/league-standings/team-form/series-top3 data. Same
// self-contained pattern as the other *SlotAsync components.
// getSeriesGamesFromDB and getSeriesTop3 are React `cache()`-wrapped, so the
// overlap with SeriesSlotAsync/KeyPlayersSlotAsync/page.tsx dedupes for
// free within the same request instead of double-fetching.

import { getScheduleForDate, slugifyGame, getTeamForm, type MLBGame } from '@/lib/mlb'
import { createAdminClient } from '@/lib/supabase'
import { getDivisionStandingsFromDB, getLeagueStandingsFromDB } from '@/lib/standings'
import { getSeriesGamesFromDB, type SeriesGameResult } from '@/lib/series-games'
import { getSeriesTop3 } from '@/lib/series-matchup'
import StandingsCard from '@/components/StandingsCard'
import RaceForOctober from '@/components/RaceForOctober'
import SeriesCarousel from '@/components/SeriesCarousel'
import Top3SidebarTeaser from '@/components/Top3SidebarTeaser'

function TrendsCard({ awayAbbr, homeAbbr, awayForm, homeForm }: {
  awayAbbr: string; homeAbbr: string; awayForm: any; homeForm: any
}) {
  if (!awayForm && !homeForm) return <Stub label="Team Forms" note="Form data unavailable for this game." />
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Team Forms</p>
      <div className="space-y-3">
        {[{ abbr: awayAbbr, form: awayForm }, { abbr: homeAbbr, form: homeForm }].map(({ abbr, form }) => form && (
          <div key={abbr}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-stone-900">{abbr}</span>
              <span className={`text-xs font-mono font-bold ${form.streak_type === 'W' ? 'text-green-600' : form.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                {form.streak}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
              <span>L10 <span className="text-stone-700 font-bold">{form.last_10_wins}-{form.last_10_losses}</span></span>
              <span>R/G <span className="text-stone-700 font-bold">{form.runs_per_game_l10?.toFixed(1) ?? '–'}</span></span>
              <span className={(form.run_diff_l10 ?? 0) > 0 ? 'text-green-600 font-bold' : (form.run_diff_l10 ?? 0) < 0 ? 'text-red-500 font-bold' : 'text-stone-700 font-bold'}>
                {(form.run_diff_l10 ?? 0) > 0 ? '+' : ''}{form.run_diff_l10?.toFixed(1) ?? '–'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stub({ label, note }: { label: string; note?: string }) {
  return (
    <div className="border border-dashed border-stone-300 rounded-xl p-6 text-center bg-stone-50/50 h-full flex flex-col items-center justify-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">{label}</p>
      {note && <p className="text-[10px] font-serif italic text-stone-400 leading-snug">{note}</p>}
    </div>
  )
}

function gameChipDate(officialDate: string, isTonight: boolean): string {
  if (isTonight) return 'Tonight'
  return new Date(officialDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })
}

export default async function SidebarSlotAsync({ slug }: { slug: string }) {
  const supa = createAdminClient()
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) return null

  let game: MLBGame | null = null
  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {}
  if (!game) {
    const { data: cached } = await supa.from('game_previews').select('raw_data').eq('slug', slug).single()
    if (cached?.raw_data) game = cached.raw_data as MLBGame
  }
  if (!game) return null

  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]
  const _awayAbbr = game.teams.away.team.abbreviation ?? 'AWAY'
  const _homeAbbr = game.teams.home.team.abbreviation ?? 'HOME'
  const season = new Date().getFullYear()

  const [seriesGames, awayTop3, homeTop3, awayForm, homeForm, awayStandings, homeStandings] = await Promise.all([
    getSeriesGamesFromDB(game.gamePk) as Promise<SeriesGameResult[]>,
    getSeriesTop3(game.teams.away.team.id, game.teams.home.team.id, gameDateApi, game.gamePk),
    getSeriesTop3(game.teams.home.team.id, game.teams.away.team.id, gameDateApi, game.gamePk),
    getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
    getDivisionStandingsFromDB(game.teams.away.team.id, season),
    getDivisionStandingsFromDB(game.teams.home.team.id, season),
  ])

  const awayRow = awayStandings?.teams.find(t => t.teamId === game!.teams.away.team.id) ?? null
  const homeRow = homeStandings?.teams.find(t => t.teamId === game!.teams.home.team.id) ?? null
  const [awayLeagueStandings, homeLeagueStandings] = await Promise.all([
    awayStandings ? getLeagueStandingsFromDB(awayStandings.leagueId, season) : Promise.resolve([]),
    homeStandings ? getLeagueStandingsFromDB(homeStandings.leagueId, season) : Promise.resolve([]),
  ])

  const seriesCarouselGames = seriesGames.map(g => ({
    gameNumber: g.gameNumber, gamePk: g.gamePk, date: gameChipDate(g.officialDate, g.isTonight),
    awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, awayScore: g.awayScore, homeScore: g.homeScore,
    isFinal: g.isFinal, isTonight: g.isTonight,
  }))

  return (
    <>
      {seriesGames.length >= 1 && (
        <SeriesCarousel
          games={seriesCarouselGames}
          awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        />
      )}

      <Top3SidebarTeaser
        awayResult={awayTop3}
        homeResult={homeTop3}
        awayTeamId={game.teams.away.team.id}
        homeTeamId={game.teams.home.team.id}
        awayAbbr={_awayAbbr}
        homeAbbr={_homeAbbr}
      />

      <TrendsCard
        awayAbbr={_awayAbbr} homeAbbr={_homeAbbr}
        awayForm={awayForm} homeForm={homeForm}
      />

      <StandingsCard
        awayTeamId={game.teams.away.team.id} homeTeamId={game.teams.home.team.id}
        awayStandings={awayStandings} homeStandings={homeStandings}
      />

      {awayRow && awayStandings && (
        <RaceForOctober team={awayRow} divisionTeams={awayStandings.teams} wildCardTeams={awayLeagueStandings} abbr={_awayAbbr} />
      )}
      {homeRow && homeStandings && (
        <RaceForOctober team={homeRow} divisionTeams={homeStandings.teams} wildCardTeams={homeLeagueStandings} abbr={_homeAbbr} />
      )}
    </>
  )
}
