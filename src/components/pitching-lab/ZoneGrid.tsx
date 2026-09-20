'use client'

// src/components/pitching-lab/ZoneGrid.tsx
//
// Shared 13-zone board (9 heart + 4 shadow-quadrant chase zones) — extracted
// from LocationLab.tsx 2026-09-14 so the Arsenal tab's per-pitch hot zone
// and the Hot Zone Overlay tab can render the exact same real zone grid
// instead of re-implementing it. Catcher/pitcher view mirroring, the
// sample-size guard, and metric coloring/formatting all live here so every
// consumer stays honest about low-sample cells the same way.

import type { PitcherZoneMetric } from '@/lib/hot-zones'
import { colorForPitcherMetric, formatMetric, ZONE_LABELS } from '@/lib/hot-zones'
import type { ZoneCell } from '@/lib/hot-zones'
import type { ArsenalZoneCell } from '@/lib/pitcher-arsenal'

export type View = 'catcher' | 'pitcher'
export type Cell = ZoneCell | ArsenalZoneCell

export const METRICS: { key: PitcherZoneMetric; label: string; fmt: 'ba' | 'slg' | 'xwoba' | 'pct' | 'rv' }[] = [
  { key: 'usage_pct',         label: 'Usage %',   fmt: 'pct'   },
  { key: 'ba_against',        label: 'BA against', fmt: 'ba'   },
  { key: 'slg_against',       label: 'SLG against', fmt: 'slg' },
  { key: 'whiff_pct',         label: 'Whiff %',   fmt: 'pct'   },
  { key: 'hard_hit_pct',      label: 'Hard-hit %', fmt: 'pct'  },
  { key: 'woba_against',      label: 'wOBA',       fmt: 'xwoba'},
  { key: 'run_value_per_100', label: 'Run value',  fmt: 'rv'   },
]

export const CORE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
export const CHASE_KEYS = ['11', '12', '13', '14'] as const
export const CHASE_SET = new Set<string>(CHASE_KEYS)
export const MIN_SAMPLE = 30

// Catcher view = zones as stored (MLB Gameday's own zone numbering is
// already defined from behind the plate). Pitcher view mirrors left-right.
const MIRROR_CORE: Record<string, string> = { '1': '3', '2': '2', '3': '1', '4': '6', '5': '5', '6': '4', '7': '9', '8': '8', '9': '7' }
const MIRROR_CHASE: Record<string, string> = { '11': '12', '12': '11', '13': '14', '14': '13' }

export function sampleFor(metric: PitcherZoneMetric, cell: Cell | undefined): number {
  if (!cell) return 0
  switch (metric) {
    case 'usage_pct':
    case 'run_value_per_100':
      return cell.pitches ?? 0
    case 'whiff_pct':
      return cell.swings ?? 0
    case 'ba_against':
    case 'slg_against':
      return cell.ab ?? 0
    case 'hard_hit_pct':
    case 'woba_against':
      return ('batted_balls' in cell ? cell.batted_balls : undefined) ?? 0
    default:
      return 0
  }
}

// Exported so TiltBoard callers can align a chase cell's own CONTENT
// (not just background color) toward the outer corner — the core 3x3
// grid paints on top of the center of each chase quadrant, so content
// centered in the quadrant gets covered; only the color needs to fill
// the full quadrant, the text/label needs to sit in the exposed corner.
export const CHASE_ALIGN: Record<string, string> = {
  '11': 'items-start justify-start pt-2.5 pl-2.5',
  '12': 'items-end justify-start pt-2.5 pr-2.5',
  '13': 'items-start justify-end pb-2.5 pl-2.5',
  '14': 'items-end justify-end pb-2.5 pr-2.5',
}

function ZoneCellView({
  z, zones, metric, view, minSample,
}: {
  z: string
  zones: Record<string, Cell>
  metric: PitcherZoneMetric
  view: View
  minSample: number
}) {
  const sourceKey = view === 'pitcher' ? (CHASE_SET.has(z) ? MIRROR_CHASE[z] : MIRROR_CORE[z]) : z
  const cell = zones[sourceKey]
  const metricDef = METRICS.find(m => m.key === metric)!
  const value = cell?.[metric] ?? null
  const sample = sampleFor(metric, cell)
  const lowSample = sample > 0 && sample < minSample
  const noSample = sample === 0
  const isChase = CHASE_SET.has(z)

  return (
    <div
      // Two distinct greys, on purpose: `bg-stone-100` + 50% opacity = a
      // real value that's too thin a sample to trust (still shown, faded).
      // `bg-stone-50` (no opacity change) = no pitches thrown here at all —
      // don't conflate "untrustworthy" with "empty."
      className={`zone-cell flex flex-col ${isChase ? CHASE_ALIGN[z] : 'items-center justify-center'} ${
        noSample ? 'bg-stone-50' : lowSample ? 'bg-stone-100' : colorForPitcherMetric(value, metric)
      } ${isChase ? 'border border-white/25' : 'rounded-md border border-white/40'} ${lowSample ? 'opacity-50' : ''}`}
      title={`${ZONE_LABELS[sourceKey]}${noSample ? ' · no pitches here' : lowSample ? ` · sample too small (n<${minSample})` : ''}`}
    >
      <span className="font-mono font-bold text-stone-900/80 text-[12px]">
        {noSample ? '—' : formatMetric(value, metricDef.fmt)}
      </span>
      <span className="font-mono text-stone-900/50 text-[9px]">n={sample}</span>
    </div>
  )
}

