'use client'

// src/components/pitch-shape/usePitcherLog.ts
//
// One pitcher's whole-season pitch log at one level (every pitch: movement, speed, spin, result), fetched once and kept for the page's life, shared by everything on the page that needs his
// individual pitches (the stat line, the movement maps). undefined while loading, null when it could not be read or the level keeps no pitch log (Arizona Fall League, Spring Training).
// Passing null for the id or season asks for nothing.

import { useEffect, useState } from 'react'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import { isMilb, type Level } from '@/lib/milb-shape/levels'

const cache = new Map<string, PitcherPitchLog | null>()

export function usePitcherLog(id: number | null, season: number | null, level: Level): PitcherPitchLog | null | undefined {
  const key = id != null && season != null ? `${id}|${season}|${level}` : null
  const [got, setGot] = useState<{ key: string; v: PitcherPitchLog | null } | null>(null)
  useEffect(() => {
    if (key == null || id == null || season == null || cache.has(key)) return
    let live = true
    fetchLabLog('pitcher', id, season, isMilb(level) ? `&level=${level}` : '').then(l => { cache.set(key, l); if (live) setGot({ key, v: l }) })
    return () => { live = false }
  }, [key, id, season, level])
  if (key == null) return undefined
  if (cache.has(key)) return cache.get(key)
  return got?.key === key ? got.v : undefined
}
