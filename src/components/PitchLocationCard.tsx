'use client'

// src/components/PitchLocationCard.tsx
//
// 2026-08-18: chase zones (11-14) redrawn as Savant-style quadrants —
// a 2×2 outer frame (11=top-left, 12=top-right, 13=bottom-left,
// 14=bottom-right) with the core 3×3 inset in the middle. Values for
// the chase cells sit in the four outer corners so they are not
// covered by the inset 3×3.
//
// 2026-08-17: added `richArsenal` — the full pitch_arsenals row (put-away%,
// whiff%, est. wOBA, hard-hit%) routed in from page.tsx.
//
// 2026-08-11: added `compact` prop for the admin Scout Stories slideshow.

import { useState } from 'react'
import type { PitcherHotZones, ZoneCell } from '@/lib/hot-zones'
import { colorForPitcherMetric, formatMetric, ZONE_LABELS } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'

type Split = 'all' | 'vs_lhb' | 'vs_rhb'
type Metric = 'usage_pct' | 'ba_against' | 'whiff_pct'

export type RichArsenalPitch = {
  pitch_type: string
  pitch_name: string | null
  percentage: number | null
  count: number | null
  avg_velocity: number | null
  whiff_percent: number | null
  put_away_percent: number | null
  est_woba: number | null
  hard_hit_percent: number | null
  ba_against: number | null
}

type Props = {
  pitcherName: string
  abbr: string
  color: string
  hotZones: Record<string, PitcherHotZones>
  arsenal: Record<string, PitcherZoneArsenal>
  richArsenal?: RichArsenalPitch[]
  compact?: boolean
}

const SPLIT_LABELS: Record<Split, string> = { all: 'All', vs_lhb: 'vs LHB', vs_rhb: 'vs RHB' }
const METRIC_LABELS: Record<Metric, string> = { usage_pct: 'Usage %', ba_against: 'BA against', whiff_pct: 'Whiff %' }

function fmtPct(v: number | null | undefined): string {
  return v != null ? `${v.toFixed(1)}%` : '—'
}
function fmtRate(v: number | null | undefined): string {
  return v != null ? v.toFixed(3).replace(/^0/, '') : '—'
}

const CORE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
const CHASE_KEYS = ['11', '12', '13', '14'] as const
const CHASE_SET = new Set<string>(CHASE_KEYS)

// flex-col: justify = vertical, items = horizontal
const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2 pl-2',
  '12': 'items-end justify-start pt-2 pr-2',
  '13': 'items-start justify-end pb-2 pl-2',
  '14': 'items-end justify-end pb-2 pr-2',
}

function ZoneCellView({
  z,
  zones,
  metric,
  compact,
}: {
  z: string
  zones: Record<string, ZoneCell>
  metric: Metric
  compact?: boolean
}) {
  const cell = zones[z]
  const value = cell?.[metric] ?? null
  const sample = cell?.pitches ?? cell?.ab ?? 0
  const isChase = CHASE_SET.has(z)
  return (
    <div
      className={`zone-cell flex flex-col ${
        isChase ? CHASE_ALIGN[z] : 'items-center justify-center'
      } ${colorForPitcherMetric(value, metric)} ${
        isChase ? 'border border-white/25' : 'rounded-md border border-white/40'
      }`}
      title={ZONE_LABELS[z]}
    >
      <span className={`font-mono font-bold text-stone-900/80 ${compact ? 'text-[8px]' : isChase ? 'text-[10px]' : 'text-[11px]'}`}>
        {formatMetric(value, metric === 'ba_against' ? 'ba' : 'pct')}
      </span>
      <span className={`font-mono text-stone-900/50 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>n={sample}</span>
    </div>
  )
}

function ZoneGrid({ zones, metric, compact }: { zones: Record<string, ZoneCell>; metric: Metric; compact?: boolean }) {
  const cellSize = compact ? 30 : 44
  const gap = compact ? 3 : 4
  const chaseBand = compact ? 26 : 38
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  return (
    <div className="mx-auto relative" style={{ width: total, height: total }}>
      <style jsx>{`
        @keyframes tileIn {
          0% { opacity: 0; transform: scale(0.3) rotate(-35deg) translateY(6px); }
          60% { opacity: 1; transform: scale(1.08) rotate(6deg) translateY(0); }
          100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
        }
        .zone-cell { animation: tileIn 420ms cubic-bezier(.34,1.56,.64,1) both; }
      `}</style>

      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => (
          <ZoneCellView key={z} z={z} zones={zones} metric={metric} compact={compact} />
        ))}
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
        {CORE_KEYS.map(z => (
          <ZoneCellView key={z} z={z} zones={zones} metric={metric} compact={compact} />
        ))}
      </div>
    </div>
  )
}

export default function PitchLocationCard({ pitcherName, abbr, color, hotZones, arsenal, richArsenal, compact }: Props) {
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

  const richByType = new Map((richArsenal ?? []).map(p => [p.pitch_type, p]))
  const hasRich = richArsenal != null && richArsenal.length > 0

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
        <div className="border-t border-stone-100 overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
                <th className="text-left px-3 py-1.5">Pitch</th>
                <th className="text-right px-2 py-1.5">Use%</th>
                <th className="text-right px-2 py-1.5">Velo</th>
                {hasRich && <th className="text-right px-2 py-1.5">Whiff%</th>}
                {hasRich && <th className="text-right px-2 py-1.5">PutAway%</th>}
                {hasRich && <th className="text-right px-2 py-1.5">xwOBA</th>}
                {hasRich && <th className="text-right px-2 py-1.5">HardHit%</th>}
                <th className="text-right px-3 py-1.5">Pitches</th>
              </tr>
            </thead>
            <tbody>
              {pitchList.map(([code, p]) => {
                const rich = richByType.get(code)
                return (
                  <tr key={code} className="border-t border-stone-50">
                    <td className="px-3 py-1.5 text-stone-800 font-semibold whitespace-nowrap">{p.pitch_name ?? code}</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{p.usage_pct?.toFixed(1) ?? '—'}%</td>
                    <td className="px-2 py-1.5 text-right text-stone-600">{p.avg_velo?.toFixed(1) ?? '—'}</td>
                    {hasRich && <td className="px-2 py-1.5 text-right text-stone-600">{fmtPct(rich?.whiff_percent)}</td>}
                    {hasRich && <td className="px-2 py-1.5 text-right text-stone-600">{fmtPct(rich?.put_away_percent)}</td>}
                    {hasRich && <td className="px-2 py-1.5 text-right text-stone-600">{fmtRate(rich?.est_woba)}</td>}
                    {hasRich && <td className="px-2 py-1.5 text-right text-stone-600">{fmtPct(rich?.hard_hit_percent)}</td>}
                    <td className="px-3 py-1.5 text-right text-stone-400">{p.total_pitches ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hasRich && (
            <p className="text-[8px] font-mono text-stone-400 px-3 py-1.5">
              Whiff%/PutAway%/xwOBA/HardHit% are season-wide, not split by batter handedness.
            </p>
          )}
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