'use client'

// src/components/sequencing-lab/SeqSectionNav.tsx
//
// The Sequencing Lab's sections: Pitch sequencing (compare, pitcher, league, finder), Second Look and Game Plan Card. One row of links shown at the top of each.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SANS } from '@/components/team/ui'

const SECTIONS: [string, string][] = [['/mlb/lab/sequencing', 'Pitch sequencing'], ['/mlb/lab/sequencing/second-look', 'Second Look'], ['/mlb/lab/sequencing/game-plan', 'Game Plan Card']]

export default function SeqSectionNav() {
  const path = usePathname() ?? ''
  const active = path.startsWith('/mlb/lab/sequencing/game-plan') ? 2 : path.startsWith('/mlb/lab/sequencing/second-look') ? 1 : 0
  return (
    <nav aria-label="Sequencing Lab sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 0, margin: '0 0 16px', fontFamily: SANS }}>
      {SECTIONS.map(([href, label], i) => (
        <Link key={href} href={href} aria-current={i === active ? 'page' : undefined} style={{ padding: '10px 16px', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontWeight: 800, fontSize: 14, textDecoration: 'none', border: '2px solid #1A1A1A', marginLeft: i ? -2 : 0, background: i === active ? '#1A1A1A' : '#fff', color: i === active ? '#fff' : '#1A1A1A' }}>{label}</Link>
      ))}
    </nav>
  )
}
