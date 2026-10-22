'use client'

// Client wrapper for the Shape Sandbox page: owns the fetch (a function can't be passed down from a
// server component) and keeps the shape API contract in one place.

import ShapeSandbox, { type LoadBins, type SearchPitchers } from './ShapeSandbox'
import type { PitcherHit, ShapeBin } from '@/lib/pitch-shape/model'

const loadBins: LoadBins = async (pitchType, hand) => {
  try {
    const res = await fetch(`/api/mlb/pitch-shape/bins?type=${pitchType}&hand=${hand}`)
    if (!res.ok) return null
    const json = (await res.json()) as { bins?: ShapeBin[] }
    return json.bins ?? null
  } catch (e) {
    console.error('[SandboxClient] bins fetch failed:', e instanceof Error ? e.message : e)
    return null
  }
}

const searchPitchers: SearchPitchers = async q => {
  try {
    const res = await fetch(`/api/mlb/pitch-shape/pitchers?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const json = (await res.json()) as { pitchers?: PitcherHit[] }
    return json.pitchers ?? []
  } catch (e) {
    console.error('[SandboxClient] pitcher search failed:', e instanceof Error ? e.message : e)
    return []
  }
}

export default function SandboxClient({ isPro, pitchTypes }: { isPro: boolean; pitchTypes: string[] }) {
  return <ShapeSandbox isPro={isPro} pitchTypes={pitchTypes} loadBins={loadBins} searchPitchers={searchPitchers} />
}
