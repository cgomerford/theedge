import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats, getRecentPredictions } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import TurnstileWidget from '@/components/TurnstileWidget'

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
  // Auth check — logged-in users go to dugout
  // TEMP DISABLED for testing signup flow
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('edge_session')
  if (sessionCookie?.value) {
    redirect('/dugout')
   }

  const today = new Date().toISOString().split('T')[0]
  const [games, overallStats, predictions] = await Promise.all([
    getScheduleForDate(today),
    getOverallStats(),
    getPredictionsForDate(today),
  ])

  // Top 3 games by absolute edge score (excludes tossups)
  const topEdges = games
    .map(game => {
      const pred = predictions.get(game.gamePk)
      return { game, pred }
    })
    .filter(({ pred }) => pred && pred.confidence_tier !== 'tossup' && pred.summary)
    .sort((a, b) => Math.abs(b.pred!.edge_score) - Math.abs(a.pred!.edge_score))
    .slice(0, 3)

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <SiteHeader variant="home" />
      <LiveTicker />
{/* ============ STATUS BANNERS ============ */}
{sp['check-email'] && (
  <div className="bg-yellow-300 text-stone-900 px-6 py-4 border-b-2 border-yellow-400">
    <div className="max-w-5xl mx-auto flex items-start gap-4">
      <div className="text-2xl flex-shrink-0">✉</div>
      <div className="flex-1">
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          Check your email
        </div>
        <p className="font-serif">
          We just sent a verification link. Click it to confirm your address, then pick your teams.
        </p>
        <p className="text-xs font-mono text-stone-700 mt-2">
          Didn&apos;t arrive in 2 min? Check spam, or <a href="#signup" className="underline">try again</a>.
        </p>
      </div>
    </div>
  </div>
)}

{sp['already-subscribed'] && (
  <div className="bg-green-100 text-green-900 px-6 py-4 border-b-2 border-green-200">
    <div className="max-w-5xl mx-auto flex items-start gap-4">
      <div className="text-2xl flex-shrink-0">✓</div>
      <div className="flex-1">
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          You&apos;re already in
        </div>
        <p className="font-serif">
          This email is already subscribed. Check your inbox for your daily brief, or use the link in any email to manage your preferences.
        </p>
      </div>
    </div>
  </div>
)}

{sp.error === 'rate-limit' && (
  <div className="bg-orange-100 text-orange-900 px-6 py-4 border-b-2 border-orange-200">
    <div className="max-w-5xl mx-auto flex items-start gap-4">
      <div className="text-2xl flex-shrink-0">⏱</div>
      <div className="flex-1">
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          Slow down
        </div>
        <p className="font-serif">
          Too many sign-up attempts. Please wait a minute and try again.
        </p>
      </div>
    </div>
  </div>
)}

{sp.error === 'invalid' && (
  <div className="bg-red-100 text-red-900 px-6 py-4 border-b-2 border-red-200">
    <div className="max-w-5xl mx-auto flex items-start gap-4">
      <div className="text-2xl flex-shrink-0">⚠</div>
      <div className="flex-1">
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          Invalid email
        </div>
        <p className="font-serif">
          Please enter a valid email address.
        </p>
      </div>
    </div>
  </div>
)}

{sp.error === 'server' && (
  <div className="bg-red-100 text-red-900 px-6 py-4 border-b-2 border-red-200">
    <div className="max-w-5xl mx-auto flex items-start gap-4">
      <div className="text-2xl flex-shrink-0">⚠</div>
      <div className="flex-1">
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          Something went wrong
        </div>
        <p className="font-serif">
          We hit a snag. Please try signing up again.
        </p>
      </div>
    </div>
  </div>
)}
      {/* ============ HERO ============ */}
      <section className="px-6 pt-24 pb-20 max-w-5xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-6">
          — The Edge · Daily Brief
        </div>
      <h1 className="text-6xl md:text-8xl font-serif font-light leading-none tracking-tight mb-8">
  The brief that<br />
  <em className="italic text-yellow-300 font-normal">finds the edge.</em>
</h1>
<p className="text-xl text-stone-400 mb-10 max-w-2xl leading-relaxed font-light">
  Pre-game analysis for the analytically-minded fan. Eight components, one Edge Score, a smart-friend read — delivered free to your inbox before first pitch. MLB now. NFL, NBA and NHL coming.
