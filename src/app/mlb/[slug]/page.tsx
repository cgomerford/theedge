import {
  getScheduleForDate, slugifyGame, shortName, getPitcherRecentStarts, getPitcherSeasonStats, getGameWeather,
  getPitchMix, pitchColor, getTeamForm, describeTeamForm, teamLogoUrl, playerHeadshotUrl, type MLBGame
} from '@/lib/mlb'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import WeatherIcon from '@/components/WeatherIcon'
import WindArrow from '@/components/WindArrow'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import PreviewSection from '@/components/PreviewSection'
import { generateGameline, calculateEdge } from '@/lib/narrative'
import LiveTicker from '@/components/LiveTicker'
import EdgeIndicator from '@/components/EdgeIndicator'
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

export const revalidate = 1800

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const title = slug.replace(/-game(\d+)$/, ' (Game $1)').replace(/(\d{4}-\d{2}-\d{2})/, '').replace(/-/g, ' ').trim()
  return { title: `${title} preview · The Edge`, description: `Pre-game data, lineups, and matchup analysis.` }
}

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? false
  
  const { data: cached } = await supa.from('game_previews').select('*').eq('slug', slug).single()
  let game: MLBGame | null = null

  if (cached?.raw_data) {
    game = cached.raw_data as MLBGame
  } else {
    const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
    if (!dateMatch) notFound()
    const games = await getScheduleForDate(dateMatch[1])
    game = games.find(g => slugifyGame(g) === slug) ?? null
    if (!game) notFound()

    await supa.from('game_previews').upsert({
      slug, league: 'mlb', game_date: dateMatch[1], home_team: game.teams.home.team.name,
      away_team: game.teams.away.team.name, home_team_id: game.teams.home.team.id,
      away_team_id: game.teams.away.team.id, game_time: game.gameDate, venue: game.venue?.name,
      status: game.status?.detailedState, raw_data: game,
    }, { onConflict: 'slug' })
  }

  const prediction = await getEdgePrediction(game.gamePk)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const venue = getVenueInfo(game.venue?.name)
  const gameDateApi = game.gameDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]

  // Added the two Supabase fetches to this Promise.all array
  const [
    awayRecentStarts, homeRecentStarts, awaySeasonStats, homeSeasonStats, weather,
    awayPitchMix, homePitchMix, awayForm, homeForm, awayLineup, homeLineup, awayPitcherHotZones, homePitcherHotZones,
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
  ])

  // Extract the raw database rows gracefully
  const awayPitcherStats = awayPitcherStatsRes?.data || null
  const homePitcherStats = homePitcherStatsRes?.data || null

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
    opponentStats: null, pitcherStats: awaySeasonStats, pitchMix: awayPitchMix, parkComponent, isPitcherHome: false,
    gameSlug: slug, gameTime: new Date(game.gameDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
  } : null

  const homeStreamerInput: StreamerInput | null = game.teams.home.probablePitcher && homeSeasonStats ? {
    pitcherName: game.teams.home.probablePitcher.fullName, pitcherId: game.teams.home.probablePitcher.id,
    teamName: shortName(game.teams.home.team.name), opponentName: shortName(game.teams.away.team.name),
    opponentStats: null, pitcherStats: homeSeasonStats, pitchMix: homePitchMix, parkComponent: -parkComponent,
    isPitcherHome: true, gameSlug: slug, gameTime: new Date(game.gameDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
  } : null

  const awayStreamer = awayStreamerInput ? scoreStreamer(awayStreamerInput) : null
  const homeStreamer = homeStreamerInput ? scoreStreamer(homeStreamerInput) : null
  const topStreamer = !awayStreamer ? homeStreamer : !homeStreamer ? awayStreamer : awayStreamer.streamerScore >= homeStreamer.streamerScore ? awayStreamer : homeStreamer

  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'

  // Updated builder to pass the new stats objects directly into the team meta objects
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
        gameTime={gameTimeFormatted}
        venue={game.venue?.name}
        isPro={isPro}

        // ── 1. TEAMS TAB ──────────────────────
        slotTeams={
          <div className="space-y-10">
            {/* Streamlined Game Header with Logos */}
            <div className="text-center pb-2">
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 mb-6">
                
                {/* Away Team */}
                <div className="flex items-center gap-4">
                  <img src={teamLogoUrl(game.teams.away.team.id)} alt={game.teams.away.team.name} className="w-12 h-12 md:w-16 md:h-16 object-contain" />
                  <h1 className="text-4xl md:text-6xl font-serif font-light leading-none tracking-tight text-stone-900">
                    {shortName(game.teams.away.team.name)} 
                  </h1>
                </div>

                <span className="text-stone-400 italic font-light text-2xl md:text-4xl">at</span> 
                
                {/* Home Team */}
                <div className="flex items-center gap-4">
                  <h1 className="text-4xl md:text-6xl font-serif font-light leading-none tracking-tight text-stone-900">
                    {shortName(game.teams.home.team.name)}
                  </h1>
                  <img src={teamLogoUrl(game.teams.home.team.id)} alt={game.teams.home.team.name} className="w-12 h-12 md:w-16 md:h-16 object-contain" />
                </div>

              </div>

              {/* Game Metadata */}
              <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono uppercase tracking-widest text-stone-500" suppressHydrationWarning>
                <span>{gameDate}</span>
                <span className="text-orange-500">/</span>
                <span>{gameTimeFormatted}</span>
                <span className="text-orange-500">/</span>
                <span>{game.venue?.name}</span>
              </div>
            </div>

            {/* Matchup Tilt */}
            {prediction && tiltData && (
              <MatchupTilt data={tiltData} isPro={isPro} />
            )}

            {/* Weather/Conditions */}
            {(weather || venue?.indoor) && (
              <section>
                <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm flex items-center justify-between">
                  {venue?.indoor ? (
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">🏟️</span>
                      <p className="font-serif text-stone-700">{game.venue?.name} is a dome — weather has no impact.</p>
                    </div>
                  ) : weather ? (
                    <div className="w-full flex items-center gap-6">
                      <WeatherIcon conditions={weather.conditions} className="w-10 h-10 text-stone-400 shrink-0" />
                      <div>
                        <div className="font-serif text-xl">{weather.conditions}</div>
                        <div className="text-sm font-mono text-stone-500">{weather.temp_f}°F · {weather.wind_mph} mph {weather.wind_direction}</div>
                      </div>
                      <div className="ml-auto hidden sm:block">
                        <WindArrow direction={weather.wind_direction} className="w-8 h-8 text-stone-400" />
                      </div>
                      {(() => {
                        const impact = describeWindImpact(game.venue?.name ?? '', weather.wind_direction, weather.wind_mph)
                        return impact ? (
                          <div className="ml-auto text-right">
                            <p className="text-xs font-mono uppercase tracking-wider text-orange-600 bg-orange-50 px-3 py-1.5 rounded-md inline-block">
                              {impact}
                            </p>
                          </div>
                        ) : null
                      })()}
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            {/* Form Guide */}
            {(awayForm || homeForm) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Team Form Guide</h3>
                <div className="grid md:grid-cols-2 gap-8 p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
                  {awayForm && (
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 mb-2">
                        <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="w-5 h-5 object-contain" />
                        {shortName(game.teams.away.team.name)}
                        {awayForm.streak && (
                          <span className={`ml-2 font-mono font-bold ${awayForm.streak_type === 'W' ? 'text-green-700' : awayForm.streak_type === 'L' ? 'text-red-700' : 'text-stone-600'}`}>
                            {awayForm.streak}
                          </span>
                        )}
                      </div>
                      <p className="font-serif text-lg leading-snug mb-4 text-stone-800">
                        {describeTeamForm(awayForm, shortName(game.teams.away.team.name))}
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-4xl font-display leading-none">{awayForm.last_10_wins}–{awayForm.last_10_losses}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">L10</div>
                        </div>
                        <div>
                          <div className="text-4xl font-display leading-none">{awayForm.runs_per_game_l10}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">Runs / G</div>
                        </div>
                        <div>
                          <div className={`text-4xl font-display leading-none ${awayForm.run_diff_l10 > 0 ? 'text-green-700' : awayForm.run_diff_l10 < 0 ? 'text-red-700' : ''}`}>
                            {awayForm.run_diff_l10 > 0 ? '+' : ''}{awayForm.run_diff_l10}
                          </div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">Run Diff</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {homeForm && (
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone-500 mb-2">
                        <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="w-5 h-5 object-contain" />
                        {shortName(game.teams.home.team.name)}
                        {homeForm.streak && (
                          <span className={`ml-2 font-mono font-bold ${homeForm.streak_type === 'W' ? 'text-green-700' : homeForm.streak_type === 'L' ? 'text-red-700' : 'text-stone-600'}`}>
                            {homeForm.streak}
                          </span>
                        )}
                      </div>
                      <p className="font-serif text-lg leading-snug mb-4 text-stone-800">
                        {describeTeamForm(homeForm, shortName(game.teams.home.team.name))}
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-4xl font-display leading-none">{homeForm.last_10_wins}–{homeForm.last_10_losses}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">L10</div>
                        </div>
                        <div>
                          <div className="text-4xl font-display leading-none">{homeForm.runs_per_game_l10}</div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">Runs / G</div>
                        </div>
                        <div>
                          <div className={`text-4xl font-display leading-none ${homeForm.run_diff_l10 > 0 ? 'text-green-700' : homeForm.run_diff_l10 < 0 ? 'text-red-700' : ''}`}>
                            {homeForm.run_diff_l10 > 0 ? '+' : ''}{homeForm.run_diff_l10}
                          </div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">Run Diff</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Projected Lineups */}
            {(awayLineup || homeLineup) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
                  § Projected Lineups{prediction?.lineups_confirmed ? ' · ✓ Confirmed' : ''}
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {awayLineup ? <LineupCard lineup={awayLineup} teamName={game.teams.away.team.name} teamShort={shortName(game.teams.away.team.name)} teamAbbr={game.teams.away.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.away.team.id)} /> : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>}
                  {homeLineup ? <LineupCard lineup={homeLineup} teamName={game.teams.home.team.name} teamShort={shortName(game.teams.home.team.name)} teamAbbr={game.teams.home.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.home.team.id)} /> : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>}
                </div>
              </section>
            )}
          </div>
        }

        // ── 2. PITCHING TAB ───────────────────────────
        slotPitching={
          <div className="space-y-10">
            {/* The Arms */}
            {(awayPitcherId || homePitcherId) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4 font-bold text-center">§ The Starting Arms</h3>
                <div className="grid md:grid-cols-2 gap-8 p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
                  {game.teams.away.probablePitcher && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">{shortName(game.teams.away.team.name)} · {awaySeasonStats?.wins ?? '–'}–{awaySeasonStats?.losses ?? '–'}</div>
                      <div className="flex items-center gap-4 mb-6">
                        <img src={playerHeadshotUrl(game.teams.away.probablePitcher.id, 200)} alt={game.teams.away.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover bg-stone-100" />
                        <h3 className="text-xl font-serif font-semibold">{game.teams.away.probablePitcher.fullName}</h3>
                      </div>
                      {awaySeasonStats && (
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-3xl font-display leading-none">{awaySeasonStats.era}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">ERA</div>
                          </div>
                          <div>
                            <div className="text-3xl font-display leading-none">{awaySeasonStats.whip}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">WHIP</div>
                          </div>
                          <div>
                            <div className="text-3xl font-display leading-none">{awaySeasonStats.k_per_9}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">K/9</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {game.teams.home.probablePitcher && (
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">{shortName(game.teams.home.team.name)} · {homeSeasonStats?.wins ?? '–'}–{homeSeasonStats?.losses ?? '–'}</div>
                      <div className="flex items-center gap-4 mb-6">
                        <img src={playerHeadshotUrl(game.teams.home.probablePitcher.id, 200)} alt={game.teams.home.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover bg-stone-100" />
                        <h3 className="text-xl font-serif font-semibold">{game.teams.home.probablePitcher.fullName}</h3>
                      </div>
                      {homeSeasonStats && (
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-3xl font-display leading-none">{homeSeasonStats.era}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">ERA</div>
                          </div>
                          <div>
                            <div className="text-3xl font-display leading-none">{homeSeasonStats.whip}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">WHIP</div>
                          </div>
                          <div>
                            <div className="text-3xl font-display leading-none">{homeSeasonStats.k_per_9}</div>
                            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mt-1">K/9</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Pitch Arsenal & Recent Starts */}
            {(awayPitchMix.length > 0 || homePitchMix.length > 0) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Pitch Arsenal & Recent Form</h3>
                {isPro ? (
                  <div className="grid md:grid-cols-2 gap-8 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
                    {game.teams.away.probablePitcher && awayPitchMix.length > 0 && (
                      <div>
                        <PitchArsenalChart arsenal={awayPitchMix as any} pitcherName={game.teams.away.probablePitcher.fullName} />
                        {awayRecentStarts.length > 0 && (
                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3 font-mono">Recent Starts</div>
                            <div className="space-y-2">
                              {awayRecentStarts.slice(0, 4).map((g, i) => (
                                <div key={i} className="flex justify-between text-xs font-mono text-stone-600 border-b border-stone-100 pb-1">
                                  <span>{g.date}</span><span>vs {g.opponent}</span><span>{g.ip} IP, {g.er} ER</span>
                                  <span className={g.result === 'W' ? 'text-green-700' : g.result === 'L' ? 'text-red-700' : 'text-stone-500'}>{g.result}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {game.teams.home.probablePitcher && homePitchMix.length > 0 && (
                      <div>
                        <PitchArsenalChart arsenal={homePitchMix as any} pitcherName={game.teams.home.probablePitcher.fullName} />
                        {homeRecentStarts.length > 0 && (
                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-widest text-stone-500 mb-3 font-mono">Recent Starts</div>
                            <div className="space-y-2">
                              {homeRecentStarts.slice(0, 4).map((g, i) => (
                                <div key={i} className="flex justify-between text-xs font-mono text-stone-600 border-b border-stone-100 pb-1">
                                  <span>{g.date}</span><span>vs {g.opponent}</span><span>{g.ip} IP, {g.er} ER</span>
                                  <span className={g.result === 'W' ? 'text-green-700' : g.result === 'L' ? 'text-red-700' : 'text-stone-500'}>{g.result}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-stone-200 rounded-xl bg-stone-50 p-6 flex justify-between items-center shadow-sm">
                    <div>
                      <div className="font-serif text-xl font-medium">Pitch Arsenal</div>
                      <p className="text-sm text-stone-500 mt-1 font-serif">Arsenal effectiveness charts, velocity data, whiff rates, and recent starts.</p>
                    </div>
                    <a href="/pricing" className="text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-4 py-2 hover:bg-orange-600 hover:text-white transition rounded">Pro →</a>
                  </div>
                )}
              </section>
            )}

            {/* Hot Zones */}
            <section>
              <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Matchup Hot Zones</h3>
              {isPro && (Object.keys(awayPitcherHotZones).length > 0 || Object.keys(homePitcherHotZones).length > 0) ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {game.teams.away.probablePitcher && Object.keys(awayPitcherHotZones).length > 0 && <HotZone mode="pitcher" data={awayPitcherHotZones} isPro={isPro} playerName={game.teams.away.probablePitcher.fullName} />}
                  {game.teams.home.probablePitcher && Object.keys(homePitcherHotZones).length > 0 && <HotZone mode="pitcher" data={homePitcherHotZones} isPro={isPro} playerName={game.teams.home.probablePitcher.fullName} />}
                  {awayFeatureBatter && Object.keys(awayBatterHotZones).length > 0 && <HotZone mode="batter" data={awayBatterHotZones} isPro={isPro} playerName={awayFeatureBatter.player_name} />}
                  {homeFeatureBatter && Object.keys(homeBatterHotZones).length > 0 && <HotZone mode="batter" data={homeBatterHotZones} isPro={isPro} playerName={homeFeatureBatter.player_name} />}
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl bg-stone-50 p-6 flex justify-between items-center shadow-sm">
                  <div>
                    <div className="font-serif text-xl font-medium">Hot Zones</div>
                    <p className="text-sm text-stone-500 mt-1 font-serif">3×3 heatmaps for pitchers and batters — xwOBA, splits, tap-to-explore.</p>
                  </div>
                  <a href="/pricing" className="text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-4 py-2 hover:bg-orange-600 hover:text-white transition rounded">Pro →</a>
                </div>
              )}
            </section>
          </div>
        }

        // ── 3. FANTASY TAB ───────────────────────────
        slotFantasy={
          <div className="space-y-10">
            {/* Streamer Pick */}
            {topStreamer && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Fantasy Streamer</h3>
                {isPro ? (
                  <StreamerPick result={topStreamer} isPro={isPro} />
                ) : (
                  <div className="border border-stone-200 rounded-xl bg-stone-50 p-6 flex justify-between items-center shadow-sm">
                    <div>
                      <div className="font-serif text-xl font-medium">Streamer Pick</div>
                      <p className="text-sm text-stone-500 mt-1 font-serif">Tonight's top fantasy streaming option — with the data behind it.</p>
                    </div>
                    <a href="/pricing" className="text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-4 py-2 hover:bg-orange-600 hover:text-white transition rounded">Pro →</a>
                  </div>
                )}
              </section>
            )}

            {/* Storylines */}
            {prediction?.home_stories && prediction?.away_stories && (
              <section>
                 <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ DFS & Betting Narratives</h3>
                <Storylines
                  homeTeam={game.teams.home.team.name} awayTeam={game.teams.away.team.name}
                  homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'} awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
                  homeColor={findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'}
                  awayColor={findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A'}
                  homeStories={prediction.home_stories} awayStories={prediction.away_stories}
                />
              </section>
            )}

            {/* Contrarian Angle */}
            {prediction?.contrarian && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ The Contrarian Angle</h3>
                <Contrarian text={prediction.contrarian} />
              </section>
            )}
            
            {/* Pro Takeaways (Sneak Peek) */}
            {isPro && prediction?.pro_takeaways && (
               <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Actionable Takeaways</h3>
                <ProTakeaways takeaways={prediction.pro_takeaways} homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'} awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'} isPro={isPro} />
              </section>
            )}
          </div>
        }

        // ── 4. PRO DASHBOARD TAB ───────────────────────────────────────
        slotDashboard={
          <ProDashboard
            homeTeam={game.teams.home.team.name}
            awayTeam={game.teams.away.team.name}
            homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
            awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
            edgeScore={prediction?.edge_score ?? 0}
            predictedWinner={prediction?.predicted_winner ?? 'home'}
            confidenceTier={prediction?.confidence_tier ?? 'tossup'}
            components={prediction?.components ?? {
              starting_pitcher: 0, bullpen: 0, offense: 0, defense: 0,
              matchup: 0, park: 0, weather: 0, rest: 0,
            }}
            narrative={prediction?.narrative_pro ?? prediction?.narrative}
            contrarian={prediction?.contrarian}
            awayPitcher={game.teams.away.probablePitcher && awaySeasonStats ? {
              name: game.teams.away.probablePitcher.fullName, era: awaySeasonStats.era, whip: awaySeasonStats.whip, k_per_9: awaySeasonStats.k_per_9, wins: awaySeasonStats.wins, losses: awaySeasonStats.losses, last_3_era: prediction?.components_raw?.away_pitcher?.last_3_era ?? null,
            } : null}
            homePitcher={game.teams.home.probablePitcher && homeSeasonStats ? {
              name: game.teams.home.probablePitcher.fullName, era: homeSeasonStats.era, whip: homeSeasonStats.whip, k_per_9: homeSeasonStats.k_per_9, wins: homeSeasonStats.wins, losses: homeSeasonStats.losses, last_3_era: prediction?.components_raw?.home_pitcher?.last_3_era ?? null,
            } : null}
            awayBullpen={{ era: prediction?.components_raw?.away_team?.bullpen_era ?? null, ip_yesterday: prediction?.components_raw?.away_team?.bullpen_innings_yesterday ?? null, closer_available: prediction?.components_raw?.away_team?.closer_available ?? null }}
            homeBullpen={{ era: prediction?.components_raw?.home_team?.bullpen_era ?? null, ip_yesterday: prediction?.components_raw?.home_team?.bullpen_innings_yesterday ?? null, closer_available: prediction?.components_raw?.home_team?.closer_available ?? null }}
            awayForm={awayForm ? { last_10_wins: awayForm.last_10_wins, last_10_losses: awayForm.last_10_losses, runs_per_game: awayForm.runs_per_game_l10, run_diff: awayForm.run_diff_l10, streak: awayForm.streak, streak_type: awayForm.streak_type ?? undefined } : null}
            homeForm={homeForm ? { last_10_wins: homeForm.last_10_wins, last_10_losses: homeForm.last_10_losses, runs_per_game: homeForm.runs_per_game_l10, run_diff: homeForm.run_diff_l10, streak: homeForm.streak, streak_type: homeForm.streak_type ?? undefined } : null}
            proTakeaways={prediction?.pro_takeaways}
            homeStories={prediction?.home_stories}
            awayStories={prediction?.away_stories}
            weather={weather ? { temp_f: weather.temp_f, wind_speed: weather.wind_mph, wind_direction: String(weather.wind_direction), conditions: weather.conditions, precip_chance: weather.precipitation_chance } : null}
            park={{ hr_factor: prediction?.components_raw?.park?.hr_factor, run_factor: prediction?.components_raw?.park?.run_factor, is_dome: prediction?.components_raw?.park?.is_dome ?? venue?.indoor, venue_name: prediction?.components_raw?.park?.venue_name ?? game.venue?.name }}
            streamerPick={topStreamer ? { playerName: topStreamer.pitcherName, stat: topStreamer.kPer9 ?? `Score: ${topStreamer.streamerScore}`, reason: topStreamer.rationale } : null}
            lineupSlot={
              <div className="grid md:grid-cols-2 gap-4">
                {awayLineup && <LineupCard lineup={awayLineup} teamName={game.teams.away.team.name} teamShort={shortName(game.teams.away.team.name)} teamAbbr={game.teams.away.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.away.team.id)} />}
                {homeLineup && <LineupCard lineup={homeLineup} teamName={game.teams.home.team.name} teamShort={shortName(game.teams.home.team.name)} teamAbbr={game.teams.home.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.home.team.id)} />}
              </div>
            }
            arsenalSlot={
              <div className="grid md:grid-cols-2 gap-8">
                {game.teams.away.probablePitcher && awayPitchMix.length > 0 && <PitchArsenalChart arsenal={awayPitchMix as any} pitcherName={game.teams.away.probablePitcher.fullName} />}
                {game.teams.home.probablePitcher && homePitchMix.length > 0 && <PitchArsenalChart arsenal={homePitchMix as any} pitcherName={game.teams.home.probablePitcher.fullName} />}
              </div>
            }
          />
        }
      />
    </>
  )
}