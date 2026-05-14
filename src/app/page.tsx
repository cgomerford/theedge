import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getScheduleForDate, slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { getOverallStats, getRecentPredictions } from '@/lib/track-record'
import { getPredictionsForDate } from '@/lib/edge-fetch'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'

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
{/* ============ FREE VS PRO ============ */}
<section className="px-6 py-24 border-t border-stone-800">
  <div className="max-w-6xl mx-auto">
    <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-4 text-center">
      § What you see
    </div>
    <h2 className="text-4xl md:text-5xl font-serif font-light text-center mb-4">
      Same game.<br className="md:hidden" /> Different depth.
    </h2>
    <p className="text-stone-400 text-center mb-16 max-w-xl mx-auto">
      Free gives you the verdict. Pro gives you the playbook.
    </p>

    <div className="grid md:grid-cols-2 gap-px bg-stone-800 mb-12">

      {/* ============ FREE TIER COLUMN ============ */}
      <div className="bg-stone-950 p-8">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-mono uppercase tracking-widest text-stone-400">
            ◯ Free
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
            Always
          </div>
        </div>
        <h3 className="text-2xl font-serif font-medium mb-2">For the fan.</h3>
        <p className="text-sm text-stone-400 mb-8">
          Enough to get smart. Five-minute reads. Daily email.
        </p>

        {/* Mini Edge Indicator mockup — Free version */}
        <div className="bg-black border border-stone-800 p-5 mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-3">
            ⊕ The Edge Indicator
          </div>
          <div className="flex items-baseline gap-3 mb-3">
            <div className="text-5xl font-serif text-yellow-300 leading-none font-black">+24</div>
            <div className="flex-1">
              <div className="text-[10px] font-mono uppercase text-stone-500 mb-1">Edge favors</div>
              <div className="text-lg font-serif font-bold leading-none">PHILLIES</div>
            </div>
          </div>
          <div className="text-[11px] text-orange-500 font-mono uppercase tracking-wider mb-3">
            — Moderate Edge
          </div>
          <p className="text-xs text-stone-400 font-serif italic mb-4">
            &ldquo;Wheeler&apos;s rolling, Mets bullpen taxed. Phillies edge.&rdquo;
          </p>
          
          {/* Show top 2 components */}
          <div className="space-y-2 pt-3 border-t border-stone-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-stone-500 font-mono uppercase">Starting Pitcher</span>
              <span className="text-stone-300 font-mono">+15</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-stone-500 font-mono uppercase">Bullpen</span>
              <span className="text-stone-300 font-mono">+8</span>
            </div>
            {/* Locked components */}
            <div className="space-y-1 pt-2 mt-2 border-t border-stone-800/50 opacity-50">
              {['Offense', 'Defense', 'Matchup', 'Park', 'Weather', 'Rest'].map(c => (
                <div key={c} className="flex items-center justify-between text-[10px]">
                  <span className="text-stone-600 font-mono uppercase flex items-center gap-1.5">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    {c}
                  </span>
                  <span className="text-stone-700 font-mono">— —</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature list — Free */}
        <div className="space-y-3 text-sm">
          {[
            { label: 'Edge Score + winner', included: true },
            { label: '1-sentence summary', included: true },
            { label: 'Top 2 components', included: true },
            { label: 'Projected lineups (basic stats)', included: true },
            { label: 'Daily email brief', included: true },
            { label: 'Up to 3 followed teams', included: true },
            { label: 'Public Track Record', included: true },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-2 text-stone-300">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ PRO TIER COLUMN ============ */}
      <div className="bg-stone-950 p-8 relative">
        {/* "Best value" sticker */}
        <div className="absolute -top-3 right-6 bg-yellow-300 text-stone-900 text-[10px] font-mono uppercase tracking-widest px-2 py-1 font-semibold">
          Pro tier
        </div>
        
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-mono uppercase tracking-widest text-yellow-300">
            ⊕ Pro
          </div>
          <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
            £6/mo · £60/yr
          </div>
        </div>
        <h3 className="text-2xl font-serif font-medium mb-2">For the analyst.</h3>
        <p className="text-sm text-stone-400 mb-8">
          Enough to win your fantasy league. Full data. Every angle.
        </p>

        {/* Mini Edge Indicator mockup — Pro version */}
        <div className="bg-black border border-yellow-300/30 p-5 mb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 mb-3">
            ⊕ The Edge Indicator · Pro
          </div>
          <div className="flex items-baseline gap-3 mb-3">
            <div className="text-5xl font-serif text-yellow-300 leading-none font-black">+24</div>
            <div className="flex-1">
              <div className="text-[10px] font-mono uppercase text-stone-500 mb-1">Edge favors</div>
              <div className="text-lg font-serif font-bold leading-none">PHILLIES</div>
            </div>
          </div>
          <div className="text-[11px] text-orange-500 font-mono uppercase tracking-wider mb-3">
            — Moderate Edge
          </div>
          
          {/* Full narrative */}
          <p className="text-xs text-stone-300 font-serif italic mb-4 leading-relaxed">
            &ldquo;Wheeler&apos;s been ridiculous lately — three straight under 2 ERA. The Mets bullpen is gassed after last night&apos;s marathon. Real edge here.&rdquo;
          </p>
          
          {/* All 8 components visible */}
          <div className="space-y-2 pt-3 border-t border-stone-800">
            {[
              { c: 'Starting Pitcher', v: '+15', strong: true },
              { c: 'Bullpen', v: '+8', strong: true },
              { c: 'Offense', v: '+4', strong: false },
              { c: 'Defense', v: '+2', strong: false },
              { c: 'Matchup', v: '−1', strong: false },
              { c: 'Park', v: '−3', strong: false },
              { c: 'Weather', v: '+1', strong: false },
              { c: 'Rest', v: '−2', strong: false },
            ].map(item => (
              <div key={item.c} className="flex items-center justify-between text-[10px]">
                <span className={`font-mono uppercase ${item.strong ? 'text-stone-300' : 'text-stone-500'}`}>{item.c}</span>
                <span className={`font-mono ${item.strong ? 'text-orange-500 font-bold' : 'text-stone-400'}`}>{item.v}</span>
              </div>
            ))}
          </div>
          
          {/* Pro feature teases */}
          <div className="mt-4 pt-3 border-t border-stone-800 space-y-1">
            <div className="text-[10px] font-mono uppercase text-yellow-300">
              + Pitcher arsenal chart
            </div>
            <div className="text-[10px] font-mono uppercase text-yellow-300">
              + Batter hot zones · L5 splits
            </div>
            <div className="text-[10px] font-mono uppercase text-yellow-300">
              + Bullpen fatigue tracker
            </div>
          </div>
        </div>

        {/* Feature list — Pro */}
        <div className="space-y-3 text-sm">
          {[
            { label: 'Everything in Free', included: true },
            { label: 'All 8 components with drill-downs', included: true, highlight: true },
            { label: 'Full smart-friend narrative', included: true, highlight: true },
            { label: 'Pitch arsenal effectiveness chart', included: true, highlight: true },
            { label: 'Batter hot zones · L5 splits · vs LHP/RHP', included: true, highlight: true, fantasy: true },
            { label: 'Bullpen fatigue tracker', included: true, highlight: true, fantasy: true },
            { label: 'The Streamer Pick (DFS/Fantasy)', included: true, highlight: true, fantasy: true },
            { label: '"Why we might be wrong" counter-take', included: true, highlight: true },
            { label: 'All sports (MLB · NBA · NHL · NFL)', included: true, highlight: true },
            { label: 'Unlimited team follows', included: true, highlight: true },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-2">
              <span className={`mt-0.5 ${f.highlight ? 'text-yellow-300' : 'text-green-500'}`}>✓</span>
              <span className={f.highlight ? 'text-stone-100' : 'text-stone-300'}>
                {f.label}
                {f.fantasy && (
                  <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-orange-500 bg-orange-500/10 px-1.5 py-0.5">
                    Fantasy
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>

    {/* Bottom CTAs */}
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <a 
        href="#signup"
        className="block bg-stone-900 border border-stone-700 hover:border-stone-500 transition px-6 py-4 text-center"
      >
        <div className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-1">
          Start with free
        </div>
        <div className="text-base font-serif">
          Get tomorrow&apos;s brief →
        </div>
      </a>
      <a 
        href="#signup"
        className="block bg-yellow-300 text-stone-900 hover:bg-yellow-200 transition px-6 py-4 text-center"
      >
        <div className="text-xs font-mono uppercase tracking-widest mb-1">
          ⊕ Pro coming June 1
        </div>
        <div className="text-base font-serif font-semibold">
          Get notified when Pro launches →
        </div>
      </a>
    </div>

    <p className="text-xs font-mono uppercase tracking-widest text-stone-500 text-center mt-8">
      All Pro features ship June 1 · Founding member pricing for first 100
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
<section className="px-6 py-24 border-t border-stone-800">
  <div className="max-w-5xl mx-auto">
    <div className="text-xs font-mono uppercase tracking-widest text-orange-500 mb-4">
      § What&apos;s next
    </div>
    <h2 className="text-4xl md:text-5xl font-serif font-light mb-4">
      MLB is just<br className="md:hidden" /> the start.
    </h2>
    <p className="text-stone-400 mb-12 max-w-xl leading-relaxed">
      The same eight-component model. The same GM briefing. Every sport, every night.
      Pro subscribers get every league on day one.
    </p>

    <div className="grid md:grid-cols-3 gap-px bg-stone-800 border border-stone-800 mb-8">

      {/* NFL */}
      <div className="bg-stone-950 p-8 relative overflow-hidden group">
        <div className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-widest bg-stone-800 text-stone-400 px-2 py-1">
          Sept 2026
        </div>
        <div className="text-3xl mb-4">🏈</div>
        <div className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          NFL · Next Gen Stats
        </div>
        <h3 className="text-xl font-serif font-medium text-stone-100 mb-3">
          National Football League
        </h3>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          DVOA-adjusted matchups. Next Gen target separation. QB pressure rates. O-line vs pass rush edges.
        </p>
        <div className="space-y-1.5">
          {['QB pressure rate vs D-line', 'Target separation by receiver', 'Red zone efficiency L4', 'Weather impact on pass game'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-stone-500 font-mono">
              <span className="text-stone-700">—</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-stone-800">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">
            ⊕ Pro tier · Coming Sept 2026
          </span>
        </div>
      </div>

      {/* NHL */}
      <div className="bg-stone-950 p-8 relative overflow-hidden group">
        <div className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-widest bg-yellow-300/10 text-yellow-300 px-2 py-1">
          Oct 2026
        </div>
        <div className="text-3xl mb-4">🏒</div>
        <div className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          NHL · Stathletes / Natural Stat Trick
        </div>
        <h3 className="text-xl font-serif font-medium text-stone-100 mb-3">
          National Hockey League
        </h3>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          Expected goals model. Corsi + Fenwick adjusted. Goalie GSAx. Power play efficiency edges.
        </p>
        <div className="space-y-1.5">
          {['xG for/against at 5v5', 'Goalie GSAx last 10 starts', 'PP vs PK efficiency matchup', 'Back-to-back fatigue scoring'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-stone-500 font-mono">
              <span className="text-stone-700">—</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-stone-800">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">
            ⊕ Pro tier · Coming Oct 2026
          </span>
        </div>
      </div>

      {/* NBA */}
      <div className="bg-stone-950 p-8 relative overflow-hidden group">
        <div className="absolute top-4 right-4 text-[10px] font-mono uppercase tracking-widest bg-stone-800 text-stone-400 px-2 py-1">
          Oct 2026
        </div>
        <div className="text-3xl mb-4">🏀</div>
        <div className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-2">
          NBA · Second Spectrum
        </div>
        <h3 className="text-xl font-serif font-medium text-stone-100 mb-3">
          National Basketball Assoc.
        </h3>
        <p className="text-sm text-stone-500 leading-relaxed mb-6">
          RAPTOR + EPM adjusted lineups. Rest-days edge. Pace + ortg/drtg matchup deltas. Injury impact scoring.
        </p>
        <div className="space-y-1.5">
          {['Net rating vs opponent DRTG', 'Rest days + travel edge', 'Pace mismatch scoring', 'Injury-adjusted lineup EPM'].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-stone-500 font-mono">
              <span className="text-stone-700">—</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-stone-800">
          <span className="text-xs font-mono uppercase tracking-widest text-stone-600">
            ⊕ Pro tier · Coming Oct 2026
          </span>
        </div>
      </div>

    </div>

    <div className="text-center">
      <p className="text-xs font-mono uppercase tracking-widest text-stone-600">
        Pro subscribers get every sport on launch day · No extra charge
      </p>
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