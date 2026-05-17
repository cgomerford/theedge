import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import StreamerSummary from '@/components/StreamerSummary'
import { rankStreamers } from '@/lib/streamer'
import type { StreamerInput } from '@/lib/streamer'

export const revalidate = 1800

export default async function TonightPage() {
  const today = new Date().toISOString().split('T')[0]
  const displayDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const [games, predictions] = await Promise.all([
    getScheduleForDate(today),
    getPredictionsForDate(today),
  ])

  // ── Streamer inputs ──────────────────────────────────────────────────────
  const streamerInputs: StreamerInput[] = []

  for (const game of games) {
    const pred = predictions.get(game.gamePk)
    const parkComponent = pred?.components?.park ?? 0
    const gameSlug = slugifyGame(game)
    const gameTime = new Date(game.gameDate).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    })

    if (game.teams.away.probablePitcher) {
      streamerInputs.push({
        pitcherName:   game.teams.away.probablePitcher.fullName,
        pitcherId:     game.teams.away.probablePitcher.id,
        teamName:      shortName(game.teams.away.team.name),
        opponentName:  shortName(game.teams.home.team.name),
        opponentStats: null,
        pitcherStats:  null,
        pitchMix:      [],
        parkComponent,
        isPitcherHome: false,
        gameSlug,
        gameTime,
      })
    }
    if (game.teams.home.probablePitcher) {
      streamerInputs.push({
        pitcherName:   game.teams.home.probablePitcher.fullName,
        pitcherId:     game.teams.home.probablePitcher.id,
        teamName:      shortName(game.teams.home.team.name),
        opponentName:  shortName(game.teams.away.team.name),
        opponentStats: null,
        pitcherStats:  null,
        pitchMix:      [],
        parkComponent: -parkComponent,
        isPitcherHome: true,
        gameSlug,
        gameTime,
      })
    }
  }

  const tonightStreamers = rankStreamers(streamerInputs).slice(0, 3)
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />
      <LiveTicker />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            — {displayDate}
          </div>
          <div className="flex items-end justify-between gap-4">
            <h1 className="text-4xl sm:text-5xl font-serif font-light tracking-tight leading-none">
              Tonight&apos;s slate.
            </h1>
            <div className="text-right shrink-0">
              <div className="text-3xl font-serif font-light text-stone-900 leading-none">
                {games.length}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-1">
                {games.length === 1 ? 'game' : 'games'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* ── Game grid ─────────────────────────────────────────────────── */}
        {games.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-5xl font-serif font-light text-stone-300 mb-4">—</div>
            <p className="font-mono text-sm text-stone-400 uppercase tracking-widest">No games scheduled today</p>
          </div>
        ) : (
          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-5">
              § MLB · Tonight
            </div>
            <div className="divide-y divide-stone-200 border-t border-b border-stone-200">
              {games.map((game) => {
                const pred = predictions.get(game.gamePk)
                const gameTime = new Date(game.gameDate).toLocaleTimeString('en-GB', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
                })
                const hasEdge = pred && pred.confidence_tier !== 'tossup'

                return (
                  <Link
                    key={game.gamePk}
                    href={`/mlb/${slugifyGame(game)}`}
                    className="flex items-center justify-between gap-4 py-4 group hover:bg-stone-50 transition px-2 -mx-2"
                  >
                    {/* Time */}
                    <div className="shrink-0 w-16 text-[11px] font-mono text-stone-400 leading-tight">
                      {gameTime}<br />
                      <span className="text-stone-300">GMT+1</span>
                    </div>

                    {/* Teams */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <img
                          src={teamLogoUrl(game.teams.away.team.id)}
                          alt=""
                          className="w-5 h-5 object-contain shrink-0"
                        />
                        <span className="font-serif font-medium text-stone-700">
                          {shortName(game.teams.away.team.name)}
                        </span>
                        <span className="text-stone-300 text-xs font-serif italic">at</span>
                        <img
                          src={teamLogoUrl(game.teams.home.team.id)}
                          alt=""
                          className="w-5 h-5 object-contain shrink-0"
                        />
                        <span className="font-serif font-semibold text-stone-900">
                          {shortName(game.teams.home.team.name)}
                        </span>
                      </div>
                      {(game.teams.away.probablePitcher || game.teams.home.probablePitcher) && (
                        <div className="text-[11px] font-mono text-stone-400 truncate">
                          {game.teams.away.probablePitcher?.fullName ?? 'TBD'}
                          {' · '}
                          {game.teams.home.probablePitcher?.fullName ?? 'TBD'}
                        </div>
                      )}
                    </div>

                    {/* Edge score badge (if available) */}
                    <div className="shrink-0 flex items-center gap-3">
                      {pred && hasEdge && (
                        <div className="text-right hidden sm:block">
                          <div className={`font-mono font-bold text-sm ${
                            Math.abs(pred.edge_score) >= 25 ? 'text-orange-600' :
                            Math.abs(pred.edge_score) >= 12 ? 'text-stone-700' :
                            'text-stone-400'
                          }`}>
                            {pred.edge_score > 0 ? '+' : ''}{Math.round(pred.edge_score)}
                          </div>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">
                            {pred.predicted_winner === 'home'
                              ? shortName(game.teams.home.team.name)
                              : shortName(game.teams.away.team.name)
                            }
                          </div>
                        </div>
                      )}
                      <span className="text-stone-300 group-hover:text-orange-600 transition text-sm">→</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Streamer picks ────────────────────────────────────────────── */}
        {tonightStreamers.filter(p => p.tier !== 'avoid').length > 0 && (
          <section className="bg-stone-900 p-6 sm:p-8">
            <StreamerSummary picks={tonightStreamers} isPro={false} />
          </section>
        )}

        {/* ── Sign up strip ─────────────────────────────────────────────── */}
        <section className="border border-stone-200 p-6 sm:p-8">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-3">
            — Get the daily brief
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className="text-2xl font-serif font-light text-stone-900 leading-tight mb-1">
                Three hours before first pitch, every day.
              </h2>
              <p className="text-sm text-stone-500 font-serif">
                Free. No credit card. Unsubscribe anytime.
              </p>
            </div>
            <Link
              href="/#signup"
              className="shrink-0 text-xs font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-6 py-3 hover:bg-stone-700 transition text-center"
            >
              Get the brief →
            </Link>
          </div>
        </section>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/about"       className="hover:text-stone-600 transition">About</Link>
            <Link href="/faq"         className="hover:text-stone-600 transition">FAQ</Link>
            <Link href="/track-record" className="hover:text-stone-600 transition">Track Record</Link>
            <Link href="/privacy"     className="hover:text-stone-600 transition">Privacy</Link>
            <Link href="/terms"       className="hover:text-stone-600 transition">Terms</Link>
            <Link href="/pricing" className="hover:text-stone-600 transition">Pricing</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}
