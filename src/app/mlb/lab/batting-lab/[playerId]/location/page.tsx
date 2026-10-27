'use client'

// src/app/mlb/lab/batting-lab/[playerId]/location/page.tsx
//
// Batting Lab → Location Lab: where pitchers have thrown to him and what happens in each zone (xwOBA, BA, SLG, whiffs, swings, takes, called
// strikes, hard-hit), built in LocationExplorer from his per-pitch log. Open to everyone. (The older swing heatmap, BatterSwingHeatmap.tsx, is no longer used here.)

import LocationExplorer from '@/components/pitching-lab/LocationExplorer'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingLocationPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <LocationExplorer id={data.id} role="batter" />
}
