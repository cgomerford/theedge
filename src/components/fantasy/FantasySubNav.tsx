'use client'

 //**
 //src/components/fantasy/FantasySubNav.tsx
  //*
  //* Persistent horizontal nav strip below the masthead on every fantasy page.
  //* Matches confirmed pages on disk (verified via `ls src/app/fantasy/*/page.tsx`
  //* on 2026-07-16): home, pitchers, platforms, prospects, start-sit, streamers,
  //* trade-desk, trending, trends, two-start, yesterday.
  //*
  //* NOTE: 'batters' and 'news' were removed — the pitchers page footer links
  //* to /fantasy/batters and /fantasy/news, but neither directory exists on
  //* disk. Those links will 404 until those pages are built; add the keys
  // back here once they exist.
  //*
 //  <FantasySubNav active="start-sit" isPro={isPro} />
 

import Link from 'next/link'

const NAV_ITEMS = [
  { label: 'Desk',        href: '/fantasy',              key: 'home',       proOnly: false },
  { label: 'Pitchers',    href: '/fantasy/pitchers',     key: 'pitchers',   proOnly: true  },
  { label: 'Platforms',   href: '/fantasy/platforms',    key: 'platforms',  proOnly: true  },
  { label: 'Trends',      href: '/fantasy/trends',       key: 'trends',     proOnly: true  },
  { label: 'Start/Sit',   href: '/fantasy/start-sit',    key: 'start-sit',  proOnly: true  },
  { label: 'Trending',    href: '/fantasy/trending',     key: 'trending',   proOnly: true  },
  { label: 'Yesterday',   href: '/fantasy/yesterday',    key: 'yesterday',  proOnly: false },
  { label: 'Prospects',   href: '/fantasy/prospects',    key: 'prospects',  proOnly: true  },
  { label: 'Trade Desk',  href: '/fantasy/trade-desk',   key: 'trade-desk', proOnly: true  },
  { label: 'Streamers',   href: '/fantasy/streamers',    key: 'streamers',  proOnly: true  },
  { label: 'Two-Start',   href: '/fantasy/two-start',    key: 'two-start',  proOnly: true  },
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