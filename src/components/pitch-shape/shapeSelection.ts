'use client'
// src/components/pitch-shape/shapeSelection.ts
//
// The pitcher chosen in the finder at the top of the Pitch Shape Lab, shared with "Dial in a shape" further down the page so the sliders can
// start from his own shape. In-memory only (one page, two components); nothing is stored or sent anywhere.

import { useSyncExternalStore } from 'react'

export type SelectedShape = {
  id: number; name: string; team: string
  pitchType: string; hand: 'R' | 'L'
  shape: { velo: number; ivb: number; hb: number; slot: number }
  /** his own whiffs per swing on this pitch this season, and the swings behind it; null when we hold none */
  ownWhiff: number | null; ownSwings: number
}

let current: SelectedShape | null = null
const listeners = new Set<() => void>()

export function setSelectedShape(next: SelectedShape | null) {
  const same = current && next && current.id === next.id && current.pitchType === next.pitchType && current.hand === next.hand
  if (same || (!current && !next)) return
  current = next
  listeners.forEach(l => l())
}

export function useSelectedShape(): SelectedShape | null {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => current, () => null)
}
