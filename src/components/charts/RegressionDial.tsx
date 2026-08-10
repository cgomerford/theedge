// src/components/charts/RegressionDial.tsx
//
// A single-glance gauge — Buy / Hold / Sell — with the plain-English "why"
// sitting next to it. This is what makes The Edge feel like a trading desk:
// every player row can end in one clear tag instead of "here are the stats,
// good luck".
//
// This component does NOT compute the verdict — it renders one you already
// have from computeVerdict() in @/lib/regression-score. Split of duties:
// lib file owns the score logic (testable, reusable across API + UI); this
// file owns how it looks.
//
// Voice-and-brand: NO "pick", NO "lock", NO "prediction". This is a trade-
// value tag, described in plain analytical terms.

import type { RegressionVerdict } from '@/lib/regression-score'
import { CHART_COLORS, CHART_FONTS } from './types'

type Props = {
  verdict: RegressionVerdict
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showReasoning?: boolean   // default true
}

// ─── Palette per signal ───────────────────────────────────────────────────────

const SIGNAL_MAP: Record<
  RegressionVerdict['signal'],
  { fg: string; bg: string; label: string; symbol: string }
> = {
  buy:  { fg: CHART_COLORS.positive, bg: '#D1FAE5', label: 'BUY',  symbol: '↑' },
  sell: { fg: CHART_COLORS.negative, bg: '#FEE2E2', label: 'SELL', symbol: '↓' },
  hold: { fg: CHART_COLORS.mutedInk, bg: '#F5F5F4', label: 'HOLD', symbol: '→' },
}

const SIZE_MAP = {
  sm: { pad: 'px-2 py-1', tag: 11,  reason: 11, symbol: 14 },
  md: { pad: 'px-3 py-2', tag: 13,  reason: 12, symbol: 18 },
  lg: { pad: 'px-4 py-3', tag: 16,  reason: 13, symbol: 22 },
} as const

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RegressionDial({
  verdict,
  size = 'md',
  className = '',
  showReasoning = true,
}: Props) {
  const s = SIGNAL_MAP[verdict.signal]
  const sz = SIZE_MAP[size]

  // Strength shows up as an opacity tick on the chip — "moderate" = full,
  // "weak" = faded, "strong" = full + extra weight
  const isStrong = verdict.strength === 'strong'
  const isWeak   = verdict.strength === 'weak'

  return (
    <div
      className={`inline-flex items-center gap-3 border ${className}`}
      style={{
        borderColor: CHART_COLORS.grid,
        background: '#fff',
        opacity: isWeak ? 0.7 : 1,
      }}
    >
      {/* Signal chip */}
      <div
        className={`inline-flex items-center gap-2 ${sz.pad}`}
        style={{
          background: s.bg,
          color: s.fg,
          fontFamily: CHART_FONTS.mono,
          letterSpacing: '0.15em',
          fontWeight: isStrong ? 800 : 700,
          fontSize: sz.tag,
          borderRight: `1px solid ${CHART_COLORS.grid}`,
        }}
      >
        <span style={{ fontSize: sz.symbol, lineHeight: 1 }}>{s.symbol}</span>
        <span>
          {s.label}
          {isStrong && '+'}
        </span>
      </div>

      {/* Reasoning */}
      {showReasoning && (
        <div
          className={`${sz.pad} flex-1 min-w-0`}
          style={{
            fontFamily: CHART_FONTS.serif,
            fontSize: sz.reason,
            color: CHART_COLORS.ink,
            lineHeight: 1.35,
          }}
        >
          {verdict.reasoning}
          {verdict.totalRowCount > 0 && (
            <span
              style={{
                display: 'inline-block',
                marginLeft: 6,
                fontFamily: CHART_FONTS.mono,
                fontSize: sz.reason - 2,
                color: CHART_COLORS.axis,
                letterSpacing: '0.05em',
              }}
            >
              · {verdict.supportingRowCount}/{verdict.totalRowCount} signals
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Compact badge variant ────────────────────────────────────────────────────
// Just the chip, no reasoning. Use inside tables where you only have room for
// one column of "action".

export function RegressionBadge({
  verdict,
  className = '',
}: { verdict: RegressionVerdict; className?: string }) {
  const s = SIGNAL_MAP[verdict.signal]
  const isStrong = verdict.strength === 'strong'
  const isWeak   = verdict.strength === 'weak'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 ${className}`}
      style={{
        background: s.bg,
        color: s.fg,
        fontFamily: CHART_FONTS.mono,
        fontSize: 10,
        letterSpacing: '0.1em',
        fontWeight: isStrong ? 800 : 700,
        opacity: isWeak ? 0.65 : 1,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{s.symbol}</span>
      {s.label}{isStrong ? '+' : ''}
    </span>
  )
}
