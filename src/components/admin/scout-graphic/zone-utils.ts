// src/components/admin/scout-graphic/zone-utils.ts
//
// Pure helpers for the Scout Report Graphic: zone-cell colouring on an
// ABSOLUTE scale (so a cold zone looks cold in every graphic, not just
// relative to that batter's other zones) and the auto-drafted "read".
//
// No betting language: the draft describes where a hitter has done damage /
// been beaten and how often the pitcher throws the pitch — it never says
// what will happen.

import type { BatterArsenalPitch, BatterArsenalZoneCell } from '@/lib/batter-zone-arsenal'
import { ZONE_LABELS } from '@/lib/hot-zones'

export type ZoneMetric = 'ba' | 'slg' | 'xwoba' | 'whiff_pct'

/** Which side the batter stands on for THIS matchup (a switch hitter bats opposite the pitcher's hand). */
export type Stands = 'L' | 'R' | null
export function effectiveStands(batSide: 'L' | 'R' | 'S' | null, pitcherThrows: 'L' | 'R'): Stands {
  if (batSide === 'S') return pitcherThrows === 'R' ? 'L' : 'R'
  return batSide
}

/**
 * Zone name from the batter's point of view. Savant zones are numbered from the
 * catcher's view, so zone 1 (top-left) is high-INSIDE to a righty but high-AWAY
 * to a lefty. lib/hot-zones ZONE_LABELS assume a righty; this flips them for a
 * lefty and says "away" (not "outside"). With handedness unknown it falls back to
 * the neutral left/right of the catcher's view rather than guessing.
 */
export function zoneLabel(key: string, stands: Stands): string {
  const base = ZONE_LABELS[key]
  if (!base) return `zone ${key}`
  const swap = (s: string, a: string, b: string) => s.replace(a, '\u0000').replace(b, a).replace('\u0000', b)
  let out = base
  if (stands === 'L') {
    out = swap(out, 'inside', 'outside')
    out = swap(out, '/in', '/away')
  }
  if (stands === null) return out.replace('outside', 'right').replace('inside', 'left').replace('/away', '/right').replace('/in', '/left')
  return out.replace('outside', 'away')
}

export const METRIC_LABELS: Record<ZoneMetric, string> = { ba: 'AVG', slg: 'SLG', xwoba: 'xwOBA', whiff_pct: 'Whiff %' }

// cold → mid → hot anchors. ba/slg/xwoba mirror lib/hot-zones.ts
// colorForBatterMetric; whiff is in percent points.
const RANGES: Record<ZoneMetric, { cold: number; mid: number; hot: number }> = {
  ba:        { cold: 0.200, mid: 0.260, hot: 0.320 },
  slg:       { cold: 0.330, mid: 0.430, hot: 0.560 },
  xwoba:     { cold: 0.260, mid: 0.330, hot: 0.420 },
  whiff_pct: { cold: 15,    mid: 25,    hot: 40 },
}

/** Below this many AB (or swings, for whiff) a zone is shown faded, not coloured. */
export const MIN_ZONE_SAMPLE = 5

const COLD = [220, 236, 228]   // #dcece4 — green-grey tint
const MID  = [241, 238, 230]   // #f1eee6 — neutral (C.soft)
const HOT  = [224, 122, 90]    // #e07a5a — warm orange

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** 0 = cold tint, 0.5 = neutral, 1 = hot — for scales that aren't a batting metric (e.g. pitch usage). */
export function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  return c <= 0.5 ? mix(COLD, MID, c / 0.5) : mix(MID, HOT, (c - 0.5) / 0.5)
}

export function zoneColor(value: number | null, metric: ZoneMetric): string {
  if (value == null) return '#f5f3ee'
  const r = RANGES[metric]
  if (value <= r.mid) {
    const t = Math.max(0, Math.min(1, (value - r.cold) / (r.mid - r.cold)))
    return mix(COLD, MID, t)
  }
  const t = Math.max(0, Math.min(1, (value - r.mid) / (r.hot - r.mid)))
  return mix(MID, HOT, t)
}

