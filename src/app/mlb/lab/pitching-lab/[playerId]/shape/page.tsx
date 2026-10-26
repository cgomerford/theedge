// src/app/mlb/lab/pitching-lab/[playerId]/shape/page.tsx
//
// Pitching Lab → Shape tab. SERVER page with its own ProGate: feature 'pitch_shape', the SAME look Pitch Shape Lab uses for this
// pitcher, so opening this tab and opening the pitcher in Pitch Shape Lab cost one look between them. It lives outside the (pro)
// route group so it does not also claim 'pitching_lab'. Shape data is only read once the gate allows it.

import ProGate from '@/components/pro/ProGate'
import { getShapeLabData } from '@/lib/pitch-shape/data'
import ShapeLab from '@/components/pitch-shape/ShapeLab'
import { Card, Empty } from '@/components/team/ui'
import LabTabShell from '@/components/pro/LabTabShell'
import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'

export default async function ShapeTab({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  const name = person?.fullName ?? 'this player'
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate
        feature="pitch_shape" entityId={playerId} source="pitch_shape" claim shell={<LabTabShell lab="pitching" name={name} />} who={{ lab: 'pitching', name }}
        full={async () => {
          const data = await getShapeLabData(Number(playerId))
          if (!data) return <Card title="Pitch Shape"><Empty>Shape data for this pitcher isn’t built yet. Check back after the next nightly refresh.</Empty></Card>
          return <ShapeLab data={data} isPro />
        }}
      />
    </div>
  )
}
