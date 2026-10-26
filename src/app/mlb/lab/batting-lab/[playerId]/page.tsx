// src/app/mlb/lab/batting-lab/[playerId]/page.tsx — Batting Lab Overview
//
// Same layout as the player page (wide main column + right rail), rendered on the server: season line, percentiles, last 5, vs pitch type,
// career, what changed, splits. The lab's own deeper tabs hold swing, contact, zones, head-to-head and the rest; the pointer below says so.
// Bat speed & contact quality stays here (Pro / the viewer's deep look), read from the lab data on the client.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPlayerPageData } from '@/lib/player-page'
import { getPlayerOverview } from '@/lib/player-overview'
import FollowControl from '@/components/signup/FollowControl'
import BatSpeedPanel from '@/components/batting-lab/BatSpeedPanel'
import { LatestGame, OverviewBody } from '@/components/player-page/PlayerOverviewView'

const LAB_TABS = [
  { seg: 'arsenal', label: 'Vs Arsenal' }, { seg: 'location', label: 'Location Lab' }, { seg: 'hot-zones', label: 'Hot Zone Overlay' },
  { seg: 'sequencing', label: 'Sequencing' }, { seg: 'trends', label: 'Trends' }, { seg: 'h2h', label: 'H2H' }, { seg: 'swing', label: 'Swing' },
  { seg: 'contact', label: 'Contact' }, { seg: 'outcomes', label: 'Outcomes' }, { seg: 'platoon', label: 'Platoon' }, { seg: 'approach', label: 'Approach' },
]

export default async function BattingLabOverview({ params }: { params: Promise<{ playerId: string }> }) {
  const playerId = Number((await params).playerId)
  if (!playerId) notFound()
  const data = await getPlayerPageData(playerId)
  if (!data) notFound()
  const o = await getPlayerOverview(data)
  const base = `/mlb/lab/batting-lab/${playerId}`

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 18px', paddingBottom: 12 }}>
        <FollowControl kind="player" refId={String(playerId)} name={data.identity.fullName} />
        <Link href={`/mlb/players/${playerId}`} style={{ color: '#FF5722', fontWeight: 800, fontSize: 14 }}>Player page →</Link>
      </div>
      {o.seasonNote ? <p style={{ margin: '0 0 8px', fontSize: 14, color: '#8a8275' }}>{o.seasonNote}</p> : null}
      <div style={{ fontSize: 14, padding: '10px 0', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', lineHeight: 1.9 }}>
        <b>Go deeper in the Batting Lab:</b>{' '}
        {LAB_TABS.map((t, i) => (
          <span key={t.seg}>{i ? ' · ' : ''}<Link href={`${base}/${t.seg}`} style={{ color: '#FF5722', fontWeight: 800 }}>{t.label}</Link></span>
        ))}
      </div>
      <LatestGame o={o} />
      <OverviewBody o={o} data={data} />
      <div style={{ marginTop: 36 }}><BatSpeedPanel /></div>
    </div>
  )
}