export function fmtMetric(v: number | null | undefined, metric: ZoneMetric): string {
  if (v == null) return '—'
  return metric === 'whiff_pct' ? `${v.toFixed(0)}%` : v.toFixed(3).replace(/^0/, '')
}

/** The sample the cell's value is computed on (swings for whiff, AB otherwise). */
export function cellSample(cell: BatterArsenalZoneCell | undefined, metric: ZoneMetric): number {
  if (!cell) return 0
  return metric === 'whiff_pct' ? cell.swings ?? 0 : cell.ab ?? 0
}

/** Split key for the batter's zone data, given the pitcher's throwing hand. */
export function splitForPitcher(throws: 'L' | 'R') {
  return throws === 'L' ? 'vs_lhp' : 'vs_rhp'
}

type Ranked = { key: string; value: number; n: number }

/** Sentence floor: prefer zones with a real sample so one 7-AB outlier doesn't headline the read. */
const DRAFT_SAMPLE = 8

function rankedZones(pitch: BatterArsenalPitch, metric: ZoneMetric): Ranked[] {
  const all = Object.entries(pitch.zones)
    .map(([key, cell]) => ({ key, value: cell[metric], n: cellSample(cell, metric) }))
    .filter((z): z is Ranked => z.value != null && z.n >= MIN_ZONE_SAMPLE)
  const solid = all.filter(z => z.n >= DRAFT_SAMPLE)
  return solid.length >= 2 ? solid : all
}

/**
 * Draft of "the read" from the numbers on the card. Uses **bold** markers the
 * card renders. Returns '' when the zones don't give a real contrast (too few
 * clear the sample floor, or they all tie) — the card then shows nothing
 * rather than an invented sentence.
 */
export function draftRead(args: {
  batterName: string
  pitcherName: string
  pitchName: string
  pitcherUsagePct: number | null
  pitch: BatterArsenalPitch | null
  metric: ZoneMetric
  stands: Stands
}): string {
  const { batterName, pitcherName, pitchName, pitcherUsagePct, pitch, metric, stands } = args
  if (!pitch) return ''
  const zones = rankedZones(pitch, metric).sort((a, b) => b.value - a.value)
  if (zones.length === 0) return ''

  const last = (n: string) => n.trim().split(' ').slice(-1)[0]
  const hi = zones[0]
  const lo = zones[zones.length - 1]
  // A read needs a real contrast. With one qualifying zone, or every zone tied
  // (e.g. all .000), "his damage lives here" would be noise — say nothing.
  if (zones.length < 2 || hi.value <= lo.value) return ''
  const label = METRIC_LABELS[metric]
  const unit = metric === 'whiff_pct' ? 'swings' : 'AB'
  const parts: string[] = []

  if (metric === 'whiff_pct') {
    parts.push(`${last(batterName)}'s most swing-and-miss against the ${pitchName} is **${zoneLabel(hi.key, stands)}** — **${fmtMetric(hi.value, metric)}** whiff over ${hi.n} ${unit}.`)
  } else {
    parts.push(`${last(batterName)}'s damage against the ${pitchName} lives **${zoneLabel(hi.key, stands)}** — **${fmtMetric(hi.value, metric)} ${label}** over ${hi.n} ${unit} there.`)
  }
  if (pitcherUsagePct != null) {
    parts.push(`${last(pitcherName)} throws it **${Math.round(pitcherUsagePct)}%** of the time.`)
  }
  if (zones.length > 1) {
    parts.push(metric === 'whiff_pct'
      ? `He rarely misses in **${zoneLabel(lo.key, stands)}** (${fmtMetric(lo.value, metric)} on ${lo.n} ${unit}).`
      : `His quietest spot is **${zoneLabel(lo.key, stands)}** — ${fmtMetric(lo.value, metric)} on ${lo.n} ${unit}.`)
  }
  return parts.join(' ')
}
