'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/location/page.tsx
//
// Pitching Lab → Location Lab: where each pitch is thrown and what happens in each zone. All of it is built in LocationExplorer from the
// season's per-pitch log. (The older zone-table view, LocationLab.tsx, is no longer used here.)

import LocationExplorer from '@/components/pitching-lab/LocationExplorer'
import { useParams } from 'next/navigation'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function LocationLabPage() {
  const { data } = usePitchingLabData()
  // the pitcher id comes from the address, so a pitcher who has only pitched in the minors opens too (the MLB season data above may not exist for him)
  const params = useParams()
  const id = data?.id ?? Number(params.playerId)
  if (!Number.isInteger(id) || id <= 0) return null

  return <LocationExplorer id={id} role="pitcher" />
}
