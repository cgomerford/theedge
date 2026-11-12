'use client'

// src/app/mlb/lab/batting-lab/[playerId]/location/page.tsx
//
// Batting Lab → Location Lab: where pitchers have thrown to him and what happens in each zone (xwOBA, BA, SLG, whiffs, swings, takes, called
// strikes, hard-hit), built in LocationExplorer from his per-pitch log. Open to everyone. (The older swing heatmap, BatterSwingHeatmap.tsx, is no longer used here.)

import LocationExplorer from '@/components/pitching-lab/LocationExplorer'
import { useParams } from 'next/navigation'

// The id comes from the address, not from the MLB lab data the other tabs wait for, so a hitter who has only played in the minors opens too (his pitches at the chosen level are fetched by the explorer itself).
export default function BattingLocationPage() {
  const id = Number(useParams().playerId)
  return Number.isInteger(id) && id > 0 ? <LocationExplorer id={id} role="batter" /> : null
}
