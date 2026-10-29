'use client'

// src/components/sequencing-lab/SeqSectionNav.tsx
//
// The Sequencing Lab's sections as the site's own route tabs (the same underline Tabs the game page uses): Pitch sequencing, Second Look, Game Plan Card.

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import Tabs from '@/components/ui/Tabs'

const TABS = [
  { id: 'seq', label: 'Pitch sequencing', href: '/mlb/lab/sequencing' },
  { id: 'second-look', label: 'Second Look', href: '/mlb/lab/sequencing/second-look' },
  { id: 'game-plan', label: 'Game Plan Card', href: '/mlb/lab/sequencing/game-plan' },
]

export default function SeqSectionNav() {
  const path = usePathname() ?? ''
  const active = path.startsWith('/mlb/lab/sequencing/game-plan') ? 'game-plan' : path.startsWith('/mlb/lab/sequencing/second-look') ? 'second-look' : 'seq'
  return (
    <div style={{ marginBottom: 18 }}>
      <Suspense fallback={null}>
        <Tabs label="Sequencing Lab sections" tabs={TABS} activeId={active} sticky={false} />
      </Suspense>
    </div>
  )
}
