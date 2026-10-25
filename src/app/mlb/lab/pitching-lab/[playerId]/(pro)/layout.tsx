// src/app/mlb/lab/pitching-lab/[playerId]/(pro)/layout.tsx
//
// The Pitching Lab tabs behind the page's one ProGate: Arsenal, Location, Hot Zone Overlay, Shape, Sequencing, H2H, Trends.
// Overview (the lab's index page) sits outside this group and is free. The tabs' data APIs are gated separately
// (lib/require-pro.ts), so bypassing the page does not reach the data. A route group: it adds no URL segment.

import ProGate from '@/components/pro/ProGate'
import { ArsenalZonesPreview } from '@/components/pro/previews'

export default function ProPitchingTabs({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate feature="Zones and arsenal detail" source="pitching_lab" preview={<ArsenalZonesPreview />}>
        {children}
      </ProGate>
    </div>
  )
}
