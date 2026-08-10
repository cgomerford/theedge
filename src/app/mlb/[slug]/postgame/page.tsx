// src/app/mlb/[slug]/postgame/page.tsx
//
// Production post-game report page — promoted from the throwaway
// /dev/postgame-preview/[gamePk] route. Same PostGameReportTab component
// and lib/postgame.ts data layer underneath; what changed getting here:
//
//   - Keyed by SLUG, not raw gamePk. This matters because slugifyGame()
//     is what the post-game email already builds its CTA link from —
//     gamePk isn't something a subscriber's URL should expose, and it
//     wouldn't match the rest of the site's /mlb/[slug] convention.
//   - Team colors/logos come from lib/teams.ts's findTeamByName(), same
//     helper every other page uses, instead of pulling raw values off the
//     live feed's gameData block (the dev route's simplification).
//   - A real "not final yet" state with a link back to the pre-game page,
//     instead of the dev route's plain-text message — a subscriber
//     clicking through from an email before the game (or a lineups)
//     shouldn't hit a bare error string.
//
// ⚠ UNVERIFIED: I haven't seen SiteHeader.tsx's actual prop signature —
// used here as <SiteHeader /> with no props, matching how it's imported
// elsewhere, but if it requires e.g. an isSignedIn/subscriber prop this
// will fail typecheck. Run `npm run build` and paste back the error if so —
// quick fix once I see the real signature.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getScheduleForDate, slugifyGame, type MLBGame } from '@/lib/mlb'
import { getPostGameReport } from '@/lib/postgame'
import { findTeamByName } from '@/lib/teams'
import PostGameReportTab from '@/components/PostGameReportTab'
import SiteHeader from '@/components/SiteHeader'

// Post-game data won't change once a game is Final — safe to cache longer
// than the live pre-game page's 60s revalidate.
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

  // Resolve the slug back to a real MLBGame — same lookup pattern as
  // /mlb/[slug]/page.tsx: pull that date's schedule, match by slugifyGame().
  const games = await getScheduleForDate(dateMatch[1])
  const game: MLBGame | undefined = games.find(g => slugifyGame(g) === slug)
  if (!game) notFound()

  const isFinal = game.status?.abstractGameState === 'Final'

  // Someone clicked through before the game actually ended (stale email
  // link, or a curious click on a scheduled game) — don't show a raw error,
  // send them back to the live pre-game page instead.
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
        />
      </div>
    </div>
  )
}
