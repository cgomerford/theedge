// src/app/dev/postgame-preview/[gamePk]/page.tsx
//
// THROWAWAY — not for production, delete once you've decided whether
// this implementation (lib/postgame.ts + PostGameReportTab.tsx) or your
// existing getLiveFeed/aggregateGameFeed/ReportModeToggle version is the
// one you're keeping. Visit /dev/postgame-preview/<gamePk> with a real
// completed game's gamePk to see this version end to end.
//
// Test gamePk: 824724 (Athletics 4, Red Sox 3 — Aug 9, 2026, Final)
// -> /dev/postgame-preview/824724
//
// NOTE: this route needs a `team logo id` / `final score` / team
// abbreviations to render the header — those normally come from your
// existing MLB team lookup helpers (same ones TeamDugoutView uses via
// lib/teams.ts). This file pulls them straight off the live feed's
// gameData block instead, so it stays fully decoupled from your other
// lib files for testing purposes — once you've confirmed the report
// itself looks right, wire it into your real game page using your
// existing team-color/logo helpers instead of the inline fallbacks here.

import { getPostGameReport } from '@/lib/postgame'
import PostGameReportTab from '@/components/PostGameReportTab'

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'

export default async function PostgamePreviewPage({
  params,
}: {
  params: Promise<{ gamePk: string }>
}) {
  const { gamePk: gamePkParam } = await params
  const gamePk = Number(gamePkParam)

  if (!Number.isFinite(gamePk)) {
    return <div className="p-8 font-mono text-sm">Invalid gamePk in URL — expected a number.</div>
  }

  // Pull just enough gameData for the header (teams, final score, status)
  // — separate from the full aggregation in getPostGameReport below.
  const feedRes = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { cache: 'no-store' })
  if (!feedRes.ok) {
    return <div className="p-8 font-mono text-sm">Could not fetch the live feed for gamePk {gamePk}. Check the network tab / server console.</div>
  }
  const feed = await feedRes.json()

  if (feed?.gameData?.status?.abstractGameState !== 'Final') {
    return (
      <div className="p-8 font-mono text-sm">
        Game {gamePk} isn&apos;t Final yet (status: {feed?.gameData?.status?.abstractGameState}).
        Pick a game that&apos;s already finished — try /dev/postgame-preview/824724.
      </div>
    )
  }

  const awayTeam = feed.gameData.teams.away
  const homeTeam = feed.gameData.teams.home
  const linescore = feed.liveData?.linescore
  const finalScore = {
    away: linescore?.teams?.away?.runs ?? 0,
    home: linescore?.teams?.home?.runs ?? 0,
  }

  const report = await getPostGameReport(gamePk)

  return (
    <div className="min-h-screen bg-[#FAF8F3] py-10 px-4">
      <div className="max-w-[1320px] mx-auto mb-4 font-mono text-[10px] uppercase tracking-widest text-orange-600">
        ⚠ /dev/postgame-preview — delete this route once you&apos;ve picked which postgame implementation to keep
      </div>
      <PostGameReportTab
        report={report}
        awayAbbr={awayTeam.abbreviation}
        homeAbbr={homeTeam.abbreviation}
        awayName={awayTeam.name}
        homeName={homeTeam.name}
        awayTeamId={awayTeam.id}
        homeTeamId={homeTeam.id}
        finalScore={finalScore}
      />
    </div>
  )
}