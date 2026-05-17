import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'

export const metadata = {
  title: 'NBA Preview · The Edge',
  description: 'NBA game analysis from The Edge — court metrics, matchup breakdowns, and the strategic story before tip-off. Coming soon.',
}

export default function NBAPreviewPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-950 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* Coming Soon Banner */}
      <div className="bg-yellow-300 text-stone-900 py-2.5 px-4 text-center">
        <p className="text-xs font-mono uppercase tracking-widest font-bold">
          ⊕ NBA coverage coming soon —{' '}
          <Link href="/#signup" className="underline hover:no-underline">
            get notified at launch →
          </Link>
        </p>
      </div>

      {/* League Ticker (static demo) */}
      <div className="w-full bg-stone-900 text-stone-400 text-[11px] font-mono uppercase tracking-wider py-2 border-b border-stone-800 overflow-x-hidden">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-6">
          <span className="text-white bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold shrink-0">NBA · TODAY</span>
          <span className="truncate">MIL @ BOS <span className="text-yellow-400">7:30 PM EST</span></span>
          <span className="text-stone-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline">LAL @ GS <span className="text-stone-500">10:00 PM EST</span></span>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* Demo label */}
        <div className="bg-stone-100 border border-stone-200 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 font-mono text-xs font-bold shrink-0 mt-0.5">DEMO</span>
          <p className="text-xs text-stone-600 leading-relaxed">
            This is a preview of what NBA coverage on The Edge will look like.
            The data below is illustrative — real game analysis goes live when coverage launches.{' '}
            <Link href="/#signup" className="text-orange-600 hover:underline font-semibold">
              Sign up free to get notified.
            </Link>
          </p>
        </div>

        {/* Title section */}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
            NBA · MONDAY, MAY 11 · TD GARDEN
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-light tracking-tight text-stone-900 leading-none">
            Bucks{' '}
            <span className="font-serif italic font-normal text-stone-400 text-3xl sm:text-4xl">
              at
            </span>{' '}
            Celtics
          </h1>
          <div className="grid grid-cols-2 gap-4 pt-4 text-sm border-t border-stone-200 mt-4">
            <div>
              <span className="text-xs font-mono uppercase text-stone-400 block">AWAY</span>
              <span className="font-bold text-stone-900">Milwaukee Bucks</span>{' '}
              <span className="text-xs text-stone-500">(49-33)</span>
              <span className="text-xs font-mono block text-stone-600 mt-0.5">Star: Giannis Antetokounmpo</span>
            </div>
            <div>
              <span className="text-xs font-mono uppercase text-stone-400 block">HOME</span>
              <span className="font-bold text-stone-900">Boston Celtics</span>{' '}
              <span className="text-xs text-stone-500">(64-18)</span>
              <span className="text-xs font-mono block text-stone-600 mt-0.5">Star: Jayson Tatum</span>
            </div>
          </div>
        </div>

        {/* § THE STORY */}
        <section className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">§ THE STORY</div>
          <p className="font-serif text-xl text-stone-800 leading-relaxed italic">
            &ldquo;Boston&apos;s defensive perimeter metrics show high capacity to restrict spacing on drop-off vectors,
            leaving Milwaukee over-reliant on high-leverage paint touches inside transition sets.&rdquo;
          </p>
          <div className="text-right text-[11px] font-mono uppercase tracking-widest text-stone-400">— BY THE EDGE</div>
        </section>

        {/* Edge Indicator */}
        <section className="bg-stone-900 text-stone-100 p-6 sm:p-8 shadow-xl border border-stone-800 relative overflow-hidden">
          <div className="flex justify-between items-start mb-6 gap-4">
            <div className="min-w-0">
              <div className="text-xs font-mono uppercase tracking-widest text-orange-500 font-bold mb-1">
                ⊕ THE EDGE INDICATOR · V2
              </div>
              <div className="text-5xl font-serif font-black text-yellow-400 leading-none">+8.5</div>
              <div className="text-xs font-mono uppercase tracking-widest text-stone-400 mt-1">EDGE FAVORS</div>
              <div className="text-xl font-serif font-bold text-white tracking-tight mt-0.5">BOSTON CELTICS</div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 uppercase tracking-wider font-semibold shrink-0">
              ✓ LINEUPS CONFIRMED
            </span>
          </div>

          <p className="text-stone-300 font-serif text-sm italic border-l-2 border-yellow-400 pl-4 mb-6 leading-relaxed">
            &ldquo;Boston&apos;s elite offensive rating at home, combined with Milwaukee&apos;s defensive tracking inefficiencies
            along the corner arc, project a clean baseline edge.&rdquo;
          </p>

          {/* Slider */}
          <div className="relative pt-4">
            <div className="flex justify-between text-[10px] font-mono text-stone-400 uppercase tracking-widest mb-1">
              <span>← STRONG MIL</span>
              <span>EVEN</span>
              <span>STRONG BOS →</span>
            </div>
            <div className="w-full h-1.5 bg-stone-800 relative overflow-hidden flex">
              <div className="w-1/2 h-full bg-gradient-to-r from-emerald-700 to-stone-700" />
              <div className="w-1/2 h-full bg-gradient-to-r from-stone-700 to-emerald-500" />
            </div>
            <div className="absolute top-[22px] left-[59%] w-0.5 h-3 bg-white shadow-md" />
            <span className="absolute top-[34px] left-[58%] text-[10px] font-mono font-bold text-yellow-400">+8.5</span>
          </div>
        </section>

        {/* Components */}
        <section className="space-y-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">— THE EIGHT COMPONENTS</div>
            <h2 className="text-3xl font-serif font-bold tracking-tight text-stone-900 mt-1">
              What&apos;s <span className="italic text-orange-600 font-normal">moving</span> the score.
            </h2>
          </div>

          <div className="space-y-6">
            {/* Component 1 */}
            <div className="border-b border-stone-200 pb-4">
              <div className="flex justify-between items-center">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-stone-400 text-sm font-bold mt-0.5">1</span>
                  <div>
                    <h4 className="font-bold text-stone-900 leading-tight">Offensive Rating</h4>
                    <span className="text-[10px] font-mono uppercase text-stone-400 tracking-wider">ORTG + NET RATING ADJUSTED</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold bg-emerald-600 text-white px-2 py-0.5">BOS</span>
                  <span className="font-mono font-bold text-orange-600 text-lg">+28</span>
                </div>
              </div>
            </div>

            {/* Component 2 — expanded */}
            <div className="border-b border-stone-200 pb-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-stone-400 text-sm font-bold mt-0.5">2</span>
                  <div>
                    <h4 className="font-bold text-stone-900 leading-tight">Paint Dominance</h4>
                    <span className="text-[10px] font-mono uppercase text-stone-400 tracking-wider">PAINT TOUCHES + EFFICIENCY</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold bg-red-700 text-white px-2 py-0.5">MIL</span>
                  <span className="font-mono font-bold text-orange-600 text-lg">+22</span>
                </div>
              </div>

              <div className="bg-[#F5F1E8] p-5 border border-stone-200/60 ml-0 sm:ml-8 text-xs font-sans">
                <div className="grid grid-cols-3 text-center border-b border-stone-300 pb-2 mb-2 text-stone-500 font-mono">
                  <div>METRIC</div><div>MIL</div><div>BOS</div>
                </div>
                {[
                  ['PAINT PTS/G', '52.4', '44.1', true],
                  ['TOUCHES/G', '18.2', '14.8', true],
                  ['PAINT DEF', 'Average', 'Elite', false],
                ].map(([metric, mil, bos, hasBorder]) => (
                  <div key={String(metric)} className={`grid grid-cols-3 text-center py-1.5 ${hasBorder ? 'border-b border-stone-200/50' : ''}`}>
                    <div className="font-mono text-left text-stone-600">{metric}</div>
                    <div className="font-bold text-emerald-700">{mil}</div>
                    <div className="text-stone-700">{bos}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Paywall divider */}
            <div className="relative py-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dashed border-stone-300" />
              </div>
              <span className="relative bg-[#FAF8F3] px-4 text-[10px] font-mono uppercase tracking-widest text-orange-600">
                ⊕ FREE TIER ENDS HERE
              </span>
            </div>

            {/* Locked components */}
            <div className="space-y-4 opacity-50 pointer-events-none select-none">
              {['3-Point Profiling', 'Defensive Assignments', 'Pace & Transition Matrix'].map((name, i) => (
                <div key={name} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-stone-400">{i + 3}</span>
                    <span className="font-bold text-stone-700">{name}</span>
                  </div>
                  <span className="font-mono text-stone-400">⊕ PRO</span>
                </div>
              ))}
            </div>

            {/* Pro CTA */}
            <div className="bg-stone-900 text-stone-100 p-6 border border-stone-800 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <span className="text-[10px] font-mono tracking-widest text-yellow-400 font-bold uppercase">
                    Pro is £4/month or £40/year for our first 100 founding members, then £6/month or £60/year.
                  </span>
                  <h3 className="text-xl font-serif font-bold text-white tracking-tight mt-0.5">
                    Unlock all 8 advanced metrics.
                  </h3>
                </div>
                <Link
                  href="/#signup"
                  className="bg-yellow-400 text-stone-950 font-mono font-bold text-xs uppercase tracking-wider py-2.5 px-4 hover:bg-yellow-300 transition shrink-0"
                >
                  Get notified at launch →
                </Link>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Full court analytics, shot-quality models, defensive assignment tracking, pace profiles, and lineup combination analysis.
              </p>
            </div>
          </div>
        </section>

        {/* Sign up capture */}
        <section className="bg-stone-900 text-stone-100 p-8">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-400 mb-3">
            — NBA is coming
          </div>
          <h2 className="text-3xl font-serif font-light tracking-tight mb-2">
            Be first in the door.
          </h2>
          <p className="text-stone-400 font-serif mb-6 leading-relaxed">
            NBA analysis drops when coverage launches. Sign up free and we&apos;ll notify you the moment it goes live.
            MLB coverage is available right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/#signup"
              className="text-center bg-yellow-300 text-stone-900 font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-yellow-200 transition font-bold"
            >
              Sign up free →
            </Link>
            <Link
              href="/"
              className="text-center border border-stone-600 text-stone-300 font-mono text-xs uppercase tracking-widest px-6 py-3 hover:border-stone-400 transition"
            >
              See tonight&apos;s MLB →
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-8 pt-6 mt-4 border-t border-stone-200 text-center sm:text-left">
        <p className="text-[11px] text-stone-400 font-mono leading-relaxed">
          The Edge — statistical analysis only. Not gambling advice. · {' '}
          <Link href="/faq" className="hover:text-stone-600 transition">FAQ</Link>
          {' · '}
          <Link href="/terms" className="hover:text-stone-600 transition">Terms</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-stone-600 transition">Privacy</Link>
        </p>
      </footer>
    </main>
  )
}
