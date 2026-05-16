'use client'

/**
 * src/components/HotZone.tsx
 *
 * Interactive 3x3 hot zone heatmap for batters or pitchers.
 *
 * Desktop: hover a cell → tooltip appears with detailed stats.
 * Mobile:  tap a cell  → bottom-sheet panel slides up with the stats.
 *
 * Free users see: colored heatmap (visual signal), labels (hot/cold zones).
 * Pro users see:  numbers in every cell, full tooltip/sheet, split toggle.
 *
 * Usage:
 *   <HotZone mode="batter" data={batterZones} isPro={false} playerName="Mike Trout" />
 *   <HotZone mode="pitcher" data={pitcherZones} isPro={true} playerName="Spencer Strider" />
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  type BatterHotZones,
  type PitcherHotZones,
  type ZoneCell,
  ZONE_LABELS,
  colorForBatterMetric,
  colorForPitcherMetric,
  formatMetric,
} from '@/lib/hot-zones'

// ─── Props ────────────────────────────────────────────────────────────────────

type BatterProps = {
  mode: 'batter'
  data: Record<string, BatterHotZones>   // keyed by split: 'all' | 'vs_lhp' | 'vs_rhp'
  isPro?: boolean
  playerName: string
  defaultSplit?: 'all' | 'vs_lhp' | 'vs_rhp'
}

type PitcherProps = {
  mode: 'pitcher'
  data: Record<string, PitcherHotZones>
  isPro?: boolean
  playerName: string
  defaultSplit?: 'all' | 'vs_lhb' | 'vs_rhb'
}

type Props = BatterProps | PitcherProps

// ─── Component ────────────────────────────────────────────────────────────────

export default function HotZone(props: Props) {
  const { mode, isPro = false, playerName } = props
  const [activeSplit, setActiveSplit] = useState<string>(props.defaultSplit ?? 'all')
  const [activeZone, setActiveZone]   = useState<string | null>(null)
  const [isMobile, setIsMobile]       = useState(false)

  // Detect mobile vs desktop. We use this to swap hover-tooltip for tap-sheet.
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(hover: none)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close mobile sheet on Escape
  useEffect(() => {
    if (!activeZone) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveZone(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeZone])

  const currentSplit = props.data[activeSplit] ?? props.data['all']

  // No data state
  if (!currentSplit) {
    return (
      <div className="border border-stone-200 bg-[#F5F1E8] p-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
          ⊕ Hot Zones · {mode === 'batter' ? 'Batter' : 'Pitcher'}
        </div>
        <div className="text-sm text-stone-500 font-serif italic">
          No zone data available yet for {playerName}. Check back closer to game time.
        </div>
      </div>
    )
  }

  const zones = currentSplit.zones
  const splitOptions = mode === 'batter'
    ? [{ key: 'all', label: 'All' }, { key: 'vs_lhp', label: 'vs LHP' }, { key: 'vs_rhp', label: 'vs RHP' }]
    : [{ key: 'all', label: 'All' }, { key: 'vs_lhb', label: 'vs LHB' }, { key: 'vs_rhb', label: 'vs RHB' }]

  return (
    <div className="border border-stone-200 bg-[#F5F1E8] p-5 sm:p-6">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">
            ⊕ Hot Zones · {mode === 'batter' ? 'Batter' : 'Pitcher'}
          </div>
          <div className="font-serif font-bold text-stone-900 text-lg leading-tight">
            {playerName}
          </div>
          <div className="text-[11px] font-mono text-stone-500 mt-0.5">
            {mode === 'batter'
              ? `${(currentSplit as BatterHotZones).total_pa ?? 0} plate appearances · ${currentSplit.total_pitches} pitches seen`
              : `${currentSplit.total_pitches} pitches thrown`}
          </div>
        </div>

        {/* Split toggle (Pro only) */}
        {isPro && (
          <div className="flex gap-0 border border-stone-300 shrink-0">
            {splitOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setActiveSplit(opt.key); setActiveZone(null) }}
                disabled={!props.data[opt.key]}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 transition disabled:opacity-30 disabled:cursor-not-allowed ${
                  activeSplit === opt.key
                    ? 'bg-stone-900 text-stone-50'
                    : 'bg-white text-stone-600 hover:bg-stone-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Hot/cold labels ─────────────────────────────────────────── */}
      {mode === 'batter' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] font-mono">
          {(currentSplit as BatterHotZones).hot_zone_label && (
            <div>
              <span className="text-orange-600 font-bold uppercase tracking-wider">Hot:</span>{' '}
              <span className="text-stone-700">{(currentSplit as BatterHotZones).hot_zone_label}</span>
            </div>
          )}
          {(currentSplit as BatterHotZones).cold_zone_label && (
            <div>
              <span className="text-blue-600 font-bold uppercase tracking-wider">Cold:</span>{' '}
              <span className="text-stone-700">{(currentSplit as BatterHotZones).cold_zone_label}</span>
            </div>
          )}
        </div>
      )}

      {mode === 'pitcher' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-[11px] font-mono">
          {(currentSplit as PitcherHotZones).go_to_zone_label && (
            <div>
              <span className="text-orange-600 font-bold uppercase tracking-wider">Lives:</span>{' '}
              <span className="text-stone-700">{(currentSplit as PitcherHotZones).go_to_zone_label}</span>
            </div>
          )}
          {(currentSplit as PitcherHotZones).weak_zone_label && (
            <div>
              <span className="text-red-600 font-bold uppercase tracking-wider">Vulnerable:</span>{' '}
              <span className="text-stone-700">{(currentSplit as PitcherHotZones).weak_zone_label}</span>
            </div>
          )}
        </div>
      )}

      {/* ── The 3x3 grid ────────────────────────────────────────────── */}
      <div className="relative">

        {/* Strike zone outline + grid */}
        <div className="relative max-w-[240px] sm:max-w-[280px] mx-auto">
          {/* "From catcher's view" caption */}
          <div className="text-center text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
            from catcher&apos;s view
          </div>

          {/* The 3x3 grid */}
          <div className="grid grid-cols-3 gap-1 aspect-square border-2 border-stone-900 p-1 bg-stone-900">
            {['1','2','3','4','5','6','7','8','9'].map((zoneNum) => {
              const cell: ZoneCell = zones[zoneNum] ?? {}

              // Choose colour based on mode
              const bgClass = mode === 'batter'
                ? colorForBatterMetric(cell.xwoba ?? cell.slg ?? cell.ba, 'xwoba')
                : colorForPitcherMetric(cell.ba_against, 'ba_against')

              // Headline number shown in each cell
              const primary = mode === 'batter'
                ? formatMetric(cell.xwoba ?? cell.ba, cell.xwoba != null ? 'xwoba' : 'ba')
                : formatMetric(cell.ba_against, 'ba')

              const sampleSize = mode === 'batter' ? cell.ab ?? 0 : cell.ab ?? 0
              const tooSmall = sampleSize < 10

              return (
                <div key={zoneNum} className="relative group">
                  <button
                    type="button"
                    onClick={() => { if (isMobile) setActiveZone(zoneNum) }}
                    onMouseEnter={() => { if (!isMobile) setActiveZone(zoneNum) }}
                    onMouseLeave={() => { if (!isMobile) setActiveZone(null) }}
                    aria-label={`Zone ${zoneNum}: ${ZONE_LABELS[zoneNum]}`}
                    className={`
                      relative w-full aspect-square flex flex-col items-center justify-center
                      ${bgClass}
                      ${tooSmall ? 'opacity-50' : ''}
                      transition hover:ring-2 hover:ring-orange-600 hover:ring-inset
                      focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-inset
                    `}
                  >
                    {/* Free tier — no numbers shown */}
                    {!isPro && (
                      <span className="text-[10px] font-mono text-stone-700/40 select-none">?</span>
                    )}

                    {/* Pro tier — show metric */}
                    {isPro && (
                      <>
                        <span className="font-mono font-bold text-stone-900 text-sm sm:text-base leading-none">
                          {primary}
                        </span>
                        {!tooSmall && (
                          <span className="text-[8px] font-mono text-stone-700 mt-0.5 uppercase">
                            {mode === 'batter' ? 'xwOBA' : 'BAA'}
                          </span>
                        )}
                      </>
                    )}
                  </button>

                  {/* Desktop tooltip on hover (Pro only) */}
                  {isPro && !isMobile && activeZone === zoneNum && (
                    <div
                      className="absolute z-50 left-1/2 -translate-x-1/2 -top-2 -translate-y-full
                                 bg-stone-900 text-stone-100 px-3 py-2 shadow-xl
                                 min-w-[160px] pointer-events-none"
                      role="tooltip"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-400 font-bold mb-1">
                        {ZONE_LABELS[zoneNum]}
                      </div>
                      <ZoneStats cell={cell} mode={mode} />
                      {/* Arrow */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0
                                      border-l-[6px] border-l-transparent
                                      border-r-[6px] border-r-transparent
                                      border-t-[6px] border-t-stone-900" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* L/R labels around the zone */}
          <div className="absolute -left-7 top-1/2 -translate-y-1/2 text-[9px] font-mono text-stone-400 uppercase tracking-widest -rotate-90 origin-center whitespace-nowrap">
            Inside
          </div>
          <div className="absolute -right-9 top-1/2 -translate-y-1/2 text-[9px] font-mono text-stone-400 uppercase tracking-widest rotate-90 origin-center whitespace-nowrap">
            Outside
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-1 mt-5 text-[10px] font-mono uppercase tracking-wider text-stone-500">
          <span>Cold</span>
          <div className="flex gap-px ml-2">
            <div className="w-4 h-3 bg-blue-400" />
            <div className="w-4 h-3 bg-blue-200" />
            <div className="w-4 h-3 bg-stone-200" />
            <div className="w-4 h-3 bg-orange-300" />
            <div className="w-4 h-3 bg-orange-400" />
            <div className="w-4 h-3 bg-red-500" />
          </div>
          <span className="ml-2">Hot</span>
        </div>
      </div>

      {/* ── Free tier Pro lock ──────────────────────────────────────── */}
      {!isPro && (
        <div className="mt-5 pt-5 border-t border-stone-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
                ⊕ Pro — unlock every zone
              </div>
              <div className="text-xs text-stone-500 mt-1 font-serif">
                Numbers · xwOBA · vs LHP/RHP splits · tap-to-explore
              </div>
            </div>
            <Link
              href="/#signup"
              className="shrink-0 text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-3 py-2 hover:bg-stone-700 transition whitespace-nowrap"
            >
              Get Pro →
            </Link>
          </div>
        </div>
      )}

      {/* ── Mobile bottom sheet (Pro only) ──────────────────────────── */}
      {isPro && isMobile && activeZone && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-stone-900/50 z-40"
            onClick={() => setActiveZone(null)}
            aria-hidden="true"
          />
          {/* Sheet */}
          <div
            role="dialog"
            aria-modal="true"
            className="fixed bottom-0 left-0 right-0 bg-white z-50 shadow-2xl
                       border-t-2 border-stone-900
                       p-5 pb-8 animate-in slide-in-from-bottom duration-200"
          >
            {/* Grab handle */}
            <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
                  Zone {activeZone}
                </div>
                <div className="font-serif font-bold text-stone-900 text-lg">
                  {ZONE_LABELS[activeZone]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveZone(null)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center text-stone-500"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <line x1="2" y1="2"  x2="16" y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  <line x1="16" y1="2" x2="2"  y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="bg-stone-50 p-4 border border-stone-200">
              <ZoneStats cell={zones[activeZone] ?? {}} mode={mode} verbose />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Stat block shared by tooltip + bottom sheet ──────────────────────────────

function ZoneStats({
  cell,
  mode,
  verbose = false,
}: {
  cell: ZoneCell
  mode: 'batter' | 'pitcher'
  verbose?: boolean
}) {
  if (mode === 'batter') {
    return (
      <div className={verbose ? 'space-y-2' : 'space-y-0.5'}>
        <Row label="AVG"     value={formatMetric(cell.ba,    'ba')}    big={verbose} />
        <Row label="SLG"     value={formatMetric(cell.slg,   'slg')}   big={verbose} />
        <Row label="xwOBA"   value={formatMetric(cell.xwoba, 'xwoba')} big={verbose} highlight />
        <Row label="Whiff%"  value={formatMetric(cell.whiff_pct, 'pct')} big={verbose} />
        <Row label="Sample"  value={`${cell.ab ?? 0} AB · ${cell.pitches ?? 0} P`} big={verbose} muted />
      </div>
    )
  }

  // Pitcher view
  return (
    <div className={verbose ? 'space-y-2' : 'space-y-0.5'}>
      <Row label="Usage"     value={formatMetric(cell.usage_pct,  'pct')} big={verbose} highlight />
      <Row label="BA against" value={formatMetric(cell.ba_against, 'ba')}  big={verbose} />
      <Row label="Whiff%"     value={formatMetric(cell.whiff_pct,  'pct')} big={verbose} />
      <Row label="Sample"     value={`${cell.pitches ?? 0} P · ${cell.ab ?? 0} BIP`} big={verbose} muted />
    </div>
  )
}

function Row({
  label, value, big = false, highlight = false, muted = false,
}: {
  label: string; value: string; big?: boolean; highlight?: boolean; muted?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${big ? 'text-sm' : 'text-[11px]'}`}>
      <span className={`font-mono uppercase tracking-wider ${muted ? 'text-stone-400' : big ? 'text-stone-600' : 'text-stone-400'}`}>
        {label}
      </span>
      <span className={`font-mono font-bold ${
        highlight ? 'text-orange-400' : muted ? 'text-stone-400' : big ? 'text-stone-900' : 'text-stone-100'
      }`}>
        {value}
      </span>
    </div>
  )
}
