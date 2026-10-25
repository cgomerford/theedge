// src/app/mlb/lab/batting-lab/[playerId]/(pro)/layout.tsx
//
// The Batting Lab tabs behind the page's one ProGate: Vs Arsenal, Hot Zones, Location, Sequencing, Trends, H2H.
// Overview (the lab's index page) sits outside this group and is free; Contact and the other Nerve Centre tabs stay open
// to any signed-up member. The tabs' data APIs are gated separately (lib/require-pro.ts), so bypassing the page does not reach the data.
// A route group: it adds no URL segment.

import ProGate from '@/components/pro/ProGate'
import { ArsenalZonesPreview } from '@/components/pro/previews'

export default function ProBattingTabs({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate feature="Zones and arsenal detail" source="batting_lab" preview={<ArsenalZonesPreview />}>
        {children}
      </ProGate>
    </div>
  )
}
