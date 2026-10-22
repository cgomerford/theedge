'use client'

import LocationLab from '@/components/pitching-lab/LocationLab'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function LocationLabPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading real zone data…</div>

  return (
    <LocationLab
      pitcherId={data.id}
      pitcherName={data.name}
      abbr={data.abbr}
      hotZones={data.hotZones}
      arsenal={data.arsenal}
    />
  )
}
