// src/components/game-preview/TeamPitcherCard.tsx
//
// "Starting Pitcher" box: small headshot + name, real "Recent Games"
// (last-3-starts trend — see StartingPitcherData.trend), then two
// buttons — "Standard Stats" and "Pitching Radar & Arsenal" — that each
// open their own full detail in a grey-out modal (PitcherStandardStats /
// StartingPitcherPanel).

import { playerHeadshotUrl } from '@/lib/mlb'
import ShellPlaceholder from './ShellPlaceholder'
import PitcherRadarMiniCard from './PitcherRadarMiniCard'
import PitcherStandardStatsButton from './PitcherStandardStatsButton'
import type { StartingPitcherData } from './StartingPitcherPanel'

export default function TeamPitcherCard({
  pitcherId, pitcherName, sp, isPro,
}: {
  pitcherId?: number
  pitcherName?: string
  sp: StartingPitcherData | null
  isPro: boolean
}) {
  const trend = sp?.trend

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Starting Pitcher</p>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-lg border border-stone-200 p-2 flex flex-col items-center justify-center text-center gap-1.5">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
            {pitcherId && (
              <img src={playerHeadshotUrl(pitcherId, 96)} alt={pitcherName ?? ''} className="w-full h-full object-cover" />
            )}
          </div>
          <p className="text-[10.5px] font-sans font-semibold text-stone-900 leading-tight">{pitcherName ?? 'TBD'}</p>
        </div>

        {trend ? (
          <div className="rounded-lg border border-stone-200 p-2">
            <p className="text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600 mb-1">◎ Recent Games</p>
            <p className="text-[10.5px] text-stone-600 leading-snug">
              {trend.last_3_era != null ? `${trend.last_3_era.toFixed(2)} ERA` : '—'} · {trend.last_3_innings} IP (L3)
            </p>
            {trend.trend_label && <p className="text-[10px] text-stone-400 mt-0.5">{trend.trend_label}</p>}
          </div>
        ) : (
          <ShellPlaceholder title="Recent Games" note="No recent-start data on record yet" />
        )}
      </div>

      {sp ? (
        <div className="grid grid-cols-2 gap-2">
          <PitcherStandardStatsButton data={sp} isPro={isPro} />
          <PitcherRadarMiniCard data={sp} isPro={isPro} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ShellPlaceholder title="Standard Stats" note="Unavailable yet" />
          <ShellPlaceholder title="Pitching Radar & Arsenal" note="Percentile stats, once tracked" />
        </div>
      )}
    </div>
  )
}
