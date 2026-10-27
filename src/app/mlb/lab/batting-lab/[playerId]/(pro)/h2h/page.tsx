'use client'

// src/app/mlb/lab/batting-lab/[playerId]/h2h/page.tsx
//
// Batting Lab → H2H: this hitter against each club's pitchers, by ballpark, and against any one pitcher, every meeting since 2015 with each
// plate appearance pitch by pitch. The same MatchupLab the Pitching Lab uses, on his side. (The older BatterH2H tables are no longer used here.)

import MatchupLab from '@/components/pitching-lab/MatchupLab'
import { useBattingLabData } from '@/lib/batting-lab-context'

export default function BattingH2HPage() {
  const { data, failed } = useBattingLabData()

  if (failed) return <div className="text-[12px] text-[#8A8577] text-center py-16">Couldn&apos;t load this batter&apos;s data right now.</div>
  if (data === null) return <div className="text-[12px] text-[#8A8577] text-center py-16">Loading…</div>

  return <MatchupLab id={data.id} name={data.name} role="batter" />
}
