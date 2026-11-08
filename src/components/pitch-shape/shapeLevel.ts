'use client'

// src/components/pitch-shape/shapeLevel.ts
//
// ONE shared level for the whole Pitch Shape Lab: the map, filters, cards, the pitcher panel, the leaderboard and the sandbox all read it from here, so they cannot disagree.
// It lives outside React (like shapeSelection.ts) and is mirrored in the address bar: the level and season come from ?level= and ?season= on first use, a change writes a
// history entry (so Back returns to the previous level) and Back/Forward re-read the address. The server snapshot is always MLB, so the page renders the same for everyone
// before the browser applies the address.

import { useSyncExternalStore } from 'react'
import { DEFAULT_LEVEL, type Level } from '@/lib/milb-shape/levels'
import { applyShapeUrl, parseShapeUrl } from '@/lib/milb-shape/url'

export type ShapeView = { level: Level; /** a minor-league season asked for in the address; null = the newest loaded */ season: number | null }

const SERVER: ShapeView = { level: DEFAULT_LEVEL, season: null }
let state: ShapeView = SERVER
let ready = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

function fromAddress(): ShapeView {
  const u = parseShapeUrl(window.location.search)
  return { level: u.level ?? DEFAULT_LEVEL, season: u.level && u.level !== 'mlb' ? u.season ?? null : null }
}

function init() {
  if (ready || typeof window === 'undefined') return
  ready = true
  state = fromAddress()
  window.addEventListener('popstate', () => { state = fromAddress(); emit() })
}

export function getShapeView(): ShapeView { init(); return state }

/** Switch level (and optionally season). Writes a history entry so Back works. */
export function setShapeLevel(level: Level, season: number | null = null) {
  init()
  if (state.level === level && state.season === season) return
  state = { level, season: level === 'mlb' ? null : season }
  const qs = applyShapeUrl(window.location.search, { level, season: level === 'mlb' ? undefined : season ?? undefined })
  window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  emit()
}

/** Write other view parameters (pitch, hand, sliders...) without adding history entries. Level and season are left alone. */
export function replaceShapeParams(patch: Parameters<typeof applyShapeUrl>[1]) {
  if (typeof window === 'undefined') return
  const qs = applyShapeUrl(window.location.search, patch)
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next)
}

/** Subscribe to level changes (what useShapeView does, usable without React). */
export function subscribeShapeView(f: () => void): () => void { subs.add(f); init(); return () => { subs.delete(f) } }

export function useShapeView(): ShapeView {
  return useSyncExternalStore(subscribeShapeView, getShapeView, () => SERVER)
}

/** Back and Forward for the other parameters: the callback fires with the freshly parsed address. */
export function onShapePop(cb: (u: ReturnType<typeof parseShapeUrl>) => void): () => void {
  const h = () => cb(parseShapeUrl(window.location.search))
  window.addEventListener('popstate', h)
  return () => window.removeEventListener('popstate', h)
}
