'use client'
/**
 * src/components/fantasy/FantasySubNav.tsx
 *
 * Persistent horizontal nav strip that sits below the masthead on every
 * fantasy page. Shows all deep pages + the dashboard home.
 * Active page is highlighted. Scrollable on mobile.
 *
 * Usage: drop <FantasySubNav active="start-sit" /> into any fantasy page
 * just below the SiteHeader.
 *
 * active prop options (optional — omit or pass undefined for "no tab highlighted",
 * which is the real case when the player page is reached with no `from` context):
 *   'home' | 'start-sit' | 'streamers' | 'platforms' | 'two-start' | 'news'
 *   | 'prospects' | 'pitchers' | 'yesterday' | 'wrap' | 'trends' | 'trending' | 'trade-desk'
 *
 * CHANGE LOG:
 *   - Added 'start-sit' nav item linking to /fantasy/start-sit
 *   - Reordered so Start/Sit sits second (right after Desk) — it's the
 *     most-visited fantasy page so it belongs early in the tab order.
 *   - Added 'prospects' nav item linking to /fantasy/prospects — confirmed
 *     as a real, existing page (src/app/fantasy/prospects/page.tsx),
 *     already linked from Fantasyhub.tsx, MinorLeagueTeamBoard.tsx, and
 *     the player detail page's back-link. This was previously reachable
 *     without ever appearing in the persistent nav strip.
 *   - Added 'pitchers' nav item linking to /fantasy/pitchers — same gap.
 *   - Added 'yesterday' / 'wrap' / 'trends' / 'trade-desk' — found via an
 *     exhaustive `grep -rn "FantasySubNav active=" src/app/fantasy/`.
 *   - Added 'trending' — a GENUINELY SEPARATE page from 'trends' (confirmed
 *     via player/[playerId]/page.tsx's fromToNav()/BackLink, which both
 *     reference /fantasy/trending as its own route). Not a duplicate —
 *     two real, distinct pages that happen to have similar names.
 *   - `active` is now optional (was required NavKey). fromToNav() in
 *     player/[playerId]/page.tsx can legitimately return undefined (no
 *     back-context when the player page is reached directly), which the
 *     old required-prop type couldn't express — this was the next type
 *     error waiting to surface. undefined now just means no tab highlights.
 */
import Link from 'next/link'
const NAV_ITEMS = [
  { label: 'Desk',        href: '/fantasy',              key: 'home',       proOnly: false },
  { label: 'Start/Sit',   href: '/fantasy/start-sit',    key: 'start-sit',  proOnly: true  },
  { label: 'Streamers',   href: '/fantasy/streamers',    key: 'streamers',  proOnly: true  },
  { label: 'Pitchers',    href: '/fantasy/pitchers',     key: 'pitchers',   proOnly: true  },
  { label: 'Platforms',   href: '/fantasy/platforms',     key: 'platforms',  proOnly: true  },
  { label: 'Two-Start',   href: '/fantasy/two-start',    key: 'two-start',  proOnly: true  },
  { label: 'Trends',      href: '/fantasy/trends',       key: 'trends',     proOnly: true  },
  { label: 'Trending',    href: '/fantasy/trending',     key: 'trending',   proOnly: true  },
  { label: 'Trade Desk',  href: '/fantasy/trade-desk',   key: 'trade-desk', proOnly: true  },
  { label: 'Prospects',   href: '/fantasy/prospects',    key: 'prospects',  proOnly: true  },
  { label: 'Yesterday',   href: '/fantasy/yesterday',    key: 'yesterday',  proOnly: false },
  { label: 'Wrap',        href: '/fantasy/wrap',         key: 'wrap',       proOnly: true  },
  { label: 'News Wire',   href: '/fantasy/news',         key: 'news',       proOnly: false },
] as const
type NavKey = typeof NAV_ITEMS[number]['key']
export default function FantasySubNav({ active, isPro = true }: { active?: NavKey; isPro?: boolean }) {
  return (
    <div className="border-b border-stone-200 bg-stone-50 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
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