// src/components/admin/story/durations.ts
//
// Segment length follows how much there is to read. Pure.

import type { SegmentId } from './types'

type Spec = { base: number; minRows: number; lo: number; hi: number }
export const PER_ROW = 0.35

export const DURATION_SPEC: Record<SegmentId, Spec> = {
  hook: { base: 2.5, minRows: 0, lo: 2.5, hi: 3 },
  'part-hook': { base: 1.5, minRows: 0, lo: 1.5, hi: 1.5 },
  sp: { base: 4.0, minRows: 5, lo: 3.5, hi: 5 },
  'sp-arsenal': { base: 4.5, minRows: 6, lo: 4, hi: 6 },
  'sp-tto': { base: 3.5, minRows: 3, lo: 3, hi: 4.5 },
  'lineup-away': { base: 3.5, minRows: 9, lo: 3, hi: 4 },
  'lineup-home': { base: 3.5, minRows: 9, lo: 3, hi: 4 },
  'bullpen-avail': { base: 5.5, minRows: 8, lo: 5, hi: 6.5 },
  late: { base: 3.5, minRows: 4, lo: 3, hi: 4.5 },
  'run-game': { base: 5.5, minRows: 6, lo: 5.5, hi: 7 },
  abs: { base: 5.5, minRows: 6, lo: 5.5, hi: 7 },
  'club-status': { base: 3.5, minRows: 5, lo: 3, hi: 4.5 },
  'defense-away': { base: 3.5, minRows: 8, lo: 3, hi: 4 },
  'defense-home': { base: 3.5, minRows: 8, lo: 3, hi: 4 },
  streaks: { base: 3.0, minRows: 2, lo: 3, hi: 4 },
  form: { base: 3.5, minRows: 2, lo: 3, hi: 4.5 },
  close: { base: 3.0, minRows: 0, lo: 3, hi: 3.5 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r2 = (n: number) => Math.round(n * 100) / 100

/** rows = data rows/cards actually rendered; extra = bonus seconds (e.g. +0.5 for a 3-line scout note). */
export function durationFor(id: SegmentId, rows: number, extra = 0): number {
  const s = DURATION_SPEC[id]
  return r2(clamp(s.base + Math.max(0, rows - s.minRows) * PER_ROW + extra, s.lo, id === 'hook' ? s.hi + 0.5 : s.hi))
}

export const buildFracFor = (id: SegmentId) => (id === 'part-hook' ? 0.5 : 0.4)
