'use client'

/**
 * src/components/fantasy/FantasySubNav.tsx
 *
 * Persistent horizontal nav strip that sits below the masthead on every
 * fantasy page. Shows all five deep pages + the dashboard home.
 * Active page is highlighted. Scrollable on mobile.
 *
 * Usage: drop <FantasySubNav active="streamers" /> into any fantasy page
 * just below the SiteHeader, replacing the per-page masthead breadcrumb.
 *
 * active prop options:
 *   'home' | 'streamers' | 'platforms' | 'two-start' | 'news' | 'movers'
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Desk',       href: '/fantasy',              key: 'home'       },
  { label: 'Streamers',  href: '/fantasy/streamers',    key: 'streamers'  },
  { label: 'Platforms',  href: '/fantasy/platforms',    key: 'platforms'  },
  { label: 'Two-Start',  href: '/fantasy/two-start',    key: 'two-start'  },
  { label: 'News Wire',  href: '/fantasy/news',         key: 'news'       },
] as const

type NavKey = typeof NAV_ITEMS[number]['key']

export default function FantasySubNav({ active }: { active: NavKey }) {
  return (
    <div className="border-b border-stone-200 bg-stone-50 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center overflow-x-auto scrollbar-hide gap-0">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`
                  relative shrink-0 px-4 py-3 font-mono text-[11px] tracking-widest uppercase
                  transition-colors whitespace-nowrap
                  ${isActive
                    ? 'text-orange-600 font-bold'
                    : 'text-stone-400 hover:text-stone-700'
                  }
                `}
              >
                {item.label}
                {/* Active underline */}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-orange-600" />
                )}
              </Link>
            )
          })}

          {/* Spacer + Pro badge */}
          <div className="ml-auto shrink-0 pl-4 py-3">
            <Link
              href="/pricing"
              className="font-mono text-[9px] tracking-widest uppercase bg-yellow-300 text-stone-900 px-2.5 py-1 font-bold hover:bg-yellow-200 transition rounded-sm whitespace-nowrap"
            >
              Pro ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
