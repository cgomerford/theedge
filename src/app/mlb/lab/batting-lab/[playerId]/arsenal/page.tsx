'use client'

// src/app/mlb/lab/batting-lab/[playerId]/arsenal/page.tsx: "vs pitch type"
//
// The pitches this hitter has seen and what he does with each, built in BatterArsenal from his per-pitch log. Open to everyone.
// (The older stat table and zone grid, BatterArsenalFullTable and BatterZoneArsenalGrid, are no longer used here.)

import BatterArsenal from '@/components/batting-lab/BatterArsenal'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function VsArsenalPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <BatterArsenal batterId={data.id} />
}
