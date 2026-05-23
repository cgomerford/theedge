import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl, getTeamForm } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import { findTeamByName, findTeamBySlug, getTeamTheme, teamIdBySlug } from '@/lib/teams'
import SiteHeader from '@/components/SiteHeader'
import AnalyticsTrigger from '@/components/AnalyticsTrigger'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentSubscriber } from '@/lib/auth'
import DugoutCalendar from '@/components/DugoutCalendar'
import { getCalendarMonth } from '@/lib/dugout-calendar'

export const revalidate = 600

type Props = {
  searchParams: Promise<{ month?: string }>
}

export default async function DugoutPage({ searchParams }: Props) {
  const sp = await searchParams
  // Real auth check
const sub = await getCurrentSubscriber()

if (!sub) {
  redirect('/')
}

const supa = createAdminClient()
const { data: subscriber } = await supa
  .from('subscribers')
  .select('email, teams, primary_team, preferences_token')
  .eq('id', sub.id)
  .single()

if (!subscriber) {
  redirect('/')
}

  // Resolve primary team for theming
  const primaryTeamSlug = subscriber.primary_team
    ?? subscriber.teams?.[0]
    ?? 'phillies'

  const primaryTeam = findTeamBySlug(primaryTeamSlug)
  const theme = primaryTeam
    ? { primary: primaryTeam.primary_color, secondary: primaryTeam.secondary_color, text: primaryTeam.text_on_primary }
    : { primary: '#1A1A1A', secondary: '#FF5722', text: '#FFFFFF' }

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

  // Find primary team's game tonight (for hero spotlight)
  const primaryTeamGame = primaryTeam
    ? myGames.find((game) => {
      const awayTeam = findTeamByName(game.teams.away.team.name)
      const homeTeam = findTeamByName(game.teams.home.team.name)
      return awayTeam?.slug === primaryTeamSlug || homeTeam?.slug === primaryTeamSlug
    })
    : null

  const primaryGamePrediction = primaryTeamGame ? predictions.get(primaryTeamGame.gamePk) : null
// Get primary team form (last 5 record + streak)
  const primaryTeamId = teamIdBySlug(primaryTeamSlug)
  const primaryTeamForm = primaryTeamId ? await getTeamForm(primaryTeamId) : null

  // === CALENDAR DATA ===
  // Default to current month; user can navigate via ?month=YYYY-MM
  const currentMonth = today.slice(0, 7)  // 'YYYY-MM'
  const selectedMonth = sp.month ?? currentMonth

  // Validate format — anything weird falls back to current month
  const isValidMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)
  const calendarMonth = isValidMonth ? selectedMonth : currentMonth

  // Compute prev/next month, clamped to the season (April → October)
  // Note: MLB season is usually Mar-Oct, but April covers regular season opener cleanly.
  function shiftMonth(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(n => parseInt(n, 10))
    const date = new Date(Date.UTC(y, m - 1 + delta, 1))
    const newY = date.getUTCFullYear()
    const newM = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${newY}-${newM}`
  }

  const SEASON_START = `${currentMonth.slice(0, 4)}-04`  // e.g. '2026-04'
  const SEASON_END = currentMonth  // can't navigate past current month

  const prevCandidate = shiftMonth(calendarMonth, -1)
  const nextCandidate = shiftMonth(calendarMonth, 1)

  const prevMonth = prevCandidate >= SEASON_START ? prevCandidate : null
  const nextMonth = nextCandidate <= SEASON_END ? nextCandidate : null

  // Fetch calendar data (only if we have a valid primary team)
  const calendarGames = primaryTeamId
    ? await getCalendarMonth(primaryTeamId, calendarMonth)
    : []

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />

      {/* ============ TEAM-THEMED HERO PANEL ============ */}
      <section
        className="px-6 py-12 md:py-16"
        style={{ backgroundColor: theme.primary, color: theme.text }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest mb-6 opacity-70">
            ⊕ Your Dugout · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start">

            {/* LEFT: Team identity + matchup info */}
            <div className="w-full md:w-7/12">
              <div className="flex items-center gap-5 mb-5">
                {primaryTeam && primaryTeamId && (
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogoUrl(primaryTeamId)}
                      alt={primaryTeam.short}
                      className="w-16 h-16 md:w-20 md:h-20 object-contain"
                    />
                  </div>
                )}
                <div>
                  <h1 className="text-4xl md:text-5xl font-serif font-bold leading-none tracking-tight mb-2">
                    {primaryTeam?.short ?? 'Welcome'}
                    <span className="opacity-60 font-light italic"> Edge</span>
                  </h1>
                  {primaryTeamGame ? (
                    <p className="opacity-90 text-base md:text-lg">
                      vs {shortName(primaryTeamGame.teams.home.team.name === primaryTeam?.name 
                        ? primaryTeamGame.teams.away.team.name 
                        : primaryTeamGame.teams.home.team.name)} tonight ·{' '}
                      {new Date(primaryTeamGame.gameDate).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      })}
                    </p>
                  ) : (
                    <p className="opacity-80 text-base md:text-lg">
                      No game tonight. Resting up.
                    </p>
                  )}
                </div>
              </div>

              <AnalyticsTrigger event="dugout_viewed" />
              
              {/* Form strip */}
              {primaryTeamForm && (
                <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Last 10</div>
                    <div className="text-xl font-serif font-bold">
                      {primaryTeamForm.last_10_wins}-{primaryTeamForm.last_10_losses}
                    </div>
                  </div>
                  {primaryTeamForm.streak_count > 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Streak</div>
                      <div className="text-xl font-serif font-bold">
                        {primaryTeamForm.streak_type}{primaryTeamForm.streak_count}
                      </div>
                    </div>
                  )}
                  {primaryTeamForm.run_diff_l10 !== 0 && (
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Run diff L10</div>
                      <div className="text-xl font-serif font-bold">
                        {primaryTeamForm.run_diff_l10 >= 0 ? '+' : ''}{primaryTeamForm.run_diff_l10.toFixed(1)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Tonight's edge spotlight */}
            <div className="w-full md:w-5/12 md:flex-shrink-0">
              {primaryTeamGame && primaryGamePrediction ? (
                <Link
                  href={`/mlb/${slugifyGame(primaryTeamGame)}`}
                  className="block bg-black/30 border border-white/10 rounded-lg p-6 hover:bg-black/40 transition group"
                >
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">
                    ⊕ Tonight&apos;s Edge
                  </div>

                  <div className="flex items-baseline gap-3 mb-3">
                    <div className="text-5xl md:text-6xl font-serif font-black leading-none">
                      {primaryGamePrediction.edge_score >= 0 ? '+' : ''}{Math.round(primaryGamePrediction.edge_score)}
                    </div>
                    <div className="text-xs font-mono uppercase tracking-widest opacity-80">
                      — {primaryGamePrediction.confidence_tier}
                    </div>
                  </div>

                  {primaryGamePrediction.confidence_tier !== 'tossup' && (
                    <div className="mb-3">
                      <div className="text-xs font-mono uppercase tracking-wider opacity-60 mb-1">Edge favors</div>
                      <div className="text-xl font-serif font-bold">
                        {(primaryGamePrediction.predicted_winner === 'home'
                          ? shortName(primaryTeamGame.teams.home.team.name)
                          : shortName(primaryTeamGame.teams.away.team.name)
                        ).toUpperCase()}
                      </div>
                    </div>
                  )}

                  {primaryGamePrediction.summary && (
                    <p className="text-sm font-serif italic leading-relaxed opacity-90 mt-4">
                      &ldquo;{primaryGamePrediction.summary}&rdquo;
                    </p>
                  )}

                  <div className="text-xs font-mono uppercase tracking-wider opacity-70 mt-4 group-hover:opacity-100 transition">
                    Read the full edge →
                  </div>
                </Link>
              ) : primaryTeamGame ? (
                <div className="bg-black/30 border border-white/10 rounded-lg p-6">
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">
                    ⊕ Tonight&apos;s Edge
                  </div>
                  <p className="text-base opacity-80">
                    Edge analysis updating shortly.<br/>Refresh in a few minutes.
                  </p>
                </div>
              ) : (
                <div className="bg-black/30 border border-white/10 rounded-lg p-6">
                  <div className="text-xs font-mono uppercase tracking-widest mb-3 opacity-60">
                    ⊕ No Game Tonight
                  </div>
                  <p className="text-base opacity-80">
                    Catch up on tonight&apos;s full slate or check the track record.
                  </p>
                </div>
              )}
            </div>

          </div>

          {followedSlugs.length > 1 && (
            <div className="text-sm opacity-60 mt-8 font-mono">
              Following: {followedSlugs.map(slug => findTeamBySlug(slug)?.short).filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </section>
{/* ============ CALENDAR ============ */}
      {primaryTeam && primaryTeamId && (
        <section className="px-6 pt-12 max-w-5xl mx-auto">
         <DugoutCalendar
     games={calendarGames}
     yearMonth={calendarMonth}
     teamShort={primaryTeam.short.toUpperCase()}
     teamPrimaryColor={theme.primary}
     teamSecondaryColor={theme.secondary}
     prevMonth={prevMonth}
     nextMonth={nextMonth}
   />
        </section>
      )}

      {/* ============ MY GAMES ============ */}
      <section className="px-6 py-12 max-w-5xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-4">
          § Tonight&apos;s slate · Your teams
        </div>

        {myGames.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-12 text-center">
            <h2 className="text-2xl font-serif text-stone-900 mb-3">No games for your teams tonight.</h2>
            <p className="text-stone-600 mb-6">
              Check the full slate — {allGames.length} games on with edge analysis.
            </p>
            <Link
              href="/tonight"
              className="inline-block bg-stone-900 text-white px-6 py-3 font-semibold hover:bg-stone-700 transition"
            >
              See tonight&apos;s full slate →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {myGames.map((game) => {
              const pred = predictions.get(game.gamePk)
              const awayShort = shortName(game.teams.away.team.name)
              const homeShort = shortName(game.teams.home.team.name)
              const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
              })

              const isPrimaryGame = primaryTeamGame?.gamePk === game.gamePk

              return (
                <Link
                  key={game.gamePk}
                  href={`/mlb/${slugifyGame(game)}`}
                  className={`block bg-white border-2 rounded-lg p-6 transition group ${
                    isPrimaryGame ? 'border-stone-300' : 'border-stone-200 hover:border-stone-300'
                  }`}
                  style={isPrimaryGame ? { borderLeftColor: theme.primary, borderLeftWidth: '4px' } : undefined}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-stone-500">
                      {gameTime} · {game.venue?.name}
                    </div>
                    {isPrimaryGame && (
                      <div
                        className="text-xs font-mono uppercase tracking-wider px-2 py-1 rounded"
                        style={{ backgroundColor: theme.primary, color: theme.text }}
                      >
                        Your team
                      </div>
                    )}
                  </div>

                  {/* Matchup row */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={teamLogoUrl(game.teams.away.team.id)} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                    <span className="text-2xl font-serif font-bold text-stone-900">{awayShort}</span>
                    <span className="text-stone-400 italic font-light">at</span>
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={teamLogoUrl(game.teams.home.team.id)} alt="" className="max-w-full max-h-full object-contain" />
                    </div>
                    <span className="text-2xl font-serif font-bold text-stone-900">{homeShort}</span>
                  </div>

                  {/* Edge data — inline */}
                  {pred ? (
                    <div className="border-t border-stone-100 pt-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">
                            {pred.confidence_tier === 'tossup' ? 'Toss-up' : `Edge favors ${
                              pred.predicted_winner === 'home' ? homeShort : awayShort
                            }`}
                          </div>
                          {pred.summary && (
                            <p className="text-sm text-stone-700 font-serif italic leading-relaxed">
                              &ldquo;{pred.summary}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div
                            className="text-3xl md:text-4xl font-serif font-black leading-none"
                            style={{ color: pred.confidence_tier === 'tossup' ? '#A3A3A3' : theme.primary }}
                          >
                            {pred.edge_score >= 0 ? '+' : ''}{Math.round(pred.edge_score)}
                          </div>
                          <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mt-1">
                            {pred.confidence_tier}
                          </div>
                        </div>
                      </div>

                      {/* Top 2 components inline */}
                      {pred.components && (
                        <div className="flex gap-4 mt-4 pt-4 border-t border-stone-100">
                          {Object.entries(pred.components)
                            .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
                            .slice(0, 2)
                            .map(([key, value]) => {
                              const v = value as number
                              const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                              return (
                                <div key={key} className="flex-1">
                                  <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
                                    {label}
                                  </div>
                                  <div className={`text-base font-mono font-bold ${
                                    Math.abs(v) >= 5 ? 'text-stone-900' : 'text-stone-400'
                                  }`}>
                                    {v >= 0 ? '+' : ''}{Math.round(v)}
                                  </div>
                                </div>
                              )
                            })}
                          <div className="text-[10px] font-mono uppercase tracking-wider text-orange-600 self-center">
                            +6 more →
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-t border-stone-100 pt-4 text-sm text-stone-500 italic">
                      Edge analysis updating shortly. Refresh in a few minutes.
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
          <Link href="/track-record" className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition">
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">⊕ Track Record</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">How accurate are we?</h3>
            <p className="text-sm text-stone-600">Public predictions log. Every game graded.</p>
          </Link>

          <Link href="/tonight" className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition">
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">§ Full slate</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">All games tonight</h3>
            <p className="text-sm text-stone-600">{allGames.length} games · all 8 components scored.</p>
          </Link>

          <Link href={`/preferences/${subscriber.preferences_token}`} className="block bg-white border border-stone-200 rounded-lg p-6 hover:border-stone-400 transition">
            <div className="text-xs font-mono uppercase tracking-wider text-orange-600 mb-2">⚙ Preferences</div>
            <h3 className="text-lg font-serif font-bold text-stone-900 mb-1">Update your teams</h3>
            <p className="text-sm text-stone-600">Add, remove, or change your primary team.</p>
          </Link>
        </div>
      </section>

      <footer className="px-6 py-12 text-center">
        <p className="text-xs font-mono uppercase tracking-wider text-stone-500">
          The Edge · Information only · No betting advice
        </p>
      </footer>
    </main>
  )
}