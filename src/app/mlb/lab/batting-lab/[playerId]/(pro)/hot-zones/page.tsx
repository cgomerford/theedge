'use client'

// src/app/mlb/lab/batting-lab/[playerId]/hot-zones/page.tsx: Hot Zone Overlay
//
// This hitter set against a chosen pitcher, count by count: where the pitcher throws next to where the hitter has the least to show, with
// the hitter's numbers taken only against pitches that look like the pitcher's (speed, spin, break). The same OverlayExplorer the Pitching Lab
// uses, with the hitter fixed and a pitcher chosen. (The older BatterHotZoneOverlay is no longer used here.)

import OverlayExplorer from '@/components/pitching-lab/OverlayExplorer'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingHotZonesPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <OverlayExplorer id={data.id} role="batter" fixedName={data.name} />
}
