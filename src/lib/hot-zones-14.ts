// src/lib/hot-zones-14.ts
//
// 14-zone strike-zone model, replacing the 9-zone collapse that's been in
// use across the app (see ZONE_COLLAPSE in scripts/fetch_pitcher_hot_zones.py
// and scripts/fetch_batter_hot_zones.py, and the 9-zone grid in
// StrikeZoneHeatMap.tsx). This is what Baseball Savant actually publishes
// pitch-by-pitch, and what we need for the "arsenal vs projected lineup"
// analysis in series-matchup.ts — the shadow zones (11-14) are where the
// pitcher-vs-batter edge is actually decided, and collapsing them into
// their nearest strike zone was masking real signal.
//
// SAVANT'S 14-ZONE LAYOUT (catcher's view):
//
//              [ 11 ][ shadow-top      ][ 12 ]
//              [    ][  7 ][  8 ][  9 ][    ]
//              [ shadow  ][  4 ][  5 ][  6 ][ shadow ]
//              [  L   ][  1 ][  2 ][  3 ][   R  ]
//              [ 13 ][ shadow-bottom   ][ 14 ]
//                      ↑ chase zone (all points beyond 11-14)
//
// - 1-9: the standard strike zone 3x3 grid
// - 11: high inside corner (above/inside strike zone)
// - 12: high outside corner (above/outside)
// - 13: low inside corner
// - 14: low outside corner
// - Shadow-top / shadow-bottom / shadow-inside / shadow-outside: pitches
//   that just missed the zone in one direction, not at a corner. Savant
//   sometimes calls all of these "shadow zone" collectively — some feeds
//   give them their own numbering (16-19), some don't. This module treats
//   them under one "shadow_edge" bucket when the feed doesn't distinguish.
// - Chase (zone 0 in some feeds, "outside" in others): everything else.
//
// USAGE:
//   - normalizeZone14(z) — safe int -> ZoneId, preserving 11-14 and mapping
//     everything else to 'shadow_edge' or 'chase' rather than collapsing
//     into the 9-zone box.
//   - ZONE_LAYOUT_14 — grid for rendering (5-row layout).
//   - is-strike / is-shadow / is-chase predicates for scoring.
//
// MIGRATION NOTES:
//   - This file does NOT replace hot-zones.ts. It supplements it. Any
//     surface that specifically wants shadow-zone signal should import
//     from here; the 9-zone grid still works for the visual heatmap in
//     StrikeZoneHeatMap.tsx until we're ready to migrate that too.
//   - The Python side (fetch_*_hot_zones.py) still collapses at write
//     time via ZONE_COLLAPSE. To get real 14-zone data into the DB,
//     drop the collapse in those scripts and add 4 more keys to the
//     stored `zones` JSONB. This is the write-side companion change.

export type ZoneId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 11 | 12 | 13 | 14
  | 'shadow_edge'
  | 'chase'

export const STRIKE_ZONES: readonly ZoneId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export const CORNER_SHADOW_ZONES: readonly ZoneId[] = [11, 12, 13, 14] as const

export const ZONE_LABEL_14: Record<Exclude<ZoneId, 'shadow_edge' | 'chase'>, string> = {
  1: 'Low inside',
  2: 'Low middle',
  3: 'Low outside',
  4: 'Middle inside',
  5: 'Middle middle',
  6: 'Middle outside',
  7: 'High inside',
  8: 'High middle',
  9: 'High outside',
  11: 'Off-plate high inside',
  12: 'Off-plate high outside',
  13: 'Off-plate low inside',
  14: 'Off-plate low outside',
}

export function zoneLabel14(z: ZoneId): string {
  if (z === 'shadow_edge') return 'Off-plate edge'
  if (z === 'chase') return 'Chase (well outside)'
  return ZONE_LABEL_14[z]
}

/**
 * Turns Savant's raw `zone` value into a ZoneId, preserving shadow-corner
 * info that ZONE_COLLAPSE in the existing 9-zone scripts throws away.
 *
 * If your feed uses non-standard shadow numbering (some Savant exports
 * give 16-19 for edge shadows, some don't), extend the SHADOW_EDGE_CODES
 * / CHASE_CODES sets below.
 */
const SHADOW_EDGE_CODES = new Set([16, 17, 18, 19])
const CHASE_CODES = new Set([0])

export function normalizeZone14(raw: unknown): ZoneId | null {
  let z: number
  if (typeof raw === 'number') z = raw
  else if (typeof raw === 'string') z = parseInt(raw, 10)
  else return null
  if (!Number.isFinite(z)) return null

  if (z >= 1 && z <= 9) return z as ZoneId
  if (z === 11 || z === 12 || z === 13 || z === 14) return z as ZoneId
  if (SHADOW_EDGE_CODES.has(z)) return 'shadow_edge'
  if (CHASE_CODES.has(z)) return 'chase'
  return null
}

/**
 * The rendering layout — a 5x5 grid where the outer ring is shadow
 * corners + edges. Empty cells are the visual gap between shadow and
 * strike zone. Callers walk this to render the heat map.
 */
export const ZONE_LAYOUT_14: readonly (readonly (ZoneId | null)[])[] = [
  [11,             'shadow_edge', 'shadow_edge', 'shadow_edge', 12],
  ['shadow_edge',  7,             8,             9,             'shadow_edge'],
  ['shadow_edge',  4,             5,             6,             'shadow_edge'],
  ['shadow_edge',  1,             2,             3,             'shadow_edge'],
  [13,             'shadow_edge', 'shadow_edge', 'shadow_edge', 14],
] as const

export function isStrikeZone(z: ZoneId): boolean {
  return typeof z === 'number' && z >= 1 && z <= 9
}
export function isShadowCorner(z: ZoneId): boolean {
  return z === 11 || z === 12 || z === 13 || z === 14
}
export function isShadowEdge(z: ZoneId): boolean {
  return z === 'shadow_edge'
}
export function isChase(z: ZoneId): boolean {
  return z === 'chase'
}

/**
 * Small helper for the series-matchup scoring: shadow-zone whiff rates
 * are the single most predictive stat for K% in any given at-bat. A
 * pitcher who lives in 11-14 vs a batter with a high chase% is a real
 * signal, and the 9-zone collapse was losing it entirely. This lets the
 * scoring layer boost a matchup where the pitcher's shadow-zone whiff
 * rate is elite AND the batter's shadow-zone chase rate is high.
 */
export function shadowZoneMatchupSignal(
  pitcherShadowWhiffPct: number | null,
  batterShadowChasePct: number | null,
): number {
  if (pitcherShadowWhiffPct == null || batterShadowChasePct == null) return 0
  // Both are 0-100. League avg chase ≈ 28%, league avg shadow whiff ≈ 22%.
  const chaseAbove = (batterShadowChasePct - 28) / 100
  const whiffAbove = (pitcherShadowWhiffPct - 22) / 100
  // Multiplicative — you need BOTH sides to move for this to matter.
  // Signal is on the same [-1, 1] scale as the other components in
  // series-matchup.ts. Positive = pitcher advantage (yes, this one is
  // signed the OPPOSITE way from the batter-perspective scores in
  // series-matchup.ts; callers should negate before combining if they
  // want it in the same frame).
  return Math.max(-1, Math.min(1, chaseAbove * whiffAbove * 4))
}
