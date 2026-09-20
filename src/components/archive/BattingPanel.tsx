// src/components/game-preview/BattingPanel.tsx
//
// Full batting detail content — season percentiles and the interactive
// hot-zone heatmap (lib/hot-zones.ts + components/HotZone.tsx — HotZone's
// own header comment says it was built for exactly this, "the game
// preview page", already pro-gated and hover/tap-interactive). Pure
// body content, no card chrome or header — rendered inside DetailModal.

import HotZone from '@/components/HotZone'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'
import type { PercentileRow } from '@/components/charts/types'
import type { BatterHotZones } from '@/lib/hot-zones'

export type BattingData = {
  batterId: number
  batterName: string
  teamAbbr: string
  teamColor: string
  hotZones: Record<string, BatterHotZones>
  percentileRows: PercentileRow[]
  isPro: boolean
}

export default function BattingPanel({ data }: { data: BattingData }) {
  const { batterName, hotZones, percentileRows, isPro } = data
  const hasHotZones = Object.keys(hotZones).length > 0

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Season percentiles</p>
        {percentileRows.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400 py-2">Percentile data unavailable.</p>
        ) : (
          <SavantPercentileBar rows={percentileRows} rounded edgeMarker />
        )}
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-2">Hot zones</p>
        {!hasHotZones ? (
          <p className="text-xs font-serif italic text-stone-400 py-2">Hot-zone data unavailable for this batter yet.</p>
        ) : (
          <HotZone mode="batter" data={hotZones} isPro={isPro} playerName={batterName} />
        )}
      </div>
    </div>
  )
}
