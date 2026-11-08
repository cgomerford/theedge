'use client'

// Client wrapper for the Shape Sandbox page: owns the fetch (a function can't be passed down from a
// server component) and keeps the shape API contract in one place.

import type { LoadBins, SearchPitchers } from './ShapeSandbox'
import ShapeSandboxV2 from './ShapeSandboxV2'
import type { PitcherHit, ShapeBin } from '@/lib/pitch-shape/model'
import { log } from '@/lib/log'
import { getShapeView } from './shapeLevel'

/** the shared level as query parameters: nothing for MLB (the unchanged default), else level and any season asked for */
const levelQuery = () => { const v = getShapeView(); return v.level === 'mlb' ? '' : `&level=${v.level}${v.season != null ? `&season=${v.season}` : ''}` }

const loadBins: LoadBins = async (pitchType, hand) => {
  try {
    const res = await fetch(`/api/mlb/pitch-shape/bins?type=${pitchType}&hand=${hand}${levelQuery()}`)
    if (!res.ok) return null
    const json = (await res.json()) as { bins?: ShapeBin[] }
    return json.bins ?? null
  } catch (e) {
    log.error('SandboxClient', 'bins fetch failed', e instanceof Error ? e.message : e)
    return null
  }
}

const searchPitchers: SearchPitchers = async q => {
  try {
    const res = await fetch(`/api/mlb/pitch-shape/pitchers?q=${encodeURIComponent(q)}${levelQuery()}`)
    if (!res.ok) return []
    const json = (await res.json()) as { pitchers?: PitcherHit[] }
    return json.pitchers ?? []
  } catch (e) {
    log.error('SandboxClient', 'pitcher search failed', e instanceof Error ? e.message : e)
    return []
  }
}

export default function SandboxClient({ isPro, lookLeft, pitchTypes }: { isPro: boolean; lookLeft?: boolean; pitchTypes: string[] }) {
  return <ShapeSandboxV2 isPro={isPro} lookLeft={lookLeft} pitchTypes={pitchTypes} loadBins={loadBins} searchPitchers={searchPitchers} />
}
