'use client'

// src/components/pitch-shape/usePitcherLevels.ts
//
// Every pitch one pitcher has thrown at every level we hold (one request per pitcher, cached for the page's life). Pitchers keep their MLB player id across levels, so this is one arm at
// several levels. undefined while loading, null when the request failed. Passing null as the id asks for nothing.

import { useEffect, useState } from 'react'
import type { Repertoire } from '@/lib/pitch-shape/data'
import type { Level } from '@/lib/milb-shape/levels'
import { log } from '@/lib/log'

export type LevelRep = { level: Level; season: number | null; repertoire: Repertoire | null }
const levelsCache = new Map<number, LevelRep[] | null>()

export function usePitcherLevels(id: number | null): LevelRep[] | null | undefined {
  const [got, setGot] = useState<{ id: number; v: LevelRep[] | null } | null>(null)
  useEffect(() => {
    if (id == null || levelsCache.has(id)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-levels?id=${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { levels: LevelRep[] }) => { levelsCache.set(id, j.levels); if (live) setGot({ id, v: j.levels }) })
      .catch(e => { log.error('usePitcherLevels', 'levels fetch failed', e instanceof Error ? e.message : e); levelsCache.set(id, null); if (live) setGot({ id, v: null }) })
    return () => { live = false }
  }, [id])
  if (id == null) return undefined
  if (levelsCache.has(id)) return levelsCache.get(id)
  return got?.id === id ? got.v : undefined
}
