'use client'

// src/app/mlb/lab/batting-lab/[playerId]/sequencing/page.tsx
//
// Batting Lab → Sequencing: what pitchers threw to this hitter after each pitch, by how it turned out, where it was, the count and the pitcher's
// hand, with a pitch-by-pitch replay. The same SequenceLab the Pitching Lab uses, on his side. (The older BatterSequenceExplorer is no longer used here.)

import SequenceLab from '@/components/pitching-lab/SequenceLab'
import { useParams } from 'next/navigation'

// The id comes from the address, not from the MLB lab data the other tabs wait for, so a hitter who has only played in the minors opens too (his pitches at the chosen level are fetched by the explorer itself).
export default function BattingSequencingPage() {
  const id = Number(useParams().playerId)
  return Number.isInteger(id) && id > 0 ? <SequenceLab id={id} role="batter" /> : null
}
