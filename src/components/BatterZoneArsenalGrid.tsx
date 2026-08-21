'use client'

// src/components/BatterZoneArsenalGrid.tsx
//
// Batting Lab component — for a single batter, a full 13-zone grid (9
// core + 4 Savant-style chase quadrants, same layout as PitchLocationCard)
// PER PITCH TYPE they've seen. Pick a pitch, see exactly where in
// the zone this batter does damage or gets beat against it — the deep
// version of what BatterAttackPlanCard only surfaces as a single
// "weakest zone" summary line.
//
// Data: batter_zone_arsenal (lib/batter-zone-arsenal.ts), same table
// Attack Plan uses — no new fetch, just a fuller display of data that
// already exists.

import { useState } from 'react'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import { colorForBatterMetric, ZONE_LABELS } from '@/lib/hot-zones'

type Split = 'all' | 'vs_lhp' | 'vs_rhp'
type Metric = 'ba' | 'slg' | 'xwoba' | 'whiff_pct'

type Props = {
  batterName: string
  color: string
  zoneArsenal: Record<string, BatterZoneArsenal>
}

const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhp: 'vs LHP', vs_rhp: 'vs RHP' }
const METRIC_LABELS: Record<Metric, string> = { ba: 'AVG', slg: 'SLG', xwoba: 'xwOBA', whiff_pct: 'Whiff %' }

const CORE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const CHASE_KEYS = ['11', '12', '13', '14'] as const

// flex-col: justify = vertical, items = horizontal
const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2 pl-2',
  '12': 'items-end justify-start pt-2 pr-2',
  '13': 'items-start justify-end pb-2 pl-2',
  '14': 'items-end justify-end pb-2 pr-2',
}

function fmtVal(v: number | null, metric: Metric): string {
  if (v == null) return '—'
  if (metric === 'whiff_pct') return `${v.toFixed(1)}%`
  return v.toFixed(3).replace(/^0/, '')
}

export default function BatterZoneArsenalGrid({ batterName, color, zoneArsenal }: Props) {
  const [split, setSplit] = useState<Split>('all')
  const [metric, setMetric] = useState<Metric>('ba')
  const [selectedPitch, setSelectedPitch] = useState<string | null>(null)

  const splitData = zoneArsenal[split]
  const pitchOptions = splitData
    ? Object.entries(splitData.arsenal).sort((a, b) => b[1].total_pitches - a[1].total_pitches)
    : []
  const availableSplits = (['all', 'vs_lhp', 'vs_rhp'] as Split[]).filter(s => zoneArsenal[s])

  const activePitch = selectedPitch ?? pitchOptions[0]?.[0] ?? null
  const activeData = activePitch ? splitData?.arsenal[activePitch] : null

  if (pitchOptions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">{batterName}</p>
        <p className="text-sm font-serif italic text-stone-400">Zone-by-pitch data not yet available.</p>
      </div>
    )
  }

  const cellSize = 44
  const gap = 4
  const chaseBand = 38
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
        <p className="font-serif font-semibold text-stone-900">{batterName}</p>
        {availableSplits.length > 1 && (
          <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
            {availableSplits.map(s => (
              <button
                key={s}
                onClick={() => setSplit(s)}
                className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${
                  split === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {SPLIT_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-b border-stone-100">
        <div className="flex gap-1.5 flex-wrap mb-3">
          {pitchOptions.map(([code, data]) => (
            <button
              key={code}
              onClick={() => setSelectedPitch(code)}
              className={`font-mono text-[10px] uppercase tracking-wider rounded-lg px-2.5 py-1.5 border transition ${
                activePitch === code ? 'text-white border-transparent' : 'text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
              style={activePitch === code ? { background: color } : undefined}
            >
              {data.pitch_name} ({data.total_pitches})
            </button>
          ))}
        </div>

        <div className="flex gap-1 justify-center mb-3">
          {(['ba', 'slg', 'xwoba', 'whiff_pct'] as Metric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`font-mono uppercase tracking-wider rounded border px-2 py-0.5 text-[9px] ${
                metric === m ? 'border-orange-400 text-orange-600 bg-orange-50' : 'border-stone-200 text-stone-400'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>

        {activeData && (
          <div className="flex justify-center">
            <div className="relative" style={{ width: total, height: total }}>
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
                {CHASE_KEYS.map(z => {
                  const cell = activeData.zones[z]
                  const value = cell?.[metric] ?? null
                  const sample = cell?.ab ?? cell?.pitches ?? 0
                  return (
                    <div
                      key={z}
                      className={`flex flex-col ${CHASE_ALIGN[z]} border border-white/25 ${colorForBatterMetric(value, metric === 'whiff_pct' ? 'xwoba' : metric)}`}
                      title={ZONE_LABELS[z]}
                    >
                      <span className="font-mono font-bold text-stone-900/80 text-[10px]">{fmtVal(value, metric)}</span>
                      <span className="font-mono text-stone-900/50 text-[7px]">n={sample}</span>
                    </div>
                  )
                })}
              </div>

              <div
                className="absolute grid"
                style={{
                  top: chaseBand,
                  left: chaseBand,
                  width: core,
                  height: core,
                  gridTemplateColumns: `repeat(3, ${cellSize}px)`,
                  gridTemplateRows: `repeat(3, ${cellSize}px)`,
                  gap,
                }}
              >
                {CORE_KEYS.map(z => {
                  const cell = activeData.zones[z]
                  const value = cell?.[metric] ?? null
                  const sample = cell?.ab ?? cell?.pitches ?? 0
                  return (
                    <div
                      key={z}
                      className={`rounded-md flex flex-col items-center justify-center border border-white/40 ${colorForBatterMetric(value, metric === 'whiff_pct' ? 'xwoba' : metric)}`}
                      title={ZONE_LABELS[z]}
                    >
                      <span className="font-mono font-bold text-stone-900/80 text-[10px]">{fmtVal(value, metric)}</span>
                      <span className="font-mono text-stone-900/50 text-[7px]">n={sample}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeData && (
          <p className="font-mono text-[10px] text-stone-500 text-center mt-3">
            Overall vs {activeData.pitch_name}: {fmtVal(activeData.ba, 'ba')} AVG · {fmtVal(activeData.xwoba, 'xwoba')} xwOBA · {activeData.whiff_pct != null ? `${activeData.whiff_pct.toFixed(1)}% whiff` : '—'}
          </p>
        )}
      </div>
    </div>
  )
}