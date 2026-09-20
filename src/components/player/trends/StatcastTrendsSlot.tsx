// src/components/player/trends/StatcastTrendsSlot.tsx
//
// Async SERVER component for the Pro "Statcast trends" tab. The player page only
// creates this element when `isPro` is true (see players/[id]/page.tsx), so a
// non-Pro request never runs these queries or ships this data — the gate is
// server-side, not a CSS hide. It streams inside <Suspense>, so the rest of the
// page never waits on it.

import { getBatterTrendsData, getPitcherTrendsData } from '@/lib/player-trends/data'
import { Card, C, SANS } from '@/components/team/ui'
import HitterTrends from './HitterTrends'
import PitcherTrends from './PitcherTrends'

export default async function StatcastTrendsSlot({ playerId, subject, teamId, color, season }: {
  playerId: number; subject: 'batter' | 'pitcher'; teamId: number | null; color: string; season: number
}) {
  const data = subject === 'batter' ? await getBatterTrendsData(playerId, teamId, season) : await getPitcherTrendsData(playerId, season)
  if (!data) {
    return (
      <Card>
        <p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, margin: 0 }}>
          No Statcast events are stored for this player this season yet, so there is no trend to draw. Nothing is estimated in its place.
        </p>
      </Card>
    )
  }
  return subject === 'batter'
    ? <HitterTrends data={data as Awaited<ReturnType<typeof getBatterTrendsData>> & object} color={color} />
    : <PitcherTrends data={data as Awaited<ReturnType<typeof getPitcherTrendsData>> & object} color={color} />
}
