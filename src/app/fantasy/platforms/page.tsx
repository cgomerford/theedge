import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getFantasyPicks } from '@/lib/fantasy'
import { getCurrentSubscriber } from '@/lib/auth'
import PlatformBreakdown from '@/components/fantasy/PlatformBreakdown'

export const revalidate = 1800
export const metadata = {
  title: 'Platforms · The Fantasy Desk · The Edge',
  description: 'Same pitcher, five platforms, five point totals. See which platform rewards tonight\'s streamers the most.',
}

export default async function PlatformsPage() {
  const [{ picks, forDate, isStale }, subscriber] = await Promise.all([
    getFantasyPicks(),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const displayDate = new Date(forDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />

      {/* ════ MASTHEAD ════════════════════════════════════════════════ */}
      <div className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-stone-400">
          <div className="flex items-center gap-4">
            <Link href="/fantasy" className="text-orange-600 hover:text-orange-700 transition">
              ← Fantasy Desk
            </Link>
            <span>{displayDate}</span>
          </div>
          <span className="text-stone-300">Platform Translator</span>
        </div>
      </div>

      {/* ════ TITLE BLOCK ════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-violet-700 mb-2">
            ⚖ Platform Translator
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Five platforms<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Same pitcher, different point totals. See which platform rewards tonight&apos;s streamers most.
          </p>
        </div>
      </div>

      {/* ════ HOW IT WORKS ═══════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-lg border border-stone-200 p-5 sm:p-6 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            § How the translator works
          </div>
          <p className="text-sm text-stone-600 leading-relaxed mb-4">
            We project each streamer&apos;s line for tonight — IP, K, ER, BB, H — based on their season averages adjusted for opponent quality. Then we run that line through each platform&apos;s scoring formula.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="border-l-2 border-purple-500 pl-3">
              <div className="font-mono font-bold text-stone-700 mb-1">Yahoo / Sleeper</div>
              <div className="text-stone-500 leading-snug">2.25 pts/IP · 1 pt/K · negative on ER/BB/H</div>
            </div>
            <div className="border-l-2 border-red-500 pl-3">
              <div className="font-mono font-bold text-stone-700 mb-1">ESPN / CBS</div>
              <div className="text-stone-500 leading-snug">3 pts/IP · 5-7 pt win · K reward varies</div>
            </div>
            <div className="border-l-2 border-green-700 pl-3">
              <div className="font-mono font-bold text-stone-700 mb-1">DraftKings</div>
              <div className="text-stone-500 leading-snug">DFS scoring: 2 pts/K · 4 pt win · 2.25/IP</div>
            </div>
          </div>
        </div>
      </div>

      {/* ════ TONIGHT'S STREAMERS ════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[9px] tracking-widest uppercase text-orange-600 font-bold whitespace-nowrap">
              § Tonight&apos;s streamers
            </span>
            <div className="flex-1 h-px bg-stone-200" />
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-[9px] tracking-widest uppercase text-emerald-600">
                Live
              </span>
            </span>
          </div>
          <p className="text-[11px] font-mono text-stone-400 mb-4 tracking-wide">
            Tap a card to see the per-platform points breakdown
          </p>

          {picks.streamer.length > 0 ? (
            <div className="space-y-3">
              {picks.streamer.map((p) => (
                <PlatformBreakdown key={p.id} pick={p} />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
              No streamers computed yet for tonight. Picks generate at 11:30 PM UK.
            </div>
          )}
        </div>

        {/* ════ KEY TAKEAWAYS ══════════════════════════════════════════ */}
        {picks.streamer.length > 0 && (
          <div className="bg-stone-900 rounded-lg p-6 sm:p-8">
            <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-3">
              § The takeaway
            </div>
            <p className="text-base text-white font-serif font-light leading-relaxed">
              If you play on DraftKings or any DFS platform, <span className="text-yellow-300 font-semibold">K-heavy streamers gain extra value</span> — the 2-pts-per-K formula doubles their upside vs. season-long platforms.
            </p>
            <p className="text-sm text-stone-400 mt-3 font-serif leading-relaxed">
              On ESPN and CBS, <span className="text-stone-200">innings-eaters with low ERA</span> score best — the IP bonus rewards length over strikeouts. On Yahoo and Sleeper, it&apos;s a balanced middle ground.
            </p>
          </div>
        )}

        {/* ════ PRO UPSELL ═════════════════════════════════════════════ */}
        {!isPro && (
          <section className="bg-stone-900 rounded-lg p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  ⊕ Pro Tier · £4/mo · Founding 100
                </div>
                <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                  Set your scoring rules.
                </h3>
                <p className="text-sm text-stone-400 font-serif">
                  Pro members can input custom league scoring (any platform, any rules) and see personalised projections per pitcher.
                </p>
              </div>
              <Link
                href="/pricing"
                className="shrink-0 text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-6 py-3 hover:bg-yellow-200 transition whitespace-nowrap rounded"
              >
                See Pro →
              </Link>
            </div>
          </section>
        )}
      </div>

      {/* ════ FOOTER ═════════════════════════════════════════════════ */}
      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/fantasy" className="hover:text-stone-600 transition">Fantasy Desk</Link>
            <Link href="/fantasy/streamers" className="hover:text-stone-600 transition">Streamer Board</Link>
            <Link href="/tonight" className="hover:text-stone-600 transition">Tonight</Link>
            <Link href="/about" className="hover:text-stone-600 transition">About</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}