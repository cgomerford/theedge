'use client'
/**
 * Persistent fantasy nav. Slimmed to the six rooms a weekly manager
 * actually lives in; deeper boards (streamers, two-start, wrap, news)
 * stay linked from the Desk instead of competing for the tab strip.
 */
import Link from 'next/link'

const NAV_ITEMS = [
  { label: 'Desk',      href: '/fantasy',           key: 'home',       proOnly: false },
  { label: 'My League', href: '/fantasy/league',    key: 'league',     proOnly: false },
  { label: 'Wire',      href: '/fantasy/start-sit', key: 'start-sit',  proOnly: true  },
  { label: 'Trade',     href: '/fantasy/trade-desk',key: 'trade-desk', proOnly: true  },
  { label: 'Farm',      href: '/fantasy/prospects', key: 'prospects',  proOnly: true  },
  { label: 'Recap',     href: '/fantasy/yesterday', key: 'yesterday',  proOnly: false },
] as const

type VisibleKey = typeof NAV_ITEMS[number]['key']
export type NavKey =
  | VisibleKey
  | 'streamers' | 'pitchers' | 'platforms' | 'two-start'
  | 'trends' | 'trending' | 'wrap' | 'news'

const ACTIVE_ALIAS: Partial<Record<NavKey, VisibleKey>> = {
  streamers: 'start-sit',
  pitchers: 'start-sit',
  platforms: 'start-sit',
  'two-start': 'start-sit',
  trends: 'trade-desk',
  trending: 'trade-desk',
  wrap: 'yesterday',
  news: 'yesterday',
}

export default function FantasySubNav({ active, isPro = true }: { active?: NavKey; isPro?: boolean }) {
  const highlight = active ? (ACTIVE_ALIAS[active] ?? active) : undefined
  return (
    <div className="border-b border-stone-200/80 bg-[#FAF8F3]/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center overflow-x-auto scrollbar-hide gap-0">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === highlight
            const showLock = item.proOnly && !isPro
            const href = showLock ? '/pricing' : item.href
            return (
              <Link
                key={item.key}
                href={href}
                className={`
                  relative shrink-0 px-4 py-3 font-mono text-[11px] tracking-widest uppercase
                  transition-colors whitespace-nowrap flex items-center gap-1.5
                  ${isActive
                    ? 'text-orange-600 font-bold'
                    : 'text-stone-400 hover:text-stone-700'
                  }
                `}
              >
                {item.label}
                {showLock && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-orange-600 rounded-full" />
                )}
              </Link>
            )
          })}
          <div className="ml-auto shrink-0 pl-4 py-3">
            <Link
              href="/pricing"
              className="font-mono text-[9px] tracking-widest uppercase bg-yellow-300 text-stone-900 px-2.5 py-1 font-bold hover:bg-yellow-200 transition rounded-full whitespace-nowrap"
            >
              Pro ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
