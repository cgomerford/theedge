'use client'

// src/components/PitchLocationCard.tsx
//
// New, standalone — not sharing chart code with SprayChart/hot-zones
// components used elsewhere in the app (Batting tab, Tale of the Tape).
// Combines two existing, already-populated data sources for the Scout
// Report's "Pitch Arsenal & Location" section:
//   - PitcherHotZones (pitcher_hot_zones table)     — overall 3x3 grid
//   - PitcherZoneArsenal (pitcher_zone_arsenal table) — per-pitch usage/zone
//
// Reuses the pure color/format HELPER FUNCTIONS from src/lib/hot-zones.ts
// (colorForPitcherMetric, formatMetric, ZONE_LABELS) since those are
// formatting logic, not UI — "build new, separate" was about not reusing
// the existing chart components themselves.
//
// 2026-08-11: added `compact` prop for the admin Scout Stories slideshow
// (340px-wide story frame) — full-size /mlb/[slug] rendering is untouched
// unless compact is explicitly passed. Also added a staggered tile-entrance
// animation on the zone grid (diagonal wave, "settles into place" easing)
// so the grid assembles itself instead of just popping in.

import { useState } from 'react'
import type { PitcherHotZones, ZoneCell } from '@/lib/hot-zones'
import { colorForPitcherMetric, formatMetric, ZONE_LABELS } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'

type Split = 'all' | 'vs_lhb' | 'vs_rhb'
type Metric = 'usage_pct' | 'ba_against' | 'whiff_pct'

type Props = {
  pitcherName: string
  abbr: string
  color: string
  hotZones: Record<string, PitcherHotZones>
  arsenal: Record<string, PitcherZoneArsenal>
  compact?: boolean
}

const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB' }
const METRIC_LABELS: Record<Metric, string> = { usage_pct: 'Usage %', ba_against: 'BA against', whiff_pct: 'Whiff %' }

