// src/app/mlb/lab/pitching-lab/[playerId]/shape/page.tsx
//
// Pitching Lab → Shape tab. SERVER page with its own ProGate: feature 'pitch_shape', the SAME look Pitch Shape Lab uses for this
// pitcher, so opening this tab and opening the pitcher in Pitch Shape Lab cost one look between them. It lives outside the (pro)
// route group so it does not also claim 'pitching_lab'. Shape data is only read once the gate allows it. Locked-out visitors see
// the same tab on a sample pitcher, labelled as an example.

import ProGate from '@/components/pro/ProGate'
import DemoFrame from '@/components/pro/DemoFrame'
import { getShapeLabData } from '@/lib/pitch-shape/data'
import ShapeLab from '@/components/pitch-shape/ShapeLab'
import { Card, Empty } from '@/components/team/ui'
import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import { isSignedIn } from '@/lib/require-signup'
import LockedTab from '@/components/pro/LockedTab'
import { demoSnapshot } from '@/lib/lab-demo-server'

async function sampleShape() {
  const data = demoSnapshot<Awaited<ReturnType<typeof getShapeLabData>>>('shape')   // stored sample, never a live read
  return data ? <ShapeLab data={data} isPro /> : <Card title="Pitch Shape"><Empty>No example available right now.</Empty></Card>
}

export default async function ShapeTab({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  const name = person?.fullName ?? 'this player'
  // Signed out: this tab needs an account; nothing is read or rendered.
  if (!(await isSignedIn())) return <LockedTab name={name} />
  return (
    <div style={{ margin: '0 auto' }}>
      <ProGate
        feature="pitch_shape" entityId={playerId} source="pitch_shape" claim who={{ lab: 'pitching', name }}
        shell={async () => <DemoFrame lab="pitching" realName={name}>{await sampleShape()}</DemoFrame>}
        full={async () => {
          const data = await getShapeLabData(Number(playerId))
          if (!data) return <Card title="Pitch Shape"><Empty>Shape data for this pitcher isn’t built yet. Check back after the next nightly refresh.</Empty></Card>
          return <ShapeLab data={data} isPro />
        }}
      />
    </div>
  )
}
