// src/lib/venue-dimensions.ts
//
// Real outfield fence distances per venue. Curl-verified endpoint and
// field names before writing this:
//   GET /api/v1/venues/{id}?hydrate=fieldInfo
// returns fieldInfo.{leftLine, leftCenter, center, rightCenter,
// rightLine} in feet — confirmed against Yankee Stadium (venue 3313):
// 318/399/408/385/314.
//
// Long cache — a park's dimensions don't change mid-season (renovations
// are rare, off-season events).

import { createAdminClient } from '@/lib/supabase'

const MLB_API_V1 = 'https://statsapi.mlb.com/api/v1'

export type VenueFieldDimensions = {
  venueId: number
  venueName: string
  leftLine: number | null
  leftCenter: number | null
  center: number | null
  rightCenter: number | null
  rightLine: number | null
}

export async function getVenueFieldDimensions(venueId: number): Promise<VenueFieldDimensions | null> {
  try {
    const res = await fetch(`${MLB_API_V1}/venues/${venueId}?hydrate=fieldInfo`, {
      next: { revalidate: 604800 }, // 7 days — dimensions essentially never change mid-season
    })
    if (!res.ok) return null
    const data = await res.json()
    const venue = data?.venues?.[0]
    if (!venue) return null
    const fi = venue.fieldInfo ?? {}

    // A venue with no fieldInfo at all (e.g. a neutral-site/international
    // game venue MLB hasn't measured) returns an object with every field
    // undefined — treat that as "no data," not zeros.
    if (fi.leftLine == null && fi.center == null && fi.rightLine == null) return null

    return {
      venueId,
      venueName: venue.name ?? '',
      leftLine: fi.leftLine ?? null,
      leftCenter: fi.leftCenter ?? null,
      center: fi.center ?? null,
      rightCenter: fi.rightCenter ?? null,
      rightLine: fi.rightLine ?? null,
    }
  } catch (err) {
    console.error(`Venue field dimensions fetch failed for venue ${venueId}:`, err)
    return null
  }
}
