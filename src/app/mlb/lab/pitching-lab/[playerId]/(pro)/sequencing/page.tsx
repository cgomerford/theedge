'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/sequencing/page.tsx
//
// Pitching Lab → Sequencing: what was thrown after what, by result, location, count and hitter side. Built in SequenceLab from the season's
// per-pitch log. (The older SequenceExplorer.tsx is no longer used here.)

import SequenceLab from '@/components/pitching-lab/SequenceLab'
import { useParams } from 'next/navigation'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function SequencingPage() {
  const { data } = usePitchingLabData()
  // the pitcher id comes from the address, so a pitcher who has only pitched in the minors opens too (the MLB season data above may not exist for him)
  const params = useParams()
  const id = data?.id ?? Number(params.playerId)
  if (!Number.isInteger(id) || id <= 0) return null

  return <SequenceLab id={id} role="pitcher" />
}
