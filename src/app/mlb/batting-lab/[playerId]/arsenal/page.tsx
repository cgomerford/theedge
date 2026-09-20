'use client'

// src/app/mlb/batting-lab/[playerId]/arsenal/page.tsx — "Vs Arsenal"
//
// The full real stat line vs each pitch type (Pitches/Usage/Velo/HB/IVB/
// Whiff%/Put-Away%/K%/BA/SLG/wOBA/xwOBA/Hard-Hit%/RV per 100, plus this
// app's own real Edge score) — the batter-side mirror of the Pitching
// Lab's per-pitch detail line — followed by the real zone-by-pitch-type
// hot zone grid for location detail.

import { useEffect, useState } from 'react'
import BatterZoneArsenalGrid from '@/components/BatterZoneArsenalGrid'
import BatterArsenalFullTable from '@/components/batting-lab/BatterArsenalFullTable'
import { useBattingLabData } from '@/lib/batting-lab-context'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'

export default function VsArsenalPage() {
  const { data, failed } = useBattingLabData()
  const [zoneArsenal, setZoneArsenal] = useState<Record<string, BatterZoneArsenal> | null | 'error'>(null)

  useEffect(() => {
    if (!data) return
    let cancelled = false
    fetch(`/api/mlb/batter-zone-arsenal?playerId=${data.id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setZoneArsenal(json.arsenal ?? 'error') })
      .catch(() => { if (!cancelled) setZoneArsenal('error') })
    return () => { cancelled = true }
  }, [data])

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null || zoneArsenal === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>
  if (zoneArsenal === 'error') return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load zone data right now.</div>
  if (Object.keys(zoneArsenal).length === 0) return <div className="text-[12px] text-[#8A8577] text-center py-16">No real zone-by-pitch-type data on record for this batter yet.</div>

  const allSplit = zoneArsenal['all']
  const pitchTypes = allSplit ? Object.keys(allSplit.arsenal) : []
  const pitchNames = Object.fromEntries(pitchTypes.map(pt => [pt, allSplit.arsenal[pt].pitch_name]))

  return (
    <div className="space-y-5">
      <BatterArsenalFullTable batterId={data.id} pitchTypes={pitchTypes} pitchNames={pitchNames} />
      <BatterZoneArsenalGrid batterName={data.name} color={data.color} zoneArsenal={zoneArsenal} />
    </div>
  )
}
