'use client'

/**
 * src/components/fantasy/FantasySubNav.tsx
 *
 * Rebuilt for the ground-up fantasy IA. Persistent horizontal nav strip
 * below the masthead on every fantasy page. Scrollable on mobile.
 *
 *   <FantasySubNav active="start-sit" isPro={isPro} />
 *
 * active prop options:
 *   'home' | 'start-sit' | 'trending' | 'yesterday' | 'prospects'
 *   | 'trade-desk' | 'streamers' | 'two-start' | 'news'
 */

import Link from 'next/link'

const NAV_ITEMS = [
  { label: 'Desk',        href: '/fantasy',              key: 'home',       proOnly: false },
  { label: 'Start/Sit',   href: '/fantasy/start-sit',    key: 'start-sit',  proOnly: true  },
  { label: 'Trending',    href: '/fantasy/trending',     key: 'trending',   proOnly: true  },
  { label: 'Yesterday',   href: '/fantasy/yesterday',    key: 'yesterday',  proOnly: false },
  { label: 'Prospects',   href: '/fantasy/prospects',    key: 'prospects',  proOnly: true  },
  { label: 'Trade Desk',  href: '/fantasy/trade-desk',   key: 'trade-desk', proOnly: true  },
  { label: 'Streamers',   href: '/fantasy/streamers',    key: 'streamers',  proOnly: true  },
  { label: 'Two-Start',   href: '/fantasy/two-start',    key: 'two-start',  proOnly: true  },
  { label: 'News Wire',   href: '/fantasy/news',         key: 'news',       proOnly: false },
] as const

type NavKey = typeof NAV_ITEMS[number]['key']

export default function FantasySubNav({ active, isPro = false }: { active: NavKey; isPro?: boolean }) {
  return (
    <div className="border-b border-stone-900 bg-[#FAF8F3] sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center overflow-x-auto scrollbar-hide gap-0">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active
            const showLock = item.proOnly && !isPro
            const href = showLock ? '/pricing' : item.href
            return (
              <Link
                key={item.key}
                href={href}
                className={`
                  relative shrink-0 px-4 py-3 font-mono text-[11px] tracking-widest uppercase
                  transition-colors whitespace-nowrap flex items-center gap-1.5 border-b-2
                  ${isActive
                    ? 'text-[#1A1A1A] border-[#FF5722] font-bold'
                    : 'text-stone-400 border-transparent hover:text-stone-700'}
                `}
              >
                {item.label}
                {showLock && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-stone-300">
                    <rect x="3" y="11" width="18" height="11" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}