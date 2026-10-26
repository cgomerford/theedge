// src/app/mlb/lab/pitching-lab/[playerId]/page.tsx — Pitching Lab Overview
//
// Same layout as the player page (wide main column + right rail), rendered on the server: season line, percentiles, last 5, vs pitch type,
// career, what changed, splits. The lab's own deeper tabs hold swing, contact, zones, head-to-head and the rest; the pointer below says so.
// Bat speed & contact quality stays here (Pro / the viewer's deep look), read from the lab data on the client.

import { notFound } from 'next/navigation'
import { getPlayerPageData } from '@/lib/player-page'
import { getPlayerOverview } from '@/lib/player-overview'
import { LatestGame, OverviewBody } from '@/components/player-page/PlayerOverviewView'

export default async function PitchingLabOverview({ params }: { params: Promise<{ playerId: string }> }) {
  const playerId = Number((await params).playerId)
  if (!playerId) notFound()
  const data = await getPlayerPageData(playerId)
  if (!data) notFound()
  const o = await getPlayerOverview(data)

  return (
    <div>
      {o.seasonNote ? <p style={{ margin: '0 0 8px', fontSize: 14, color: '#8a8275' }}>{o.seasonNote}</p> : null}
      <LatestGame o={o} />
      <OverviewBody o={o} data={data} />
    </div>
  )
}