export default function ZoneGrid({
  zones, metric, view, size = 56, minSample = MIN_SAMPLE,
}: {
  zones: Record<string, Cell>
  metric: PitcherZoneMetric
  view: View
  size?: number
  // Season-wide grids (Location Lab) default to 30. Narrower slices
  // (one count situation × one split, Hot Zone Overlay) pass a lower
  // number — 30 there would greyed-out nearly every cell, which isn't a
  // "no color" bug, just the wrong threshold for how few pitches land in
  // any single situation/split/zone combo.
  minSample?: number
}) {
  const cellSize = size
  const gap = Math.round(size * 0.09)
  const chaseBand = Math.round(size * 0.82)
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  return (
    <div className="mx-auto relative" style={{ width: total, height: total }}>
      <style jsx>{`
        @keyframes tileIn {
          0% { opacity: 0; transform: scale(0.3) rotate(-20deg) translateY(4px); }
          60% { opacity: 1; transform: scale(1.06) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .zone-cell { animation: tileIn 320ms cubic-bezier(.34,1.56,.64,1) both; }
      `}</style>

      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md">
        {CHASE_KEYS.map(z => (
          <ZoneCellView key={z} z={z} zones={zones} metric={metric} view={view} minSample={minSample} />
        ))}
      </div>

      <div
        className="absolute grid"
        style={{
          top: chaseBand, left: chaseBand, width: core, height: core,
          gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap,
        }}
      >
        {CORE_KEYS.map(z => (
          <ZoneCellView key={z} z={z} zones={zones} metric={metric} view={view} minSample={minSample} />
        ))}
      </div>
    </div>
  )
}

// Real 13-zone LAYOUT only (same geometry ZoneGrid uses above), factored
// out as a render-prop board so callers that need a batter-vs-pitcher
// TILT comparison — not one of the 7 raw pitcher metrics ZoneGrid/
// ZoneCellView renders — can still use the real zone positions instead
// of a simplified 9-cell stand-in. HotZoneOverlay.tsx's own TiltGrid and
// Top3KeyPlayersTab.tsx's ZoneMatchupGrid each used to hand-roll this same
// geometry (the second one only did 9 zones, dropping the 4 chase
// corners entirely) — both now call this instead. Each cell's content,
// color, and click behavior stay fully caller-controlled via renderZone;
// this component only owns "where do the 13 real zones sit."
export function TiltBoard({
  renderZone, size = 56,
}: {
  renderZone: (zone: string, isChase: boolean) => React.ReactNode
  size?: number
}) {
  const cellSize = size
  const gap = Math.round(size * 0.09)
  const chaseBand = Math.round(size * 0.82)
  const core = cellSize * 3 + gap * 2
  const total = core + chaseBand * 2

  return (
    <div className="mx-auto relative" style={{ width: total, height: total }}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 rounded-md">
        {CHASE_KEYS.map(z => (
          <div key={z} className={`flex ${CHASE_ALIGN[z]}`}>{renderZone(z, true)}</div>
        ))}
      </div>
      <div
        className="absolute grid"
        style={{
          top: chaseBand, left: chaseBand, width: core, height: core,
          gridTemplateColumns: `repeat(3, ${cellSize}px)`, gridTemplateRows: `repeat(3, ${cellSize}px)`, gap,
        }}
      >
        {CORE_KEYS.map(z => <div key={z}>{renderZone(z, false)}</div>)}
      </div>
    </div>
  )
}

// "Explain what orange means" — a small, reusable legend for the color
// scale every zone grid on this site shares (colorForPitcherMetric in
// hot-zones.ts). Blue/orange/red mean the same thing for 6 of the 7
// metrics: colorForPitcherMetric already direction-corrects each one
// (e.g. low BA-against is "good" = blue, but high Whiff% is "good" = also
// blue). usage_pct is the one exception — it has no "good/bad" direction,
// just "more/less," so colorForPitcherMetric renders it as a plain orange
// intensity scale instead. The legend used to always show the blue/red
// version regardless of metric, which made usage_pct's all-orange grid
// (the DEFAULT metric on every zone-grid tab) look like the colors were
// broken — every cell orange, no blue/red ever shown. Now it's
// metric-aware.
export function ZoneColorLegend({ metric, minSample = MIN_SAMPLE }: { metric: PitcherZoneMetric; minSample?: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-mono text-stone-500">
      {metric === 'usage_pct' ? (
        <>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-100 inline-block" /> Rarely thrown here</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-300 inline-block" /> Moderate usage</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" /> Heavily used</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Better for the pitcher</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-200 inline-block" /> League-average</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Worse for the pitcher</span>
        </>
      )}
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-100 opacity-50 inline-block" /> Real value, sample too small (n&lt;{minSample})</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-stone-50 border border-stone-200 inline-block" /> No pitches there</span>
    </div>
  )
}
