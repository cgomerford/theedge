// src/components/charts/types.ts
//
// Shared types + brand tokens for the chart primitives library.
// Every chart in src/components/charts/ imports from here so the palette
// and conventions stay consistent. If you ever change a brand token,
// change it here once — do NOT scatter hex codes across chart files.

// ─── Brand tokens ─────────────────────────────────────────────────────────────
// These match voice-and-brand.md. Zero border-radius default per site-wide rule
// (team/Dugout pages are the only exception; charts follow the default).

export const CHART_COLORS = {
  cream:     '#FAF8F3',
  creamDark: '#F0EBE0',
  orange:    '#FF5722',
  yellow:    '#FDE047',
  black:     '#1A1A1A',

  // Semantic — matched to the existing MarketMovementSection palette so
  // "hot / cold" reads consistently across the whole site
  positive:  '#059669',  // emerald-600 — over-performing what luck predicts is coming = good regression
  negative:  '#DC2626',  // red-600 — under-performing what luck predicts is coming = bad regression
  neutral:   '#78716c',  // stone-500

  // Gridlines / axes
  grid:      '#E7E5E4',  // stone-200
  axis:      '#A8A29E',  // stone-400
  ink:       '#1A1A1A',
  mutedInk:  '#57534E',  // stone-600
} as const

export const CHART_FONTS = {
  mono:  'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
  serif: 'Fraunces, ui-serif, Georgia, serif',
} as const

// ─── Regression signal — the shared vocabulary ────────────────────────────────
// Every chart that surfaces buy/sell/hold uses this exact type so the badge,
// dial, and table copy stay identical. If the semantics ever shift, change
// them here and everything else follows.

export type RegressionSignal = 'buy' | 'sell' | 'hold'

export type RegressionRow = {
  label: string        // "xwOBA vs wOBA", "xBA vs BA", "SIERA vs ERA" etc.
  surface: number      // the box-score number (wOBA, BA, ERA)
  expected: number     // what quality-of-contact / rate-based skill predicts (xwOBA, xBA, SIERA)
  gap: number          // expected - surface (positive = underperforming = buy; negative = overperforming = sell)
  higherIsBetter: boolean  // true for wOBA/BA; false for ERA
}

// ─── Rolling series (for line/trend charts) ───────────────────────────────────

export type RollingPoint = {
  date: string          // ISO date
  value: number | null  // null = missing / not enough sample
  label?: string        // optional axis label (opponent, month, etc.)
}

export type RollingSeries = {
  points: RollingPoint[]
  baseline?: number | null   // e.g. season average — drawn as dashed reference line
  label: string
  color?: string             // override; defaults to CHART_COLORS.orange
}

// ─── Percentile row (Savant-style stack) ──────────────────────────────────────

export type PercentileRow = {
  label: string           // "Exit velocity", "xwOBA", "Barrel%"
  percentile: number      // 0–100 vs qualified MLB (client-side computed, per your existing pattern)
  rawValue: string        // display string, e.g. "91.4 mph"
  higherIsBetter?: boolean  // default true; e.g. K% for hitters would be false
}

// ─── Split bars (vs L/R, home/away, day/night etc.) ───────────────────────────

export type SplitPair = {
  label: string       // "vs LHP"
  aValue: number      // one side of the split
  bValue: number      // the other side
  aLabel: string      // "vs LHP"
  bLabel: string      // "vs RHP"
  format?: 'avg3' | 'ops3' | 'era2' | 'pct1'
}
