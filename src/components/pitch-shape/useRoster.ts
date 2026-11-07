'use client'
// src/components/pitch-shape/useRoster.ts
//
// "My pitchers": the pitchers a viewer has starred, kept in this browser only (localStorage), shared by every component on the page.
// No account and nothing is sent anywhere. Storage can be blocked or empty, so every read and write is guarded and the list simply starts empty.

import { useSyncExternalStore } from 'react'

const KEY = 'x9_shape_roster'
const listeners = new Set<() => void>()
let cache: number[] | null = null

function read(): number[] {
  if (cache) return cache
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    cache = Array.isArray(arr) ? arr.filter((x): x is number => Number.isInteger(x)) : []
  } catch { cache = [] }
  return cache
}

function write(next: number[]) {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private window or blocked storage: the list lasts until the page closes */ }
  listeners.forEach(l => l())
}

const EMPTY: number[] = []
export function useRoster() {
  const ids = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, read, () => EMPTY)
  const toggle = (id: number) => write(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(-40))
  return { ids, has: (id: number) => ids.includes(id), toggle }
}
