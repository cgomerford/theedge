// src/components/game-preview/BatterRadarMiniCard.tsx
//
// Replaces the old "Batting Radar" placeholder with a real mini-preview
// (percentiles + a tiny 3x3 hot-zone glance) that opens the full
// BattingPanel (real interactive HotZone heatmap + percentiles) in a
// grey-the-page-out DetailModal on click.

'use client'

import { useState } from 'react'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'
import { colorForBatterMetric } from '@/lib/hot-zones'
// Same zone-key set + quadrant-overlay technique as the full HotZone.tsx
// board and the Pitching/Batting Lab's own zone grids — a 2x2 chase-zone
// layer sits behind the 3x3 core, not 4 separate corner dots.
import { CORE_KEYS, CHASE_KEYS } from '@/components/pitching-lab/ZoneGrid'
import DetailModal from '../game-preview/DetailModal'
import BattingPanel, { type BattingData } from './BattingPanel'

function MiniHotZoneGrid({ zones }: { zones: Record<string, { xwoba?: number | null }> }) {
  return (
    <div className="relative w-16 aspect-square shrink-0">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-[3px]">
        {CHASE_KEYS.map(key => (
          <div key={key} className={colorForBatterMetric(zones[key]?.xwoba, 'xwoba')} />
        ))}
      </div>
      <div
        className="absolute grid grid-cols-3 gap-px border border-stone-900 bg-stone-900"
        style={{ top: '16%', left: '16%', width: '68%', height: '68%' }}
      >
        {CORE_KEYS.map(key => (
          <div key={key} className={colorForBatterMetric(zones[key]?.xwoba, 'xwoba')} />
        ))}
      </div>
    </div>
  )
}

export default function BatterRadarMiniCard({ data }: { data: BattingData }) {
  const [open, setOpen] = useState(false)
  const previewRows = data.percentileRows
  const allZones = data.hotZones['all']?.zones

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg border border-stone-200 bg-white p-3 hover:border-orange-300 hover:bg-orange-50/40 transition"
      >
        <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600 mb-2">◎ Batting Radar</p>

        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {previewRows.length === 0 ? (
              <p className="text-[11px] font-serif italic text-stone-400 py-1">Percentile data unavailable.</p>
            ) : (
              <SavantPercentileBar rows={previewRows} compact rounded edgeMarker />
            )}
          </div>
          {allZones && <MiniHotZoneGrid zones={allZones} />}
        </div>

        <p className="text-[10px] text-orange-600 mt-2 pt-2 border-t border-stone-100">Hot zones &amp; full breakdown →</p>
      </button>

      {open && (
        <DetailModal eyebrow={`${data.teamAbbr} · Batting`} title={data.batterName} onClose={() => setOpen(false)}>
          <BattingPanel data={data} />
        </DetailModal>
      )}
    </>
  )
}
