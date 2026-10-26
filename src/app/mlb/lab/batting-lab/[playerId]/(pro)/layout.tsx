// src/app/mlb/lab/batting-lab/[playerId]/(pro)/layout.tsx
//
// The Batting Lab Pro tabs behind the page's one ProGate: Vs Arsenal, Hot Zones, Location, Sequencing, Trends, H2H.
// Opening one of these tabs IS the choice to spend a free account's daily deep look, so the gate claims (claim): one look opens
// every one of these tabs for this batter that day. The Reaction tab is outside this group and never claims (Pro only).
// Overview and the Nerve Centre tabs are free. The tabs' data APIs check the same look (lib/deep-look.ts), so bypassing the
// page does not reach the data. A route group: it adds no URL segment.

import ProGate from '@/components/pro/ProGate'
import { ArsenalZonesPreview } from '@/components/pro/previews'

export default async function ProBattingTabs({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate feature="batting_lab" entityId={playerId} source="batting_lab" claim shell={<ArsenalZonesPreview />} full={async () => children} />
    </div>
  )
}
