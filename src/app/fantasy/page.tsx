import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getTonightAllPitchers } from '@/lib/fantasy-ticker'
import { getCurrentSubscriber } from '@/lib/auth'
import FantasyPlayerCard from '@/components/fantasy/FantasyPlayerCard'
import FantasyMoverAlert from '@/components/fantasy/FantasyMoverAlert'
import FantasyTicker from '@/components/fantasy/FantasyTicker'
import FantasySubNav from '@/components/fantasy/FantasySubNav'

export const revalidate = 1800
export const metadata = {
  title: 'The Fantasy Desk · The Edge',
  description: 'Tonight\'s streamers, movers, fallers, and sleepers — what to do with your fantasy roster, with the math behind every call.',
}

/* ════════════════════════════════════════════════════════════════════
 *  PAGE
 * ════════════════════════════════════════════════════════════════════ */
export default async function FantasyPage() {
  const [{ picks, forDate, isStale }, subscriber, tickerPitchers] = await Promise.all([
    getFantasyPicks(),
    getCurrentSubscriber(),
    getTonightAllPitchers(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const displayDate = new Date(forDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const counts = {
    streamer: picks.streamer.length,
    mover:    picks.mover.length,
    faller:   picks.faller.length,
    sleeper:  picks.sleeper.length,
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />
      <FantasySubNav active="home" isPro={isPro} />

      {/* ════ TITLE BLOCK ════════════════════════════════════════════ */}
      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">
            ⊕ The Fantasy Desk
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            Your daily edge<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Streamers, movers, fallers — with the math behind every call.
          </p>
        </div>
      </div>

      {/* ════ TICKER BAR ═════════════════════════════════════════════ */}
      <FantasyTicker pitchers={tickerPitchers} />

      {/* ════ STALE WARNING ══════════════════════════════════════════ */}
      {isStale && (
        <div className="bg-yellow-50 border-b border-yellow-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 text-[11px] font-mono text-yellow-800">
            ⚠ Showing yesterday&apos;s picks — tonight&apos;s computed at 11:30 PM UK. Check back later.
          </div>
        </div>
      )}

      {/* ════ HERO STAT STRIP ════════════════════════════════════════ */}
      <div className="border-b border-stone-200">
        <div className="max-w-5xl mx-auto grid grid-cols-4">
          <HeroCell label="Streamers" count={counts.streamer} color="text-emerald-600" targetId="streamers" />
          <HeroCell label="Movers" count={counts.mover} color="text-orange-600" targetId="movers" />
          <HeroCell label="Fallers" count={counts.faller} color="text-red-600" targetId="fallers" />
          <HeroCell label="Sleepers" count={counts.sleeper} color="text-blue-600" targetId="sleepers" />
        </div>
      </div>

      {/* ════ NAVIGATION HUB ═════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NavCard
            href="/fantasy/streamers"
            title="Streamers"
            desc="7-day board, all 30 teams"
            colorClass="bg-emerald-50 border-emerald-200 hover:border-emerald-400"
            iconBg="bg-emerald-600"
            iconLetter="S"
            proOnly
            isPro={isPro}
          />
          <NavCard
            href="/fantasy/platforms"
            title="Platforms"
            desc="ESPN vs Yahoo vs Sleeper scoring"
            colorClass="bg-violet-50 border-violet-200 hover:border-violet-400"
            iconBg="bg-violet-600"
            iconLetter="P"
            proOnly
            isPro={isPro}
          />
          <NavCard
            href="/fantasy/two-start"
            title="Two-Start"
            desc="Pitchers going twice this week"
            colorClass="bg-amber-50 border-amber-200 hover:border-amber-400"
            iconBg="bg-amber-600"
            iconLetter="2"
            proOnly
            isPro={isPro}
          />
          <NavCard
            href="/fantasy/news"
            title="News Wire"
            desc="Injuries, lineups, transactions"
            colorClass="bg-blue-50 border-blue-200 hover:border-blue-400"
            iconBg="bg-blue-600"
            iconLetter="N"
          />
          <NavCard
            href="#fallers"
            title="Sell / Sit"
            desc="Stars in tough spots tonight"
            colorClass="bg-red-50 border-red-200 hover:border-red-400"
            iconBg="bg-red-600"
            iconLetter="X"
          />
          <NavCard
            href="#sleepers"
            title="Undervalued"
            desc="Regression watch"
            colorClass="bg-indigo-50 border-indigo-200 hover:border-indigo-400"
            iconBg="bg-indigo-600"
            iconLetter="U"
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-10">

        {/* ════ STREAMERS ══════════════════════════════════════════════ */}
        <section id="streamers">
          <SectionDivider label="Tonight's streamers" live />
          <p className="text-[11px] font-mono text-stone-400 mb-3 tracking-wide">
            Tap a card to see the full breakdown
          </p>
          {picks.streamer.length > 0 ? (
            <div className="space-y-2.5">
              {picks.streamer.map((p) => (
                <FantasyPlayerCard key={p.id} pick={p} isPro={isPro} />
              ))}
            </div>
          ) : (
            <EmptyState message="Lineups still pending tonight. Streamers populate when probable pitchers confirm — usually 3-4 hours pre-first-pitch." />
          )}
          <Link
            href="/fantasy/streamers"
            className="inline-flex items-center gap-1 mt-3 font-mono text-[10px] tracking-widest uppercase text-orange-600 hover:text-orange-700 transition"
          >
            Full 7-day streamer board →
          </Link>
        </section>

        {/* ════ MOVERS ═════════════════════════════════════════════════ */}
        <section id="movers">
          <SectionDivider label="Edge movers" />
          {picks.mover.length > 0 ? (
            <div className="space-y-2.5">
              {picks.mover.map((p) => (
                <FantasyMoverAlert key={p.id} pick={p} />
              ))}
            </div>
          ) : (
            <EmptyState message="No big edge swings yet. We snapshot predictions every few hours — check back after lineup news drops." />
          )}
        </section>

        {/* ════ FALLERS ════════════════════════════════════════════════ */}
        <section id="fallers">
          <SectionDivider label="Sell / sit tonight" />
          {picks.faller.length > 0 ? (
            <div className="space-y-2.5">
              {picks.faller.map((p) => (
                <FantasyPlayerCard key={p.id} pick={p} isPro={isPro} />
              ))}
            </div>
          ) : (
            <EmptyState message="Most matchups look favourable tonight. Fallers surface when an elite arm draws a strong-offence club." />
          )}
        </section>

        {/* ════ SLEEPERS ═══════════════════════════════════════════════ */}
        <section id="sleepers">
          <SectionDivider label="Undervalued — regression watch" />
          {picks.sleeper.length > 0 ? (
            <div className="space-y-2.5">
              {picks.sleeper.map((p) => (
                <FantasyPlayerCard key={p.id} pick={p} isPro={isPro} />
              ))}
            </div>
          ) : (
            <EmptyState message="Tonight's slate is clean — no significant ERA/FIP gaps. We surface these when the math justifies it, not to fill space." />
          )}
        </section>

        {/* ════ PRO UPSELL ═════════════════════════════════════════════ */}
        {!isPro && (
          <section className="bg-stone-900 rounded-lg p-6 sm:p-8 -mx-4 sm:mx-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  ⊕ Pro Tier · £4/mo · Founding 100
                </div>
                <h3 className="font-serif font-light text-2xl text-white leading-tight mb-2">
                  Get the full desk in your inbox at 7am.
                </h3>
                <p className="text-sm text-stone-400 font-serif">
                  Hot Zones · Umpire Effect · Bullpen Fatigue · Full splits · DFS slate
                </p>
              </div>
              <Link
                href="/pricing"
                className="shrink-0 text-xs font-mono uppercase tracking-widest bg-yellow-300 text-stone-900 px-6 py-3 hover:bg-yellow-200 transition whitespace-nowrap"
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
            <Link href="/tonight"      className="hover:text-stone-600 transition">Tonight</Link>
            <Link href="/track-record" className="hover:text-stone-600 transition">Track Record</Link>
            <Link href="/about"        className="hover:text-stone-600 transition">About</Link>
            <Link href="/faq"          className="hover:text-stone-600 transition">FAQ</Link>
            <Link href="/privacy"      className="hover:text-stone-600 transition">Privacy</Link>
            <Link href="/terms"        className="hover:text-stone-600 transition">Terms</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">
            Information only · Not gambling advice
          </div>
        </div>
      </footer>
    </main>
  )
}


/* ════════════════════════════════════════════════════════════════════
 *  SUB-COMPONENTS
 * ════════════════════════════════════════════════════════════════════ */

function HeroCell({ label, count, color, targetId }: {
  label: string; count: number; color: string; targetId: string
}) {
  return (
    <a
      href={`#${targetId}`}
      className="py-4 text-center border-r border-stone-200 last:border-r-0 hover:bg-stone-50 transition"
    >
      <div className={`font-serif text-3xl font-semibold leading-none ${color}`}>
        {count}
      </div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">
        {label}
      </div>
    </a>
  )
}

function NavCard({ href, title, desc, colorClass, iconBg, iconLetter, badge, proOnly, isPro }: {
  href?: string; title: string; desc: string; colorClass: string; iconBg: string; iconLetter: string
  badge?: string; proOnly?: boolean; isPro?: boolean
}) {
  const isLocked = proOnly && !isPro
  // Locked cards route to pricing instead of the gated page
  const effectiveHref = isLocked ? '/pricing' : href
  const Wrapper = effectiveHref ? Link : 'div'
  const wrapperProps = effectiveHref ? { href: effectiveHref } : {}
  const isComingSoon = !!badge

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className={`relative border rounded-lg p-4 shadow-sm transition ${colorClass} ${
        isComingSoon
          ? 'opacity-60 cursor-default'
          : 'cursor-pointer hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center mb-2 ${isLocked ? 'opacity-50' : ''}`}>
          <span className="font-mono text-[11px] font-bold text-white">{iconLetter}</span>
        </div>
        {/* Lock badge for Pro-only cards */}
        {isLocked && (
          <span className="flex items-center gap-1 font-mono text-[8px] tracking-widest uppercase bg-stone-900 text-yellow-300 px-2 py-1 font-bold rounded">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Pro
          </span>
        )}
      </div>
      <div className={`font-serif font-semibold text-sm text-stone-900 ${isLocked ? 'opacity-70' : ''}`}>{title}</div>
      <div className={`text-[11px] text-stone-500 leading-snug mt-0.5 ${isLocked ? 'opacity-70' : ''}`}>{desc}</div>
      {badge && (
        <span className="absolute top-3 right-3 font-mono text-[8px] tracking-widest uppercase bg-white/80 text-stone-500 px-2 py-0.5 font-bold rounded">
          {badge}
        </span>
      )}
    </Wrapper>
  )
}

function SectionDivider({ label, live }: { label: string; live?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-orange-600 font-bold whitespace-nowrap">
        § {label}
      </span>
      <div className="flex-1 h-px bg-stone-200" />
      {live && (
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[9px] tracking-widest uppercase text-emerald-600">
            Live
          </span>
        </span>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-5 text-sm text-stone-500 font-serif italic">
      {message}
    </div>
  )
}