'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/location/page.tsx
//
// Pitching Lab → Location Lab: where each pitch is thrown and what happens in each zone. All of it is built in LocationExplorer from the
// season's per-pitch log. (The older zone-table view, LocationLab.tsx, is no longer used here.)

import LocationExplorer from '@/components/pitching-lab/LocationExplorer'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function LocationLabPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <LocationExplorer id={data.id} role="pitcher" />
}
