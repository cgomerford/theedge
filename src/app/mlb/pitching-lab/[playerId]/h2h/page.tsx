'use client'

import TopBattersFaced from '@/components/pitching-lab/TopBattersFaced'
import NextStartScouting from '@/components/pitching-lab/NextStartScouting'
import TeamRecordTable from '@/components/pitching-lab/TeamRecordTable'
import VenueRecordTable from '@/components/pitching-lab/VenueRecordTable'
import { usePitchingLabData } from '@/lib/pitching-lab-context'
import { MLB_TEAMS } from '@/lib/teams'

export default function H2HPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  const pitcherTeamId = MLB_TEAMS.find(t => t.abbrev === data.abbr)?.id ?? 0

  return (
    <div className="space-y-8">
      <TopBattersFaced pitcherId={data.id} />
      <TeamRecordTable pitcherId={data.id} />
      <VenueRecordTable pitcherId={data.id} />
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-3">Next start scouting</p>
        <NextStartScouting pitcherId={data.id} pitcherName={data.name} pitcherTeamId={pitcherTeamId} />
      </div>
    </div>
  )
}
