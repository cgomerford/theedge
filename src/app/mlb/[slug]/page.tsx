import {
  getScheduleForDate, slugifyGame, shortName, getPitcherRecentStarts, getPitcherSeasonStats, getGameWeather,
  pitchColor, getTeamForm, describeTeamForm, teamLogoUrl, playerHeadshotUrl, getPitchMix, type MLBGame
} from '@/lib/mlb'
import { getVenueInfo, describeWindImpact } from '@/lib/venues'
import WeatherIcon from '@/components/WeatherIcon'
import WindArrow from '@/components/WindArrow'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SeriesTrajectory from '@/components/SeriesTrajectory'
import { getSeriesGames } from '@/lib/series-games'
import type { SeriesGameResult } from '@/lib/series-games'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import { getEdgePrediction } from '@/lib/edge-fetch'
import LineupCard from '@/components/LineupCard'
import { getProjectedLineup } from '@/lib/lineups'
import Contrarian from '@/components/Contrarian'
import { findTeamByName } from '@/lib/teams'
import { getBatterHotZones, getPitcherHotZones } from '@/lib/hot-zones'
import { getPitcherZoneArsenal, getMostDangerousBat, type PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import TaleOfTheTape, { type PitcherOption, type BatterOption } from '@/components/TaleOfTheTape'
import type { BullpenData } from '@/components/BullpenPanel'
import { getCurrentSubscriber } from '@/lib/auth'
import GamePageShell from '@/components/GamePageShell'
import { buildMatchupTiltData } from '@/lib/matchup-tilt'
import type { ComponentsRaw, ComponentScores } from '@/lib/matchup-tilt'
import ScrollProgress from '@/components/ScrollProgress'
import ProLockOverlay from '@/components/ProLockOverlay'
import { getInlineCalibration } from '@/lib/track-record'
import { getSeriesContext } from '@/lib/series-context'
import { getTeamTransactions } from '@/lib/team-transactions'
import PitchingLabContent from '@/components/PitchingLabContent'
import BullpenPanel from '@/components/BullpenPanel'
import { getBullpenData } from '@/lib/bullpen'
import EdgeIndicator from '@/components/EdgeIndicator'
import { scoreStreamer } from '@/lib/streamer'
import type { StreamerInput } from '@/lib/streamer'

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
  const isPro = subscriber?.is_pro ?? false
  const isSignedIn = subscriber !== null

  const { data: cached } = await supa.from('game_previews').select('*').eq('slug', slug).single()
  let game: MLBGame | null = null
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {
    // API failure — fall back to cache
  }

  if (!game && cached?.raw_data) {
    game = cached.raw_data as MLBGame
  }

  if (!game) notFound()

  await supa.from('game_previews').upsert({
    slug, league: 'mlb', game_date: dateMatch[1], home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name, home_team_id: game.teams.home.team.id,
    away_team_id: game.teams.away.team.id, game_time: game.gameDate, venue: game.venue?.name,
    status: game.status?.detailedState, raw_data: game,
  }, { onConflict: 'slug' })

  // ── Live score ───────────────────────────────────────────────────────────
  const gameState = game.status?.abstractGameState
  const isLive  = gameState === 'Live'
  const isFinal = gameState === 'Final'
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

 

  // ── Data fetching ────────────────────────────────────────────────────────
  const prediction = await getEdgePrediction(game.gamePk)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const venue = getVenueInfo(game.venue?.name)
  const gameDateApi = game.gameDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]

  const [
    awaySeasonStats, homeSeasonStats, weather,
    awayPitchMix, homePitchMix, awayForm, homeForm, awayLineup, homeLineup,
    awayPitcherStatsRes, homePitcherStatsRes,
  ] = await Promise.all([
    awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
    venue && !venue.indoor ? getGameWeather(venue.lat, venue.lon, game.gameDate) : Promise.resolve(null),
    awayPitcherId ? getPitchMix(awayPitcherId) : Promise.resolve([]),
    homePitcherId ? getPitchMix(homePitcherId) : Promise.resolve([]),
    getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
    awayPitcherId ? supa.from('pitcher_stats').select('*').eq('player_id', awayPitcherId).single() : Promise.resolve({ data: null }),
    homePitcherId ? supa.from('pitcher_stats').select('*').eq('player_id', homePitcherId).single() : Promise.resolve({ data: null }),
  ])

  const awayPitcherStats = awayPitcherStatsRes?.data || null
  const homePitcherStats = homePitcherStatsRes?.data || null

  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id,
    game.teams.away.team.id,
    dateMatch[1]
  )

  const awayLeadoff = awayLineup?.batters?.find(b => b.batting_order === 1) ?? null
  const homeLeadoff = homeLineup?.batters?.find(b => b.batting_order === 1) ?? null
  const [awayLeadoffZones, homeLeadoffZones] = await Promise.all([
    awayLeadoff ? getBatterHotZones(awayLeadoff.player_id) : Promise.resolve({}),
    homeLeadoff ? getBatterHotZones(homeLeadoff.player_id) : Promise.resolve({}),
  ])

  function buildPitcherOptions(
    starter: { id: number; fullName: string } | undefined,
    starterHand: string | null | undefined,
    bullpen: BullpenData | null,
  ): PitcherOption[] {
    const opts: PitcherOption[] = []
    if (starter) {
      opts.push({ player_id: starter.id, name: starter.fullName, hand: (starterHand as 'L' | 'R' | null) ?? null, role: 'SP', isDefault: true })
    }
    for (const arm of bullpen?.arms ?? []) {
      if (arm.player_id === starter?.id) continue
      opts.push({ player_id: arm.player_id, name: arm.name, hand: arm.hand, role: arm.role, isDefault: false })
    }
    return opts
  }

  function buildBatterOptions(lineup: any[] | null | undefined): BatterOption[] {
    if (!lineup) return []
    return [...lineup]
      .sort((a, b) => a.batting_order - b.batting_order)
      .map(b => ({
        player_id: b.player_id,
        name: b.player_name,
        bat_side: (b.bat_side ?? null) as 'L' | 'R' | 'S' | null,
        battingOrder: b.batting_order,
        isDefault: b.batting_order === 1,
      }))
  }

  const [awayArsenal, homeArsenal] = await Promise.all([
    awayPitcherId ? getPitcherZoneArsenal(awayPitcherId) : Promise.resolve({} as Record<string, PitcherZoneArsenal>),
    homePitcherId ? getPitcherZoneArsenal(homePitcherId) : Promise.resolve({} as Record<string, PitcherZoneArsenal>),
  ])

  // ── Series trajectory ────────────────────────────────────────────────────
  const seriesContext = await getSeriesContext(game.gamePk)
 const seriesGames: SeriesGameResult[] = await getSeriesGames(
    game.teams.home.team.id,
    game.teams.away.team.id,
    dateMatch[1],
    game.gamePk,
  )

  function gameChipDate(officialDate: string, isTonight: boolean): string {
    if (isTonight) return 'Tonight'
    return new Date(officialDate + 'T12:00:00Z')
      .toLocaleDateString('en-US', { weekday: 'short' })
  }

  const gameDate = new Date(game.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  // ── SLOT: THE READ ───────────────────────────────────────────────────────
  const slotRead = (
    <div className="space-y-10">

      {/* Date / time / venue context line */}
      <div
        className="flex flex-wrap items-center justify-center gap-2 pb-2"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A8A29E' }}
        suppressHydrationWarning
      >
        <span>{gameDate}</span>
        <span style={{ color: '#FF5722' }}>·</span>
        <span>{gameTimeFormatted}</span>
        {game.venue?.name && (
          <>
            <span style={{ color: '#FF5722' }}>·</span>
            <span>{game.venue.name}</span>
          </>
        )}
      </div>

      {/* Story lead */}
      {prediction?.story_lead && (
        <div className="border-l-[3px] border-orange-500 pl-5 py-3 bg-orange-500/[0.03] rounded-r-lg">
          <p className="text-lg md:text-xl font-serif italic text-stone-900 leading-relaxed">
            {prediction.story_lead}
          </p>
        </div>
      )}

      {/* Edge Indicator */}
 {prediction && (
  <EdgeIndicator
    edge_score={prediction.edge_score}
    predicted_winner={prediction.predicted_winner}
    confidence_tier={prediction.confidence_tier}
    components={prediction.components}
    components_raw={prediction.components_raw}
    home_team={game.teams.home.team.name}
    away_team={game.teams.away.team.name}
    home_team_abbr={game.teams.home.team.abbreviation ?? undefined}
    away_team_abbr={game.teams.away.team.abbreviation ?? undefined}
    updated_at={prediction.updated_at}
    away_primary_color={findTeamByName(game.teams.away.team.name)?.primary_color ?? null}
    home_primary_color={findTeamByName(game.teams.home.team.name)?.primary_color ?? null}
    lineups_confirmed={prediction.lineups_confirmed}
    is_pro={isPro}
    llm_narrative={prediction.narrative}
    llm_narrative_pro={prediction.narrative_pro}
    pro_takeaways={prediction.pro_takeaways}
  />
)}

      {/* Contrarian angle */}
      {prediction?.contrarian && (
        <section>
          <h3
            className="text-xs font-mono uppercase tracking-widest font-bold mb-4"
            style={{ color: '#EF4444' }}
          >
            § The Contrarian Angle
          </h3>
          <Contrarian text={prediction.contrarian} />
        </section>
      )}

    </div>
  )

  // ── SLOT: LINEUPS ────────────────────────────────────────────────────────
  const slotLineups = (
    <div className="space-y-10">

      {/* Lineup cards */}
      {(awayLineup || homeLineup) && (
        <section>
          <h3
            className="text-xs font-mono uppercase tracking-widest font-bold mb-5"
            style={{ color: '#FF5722', fontFamily: "'JetBrains Mono', monospace" }}
          >
            § {prediction?.lineups_confirmed ? 'Confirmed' : 'Projected'} Lineups
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {awayLineup
              ? <LineupCard lineup={awayLineup} teamName={game.teams.away.team.name} teamShort={shortName(game.teams.away.team.name)} teamAbbr={game.teams.away.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.away.team.id)} />
              : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>
            }
            {homeLineup
              ? <LineupCard lineup={homeLineup} teamName={game.teams.home.team.name} teamShort={shortName(game.teams.home.team.name)} teamAbbr={game.teams.home.team.abbreviation} teamLogoUrl={teamLogoUrl(game.teams.home.team.id)} />
              : <div className="p-8 border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-400 text-sm italic font-serif rounded-xl">Not yet available</div>
            }
          </div>
        </section>
      )}

      {/* Recent form */}
      {(awayForm || homeForm) && (
        <section>
          <h3
            className="text-xs font-mono uppercase tracking-widest font-bold mb-5"
            style={{ color: '#FF5722', fontFamily: "'JetBrains Mono', monospace" }}
          >
            § Recent Form
          </h3>
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
                    <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Fraunces', serif" }}>
                      {form.last_10_wins}-{form.last_10_losses}
                    </div>
                    <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">L10</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold leading-none text-stone-900" style={{ fontFamily: "'Fraunces', serif" }}>
                      {form.runs_per_game_l10?.toFixed(1) ?? '–'}
                    </div>
                    <div className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-1">R/G</div>
                  </div>
                  <div>
                    <div
                      className={`text-3xl font-bold leading-none ${(form.run_diff_l10 ?? 0) > 0 ? 'text-green-600' : (form.run_diff_l10 ?? 0) < 0 ? 'text-red-500' : 'text-stone-400'}`}
                      style={{ fontFamily: "'Fraunces', serif" }}
                    >
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

    </div>
  )

  // ── SLOT: PITCHING (Pro) ─────────────────────────────────────────────────
  const slotPitching = !isPro ? (
    <ProLockOverlay
      tabName="Pitching Lab"
      description="Arsenal grades, two-strike profiles, times-through-the-order breakdown, first-pitch tendencies, and hot zones — the full scouting brief."
    />
  ) : (
    <div className="space-y-8">
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
      />
    </div>
  )

  // ── SLOT: TEAMS ──────────────────────────────────────────────────────────
  const slotTeams = (
    <div className="space-y-10">

      {/* Starting pitcher matchup */}
      {(game.teams.away.probablePitcher || game.teams.home.probablePitcher) && (
        <section>
          <h3
            className="text-xs font-mono uppercase tracking-widest font-bold mb-5"
            style={{ color: '#FF5722', fontFamily: "'JetBrains Mono', monospace" }}
          >
            § Starting Pitcher Matchup
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {game.teams.away.probablePitcher ? (
              <div className="p-5 bg-white border border-stone-200 rounded-xl">
                <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
                  {shortName(game.teams.away.team.name)} · Away
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <img src={playerHeadshotUrl(game.teams.away.probablePitcher.id)} alt={game.teams.away.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover border-2 border-stone-200" />
                  <div>
                    <div className="font-serif text-xl font-semibold text-stone-900">{game.teams.away.probablePitcher.fullName}</div>
                    <div className="text-xs font-mono text-stone-500 mt-0.5">{awaySeasonStats?.wins ?? '–'}–{awaySeasonStats?.losses ?? '–'} · {awaySeasonStats?.innings ?? '–'} IP</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'ERA',  value: awaySeasonStats?.era ?? '–' },
                    { label: 'WHIP', value: awaySeasonStats?.whip ?? '–' },
                    { label: 'K/9',  value: awaySeasonStats?.k_per_9 ?? '–' },
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
                <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">
                  {shortName(game.teams.home.team.name)} · Home
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <img src={playerHeadshotUrl(game.teams.home.probablePitcher.id)} alt={game.teams.home.probablePitcher.fullName} className="w-16 h-16 rounded-full object-cover border-2 border-stone-200" />
                  <div>
                    <div className="font-serif text-xl font-semibold text-stone-900">{game.teams.home.probablePitcher.fullName}</div>
                    <div className="text-xs font-mono text-stone-500 mt-0.5">{homeSeasonStats?.wins ?? '–'}–{homeSeasonStats?.losses ?? '–'} · {homeSeasonStats?.innings ?? '–'} IP</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'ERA',  value: homeSeasonStats?.era ?? '–' },
                    { label: 'WHIP', value: homeSeasonStats?.whip ?? '–' },
                    { label: 'K/9',  value: homeSeasonStats?.k_per_9 ?? '–' },
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


      {/* Game intel — weather + park + details */}
      <section>
        <h3
          className="text-xs font-mono uppercase tracking-widest font-bold mb-5"
          style={{ color: '#FF5722', fontFamily: "'JetBrains Mono', monospace" }}
        >
          § Game Intel
        </h3>
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
  )

  // ── RENDER ───────────────────────────────────────────────────────────────
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
       slotSeries={
          seriesGames.length >= 1 ? (
            <SeriesTrajectory
              awayAbbr={game.teams.away.team.abbreviation ?? 'AWY'}
              homeAbbr={game.teams.home.team.abbreviation ?? 'HME'}
           awaySeriesWins={seriesGames.filter(g => g.isFinal && g.awayScore !== null && g.homeScore !== null && g.awayScore > g.homeScore).length}
      homeSeriesWins={seriesGames.filter(g => g.isFinal && g.awayScore !== null && g.homeScore !== null && g.homeScore > g.awayScore).length}
      seriesGameNumber={seriesGames.findIndex(g => g.isTonight) + 1 || 1}
      seriesTotalGames={seriesGames.length}
              awayPrimaryColor={findTeamByName(game.teams.away.team.name)?.primary_color ?? '#1A1A1A'}
              homePrimaryColor={findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'}
              gameTimeDisplay={gameTimeFormatted}
              games={seriesGames.map(g => ({
                gameNumber: g.gameNumber,
                gamePk: g.gamePk,
                date: gameChipDate(g.officialDate, g.isTonight),
                awayAbbr: g.awayAbbr,
                homeAbbr: g.homeAbbr,
                awayScore: g.awayScore,
                homeScore: g.homeScore,
                isFinal: g.isFinal,
                isTonight: g.isTonight,
              }))}
            />
          ) : null
        }
     slotRead={slotRead}
        slotLineups={slotLineups}
        slotPitching={slotPitching}
        slotTeams={slotTeams}
      />
    </>
  )
}