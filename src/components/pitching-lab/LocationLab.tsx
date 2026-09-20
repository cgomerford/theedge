'use client'

// src/components/pitching-lab/LocationLab.tsx
//
// "Real Pitch Location / Hot Zones" — the deep version of PitchLocationCard's
// zone grid. Same real 13-zone data (pitcher_hot_zones / pitcher_zone_arsenal,
// scripts/fetch_pitcher_hot_zones.py), extended 2026-09-13 with slg_against,
// hard_hit_pct, woba_against, run_value_per_100 per zone (real Statcast
// fields: launch_speed, estimated_woba_using_speedangle, delta_run_exp,
// bb_type — see the fetch script's header for the exact provenance of each).
//
// Deliberately NOT built here (would need new pipeline data, not just a UI
// pass): a count filter (early/even/2-strike/3-ball) — the zone tables
// aren't broken out by count (see the Hot Zone Overlay tab for that,
// built off a separate live per-pitch pull instead of this page's cron
// tables).
//
// 2026-09-14: added the continuous-heatmap companion view (real
// plate_x/plate_z, binned + smoothed) — see PitchDensityHeatmap.tsx.

import { useMemo, useState } from 'react'
import type { PitcherHotZones, PitcherZoneMetric } from '@/lib/hot-zones'
import type { PitcherZoneArsenal, ArsenalPitch } from '@/lib/pitcher-arsenal'
import ZoneGrid, { METRICS, CORE_KEYS, CHASE_KEYS, CHASE_SET, ZoneColorLegend, type View, type Cell } from '@/components/pitching-lab/ZoneGrid'
import PitchDensityHeatmap from '@/components/pitching-lab/PitchDensityHeatmap'

type Split = 'all' | 'vs_lhb' | 'vs_rhb'
type SideMode = Split | 'both'

const SIDE_LABELS: Record<SideMode, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB', both: 'LHB | RHB' }

function summarizePitch(pitch: ArsenalPitch) {
  let corePitches = 0, chasePitches = 0
  let swings = 0, whiffs = 0
  let rvWeighted = 0, rvWeight = 0
  const heartPitches = pitch.zones['5']?.pitches ?? 0

  for (const key of [...CORE_KEYS, ...CHASE_KEYS]) {
    const z = pitch.zones[key]
    if (!z) continue
    if (CHASE_SET.has(key)) chasePitches += z.pitches
    else corePitches += z.pitches
    swings += z.swings
    whiffs += z.whiffs
    if (z.run_value_per_100 != null) {
      rvWeighted += z.run_value_per_100 * z.pitches
      rvWeight += z.pitches
    }
  }

  const total = pitch.total_pitches || (corePitches + chasePitches)
  return {
    zonePct: total > 0 ? (corePitches / total) * 100 : null,
    edgePct: total > 0 ? (chasePitches / total) * 100 : null,
    heartPct: total > 0 ? (heartPitches / total) * 100 : null,
    whiffPct: swings > 0 ? (whiffs / swings) * 100 : null,
    runValuePer100: rvWeight > 0 ? rvWeighted / rvWeight : null,
  }
}

function fmt1(v: number | null): string { return v == null ? '—' : v.toFixed(1) }
function fmtRv(v: number | null): string { return v == null ? '—' : v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1) }

type Props = {
  pitcherId: number
  pitcherName: string
  abbr: string
  hotZones: Record<string, PitcherHotZones>
  arsenal: Record<string, PitcherZoneArsenal>
}

