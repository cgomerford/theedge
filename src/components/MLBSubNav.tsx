'use client'

/**
 * src/components/MLBSubNav.tsx
 *
 * Replaces the current sub-nav strip on the MLB homepage.
 * Only links to routes that actually exist.
 * Designed to sit between SiteHeader and the page content.
 *
 * Real routes linked:
 *   /mlb              — Home (exists)
 *   /mlb/scores       — Live Scores (exists)
 *   /mlb/abs          — ABS Challenges (exists)
 *   /mlb/stats        — Stats search (exists — /mlb/leaders now just redirects here)
 *   /mlb/glossary     — Stats glossary (exists)
 *   /mlb/lab/batting-lab  — Batting Lab (placeholder — real thing lives per-game today, see GamePageShell.tsx)
 *   /track-record     — Past Games (exists)
 *
 * Kept identical to SiteHeader.tsx's MLB_SUB_LINKS (same hrefs, labels,
 * order, pro flags) — the main header's MLB dropdown and this sub header
 * must show the same links as each other. Update both together.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  pro?: boolean
  external?: boolean
}

const MLB_NAV: NavItem[] = [
  { href: '/mlb',              label: 'Home'          },
  { href: '/mlb/scores',       label: 'Scores'        },
  { href: '/mlb/stats',        label: 'Stats'         },
  { href: '/mlb/glossary',     label: 'Glossary'      },
  { href: '/mlb/lab/batting-lab',  label: 'Batting Lab' },
  { href: '/mlb/lab/contact',      label: 'Contact Lab' },
  { href: '/mlb/lab/platoon',      label: 'Platoon Lab' },
]

export default function MLBSubNav({ isPro = false }: { isPro?: boolean }) {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        .mlb-subnav {
          background: #FAF8F3;
          border-bottom: 1px solid rgba(26,26,26,0.08);
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .mlb-subnav::-webkit-scrollbar { display: none; }
        .mlb-subnav-inner {
          display: flex;
          align-items: center;
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 24px;
          gap: 0;
          white-space: nowrap;
        }
        .mlb-subnav-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          font-family: 'Red Hat Display', sans-serif;
          font-size: 12px;
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
        .mlb-subnav-link:hover {
          color: #1A1A1A;
        }
        .mlb-subnav-link.active {
          color: #FF5722;
          border-bottom-color: #FF5722;
        }
        .mlb-subnav-pro {
          font-family: 'Red Hat Display', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #FF5722;
          background: rgba(255,87,34,0.08);
          padding: 2px 5px;
          border-radius: 2px;
          flex-shrink: 0;
        }
      `}</style>

      <nav className="mlb-subnav" aria-label="MLB navigation">
        <div className="mlb-subnav-inner">
          {MLB_NAV.map(item => {
            const isActive = pathname === item.href ||
              (item.href !== '/mlb' && pathname?.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mlb-subnav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
                {item.pro && (
                  <span className="mlb-subnav-pro">PRO</span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}