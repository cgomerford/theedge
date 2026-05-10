import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats, getRecentPredictions } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'

export const revalidate = 1800

export default async function HomePage() {
  // Auth check — logged-in users go to dugout
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

      {/* ============ HERO ============ */}
      <section className="px-6 pt-24 pb-20 max-w-5xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-6">
          — The Edge · Daily Brief
        </div>
        <h1 className="text-6xl md:text-8xl font-serif font-light leading-none tracking-tight mb-8">
          Every prediction.<br />
          <em className="italic text-yellow-300 font-normal">Tracked.</em>
        </h1>
        <p className="text-xl text-stone-400 mb-10 max-w-2xl leading-relaxed font-light">
          The pre-game brief for the analytics era. Eight components, smart-friend analysis, public accuracy. Five-minute read, three hours before first pitch.
        </p>

        <form id="signup" action="/api/subscribe" method="POST" className="flex gap-2 max-w-md flex-col sm:flex-row mb-3">
          <input type="hidden" name="source" value="home_hero" />
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="flex-1 px-4 py-4 bg-stone-900 border border-stone-800 text-stone-100 outline-none focus:border-stone-600"
          />
          <button type="submit" className="px-6 py-4 bg-stone-100 text-stone-900 font-semibold hover:bg-yellow-300 transition">
            Get the brief →
          </button>
        </form>
        <div className="text-xs text-stone-500 font-mono mb-6">No spam. Unsubscribe anytime.</div>
        
        <Link href="/tonight" className="inline-flex items-center gap-2 text-sm text-orange-500 hover:text-yellow-300 transition font-mono">
          See tonight&apos;s slate ({games.length} games) →
        </Link>
      </section>

      {/* ============ SOCIAL PROOF STRIP ============ */}
      <section className="px-6 py-12 border-t border-stone-800 bg-stone-900/30">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6">
          <Link href="/track-record" className="group">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-2">Predictions</div>
            <div className="text-3xl md:text-4xl font-serif text-stone-100 group-hover:text-yellow-300 transition">
              {overallStats.total_graded}
            </div>
            <div className="text-xs text-stone-500 font-mono mt-1">Graded</div>
          </Link>
          <Link href="/track-record" className="group">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-2">Accuracy</div>
            <div className="text-3xl md:text-4xl font-serif text-stone-100 group-hover:text-yellow-300 transition">
              {overallStats.insufficient_sample 
                ? <span className="text-stone-500 text-xl">Tracking…</span>
                : `${overallStats.accuracy_percent?.toFixed(1)}%`
              }
            </div>
            <div className="text-xs text-stone-500 font-mono mt-1">
              {overallStats.insufficient_sample ? 'Building sample' : 'Confident calls'}
            </div>
          </Link>
          <Link href="/track-record" className="group">
            <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-2">Method</div>
            <div className="text-3xl md:text-4xl font-serif text-stone-100 group-hover:text-yellow-300 transition">
              8
            </div>
            <div className="text-xs text-stone-500 font-mono mt-1">Components scored</div>
          </Link>
        </div>
        <div className="max-w-5xl mx-auto mt-6 text-center">
          <Link href="/track-record" className="text-xs text-orange-500 hover:text-yellow-300 transition font-mono">
            View full track record →
          </Link>
        </div>
      </section>

      {/* ============ WHAT YOU GET ============ */}
      <section className="px-6 py-24 border-t border-stone-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-4 text-center">
            § What&apos;s in your inbox
          </div>
          <h2 className="text-4xl md:text-5xl font-serif font-light text-center mb-4">
            Three things,<br className="md:hidden" /> every game.
          </h2>
          <p className="text-stone-400 text-center mb-16 max-w-xl mx-auto">
            We don&apos;t pad. Every email gives you the score, the story, and the math.
          </p>

          <div className="grid md:grid-cols-3 gap-px bg-stone-800">

            {/* Mockup 1 — Edge Indicator */}
            <div className="bg-stone-950 p-8">
              <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-4">
                ⊕ The Edge Indicator
              </div>
              {/* Mini Edge Indicator mockup */}
              <div className="bg-black p-5 mb-5 border border-stone-800">
                <div className="flex items-baseline gap-3 mb-3">
                  <div className="text-5xl font-serif text-yellow-300 leading-none font-black">+24</div>
                  <div className="flex-1">
                    <div className="text-[10px] font-mono uppercase text-stone-500 mb-1">Edge favors</div>
                    <div className="text-lg font-serif font-bold leading-none">PHILLIES</div>
                  </div>
                </div>
                <div className="text-[11px] text-orange-500 font-mono uppercase tracking-wider">
                  — Moderate Edge
                </div>
              </div>
              <h3 className="text-xl font-serif mb-2">Score the matchup.</h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                A single number, -100 to +100, telling you which team has the statistical edge tonight and how strong it is.
              </p>
            </div>

            {/* Mockup 2 — The Read */}
            <div className="bg-stone-950 p-8">
              <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-4">
                — The Read
              </div>
              {/* Narrative mockup */}
              <div className="bg-stone-900 p-5 mb-5 border border-stone-800">
                <p className="text-sm text-stone-300 leading-relaxed font-serif italic">
                  &ldquo;Wheeler&apos;s rolling — 1.21 ERA over his last three starts with 28 K in 22 IP. Mets counter with Senga but the bullpen is taxed after 6 IP yesterday. Phillies&apos; lineup pressure plus rested arms tilt this one.&rdquo;
                </p>
              </div>
              <h3 className="text-xl font-serif mb-2">Read the story.</h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                A four-sentence narrative written like a smart friend texting you the angle. Specific stats, hot/cold streaks, real context.
              </p>
            </div>

            {/* Mockup 3 — The Math */}
            <div className="bg-stone-950 p-8">
              <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-4">
                = The Math
              </div>
              {/* 8 components mockup */}
              <div className="bg-stone-900 p-5 mb-5 border border-stone-800 space-y-2">
                {[
                  { label: 'Starting Pitcher', value: '+15', strong: true },
                  { label: 'Bullpen', value: '+8', strong: false },
                  { label: 'Offense', value: '+4', strong: false },
                  { label: 'Park Factor', value: '−3', strong: false },
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-stone-500 font-mono uppercase tracking-wider">{c.label}</span>
                    <span className={c.strong ? 'text-orange-500 font-mono font-bold' : 'text-stone-400 font-mono'}>{c.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-800">
                  <span className="text-stone-600 font-mono">+ 4 more...</span>
                </div>
              </div>
              <h3 className="text-xl font-serif mb-2">See the math.</h3>
              <p className="text-stone-400 text-sm leading-relaxed">
                Eight components, each scored and weighted. Pitcher, bullpen, offense, defense, matchup, park, weather, rest. Open every drawer.
              </p>
            </div>

          </div>
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

      {/* ============ TRUST FOOTER ============ */}
      <section className="px-6 py-24 border-t border-stone-800 bg-stone-900/30">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-6">
            ⊕ Information only
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-light mb-6 leading-tight">
            Every prediction logged.<br />
            Every result graded.<br />
            <em className="italic text-yellow-300 font-normal">Publicly tracked.</em>
          </h2>
          <p className="text-stone-400 mb-8 leading-relaxed">
            We don&apos;t pick winners. We surface what the data says. You decide what it means.
            No betting advice, no tipping service, no cherry-picked highlights.
          </p>
          <Link href="/track-record" className="inline-block bg-stone-100 text-stone-900 font-semibold px-6 py-3 hover:bg-yellow-300 transition">
            See the public track record →
          </Link>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="px-6 py-20 border-t border-stone-800">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-serif font-light mb-4">
            Get tomorrow morning&apos;s brief.
          </h2>
          <p className="text-stone-400 mb-8">
            Free. Three hours before first pitch. Your inbox.
          </p>
          <form action="/api/subscribe" method="POST" className="flex gap-2 max-w-md mx-auto flex-col sm:flex-row">
            <input type="hidden" name="source" value="home_footer" />
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="flex-1 px-4 py-4 bg-stone-900 border border-stone-800 text-stone-100 outline-none focus:border-stone-600"
            />
            <button type="submit" className="px-6 py-4 bg-stone-100 text-stone-900 font-semibold hover:bg-yellow-300 transition">
              Get the brief →
            </button>
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