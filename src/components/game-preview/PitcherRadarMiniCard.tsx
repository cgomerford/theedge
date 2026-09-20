// src/components/game-preview/PitcherRadarMiniCard.tsx
//
// Replaces the old separate "Pitching Radar" / "Arsenal" trigger boxes
// with one card: a real mini-preview (top 4 percentiles + the top pitch)
// sized to give the team panel real height instead of two thin dashed
// placeholders, that opens the full StartingPitcherPanel in a
// grey-the-page-out DetailModal on click — same interaction George asked
// for on the Edge Indicator's factors, now here too.

'use client'

import { useState } from 'react'
import SavantPercentileBar from '@/components/charts/SavantPercentileBar'
import DetailModal from './DetailModal'
import StartingPitcherPanel, { type StartingPitcherData } from './StartingPitcherPanel'
import LabFunnelLink from './LabFunnelLink'

export default function PitcherRadarMiniCard({ data, isPro }: { data: StartingPitcherData; isPro: boolean }) {
  const [open, setOpen] = useState(false)
  const previewRows = data.percentileRows.slice(0, 4)
  const topPitch = data.arsenal[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg border border-stone-200 bg-white p-3 hover:border-orange-300 hover:bg-orange-50/40 transition"
      >
        <p className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600 mb-2">◎ Pitching Radar &amp; Arsenal</p>

        {!data.qualified ? (
          <p className="text-[11px] font-sans italic text-stone-400 py-1">Not enough innings to rank yet.</p>
        ) : previewRows.length === 0 ? (
          <p className="text-[11px] font-sans italic text-stone-400 py-1">Percentile data unavailable.</p>
        ) : (
          <SavantPercentileBar rows={previewRows} compact rounded edgeMarker />
        )}

        {topPitch && (
          <p className="text-[10.5px] text-stone-500 mt-2 pt-2 border-t border-stone-100">
            Top pitch: <span className="text-stone-800 font-medium">{topPitch.pitchName}</span>
            {topPitch.usagePct != null && ` · ${topPitch.usagePct.toFixed(0)}%`}
            {topPitch.avgVelo != null && ` · ${topPitch.avgVelo.toFixed(1)} mph`}
          </p>
        )}

        <p className="text-[10px] text-orange-600 mt-2">Full breakdown →</p>
      </button>

      {open && (
        <DetailModal eyebrow={`${data.teamAbbr} · Starting Pitcher`} title={data.pitcherName} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <StartingPitcherPanel data={data} />
            <div className="pt-3 border-t border-stone-100">
              <LabFunnelLink href={`/mlb/pitching-lab/${data.pitcherId}`} label={`See ${data.pitcherName} in Pitching Lab`} isPro={isPro} />
            </div>
          </div>
        </DetailModal>
      )}
    </>
  )
}
