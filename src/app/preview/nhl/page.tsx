import SiteHeader from '@/components/SiteHeader'
import Link from 'next/link'

export const metadata = {
  title: 'NHL Preview · The Edge',
  description: 'NHL game analysis from The Edge — ice metrics, goaltending data, and the strategic story before puck drop. Coming soon.',
}

export default function NHLPreviewPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-950 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* Coming Soon Banner */}
      <div className="bg-yellow-300 text-stone-900 py-2.5 px-4 text-center">
        <p className="text-xs font-mono uppercase tracking-widest font-bold">
          ⊕ NHL coverage coming soon —{' '}
          <Link href="/#signup" className="underline hover:no-underline">
            get notified at launch →
          </Link>
        </p>
      </div>

      {/* League Ticker (static demo) */}
      <div className="w-full bg-stone-900 text-stone-400 text-[11px] font-mono uppercase tracking-wider py-2 border-b border-stone-800 overflow-x-hidden">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-4 sm:gap-6">
          <span className="text-white bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold shrink-0">NHL · TODAY</span>
          <span className="truncate">NYR @ TBL <span className="text-yellow-400">7:00 PM EST</span></span>
          <span className="text-stone-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline">EDM @ VAN <span className="text-stone-500">10:00 PM EST</span></span>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        {/* Demo label */}
        <div className="bg-stone-100 border border-stone-200 px-4 py-3 flex items-start gap-3">
          <span className="text-orange-600 font-mono text-xs font-bold shrink-0 mt-0.5">DEMO</span>
          <p className="text-xs text-stone-600 leading-relaxed">
            This is a preview of what NHL coverage on The Edge will look like.
            The data below is illustrative — real game analysis goes live when coverage launches.{' '}
            <Link href="/#signup" className="text-orange-600 hover:underline font-semibold">
              Sign up free to get notified.
            </Link>
          </p>
        </div>

        {/* Title section */}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
            NHL · TUESDAY, MARCH 4 · AMALIE ARENA
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-light tracking-tight text-stone-900 leading-none">
            Rangers{' '}
            <span className="font-serif italic font-normal text-stone-400 text-3xl sm:text-4xl">
              at
            </span>{' '}
            Lightning
          </h1>
          <div className="grid grid-cols-2 gap-4 pt-4 text-sm border-t border-stone-200 mt-4">
            <div>
              <span className="text-xs font-mono uppercase text-stone-400 block">AWAY</span>
              <span className="font-bold text-stone-900">New York Rangers</span>{' '}
              <span className="text-xs text-stone-500">(43-18-4)</span>
              <span className="text-xs font-mono block text-stone-600 mt-0.5">Goalie: Igor Shesterkin</span>
            </div>
            <div>
              <span className="text-xs font-mono uppercase text-stone-400 block">HOME</span>
              <span className="font-bold text-stone-900">Tampa Bay Lightning</span>{' '}
              <span className="text-xs text-stone-500">(37-23-6)</span>
              <span className="text-xs font-mono block text-stone-600 mt-0.5">Goalie: Andrei Vasilevskiy</span>
            </div>
          </div>
        </div>

        {/* § THE STORY */}
        <section className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">§ THE STORY</div>
          <p className="font-serif text-xl text-stone-800 leading-relaxed italic">
            &ldquo;Shesterkin&apos;s elite high-danger save percentage tilts this decisively — but Tampa&apos;s
            5v5 shot generation at home has been relentless, and Vasilevskiy&apos;s back-to-back rest
            advantage narrows the gap more than the raw numbers suggest.&rdquo;
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
              <div className="text-5xl font-serif font-black text-yellow-400 leading-none">-2.1</div>
              <div className="text-xs font-mono uppercase tracking-widest text-stone-400 mt-1">EDGE FAVORS</div>
              <div className="text-xl font-serif font-bold text-white tracking-tight mt-0.5">NEW YORK RANGERS</div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 uppercase tracking-wider font-semibold shrink-0">
              ✓ LINEUPS CONFIRMED
            </span>
          </div>

          <p className="text-stone-300 font-serif text-sm italic border-l-2 border-yellow-400 pl-4 mb-6 leading-relaxed">
            &ldquo;Shesterkin&apos;s goaltending net factor (+22.4 GSAE) creates a meaningful structural advantage
            against Tampa&apos;s high-volume shot generation, despite the Lightning&apos;s home-ice Corsi edge.&rdquo;
          </p>

          {/* Slider */}
          <div className="relative pt-4">
            <div className="flex justify-between text-[10px] font-mono text-stone-400 uppercase tracking-widest mb-1">
              <span>← STRONG NYR</span>
              <span>EVEN</span>
              <span>STRONG TBL →</span>
            </div>
            <div className="w-full h-1.5 bg-stone-800 relative overflow-hidden flex">
              <div className="w-1/2 h-full bg-gradient-to-r from-blue-600 to-stone-700" />
              <div className="w-1/2 h-full bg-gradient-to-r from-stone-700 to-sky-500" />
            </div>
            <div className="absolute top-[22px] left-[46%] w-0.5 h-3 bg-white shadow-md" />
            <span className="absolute top-[34px] left-[44%] text-[10px] font-mono font-bold text-yellow-400">-2.1</span>
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
                    <h4 className="font-bold text-stone-900 leading-tight">5v5 Offensive Drive</h4>
                    <span className="text-[10px] font-mono uppercase text-stone-400 tracking-wider">XG GENERATION + CORSI RATIO</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold bg-sky-600 text-white px-2 py-0.5">TBL</span>
                  <span className="font-mono font-bold text-orange-600 text-lg">+18</span>
                </div>
              </div>
            </div>

            {/* Component 2 — expanded */}
            <div className="border-b border-stone-200 pb-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-start gap-4">
                  <span className="font-mono text-stone-400 text-sm font-bold mt-0.5">2</span>
                  <div>
                    <h4 className="font-bold text-stone-900 leading-tight">Goaltending Net Factor</h4>
                    <span className="text-[10px] font-mono uppercase text-stone-400 tracking-wider">HDSV% + GOALS SAVED ABOVE EXPECTED</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold bg-blue-700 text-white px-2 py-0.5">NYR</span>
                  <span className="font-mono font-bold text-orange-600 text-lg">+36</span>
                </div>
              </div>

              <div className="bg-[#F5F1E8] p-5 border border-stone-200/60 ml-0 sm:ml-8 text-xs font-sans">
                <div className="grid grid-cols-3 text-center border-b border-stone-300 pb-2 mb-2 text-stone-500 font-mono">
                  <div>METRIC</div><div>NYR</div><div>TBL</div>
                </div>
                {[
                  ['HIGH-DANGER SV%', '.892', '.841', true],
                  ['GSAE (SEASON)', '+22.4', '+8.1', true],
                  ['FATIGUE TRACK', '3 Days Rest', 'B2B Rested', false],
                ].map(([metric, nyr, tbl, hasBorder]) => (
                  <div key={String(metric)} className={`grid grid-cols-3 text-center py-1.5 ${hasBorder ? 'border-b border-stone-200/50' : ''}`}>
                    <div className="font-mono text-left text-stone-600">{metric}</div>
                    <div className="font-bold text-emerald-700">{nyr}</div>
                    <div className="text-stone-700">{tbl}</div>
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
              {['Special Teams Distribution', 'Structural Lane Suppression', 'Zone Entry Success Rate'].map((name, i) => (
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
                Full goaltending analytics, powerplay lane heatmaps, zone-entry profiling, special teams breakdowns, and rest/travel flags.
              </p>
            </div>
          </div>
        </section>

        {/* Storylines */}
        <section className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">— TONIGHT&apos;S STORYLINES</div>
          <div className="bg-[#F5F1E8] p-6 border border-stone-200/60 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">RANGERS · AWAY</span>
              </div>
              <div className="space-y-3">
                <div className="py-1 text-sm text-stone-800 leading-relaxed border-b border-stone-300/30">
                  <span className="font-mono text-xs font-bold text-orange-600 mr-1 bg-white px-1 py-0.5 border border-stone-200">.892 HDSV%</span>
                  {' '}— Shesterkin tracks inside historical elite levels on high-velocity crease attempts.
                </div>
                <div className="py-1 text-sm text-stone-800 leading-relaxed">
                  <span className="font-mono text-xs font-bold text-orange-600 mr-1 bg-white px-1 py-0.5 border border-stone-200">+22.4 GSAE</span>
                  {' '}— Goals Saved Above Expected is the highest mark in the league this season.
                </div>
              </div>
            </div>
            <div className="h-px bg-stone-300/50" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-500">LIGHTNING · HOME</span>
              </div>
              <div className="space-y-3">
                <div className="py-1 text-sm text-stone-800 leading-relaxed border-b border-stone-300/30">
                  <span className="font-mono text-xs font-bold text-orange-600 mr-1 bg-white px-1 py-0.5 border border-stone-200">58.2% CF%</span>
                  {' '}— Tampa generates more 5v5 shot attempts than 28 of 32 NHL teams at home.
                </div>
                <div className="py-1 text-sm text-stone-800 leading-relaxed">
                  <span className="font-mono text-xs font-bold text-orange-600 mr-1 bg-white px-1 py-0.5 border border-stone-200">B2B REST</span>
                  {' '}— Vasilevskiy enters on back-to-back rest — fresh legs, no carry-over fatigue.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Projected lineups */}
        <section className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">§ PROJECTED LINEUPS</div>
          <div className="bg-white border border-stone-200 overflow-hidden shadow-sm">
            <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 bg-blue-700 shrink-0" />
                <span className="font-serif font-bold text-stone-900">New York First Line</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 font-bold uppercase">
                CONFIRMED
              </span>
            </div>
            <div className="divide-y divide-stone-100 font-sans text-xs">
              {[
                { pos: 'LW', name: 'Artemi Panarin', num: '#10', stat1Label: 'GOALS', stat1: '38', stat2Label: 'ASSISTS', stat2: '54' },
                { pos: 'C', name: 'Mika Zibanejad', num: '#93', stat1Label: 'GOALS', stat1: '22', stat2Label: 'ASSISTS', stat2: '41' },
                { pos: 'RW', name: 'Chris Kreider', num: '#20', stat1Label: 'GOALS', stat1: '31', stat2Label: 'ASSISTS', stat2: '24' },
              ].map((p) => (
                <div key={p.name} className="p-4 flex justify-between items-center hover:bg-stone-50/50">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-stone-400 font-bold w-6">{p.pos}</span>
                    <div>
                      <div className="font-bold text-stone-900">{p.name}</div>
                      <div className="text-[10px] text-stone-400">{p.num}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right font-mono">
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">{p.stat1Label}</span>
                      <span className="font-bold text-stone-800">{p.stat1}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">{p.stat2Label}</span>
                      <span className="font-bold text-stone-800">{p.stat2}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Form guide */}
        <section className="space-y-4">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold">§ FORM GUIDE</div>
          <h3 className="text-2xl font-serif font-light text-stone-800">
            How they&apos;re trending.{' '}
            <span className="text-xs font-mono text-stone-400 uppercase tracking-widest ml-1">LAST 10 GAMES</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                color: 'bg-blue-600',
                label: 'RANGERS · STRK: W3',
                quote: 'New York remains highly compressed over clean structural execution patterns — Shesterkin is the difference-maker.',
                record: '7-2-1',
                goals: '3.4',
                diff: '+0.9',
              },
              {
                color: 'bg-sky-500',
                label: 'LIGHTNING · STRK: L1',
                quote: 'Tampa Bay displays explosive single-possession conversion capability across home rink structures.',
                record: '5-4-1',
                goals: '3.1',
                diff: '+0.2',
              },
            ].map((team) => (
              <div key={team.label} className="bg-white border border-stone-200 p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${team.color}`} />
                  <span className="text-xs font-mono uppercase tracking-wider font-bold text-stone-500">{team.label}</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed font-serif italic">&ldquo;{team.quote}&rdquo;</p>
                <div className="grid grid-cols-3 text-center border-t border-stone-100 pt-3">
                  <div>
                    <div className="text-2xl font-serif font-bold text-stone-900">{team.record}</div>
                    <div className="text-[9px] font-mono text-stone-400 uppercase mt-0.5">L10 RECORD</div>
                  </div>
                  <div>
                    <div className="text-2xl font-serif font-bold text-stone-900">{team.goals}</div>
                    <div className="text-[9px] font-mono text-stone-400 uppercase mt-0.5">GOALS / G</div>
                  </div>
                  <div>
                    <div className="text-2xl font-serif font-bold text-stone-900">{team.diff}</div>
                    <div className="text-[9px] font-mono text-stone-400 uppercase mt-0.5">GOAL DIFF</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sign up capture */}
        <section className="bg-stone-900 text-stone-100 p-8">
          <div className="text-xs font-mono uppercase tracking-widest text-orange-400 mb-3">
            — NHL is coming
          </div>
          <h2 className="text-3xl font-serif font-light tracking-tight mb-2">
            Be first in the door.
          </h2>
          <p className="text-stone-400 font-serif mb-6 leading-relaxed">
            NHL analysis drops when coverage launches. Sign up free and we&apos;ll notify you the moment it goes live.
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
