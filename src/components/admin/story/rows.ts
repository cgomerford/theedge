// src/components/admin/story/rows.ts
//
// Pure row counts: how many data rows/cards a segment actually renders. They
// drive both the segment duration and the layout budget, and live here (not in
// the TSX segments) so buildStory stays testable in a node environment.

import { BODY_TOP, ROW, SPACE, TYPE } from './layout'
import type { StoryGame } from './types'

export const AVAIL_TOP_LINE_H = 44
export const AVAIL_COLS_H = 36

/** Reliever rows that fit per team inside SAFE for "Who's available" (7 max, 6 when both teams are full). */
export function rowsPerTeam(teams: number, footLines = 1): number {
  const avail = 1536 - BODY_TOP - AVAIL_TOP_LINE_H - teams * (64 + AVAIL_COLS_H) - SPACE.l * Math.max(0, teams - 1) - Math.ceil(TYPE.foot * 1.25) * footLines - SPACE.m
  return Math.max(1, Math.min(7, Math.floor(avail / (teams * ROW.grid))))
}

export function availRows(game: StoryGame): number {
  const g = game.penGrid
  const n = [g?.away, g?.home].filter(Boolean).length
  if (n === 0) return 0
  const per = rowsPerTeam(n)
  return Math.min(g?.away?.rows.length ?? 0, per) + Math.min(g?.home?.rows.length ?? 0, per)
}

export function spRowCount(game: StoryGame): number {
  const keys = ['era', 'fip', 'whip', 'k9', 'bb9', 'kbb9', 'l3Era'] as const
  return keys.filter(k => game.sp.away.stats?.[k] != null || game.sp.home.stats?.[k] != null).length
}

export const arsenalRowCount = (g: StoryGame) => (g.arsenal.away?.length ?? 0) + (g.arsenal.home?.length ?? 0)
export const lateRowCount = (g: StoryGame) => {
  const l = g.scout?.late
  return (l?.away?.hitting.length ?? 0) + (l?.away?.innings.length ?? 0) + (l?.home?.hitting.length ?? 0) + (l?.home?.innings.length ?? 0)
}

export function runCardList(g: StoryGame) {
  const run = g.scout?.run
  return [run?.away, run?.home].filter(c => !!c?.catcher?.bars)
}
export function runRowCount(g: StoryGame): number {
  return runCardList(g).reduce((s, c) => {
    const b = c?.catcher?.bars
    return s + (b ? [b.framing, b.blocking, b.throwing, b.pop].filter(Boolean).length : 0)
  }, 0)
}
export function absRowCount(g: StoryGame): number {
  const a = g.scout?.abs
  return [a?.away, a?.home].reduce((s, c) => s + (c ? 2 + Math.min(c.top.length, 2) : 0), 0)
}
export function clubRowCount(g: StoryGame): number {
  const c = g.scout?.club
  const n = (k: { out: unknown[]; questionable: unknown[] } | null | undefined) =>
    k ? Math.min(k.out.length, 5) + Math.min(k.questionable.length, 3) : 0
  return n(c?.away) + n(c?.home)
}
