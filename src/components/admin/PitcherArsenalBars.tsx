'use client'

// src/components/admin/PitcherArsenalBars.tsx
//
// Bar-chart arsenal view built specifically for the Scout Report Graphic
// (social/X-post export) — NOT a replacement for PitchLocationCard's
// zone grid in the main interactive Scout Report, which stays as-is
// there since click-to-expand + 2D location detail genuinely earns its
// space in a report someone is actively reading on-screen.
//
// A grid of small cells is the wrong shape for a shareable social image:
// tiny text, low info density per pixel, and X/Twitter's own compression
// hits fine detail hardest. This trades the 2D location grid for ranked
// horizontal bars (usage%, whiff%, put-away%, velo) at much larger font
// sizes, plus the same "Lives / Vulnerable" text summary the zone grid
// already produces (still conveys location — as words, not a grid).

import type { PitcherHotZones } from '@/lib/hot-zones'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'

type Props = {
  pitcherName: string
  abbr: string
  color: string
  hotZones: Record<string, PitcherHotZones>
  richArsenal: RichArsenalPitch[]
}

export default function PitcherArsenalBars({ pitcherName, abbr, color, hotZones, richArsenal }: Props) {
  const zones = hotZones['all']
  const topPitches = [...richArsenal]
    .filter(p => (p.percentage ?? 0) >= 5)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .slice(0, 4)

  if (topPitches.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{abbr} · {pitcherName}</p>
        <p className="text-sm font-serif italic text-stone-400">Arsenal data not yet available.</p>
      </div>
    )
  }

  const maxPct = Math.max(...topPitches.map(p => p.percentage ?? 0))

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{abbr} · SP</p>
        <p className="font-serif font-semibold text-stone-900 text-base">{pitcherName}</p>
      </div>

      <div className="p-3 space-y-2.5">
        {topPitches.map(p => {
          const pct = p.percentage ?? 0
          const widthPct = maxPct > 0 ? (pct / maxPct) * 100 : 0
          return (
            <div key={p.pitch_type}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-mono text-sm font-bold text-stone-800">{p.pitch_name ?? p.pitch_type}</span>
                <span className="font-mono text-sm font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-stone-100 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: color }} />
              </div>
              <div className="flex gap-3 font-mono text-[10px] text-stone-500">
                {p.avg_velocity != null && <span>{p.avg_velocity.toFixed(1)} mph</span>}
                {p.whiff_percent != null && <span>{p.whiff_percent.toFixed(1)}% whiff</span>}
                {p.put_away_percent != null && <span>{p.put_away_percent.toFixed(1)}% put-away</span>}
              </div>
            </div>
          )
        })}
      </div>

      {(zones?.go_to_zone_label || zones?.weak_zone_label) && (
        <div className="px-3 py-2.5 border-t border-stone-100 bg-stone-50 text-center space-y-0.5">
          {zones?.go_to_zone_label && (
            <p className="font-mono text-xs text-stone-700">
              Lives: <span className="font-bold text-stone-900">{zones.go_to_zone_label}</span>
            </p>
          )}
          {zones?.weak_zone_label && (
            <p className="font-mono text-xs text-stone-700">
              Vulnerable: <span className="font-bold text-red-600">{zones.weak_zone_label}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
