import 'server-only'
// src/lib/pitch-shape/graphic-data.ts
//
// Everything one pitch-shape graphic needs for one pitcher's pitch, gathered on the server and handed to the three graphics (vs the league, why, what if) and to the article card as plain
// data. It uses the same reads as the Pitch Shape Lab (board row, the factor breakdown, the 0.1 inch league cells, the league bins), so a graphic can never disagree with the page.
// Descriptive only: "what pitches shaped like this have produced", never a forecast. Returns null when a piece is missing, and says so per piece (why: null) so a card can leave it out.

import { getLeagueBins, getMovementCells, getPitcherPoints, getShapeLabData, type MovementCellsPayload } from './data'
import { getShapeBoard, type BoardRow } from './results'
import { getWhy } from './diagnosis'
import { buildWhy, type Status } from './build-why'
import { PITCH_NAMES, indexBins, lookup, type Hand, type Shape } from './model'
import { makeGrid } from '@/components/pitch-shape/heatGrid'
import { resultsVsShape } from './results-math'

export type GLine = { id: 'saved' | 'woba' | 'xwoba' | 'whiff'; label: string; his: string; shape: string; league: string; tone: 'good' | 'bad' | 'level'; thin: boolean }
export type GWhyRow = { id: string; label: string; status: Status; number: string; text: string }
export type WhatIfRow = { label: string; before: string; after: string; diff: string; better: boolean | null }
export type WhatIf = { changes: { label: string; from: number; to: number; unit: string; digits: number }[]; before: Shape; after: Shape; rows: WhatIfRow[]; swingsBefore: number; swingsAfter: number; lead: string | null }
export type ShapeGraphicData = {
  pitcherId: number; name: string; team: string; hand: Hand; season: number
  pitchType: string; pitchName: string
  pitches: { pitchType: string; pitchName: string; n: number }[]
  shape: Shape; sdHb: number; sdIvb: number
  score: number | null; shapeWord: string | null; verdict: 'ahead' | 'behind' | 'level' | null; gap: number | null; small: boolean
  ownPitches: number; ownSwings: number
  lines: GLine[]
  leagueWhiff: number | null
  why: { lead: string | null; rows: GWhyRow[] } | null
  map: { payload: MovementCellsPayload; leagueRate: number; points: [number, number][]; avg: { hb: number; ivb: number } } | null
  whatIf: WhatIf | null
}

const f1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const w3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''))
const sg = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const wordFor = (score: number | null) => (score == null ? null : score >= 67 ? 'Strong shape' : score <= 33 ? 'Weak shape' : 'Average shape')

const BANDS = { saved: 0.4, woba: 0.03, xwoba: 0.03, whiff: 0.03 } as const
function toneOf(id: GLine['id'], own: number, shape: number, thin: boolean): GLine['tone'] {
  if (thin) return 'level'
  const up = id === 'saved' || id === 'whiff'
  const z = ((up ? 1 : -1) * (own - shape)) / BANDS[id]
  return z > 1 ? 'good' : z < -1 ? 'bad' : 'level'
}

function linesFor(row: BoardRow, league: { woba: number | null; xwoba: number | null; whiff: number | null } | null): GLine[] {
  const own = row.ownRaw, shape = row.shapeRaw
  const thinAll = row.own.saved == null && !row.small
  const mk = (id: GLine['id'], label: string, o: number | null, s: number | null, l: number | null, fmt: (v: number | null) => string, thin = thinAll): GLine | null =>
    o == null || s == null ? null : { id, label, his: fmt(o), shape: fmt(s), league: fmt(l), tone: toneOf(id, o, s, thin), thin }
  return [
    mk('saved', 'Runs saved per 100', own.saved, shape.saved, 0, v => (v == null ? '—' : sg(v))),
    mk('woba', 'wOBA against', own.woba, shape.woba, league?.woba ?? null, w3),
    mk('xwoba', 'xwOBA against', own.xwoba, shape.xwoba, league?.xwoba ?? null, w3),
    mk('whiff', 'Whiffs per swing', own.whiff, shape.whiff, league?.whiff ?? null, f1),
  ].filter((x): x is GLine => !!x)
}

