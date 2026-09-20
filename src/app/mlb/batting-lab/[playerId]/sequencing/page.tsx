'use client'

import BatterSequenceExplorer from '@/components/batting-lab/BatterSequenceExplorer'
import { useBattingLabData } from '@/lib/batting-lab-context'
import { MLB_TEAMS } from '@/lib/teams'

export default function BattingSequencingPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const batterTeamId = MLB_TEAMS.find(t => t.abbrev === data.abbr)?.id ?? 0

  return <BatterSequenceExplorer batterId={data.id} batterName={data.name} batterTeamId={batterTeamId} />
}