</p>

      <form id="signup" action="/api/subscribe" method="POST" className="max-w-md mb-3">
          <input type="hidden" name="source" value="home_hero" />
          <div className="flex gap-2 flex-col sm:flex-row mb-3">
            <input
              name="email"
              type="email"
              required
              placeholder="your@email.com"
              className="flex-1 px-4 py-4 bg-stone-900 border border-stone-700 text-stone-100 placeholder:text-stone-600 outline-none focus:border-yellow-300 transition"
            />
            <button type="submit" className="px-6 py-4 bg-yellow-300 text-stone-900 font-bold hover:bg-yellow-200 transition font-mono text-sm uppercase tracking-widest whitespace-nowrap">
              Get free access →
            </button>
          </div>
          <TurnstileWidget />
        </form>
        <div className="text-xs text-stone-500 font-mono mb-6">
          Free forever · No spam · Unsubscribe anytime
        </div>
        
        <Link href="/tonight" className="inline-flex items-center gap-2 text-sm text-orange-500 hover:text-yellow-300 transition font-mono">
          See tonight&apos;s slate ({games.length} games) →
        </Link>
      </section>

<section className="px-6 py-10 border-t border-stone-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 divide-x divide-stone-800">
            <Link href="/track-record" className="group px-6 py-2 first:pl-0">
              <div className="text-4xl md:text-5xl font-serif text-yellow-300 group-hover:text-white transition leading-none mb-1">
                {overallStats.total_graded}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Predictions graded
              </div>
            </Link>
            <Link href="/track-record" className="group px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif text-yellow-300 group-hover:text-white transition leading-none mb-1">
                {overallStats.insufficient_sample
                  ? <span className="text-stone-500 text-2xl">Tracking…</span>
                  : `${overallStats.accuracy_percent?.toFixed(1)}%`
                }
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                {overallStats.insufficient_sample ? 'Building sample size' : 'Accuracy on confident calls'}
              </div>
            </Link>
            <div className="px-6 py-2">
              <div className="text-4xl md:text-5xl font-serif text-yellow-300 leading-none mb-1">
                4
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                Sports coming
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-stone-800 flex items-center justify-between flex-wrap gap-3">
            <Link href="/track-record" className="text-[10px] text-stone-500 hover:text-orange-500 transition font-mono uppercase tracking-widest">
              Every prediction logged publicly · View full track record →
            </Link>
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-orange-500">MLB live</span>
              <span className="text-stone-700">·</span>
              <span className="text-stone-600">NFL Aug</span>
              <span className="text-stone-700">·</span>
              <span className="text-stone-600">NBA + NHL Oct</span>
            </div>
          </div>
        </div>
      </section>

           {/* ============ TONIGHT'S TOP EDGES ============ */}
      {topEdges.length > 0 && (
        <section className="px-6 py-24 border-t border-stone-800">
          <div className="max-w-5xl mx-auto">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-4">
              § Tonight&apos;s biggest edges
            </div>
            <h2 className="text-4xl md:text-5xl font-serif font-light mb-12">
              Real predictions,<br className="md:hidden" /> right now.
            </h2>

            <div className="grid md:grid-cols-3 gap-px bg-stone-800 border border-stone-800 mb-6">
              {topEdges.map(({ game, pred }) => {
                const winnerTeam = pred!.predicted_winner === 'home' 
                  ? game.teams.home.team 
                  : game.teams.away.team
                const winnerShort = shortName(winnerTeam.name)
                const sign = pred!.edge_score >= 0 ? '+' : ''
                
                return (
                  <Link
                    key={game.gamePk}
                    href={`/mlb/${slugifyGame(game)}`}
                    className="bg-stone-950 p-6 hover:bg-stone-900 transition group"
                  >
                    <div className="flex items-baseline gap-3 mb-3">
                      <div className="text-3xl font-serif text-yellow-300 font-black leading-none">
                        {sign}{Math.round(pred!.edge_score)}
                      </div>
                      <div className="text-xs font-mono uppercase tracking-wider text-orange-500">
                        — {pred!.confidence_tier}
                      </div>
                    </div>
                    <div className="text-xs font-mono uppercase text-stone-500 mb-1">Edge favors</div>
                    <div className="text-xl font-serif font-medium mb-3">{winnerShort}</div>
                    <div className="text-xs text-stone-500 font-mono mb-4">
                      {shortName(game.teams.away.team.name)} at {shortName(game.teams.home.team.name)}
                    </div>
                    {pred!.summary && (
                      <p className="text-sm text-stone-400 leading-relaxed font-serif italic line-clamp-3">
                        &ldquo;{pred!.summary}&rdquo;
                      </p>
                    )}
                    <div className="text-xs text-orange-500 mt-4 font-mono group-hover:text-yellow-300 transition">
                      Read full preview →
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className="text-center">
              <Link href="/tonight" className="text-sm text-orange-500 hover:text-yellow-300 transition font-mono">
                View all {games.length} games tonight →
              </Link>
            </div>
          </div>
        </section>
      )}

{/* ════ PRO TEASER ════ */}
<section className="px-6 py-16 border-t border-stone-800">
  <div className="max-w-3xl mx-auto text-center">
    <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 mb-3">
      ⊕ Free for fans · Pro for analysts
    </div>
    <h2 className="text-3xl sm:text-4xl font-serif font-light mb-4">
      Same game<span className="text-orange-600">.</span> Different depth<span className="text-orange-600">.</span>
    </h2>
    <p className="text-stone-400 font-serif italic mb-8 max-w-lg mx-auto">
      Free shows the verdict. Pro shows the playbook — all 8 components, full narrative, hot zones, fantasy tools, and more.
    </p>
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="#signup" className="inline-block bg-stone-800 border border-stone-600 text-stone-100 px-8 py-3 text-sm font-mono uppercase tracking-widest hover:bg-stone-700 transition">
        Start with free →
      </a>
      <a href="/pricing" className="inline-block bg-[#FDE047] text-stone-900 px-8 py-3 text-sm font-mono uppercase tracking-widest font-bold hover:bg-yellow-200 transition">
        Compare tiers · £4/mo →
      </a>
    </div>
    <p className="text-[10px] font-mono text-stone-500 mt-4">
      First 100 subscribers lock in £4/mo for life
    </p>
  </div>
</section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="px-6 py-24 border-t border-stone-800 bg-stone-900/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-4 text-center">
            ¶ How it works
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-light text-center mb-16">
            Three steps,<br className="md:hidden" /> every morning.
          </h2>

          <div className="space-y-12">
            <div className="grid md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-1 text-5xl font-serif text-orange-500 font-light">1</div>
              <div className="md:col-span-11">
                <h3 className="text-2xl font-serif mb-2">We ingest the data.</h3>
                <p className="text-stone-400 leading-relaxed">
                  Pre-game stats, probable pitchers, recent form, bullpen usage, park factors, weather. Everything that moves a game, pulled fresh.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-1 text-5xl font-serif text-orange-500 font-light">2</div>
              <div className="md:col-span-11">
                <h3 className="text-2xl font-serif mb-2">The model scores it.</h3>
                <p className="text-stone-400 leading-relaxed">
                  Eight components, each weighted by historical predictive value. Combined into a single Edge Score. Then Claude writes the narrative — like a smart friend who actually reads the data.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-1 text-5xl font-serif text-orange-500 font-light">3</div>
              <div className="md:col-span-11">
                <h3 className="text-2xl font-serif mb-2">You get the brief.</h3>
                <p className="text-stone-400 leading-relaxed">
                  In your inbox three hours before first pitch. Five-minute read. Information only — no advice, no picks, no fluff. You decide what it means.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>



 {/* ============ FINAL CTA ============ */}
      <section className="px-6 py-20 border-t border-stone-800 bg-stone-900/50">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-500 mb-4">
            § Free · Always
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-light mb-3">
            Tomorrow&apos;s brief.<br />
            <em className="text-yellow-300 italic">In your inbox by 8am.</em>
          </h2>
          <p className="text-stone-500 font-mono text-xs uppercase tracking-widest mb-8">
            Free forever · No card required · Unsubscribe anytime
          </p>
       <form action="/api/subscribe" method="POST" className="max-w-md mx-auto">
            <input type="hidden" name="source" value="home_footer" />
            <div className="flex gap-2 flex-col sm:flex-row mb-3">
              <input
                name="email"
                type="email"
                required
                placeholder="your@email.com"
                className="flex-1 px-4 py-4 bg-stone-950 border border-stone-700 text-stone-100 placeholder:text-stone-600 outline-none focus:border-yellow-300 transition"
              />
              <button type="submit" className="px-6 py-4 bg-yellow-300 text-stone-900 font-bold hover:bg-yellow-200 transition font-mono text-sm uppercase tracking-widest whitespace-nowrap">
                Get free access →
              </button>
            </div>
            <div className="flex justify-center">
              <TurnstileWidget />
            </div>
          </form>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-12 border-t border-stone-800 text-xs text-stone-500 font-mono">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
            <Link href="/tonight" className="hover:text-stone-100">Tonight</Link>
            <Link href="/track-record" className="hover:text-stone-100">Track Record</Link>
            <Link href="/about" className="hover:text-stone-100">About</Link>
            <Link href="/how-it-works" className="hover:text-stone-100">How it works</Link>
            <Link href="/privacy" className="hover:text-stone-100">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-100">Terms</Link>
            <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-100">Contact</a>
          </div>
          <div className="mb-4">
            © 2026 The Edge · Game data via official MLB Stats API
          </div>
          <div className="text-stone-600 leading-relaxed max-w-2xl">
            The Edge provides information and statistical analysis only. We do not provide gambling advice, picks, or recommendations. All decisions are yours alone.
          </div>
        </div>
      </footer>
    </main>
  )
}