function ZoneGrid({ zones, metric, compact }: { zones: Record<string, ZoneCell>; metric: Metric; compact?: boolean }) {
  return (
    <div
      className="zone-grid grid grid-cols-3 mx-auto"
      style={{ gap: compact ? 3 : 4, maxWidth: compact ? 150 : 220 }}
    >
      <style jsx>{`
        @keyframes tileIn {
          0% { opacity: 0; transform: scale(0.3) rotate(-35deg) translateY(6px); }
          60% { opacity: 1; transform: scale(1.08) rotate(6deg) translateY(0); }
          100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
        }
        .zone-cell { animation: tileIn 420ms cubic-bezier(.34,1.56,.64,1) both; }
        .zone-cell:nth-child(1) { animation-delay: 0ms; }
        .zone-cell:nth-child(2) { animation-delay: 70ms; }
        .zone-cell:nth-child(3) { animation-delay: 140ms; }
        .zone-cell:nth-child(4) { animation-delay: 70ms; }
        .zone-cell:nth-child(5) { animation-delay: 140ms; }
        .zone-cell:nth-child(6) { animation-delay: 210ms; }
        .zone-cell:nth-child(7) { animation-delay: 140ms; }
        .zone-cell:nth-child(8) { animation-delay: 210ms; }
        .zone-cell:nth-child(9) { animation-delay: 280ms; }
      `}</style>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(z => {
        const cell = zones[z]
        const value = cell?.[metric] ?? null
        const sample = cell?.pitches ?? cell?.ab ?? 0
        return (
          <div
            key={z}
            className={`zone-cell aspect-square rounded-md flex flex-col items-center justify-center ${colorForPitcherMetric(value, metric)} border border-white/40`}
            title={ZONE_LABELS[z]}
          >
            <span className={`font-mono font-bold text-stone-900/80 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
              {formatMetric(value, metric === 'ba_against' ? 'ba' : 'pct')}
            </span>
            <span className={`font-mono text-stone-900/50 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>n={sample}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function PitchLocationCard({ pitcherName, abbr, color, hotZones, arsenal, compact }: Props) {
  const [split, setSplit] = useState<Split>('all')
  const [metric, setMetric] = useState<Metric>('usage_pct')

  const zonesForSplit = hotZones[split]
  const arsenalForSplit = arsenal[split]
  const availableSplits = (['all', 'vs_lhb', 'vs_rhb'] as Split[]).filter(s => hotZones[s])

  const pad = compact ? 'p-2.5' : 'p-4'
  const padB = compact ? 'p-2.5' : 'p-6'

  if (!zonesForSplit && !arsenalForSplit) {
    return (
      <div className={`bg-white rounded-xl border border-stone-200 text-center ${padB}`}>
        <p className={`font-mono uppercase tracking-widest text-stone-400 mb-1 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{abbr} · {pitcherName}</p>
        <p className={`font-serif italic text-stone-400 ${compact ? 'text-xs' : 'text-sm'}`}>Location data not yet available.</p>
      </div>
    )
  }

  const pitchList = arsenalForSplit
    ? Object.entries(arsenalForSplit.arsenal)
        .filter(([, p]) => (p.usage_pct ?? 0) >= 5)
        .sort((a, b) => (b[1].usage_pct ?? 0) - (a[1].usage_pct ?? 0))
    : []

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className={`border-b border-stone-100 flex items-center justify-between flex-wrap gap-2 ${pad}`}>
        <div>
          <p className={`font-mono uppercase tracking-widest text-stone-400 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>{abbr} · SP</p>
          <p className={`font-serif font-semibold text-stone-900 ${compact ? 'text-sm' : 'text-base'}`}>{pitcherName}</p>
        </div>
        {availableSplits.length > 1 && (
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {availableSplits.map(s => (
              <button
                key={s}
                onClick={() => setSplit(s)}
                className={`font-mono uppercase tracking-wider rounded-md transition ${
                  compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2.5 py-1 text-[10px]'
                } ${split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
              >
                {SPLIT_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={pad}>
        {zonesForSplit ? (
          <>
            <div className={`flex gap-1 justify-center ${compact ? 'mb-2' : 'mb-3'}`}>
              {(['usage_pct', 'ba_against', 'whiff_pct'] as Metric[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`font-mono uppercase tracking-wider rounded border ${
                    compact ? 'px-1.5 py-0.5 text-[7px]' : 'px-2 py-0.5 text-[9px]'
                  } ${metric === m ? 'border-orange-400 text-orange-600 bg-orange-50' : 'border-stone-200 text-stone-400'}`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
            <ZoneGrid zones={zonesForSplit.zones} metric={metric} compact={compact} />
            {(zonesForSplit.go_to_zone_label || zonesForSplit.weak_zone_label) && (
              <div className={`text-center space-y-0.5 ${compact ? 'mt-2' : 'mt-3'}`}>
                {zonesForSplit.go_to_zone_label && (
                  <p className={`font-mono text-stone-600 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                    Lives: <span className="font-bold text-stone-900">{zonesForSplit.go_to_zone_label}</span>
                  </p>
                )}
                {zonesForSplit.weak_zone_label && (
                  <p className={`font-mono text-stone-600 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                    Vulnerable: <span className="font-bold text-red-600">{zonesForSplit.weak_zone_label}</span>
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-sm font-serif italic text-stone-400 py-8">No zone data for this split.</p>
        )}
      </div>

      {pitchList.length > 0 && !compact && (
        <div className="border-t border-stone-100">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                <th className="text-left px-3 py-1.5">Pitch</th>
                <th className="text-right px-2 py-1.5">Use%</th>
                <th className="text-right px-2 py-1.5">Velo</th>
                <th className="text-right px-3 py-1.5">Pitches</th>
              </tr>
            </thead>
            <tbody>
              {pitchList.map(([code, p]) => (
                <tr key={code} className="border-t border-stone-50">
                  <td className="px-3 py-1.5 text-stone-800 font-semibold">{p.pitch_name ?? code}</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{p.usage_pct?.toFixed(1) ?? '—'}%</td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{p.avg_velo?.toFixed(1) ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right text-stone-400">{p.total_pitches ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pitchList.length > 0 && compact && (
        <div className="border-t border-stone-100 px-2.5 py-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {pitchList.slice(0, 3).map(([code, p]) => (
            <span key={code} className="text-[8px] font-mono text-stone-600">
              <span className="font-semibold text-stone-800">{p.pitch_name ?? code}</span> {p.usage_pct?.toFixed(0) ?? '—'}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}