export default function LocationLab({ pitcherId, pitcherName, abbr, hotZones, arsenal }: Props) {
  const [side, setSide] = useState<SideMode>('all')
  const [metric, setMetric] = useState<PitcherZoneMetric>('usage_pct')
  const [pitchFilter, setPitchFilter] = useState<string>('ALL')
  const [view, setView] = useState<View>('catcher')

  const availableSplits = (['all', 'vs_lhb', 'vs_rhb'] as Split[]).filter(s => hotZones[s])
  const pitchOptions = useMemo(() => {
    const a = arsenal['all']
    if (!a) return []
    return Object.entries(a.arsenal)
      .filter(([, p]) => (p.usage_pct ?? 0) >= 5)
      .sort((x, y) => (y[1].usage_pct ?? 0) - (x[1].usage_pct ?? 0))
  }, [arsenal])

  function zonesFor(split: Split): Record<string, Cell> | null {
    if (pitchFilter === 'ALL') return hotZones[split]?.zones ?? null
    return arsenal[split]?.arsenal[pitchFilter]?.zones ?? null
  }

  const splitsToShow: Split[] = side === 'both' ? ['vs_lhb', 'vs_rhb'] : [side as Split]
  const label = arsenal['all']?.arsenal[pitchFilter]?.pitch_name

  // Mix-stable table — always Usage/Velo/Zone%/Edge%/Heart%/Whiff%/RV per
  // pitch, independent of the metric toggle above (per spec: table and
  // heatmap must never disagree about which metric is "on").
  const tableRows = useMemo(() => {
    const a = arsenal['all']
    if (!a) return []
    return pitchOptions.map(([code, p]) => ({ code, pitch: p, s: summarizePitch(p) }))
  }, [arsenal, pitchOptions])

  if (availableSplits.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 text-center p-10">
        <p className="font-serif italic text-stone-400 text-sm">Location data not yet available for {pitcherName}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-1">Real Pitch Location / Hot Zones</div>
        <div className="text-[13px] text-[#57534E]">{abbr} · {pitcherName} — every cell below is real per-zone Statcast data, not modeled.</div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`font-mono uppercase tracking-wider rounded border px-2.5 py-1 text-[10px] transition ${
                metric === m.key ? 'border-[#FF5722] text-[#FF5722] bg-orange-50' : 'border-stone-200 text-stone-400 hover:border-stone-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {([...availableSplits, ...(availableSplits.includes('vs_lhb') && availableSplits.includes('vs_rhb') ? ['both' as const] : [])]).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${
                  side === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {SIDE_LABELS[s]}
              </button>
            ))}
          </div>

          <select
            value={pitchFilter}
            onChange={e => setPitchFilter(e.target.value)}
            className="font-mono text-[11px] border border-stone-200 rounded-md px-2 py-1.5 text-stone-700 bg-white"
          >
            <option value="ALL">All pitches</option>
            {pitchOptions.map(([code, p]) => (
              <option key={code} value={code}>{p.pitch_name} ({p.usage_pct?.toFixed(0)}%)</option>
            ))}
          </select>

          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {(['catcher', 'pitcher'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${
                  view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {v} view
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid(s) */}
      <div className={`flex justify-center gap-10 flex-wrap ${side === 'both' ? '' : ''}`}>
        {splitsToShow.map(s => {
          const zones = zonesFor(s)
          return (
            <div key={s} className="text-center">
              {side === 'both' && (
                <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">{SIDE_LABELS[s]}</p>
              )}
              {zones ? (
                <ZoneGrid zones={zones} metric={metric} view={view} />
              ) : (
                <div className="w-[290px] h-[290px] flex items-center justify-center text-stone-400 text-[12px] font-serif italic">
                  No data for this split{label ? ` (${label})` : ''}.
                </div>
              )}
              {side !== 'both' && pitchFilter === 'ALL' && hotZones[s] && (hotZones[s].go_to_zone_label || hotZones[s].weak_zone_label) && (
                <div className="mt-3 space-y-0.5">
                  {hotZones[s].go_to_zone_label && (
                    <p className="font-mono text-[11px] text-stone-600">Lives: <span className="font-bold text-stone-900">{hotZones[s].go_to_zone_label}</span></p>
                  )}
                  {hotZones[s].weak_zone_label && (
                    <p className="font-mono text-[11px] text-stone-600">Vulnerable: <span className="font-bold text-red-600">{hotZones[s].weak_zone_label}</span></p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ZoneColorLegend metric={metric} />
      <p className="text-center font-mono text-[9px] text-stone-400">n = pitches / at-bats / batted balls depending on the metric shown.</p>

      {/* Continuous density companion view — alongside the discrete board
          above, not a replacement: that one is for coaching language
          ("lives up and in"), this one is for the actual shape. */}
      <PitchDensityHeatmap pitcherId={pitcherId} />

      {/* Mix-stable attack table */}
      {tableRows.length > 0 && (
        <div className="border-t border-stone-200 pt-4">
          <p className="font-mono uppercase tracking-widest text-[10px] text-stone-500 mb-2">Full arsenal — attack table</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                  <th className="text-left px-3 py-1.5">Pitch</th>
                  <th className="text-right px-2 py-1.5">Use%</th>
                  <th className="text-right px-2 py-1.5">Velo</th>
                  <th className="text-right px-2 py-1.5">Zone%</th>
                  <th className="text-right px-2 py-1.5">Edge%</th>
                  <th className="text-right px-2 py-1.5">Heart%</th>
                  <th className="text-right px-2 py-1.5">Whiff%</th>
                  <th className="text-right px-3 py-1.5">RV/100</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ code, pitch, s }) => (
                  <tr key={code} className={`border-t border-stone-50 ${pitchFilter === code ? 'bg-orange-50' : ''}`}>
                    <td className="px-3 py-1.5 text-stone-800 font-semibold whitespace-nowrap">{pitch.pitch_name}</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{fmt1(pitch.usage_pct)}%</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{pitch.avg_velo?.toFixed(1) ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{fmt1(s.zonePct)}%</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{fmt1(s.edgePct)}%</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{fmt1(s.heartPct)}%</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{fmt1(s.whiffPct)}%</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${s.runValuePer100 != null && s.runValuePer100 < 0 ? 'text-blue-600' : s.runValuePer100 != null && s.runValuePer100 > 0 ? 'text-red-600' : 'text-stone-400'}`}>
                      {fmtRv(s.runValuePer100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[8px] font-mono text-stone-400 px-3 py-1.5">
            Zone% = in the 9-cell strike zone. Edge% = the 4 shadow quadrants just outside it. Heart% = true middle-middle (zone 5) only.
            RV/100 = run value per 100 pitches of that type; negative is good for the pitcher (Savant&apos;s own convention). Table is season-wide (not split by batter side) — use the side toggle above for the heatmap itself.
          </p>
        </div>
      )}
    </div>
  )
}
