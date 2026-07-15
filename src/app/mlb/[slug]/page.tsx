import {
  getScheduleForDate, slugifyGame, teamLogoUrl, playerHeadshotUrl, getPitcherSeasonStats, getTeamForm, type MLBGame
} from '@/lib/mlb'
import { getDivisionStandings, getLeagueStandings } from '@/lib/standings'
import StandingsCard from '@/components/StandingsCard'
import RaceForOctober from '@/components/RaceForOctober'
import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import { getEdgePrediction } from '@/lib/edge-fetch'
import { findTeamByName } from '@/lib/teams'
import { getCurrentSubscriber } from '@/lib/auth'
import GamePageShell from '@/components/GamePageShell'
import ScrollProgress from '@/components/ScrollProgress'
import { buildStoryLeadSlide, LOCKED_SLIDES } from '@/lib/story-slides'
import { getProjectedLineup } from '@/lib/lineups'
import LineupCompare from '@/components/LineupCompare'
import TeamIntelExtras from '@/components/TeamIntelExtras'
import PitchingTab from '@/components/PitchingTab'
import { getPitcherStatsFull, getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { getTeamILList, getTeamTransactions } from '@/lib/team-transactions'
import { getAffiliateStandouts } from '@/lib/team-minors'
import { getHotColdStreaks } from '@/lib/hot-cold'
import HotColdStreaks from '@/components/HotColdStreaks'
import BullpenPanel from '@/components/BullpenPanel'
import { getBullpenData } from '@/lib/bullpen'
import EdgeIndicator from '@/components/EdgeIndicator'
import Contrarian from '@/components/Contrarian'
import SeriesTrajectory from '@/components/SeriesTrajectory'
import { getSeriesGames } from '@/lib/series-games'
import type { SeriesGameResult } from '@/lib/series-games'
import SeriesMomentum from '@/components/SeriesMomentum'
import SeriesCarousel from '@/components/SeriesCarousel'
import SeriesPredictions from '@/components/SeriesPredictions'
import SeriesPlayerStats from '@/components/SeriesPlayerStats'
import { getSeriesBattingStats } from '@/lib/series-stats'
import { getSeriesInningMomentum } from '@/lib/series-momentum'
export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

// ── Wireframe stub — every section not bolted on yet renders through this,
// so it's obvious at a glance what's real vs. placeholder, and swapping one
// out is a single find/replace rather than hunting through a large file. ──
function TrendsCard({
  awayAbbr, homeAbbr, awayForm, homeForm,
}: {
  awayAbbr: string
  homeAbbr: string
  awayForm: any
  homeForm: any
}) {
  if (!awayForm && !homeForm) {
    return <Stub label="Trends" note="Form data unavailable for this game." />
  }
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Trends</p>
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
    <div className="border border-dashed border-stone-300 rounded-xl p-8 text-center bg-stone-50/50">
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-1">{label}</p>
      {note && <p className="text-xs font-serif italic text-stone-400">{note}</p>}
    </div>
  )
}

const statBarRanges: Record<string, [number, number, boolean]> = {
  era: [1.5, 6.0, false],
  whip: [0.7, 1.6, false],
  k_per_9: [4, 13, true],
  bb_per_9: [1, 5, false],
}

function statBarPct(kind: keyof typeof statBarRanges, raw: string | number | null | undefined): number {
  const value = typeof raw === 'string' ? parseFloat(raw) : raw
  if (value == null || isNaN(value)) return 0
  const [lo, hi, higherIsBetter] = statBarRanges[kind]
  let pct = (value - lo) / (hi - lo)
  if (!higherIsBetter) pct = 1 - pct
  return Math.max(0, Math.min(100, Math.round(pct * 100)))
}

function PitcherStatBar({ label, value, pct, color }: { label: string; value: string | number; pct: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] font-mono text-stone-400 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full mx-2.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-bold text-stone-900 w-10 text-right shrink-0">{value}</span>
    </div>
  )
}

