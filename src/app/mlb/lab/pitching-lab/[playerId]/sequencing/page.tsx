'use client'

import SequenceExplorer from '@/components/pitching-lab/SequenceExplorer'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function SequencingPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <SequenceExplorer pitcherId={data.id} />
}
