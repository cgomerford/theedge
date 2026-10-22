'use client'

import EdgePlusPanel from '@/components/pitching-lab/EdgePlusPanel'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function StuffPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <EdgePlusPanel pitcherId={data.id} pitcherName={data.name} teamAbbr={data.abbr} teamColor={data.color} />
}
