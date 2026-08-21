// src/app/mlb/[slug]/postgame/page.tsx
//
// Production post-game report page.
//
// Two independent data fetches feed this page:
//   1. getPostGameReport() — the OLDER PostGameReport shape (top
//      performers, spray charts, umpire report, win probability, etc.)
//   2. getLiveFeed() + aggregateGameFeed() — the NEWER PostgameReport
//      shape (lowercase 'g', DO NOT confuse the two type names), used for
//      pitchers/pitchLog/batters/linescore — everything PostGameReportTab's
//      SP/bullpen/box-score section needs.
// Both run independently; if either fails, the other section still renders.
//
// 2026-08-20: added getBullpenData() as a THIRD independent fetch — last
// 3 days' pitch loads per team, for the Bullpen Usage panels under each
// SP column. Uses the game's official date (from the slug's date match)
// and both team IDs from the resolved schedule game.
//
// ⚠ UNVERIFIED: SiteHeader's prop signature — used as <SiteHeader /> with
// no props, matching other pages. Flag if build fails there.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getRecentGamePks, filterOutStarters, getBullpenReport } from '@/lib/bullpen-usage'
import { getLast7DaysPitcherWorkload } from '@/lib/pitcher-workload'
import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { getPostGameReport } from '@/lib/postgame'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { findTeamByName } from '@/lib/teams'
import { getBullpenData } from '@/lib/bullpen'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import PostGameReportTab from '@/components/PostGameReportTab'
import SiteHeader from '@/components/SiteHeader'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const matchup = slug
    .replace(/-(\d{4}-\d{2}-\d{2})(-game\d+)?$/, '')
    .replace(/-vs-/, ' vs ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
  const title = `${matchup} — Post-Game Report · The Edge`
  const description = `Post-game breakdown for ${matchup}: top performers, the biggest moment, and how it actually happened.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article', url: `https://edgereportdaily.com/mlb/${slug}/postgame` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PostGamePage({ params }: Props) {
  const { slug } = await params

  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})(?:-game\d+)?$/)
  if (!dateMatch) notFound()

  const games = await getScheduleForDate(dateMatch[1])
  const game: MLBGame | undefined = games.find(g => slugifyGame(g) === slug)
  if (!game) notFound()

  const isFinal = game.status?.abstractGameState === 'Final'

  if (!isFinal) {
    return (
      <div className="min-h-screen bg-[#FAF8F3]">
        <SiteHeader />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-orange-600 mb-3">
            Not final yet
          </p>
          <h1 className="font-serif text-2xl text-stone-900 mb-4">
            {game.teams.away.team.name} @ {game.teams.home.team.name}
          </h1>
          <p className="text-stone-500 mb-8">
            The post-game report is available once the game ends. Current status: {game.status?.detailedState ?? 'Scheduled'}.
          </p>
          <Link href={`/mlb/${slug}`} className="font-mono text-sm underline text-stone-900">
            ← Back to the game preview
          </Link>
        </div>
      </div>
    )
  }

  const report = await getPostGameReport(game.gamePk)

  // ── Pitching box score / batter / bullpen source data ──────────────────
  const liveFeed = await getLiveFeed(game.gamePk)
  const boxScoreReport = liveFeed ? aggregateGameFeed(liveFeed, slug) : null
  const boxScorePitchers = boxScoreReport?.pitchers ?? []
  const boxScorePitchLog = boxScoreReport?.pitchLog ?? []
    const boxScoreBatters = boxScoreReport?.batters
  const boxScoreLinescore = boxScoreReport?.linescore ?? []

  // Every distinct pitcher either team's batters faced this game — needed
  // for vs LHP/RHP splits in BatterBoxScoreSelector. Built off pitchLog
  // rather than boxScorePitchers, since pitchLog is the actual per-pitch
  // record of who threw to whom (boxScorePitchers only has each staff's
  // own pitchers, not who faced them).
  const allPitcherIdsFaced = Array.from(new Set(boxScorePitchLog.map(p => p.pitcherId)))
  const pitcherHands = await fetchPitcherHands(allPitcherIdsFaced)
  // ── Pitcher workload — last 7 days into this game, both teams ──────────
  const season = new Date(dateMatch[1]).getFullYear()
  const awayTeamId = game.teams.away.team.id
  const homeTeamId = game.teams.home.team.id

    const [awayWorkload, homeWorkload, awayRecentGamePks, homeRecentGamePks] = await Promise.all([
    getLast7DaysPitcherWorkload(awayTeamId, undefined, dateMatch[1]),
    getLast7DaysPitcherWorkload(homeTeamId, undefined, dateMatch[1]),
    getRecentGamePks(awayTeamId, 15, 30, dateMatch[1]),
    getRecentGamePks(homeTeamId, 15, 30, dateMatch[1]),
 ])

  // Filter each team's workload down to relievers only — pitcher-workload.ts
  // deliberately includes starters (full-staff view), but this card is
  // reliever-only per the wireframe. Reuses filterOutStarters rather than
  // getEligibleRelieverIds, since the latter requires a current-roster
  // check that would wrongly hide a reliever who's since been traded/
  // optioned but still actually pitched in this game's 7-day window.
  const [awayRelieverIds, homeRelieverIds] = await Promise.all([
    filterOutStarters(awayWorkload.pitchers.map(p => p.playerId), season),
    filterOutStarters(homeWorkload.pitchers.map(p => p.playerId), season),
  ])
  const awayWorkloadRP = { ...awayWorkload, pitchers: awayWorkload.pitchers.filter(p => awayRelieverIds.has(p.playerId)) }
 const homeWorkloadRP = { ...homeWorkload, pitchers: homeWorkload.pitchers.filter(p => homeRelieverIds.has(p.playerId)) }


  // bullpenReport just needs mostUsedInning per reliever — no roster
  // filtering needed here (unlike the team page), so skip
  // getEligibleRelieverIds and pass the raw recent gamePks straight in.
  const [awayBullpenReport, homeBullpenReport] = await Promise.all([
    getBullpenReport(awayTeamId, awayRecentGamePks, season),
    getBullpenReport(homeTeamId, homeRecentGamePks, season),
 ])
  const finalScore = {
    away: (game.teams.away as { score?: number }).score ?? 0,
    home: (game.teams.home as { score?: number }).score ?? 0,
  }

  const awayAbbr = game.teams.away.team.abbreviation ?? report.awayAbbr
  const homeAbbr = game.teams.home.team.abbreviation ?? report.homeAbbr
  const awayTeam = findTeamByName(game.teams.away.team.name)
  const homeTeam = findTeamByName(game.teams.home.team.name)

  return (
    <div className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader />
      <div className="py-8">
        <PostGameReportTab
          report={report}
          awayAbbr={awayAbbr}
          homeAbbr={homeAbbr}
          awayName={game.teams.away.team.name}
          homeName={game.teams.home.team.name}
          awayTeamId={game.teams.away.team.id}
          homeTeamId={game.teams.home.team.id}
          awayColor={awayTeam?.primary_color}
          homeColor={homeTeam?.primary_color}
          finalScore={finalScore}
          boxScorePitchers={boxScorePitchers}
          boxScorePitchLog={boxScorePitchLog}
                 boxScoreBatters={boxScoreBatters}
          boxScoreLinescore={boxScoreLinescore}
                 pitcherHands={pitcherHands}
          boxScoreBattedBalls={boxScoreReport?.battedBalls ?? []}
          awayWorkload={awayWorkloadRP}
         homeWorkload={homeWorkloadRP}
          awayBullpenReport={awayBullpenReport}
          homeBullpenReport={homeBullpenReport}
        />
      </div>
    </div>
  )
}