// src/app/mlb/lab/pitching-lab/[playerId]/shape/page.tsx
//
// Pitching Lab → Shape tab. SERVER page: decides isPro from the real session and only reads the
// shape data when Pro (the layout already gates the whole lab; this keeps the rule local too).
// Until pitch_shape_pitcher exists the data is null and we show an honest empty state.

import { isProViewer } from '@/lib/require-pro'
import { getShapeLabData } from '@/lib/pitch-shape/data'
import ShapeLab from '@/components/pitch-shape/ShapeLab'
import { Card, Empty } from '@/components/team/ui'

export default async function ShapeTab({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const isPro = await isProViewer()
  const data = isPro ? await getShapeLabData(Number(playerId)) : null
  if (!data) {
    return (
      <Card title="Pitch Shape">
        <Empty>{isPro ? 'Shape data for this pitcher isn’t built yet. Check back after the next nightly refresh.' : 'Pitch Shape is part of Pro.'}</Empty>
      </Card>
    )
  }
  return <ShapeLab data={data} isPro={isPro} />
}
