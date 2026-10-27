'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/h2h/page.tsx
//
// Pitching Lab → H2H: this pitcher against a chosen hitter, every meeting since 2015, built in MatchupLab. (The older table components
// TopBattersFaced, TeamRecordTable, VenueRecordTable and NextStartScouting are no longer used here.)

import MatchupLab from '@/components/pitching-lab/MatchupLab'
import { usePitchingLabData } from '@/lib/pitching-lab-context'

export default function H2HPage() {
  const { data, failed } = usePitchingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this pitcher&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <MatchupLab pitcherId={data.id} pitcherName={data.name} />
}
