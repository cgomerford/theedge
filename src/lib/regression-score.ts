// src/lib/regression-score.ts
//
// Turns a set of surface-vs-expected gaps into a single buy/hold/sell tag
// with plain-English reasoning. This is the "trading floor" logic — it
// lives in a lib file, not a component, so the Fantasy page, the player
// drawer, and any future API endpoint all read from the same source.
//
// PHILOSOPHY (from fantasy-blogger research, July 2026):
//   Buy  = surface line lags underlying skill (positive regression coming)
//   Sell = surface line runs ahead of underlying skill (negative regression coming)
//   Hold = gaps too small OR sample too shaky to act on
//
// This file does NOT fetch data. Feed it the numbers you already have.

import type { RegressionRow, RegressionSignal } from '@/components/charts/types'

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Deliberately conservative — the point is to surface honest signal, not to
// slap a "buy" tag on every player with a 5-point gap. Tune here, not in the
// components consuming the score.

export const REGRESSION_THRESHOLDS = {
  // For rate stats on a 0.0–1.0 scale (wOBA, BA, SLG). Gap = expected - surface.
  // A positive gap means surface is under-performing → BUY.
  rateGap: 0.020,   // 20+ points either side of the surface = actionable signal

  // For ERA-like stats (lower is better). Gap = expected - surface.
  // A negative gap means expected is BELOW surface, i.e. pitcher's true talent
  // is better than the box score → BUY.
  eraGap: 0.60,     // 0.60+ runs either side = actionable signal

  // Minimum number of rows needed to feel confident in an overall verdict
  minRowsForVerdict: 2,
} as const

// ─── Per-row signal ───────────────────────────────────────────────────────────
//
// Contract: row.gap is ALWAYS defined as expected - surface. The direction it
// resolves depends on higherIsBetter:
//
//   higherIsBetter (wOBA, BA, SLG):
//     gap > 0 → surface trailing quality of contact → BUY
//     gap < 0 → surface ahead of quality of contact → SELL
//
//   NOT higherIsBetter (ERA, FIP, WHIP):
//     gap > 0 → expected worse than surface → SELL (pitcher over-performing)
//     gap < 0 → expected better than surface → BUY (pitcher under-performing)

export function scoreRow(row: RegressionRow): RegressionSignal {
  const T = REGRESSION_THRESHOLDS
  const threshold = row.higherIsBetter ? T.rateGap : T.eraGap

  if (row.higherIsBetter) {
    if (row.gap >=  threshold) return 'buy'
    if (row.gap <= -threshold) return 'sell'
    return 'hold'
  }

  // ERA-like — sign of BUY/SELL flips
  if (row.gap <= -threshold) return 'buy'
  if (row.gap >=  threshold) return 'sell'
  return 'hold'
}

// ─── Overall verdict (aggregate across all rows) ──────────────────────────────

export type RegressionVerdict = {
  signal: RegressionSignal
  strength: 'strong' | 'moderate' | 'weak'
  reasoning: string          // one short sentence, safe to render inline
  supportingRowCount: number // how many rows agreed
  totalRowCount: number
}

export function computeVerdict(rows: RegressionRow[]): RegressionVerdict {
  if (rows.length < REGRESSION_THRESHOLDS.minRowsForVerdict) {
    return {
      signal: 'hold',
      strength: 'weak',
      reasoning: 'Not enough underlying data to call yet.',
      supportingRowCount: 0,
      totalRowCount: rows.length,
    }
  }

  const perRow = rows.map(scoreRow)
  const buys  = perRow.filter(s => s === 'buy').length
  const sells = perRow.filter(s => s === 'sell').length
  const holds = perRow.filter(s => s === 'hold').length

  // Contradiction = one strong buy row and one strong sell row → hold
  if (buys > 0 && sells > 0) {
    return {
      signal: 'hold',
      strength: 'weak',
      reasoning: 'Underlying metrics send mixed signals — split verdict.',
      supportingRowCount: holds + Math.min(buys, sells),
      totalRowCount: rows.length,
    }
  }

  const total = rows.length
  const dominant = buys > sells ? 'buy' : sells > buys ? 'sell' : 'hold'
  const supporting = dominant === 'buy' ? buys : dominant === 'sell' ? sells : holds
  const share = supporting / total

  const strength: RegressionVerdict['strength'] =
    share >= 0.75 ? 'strong' : share >= 0.5 ? 'moderate' : 'weak'

  const reasoning = buildReasoning(dominant, strength, rows)

  return {
    signal: dominant,
    strength,
    reasoning,
    supportingRowCount: supporting,
    totalRowCount: total,
  }
}

// ─── Plain-English reasoning ──────────────────────────────────────────────────
// Voice-and-brand rule: no picks/odds/locks language. This is analytical
// commentary, not a pick. Keep it under 140 chars.

function buildReasoning(
  signal: RegressionSignal,
  strength: RegressionVerdict['strength'],
  rows: RegressionRow[],
): string {
  if (signal === 'hold') {
    return 'Surface and underlying line up — no clear regression edge here.'
  }

  // Find the row with the biggest gap in the winning direction, use it as the anchor
  const anchor = [...rows].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0]
  const strengthWord = strength === 'strong' ? 'clearly' : strength === 'moderate' ? 'moderately' : 'slightly'

  if (signal === 'buy') {
    return `Quality of contact ${strengthWord} outpaces the box score — value should catch up.`
  }
  // sell
  return `Surface line ${strengthWord} outpaces the underlying skill — value has room to fall.`
  // (anchor kept in scope in case you want to append `${anchor.label}: ${anchor.surface} vs ${anchor.expected}`)
}

// ─── Convenience: build rows from Statcast payload ────────────────────────────
// Feed this the shape you already have on the batter drawer and it returns
// the rows you can then hand to computeVerdict + the chart components.

export function buildBatterRows(input: {
  ba?: number | null
  xba?: number | null
  slg?: number | null
  xslg?: number | null
  woba?: number | null
  xwoba?: number | null
}): RegressionRow[] {
  const rows: RegressionRow[] = []
  const push = (label: string, surface: number | null | undefined, expected: number | null | undefined) => {
    if (surface == null || expected == null) return
    rows.push({ label, surface, expected, gap: expected - surface, higherIsBetter: true })
  }
  push('xBA vs BA',     input.ba,   input.xba)
  push('xSLG vs SLG',   input.slg,  input.xslg)
  push('xwOBA vs wOBA', input.woba, input.xwoba)
  return rows
}

export function buildPitcherRows(input: {
  era?: number | null
  fip?: number | null
  xera?: number | null   // if you add this to refresh-pitcher-stats (Block B)
  siera?: number | null  // same
}): RegressionRow[] {
  const rows: RegressionRow[] = []
  const push = (label: string, surface: number | null | undefined, expected: number | null | undefined) => {
    if (surface == null || expected == null) return
    // ERA-like: gap = expected - surface. If expected < surface, gap is negative → BUY (pitcher due to improve)
    rows.push({ label, surface, expected, gap: expected - surface, higherIsBetter: false })
  }
  push('FIP vs ERA',   input.era, input.fip)
  push('xERA vs ERA',  input.era, input.xera)
  push('SIERA vs ERA', input.era, input.siera)
  return rows
}
