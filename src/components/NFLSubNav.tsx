'use client'

/**
 * src/components/NFLSubNav.tsx
 *
 * The NFL twin of MLBSubNav: same markup, same underline-tab styling, sits between SiteHeader and the page.
 * Only links to routes that exist: /nfl (slate home), /nfl/league (leaders + standings desk), the QB / WR rooms,
 * the offensive / defensive coordinator pages and the Fantasy desk (Pro).
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  pro?: boolean
  external?: boolean
}

const NFL_NAV: NavItem[] = [
  { href: '/nfl',                        label: 'Home'      },
  { href: '/nfl/league',                 label: 'League Desk' },
  { href: '/nfl/qb-room',                label: 'QB Room'   },
  { href: '/nfl/wr-room',                label: 'WR Room'   },
  { href: '/nfl/defensive-coordinator',  label: 'Defense'   },
  { href: '/nfl/offensive-coordinator',  label: 'Offense'   },
  { href: '/fantasy',                    label: 'Fantasy', pro: true },
]

export default function NFLSubNav({ isPro = false }: { isPro?: boolean }) {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        .nfl-subnav {
          background: #FAF8F3;
          border-bottom: 1px solid rgba(26,26,26,0.08);
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .nfl-subnav::-webkit-scrollbar { display: none; }
        .nfl-subnav-inner {
          display: flex;
          align-items: center;
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 24px;
          gap: 0;
          white-space: nowrap;
        }
        .nfl-subnav-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          font-family: 'Outfit', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-decoration: none;
          color: #A3A3A3;
          border-bottom: 2px solid transparent;
          transition: color 0.12s, border-color 0.12s;
          position: relative;
          flex-shrink: 0;
        }
        .nfl-subnav-link:hover {
          color: #1A1A1A;
        }
        .nfl-subnav-link.active {
          color: #FF5722;
          border-bottom-color: #FF5722;
        }
        .nfl-subnav-pro {
          font-family: 'Outfit', sans-serif;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #FF5722;
          background: rgba(255,87,34,0.08);
          padding: 2px 5px;
          border-radius: 2px;
          flex-shrink: 0;
        }
      `}</style>

      <nav className="nfl-subnav" aria-label="NFL navigation">
        <div className="nfl-subnav-inner">
          {NFL_NAV.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/nfl' && pathname?.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nfl-subnav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
                {item.pro && (
                  <span className="nfl-subnav-pro">PRO</span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}