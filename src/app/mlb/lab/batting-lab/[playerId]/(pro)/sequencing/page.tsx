'use client'

// src/app/mlb/lab/batting-lab/[playerId]/sequencing/page.tsx
//
// Batting Lab → Sequencing: what pitchers threw to this hitter after each pitch, by how it turned out, where it was, the count and the pitcher's
// hand, with a pitch-by-pitch replay. The same SequenceLab the Pitching Lab uses, on his side. (The older BatterSequenceExplorer is no longer used here.)

import SequenceLab from '@/components/pitching-lab/SequenceLab'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingSequencingPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <SequenceLab id={data.id} role="batter" />
}
