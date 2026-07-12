'use client'

/**
 * src/components/fantasy/FantasySubNav.tsx
 *
 * Bold dark top nav — restyled from the original stone-50 horizontal bar
 * to a confident, sports-app-style nav (dark background, underline active
 * state, bold tabs) per the ESPN-inspired direction. Same NAV_ITEMS/active
 * prop contract as before, so no other file needs to change to pick this up.
 *
 * active prop options:
 *   'home' | 'pitchers' | 'batters' | 'trends' | 'two-start' | 'platforms'
 */

import Link from 'next/link'

const NAV_ITEMS = [
  { label: 'Desk',       href: '/fantasy',           key: 'home',      proOnly: false },
  { label: 'Pitchers',   href: '/fantasy/pitchers',  key: 'pitchers',  proOnly: true  },
  { label: 'Batters',    href: '/fantasy/batters',   key: 'batters',   proOnly: true  }, // page not built yet — this link 404s until it exists
  { label: 'Trends',     href: '/fantasy/trends',    key: 'trends',    proOnly: true  },
  { label: 'Two-Start',  href: '/fantasy/two-start', key: 'two-start', proOnly: true  },
  { label: 'Platforms',  href: '/fantasy/platforms', key: 'platforms', proOnly: true  },
] as const
// News dropped from nav — /fantasy/news was cut as a standalone page per the
// re-architecture; NewsWire stays as an inline widget on the Desk only.
//
// Two-Start ADDED back in — the page (/fantasy/two-start) is real and live
// (it's in sitemap.ts alongside streamers/platforms), it was just missing
// from this nav list, unlike News which was deliberately cut. Confirm this
// is right if "Two-Start" isn't the label you want — I haven't seen the
// page's own content, just inferred it belongs here from the build error
// and the sitemap entry.

type NavKey = typeof NAV_ITEMS[number]['key']

export default function FantasySubNav({ active, isPro = false }: { active: NavKey; isPro?: boolean }) {
  return (
    <div className="bg-[#1A1A1A] sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center overflow-x-auto scrollbar-hide gap-0 h-14">
          <span className="font-mono text-lg tracking-wide text-white pr-6 border-r border-white/15 mr-1 shrink-0 whitespace-nowrap">
            ⊕ <span className="text-orange-500">Fantasy</span>
          </span>
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active
            const showLock = item.proOnly && !isPro
            const href = showLock ? '/pricing' : item.href
            return (
              <Link
                key={item.key}
                href={href}
                className={`
                  relative shrink-0 px-4 h-14 flex items-center gap-1.5
                  font-mono text-xs uppercase tracking-wider whitespace-nowrap transition-colors
                  ${isActive ? 'text-white font-bold' : 'text-white/55 hover:text-white'}
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
                  <span className="absolute bottom-0 left-4 right-4 h-[3px] bg-orange-500" />
                )}
              </Link>
            )
          })}

          <div className="ml-auto shrink-0 pl-4">
            <Link
              href="/pricing"
              className="font-mono text-[10px] tracking-widest uppercase bg-yellow-300 text-stone-900 px-3.5 py-2 font-bold hover:bg-yellow-200 transition whitespace-nowrap"
            >
              Pro ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}