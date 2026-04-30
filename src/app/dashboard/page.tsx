import { redirect } from 'next/navigation'
import { getCurrentSubscriber } from '@/lib/auth'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName, findTeamBySlug, teamIdBySlug } from '@/lib/teams'
import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'

export const metadata = {
  title: 'Your dashboard · The Edge',
}

export const revalidate = 600

export default async function DashboardPage() {
  const sub = await getCurrentSubscriber()

  if (!sub) {
    redirect('/login?error=signin-required')
  }

  // Fetch tonight's games
  const today = new Date().toISOString().split('T')[0]
  const allGames = await getScheduleForDate(today)

  // Filter to user's followed teams
  const followedTeams = sub.teams as string[]
  const matchingGames = allGames.filter((g) => {
    const aw = findTeamByName(g.teams.away.team.name)
    const hm = findTeamByName(g.teams.home.team.name)
    return (
      (aw && followedTeams.includes(aw.slug)) ||
      (hm && followedTeams.includes(hm.slug))
    )
  })

  // Resolve team names from slugs (for the "Your teams" section)
  const followedTeamNames = followedTeams
    .map((slug) => findTeamBySlug(slug))
    .filter(Boolean)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <SiteHeader variant="page" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4">
          — Your dashboard
        </div>

        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight leading-none">
            My <em className="italic text-orange-600">Dugout.</em>
          </h1>
          <div className="text-xs font-mono text-stone-500 uppercase tracking-widest">
            {sub.email}
          </div>
        </div>

        {/* TONIGHT'S GAMES */}
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-stone-300">
            <h2 className="text-2xl font-serif font-semibold tracking-tight">
              {matchingGames.length === 0
                ? 'Nothing for your teams tonight.'
                : matchingGames.length === 1
                  ? '1 game tonight.'
                  : `${matchingGames.length} games tonight.`}
            </h2>
            <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
              Featuring your teams
            </div>
          </div>

          {matchingGames.length === 0 ? (
            <p className="text-stone-600 font-serif italic">
              We&apos;ll send your daily brief tomorrow morning if any of your teams play.
            </p>
          ) : (
            <div className="space-y-3">
              {matchingGames.map((game) => {
                const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZoneName: 'short',
                })
                return (
                  <Link
                    key={game.gamePk}
                    href={`/mlb/${slugifyGame(game)}`}
                    className="block p-5 bg-white border border-stone-200 hover:border-stone-400 transition-colors"
                  >
                    <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">
                      {gameTime} · {game.venue?.name}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={teamLogoUrl(game.teams.away.team.id)}
                          alt=""
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <span className="text-xl font-serif font-medium">
                        {shortName(game.teams.away.team.name)}
                      </span>
                      <span className="text-stone-400 italic font-light">at</span>
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={teamLogoUrl(game.teams.home.team.id)}
                          alt=""
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <span className="text-xl font-serif font-medium">
                        {shortName(game.teams.home.team.name)}
                      </span>
                      <span className="ml-auto text-orange-600 text-xs font-mono">
                        Read preview →
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* YOUR TEAMS */}
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-stone-300">
            <h2 className="text-2xl font-serif font-semibold tracking-tight">
              Your teams.
            </h2>
            <Link
              href={`/preferences/${sub.preferences_token}`}
              className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline"
            >
              Edit teams →
            </Link>
          </div>

          {followedTeamNames.length === 0 ? (
            <div className="p-6 bg-stone-100 border-l-4 border-orange-600">
              <p className="font-serif italic text-stone-700 mb-3">
                You haven&apos;t picked any teams yet.
              </p>
              <Link
                href={`/preferences/${sub.preferences_token}`}
                className="text-orange-600 font-mono text-sm hover:underline"
              >
                Pick your teams →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {followedTeamNames.map((team) =>
                team ? (
                  <div
                    key={team.slug}
                    className="flex items-center gap-3 p-4 bg-white border border-stone-200"
                  >
                    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={teamLogoUrl(teamIdBySlug(team.slug) ?? 0)}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-mono text-xs text-stone-500">{team.abbrev}</div>
                      <div className="font-serif font-semibold text-sm">{team.short}</div>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          )}
        </section>

        {/* LOGOUT */}
        <section className="pt-8 border-t border-stone-200">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs font-mono uppercase tracking-widest text-stone-500 hover:text-stone-900 transition"
            >
              Sign out →
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}