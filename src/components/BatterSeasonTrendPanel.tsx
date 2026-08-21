// src/components/BatterSeasonTrendPanel.tsx
'use client'

// Takes primitives (playerId, gameExitVeloAvg) rather than the deleted
// BatterGameSummary type from postgame-batter-sequence.ts — fed from
// postgame-batter-adapt.ts's batterExitVeloAvg() at the call site.

import { useEffect, useState } from 'react'
import { fetchStatcastClientSide } from '@/lib/batter-statcast'
import type { BatterStatcast } from '@/lib/batter-stats'

const EV_STANDOUT_MPH = 2.0

export default function BatterSeasonTrendPanel({
  playerId,
  gameExitVeloAvg,
}: {
  playerId: number
  gameExitVeloAvg: number | null
}) {
  const [seasonStats, setSeasonStats] = useState<BatterStatcast | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchStatcastClientSide(playerId)
      .then(setSeasonStats)
      .finally(() => setLoading(false))
  }, [playerId])

  if (loading) {
    return <div className="text-center text-stone-400 font-serif italic text-xs py-4">Loading season baseline…</div>
  }

  if (!seasonStats?.avg_exit_velocity || gameExitVeloAvg == null) {
    return (
      <div className="bg-stone-50 rounded-lg p-3 text-center text-stone-400 font-serif italic text-xs">
        Not enough data to compare against season baseline.
      </div>
    )
  }

  const delta = gameExitVeloAvg - seasonStats.avg_exit_velocity
  const standout = Math.abs(delta) >= EV_STANDOUT_MPH

  return (
    <div className="space-y-2">
      {standout && (
        <div className="px-3 py-2 rounded-lg border-l-[3px] border-yellow-400" style={{ background: 'rgba(253,224,71,0.08)' }}>
          <p className="font-serif italic text-stone-700 text-xs leading-relaxed">
            Exit velo {delta > 0 ? 'well above' : 'well below'} season average tonight —
            {' '}{gameExitVeloAvg.toFixed(1)} mph vs {seasonStats.avg_exit_velocity.toFixed(1)} mph season.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-stone-50 rounded-lg p-2.5 text-center">
          <div className="font-mono text-sm font-bold text-stone-900">{gameExitVeloAvg.toFixed(1)}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mt-0.5">Tonight Avg EV</div>
        </div>
        <div className="bg-stone-50 rounded-lg p-2.5 text-center">
          <div className="font-mono text-sm font-bold text-stone-900">{seasonStats.avg_exit_velocity.toFixed(1)}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mt-0.5">Season Avg EV</div>
        </div>
      </div>
    </div>
  )
}