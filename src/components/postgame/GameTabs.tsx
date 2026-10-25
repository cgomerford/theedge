// src/components/postgame/GameTabs.tsx
//
// Renders "Game 1 / Game 2" tabs when getDoubleheaderGames() (see
// src/lib/mlb-live-feed.ts) finds more than one game between the same two
// teams on the same date. Single-game days should skip rendering this
// entirely — see the wiring note in docs/postgame-report-wiring.md for the
// exact conditional.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import Tabs from '@/components/ui/Tabs'
import type { GameTabEntry } from '@/types/postgame'

const ORANGE = '#FF5722'

export function GameTabs({ games }: { games: GameTabEntry[] }) {
  const pathname = usePathname()
  if (games.length < 2) return null

  return (
    <div className="mb-4">
      <Suspense fallback={null}>
        <Tabs
          sticky={false}
          label="Games"
          activeId={games.find(g => pathname?.endsWith(g.slug))?.slug}
          tabs={games.map(g => ({ id: g.slug, label: `${g.label}${g.status === 'Final' ? ' (final)' : g.status === 'Live' ? ' (live)' : ''}`, href: `/mlb/${g.slug}` }))}
        />
      </Suspense>
    </div>
  )
}
