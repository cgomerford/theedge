import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import FantasySubNav from '@/components/fantasy/FantasySubNav'
import { getFantasyNews, type NewsItem } from '@/lib/fantasy-news'
import { getCurrentSubscriber } from '@/lib/auth'

export const revalidate = 900
export const metadata = {
  title: 'News · The Fantasy Desk · The Edge',
  description: 'Fantasy-relevant MLB news: injuries, lineup changes, call-ups, demotions, and trades.',
}

const CATEGORY_META = {
  injury:      { label: 'Injuries',     color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500'     },
  lineup:      { label: 'Lineups',      color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-500'   },
  transaction: { label: 'Transactions', color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-500'    },
  general:     { label: 'General',      color: 'text-stone-700',   bg: 'bg-stone-100',  dot: 'bg-stone-400'   },
} as const

export default async function NewsPage() {
  const [news, subscriber] = await Promise.all([
    getFantasyNews(),
    getCurrentSubscriber(),
  ])
  const isPro = subscriber?.is_pro ?? false

  const counts = {
    injury:      news.filter(n => n.category === 'injury').length,
    lineup:      news.filter(n => n.category === 'lineup').length,
    transaction: news.filter(n => n.category === 'transaction').length,
    general:     news.filter(n => n.category === 'general').length,
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900 overflow-x-hidden">
      <SiteHeader variant="page" />
      <FantasySubNav active="news" isPro={isPro} />

      <div className="border-b-2 border-stone-900 bg-stone-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-blue-700 mb-2">
            § News Wire
          </div>
          <h1 className="font-serif font-light text-5xl sm:text-7xl tracking-tight leading-none">
            What just dropped<span className="text-orange-600">.</span>
          </h1>
          <p className="text-stone-500 font-serif italic mt-3 text-base sm:text-lg max-w-2xl">
            Injuries, lineup news, transactions — everything that moves your fantasy roster.
          </p>
        </div>
      </div>

      {/* CATEGORY COUNTS */}
      <div className="border-b border-stone-200">
        <div className="max-w-5xl mx-auto grid grid-cols-4">
          <CountCell label="Injuries"     count={counts.injury}      color="text-red-600"    targetId="injury" />
          <CountCell label="Lineups"      count={counts.lineup}      color="text-amber-600"  targetId="lineup" />
          <CountCell label="Transactions" count={counts.transaction} color="text-blue-600"   targetId="transaction" />
          <CountCell label="General"      count={counts.general}     color="text-stone-600"  targetId="general" />
        </div>
      </div>

      {/* NEWS FEED */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {news.length === 0 ? (
          <div className="border border-dashed border-stone-300 rounded-lg bg-stone-50 p-6 text-sm text-stone-500 font-serif italic text-center">
            News feed is quiet right now. Check back in a few minutes.
          </div>
        ) : (
          <div className="space-y-2">
            {news.map((item, i) => <NewsRow key={i} item={item} />)}
          </div>
        )}

        <p className="text-[10px] text-stone-400 italic mt-6 font-serif text-center">
          Aggregated from Google News RSS. We don&apos;t edit or filter for accuracy — always verify with the source link.
        </p>
      </div>

      <footer className="border-t border-stone-200 mt-8 px-4 sm:px-6 py-8 text-[11px] font-mono text-stone-400 bg-stone-50">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/fantasy" className="hover:text-stone-600 transition">Fantasy Desk</Link>
            <Link href="/fantasy/streamers" className="hover:text-stone-600 transition">Streamers</Link>
            <Link href="/fantasy/platforms" className="hover:text-stone-600 transition">Platforms</Link>
          </div>
          <div className="text-stone-300 uppercase tracking-wider">Information only · Not gambling advice</div>
        </div>
      </footer>
    </main>
  )
}

function CountCell({ label, count, color, targetId }: { label: string; count: number; color: string; targetId: string }) {
  return (
    <a href={`#${targetId}`} className="py-4 text-center border-r border-stone-200 last:border-r-0 hover:bg-stone-50 transition">
      <div className={`font-serif text-3xl font-semibold leading-none ${color}`}>{count}</div>
      <div className="font-mono text-[9px] tracking-widest uppercase text-stone-400 mt-1">{label}</div>
    </a>
  )
}

function NewsRow({ item }: { item: NewsItem }) {
  const meta = CATEGORY_META[item.category]
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-lg border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${meta.dot} mt-2 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="font-serif font-medium text-sm text-stone-900 leading-snug line-clamp-2">
            {item.title}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`font-mono text-[9px] tracking-widest uppercase font-bold ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-stone-300">·</span>
            <span className="font-mono text-[10px] text-stone-500">{item.source}</span>
            <span className="text-stone-300">·</span>
            <span className="font-mono text-[10px] text-stone-400">{item.publishedDisplay}</span>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-stone-300 shrink-0 mt-1">
          <path d="M6 4h6v6M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </a>
  )
}