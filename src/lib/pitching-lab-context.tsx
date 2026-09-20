'use client'

// src/lib/pitching-lab-context.tsx
//
// Shared data layer for the /mlb/pitching-lab/[playerId] shell. Fetches
// once from /api/mlb/pitching-lab (same real data every tab needs — full
// stats, movement, count tendency, sequencing, hot zones, zone arsenal)
// and hands it to every tab page via context, instead of each tab
// re-fetching independently.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PitcherStatsFull, PitchMovementRow } from '@/lib/pitcher-full-stats'
import type { PitcherCountTendency, PitcherPitchSequencing } from '@/lib/pitcher-sequencing'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'

export type PitchingLabData = {
  id: number
  name: string
  abbr: string
  color: string
  fullStats: PitcherStatsFull | null
  movementRows: PitchMovementRow[]
  countTendency: Record<string, PitcherCountTendency>
  sequencing: Record<string, PitcherPitchSequencing>
  hotZones: Record<string, PitcherHotZones>
  arsenal: Record<string, PitcherZoneArsenal>
}

type ContextValue = {
  data: PitchingLabData | null
  failed: boolean
}

const PitchingLabContext = createContext<ContextValue>({ data: null, failed: false })

// Callers must pass `key={pitcherId}` at the call site so switching
// pitchers remounts this provider (fresh null/false state) instead of
// needing to reset state imperatively inside the effect below.
export function PitchingLabProvider({ pitcherId, children }: { pitcherId: number; children: ReactNode }) {
  const [data, setData] = useState<PitchingLabData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitching-lab?pitcherId=${pitcherId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [pitcherId])

  return <PitchingLabContext.Provider value={{ data, failed }}>{children}</PitchingLabContext.Provider>
}

export function usePitchingLabData() {
  return useContext(PitchingLabContext)
}
