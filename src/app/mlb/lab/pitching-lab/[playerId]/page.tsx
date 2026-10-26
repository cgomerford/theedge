// src/app/mlb/lab/pitching-lab/[playerId]/page.tsx — Pitching Lab Overview
//
// Same layout as the player page (wide main column + right rail), rendered on the server: season line, percentiles, last 5, vs pitch type,
// career, what changed, splits. The lab's own deeper tabs hold swing, contact, zones, head-to-head and the rest; the pointer below says so.
// Bat speed & contact quality stays here (Pro / the viewer's deep look), read from the lab data on the client.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPlayerPageData } from '@/lib/player-page'
import { getPlayerOverview } from '@/lib/player-overview'
import { LatestGame, OverviewBody } from '@/components/player-page/PlayerOverviewView'

const LAB_TABS = [
  { seg: 'arsenal', label: 'Arsenal' }, { seg: 'location', label: 'Location Lab' }, { seg: 'overlay', label: 'Hot Zone Overlay' }, { seg: 'shape', label: 'Shape' },
  { seg: 'stuff', label: 'Stuff' }, { seg: 'sequencing', label: 'Sequencing' }, { seg: 'h2h', label: 'H2H' }, { seg: 'trends', label: 'Trends' },
]

export default async function PitchingLabOverview({ params }: { params: Promise<{ playerId: string }> }) {
  const playerId = Number((await params).playerId)
  if (!playerId) notFound()
  const data = await getPlayerPageData(playerId)
  if (!data) notFound()
  const o = await getPlayerOverview(data)
  const base = `/mlb/lab/pitching-lab/${playerId}`

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 18px', paddingBottom: 12 }}>
        <Link href={`/mlb/players/${playerId}`} style={{ color: '#FF5722', fontWeight: 800, fontSize: 14 }}>Player page →</Link>
      </div>
      {o.seasonNote ? <p style={{ margin: '0 0 8px', fontSize: 14, color: '#8a8275' }}>{o.seasonNote}</p> : null}
      <div style={{ fontSize: 14, padding: '10px 0', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', lineHeight: 1.9 }}>
        <b>Go deeper in the Pitching Lab:</b>{' '}
        {LAB_TABS.map((t, i) => (
          <span key={t.seg}>{i ? ' · ' : ''}<Link href={`${base}/${t.seg}`} style={{ color: '#FF5722', fontWeight: 800 }}>{t.label}</Link></span>
        ))}
      </div>
      <LatestGame o={o} />
      <OverviewBody o={o} data={data} />
    </div>
  )
}
