// src/components/pitch-shape/bothHands.ts
//
// "Both" hands on the Pitch Shape map: left- and right-handed pitches of one type shown together. This is sound because the Lab already stores every pitch in ONE coordinate system:
// run (hb) is arm-side positive with left-handers flipped (see model.ts), so a left-hander's four-seam sits on the same map as a right-hander's. Every league table is a set of
// additive counts per 0.1-inch cell, so combining the two hands is a sum, cell by cell, never an average of rates. The one centre the two hand maps are drawn around is the
// right-handed one (the grid is absolute inches, so left-handed cells outside that window are simply not drawn).
// Pitcher rows are never merged: each pitcher keeps his own hand and his own Shape Score (ranked among his own hand), and carries it as `hand`.

import type { MovementCellsPayload, MovementSeasonCells, PitcherDot, Thrower } from '@/lib/pitch-shape/data'
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import type { Measures, ResultsPayload } from '@/lib/pitch-shape/results-math'
import { STRIDE } from '@/lib/pitch-shape/results-math'
import type { Hand } from '@/lib/pitch-shape/model'

export type ViewHand = Hand | 'B'
export const handsOf = (h: ViewHand): Hand[] => (h === 'B' ? ['R', 'L'] : [h])
export const handWord = (h: ViewHand) => (h === 'B' ? 'left- and right-handed' : h === 'L' ? 'left-handed' : 'right-handed')

/** Sum two flat cell arrays that share a layout: `stride` numbers per cell, the first two being the cell's coordinates, the rest additive. */
function sumCells(a: number[], b: number[], stride: number): number[] {
  const m = new Map<string, number[]>()
  for (const src of [a, b]) {
    for (let k = 0; k < src.length; k += stride) {
      const key = `${src[k]},${src[k + 1]}`
      const cur = m.get(key)
      if (!cur) { m.set(key, src.slice(k, k + stride)); continue }
      for (let i = 2; i < stride; i++) cur[i] += src[k + i]
    }
  }
  return [...m.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]).flat()
}

export function mergeCells(a: MovementCellsPayload, b: MovementCellsPayload): MovementCellsPayload {
  const years = [...new Set([...a.seasons.map(s => s.season), ...b.seasons.map(s => s.season)])].sort((x, y) => x - y)
  const seasons: MovementSeasonCells[] = years.map(y => {
    const sa = a.seasons.find(s => s.season === y), sb = b.seasons.find(s => s.season === y)
    const la = sa?.league ?? { pitches: 0, swings: 0, whiffs: 0 }, lb = sb?.league ?? { pitches: 0, swings: 0, whiffs: 0 }
    return { season: y, cells: sumCells(sa?.cells ?? [], sb?.cells ?? [], 5), league: { pitches: la.pitches + lb.pitches, swings: la.swings + lb.swings, whiffs: la.whiffs + lb.whiffs } }
  })
  const wa = a.seasons.find(s => s.season === a.latest)?.league.pitches ?? 1, wb = b.seasons.find(s => s.season === b.latest)?.league.pitches ?? 1
  const mix = (x: number, y: number) => (x * wa + y * wb) / (wa + wb)
  return { ...a, seasons, latest: Math.max(a.latest, b.latest), pct: { latest: { hb: mix(a.pct.latest.hb, b.pct.latest.hb), ivb: mix(a.pct.latest.ivb, b.pct.latest.ivb) }, all: { hb: mix(a.pct.all.hb, b.pct.all.hb), ivb: mix(a.pct.all.ivb, b.pct.all.ivb) } } }
}

export function mergeResults(a: ResultsPayload, b: ResultsPayload): ResultsPayload {
  const years = [...new Set([...a.seasons.map(s => s.season), ...b.seasons.map(s => s.season)])].sort((x, y) => x - y)
  return { ...a, latest: Math.max(a.latest, b.latest), seasons: years.map(y => ({ season: y, cells: sumCells(a.seasons.find(s => s.season === y)?.cells ?? [], b.seasons.find(s => s.season === y)?.cells ?? [], STRIDE) })) }
}

/** A rate pooled across two hands is each hand's rate weighted by the denominator behind it. */
function poolMeasures(a: Measures, b: Measures): Measures {
  const w = (x: number | null, nx: number, y: number | null, ny: number) => (x == null ? y : y == null ? x : nx + ny > 0 ? (x * nx + y * ny) / (nx + ny) : null)
  return {
    pitches: a.pitches + b.pitches,
    runs100: w(a.runs100, a.n.rv, b.runs100, b.n.rv), woba: w(a.woba, a.n.pa, b.woba, b.n.pa), xwoba: w(a.xwoba, a.n.pa, b.xwoba, b.n.pa),
    avg: w(a.avg, a.n.ab, b.avg, b.n.ab), slg: w(a.slg, a.n.ab, b.slg, b.n.ab), whiff: w(a.whiff, a.n.swings, b.whiff, b.n.swings),
    n: { rv: a.n.rv + b.n.rv, ab: a.n.ab + b.n.ab, pa: a.n.pa + b.n.pa, swings: a.n.swings + b.n.swings },
  }
}

export type HBoardRow = BoardRow & { hand: Hand }
export function mergeBoards(a: Board, b: Board): Board {
  const tag = (bd: Board, hand: Hand): HBoardRow[] => bd.rows.map(r => ({ ...r, hand }))
  return { ...a, league: poolMeasures(a.league, b.league), rows: [...tag(a, 'R'), ...tag(b, 'L')], dist: [...a.dist, ...b.dist].sort((x, y) => x - y) }
}

export type HDot = PitcherDot & { hand: Hand }
export const tagDots = (d: PitcherDot[], hand: Hand): HDot[] => d.map(x => ({ ...x, hand }))

export function mergeThrowers(a: Thrower[], b: Thrower[], limit = 40): Thrower[] {
  return [...a, ...b].sort((x, y) => y.inSpot - x.inSpot || y.nPitches - x.nPitches).slice(0, limit)
}
