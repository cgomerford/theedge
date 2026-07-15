// src/lib/player-signature.ts
//
// The three signature dials that replace the "totals" grid.
// Dial selection is position-dependent and honest about missing data:
// if the percentile source isn't wired for a metric, we omit that dial
// rather than fabricating a rank.
//
// The one-line summary is stubbed for now (returns a synthetic sentence
// from the top signal). Wire Haiku behind this later — same interface,
// same cache key. See TODO at bottom.

import type { BatterStatcast } from './batter-stats'

// ─── Types ────────────────────────────────────────────────────────────────

export interface SignatureDial {
  label: string
  value: string
  percentile: number | null // 0-100, null = we don't have this ranked
  positionRelative: boolean
  reference: string // "vs league" / "vs 1B/OF" / etc.
}

export interface SignatureSummary {
  oneLine: string | null
  dials: SignatureDial[]
}

// ─── Position → dial config ───────────────────────────────────────────────

type DialKey =
  | 'xwoba' | 'barrel_pct' | 'chase_pct'
  | 'sprint_speed' | 'sweet_spot_pct'
  | 'xera' | 'whiff_pct' | 'k_bb_pct' | 'stuff_plus'

function dialsForPosition(positionAbbr: string, isPitcher: boolean): DialKey[] {
  if (isPitcher) {
    // We don't have starter/reliever role distinction cleanly, so use
    // same 3 for both. Once we wire leverage index, RP swaps chase for LI.
    return ['xera', 'whiff_pct', 'k_bb_pct']
  }
  const p = positionAbbr.toUpperCase()
  if (['SS', '2B', 'CF'].includes(p)) return ['xwoba', 'sprint_speed', 'chase_pct']
  if (p === 'C') return ['xwoba', 'barrel_pct', 'chase_pct']
  // Default corner-bat / DH / 3B
  return ['xwoba', 'barrel_pct', 'chase_pct']
}

// ─── Format helpers ───────────────────────────────────────────────────────

function fmt3(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(3).replace(/^0\./, '.')
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}
function fmtSpeed(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)} ft/s`
}
function fmt2(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(2)
}

// ─── Batter dial builder ──────────────────────────────────────────────────

interface BatterInputs {
  positionAbbr: string
  statcast: {
    xba: number | null
    xslg: number | null
    xwoba: number | null
    barrel_pct: number | null
    hard_hit_pct: number | null
    sweet_spot_pct: number | null
    avg_exit_velocity: number | null
    max_exit_velocity: number | null
    chase_pct: number | null
  } | null
  ranks?: Partial<Record<DialKey, number | null>>
  sprintSpeed?: number | null
  sprintSpeedRank?: number | null
}

function buildBatterDials(inputs: BatterInputs): SignatureDial[] {
  const { positionAbbr, statcast, ranks, sprintSpeed, sprintSpeedRank } = inputs
  const keys = dialsForPosition(positionAbbr, false)
  const dials: SignatureDial[] = []

  for (const key of keys) {
    if (key === 'xwoba') {
      dials.push({
        label: 'xwOBA',
        value: fmt3(statcast?.xwoba),
        percentile: ranks?.xwoba ?? null,
        positionRelative: false,
        reference: 'vs league',
      })
    } else if (key === 'barrel_pct') {
      dials.push({
        label: 'Barrel%',
        value: fmtPct(statcast?.barrel_pct),
        percentile: ranks?.barrel_pct ?? null,
        positionRelative: true,
        reference: `vs ${positionAbbr}`,
      })
    } else if (key === 'chase_pct') {
      // Chase% is inverted — lower is better. We flip percentile so 90 = elite chase discipline.
      const raw = ranks?.chase_pct ?? null
      dials.push({
        label: 'Chase%',
        value: fmtPct(statcast?.chase_pct ?? null),
        percentile: raw != null ? 100 - raw : null,
        positionRelative: false,
        reference: 'vs league',
      })
    } else if (key === 'sprint_speed') {
      dials.push({
        label: 'Sprint',
        value: fmtSpeed(sprintSpeed),
        percentile: sprintSpeedRank ?? null,
        positionRelative: true,
        reference: `vs ${positionAbbr}`,
      })
    }
  }
  return dials
}

// ─── Pitcher dial builder ─────────────────────────────────────────────────

interface PitcherInputs {
  xera: number | null
  whiff_pct: number | null
  k_bb_pct: number | null
  ranks?: Partial<Record<DialKey, number>>
}

function buildPitcherDials(inputs: PitcherInputs): SignatureDial[] {
  return [
    {
      label: 'xERA',
      value: fmt2(inputs.xera),
      percentile: inputs.ranks?.xera ?? null,
      positionRelative: false,
      reference: 'vs league',
    },
    {
      label: 'Whiff%',
      value: fmtPct(inputs.whiff_pct),
      percentile: inputs.ranks?.whiff_pct ?? null,
      positionRelative: false,
      reference: 'vs league',
    },
    {
      label: 'K-BB%',
      value: fmtPct(inputs.k_bb_pct),
      percentile: inputs.ranks?.k_bb_pct ?? null,
      positionRelative: false,
      reference: 'vs league',
    },
  ]
}

// ─── One-line synthesizer (stub) ──────────────────────────────────────────

function synthesizeOneLine(dials: SignatureDial[]): string | null {
  const withRank = dials.filter(d => d.percentile != null)
  if (withRank.length === 0) return null

  // Sort by |percentile - 50| to find the most-defining signal
  withRank.sort((a, b) => Math.abs((b.percentile ?? 50) - 50) - Math.abs((a.percentile ?? 50) - 50))
  const top = withRank[0]
  const rank = top.percentile!

  if (rank >= 90) return `Elite ${top.label.toLowerCase()} — ${rank}th percentile ${top.reference}.`
  if (rank >= 75) return `Above-average ${top.label.toLowerCase()} at ${rank}th percentile.`
  if (rank <= 10) return `Bottom-decile ${top.label.toLowerCase()} — ${rank}th percentile.`
  if (rank <= 25) return `Below-average ${top.label.toLowerCase()} at ${rank}th percentile.`
  return `${top.label} sits near league average.`
}

// ─── Public API ───────────────────────────────────────────────────────────

export function buildBatterSignature(inputs: BatterInputs): SignatureSummary {
  const dials = buildBatterDials(inputs)
  return { oneLine: synthesizeOneLine(dials), dials }
}

export function buildPitcherSignature(inputs: PitcherInputs): SignatureSummary {
  const dials = buildPitcherDials(inputs)
  return { oneLine: synthesizeOneLine(dials), dials }
}

// TODO(haiku): Replace synthesizeOneLine() with a Haiku call.
// Cache key: `player-oneline:${playerId}:${YYYY-Www}`. Regen weekly.
// Prompt: pass the dials array + season line, ask for one sentence ≤90 chars,
// same voice rules as narrative.ts. Store in Supabase `player_oneline_cache`.