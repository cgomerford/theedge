import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { findTeamByName, findTeamBySlug, getTeamTheme } from '@/lib/teams'
import SiteHeader from '@/components/SiteHeader'

export const revalidate = 600 // 10 min cache

export default async function DugoutPage() {
  // TEMP: hard-coded subscriber for development
  // TODO: replace with real auth check
  const supa = createAdminClient()
  const { data: subscriber } = await supa
    .from('subscribers')
    .select('email, teams, primary_team, preferences_token')
    .eq('email', 'cgomerford@gmail.com') // ← put your email here
    .single()

  if (!subscriber) {
    return <div className="p-12">No subscriber found for testing email</div>
  }

  // Determine primary team for theming
  const primaryTeamSlug = subscriber.primary_team 
    ?? subscriber.teams?.[0] 
    ?? 'phillies'  // safe fallback
  
  const primaryTeam = findTeamBySlug(primaryTeamSlug)
  const theme = getTeamTheme(primaryTeamSlug)

  // Fetch today's games + predictions
  const today = new Date().toISOString().split('T')[0]
  const [allGames, predictions] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
  ])

  // Filter to subscriber's followed teams
  const followedSlugs: string[] = subscriber.teams ?? []
  const myGames = allGames.filter((game) => {
    const awayTeam = findTeamByName(game.teams.away.team.name)
    const homeTeam = findTeamByName(game.teams.home.team.name)
    return (awayTeam && followedSlugs.includes(awayTeam.slug)) ||
           (homeTeam && followedSlugs.includes(homeTeam.slug))
  })

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />

      {/* ============ TEAM-THEMED HERO PANEL ============ */}
      <section
        className="px-6 py-16 md:py-20"
        style={{ backgroundColor: theme.primary, color: theme.text }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest mb-4 opacity-70">
            ⊕ Your Dugout · {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
          
          <div className="flex items-center gap-6 mb-6">
            {primaryTeam && (
              <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={teamLogoUrl(primaryTeam.slug === 'phillies' ? 143 : 0)} 
                  alt={primaryTeam.short}
                  className="w-16 h-16 md:w-20 md:h-20 object-contain"
                />
              </div>
            )}
            <div>
              <h1 className="text-4xl md:text-6xl font-serif font-bold leading-none tracking-tight mb-2">
                {primaryTeam?.short ?? 'Welcome'}
                <span className="opacity-60 font-light italic"> Edge</span>
              </h1>
              <p className="opacity-80 text-base md:text-lg">
                {myGames.length === 0 
                  ? 'No games today for your teams.' 
                  : myGames.length === 1 
                    ? 'You have 1 game tonight.'
                    : `You have ${myGames.length} games tonight.`}
              </p>
            </div>
          </div>

          {followedSlugs.length > 1 && (
            <div className="text-sm opacity-70 mt-6 font-mono">
              Following: {followedSlugs.map(slug => findTeamBySlug(slug)?.short).filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </section>

      {/* ============ MY GAMES ============ */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4">
          § Tonight's slate
        </div>

        {myGames.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-12 text-center">
            <h2 className="text-2xl font-serif text-stone-900 mb-3">No games for your teams tonight.</h2>
            <p className="text-stone-600 mb-6">
              Take a look at the full slate — there are still {allGames.length} games on with edge analysis.
            </p>
            <Link
              href="/tonight"
              className="inline-block bg-stone-900 text-white px-6 py-3 font-semibold hover:bg-stone-700 transition"
            >
              See tonight's full slate →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {myGames.map((game) => {
              const pred = predictions.get(game.gamePk)
              const awayShort = shortName(game.teams.away.team.name)
              const homeShort = shortName(game.teams.home.team.name)
              const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
              })

              return (
                <Link
                  key={game.gamePk}
                  href={`/mlb/${slugifyGame(game)}`}
                  className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition group"
                >
                  <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-3">
                    {gameTime} · {game.venue?.name}
                  </div>

                  {/* Matchup row */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={teamLogoUrl(game.teams.away.team.id)}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <span className="text-2xl font-serif font-bold text-stone-900">{awayShort}</span>
                    <span className="text-stone-400 italic font-light">at</span>
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={teamLogoUrl(game.teams.home.team.id)}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <span className="text-2xl font-serif font-bold text-stone-900">{homeShort}</span>
                  </div>

                  {/* Edge indicator inline */}
                  {pred ? (
                    <div className="flex items-center justify-between border-t border-stone-100 pt-4">
                      <div>
                        <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">
                          Edge {pred.confidence_tier !== 'tossup' && `favors ${
                            pred.predicted_winner === 'home' ? homeShort : awayShort
                          }`}
                        </div>
                        {pred.summary && (
                          <p className="text-sm text-stone-700 font-serif italic line-clamp-2">
                            "{pred.summary}"
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <div 
                          className="text-3xl font-serif font-black"
                          style={{ 
                            color: pred.confidence_tier === 'tossup' 
                              ? '#A3A3A3' 
                              : theme.primary 
                          }}
                        >
                          {pred.edge_score >= 0 ? '+' : ''}{Math.round(pred.edge_score)}
                        </div>
                        <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mt-1">
                          {pred.confidence_tier}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-stone-100 pt-4 text-sm text-stone-500 italic">
                      Edge analysis loading...
                    </div>
                  )}

                  <div className="mt-4 text-xs font-mono uppercase tracking-wider text-orange-600 group-hover:text-orange-700 transition">
                    Read full preview →
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ============ QUICK LINKS ============ */}
      <section className="px-6 py-12 border-t border-stone-200 bg-stone-100">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-4">
          <Link 
            href="/track-record"
            className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition"
          >
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">
              ⊕ Track Record
            </div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">
              How accurate are we?
            </h3>
            <p className="text-sm text-stone-600">
              Public predictions log. Every game graded.
            </p>
          </Link>

          <Link 
            href="/tonight"
            className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition"
          >
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">
              § Full slate
            </div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">
              All games tonight
            </h3>
            <p className="text-sm text-stone-600">
              {allGames.length} games · all 8 components scored.
            </p>
          </Link>

          <Link 
            href={`/preferences/${subscriber.preferences_token}`}
            className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition"
          >
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">
              ⚙ Preferences
            </div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">
              Update your teams
            </h3>
            <p className="text-sm text-stone-600">
              Add, remove, or change your primary team.
            </p>
          </Link>
        </div>
      </section>

      {/* Footer link back to landing if logged out */}
      <footer className="px-6 py-12 text-center">
        <p className="text-xs font-mono uppercase tracking-wider text-stone-500">
          The Edge · Information only · No betting advice
        </p>
      </footer>
    </main>
  )
}