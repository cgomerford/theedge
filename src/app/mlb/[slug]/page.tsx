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
export const revalidate = 1800

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  // Try to pull real team names from the slug for a better title
  // slug format: away-team-at-home-team-YYYY-MM-DD
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
    openGraph: {
      title,
      description,
      type: 'article',
      url: `https://edgereportdaily.com/mlb/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function GamePreview({ params }: Props) {
  const { slug } = await params
  const supa = createAdminClient()
  const subscriber = await getCurrentSubscriber()
  const isPro = subscriber?.is_pro ?? true // TEMP: default to true during development
  const isSignedIn = subscriber !== null
  
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
  const calibration = prediction?.confidence_tier
  ? await getInlineCalibration(prediction.confidence_tier)
  : null
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const venue = getVenueInfo(game.venue?.name)
  const gameDateApi = game.gameDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]

  // Swapped out black-box getPitchMix functions for explicit, direct Supabase selects
  const [
    awayRecentStarts, homeRecentStarts, awaySeasonStats, homeSeasonStats, weather,
   awayPitchMix, homePitchMix,  awayForm, homeForm, awayLineup, homeLineup, awayPitcherHotZones, homePitcherHotZones,
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
  const topStreamer = !awayStreamer ? homeStreamer : !homeStreamer ? awayStreamer : awayStreamer.streamerScore >= homeStreamer.streamerScore ? awayStreamer : homeStreamer

  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'

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

        // ── 1. THE READ TAB (free — the 5-minute read) ─────────────────
        // This is now the DEFAULT tab. MatchupTilt hero + narrative + contrarian + game intel.
     slotRead={
          <div className="space-y-10">
            {/* ── GAME HEADER ── */}
       {/* ── DATE / VENUE STRIP — logos live in the sticky header now ── */}
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
 {/* ── STORY LEAD — the hook ── */}
            {prediction?.story_lead && (
              <div className="border-l-[3px] border-orange-500 pl-5 py-3 bg-orange-500/[0.03] rounded-r-lg">
                <p className="text-lg md:text-xl font-serif italic text-stone-900 leading-relaxed">
                  {prediction.story_lead}
                </p>
              </div>
            )}
  
             {/* ── MATCHUP TILT — the data backing up the read ── */}
            {prediction && tiltData && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ The Matchup Factors</h3>
                <MatchupTilt data={tiltData} isPro={isPro} />
              </section>
            )}

{/* ── THE READ — main narrative (MOVED UP, before data) ── */}
   {(isPro ? (prediction?.narrative_pro ?? prediction?.narrative) : prediction?.narrative) && (
  <section>
    <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ The Read</h3>
    <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm">
      {isPro && prediction?.narrative_pro && (
        <div className="text-[9px] font-mono uppercase tracking-widest text-orange-500 mb-3 flex items-center gap-1.5">
          <span>⊕</span>
          <span>Pro Read</span>
        </div>
      )}
      <p className="text-base md:text-lg font-serif text-stone-900 leading-[1.8] whitespace-pre-line">
        {isPro ? (prediction?.narrative_pro ?? prediction?.narrative) : prediction?.narrative}
      </p>
    </div>
  </section>
)}
           
            

            {/* ── KNOW BEFORE FIRST PITCH — 3 stats per team ── */}
            {(prediction?.away_stories || prediction?.home_stories) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Know Before First Pitch</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Away team stories */}
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
                            <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded shrink-0 mt-0.5">
                              {story.stat}
                            </span>
                            <span className="text-sm font-serif text-stone-700 leading-snug">
                              {story.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Home team stories */}
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
                            <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded shrink-0 mt-0.5">
                              {story.stat}
                            </span>
                            <span className="text-sm font-serif text-stone-700 leading-snug">
                              {story.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

         
            {/* ── CONTRARIAN ANGLE ── */}
            {prediction?.contrarian && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-red-500 font-bold mb-4">§ The Contrarian Angle</h3>
                <Contrarian text={prediction.contrarian} />
              </section>
            )}

            {/* ── GAME INTEL GRID ── */}
            <section>
              <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Game Intel</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* Weather — full width */}
                {!venue?.indoor && weather ? (
                  <div className="md:col-span-2 p-5 bg-white border border-stone-200 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <WeatherIcon conditions={weather.conditions} className="w-10 h-10 text-stone-400 shrink-0" />
                      <div>
                        <div className="font-serif text-lg font-semibold text-stone-900">
                          {weather.temp_f}°F · {weather.conditions}
                        </div>
                        <div className="text-xs font-mono text-stone-500 flex items-center gap-2 mt-0.5">
                          {weather.wind_mph > 0 && (
                            <>
                              <WindArrow direction={weather.wind_direction} className="w-3.5 h-3.5" />
                              <span>{weather.wind_mph} mph</span>
                            </>
                          )}
                          {(() => {
                            const impact = describeWindImpact(game.venue?.name ?? '', weather.wind_direction, weather.wind_mph)
                            return impact ? (
                              <span className="text-orange-600 font-bold ml-1">· {impact}</span>
                            ) : null
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

                {/* Park Factor */}
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
                    <div className={`text-[10px] font-mono font-bold mt-2 ${
                      prediction.components_raw.park.hr_factor > 1.05 ? 'text-red-500'
                      : prediction.components_raw.park.hr_factor < 0.95 ? 'text-blue-500'
                      : 'text-stone-400'
                    }`}>
                      {prediction.components_raw.park.hr_factor > 1.05 ? 'Hitter-friendly park'
                        : prediction.components_raw.park.hr_factor < 0.95 ? 'Pitcher-friendly park'
                        : 'Neutral park'}
                    </div>
                  )}
                </div>

                {/* Game Details */}
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

              // ── 2. TEAMS TAB (free — form, lineups, SP matchup) ─────────────
        slotTeams={
          <div className="space-y-10">

            {/* ── RECENT FORM ── */}
            {(awayForm || homeForm) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Recent Form</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { team: game.teams.away.team, form: awayForm, logo: teamLogoUrl(game.teams.away.team.id) },
                    { team: game.teams.home.team, form: homeForm, logo: teamLogoUrl(game.teams.home.team.id) },
                  ].map(({ team, form, logo }) => form && (
                    <div key={team.name} className="p-5 bg-white border border-stone-200 rounded-xl">
                      {/* Team header — bigger logo */}
                      <div className="flex items-center gap-3 mb-4">
                        <img src={logo} alt={team.name} className="w-10 h-10 object-contain" />
                        <div>
                          <div className="font-serif text-lg font-semibold text-stone-900">{shortName(team.name)}</div>
                          <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">
                            {team.abbreviation}
                          </div>
                        </div>
                        {/* Streak badge */}
                        <span className={`ml-auto text-lg font-bold font-mono ${form.streak_type === 'W' ? 'text-green-600' : form.streak_type === 'L' ? 'text-red-500' : 'text-stone-400'}`}>
                          {form.streak}
                        </span>
                      </div>
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                            {form.last_10_wins}-{form.last_10_losses}
                          </div>
                          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">L10</div>
                        </div>
                        <div>
                          <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                            {form.runs_per_game_l10?.toFixed(1) ?? '–'}
                          </div>
                          <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">R/G</div>
                        </div>
                        <div>
                          <div className={`text-3xl font-bold leading-none ${(form.run_diff_l10 ?? 0) > 0 ? 'text-green-600' : (form.run_diff_l10 ?? 0) < 0 ? 'text-red-500' : 'text-stone-400'}`} style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
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

            {/* ── SP MATCHUP — 2 separate cards, one per team ── */}
            {(game.teams.away.probablePitcher || game.teams.home.probablePitcher) && (
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Starting Pitcher Matchup</h3>
                <div className="grid md:grid-cols-2 gap-4">

                  {/* Away SP */}
                  {game.teams.away.probablePitcher ? (
                    <div className="p-5 bg-white border border-stone-200 rounded-xl">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
                        {shortName(game.teams.away.team.name)} · Away
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <img
                          src={playerHeadshotUrl(game.teams.away.probablePitcher.id)}
                          alt={game.teams.away.probablePitcher.fullName}
                          className="w-16 h-16 rounded-full object-cover border-2 border-stone-200"
                        />
                        <div>
                          <div className="font-serif text-xl font-semibold text-stone-900">
                            {game.teams.away.probablePitcher.fullName}
                          </div>
                          <div className="text-xs font-mono text-stone-500 mt-0.5">
                            {awaySeasonStats?.wins ?? '–'}–{awaySeasonStats?.losses ?? '–'} · {awaySeasonStats?.innings ?? '–'} IP
                          </div>
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
                    <div className="p-8 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center text-stone-400 text-sm italic font-serif">
                      Pitcher TBD
                    </div>
                  )}

                  {/* Home SP */}
                  {game.teams.home.probablePitcher ? (
                    <div className="p-5 bg-white border border-stone-200 rounded-xl">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
                        {shortName(game.teams.home.team.name)} · Home
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <img
                          src={playerHeadshotUrl(game.teams.home.probablePitcher.id)}
                          alt={game.teams.home.probablePitcher.fullName}
                          className="w-16 h-16 rounded-full object-cover border-2 border-stone-200"
                        />
                        <div>
                          <div className="font-serif text-xl font-semibold text-stone-900">
                            {game.teams.home.probablePitcher.fullName}
                          </div>
                          <div className="text-xs font-mono text-stone-500 mt-0.5">
                            {homeSeasonStats?.wins ?? '–'}–{homeSeasonStats?.losses ?? '–'} · {homeSeasonStats?.innings ?? '–'} IP
                          </div>
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
                    <div className="p-8 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center text-stone-400 text-sm italic font-serif">
                      Pitcher TBD
                    </div>
                  )}

                </div>
              </section>
            )}

            {/* ── LINEUPS ── */}
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

        // ── 3. PITCHING TAB (Pro-locked) ────────────────────────────────
        // Free users see ProLockOverlay. Pro users see arsenal + hot zones.
      // ── 3. PITCHING TAB (Pro-locked) ────────────────────────────────
        slotPitching={
          !isPro ? (
            <ProLockOverlay
              tabName="Pitching Lab"
              description="Arsenal breakdowns, hot zone heatmaps, pitch effectiveness tables, and advanced pitcher profiles — see exactly what each starter brings tonight."
            />
          ) : (
            <div className="space-y-10">

              {/* ── ARSENAL + PITCH TABLE: AWAY SP ── */}
              {game.teams.away.probablePitcher && awayPitchMix.length > 0 && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4 font-bold">
                    § {game.teams.away.probablePitcher.fullName} — Arsenal
                  </h3>
                  <PitchArsenalChart arsenal={awayPitchMix as any} pitcherName={game.teams.away.probablePitcher.fullName} />

                  {/* Pitch breakdown table */}
                  <div className="mt-4 bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-stone-100">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Pitch-by-Pitch Breakdown</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-stone-100">
                            <th className="text-left px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Pitch</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Usage</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Velo</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Whiff%</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">BAA</th>
                            <th className="text-right px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Hard%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(awayPitchMix as any[]).filter((p: any) => p.percentage > 0).map((p: any, i: number) => (
                            <tr key={i} className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition">
                              <td className="px-4 py-2 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pitchColor(p.pitch_code ?? p.pitch_type) }} />
                                <span className="font-mono text-xs font-bold text-stone-900">{p.pitch_name}</span>
                              </td>
                              <td className="text-right px-3 py-2 font-mono text-xs text-stone-700">{p.percentage?.toFixed(1)}%</td>
                              <td className="text-right px-3 py-2 font-mono text-xs text-stone-700">{p.avg_velocity?.toFixed(1) ?? '–'}</td>
                              <td className={`text-right px-3 py-2 font-mono text-xs font-bold ${(p.whiff_percent ?? 0) >= 30 ? 'text-orange-600' : 'text-stone-700'}`}>
                                {p.whiff_percent?.toFixed(1) ?? '–'}%
                              </td>
                              <td className={`text-right px-3 py-2 font-mono text-xs font-bold ${(p.ba_against ?? 1) < 0.2 ? 'text-green-600' : (p.ba_against ?? 0) > 0.28 ? 'text-red-500' : 'text-stone-700'}`}>
                                {p.ba_against != null ? `.${Math.round(p.ba_against * 1000).toString().padStart(3, '0')}` : '–'}
                              </td>
                              <td className={`text-right px-4 py-2 font-mono text-xs ${(p.hard_hit_percent ?? 0) > 40 ? 'text-red-500 font-bold' : 'text-stone-700'}`}>
                                {p.hard_hit_percent?.toFixed(1) ?? '–'}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* ── ARSENAL + PITCH TABLE: HOME SP ── */}
              {game.teams.home.probablePitcher && homePitchMix.length > 0 && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4 font-bold">
                    § {game.teams.home.probablePitcher.fullName} — Arsenal
                  </h3>
                  <PitchArsenalChart arsenal={homePitchMix as any} pitcherName={game.teams.home.probablePitcher.fullName} />

                  {/* Pitch breakdown table */}
                  <div className="mt-4 bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-stone-100">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold">Pitch-by-Pitch Breakdown</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-stone-100">
                            <th className="text-left px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Pitch</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Usage</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Velo</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Whiff%</th>
                            <th className="text-right px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">BAA</th>
                            <th className="text-right px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-stone-400">Hard%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(homePitchMix as any[]).filter((p: any) => p.percentage > 0).map((p: any, i: number) => (
                            <tr key={i} className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition">
                              <td className="px-4 py-2 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pitchColor(p.pitch_code ?? p.pitch_type) }} />
                                <span className="font-mono text-xs font-bold text-stone-900">{p.pitch_name}</span>
                              </td>
                              <td className="text-right px-3 py-2 font-mono text-xs text-stone-700">{p.percentage?.toFixed(1)}%</td>
                              <td className="text-right px-3 py-2 font-mono text-xs text-stone-700">{p.avg_velocity?.toFixed(1) ?? '–'}</td>
                              <td className={`text-right px-3 py-2 font-mono text-xs font-bold ${(p.whiff_percent ?? 0) >= 30 ? 'text-orange-600' : 'text-stone-700'}`}>
                                {p.whiff_percent?.toFixed(1) ?? '–'}%
                              </td>
                              <td className={`text-right px-3 py-2 font-mono text-xs font-bold ${(p.ba_against ?? 1) < 0.2 ? 'text-green-600' : (p.ba_against ?? 0) > 0.28 ? 'text-red-500' : 'text-stone-700'}`}>
                                {p.ba_against != null ? `.${Math.round(p.ba_against * 1000).toString().padStart(3, '0')}` : '–'}
                              </td>
                              <td className={`text-right px-4 py-2 font-mono text-xs ${(p.hard_hit_percent ?? 0) > 40 ? 'text-red-500 font-bold' : 'text-stone-700'}`}>
                                {p.hard_hit_percent?.toFixed(1) ?? '–'}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* ── PITCHER ADVANCED PROFILES ── */}
              {(prediction?.components_raw?.away_pitcher || prediction?.components_raw?.home_pitcher) && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Advanced Profile</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { pitcher: game.teams.away.probablePitcher, stats: prediction?.components_raw?.away_pitcher, team: game.teams.away.team },
                      { pitcher: game.teams.home.probablePitcher, stats: prediction?.components_raw?.home_pitcher, team: game.teams.home.team },
                    ].map(({ pitcher, stats, team }) => pitcher && stats && (
                      <div key={pitcher.fullName} className="p-5 bg-white border border-stone-200 rounded-xl">
                        <div className="flex items-center gap-3 mb-4">
                          <img src={playerHeadshotUrl(pitcher.id)} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-stone-200" />
                          <div>
                            <div className="font-serif text-base font-semibold text-stone-900">{pitcher.fullName}</div>
                            <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">{shortName(team.name)}</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {[
                            { label: 'FIP', value: stats.fip != null ? stats.fip.toFixed(2) : null, good: stats.fip < 3.5 },
                            { label: 'xFIP', value: stats.xfip_minus != null ? stats.xfip_minus.toFixed(2) : null, good: false },
                            { label: 'GB Rate', value: stats.gb_rate != null ? `${stats.gb_rate}%` : null, good: stats.gb_rate > 45 },
                            { label: 'vs LHB', value: stats.vs_lhb_baa != null ? `.${Math.round(stats.vs_lhb_baa * 1000).toString().padStart(3, '0')}` : null, good: stats.vs_lhb_baa < 0.23 },
                            { label: 'vs RHB', value: stats.vs_rhb_baa != null ? `.${Math.round(stats.vs_rhb_baa * 1000).toString().padStart(3, '0')}` : null, good: stats.vs_rhb_baa < 0.23 },
                            { label: 'L3 ERA', value: stats.l3_era != null ? stats.l3_era.toFixed(2) : null, good: stats.l3_era < 3.0 },
                            { label: 'Home ERA', value: stats.home_era != null ? stats.home_era.toFixed(2) : null, good: stats.home_era < 3.5 },
                            { label: 'Away ERA', value: stats.away_era != null ? stats.away_era.toFixed(2) : null, good: stats.away_era < 3.5 },
                            { label: 'Days Rest', value: stats.days_rest != null ? `${stats.days_rest}` : null, good: stats.days_rest >= 4 },
                          ].filter(s => s.value != null).map(s => (
                            <div key={s.label} className="flex justify-between items-center py-1 border-b border-stone-50 last:border-0">
                              <span className="text-xs font-mono text-stone-400">{s.label}</span>
                              <span className={`text-sm font-mono font-bold ${s.good ? 'text-green-600' : 'text-stone-900'}`}>
                                {s.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── HOT ZONES ── */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Hot Zones</h3>
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
              </section>

              {/* Tunnelling — commented out until feature works */}
              {/* <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Pitch Tunnelling</h3>
                <div className="p-8 bg-white border border-stone-200 rounded-xl text-center">
                  <p className="text-sm text-stone-400 font-serif italic">Coming soon — tracking release points and movement profiles for deceptive pitch pairs.</p>
                </div>
              </section> */}
            </div>
          )
        }

        // ── 4. GM LAB TAB (Pro-locked) ──────────────────────────────────
        // Free users see ProLockOverlay. Pro users see the full ProDashboard.
        // ── 4. GM LAB TAB (Pro-locked) ──────────────────────────────────
        slotGmlab={
          !isPro ? (
            <ProLockOverlay
              tabName="GM Lab"
              description="Every number, side by side — all 8 components, team stats, bullpen status, and park conditions in one clean view."
            />
          ) : (
            <div className="space-y-10">

              {/* ── ALL 8 COMPONENTS ── */}
              {prediction?.components && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ All 8 Components</h3>
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2 bg-stone-50 border-b border-stone-100">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Factor</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-24 text-center">Tilt</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-8 text-right">{game.teams.away.team.abbreviation}</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-8 text-right">{game.teams.home.team.abbreviation}</span>
                    </div>
                    {([
                      { key: 'starting_pitcher', label: 'Starting Pitcher' },
                      { key: 'bullpen',           label: 'Bullpen' },
                      { key: 'offense',           label: 'Offense' },
                      { key: 'defense',           label: 'Defense' },
                      { key: 'matchup',           label: 'Matchup' },
                      { key: 'park',              label: 'Park Factor' },
                      { key: 'weather',           label: 'Weather' },
                      { key: 'rest',              label: 'Rest / Travel' },
                    ] as const).map(({ key, label }) => {
                      const raw = prediction.components as Record<string, number>
                      const val = raw[key] ?? 0
                      const abs = Math.abs(val)
                      const isAway = val > 5
                      const isHome = val < -5
                      const isNeutral = !isAway && !isHome
                      const pct = Math.min(abs / 50, 1) * 100
                      const awayColor = findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A'
                      const homeColor = findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'

                      return (
                        <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3 border-b border-stone-50 last:border-0">
                          <span className="text-sm font-serif text-stone-900">{label}</span>
                          <div className="w-24 flex items-center gap-1">
                            <div className="flex-1 h-1.5 bg-stone-100 rounded-full flex justify-end overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: isAway ? `${pct}%` : '0%', background: awayColor }} />
                            </div>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isNeutral ? '#D4D0C8' : isAway ? awayColor : homeColor }} />
                            <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: isHome ? `${pct}%` : '0%', background: homeColor }} />
                            </div>
                          </div>
                          <span className={`w-8 text-right font-mono text-xs font-bold ${isAway ? 'text-stone-900' : 'text-stone-300'}`}>
                            {isAway ? `+${abs}` : '–'}
                          </span>
                          <span className={`w-8 text-right font-mono text-xs font-bold ${isHome ? 'text-stone-900' : 'text-stone-300'}`}>
                            {isHome ? `+${abs}` : '–'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ── TEAM STATS COMPARISON ── */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Team Stats</h3>
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] px-5 py-3 bg-stone-50 border-b border-stone-100">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Stat</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-20 text-right">{shortName(game.teams.away.team.name)}</span>
                    <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-20 text-right">{shortName(game.teams.home.team.name)}</span>
                  </div>
                  {[
                    {
                      label: 'L10 Record',
                      away: awayForm ? `${awayForm.last_10_wins}-${awayForm.last_10_losses}` : '–',
                      home: homeForm ? `${homeForm.last_10_wins}-${homeForm.last_10_losses}` : '–',
                      awayBetter: (awayForm?.last_10_wins ?? 0) > (homeForm?.last_10_wins ?? 0),
                    },
                    {
                      label: 'Run Diff (L10)',
                      away: awayForm?.run_diff_l10 != null ? `${awayForm.run_diff_l10 > 0 ? '+' : ''}${awayForm.run_diff_l10.toFixed(1)}` : '–',
                      home: homeForm?.run_diff_l10 != null ? `${homeForm.run_diff_l10 > 0 ? '+' : ''}${homeForm.run_diff_l10.toFixed(1)}` : '–',
                      awayBetter: (awayForm?.run_diff_l10 ?? -99) > (homeForm?.run_diff_l10 ?? -99),
                    },
                    {
                      label: 'R/G (L10)',
                      away: awayForm?.runs_per_game_l10?.toFixed(1) ?? '–',
                      home: homeForm?.runs_per_game_l10?.toFixed(1) ?? '–',
                      awayBetter: (awayForm?.runs_per_game_l10 ?? 0) > (homeForm?.runs_per_game_l10 ?? 0),
                    },
                    {
                      label: 'Bullpen ERA',
                      away: prediction?.components_raw?.away_team?.bullpen_era?.toFixed(2) ?? '–',
                      home: prediction?.components_raw?.home_team?.bullpen_era?.toFixed(2) ?? '–',
                      awayBetter: (prediction?.components_raw?.away_team?.bullpen_era ?? 99) < (prediction?.components_raw?.home_team?.bullpen_era ?? 99),
                    },
                    {
                      label: 'Bullpen IP Yesterday',
                      away: prediction?.components_raw?.away_team?.bullpen_innings_yesterday?.toFixed(1) ?? '–',
                      home: prediction?.components_raw?.home_team?.bullpen_innings_yesterday?.toFixed(1) ?? '–',
                      awayBetter: (prediction?.components_raw?.away_team?.bullpen_innings_yesterday ?? 99) < (prediction?.components_raw?.home_team?.bullpen_innings_yesterday ?? 99),
                      note: 'lower = fresher',
                    },
                    {
                      label: 'Closer Available',
                      away: prediction?.components_raw?.away_team?.closer_available === false ? 'No ⚠️' : prediction?.components_raw?.away_team?.closer_available === true ? 'Yes' : '–',
                      home: prediction?.components_raw?.home_team?.closer_available === false ? 'No ⚠️' : prediction?.components_raw?.home_team?.closer_available === true ? 'Yes' : '–',
                      awayBetter: prediction?.components_raw?.away_team?.closer_available !== false,
                    },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-stone-50 last:border-0">
                      <div>
                        <span className="text-sm font-serif text-stone-900">{row.label}</span>
                        {row.note && <span className="text-[9px] font-mono text-stone-400 ml-2">({row.note})</span>}
                      </div>
                      <span className={`w-20 text-right font-mono text-xs font-bold ${row.awayBetter ? 'text-stone-900' : 'text-stone-400'}`}>{row.away}</span>
                      <span className={`w-20 text-right font-mono text-xs font-bold ${!row.awayBetter ? 'text-stone-900' : 'text-stone-400'}`}>{row.home}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── PITCHING DEEP DIVE ── */}
              {(prediction?.components_raw?.away_pitcher || prediction?.components_raw?.home_pitcher) && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Pitching Deep Dive</h3>
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto] px-5 py-3 bg-stone-50 border-b border-stone-100">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Stat</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-20 text-right">
                        {game.teams.away.probablePitcher?.fullName?.split(' ').pop() ?? game.teams.away.team.abbreviation}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-20 text-right">
                        {game.teams.home.probablePitcher?.fullName?.split(' ').pop() ?? game.teams.home.team.abbreviation}
                      </span>
                    </div>
                    {[
                      { label: 'ERA',       key: 'era',        lowerBetter: true,  dec: 2 },
                      { label: 'FIP',       key: 'fip',        lowerBetter: true,  dec: 2 },
                      { label: 'K/9',       key: 'k_per_9',    lowerBetter: false, dec: 1 },
                      { label: 'BB/9',      key: 'bb_per_9',   lowerBetter: true,  dec: 1 },
                      { label: 'GB Rate',   key: 'gb_rate',    lowerBetter: false, dec: 1, suffix: '%' },
                      { label: 'L3 ERA',    key: 'l3_era',     lowerBetter: true,  dec: 2 },
                      { label: 'vs LHB',   key: 'vs_lhb_baa', lowerBetter: true,  dec: 3, ba: true },
                      { label: 'vs RHB',   key: 'vs_rhb_baa', lowerBetter: true,  dec: 3, ba: true },
                      { label: 'Days Rest', key: 'days_rest',  lowerBetter: false, dec: 0 },
                    ].map((row, i) => {
                      const ap = prediction?.components_raw?.away_pitcher
                      const hp = prediction?.components_raw?.home_pitcher
                      const av = ap?.[row.key]
                      const hv = hp?.[row.key]
                      const awayBetter = av != null && hv != null
                        ? row.lowerBetter ? Number(av) < Number(hv) : Number(av) > Number(hv)
                        : false

                      const fmt = (v: any) => {
                        if (v == null) return '–'
                        const n = Number(v)
                        if (row.ba) return `.${Math.round(n * 1000).toString().padStart(3, '0')}`
                        return `${n.toFixed(row.dec)}${row.suffix ?? ''}`
                      }

                      return (
                        <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-3 border-b border-stone-50 last:border-0">
                          <span className="text-sm font-serif text-stone-900">{row.label}</span>
                          <span className={`w-20 text-right font-mono text-xs font-bold ${awayBetter ? 'text-stone-900' : 'text-stone-400'}`}>{fmt(av)}</span>
                          <span className={`w-20 text-right font-mono text-xs font-bold ${!awayBetter && av != null && hv != null ? 'text-stone-900' : 'text-stone-400'}`}>{fmt(hv)}</span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ── PARK + CONDITIONS ── */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">§ Park & Conditions</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-5 bg-white border border-stone-200 rounded-xl">
                    <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-3">Park Factors</div>
                    {[
                      { label: 'Venue',      value: game.venue?.name },
                      { label: 'HR Factor',  value: prediction?.components_raw?.park?.hr_factor?.toFixed(2) },
                      { label: 'Run Factor', value: prediction?.components_raw?.park?.run_factor?.toFixed(2) },
                      { label: 'Type',       value: venue?.indoor ? 'Dome / Closed' : 'Open Air' },
                    ].map((s, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-stone-50 last:border-0">
                        <span className="text-xs font-mono text-stone-400">{s.label}</span>
                        <span className="text-xs font-mono font-bold text-stone-900">{s.value ?? '–'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-5 bg-white border border-stone-200 rounded-xl">
                    <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mb-3">Conditions</div>
                    {(weather ? [
                      { label: 'Temperature', value: `${weather.temp_f}°F` },
                      { label: 'Conditions',  value: weather.conditions },
                      { label: 'Wind',        value: `${weather.wind_mph} mph` },
                      { label: 'Precip',      value: `${weather.precipitation_chance}%` },
                    ] : [
                      { label: 'Status', value: venue?.indoor ? 'Indoor — no impact' : 'No weather data' },
                    ]).map((s, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-stone-50 last:border-0">
                        <span className="text-xs font-mono text-stone-400">{s.label}</span>
                        <span className="text-xs font-mono font-bold text-stone-900">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

            </div>
          )
        }

        // ── 5. FANTASY TAB (Pro-locked) ─────────────────────────────────
        // Free users see ProLockOverlay. Pro users see streamer + DFS + takeaways.
        slotFantasy={
  <FantasyTabContent
    fantasyCards={prediction?.fantasy_cards ?? null}
    homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
    awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
    homeBullpen={{
      era: prediction?.components_raw?.home_team?.bullpen_era ?? null,
      ip_yesterday: prediction?.components_raw?.home_team?.bullpen_innings_yesterday ?? null,
      closer_available: prediction?.components_raw?.home_team?.closer_available ?? null,
    }}
    awayBullpen={{
      era: prediction?.components_raw?.away_team?.bullpen_era ?? null,
      ip_yesterday: prediction?.components_raw?.away_team?.bullpen_innings_yesterday ?? null,
      closer_available: prediction?.components_raw?.away_team?.closer_available ?? null,
    }}
    isPro={isPro}
  />
}
      />
    </>
  )
}