function PitcherCard({
  pitcher, stats, abbr, color, side,
}: {
  pitcher: { id: number; fullName: string } | undefined
  stats: any
  abbr: string
  color: string
  side: 'away' | 'home'
}) {
  if (!pitcher) {
    return <div className="p-8 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center text-stone-400 text-sm italic font-serif">Pitcher TBD</div>
  }
  return (
    <div className="p-5 bg-white border border-stone-200 rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <img src={playerHeadshotUrl(pitcher.id)} alt={pitcher.fullName} className="w-11 h-11 rounded-full object-cover border-2 border-stone-200" />
        <div>
          <div className="font-serif text-base font-semibold text-stone-900">{pitcher.fullName}</div>
          <div className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">{abbr} · {side}</div>
        </div>
      </div>
      <div className="space-y-0.5">
        <PitcherStatBar label="ERA" value={stats?.era ?? '–'} pct={statBarPct('era', stats?.era)} color={color} />
        <PitcherStatBar label="WHIP" value={stats?.whip ?? '–'} pct={statBarPct('whip', stats?.whip)} color={color} />
        <PitcherStatBar label="K/9" value={stats?.k_per_9 ?? '–'} pct={statBarPct('k_per_9', stats?.k_per_9)} color={color} />
        <PitcherStatBar label="BB/9" value={stats?.bb_per_9 ?? '–'} pct={statBarPct('bb_per_9', stats?.bb_per_9)} color={color} />
      </div>
    </div>
  )
}

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
  const description = `Pre-game analysis, Edge Score, and data-driven read for ${matchup}.`
  return {
    title, description,
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

  try {
    const freshGames = await getScheduleForDate(dateMatch[1])
    game = freshGames.find(g => slugifyGame(g) === slug) ?? null
  } catch {}

  if (!game && cached?.raw_data) game = cached.raw_data as MLBGame
  if (!game) notFound()

  await supa.from('game_previews').upsert({
    slug, league: 'mlb', game_date: dateMatch[1], home_team: game.teams.home.team.name,
    away_team: game.teams.away.team.name, home_team_id: game.teams.home.team.id,
    away_team_id: game.teams.away.team.id, game_time: game.gameDate, venue: game.venue?.name,
    status: game.status?.detailedState, raw_data: game,
  }, { onConflict: 'slug' })

  const gameState = game.status?.abstractGameState
  const isLive = gameState === 'Live'
  const isFinal = gameState === 'Final'
  const liveGame = game as any
  const liveScore = (isLive || isFinal) ? {
    awayRuns: liveGame.teams?.away?.score ?? 0,
    homeRuns: liveGame.teams?.home?.score ?? 0,
    isLive, isFinal,
  } : undefined

const prediction = await getEdgePrediction(game.gamePk)
  const awayPitcherId = game.teams.away.probablePitcher?.id
  const homePitcherId = game.teams.home.probablePitcher?.id
  const gameDateApi = game.gameDate?.split('T')[0] ?? dateMatch[1]

const [awayLineup, homeLineup] = await Promise.all([
    getProjectedLineup(game.teams.away.team.id, gameDateApi, game.gamePk),
    getProjectedLineup(game.teams.home.team.id, gameDateApi, game.gamePk),
  ])

  const [
    awayInjuries, homeInjuries,
    awayTransactions, homeTransactions,
    awayStandouts, homeStandouts,
  ] = await Promise.all([
    getTeamILList(game.teams.away.team.id),
    getTeamILList(game.teams.home.team.id),
    getTeamTransactions(game.teams.away.team.id),
    getTeamTransactions(game.teams.home.team.id),
  getAffiliateStandouts(game.teams.away.team.id, new Date().getFullYear()),
    getAffiliateStandouts(game.teams.home.team.id, new Date().getFullYear()),
  ])
  const awayCallups = awayTransactions.filter(t => t.category === 'CALLUP' || t.is_milb_move)
  const homeCallups = homeTransactions.filter(t => t.category === 'CALLUP' || t.is_milb_move)

const seasonYear = new Date().getFullYear()
  const [awayFullStats, homeFullStats, awayMovementDB, homeMovementDB] = await Promise.all([
    awayPitcherId ? getPitcherStatsFull(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherStatsFull(homePitcherId) : Promise.resolve(null),
    awayPitcherId ? getPitchMovementFromDB(awayPitcherId, seasonYear) : Promise.resolve([]),
    homePitcherId ? getPitchMovementFromDB(homePitcherId, seasonYear) : Promise.resolve([]),
  ])

// Call signature confirmed from the pre-rewrite page.tsx — getBullpenData
  // was fetched there but BullpenPanel was never actually rendered
  // (flagged as dead computation earlier this session). Wiring it in for
  // real now.
  const { home: homeBullpen, away: awayBullpen } = await getBullpenData(
    game.teams.home.team.id,
    game.teams.away.team.id,
    dateMatch[1],
  )

  const streakRows = await getHotColdStreaks(
    awayLineup?.batters ?? [],
    homeLineup?.batters ?? [],
    game.teams.away.team.abbreviation ?? 'AWAY',
    game.teams.home.team.abbreviation ?? 'HOME',
  )
const [awaySeasonStats, homeSeasonStats, awayForm, homeForm] = await Promise.all([
    awayPitcherId ? getPitcherSeasonStats(awayPitcherId) : Promise.resolve(null),
    homePitcherId ? getPitcherSeasonStats(homePitcherId) : Promise.resolve(null),
  getTeamForm(game.teams.away.team.id),
    getTeamForm(game.teams.home.team.id),
  ])

const seriesGames: SeriesGameResult[] = await getSeriesGames(
    game.teams.home.team.id,
    game.teams.away.team.id,
    dateMatch[1],
    game.gamePk,
  )

function gameChipDate(officialDate: string, isTonight: boolean): string {
    if (isTonight) return 'Tonight'
    return new Date(officialDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })
  }

  const seriesCarouselGames = seriesGames.map(g => ({
    gameNumber: g.gameNumber, gamePk: g.gamePk, date: gameChipDate(g.officialDate, g.isTonight),
    awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr, awayScore: g.awayScore, homeScore: g.homeScore,
    isFinal: g.isFinal, isTonight: g.isTonight,
  }))

const [seriesPredictionRows, awaySeriesStats, homeSeriesStats] = await Promise.all([
    Promise.all(seriesGames.map(async g => {
      const p = await getEdgePrediction(g.gamePk)
      // Assumes home/away stays the same team throughout the series (true
      // for a standard single-park series) — reusing slugifyGame exactly
      // as-is rather than a second slug implementation.
      const gameSlug = slugifyGame({
        gamePk: g.gamePk,
        gameDate: g.officialDate,
        officialDate: g.officialDate,
        status: { detailedState: '', abstractGameState: '' },
        teams: {
          away: { team: { id: 0, name: game.teams.away.team.name } },
          home: { team: { id: 0, name: game.teams.home.team.name } },
        },
        venue: { name: '' },
      })
      return {
        gameNumber: g.gameNumber, awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
        awayScore: g.awayScore, homeScore: g.homeScore, isFinal: g.isFinal,
        predicted_winner: p?.predicted_winner ?? null, confidence_tier: p?.confidence_tier ?? null,
        gameSlug,
      }
    })),
 getSeriesBattingStats(seriesGames.filter(g => g.isFinal).map(g => g.gamePk), game.teams.away.team.id),
    getSeriesBattingStats(seriesGames.filter(g => g.isFinal).map(g => g.gamePk), game.teams.home.team.id),
  ])

  const seriesMomentum = await getSeriesInningMomentum(
    seriesGames.map(g => ({ gamePk: g.gamePk, gameNumber: g.gameNumber, isFinal: g.isFinal }))
  )

  const season = new Date().getFullYear()
  const [awayStandings, homeStandings] = await Promise.all([
    getDivisionStandings(game.teams.away.team.id, season),
    getDivisionStandings(game.teams.home.team.id, season),
  ])

const awayRow = awayStandings?.teams.find(t => t.teamId === game.teams.away.team.id) ?? null
  const homeRow = homeStandings?.teams.find(t => t.teamId === game.teams.home.team.id) ?? null

  const [awayLeagueStandings, homeLeagueStandings] = await Promise.all([
    awayStandings ? getLeagueStandings(awayStandings.leagueId, season) : Promise.resolve([]),
    homeStandings ? getLeagueStandings(homeStandings.leagueId, season) : Promise.resolve([]),
  ])

  const awayColor = findTeamByName(game.teams.away.team.name)?.primary_color ?? '#FF5722'
  const homeColor = findTeamByName(game.teams.home.team.name)?.primary_color ?? '#1A1A1A'

 console.log(`[story-slides] prediction exists: ${!!prediction}, story_lead: ${prediction?.story_lead ?? 'null/undefined'}`)
  const storySlides = [buildStoryLeadSlide(prediction?.story_lead)].filter((s): s is NonNullable<typeof s> => s !== null)

  const gameTimeFormatted = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET'

  // ── PINNED HERO ──────────────────────────────────────────────────────────
const pinnedHero = (prediction?.story_lead || prediction?.predicted_winner) ? (
<div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
      {prediction?.predicted_winner && (
        <div className="border-l-[3px] border-orange-500 pl-5 py-0.5">
          <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 mb-1">Edge lean</p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.85rem', lineHeight: 1, color: '#1A1A1A' }}>
              {prediction.predicted_winner}
            </span>
            {prediction.confidence_tier && (
              <span className="text-xs font-mono uppercase tracking-widest text-stone-400">
                {prediction.confidence_tier} lean
              </span>
            )}
          </div>
        </div>
      )}
      {prediction?.story_lead && (
        <div className="border-l-[3px] border-stone-200 pl-5">
          <p className="text-base md:text-lg font-serif italic text-stone-700 leading-relaxed">{prediction.story_lead}</p>
        </div>
      )}
    </div>
  ) : null

  // ── SLOT: OVERVIEW ──────────────────────────────────────────────────────
  const slotRead = (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-mono uppercase tracking-widest font-bold mb-4 text-orange-600">§ Starting pitcher matchup</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <PitcherCard pitcher={game.teams.away.probablePitcher} stats={awaySeasonStats} abbr={game.teams.away.team.abbreviation ?? 'AWAY'} color={awayColor} side="away" />
          <PitcherCard pitcher={game.teams.home.probablePitcher} stats={homeSeasonStats} abbr={game.teams.home.team.abbreviation ?? 'HOME'} color={homeColor} side="home" />
        </div>
      </div>
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
          away_primary_color={awayColor}
          home_primary_color={homeColor}
          lineups_confirmed={prediction.lineups_confirmed}
          is_pro={isPro}
          llm_narrative={prediction.narrative}
          llm_narrative_pro={prediction.narrative_pro}
          pro_takeaways={prediction.pro_takeaways}
        />
      )}

      {prediction?.contrarian && (
        <section>
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold mb-4 text-red-500">§ The Contrarian Angle</h3>
          <Contrarian text={prediction.contrarian} />
        </section>
      )}
    </div>
  )

