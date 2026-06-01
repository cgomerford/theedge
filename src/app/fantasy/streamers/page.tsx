import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getStreamersWeek } from '@/lib/fantasy-streamers'
import { getCurrentSubscriber } from '@/lib/auth'
import FantasyPlayerCard from '@/components/fantasy/FantasyPlayerCard'

export const revalidate = 1800
export const metadata = {
  title: 'Streamer Board · The Fantasy Desk · The Edge',
  description: 'Seven days of pitcher streamer picks — every arm, every matchup, with the math behind each call.',
}

export default async function StreamersPage() {
  const [days, subscriber] = await Promise.all([
    getStreamersWeek(7),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const totalPicks = days.reduce((sum, d) => sum + d.picks.length, 0)
  const strongCount = days.reduce(
    (sum, d) => sum + d.picks.filter(p => (p.signal_score ?? 0) >= 70).length,
    0
  )

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
            <span>Streamer Board</span>
          </div>
          <span className="text-stone-300">7-Day View</span>
        </div>
      </div>

      {/* ════ TITLE BLOCK ════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-700 mb-2">
            § Streamer Board
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            The week in arms<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Every streamer call from the past week. Tap a card to see what drove each score.
          </p>
        </div>
      </div>

      {/* ════ STATS STRIP ════════════════════════════════════════════ */}
      <div className="border-b border-stone-200">
        <div className="max-w-5xl mx-auto grid grid-cols-3">
          <div className="py-4 text-center border-r border-stone-200">
            <div className="font-serif text-3xl font-semibold leading-none text-stone-900">
              {totalPicks}
            </div>
            <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">
              Total calls
            </div>
          </div>
          <div className="py-4 text-center border-r border-stone-200">
            <div className="font-serif text-3xl font-semibold leading-none text-emerald-600">
              {strongCount}
            </div>
            <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">
              Strong streams
            </div>
          </div>
          <div className="py-4 text-center">
            <div className="font-serif text-3xl font-semibold leading-none text-stone-900">
              7
            </div>
            <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">
              Day window
            </div>
          </div>
        </div>
      </div>

      {/* ════ DAY-BY-DAY BOARD ═══════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {days.map((day) => (
          <section key={day.date} id={day.date}>
            {/* Day header */}
            <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-stone-200">
              <h2 className="font-serif font-light text-2xl text-stone-900">
                {day.isToday ? 'Tonight' : day.displayDate}
              </h2>
              {day.isToday && (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[9px] tracking-widest uppercase text-emerald-600">
                    Live
                  </span>
                </span>
              )}
              <div className="flex-1" />
              <span className="font-mono text-[10px] tracking-widest uppercase text-stone-400">
                {day.picks.length} {day.picks.length === 1 ? 'call' : 'calls'}
              </span>
            </div>

            {/* Picks for this day */}
            {day.picks.length > 0 ? (
              <div className="space-y-2.5">
                {day.picks.map((p) => (
                  <FantasyPlayerCard key={p.id} pick={p} />
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-4 text-sm text-stone-500 font-serif italic">
                {day.isToday
                  ? 'Picks compute at 11:30 PM UK. Check back later.'
                  : 'No picks logged for this day.'}
              </div>
            )}
          </section>
        ))}

        {/* ════ PRO UPSELL ═════════════════════════════════════════════ */}
        {!isPro && (
          <section className="bg-stone-900 rounded-lg p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  ⊕ Pro Tier · £4/mo · Founding 100
                </div>
                <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                  Want streamers for the week ahead?
                </h3>
                <p className="text-sm text-stone-400 font-serif">
                  Pro members see 7-day forward projections — not just past calls.
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
            <Link href="/tonight" className="hover:text-stone-600 transition">Tonight</Link>
            <Link href="/track-record" className="hover:text-stone-600 transition">Track Record</Link>
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
