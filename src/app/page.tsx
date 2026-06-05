import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats, getRecentReads } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import TurnstileWidget from '@/components/TurnstileWidget'
import { getActiveSport, SPORT_LABELS, SPORT_HUB_PATH } from '@/lib/active-sport'

export const revalidate = 1800

type Props = {
  searchParams: Promise<{
    'check-email'?: string
    'already-subscribed'?: string
    error?: string
  }>
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams
  
  // Auth check
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('edge_session')
  if (sessionCookie?.value) {
    redirect('/dugout')
  }

  const { primary: activeSport } = getActiveSport()

  const today = new Date().toISOString().split('T')[0]
  const [games, overallStats, predictions] = await Promise.all([
    getScheduleForDate(today),
    getOverallStats(),
    getPredictionsForDate(today),
  ])

  const topEdges = games
    .map(game => {
      const pred = predictions.get(game.gamePk)
      return { game, pred }
    })
    .filter(({ pred }) => pred && pred.confidence_tier !== 'tossup' && pred.summary)
    .sort((a, b) => Math.abs(b.pred!.edge_score) - Math.abs(a.pred!.edge_score))
    .slice(0, 3)

  return (
    <main className="min-h-screen bg-[#fafaf9] text-stone-900 font-sans selection:bg-orange-200">
      <SiteHeader variant="home" />
      <LiveTicker />

      {/* Status Banners - unchanged */}

      {/* ============ HERO ============ */}
      <section className="px-6 pt-24 pb-20 max-w-5xl mx-auto">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-6">
         § THE EDGE · {SPORT_LABELS[activeSport]} IN SEASON
        </div>
        <h1 className="text-6xl md:text-7xl font-serif font-bold tracking-tight mb-6 text-stone-900">
          Sharp analysis.<br />
          For every major sport<span className="text-[#ea580c]">.</span>
        </h1>
        <p className="text-xl text-stone-500 mb-10 max-w-2xl leading-relaxed font-serif italic">
          Pre-game breakdowns built for serious fans. One clear Edge Score, smart narrative, and deep data — delivered before tip-off, kickoff, or first pitch.
        </p>

        <div className="flex flex-wrap gap-2 text-sm mb-8">
          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded font-mono text-xs">MLB — LIVE</span>
          <span className="bg-stone-100 text-stone-600 px-3 py-1 rounded font-mono text-xs">NFL — July</span>
          <span className="bg-stone-100 text-stone-600 px-3 py-1 rounded font-mono text-xs">NBA + NHL — Sept</span>
        </div>

        <form id="signup" action="/api/subscribe" method="POST" className="max-w-md mb-4">
          <input type="hidden" name="source" value="home_hero" />
          <div className="flex gap-2 flex-col sm:flex-row mb-3">
            <input
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="flex-1 px-4 py-3.5 bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition shadow-sm rounded-none"
            />
            <button type="submit" className="px-6 py-3.5 bg-stone-900 text-white font-bold hover:bg-stone-800 transition font-mono text-[10px] uppercase tracking-widest whitespace-nowrap shadow-sm rounded-none">
              Get free access →
            </button>
          </div>
          <TurnstileWidget />
        </form>

        <div className="text-[10px] text-stone-400 font-mono mb-8 uppercase tracking-widest">
          Free forever · No spam · Unsubscribe anytime
        </div>

        {games.length > 0 && (
          <Link href="/tonight" className="inline-flex items-center gap-2 text-[10px] text-[#ea580c] hover:text-stone-900 transition font-mono uppercase tracking-widest">
            See tonight&apos;s MLB slate ({games.length} games) →
          </Link>
        )}
      </section>

{/* ============ FACTOR ALIGNMENT / STATS ============ */}
      <section className="px-6 py-10 border-t border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 divide-x divide-stone-100">
            <Link href="/track-record" className="group px-6 py-2 first:pl-0">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-2">
                {overallStats.total_reviewed}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Games reviewed
              </div>
            </Link>
            <Link href="/track-record" className="group px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 group-hover:text-[#ea580c] transition leading-none mb-2">
                {overallStats.insufficient_sample
                  ? <span className="text-stone-400 text-2xl font-normal">Tracking…</span>
                  : `${overallStats.alignment_percent?.toFixed(1)}%`
                }
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                {overallStats.insufficient_sample ? 'Building sample size' : 'Factor alignment rate'}
              </div>
            </Link>
            <div className="px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif font-bold text-stone-900 leading-none mb-2">
                4
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Major leagues covered
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-stone-100 flex items-center justify-between flex-wrap gap-3">
            <Link href="/track-record" className="text-[10px] text-[#ea580c] hover:text-stone-900 transition font-mono uppercase tracking-widest">
              Every game reviewed publicly →
            </Link>
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-[#ea580c] font-bold">MLB LIVE</span>
              <span className="text-stone-300">·</span>
              <span>NFL July</span>
              <span className="text-stone-300">·</span>
              <span>NBA + NHL Sept</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TONIGHT'S TOP EDGES (MLB scoped) ============ */}
      {topEdges.length > 0 && (
        <section className="px-6 py-20 border-t border-stone-200 bg-[#fafaf9]">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 flex items-center gap-2">
                <span className="text-stone-400">⊕</span> TONIGHT&apos;S BIGGEST EDGES — MLB
              </div>
              <Link href="/tonight" className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] hover:text-stone-900 transition">
                FULL MLB SLATE →
              </Link>
            </div>


            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {topEdges.map(({ game, pred }) => {
                const winnerTeam = pred!.predicted_winner === 'home'
                  ? game.teams.home.team
                  : game.teams.away.team
                const winnerShort = shortName(winnerTeam.name)
                const tier = pred!.confidence_tier

                const tierStyles = tier === 'strong' 
                  ? 'text-orange-700 border-orange-200 bg-orange-50' 
                  : tier === 'moderate' 
                  ? 'text-yellow-700 border-yellow-200 bg-yellow-50' 
                  : 'text-stone-600 border-stone-200 bg-stone-50'
                
                const tierText = tier === 'strong' ? 'Strong edge' : tier === 'moderate' ? 'Moderate edge' : 'Slight edge'

                return (
                  <Link
                    key={game.gamePk}
                    href={`/mlb/${slugifyGame(game)}`}
                    className="bg-white p-6 rounded-lg border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition group flex flex-col"
                  >
                    <div className="text-[13px] font-semibold text-stone-900 mb-4 flex items-center gap-2">
                      <span>{shortName(game.teams.away.team.name)}</span>
                      <span className="text-stone-300 font-normal">@</span>
                      <span>{shortName(game.teams.home.team.name)}</span>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <div className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm ${tierStyles}`}>
                        {tierText}
                      </div>
                      <div className="text-[10px] font-mono text-stone-500">
                        favours <span className="font-bold text-stone-900">{winnerShort}</span>
                      </div>
                    </div>

                    {pred!.summary && (
                      <p className="text-[13px] text-stone-600 leading-relaxed font-serif italic line-clamp-3 mb-6 flex-1">
                        &ldquo;{pred!.summary}&rdquo;
                      </p>
                    )}

                    <div className="flex justify-between items-center text-[10px] text-stone-400 font-mono mt-auto pt-4 border-t border-stone-100">
                      <span>
                        {new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                      </span>
                      <span className="text-[#ea580c] group-hover:text-stone-900 transition">
                        Full analysis →
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ════ PRO TEASER ════ */}
      <section className="px-6 py-20 border-t border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
            ⊕ Free for standard tracking · Pro for absolute depth
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 mb-4">
            Same slate<span className="text-[#ea580c]">.</span> Unlocked potential<span className="text-[#ea580c]">.</span>
          </h2>
          <p className="text-stone-500 font-serif italic mb-10 max-w-lg mx-auto text-lg">
            Free accounts show who holds the base line. Pro opens up the comprehensive playbook — exposing all 8 core area scores, severe team hot-zones, and granular situational data.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a href="#signup" className="inline-block bg-white border border-stone-300 text-stone-900 px-8 py-3.5 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-50 transition shadow-sm">
              Enter the free dugout →
            </a>
            <a href="/pricing" className="inline-block bg-[#ea580c] text-white px-8 py-3.5 text-[10px] font-mono uppercase tracking-widest font-bold hover:bg-orange-700 transition shadow-sm">
              Go Pro · £4/mo →
            </a>
          </div>
          <p className="text-[10px] font-mono text-stone-400 mt-6 uppercase tracking-widest">
            Early analyst rate locked in permanently for first 100 subscribers
          </p>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="px-6 py-24 border-t border-stone-200 bg-[#fafaf9]">
        <div className="space-y-12 max-w-4xl mx-auto">
          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-1 text-5xl font-serif text-[#ea580c] font-bold mt-[-8px]">1</div>
            <div className="md:col-span-11">
              <h3 className="text-2xl font-serif font-bold text-stone-900 mb-3">Sport-tailored, unbiased architecture.</h3>
              <p className="text-stone-600 leading-relaxed text-lg">
                We ingest pure raw metrics directly from official feeds. No talking heads, no narrative bias, and no generic cross-sport templates. Our deep-analytical math engines are custom-engineered from scratch to process the unique mechanics of MLB, NFL, NBA, and NHL respectively.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-1 text-5xl font-serif text-[#ea580c] font-bold mt-[-8px]">2</div>
            <div className="md:col-span-11">
              <h3 className="text-2xl font-serif font-bold text-stone-900 mb-3">The 8-Area Edge breakdown.</h3>
              <p className="text-stone-600 leading-relaxed text-lg">
                The models segment every matchup into 8 distinct dimensions of performance. Instead of a vague outcome guess, you see a breakdown of structural friction: uncovering exactly where your team is statistically doomed to struggle, alongside subtle contextual elements you must keep an eye out for during the game.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-1 text-5xl font-serif text-[#ea580c] font-bold mt-[-8px]">3</div>
            <div className="md:col-span-11">
              <h3 className="text-2xl font-serif font-bold text-stone-900 mb-3">Your dedicated Dugout space.</h3>
              <p className="text-stone-600 leading-relaxed text-lg">
                Subscribing automatically spins up your personal **Dugout** dashboard. Select your preferred teams across all active and upcoming sports to receive a customized pre-game analysis package directly in your account and inbox exactly three hours before actions begin.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="px-6 py-24 border-t border-stone-200 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#ea580c] mb-4">
            § Personalised · Unbiased · Zero Fluff
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-stone-900 mb-4">
            Your teams. Your data.<br />
            <em className="text-stone-500 font-normal italic">Ready hours before the whistle blowing.</em>
          </h2>
          <p className="text-stone-400 font-mono text-[10px] uppercase tracking-widest mb-10">
            Free tracking account · No card required · Unsubscribe anytime
          </p>
          <form action="/api/subscribe" method="POST" className="max-w-md mx-auto">
            <input type="hidden" name="source" value="home_footer" />
            <div className="flex gap-2 flex-col sm:flex-row mb-4">
              <input
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                className="flex-1 px-4 py-3.5 bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition shadow-sm rounded-none"
              />
              <button type="submit" className="px-6 py-3.5 bg-stone-900 text-white font-bold hover:bg-stone-800 transition font-mono text-[10px] uppercase tracking-widest whitespace-nowrap shadow-sm rounded-none">
                Setup My Dugout Dashboard →
              </button>
            </div>
            <div className="flex justify-center">
              <TurnstileWidget />
            </div>
          </form>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-12 border-t border-stone-200 bg-[#fafaf9] text-[10px] text-stone-500 font-mono uppercase tracking-widest">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-x-8 gap-y-4 mb-8">
            <Link href="/tonight" className="hover:text-stone-900 transition">Live Board</Link>
            <Link href="/track-record" className="hover:text-stone-900 transition">Track Record</Link>
            <Link href="/about" className="hover:text-stone-900 transition">About</Link>
            <Link href="/how-it-works" className="hover:text-stone-900 transition">How it works</Link>
            <Link href="/privacy" className="hover:text-stone-900 transition">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-900 transition">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-900 transition">Contact</a>
          </div>
          <div className="mb-4 text-stone-400">
            © 2026 The Edge · Unbiased Cross-Sport Modeling Feed
          </div>
          <div className="text-stone-400 leading-relaxed max-w-2xl normal-case tracking-normal">
            The Edge provides purely statistical raw metrics and programmatic model calculations. We do not offer or promote sports gambling advice, structured picks, or wagering recommendations.
          </div>
        </div>
      </footer>
    </main>
  )
}