export async function getShapeGraphicData(pitcherId: number, wantType: string | null, deltas: Partial<Shape> | null = null): Promise<ShapeGraphicData | null> {
  const d = await getShapeLabData(pitcherId)
  if (!d || d.pitches.length === 0) return null
  const pitch = d.pitches.find(p => p.pitchType === wantType) ?? d.pitches[0]
  const type = pitch.pitchType, lc = (PITCH_NAMES[type] ?? type).toLowerCase()
  const cur = pitch.current

  const [board, bins, cells, points] = await Promise.all([
    getShapeBoard(type, d.hand), getLeagueBins(type, d.hand),
    getMovementCells(type, d.hand, cur.hb, cur.ivb, Math.min(7, Math.max(4, Math.ceil(Math.max(cur.sdHb, cur.sdIvb) * 2)))),
    getPitcherPoints(type, d.hand, d.season, pitcherId),
  ])
  const row = board?.rows.find(r => r.pitcherId === pitcherId) ?? null

  let leagueRate: number | null = null
  if (cells) { const g = makeGrid(cells, 'latest'); leagueRate = g.swings > 0 ? g.whiffs / g.swings : null }
  const leagueWhiff = board?.league.whiff ?? leagueRate

  // his line against the shape and the league (the Lab's own comparison)
  let lines: GLine[] = []
  let verdict: ShapeGraphicData['verdict'] = null, gap: number | null = null
  if (row) {
    lines = linesFor(row, board ? { woba: board.league.woba, xwoba: board.league.xwoba, whiff: leagueWhiff } : null)
    const cmp = resultsVsShape(row.small ? row.ownRaw.saved : row.own.saved, row.shape.saved)
    verdict = cmp?.verdict ?? null; gap = cmp?.gap ?? null
  }

  // why: the factor breakdown in a ±1 in window of his average shape
  let why: ShapeGraphicData['why'] = null
  if (row) {
    const w = await getWhy(pitcherId, d.season, type, 1, 1)
    if (w && !('needsSql' in w)) {
      const built = buildWhy(row, lc, w, bins, undefined)
      why = { lead: built.lead, rows: built.rows.map(r => ({ id: r.id, label: r.label, status: r.status, number: r.number, text: r.text })) }
    }
  }

  // what if: the same lookup the Lab's dial-in uses, before and after the changes
  let whatIf: WhatIf | null = null
  const slot = row?.slot ?? null, velo = row?.velo ?? null
  if (deltas && bins.length && velo != null && slot != null) {
    const before: Shape = { velo, ivb: cur.ivb, hb: cur.hb, slot }
    const after: Shape = { velo: before.velo + (deltas.velo ?? 0), ivb: before.ivb + (deltas.ivb ?? 0), hb: before.hb + (deltas.hb ?? 0), slot: before.slot + (deltas.slot ?? 0) }
    const index = indexBins(bins)
    const A = lookup(index, before), B = lookup(index, after)
    const defs: { k: keyof Shape; label: string; unit: string; digits: number }[] = [
      { k: 'velo', label: 'Velocity', unit: 'mph', digits: 1 }, { k: 'ivb', label: 'Ride', unit: 'in', digits: 1 }, { k: 'hb', label: 'Run', unit: 'in', digits: 1 }, { k: 'slot', label: 'Arm angle', unit: '°', digits: 0 },
    ]
    const changes = defs.filter(x => Math.abs(after[x.k] - before[x.k]) >= (x.k === 'slot' ? 1 : 0.05)).map(x => ({ label: x.label, from: before[x.k], to: after[x.k], unit: x.unit, digits: x.digits }))
    const mk = (label: string, a: number | null, b: number | null, pts: boolean, upGood: boolean): WhatIfRow => {
      const diff = a == null || b == null ? null : pts ? (b - a) * 100 : b - a
      return { label, before: pts ? f1(a) : w3(a), after: pts ? f1(b) : w3(b), diff: diff == null ? 'not enough pitches' : pts ? `${sg(diff, 1)} pts` : sg(diff, 3).replace('0.', '.'), better: diff == null || Math.abs(diff) < (pts ? 0.05 : 0.0005) ? null : upGood ? diff > 0 : diff < 0 }
    }
    const rows = [mk('Whiffs per swing', A.whiff.value, B.whiff.value, true, true), mk('Called + swinging strikes per pitch', A.csw.value, B.csw.value, true, true), mk('Ground balls per batted ball', A.gb.value, B.gb.value, true, true), mk('Damage on contact (xwOBAcon)', A.xwobaCon.value, B.xwobaCon.value, false, false)]
    const w = A.whiff.value != null && B.whiff.value != null ? (B.whiff.value - A.whiff.value) * 100 : null
    const phrase = changes.map(c => `${c.label.toLowerCase()} ${c.to >= c.from ? '+' : '−'}${Math.abs(c.to - c.from).toFixed(c.digits)} ${c.unit}`).join(', ')
    const lead = changes.length === 0 ? null : w == null ? `League ${lc}s shaped like his with these changes (${phrase}) are too few to read a whiff rate.`
      : `League ${d.hand === 'L' ? 'left' : 'right'}-handed ${lc}s shaped like his current pitch have produced ${f1(A.whiff.value)} whiffs per swing. Shaped like it with these changes (${phrase}), they have produced ${f1(B.whiff.value)}, ${sg(w, 1)} points.`
    whatIf = { changes, before, after, rows, swingsBefore: A.swings, swingsAfter: B.swings, lead }
  }

  return {
    pitcherId, name: d.name, team: d.teamAbbr, hand: d.hand, season: d.season, pitchType: type, pitchName: PITCH_NAMES[type] ?? type,
    pitches: d.pitches.map(p => ({ pitchType: p.pitchType, pitchName: PITCH_NAMES[p.pitchType] ?? p.pitchType, n: p.current.n })),
    shape: { velo: velo ?? 0, ivb: cur.ivb, hb: cur.hb, slot: slot ?? 0 }, sdHb: cur.sdHb, sdIvb: cur.sdIvb,
    score: row?.score ?? null, shapeWord: wordFor(row?.score ?? null), verdict, gap, small: row?.small ?? false,
    ownPitches: row?.ownRaw.n.rv ?? 0, ownSwings: row?.ownRaw.n.swings ?? 0,
    lines, leagueWhiff, why,
    map: cells && leagueRate != null ? { payload: cells, leagueRate, points: points.length ? points : pitch.points.map(p => [p.hb, p.ivb] as [number, number]), avg: { hb: cur.hb, ivb: cur.ivb } } : null,
    whatIf,
  }
}
