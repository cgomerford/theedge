// src/components/nfl/NflSubHeader.tsx
//
// No CSS classes. Rounded pill buttons alternate brand orange/black.
// Route note (unchanged): Dashboard (/nfl/standings) and Fantasy
// (/fantasy) match SiteHeader.tsx's existing routes. QB Room and WR
// Room are placeholder slugs -- not verified to exist yet.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlayerTeamSearch } from '@/components/nfl/PlayerTeamSearch'

const SUBNAV_LINKS = [
  { label: 'Home', href: '/nfl' },
  { label: 'League Desk', href: '/nfl/league' },
  { label: 'QB Room', href: '/nfl/qb-room' },
  { label: 'WR Room', href: '/nfl/wr-room' },
   { label: 'Defense', href: '/nfl/defensive-coordinator' },
    { label: 'Offense', href: '/nfl/offensive-coordinator' },
  { label: 'Fantasy', href: '/fantasy' },
]

export function NflSubHeader() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid rgba(26,26,26,0.08)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {SUBNAV_LINKS.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#FFF',
              textDecoration: 'none',
              padding: '9px 18px',
              borderRadius: 999,
              background: i % 2 === 0 ? '#FF5722' : '#1A1A1A',
              opacity: hoverIdx === i ? 0.85 : 1,
              transition: 'opacity .15s ease',
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div style={{ minWidth: 220, maxWidth: 360, flex: 1 }}>
        <PlayerTeamSearch />
      </div>
    </nav>
  )
}