// src/components/game-preview/RightRailContext.tsx
//
// Coordinates the game-preview page's right column: it shows the Edge
// Indicator by default, but "Pitching Radar" / "Arsenal" (TeamPitcherCard)
// and "Batting Radar" (TeamBatterCard) — both server components — need to
// be able to swap it to a Starting Pitcher or Batting detail panel for
// their specific team. A tiny client context is the simplest way for
// server-rendered trigger buttons and the client-rendered right rail to
// share that one piece of state without threading callbacks through
// server component props (which can't hold functions).

'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

export type RightRailView =
  | { kind: 'edge' }
  | { kind: 'sp'; team: 'home' | 'away' }
  | { kind: 'batting'; team: 'home' | 'away' }

type RightRailContextValue = {
  view: RightRailView
  setView: (v: RightRailView) => void
}

const RightRailContext = createContext<RightRailContextValue | null>(null)

export function RightRailProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<RightRailView>({ kind: 'edge' })
  return <RightRailContext.Provider value={{ view, setView }}>{children}</RightRailContext.Provider>
}

export function useRightRail() {
  const ctx = useContext(RightRailContext)
  if (!ctx) throw new Error('useRightRail must be used within a RightRailProvider')
  return ctx
}

export function RightRailTrigger({
  view, className, children,
}: {
  view: RightRailView
  className?: string
  children: ReactNode
}) {
  const { setView } = useRightRail()
  return (
    <button type="button" onClick={() => setView(view)} className={className}>
      {children}
    </button>
  )
}
