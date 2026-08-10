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
import type { GameTabEntry } from '@/types/postgame'

const ORANGE = '#FF5722'

export function GameTabs({ games }: { games: GameTabEntry[] }) {
  const pathname = usePathname()
  if (games.length < 2) return null

  return (
    <div className="flex gap-1 mb-4 border-b border-stone-200">
      {games.map(g => {
        const isActive = pathname?.endsWith(g.slug)
        return (
          <Link
            key={g.gamePk}
            href={`/mlb/${g.slug}`}
            className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest -mb-px border-b-2 transition-colors"
            style={{
              borderColor: isActive ? ORANGE : 'transparent',
              color: isActive ? '#1A1A1A' : '#6b6b66',
              fontWeight: isActive ? 700 : 400,
            }}
          >
            {g.label}
            {g.status === 'Live' && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-600 align-middle" />}
            {g.status === 'Final' && <span className="ml-1.5 text-stone-400">· F</span>}
          </Link>
        )
      })}
    </div>
  )
}
