import {
  getScheduleForDate, slugifyGame, shortName, getPitcherRecentStarts, getPitcherSeasonStats, getGameWeather,
  pitchColor, getTeamForm, describeTeamForm, teamLogoUrl, playerHeadshotUrl, getPitchMix, type MLBGame
} from '@/lib/mlb'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import WeatherIcon from '@/components/WeatherIcon'
import WindArrow from '@/components/WindArrow'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import { getEdgePrediction } from '@/lib/edge-fetch'
import LineupCard from '@/components/LineupCard'
import { getProjectedLineup } from '@/lib/lineups'
import PitchArsenalChart from '@/components/PitchArsenalChart'
import Storylines from '@/components/Storylines'
import Contrarian from '@/components/Contrarian'
import ProTakeaways from '@/components/ProTakeaways'
import { findTeamByName, findTeamBySlug, getTeamTheme, teamIdBySlug } from '@/lib/teams'
import StreamerPick from '@/components/StreamerPick'
import { scoreStreamer } from '@/lib/streamer'
import type { StreamerInput } from '@/lib/streamer'
import HotZone from '@/components/HotZone'
import { getBatterHotZones, getPitcherHotZones } from '@/lib/hot-zones'
import { getCurrentSubscriber } from '@/lib/auth'
import GamePageShell from '@/components/GamePageShell'
import ProDashboard from '@/components/ProDashboard'
import MatchupTilt from '@/components/MatchupTilt'
import { buildMatchupTiltData } from '@/lib/matchup-tilt'
import type { ComponentsRaw, ComponentScores } from '@/lib/matchup-tilt'
import ScrollProgress from '@/components/ScrollProgress'
import PitchTunneling from '@/components/PitchTunneling'
import ProLockOverlay from '@/components/ProLockOverlay'
import FantasyTabContent from '@/components/FantasyTabContent'
import { getInlineCalibration } from '@/lib/track-record'
import InlineCalibration from '@/components/InlineCalibration'
import SeriesContext from '@/components/SeriesContext'
import { getSeriesContext } from '@/lib/series-context'
import GmLabContent from '@/components/GmLabContent'
import { getTeamTransactions } from '@/lib/team-transactions'
import PitchingLabContent from '@/components/PitchingLabContent'
import BattingTabContent from '@/components/BattingTabContent'



