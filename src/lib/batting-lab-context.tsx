'use client'

// src/lib/batting-lab-context.tsx
//
// Shared data layer for the /mlb/batting-lab/[playerId] shell — same
// pattern as pitching-lab-context.tsx: fetch once, hand it to every tab
// via context instead of each tab re-fetching independently.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { BatterStatcast } from '@/lib/batter-stats'
import type { BatterBatSpeedProfile } from '@/lib/batter-bat-speed'

export type BattingLabBio = {
  birthDate: string | null
  age: number | null
  height: string | null
  weight: number | null
  bats: string | null
  birthCountry: string | null
  mlbDebutDate: string | null
  position: string | null
}

export type BattingLabData = {
  id: number
  name: string
  abbr: string
  color: string
  bio: BattingLabBio
  seasonStatRows: { key: string; label: string; value: string }[]
  percentileRows: { key: string; label: string; percentile: number | null }[]
  statcast: BatterStatcast | null
  batSpeed: BatterBatSpeedProfile | null
}

type ContextValue = { data: BattingLabData | null; failed: boolean }

const BattingLabContext = createContext<ContextValue>({ data: null, failed: false })

// Callers must pass `key={batterId}` at the call site so switching
// batters remounts this provider (fresh null/false state) instead of
// needing to reset state imperatively inside the effect below.
export function BattingLabProvider({ batterId, children }: { batterId: number; children: ReactNode }) {
  const [data, setData] = useState<BattingLabData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/batting-lab?batterId=${batterId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [batterId])

  return <BattingLabContext.Provider value={{ data, failed }}>{children}</BattingLabContext.Provider>
}

export function useBattingLabData() {
  return useContext(BattingLabContext)
}
