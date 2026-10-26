// src/app/mlb/lab/pitching-lab/[playerId]/shape/page.tsx
//
// Pitching Lab → Shape tab. SERVER page with its own ProGate: feature 'pitch_shape', the SAME look Pitch Shape Lab uses for this
// pitcher, so opening this tab and opening the pitcher in Pitch Shape Lab cost one look between them. It lives outside the (pro)
// route group so it does not also claim 'pitching_lab'. Shape data is only read once the gate allows it.

import ProGate from '@/components/pro/ProGate'
import { getShapeLabData } from '@/lib/pitch-shape/data'
import ShapeLab from '@/components/pitch-shape/ShapeLab'
import { Card, Empty } from '@/components/team/ui'
import { PITCH_ORDER, PITCH_NAME, pitchColor } from '@/lib/lab/pitch-meta'

function ShapeShell() {
  return (
    <Card title="Pitch Shape">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {PITCH_ORDER.slice(0, 9).map(c => (
          <li key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: pitchColor(c), display: 'inline-block' }} />{c} {PITCH_NAME[c]}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12, fontSize: 13, color: '#8a8275' }}>Horizontal break · Induced vertical break</div>
    </Card>
  )
}

export default async function ShapeTab({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate
        feature="pitch_shape" entityId={playerId} source="pitch_shape" claim shell={<ShapeShell />}
        full={async () => {
          const data = await getShapeLabData(Number(playerId))
          if (!data) return <Card title="Pitch Shape"><Empty>Shape data for this pitcher isn’t built yet. Check back after the next nightly refresh.</Empty></Card>
          return <ShapeLab data={data} isPro />
        }}
      />
    </div>
  )
}