// Refresh every 60s so live scores stay current
export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  const dateStr = dateMatch?.[1] ?? ''
  const matchup = slug
    .replace(/-(\d{4}-\d{2}-\d{2})(-game\d+)?$/, '')
    .replace(/-at-/, ' at ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  const displayDate = dateStr
    ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
  const title = `${matchup}${displayDate ? ` — ${displayDate}` : ''} · The Edge`
  const description = `Pre-game analysis, Edge Score, and data-driven read for ${matchup}. Starting pitchers, lineups, and what the numbers say.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? true
  const isSignedIn = subscriber !== null

  const { data: cached } = await supa.from('game_previews').select('*').eq('slug', slug).single()
  let game: MLBGame | null = null
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  // Always fetch fresh from MLB API to get live scores, linescore, and current status.
  // The cache only stored pre-game state and won't have scores.
  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {
    // API failure — fall back to cache
  }

  // Fall back to cache if fresh fetch failed
  if (!game && cached?.raw_data) {
    game = cached.raw_data as MLBGame
  }

  if (!game) notFound()

  // Keep cache updated with latest state
  await supa.from('game_previews').upsert({
    slug, league: 'mlb', game_date: dateMatch[1], home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name, home_team_id: game.teams.home.team.id,
    away_team_id: game.teams.away.team.id, game_time: game.gameDate, venue: game.venue?.name,
    status: game.status?.detailedState, raw_data: game,
  }, { onConflict: 'slug' })

  // ── Live score data ──────────────────────────────────────────────────────
  // For live/final games, fetch fresh game state directly (not from cache)
  const gameState = game.status?.abstractGameState
  const isLive  = gameState === 'Live'
  const isFinal = gameState === 'Final'

  // game is already fresh from the API fetch above
  const liveGame = game as any

  const liveScore = (isLive || isFinal) ? {
    awayRuns:      liveGame.teams?.away?.score ?? 0,
    homeRuns:      liveGame.teams?.home?.score ?? 0,
    awayHits:      liveGame.linescore?.teams?.away?.hits,
    homeHits:      liveGame.linescore?.teams?.home?.hits,
    awayErrors:    liveGame.linescore?.teams?.away?.errors,
    homeErrors:    liveGame.linescore?.teams?.home?.errors,
    inningState:   liveGame.linescore?.inningState,
    currentInning: liveGame.linescore?.currentInningOrdinal
      ? `${liveGame.linescore?.inningState ?? ''} ${liveGame.linescore?.currentInningOrdinal ?? ''}`.trim()
      : undefined,
    isLive,
    isFinal,
  } : undefined

  // ── Rest of data fetching ────────────────────────────────────────────────
  const prediction = await getEdgePrediction(game.gamePk)
  const calibration = prediction?.confidence_tier
    ? await getInlineCalibration(prediction.confidence_tier)
    : null
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const venue = getVenueInfo(game.venue?.name)
  const gameDateApi = game.gameDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]

  const [
    awayRecentStarts, homeRecentStarts, awaySeasonStats, homeSeasonStats, weather,
    awayPitchMix, homePitchMix, awayForm, homeForm, awayLineup, homeLineup,
    awayPitcherHotZones, homePitcherHotZones,
    awayPitcherStatsRes, homePitcherStatsRes
  ] = await Promise.all([
    awayPitcherId ? getPitcherRecentStarts(awayPitcherId, 5) : Promise.resolve([]),
    homePitcherId ? getPitcherRecentStarts(homePitcherId, 5) : Promise.resolve([]),
    awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
    venue && !venue.indoor ? getGameWeather(venue.lat, venue.lon, game.gameDate) : Promise.resolve(null),
    awayPitcherId ? getPitchMix(awayPitcherId) : Promise.resolve([]),
    homePitcherId ? getPitchMix(homePitcherId) : Promise.resolve([]),
    getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
    game.teams.away.probablePitcher ? getPitcherHotZones(game.teams.away.probablePitcher.id) : Promise.resolve({}),
    game.teams.home.probablePitcher ? getPitcherHotZones(game.teams.home.probablePitcher.id) : Promise.resolve({}),
    awayPitcherId ? supa.from('pitcher_stats').select('*').eq('player_id', awayPitcherId).single() : Promise.resolve({ data: null }),
    homePitcherId ? supa.from('pitcher_stats').select('*').eq('player_id', homePitcherId).single() : Promise.resolve({ data: null }),
    getSeriesContext(game.gamePk),
  ])
  const awayPitcherStats = awayPitcherStatsRes?.data || null
  const homePitcherStats = homePitcherStatsRes?.data || null
  const seriesContext = await getSeriesContext(game.gamePk)
  const [awayTransactions, homeTransactions] = await Promise.all([
getTeamTransactions(game.teams.away.team.id, 14),
getTeamTransactions(game.teams.home.team.id, 14),
])

  const awayFeatureBatter = awayLineup?.batters?.[2] ?? null
  const homeFeatureBatter = homeLineup?.batters?.[2] ?? null

  const [awayBatterHotZones, homeBatterHotZones] = await Promise.all([
    awayFeatureBatter ? getBatterHotZones(awayFeatureBatter.player_id) : Promise.resolve({}),
    homeFeatureBatter ? getBatterHotZones(homeFeatureBatter.player_id) : Promise.resolve({}),
  ])

  const parkComponent = prediction?.components?.park ?? 0
  const awayStreamerInput: StreamerInput | null = game.teams.away.probablePitcher && awaySeasonStats ? {
    pitcherName: game.teams.away.probablePitcher.fullName, pitcherId: game.teams.away.probablePitcher.id,
    teamName: shortName(game.teams.away.team.name), opponentName: shortName(game.teams.home.team.name),
    opponentStats: null, pitcherStats: awaySeasonStats, pitchMix: awayPitchMix as any, parkComponent, isPitcherHome: false,
    gameSlug: slug, gameTime: new Date(game.gameDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
  } : null

  const homeStreamerInput: StreamerInput | null = game.teams.home.probablePitcher && homeSeasonStats ? {
    pitcherName: game.teams.home.probablePitcher.fullName, pitcherId: game.teams.home.probablePitcher.id,
    teamName: shortName(game.teams.home.team.name), opponentName: shortName(game.teams.away.team.name),
    opponentStats: null, pitcherStats: homeSeasonStats, pitchMix: homePitchMix as any, parkComponent: -parkComponent,
    isPitcherHome: true, gameSlug: slug, gameTime: new Date(game.gameDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
  } : null

  const awayStreamer = awayStreamerInput ? scoreStreamer(awayStreamerInput) : null
  const homeStreamer = homeStreamerInput ? scoreStreamer(homeStreamerInput) : null
  const topStreamer = !awayStreamer ? homeStreamer : !homeStreamer ? awayStreamer
    : awayStreamer.streamerScore >= homeStreamer.streamerScore ? awayStreamer : homeStreamer

  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  const tiltData = prediction?.components_raw && prediction?.components ? buildMatchupTiltData(
    prediction.components_raw as ComponentsRaw,
    prediction.components as ComponentScores,
    { abbr: game.teams.home.team.abbreviation ?? 'HOME', name: shortName(game.teams.home.team.name), primaryColor: findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A', stats: homePitcherStats },
    { abbr: game.teams.away.team.abbreviation ?? 'AWAY', name: shortName(game.teams.away.team.name), primaryColor: findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A', stats: awayPitcherStats },
    game.venue?.name ?? '',
    gameTimeFormatted
  ) : null

  return (
    <>
      <ScrollProgress />
      <SiteHeader variant="page" />
      <LiveTicker />

      <GamePageShell
        homeTeam={game.teams.home.team.name}
        awayTeam={game.teams.away.team.name}
        homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
        awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
        homeLogoUrl={teamLogoUrl(game.teams.home.team.id)}
        awayLogoUrl={teamLogoUrl(game.teams.away.team.id)}
        gameTime={gameTimeFormatted}
        venue={game.venue?.name}
        isPro={isPro}
        isSignedIn={isSignedIn}
        liveScore={liveScore}

        slotRead={
          <div className="space-y-10">
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono uppercase tracking-widest text-stone-400 pb-2" suppressHydrationWarning>
              <span>{gameDate}</span>
              <span className="text-orange-400">·</span>
              <span>{gameTimeFormatted}</span>
              {game.venue?.name && (
                <>
                  <span className="text-orange-400">·</span>
                  <span>{game.venue.name}</span>
                </>
              )}
            </div>

            {prediction?.story_lead && (
              <div className="border-l-[3px] border-orange-500 pl-5 py-3 bg-orange-500/[0.03] rounded-r-lg">
                <p className="text-lg md:text-xl font-serif italic text-stone-900 leading-relaxed">
                  {prediction.story_lead}
                </p>
              </div>
            )}

            {prediction && tiltData && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ The Matchup Factors</h3>
                <MatchupTilt data={tiltData} isPro={isPro} />
              </section>
            )}

            {(isPro ? (prediction?.narrative_pro ?? prediction?.narrative) : prediction?.narrative) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ The Read</h3>
                <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
                  {isPro && prediction?.narrative_pro && (
                    <div className="text-[9px] font-mono uppercase tracking-widest text-orange-500 mb-3 flex items-center gap-1.5">
                      <span>⊕</span><span>Pro Read</span>
                    </div>
                  )}
                  <p className="text-base md:text-lg font-serif text-stone-900 leading-[1.8] whitespace-pre-line">
                    {isPro ? (prediction?.narrative_pro ?? prediction?.narrative) : prediction?.narrative}
                  </p>
                </div>
              </section>
            )}

            {(prediction?.away_stories || prediction?.home_stories) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Know Before First Pitch</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {prediction?.away_stories && (
                    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
                        <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-6 h-6 object-contain" />
                        <span className="text-xs font-mono uppercase tracking-widest text-stone-500 font-bold">
                          {shortName(game.teams.away.team.name)}
                        </span>
                        {awayForm && (
                          <span className={`ml-auto text-xs font-mono font-bold ${awayForm.streak_type === 'W' ? 'text-green-600' : awayForm.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                            {awayForm.streak}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-stone-50">
                        {prediction.away_stories.map((story: { stat: string; text: string }, i: number) => (
                          <div key={i} className="px-5 py-3 flex gap-3 items-start">
                            <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded shrink-0 mt-0.5">{story.stat}</span>
                            <span className="text-sm font-serif text-stone-700 leading-snug">{story.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {prediction?.home_stories && (
                    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
                        <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-6 h-6 object-contain" />
                        <span className="text-xs font-mono uppercase tracking-widest text-stone-500 font-bold">
                          {shortName(game.teams.home.team.name)}
                        </span>
                        {homeForm && (
                          <span className={`ml-auto text-xs font-mono font-bold ${homeForm.streak_type === 'W' ? 'text-green-600' : homeForm.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                            {homeForm.streak}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-stone-50">
                        {prediction.home_stories.map((story: { stat: string; text: string }, i: number) => (
                          <div key={i} className="px-5 py-3 flex gap-3 items-start">
                            <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded shrink-0 mt-0.5">{story.stat}</span>
                            <span className="text-sm font-serif text-stone-700 leading-snug">{story.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {prediction?.contrarian && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-red-500 font-bold mb-4">§ The Contrarian Angle</h3>
                <Contrarian text={prediction.contrarian} />
              </section>
            )}

            <section>
              <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Game Intel</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {!venue?.indoor && weather ? (
                  <div className="md:col-span-2 p-5 bg-white border border-stone-200 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <WeatherIcon conditions={weather.conditions} className="w-10 h-10 text-stone-400 shrink-0" />
                      <div>
                        <div className="font-serif text-lg font-semibold text-stone-900">{weather.temp_f}°F · {weather.conditions}</div>
                        <div className="text-xs font-mono text-stone-500 flex items-center gap-2 mt-0.5">
                          {weather.wind_mph > 0 && (
                            <><WindArrow direction={weather.wind_direction} className="w-3.5 h-3.5" /><span>{weather.wind_mph} mph</span></>
                          )}
                          {(() => {
                            const impact = describeWindImpact(game.venue?.name ?? '', weather.wind_direction, weather.wind_mph)
                            return impact ? <span className="text-orange-600 font-bold ml-1">· {impact}</span> : null
                          })()}
                        </div>
                      </div>
                    </div>
                    {weather.precipitation_chance != null && (
                      <div className="text-right shrink-0">
                        <div className={`text-3xl font-bold font-mono leading-none ${weather.precipitation_chance > 30 ? 'text-red-500' : 'text-green-500'}`}>
                          {weather.precipitation_chance}%
                        </div>
                        <div className="text-[9px] font-mono text-stone-400 uppercase tracking-widest mt-1">Precip</div>
                      </div>
                    )}
                  </div>
                ) : venue?.indoor ? (
                  <div className="md:col-span-2 p-5 bg-white border border-stone-200 rounded-xl flex items-center gap-4">
                    <span className="text-2xl">🏟️</span>
                    <div>
                      <div className="font-serif font-semibold text-stone-900">Retractable Roof / Dome</div>
                      <div className="text-xs font-mono text-stone-500">No weather impact tonight</div>
                    </div>
                  </div>
                ) : null}

                <div className="p-5 bg-white border border-stone-200 rounded-xl">
                  <div className="text-[9px] font-mono text-stone-400 uppercase tracking-widest mb-3">Park Factor</div>
                  <div className="font-serif text-lg font-semibold text-stone-900 mb-1">{game.venue?.name}</div>
                  <div className="flex items-center gap-4 mt-2">
                    {prediction?.components_raw?.park?.hr_factor != null && (
                      <div>
                        <div className="text-xl font-bold font-mono text-stone-900">{prediction.components_raw.park.hr_factor.toFixed(2)}</div>
                        <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">HR Factor</div>
                      </div>
                    )}
                    {prediction?.components_raw?.park?.run_factor != null && (
                      <div>
                        <div className="text-xl font-bold font-mono text-stone-900">{prediction.components_raw.park.run_factor.toFixed(2)}</div>
                        <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">Run Factor</div>
                      </div>
                    )}
                  </div>
                  {prediction?.components_raw?.park?.hr_factor != null && (
                    <div className={`text-[10px] font-mono font-bold mt-2 ${prediction.components_raw.park.hr_factor > 1.05 ? 'text-red-500' : prediction.components_raw.park.hr_factor < 0.95 ? 'text-blue-500' : 'text-stone-400'}`}>
                      {prediction.components_raw.park.hr_factor > 1.05 ? 'Hitter-friendly park' : prediction.components_raw.park.hr_factor < 0.95 ? 'Pitcher-friendly park' : 'Neutral park'}
                    </div>
                  )}
                </div>

                <div className="p-5 bg-white border border-stone-200 rounded-xl">
                  <div className="text-[9px] font-mono text-stone-400 uppercase tracking-widest mb-3">Game Details</div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-stone-400">First Pitch</span>
                      <span className="text-sm font-mono font-bold text-stone-900">{gameTimeFormatted}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-stone-400">Venue</span>
                      <span className="text-sm font-mono font-bold text-stone-900">{game.venue?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-stone-400">Roof</span>
                      <span className="text-sm font-mono font-bold text-stone-900">{venue?.indoor ? 'Dome / Closed' : 'Open Air'}</span>
                    </div>
                    {prediction?.lineups_confirmed != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-mono text-stone-400">Lineups</span>
                        <span className={`text-sm font-mono font-bold ${prediction.lineups_confirmed ? 'text-green-500' : 'text-stone-400'}`}>
                          {prediction.lineups_confirmed ? '✓ Confirmed' : 'Projected'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        }

        slotTeams={
          <div className="space-y-10">
            {(awayForm || homeForm) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Recent Form</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { team: game.teams.away.team, form: awayForm, logo: teamLogoUrl(game.teams.away.team.id) },
                    { team: game.teams.home.team, form: homeForm, logo: teamLogoUrl(game.teams.home.team.id) },
                  ].map(({ team, form, logo }) => form && (
                    <div key={team.name} className="p-5 bg-white border border-stone-200 rounded-xl">
                      <div className="flex items-center gap-3 mb-4">
                        <img src={logo} alt={team.name} className="w-10 h-10 object-contain" />
                        <div>
                          <div className="font-serif text-lg font-semibold text-stone-900">{shortName(team.name)}</div>
                          <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">{team.abbreviation}</div>
                        </div>
                        <span className={`ml-auto text-lg font-bold font-mono ${form.streak_type === 'W' ? 'text-green-600' : form.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                          {form.streak}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Fraunces', sans-serif" }}>
                            {form.last_10_wins}-{form.last_10_losses}
                          </div>
                          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">L10</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Fraunces', sans-serif" }}>
                            {form.runs_per_game_l10?.toFixed(1) ?? '–'}
                          </div>
                          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">R/G</div>
                        </div>
                        <div>
                          <div className={`text-3xl font-bold leading-none ${(form.run_diff_l10 ?? 0) > 0 ? 'text-green-600' : (form.run_diff_l10 ?? 0) < 0 ? 'text-red-500' : 'text-stone-400'}`} style={{ fontFamily: "'Fraunces', sans-serif" }}>
                            {(form.run_diff_l10 ?? 0) > 0 ? '+' : ''}{form.run_diff_l10?.toFixed(1) ?? '–'}
                          </div>
                          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">Run Diff</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(game.teams.away.probablePitcher || game.teams.home.probablePitcher) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Starting Pitcher Matchup</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {game.teams.away.probablePitcher ? (
                    <div className="p-5 bg-white border border-stone-200 rounded-xl">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{shortName(game.teams.away.team.name)} · Away</div>
                      <div className="flex items-center gap-4 mb-4">
                        <img src={playerHeadshotUrl(game.teams.away.probablePitcher.id)} alt={game.teams.away.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover border-2 border-stone-200" />
                        <div>
                          <div className="font-serif text-xl font-semibold text-stone-900">{game.teams.away.probablePitcher.fullName}</div>
                          <div className="text-xs font-mono text-stone-500 mt-0.5">{awaySeasonStats?.wins ?? '–'}–{awaySeasonStats?.losses ?? '–'} · {awaySeasonStats?.innings ?? '–'} IP</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: 'ERA', value: awaySeasonStats?.era ?? '–' },
                          { label: 'WHIP', value: awaySeasonStats?.whip ?? '–' },
                          { label: 'K/9', value: awaySeasonStats?.k_per_9 ?? '–' },
                          { label: 'BB/9', value: awaySeasonStats?.bb_per_9 ?? '–' },
                        ].map(s => (
                          <div key={s.label} className="flex justify-between items-center py-1 border-b border-stone-50 last:border-0">
                            <span className="text-xs font-mono text-stone-400">{s.label}</span>
                            <span className="text-sm font-mono font-bold text-stone-900">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center text-stone-400 text-sm italic font-serif">Pitcher TBD</div>
                  )}

                  {game.teams.home.probablePitcher ? (
                    <div className="p-5 bg-white border border-stone-200 rounded-xl">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{shortName(game.teams.home.team.name)} · Home</div>
                      <div className="flex items-center gap-4 mb-4">
                        <img src={playerHeadshotUrl(game.teams.home.probablePitcher.id)} alt={game.teams.home.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover border-2 border-stone-200" />
                        <div>
                          <div className="font-serif text-xl font-semibold text-stone-900">{game.teams.home.probablePitcher.fullName}</div>
                          <div className="text-xs font-mono text-stone-500 mt-0.5">{homeSeasonStats?.wins ?? '–'}–{homeSeasonStats?.losses ?? '–'} · {homeSeasonStats?.innings ?? '–'} IP</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: 'ERA', value: homeSeasonStats?.era ?? '–' },
                          { label: 'WHIP', value: homeSeasonStats?.whip ?? '–' },
                          { label: 'K/9', value: homeSeasonStats?.k_per_9 ?? '–' },
                          { label: 'BB/9', value: homeSeasonStats?.bb_per_9 ?? '–' },
                        ].map(s => (
                          <div key={s.label} className="flex justify-between items-center py-1 border-b border-stone-50 last:border-0">
                            <span className="text-xs font-mono text-stone-400">{s.label}</span>
                            <span className="text-sm font-mono font-bold text-stone-900">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center text-stone-400 text-sm italic font-serif">Pitcher TBD</div>
                  )}
                </div>
              </section>
            )}

            {(awayLineup || homeLineup) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
                  § {prediction?.lineups_confirmed ? 'Confirmed' : 'Projected'} Lineups
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {awayLineup ? <LineupCard lineup={awayLineup} teamName={game.teams.away.team.name} teamShort={shortName(game.teams.away.team.name)} teamAbbr={game.teams.away.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.away.team.id)} /> : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>}
                  {homeLineup ? <LineupCard lineup={homeLineup} teamName={game.teams.home.team.name} teamShort={shortName(game.teams.home.team.name)} teamAbbr={game.teams.home.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.home.team.id)} /> : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>}
                </div>
              </section>
            )}
          </div>
        }

       slotPitching={
      !isPro ? (
        <ProLockOverlay
          tabName="Pitching Lab"
          description="Arsenal grades, two-strike profiles, times-through-the-order breakdown, first-pitch tendencies, and hot zones — the full scouting brief."
        />
      ) : (
        <PitchingLabContent
          awayPitcherName={game.teams.away.probablePitcher?.fullName ?? null}
          homePitcherName={game.teams.home.probablePitcher?.fullName ?? null}
          awayPitcherId={game.teams.away.probablePitcher?.id ?? null}
          homePitcherId={game.teams.home.probablePitcher?.id ?? null}
          awayPitchMix={awayPitchMix as any}
          homePitchMix={homePitchMix as any}
          awayPitcherStats={awayPitcherStats}
homePitcherStats={homePitcherStats}
          awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
          homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
          hotZoneSlot={
            <div className="grid md:grid-cols-2 gap-4">
              {game.teams.away.probablePitcher && Object.keys(awayPitcherHotZones).length > 0 && (
                <HotZone mode="pitcher" data={awayPitcherHotZones} isPro={isPro} playerName={game.teams.away.probablePitcher.fullName} />
              )}
              {game.teams.home.probablePitcher && Object.keys(homePitcherHotZones).length > 0 && (
                <HotZone mode="pitcher" data={homePitcherHotZones} isPro={isPro} playerName={game.teams.home.probablePitcher.fullName} />
              )}
              {awayFeatureBatter && Object.keys(awayBatterHotZones).length > 0 && (
                <HotZone mode="batter" data={awayBatterHotZones} isPro={isPro} playerName={awayFeatureBatter.player_name} />
              )}
              {homeFeatureBatter && Object.keys(homeBatterHotZones).length > 0 && (
                <HotZone mode="batter" data={homeBatterHotZones} isPro={isPro} playerName={homeFeatureBatter.player_name} />
              )}
            </div>
          }
        />
      )
    }
slotBatting={
  <BattingTabContent
    awayTeamName={game.teams.away.team.name}
    homeTeamName={game.teams.home.team.name}
    awayTeamId={game.teams.away.team.id}
    homeTeamId={game.teams.home.team.id}
    awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
    homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
    awayBatters={awayLineup?.batters ?? []}
    homeBatters={homeLineup?.batters ?? []}
    awayPitcherId={game.teams.away.probablePitcher?.id ?? null}  // ← add
    homePitcherId={game.teams.home.probablePitcher?.id ?? null}  // ← add
    isPro={isPro}
    lineupsConfirmed={prediction?.lineups_confirmed ?? false}
  />
}
slotGmlab={
      !isPro ? (
        <ProLockOverlay
          tabName="GM Lab"
          description="IL board, roster moves, bullpen decision tree, and starter intelligence — the full pre-game briefing."
        />
      ) : (
        <div className="space-y-10">

          {/* Series Context — top of GM Lab */}
          {seriesContext && (
            <section>
              <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Series Context</h3>
              <SeriesContext
                seriesGameNumber={seriesContext.series_game_number}
                seriesTotalGames={seriesContext.series_total_games}
                awayTeamName={game.teams.away.team.name}
                homeTeamName={game.teams.home.team.name}
                awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
                homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
                awaySeriesWins={seriesContext.away_series_wins}
                homeSeriesWins={seriesContext.home_series_wins}
                seriesLeader={seriesContext.series_leader}
                seriesDescription={seriesContext.series_description}
                lastWinner={seriesContext.last_winner}
                lastGameMargin={seriesContext.last_game_margin}
                isSeriesDecider={seriesContext.is_series_decider}
                awayFacesElimination={seriesContext.away_faces_elimination}
                homeFacesElimination={seriesContext.home_faces_elimination}
                seriesOpenerDate={seriesContext.series_opener_date}
                awayPrimaryColor={findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A'}
                homePrimaryColor={findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'}
              />
            </section>
          )}

          {/* Main GM Lab briefing */}
          <GmLabContent
            awayTeamName={game.teams.away.team.name}
            homeTeamName={game.teams.home.team.name}
            awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
            homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
            awayTeamId={game.teams.away.team.id}
            homeTeamId={game.teams.home.team.id}
            awayPrimaryColor={findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A'}
            homePrimaryColor={findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'}
            awayPitcherName={game.teams.away.probablePitcher?.fullName ?? null}
            homePitcherName={game.teams.home.probablePitcher?.fullName ?? null}
            awayPitcherId={game.teams.away.probablePitcher?.id ?? null}
            homePitcherId={game.teams.home.probablePitcher?.id ?? null}
            awayPitcherStats={prediction?.components_raw?.away_pitcher ?? null}
            homePitcherStats={prediction?.components_raw?.home_pitcher ?? null}
            awayTeamData={prediction?.components_raw?.away_team ?? null}
            homeTeamData={prediction?.components_raw?.home_team ?? null}
            awayTransactions={awayTransactions}
            homeTransactions={homeTransactions}
            isPro={isPro}
          />

        </div>
      )
    }

      slotFantasy={
  <FantasyTabContent
    fantasyCards={prediction?.fantasy_cards ?? null}
    homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
    awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
    homeBullpen={{
      era: prediction?.components_raw?.home_team?.bullpen_era ?? null,
      ip_yesterday: prediction?.components_raw?.home_team?.bullpen_innings_yesterday ?? null,
      closer_available: prediction?.components_raw?.home_team?.closer_available ?? null,
      ip_last_3: prediction?.components_raw?.home_team?.bullpen_ip_last_3 ?? null,
      k_per_9: prediction?.components_raw?.home_team?.bullpen_k_per_9 ?? null,
    }}
    awayBullpen={{
      era: prediction?.components_raw?.away_team?.bullpen_era ?? null,
      ip_yesterday: prediction?.components_raw?.away_team?.bullpen_innings_yesterday ?? null,
      closer_available: prediction?.components_raw?.away_team?.closer_available ?? null,
      ip_last_3: prediction?.components_raw?.away_team?.bullpen_ip_last_3 ?? null,
      k_per_9: prediction?.components_raw?.away_team?.bullpen_k_per_9 ?? null,
    }}
    awayPitcherStats={awayPitcherStats}
    homePitcherStats={homePitcherStats}
    park={{
      hr_factor: prediction?.components_raw?.park?.hr_factor ?? null,
      run_factor: prediction?.components_raw?.park?.run_factor ?? null,
      is_dome: prediction?.components_raw?.park?.is_dome ?? false,
    }}
weather={weather ? {
  temp_f: weather.temp_f,
  wind_mph: weather.wind_mph,
  wind_dir: weather.wind_direction_text,
} : null}
    venueName={game.venue?.name ?? null}
    isPro={isPro}
  />
}
      />
    </>
  )
}