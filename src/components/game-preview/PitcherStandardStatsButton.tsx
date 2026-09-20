// src/components/game-preview/PitcherStandardStatsButton.tsx
//
// "Standard Stats" trigger + modal for a starting pitcher — sibling to
// PitcherRadarMiniCard's "Pitching Radar & Arsenal" trigger. All data is
// pre-fetched server-side already (StartingPitcherData.trend /
// .venueRecord), so this is a plain open/close toggle, no client fetch.

'use client'

import { useState } from 'react'
import DetailModal from './DetailModal'
import PitcherStandardStats from './PitcherStandardStats'
import LabFunnelLink from './LabFunnelLink'
import type { StartingPitcherData } from './StartingPitcherPanel'

export default function PitcherStandardStatsButton({ data, isPro }: { data: StartingPitcherData; isPro: boolean }) {
  const [open, setOpen] = useState(false)
  const era = data.percentileRows.find(r => r.label === 'ERA')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg border border-stone-200 bg-white p-3 hover:border-orange-300 hover:bg-orange-50/40 transition"
      >
        <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600 mb-2">◎ Standard Stats</p>
        {era && <p className="text-[11px] text-stone-700">ERA <span className="font-mono font-bold text-stone-900">{era.rawValue}</span></p>}
        {data.trend?.trend_label && <p className="text-[11px] text-stone-500 mt-1">{data.trend.trend_label}</p>}
        {data.venueRecord && (
          <p className="text-[10.5px] text-stone-500 mt-1">At this park: {data.venueRecord.starts} starts, {data.venueRecord.era != null ? data.venueRecord.era.toFixed(2) : '—'} ERA</p>
        )}
        <p className="text-[10px] text-orange-600 mt-2 pt-2 border-t border-stone-100">Full breakdown →</p>
      </button>

      {open && (
        <DetailModal eyebrow={`${data.teamAbbr} · Starting Pitcher`} title={data.pitcherName} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <PitcherStandardStats data={data} />
            <div className="pt-3 border-t border-stone-100">
              <LabFunnelLink href={`/mlb/pitching-lab/${data.pitcherId}`} label={`See ${data.pitcherName} in Pitching Lab`} isPro={isPro} />
            </div>
          </div>
        </DetailModal>
      )}
    </>
  )
}
