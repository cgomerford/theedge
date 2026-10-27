// src/app/mlb/lab/batting-lab/[playerId]/spray/page.tsx — Batting Lab "Spray" tab.
// Server page: reads the stored per-batter spray row (no Savant fetch in the render path). Sign-up gate only (../layout.tsx); signed out
// sees the sample player's chart, labelled as an example.
import { getLineupSpray } from '@/lib/batter-spray'
import { getPlayerPageData } from '@/lib/player-page'
import { labBatterId } from '@/lib/lab-player'
import SprayView from '@/components/batting-lab/SprayView'

export const dynamic = 'force-dynamic'

export default async function BattingSprayPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requested } = await params
  const id = await labBatterId(Number(requested))
  const [rows, page] = await Promise.all([getLineupSpray([id]), getPlayerPageData(id)])
  const plays = rows[0]?.plays ?? []
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 80px' }}>
      <h1 style={{ margin: '14px 0 12px', fontWeight: 800, fontSize: 'clamp(26px,4vw,40px)', letterSpacing: '-.02em' }}>Spray chart</h1>
      <SprayView plays={plays} bats={page?.identity.batSide ?? null} />
    </div>
  )
}