const slotLineups = (
    <LineupCompare
      awayBatters={awayLineup?.batters ?? []}
      homeBatters={homeLineup?.batters ?? []}
      awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
      homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
      isPro={isPro}
  />
)
  const slotPitching = (
<div className="space-y-10">
      <PitchingTab
        awayPitcher={awayPitcherId ? {
        id: awayPitcherId,
        name: game.teams.away.probablePitcher?.fullName ?? 'TBD',
        abbr: game.teams.away.team.abbreviation ?? 'AWAY',
        side: 'Away starter',
        fullStats: awayFullStats,
        movementRows: awayMovementDB,
      } : null}
      homePitcher={homePitcherId ? {
        id: homePitcherId,
        name: game.teams.home.probablePitcher?.fullName ?? 'TBD',
        abbr: game.teams.home.team.abbreviation ?? 'HOME',
        side: 'Home starter',
        fullStats: homeFullStats,
        movementRows: homeMovementDB,
     } : null}
      />
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Bullpen availability</p>
        <BullpenPanel home={homeBullpen} away={awayBullpen} isPro={isPro} />
      </div>
    </div>
  )
const slotTeams = (
    <div className="space-y-10">
      <TeamIntelExtras
        awayTeamName={game.teams.away.team.name}
        homeTeamName={game.teams.home.team.name}
        awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
        homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
        awayInjuries={awayInjuries}
        homeInjuries={homeInjuries}
        awayCallups={awayCallups}
        homeCallups={homeCallups}
   awayStandouts={awayStandouts}
        homeStandouts={homeStandouts}
      />
<HotColdStreaks
        rows={streakRows}
        awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
        homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
        awayTeamName={game.teams.away.team.name}
        homeTeamName={game.teams.home.team.name}
      />
    </div>
  )

 const slotSidebar = (
    <>
      <TrendsCard
        awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
        homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
        awayForm={awayForm}
        homeForm={homeForm}
      />
<StandingsCard
        awayTeamId={game.teams.away.team.id}
        homeTeamId={game.teams.home.team.id}
        awayStandings={awayStandings}
        homeStandings={homeStandings}
      />
    {seriesGames.length >= 1 && (
        <SeriesCarousel
          games={seriesCarouselGames}
          awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
          homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
        />
      )}
      {awayRow && awayStandings && (
        <RaceForOctober team={awayRow} divisionTeams={awayStandings.teams} wildCardTeams={awayLeagueStandings} abbr={game.teams.away.team.abbreviation ?? 'AWAY'} />
      )}
      {homeRow && homeStandings && (
        <RaceForOctober team={homeRow} divisionTeams={homeStandings.teams} wildCardTeams={homeLeagueStandings} abbr={game.teams.home.team.abbreviation ?? 'HOME'} />
      )}
      <Stub label="Charts" note="Progression line chart — needs the season-long per-game data source, see below" />
    </>
  )

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
   storySlides={storySlides}
        lockedStorySlides={LOCKED_SLIDES}
        pinnedHero={pinnedHero}
        slotSidebar={slotSidebar}
       slotSeriesTab={
          seriesGames.length >= 1 ? (
            <div className="space-y-6">
        <SeriesMomentum
                momentum={seriesMomentum}
                awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
                homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
                awayColor={awayColor}
                homeColor={homeColor}
              />
              <SeriesPredictions rows={seriesPredictionRows} />
              <SeriesPlayerStats
                awayAbbr={game.teams.away.team.abbreviation ?? 'AWAY'}
                homeAbbr={game.teams.home.team.abbreviation ?? 'HOME'}
                awayRows={awaySeriesStats}
                homeRows={homeSeriesStats}
                seriesStart={seriesGames[0]?.officialDate ?? dateMatch[1]}
                seriesEnd={seriesGames[seriesGames.length - 1]?.officialDate ?? dateMatch[1]}
              />
            </div>
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