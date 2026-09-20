'use client'

import BatterHotZoneOverlay from '@/components/batting-lab/BatterHotZoneOverlay'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingHotZonesPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <BatterHotZoneOverlay batterId={data.id} bats={data.bio.bats} />
}
