'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/overlay/page.tsx
//
// Pitching Lab → Hot Zone Overlay: this pitcher set against a chosen hitter (or the next game's lineup), count by count, with the hitter's
// numbers taken against pitches that look like the pitcher's. All of it is built in OverlayExplorer. (The older HotZoneOverlay.tsx is no longer used here.)

import OverlayExplorer from '@/components/pitching-lab/OverlayExplorer'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function OverlayPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <OverlayExplorer id={data.id} role="pitcher" />
}
