'use client'

// src/components/BatterAttackPlanCard.tsx
//
// "How should this pitcher attack this batter" — cross-references two
// things that already exist independently but were never combined:
//   1. This batter's per-pitch-type zone weaknesses (batter_zone_arsenal,
//      lib/batter-zone-arsenal.ts)
//   2. The OPPOSING pitcher's actual arsenal usage% (pitcher_zone_arsenal,
//      already fetched for PitchLocationCard as `arsenal` prop)
//
// For each of the opposing pitcher's real, meaningfully-used pitches
// (>=10% usage), shows this batter's weakest zone against that specific
// pitch type — the actual matchup, not just "this batter is weak against
// sliders in general" or "this pitcher throws a lot of sliders" in
// isolation.
//
// Genuinely no data ("no data" badge) if either side hasn't cleared its
// minimum sample threshold for a given pitch type — never fabricated.

import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { ZONE_LABELS } from '@/lib/hot-zones'

type Props = {
  batterName: string
  color: string
  batterZoneArsenal: Record<string, BatterZoneArsenal>   // keyed by split: all/vs_lhp/vs_rhp
  pitcherArsenal: Record<string, PitcherZoneArsenal>       // keyed by split: all/vs_lhb/vs_rhb — the OPPOSING pitcher's
  pitcherThrows: 'L' | 'R'
}

const MIN_PITCHER_USAGE = 10 // only cross-reference pitches the opposing pitcher actually leans on

export default function BatterAttackPlanCard({ batterName, color, batterZoneArsenal, pitcherArsenal, pitcherThrows }: Props) {
  const batterSplitKey = pitcherThrows === 'L' ? 'vs_lhp' : 'vs_rhp'
  const batterData = batterZoneArsenal[batterSplitKey] ?? batterZoneArsenal['all']

  // Opposing pitcher's arsenal — use their 'all' split for usage%, since
  // that's the most stable read on what they actually throw most.
  const pitcherData = pitcherArsenal['all']

  if (!batterData || !pitcherData) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-3 text-center">
        <p className="text-[10px] font-mono text-stone-400 italic">{batterName}: no attack-plan data yet</p>
      </div>
    )
  }

  const pitcherPitches = Object.entries(pitcherData.arsenal)
    .filter(([, p]) => (p.usage_pct ?? 0) >= MIN_PITCHER_USAGE)
    .sort((a, b) => (b[1].usage_pct ?? 0) - (a[1].usage_pct ?? 0))
    .slice(0, 3) // top 3 pitches — this is a compact card, not the full arsenal table

  if (pitcherPitches.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-3 text-center">
        <p className="text-[10px] font-mono text-stone-400 italic">{batterName}: opposing pitcher's arsenal not confirmed yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Attack plan</p>
        <p className="font-serif font-semibold text-sm text-stone-900">{batterName}</p>
        <p className="text-[9px] font-serif italic text-stone-400 mt-0.5">
          The opposing pitcher's most-used pitches, cross-referenced against where this batter has been weakest against each one.
        </p>
      </div>
      <div className="p-3 space-y-2">
        {pitcherPitches.map(([code, pitcherPitch]) => {
          const batterPitch = batterData.arsenal[code]
          if (!batterPitch) {
            return (
              <div key={code} className="text-[11px] border border-stone-100 rounded-lg p-2">
                <p className="font-mono font-semibold text-stone-800">{pitcherPitch.pitch_name}</p>
                <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mt-1">Pitcher</p>
                <p className="text-stone-700">Throws it <span className="font-bold">{pitcherPitch.usage_pct}%</span> of the time</p>
                <p className="font-serif italic text-stone-400 text-[10px] mt-1">{batterName} hasn't faced enough of this pitch to show a batter-side read.</p>
              </div>
            )
          }

          const zoneEntries = Object.entries(batterPitch.zones).filter(([, z]) => (z.ab ?? 0) >= 5 && z.ba != null)
          const worstZone = zoneEntries.sort((a, b) => (a[1].ba ?? 1) - (b[1].ba ?? 1))[0]

          return (
            <div key={code} className="text-[11px] border border-stone-100 rounded-lg p-2">
              <p className="font-mono font-semibold text-stone-800 mb-1">{pitcherPitch.pitch_name}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">Pitcher's mix</p>
                  <p className="text-stone-700">
                    <span className="font-bold">{pitcherPitch.usage_pct}%</span> of his pitches
                  </p>
                  {pitcherPitch.avg_velo != null && (
                    <p className="text-stone-500 text-[10px]">{pitcherPitch.avg_velo} mph avg</p>
                  )}
                </div>
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">Batter has faced</p>
                  <p className="text-stone-700">
                    <span className="font-bold">{batterPitch.total_pitches}</span> pitches this season
                  </p>
                  <p className="text-stone-500 text-[10px]">
                    Hits {batterPitch.ba != null ? `.${(batterPitch.ba * 1000).toFixed(0).padStart(3, '0')}` : '—'} overall vs it
                  </p>
                </div>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-stone-100">
                {worstZone ? (
                  <p className="text-stone-600">
                    Weakest spot: <span style={{ color }} className="font-semibold">{ZONE_LABELS[worstZone[0]] ?? `zone ${worstZone[0]}`}</span>
                    {' — hits '}
                    <span className="font-semibold">{worstZone[1].ba != null ? `.${(worstZone[1].ba * 1000).toFixed(0).padStart(3, '0')}` : '—'}</span>
                    {' there ('}{worstZone[1].ab} AB this season{')'}
                  </p>
                ) : (
                  <p className="text-stone-400 italic">No single zone has 5+ AB yet for this pitch — sample too thin to call a weak spot.</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[7px] font-mono text-stone-400 px-3 pb-2">
        All AB counts are season-to-date, not just this matchup — small samples (under ~10 AB) are a lean, not a certainty.
      </p>
    </div>
  )
}