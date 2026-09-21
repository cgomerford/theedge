// src/lib/scout-matchup.ts
//
// Server-side data for the admin Scout Report Graphic builder's "key
// matchup" section: everything about ONE batter facing ONE pitcher that the
// game bundle doesn't already carry. Called on demand from
// /api/admin/scout-matchup when George picks a batter — never from a page
// render, so it can't add fan-out to the dashboard.
//
// Table ownership: read-only. Reads batter_zone_arsenal (via
// getBatterZoneArsenal) and MLB Stats API only; writes nothing.

import { getBatterZoneArsenal, type BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import { getBatterSeasonStats, getBatterVsPitcher, type BatterSeasonStats, type BatterVsPitcher } from '@/lib/batter-stats'
import { getBatterVenueRecord, type BatterVenueRecordRow } from '@/lib/batter-venue-record'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type ScoutMatchup = {
  batSide: 'L' | 'R' | 'S' | null
  position: string | null
  season: BatterSeasonStats | null
  h2h: BatterVsPitcher | null           // null = never faced (or fetch failed) — UI shows "no data"
  venue: BatterVenueRecordRow | null    // null = no career games at this park
  zoneArsenal: Record<string, BatterZoneArsenal>
}

async function getBatterBio(batterId: number): Promise<{ batSide: 'L' | 'R' | 'S' | null; position: string | null }> {
  try {
    const res = await fetch(`${MLB_API}/people/${batterId}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { batSide: null, position: null }
    const p = (await res.json()).people?.[0]
    const side = p?.batSide?.code
    return {
      batSide: side === 'L' || side === 'R' || side === 'S' ? side : null,
      position: p?.primaryPosition?.abbreviation ?? null,
    }
  } catch (err) {
    console.error('[getBatterBio] fetch failed:', err)
    return { batSide: null, position: null }
  }
}

export async function getScoutMatchup(
  batterId: number,
  pitcherId: number | null,
  venueId: number | null,
): Promise<ScoutMatchup> {
  const season = new Date().getFullYear()

  const [bio, seasonStats, h2h, venueRows, zoneArsenal] = await Promise.all([
    getBatterBio(batterId),
    getBatterSeasonStats(batterId),
    pitcherId ? getBatterVsPitcher(batterId, pitcherId) : Promise.resolve(null),
    venueId ? getBatterVenueRecord(batterId, season, 'career') : Promise.resolve([] as BatterVenueRecordRow[]),
    getBatterZoneArsenal(batterId),
  ])

  // MLB returns a vsPlayerTotal split of zeros-or-absent when they've never
  // met; treat 0 AB as "no data" so the card never renders a fake 0-for-0.
  const h2hReal = h2h && h2h.ab > 0 ? h2h : null
  const venue = venueId ? venueRows.find(r => r.venueId === venueId && r.ab > 0) ?? null : null

  return { ...bio, season: seasonStats, h2h: h2hReal, venue, zoneArsenal }
}
