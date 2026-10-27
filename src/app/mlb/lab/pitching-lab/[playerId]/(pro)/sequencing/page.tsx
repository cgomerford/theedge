'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/sequencing/page.tsx
//
// Pitching Lab → Sequencing: what was thrown after what, by result, location, count and hitter side. Built in SequenceLab from the season's
// per-pitch log. (The older SequenceExplorer.tsx is no longer used here.)

import SequenceLab from '@/components/pitching-lab/SequenceLab'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function SequencingPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <SequenceLab pitcherId={data.id} />
}
