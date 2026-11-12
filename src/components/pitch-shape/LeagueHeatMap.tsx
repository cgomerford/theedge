'use client'

// src/components/pitch-shape/LeagueHeatMap.tsx
//
// The league movement heat map for the Pitch Shape Lab. Sideways movement (glove side to the left, arm side to the right) by ride (induced vertical break, up), for one pitch type, hand (right, left or both) and
// level. The page is two columns so nothing stacks into a long scroll:
//   left   the map, the spot under the cursor in big numbers, and, for a chosen pitcher, what the map is showing for him
//   right  the colour key, then three tabs as the finder always had them: This shape (what the league has produced there, and who throws it and how they are doing), Find a pitcher, and Filters and settings.
//          Clicking the map switches to This shape and the filters fold away.
// Below, full width: the chosen pitcher's full read (the original detail view), then, collapsed until opened, the level comparison and the Shape Score board, then the notes.
// Everything in the tabs and below is the finder's own sections, unchanged (ShapeResultsKit, LevelsCompared); this file only decides where they sit and feeds them from server actions.
//   Colour by: whiffs per swing (full 0.1-inch detail), or wOBA, xwOBA, runs saved, average, slugging (league outcomes read on the server), or called strikes + whiffs, hard-hit, ground-ball rate, xwOBA on contact
//      (built from the 2-inch groups). One colour rule: red is better for the pitcher, blue is worse (metrics.ts).
//   Speed and arm-angle filters: the 0.1-inch cells are pooled over speed and arm angle and cannot be filtered, so a filtered map is built on the server from the 2-inch groups (shapeHeat): coarser, and the page says how
//      far it sits from the unfiltered map, live. Both use the same seasons (all of 2024-2026 for MLB), so removing a filter changes only the smoothing.
//   By default the map marks the average shape in a box and labels the outlier pitchers; clicking a dot opens that pitcher's full read.
// Data reaches the browser as props and as results of server actions, so this file fetches nothing itself. The Pro rule is enforced inside the actions. Describes what already happened; nothing looks forward.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, Empty, Foot } from '@/components/team/ui'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { DENSITY_COLORS, HEAT_COLORS, HEAT_HALF, hexToRgb, makeGrid, stats } from './heatGrid'
import { paintBlocks } from './heatPaint'
import HeatLegend from './HeatLegend'
import RangeSlider from './RangeSlider'
import PitcherDetailView from './PitcherDetailView'
import PitcherStory, { PitcherYears, WhereHeLands, type StoryTab } from './PitcherStory'
import { PitcherSeasonChanges } from './ShapeChanges'
import PitcherShapeLevels from './PitcherShapeLevels'
import ShapeDial from './ShapeDial'
import { CompareTab, FantasyTab, PlayerFantasy, PlayersTab, SelectionBar, CMP_MAX, littleAttention } from './ShapeV3Tabs'
import type { BoardRow } from '@/lib/pitch-shape/results'
import ShapeMap from './ShapeMap'
import { LevelsPanel, PitchOverview, PitcherOverall, SeasonMonths, WhyPanel } from './PitcherSubTabs'
import LocationPanel from './LocationPanel'
import PlateView from './PlateDots'
import { FindPitcher, ResultsReadout, ShapePlayersPanel, ShapeScoreBoard } from './ShapeResultsKit'
import LevelsCompared, { useLevelsCompared } from './LevelsCompared'
import { handWord, type ViewHand } from './bothHands'
import { METRICS, METRIC_ORDER, metricRgb, numberDef, scaledDef, type MetricDef, type MetricKey } from './metrics'
import {
  shapeBoard, shapeHeat, shapeMetric, shapeOutliers, shapeReadout, shapeSpot,
  type FocusData, type HeatResult, type MetricResult, type ReadoutResult, type SpotResult,
} from '@/app/mlb/lab/pitch-shape/actions'
import type { Board } from '@/lib/pitch-shape/results'
import { LATTICE_STEP, MIN_SWINGS_IN_REACH, sigmaFor, type BinMetric, type FilteredHeat, type ShapeSummary } from '@/lib/pitch-shape/filtered-heat'
import type { Outliers } from '@/lib/pitch-shape/spot'
import { limitsFor } from '@/lib/milb-shape/limits'
import { parseLevel } from '@/lib/milb-shape/levels'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { log } from '@/lib/log'

export type MapFocus = FocusData

const HALF = HEAT_HALF
const MIN_WINDOW_SWINGS = 40
const RADII = [0.5, 1, 2] as const
type Pt = { hb: number; ivb: number }
type Colour = MetricKey | 'density'
/** one lattice of values for the chosen measure, from either server source */
type Lat = { n: number; vals: (number | null)[]; counts: number[]; hb0: number; ivb0: number; half: number; metric: MetricKey; league: number | null }
const latOfBins = (h: FilteredHeat): Lat => ({ n: h.n, vals: h.rates, counts: h.counts, hb0: h.hb0, ivb0: h.ivb0, half: h.half, metric: h.metric, league: h.leagueValue })

const WINDOW_NOTE: Record<(typeof RADII)[number], string> = {
  0.5: 'Smallest window: the sharpest detail, but each box rests on the fewest swings, so the picture is noisier and more boxes at the edges go blank.',
  1: 'Middle window: a balance of detail and steadiness. This is the default.',
  2: 'Largest window: the smoothest, steadiest picture, because every box rests on the most swings. Fine detail blurs, and neighbouring spots look more alike.',
}

const BLUE = HEAT_COLORS[0], RED = HEAT_COLORS[HEAT_COLORS.length - 1]
const pp = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`
/** the measures shown as buttons above the map; every other measure is under More */
const MAIN_METRICS: [MetricKey, string][] = [['whiff', 'Whiffs'], ['woba', 'wOBA'], ['xwoba', 'xwOBA'], ['avg', 'Average'], ['slg', 'Slugging'], ['runs', 'Runs saved']]
const snap = (p: Pt): Pt => ({ hb: Math.round(p.hb * 2) / 2, ivb: Math.round(p.ivb * 2) / 2 })
const side = (hb: number) => (hb >= 0 ? 'arm side' : 'glove side')
const surname = (n: string) => n.split(' ').slice(-1)[0]
const k0 = (n: number) => Math.round(n).toLocaleString('en-US')

/** put each label next to its dot where it does not run over another label or off the map (greedy: right, left, above-right, above-left) */
function placeLabels(items: { x: number; y: number; text: string }[]) {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  return items.map(it => {
    const w = it.text.length * 1.3, h = 2.6
    const cands = [{ dx: 1.8, dy: 0.9, a: 'start' }, { dx: -1.8, dy: 0.9, a: 'end' }, { dx: 1.8, dy: -1.6, a: 'start' }, { dx: -1.8, dy: -1.6, a: 'end' }, { dx: 1.8, dy: 3.2, a: 'start' }, { dx: -1.8, dy: 3.2, a: 'end' }]
    const box = (c: (typeof cands)[number]) => { const x = it.x + c.dx; const x0 = c.a === 'start' ? x : x - w; return { x0, x1: x0 + w, y0: it.y + c.dy - h + 0.6, y1: it.y + c.dy + 0.6 } }
    const ok = (b: ReturnType<typeof box>) => b.x0 >= 0 && b.x1 <= 100 && b.y0 >= 0 && b.y1 <= 100 && !placed.some(p => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)
    const pick = cands.find(c => ok(box(c))) ?? cands[0]
    placed.push(box(pick))
    return { x: it.x + pick.dx, y: it.y + pick.dy, anchor: pick.a as 'start' | 'end' }
  })
}

export default function LeagueHeatMap({ payload, summary, focus = null, type, pitchName, hand, level, levelName, ui }: {
  payload: MovementCellsPayload | null; summary: ShapeSummary | null; focus?: MapFocus | null
  type: string; pitchName: string; hand: ViewHand; level: string; levelName: string
  /** v3 lays the lab out as story tabs (map, players, levels, league average, leaderboard, pitcher story, compare); v2 is the original single-scroll layout, kept so the two can be compared */
  ui: 'v2' | 'v3'
}) {
  const router = useRouter()
  const [colour, setColour] = useState<Colour>('whiff')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  const [span, setSpan] = useState<number | 'all'>(payload && payload.seasons.length > 0 ? payload.latest : 'all')   // the latest season by default; any earlier year, or all of them, on request
  const [hover, setHover] = useState<Pt | null>(null)
  const hisAvg: Pt | null = focus ? snap({ hb: focus.row.hb, ivb: focus.row.ivb }) : null
  const [sel, setSel] = useState<Pt | null>(hisAvg)   // a chosen pitcher opens on his own shape, so who else throws it is already listed
  const [fz, setFz] = useState<MapFocus | null>(focus)
  const [rule, setRule] = useState<'number' | 'pitcher'>('number')   // what red means on the map: the higher number (default) or better for the pitcher
  const [scaleMode, setScaleMode] = useState<'pitch' | 'fixed'>('pitch')   // the colours stretch over this pitch's own range by default; 'fixed' is the one league scale for every pitch
  const [story, setStory] = useState(ui === 'v3' ? 'overall' : 'shape')   // which tab of a chosen pitcher's story is open
  const [v3tab, setV3tab] = useState(focus ? 'pitcher' : 'map')   // v3: which top-level tab is open
  const [cmp, setCmp] = useState<number[]>(focus ? [focus.id] : [])   // v3: pitchers chosen for the Compare tab, first one is the base
  const toggleCmp = (id: number) => setCmp(c => (c.includes(id) ? c.filter(x => x !== id) : c.length >= CMP_MAX ? c : [...c, id]))
  type MarkSet = 'below' | 'era' | 'radar' | 'unusual' | 'none'
  const [markSet, setMarkSet] = useState<MarkSet>(focus ? 'none' : ui === 'v3' ? 'below' : 'unusual')   // which pitchers are marked on the map
  const marks = markSet !== 'none'
  const [tab, setTab] = useState<'shape' | 'find' | 'settings'>('shape')   // the right-hand panel: what the league has produced at the chosen shape, with the finder and the advanced filters one tab away
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [pickBusy, setPickBusy] = useState<number | null>(null)
  const [pickMsg, setPickMsg] = useState('')
  const vFull: [number, number] = summary ? [summary.vLo, summary.vHi] : [0, 0]
  const [v, setV] = useState<[number, number]>(vFull)
  const [a, setA] = useState<[number, number]>([0, 100])
  const [latBins, setLatBins] = useState<Lat | null>(null)
  const [latCells, setLatCells] = useState<Lat | null>(null)
  const [busy, setBusy] = useState(false)
  const [board, setBoard] = useState<Board | null | undefined>(undefined)   // every pitcher's row for this pitch (the original finder's board); undefined while loading
  const [readout, setReadout] = useState<ReadoutResult | null | undefined>(undefined)
  const [outl, setOutl] = useState<Outliers | null>(null)
  const [spot, setSpot] = useState<SpotResult | null>(null)
  const [spotBusy, setSpotBusy] = useState(false)
  // the map canvas lives inside a tab, so it is a new element each time the tab is opened; holding it in state makes the painting effect run again whenever it mounts
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)

  const vActive = !!summary && (v[0] !== vFull[0] || v[1] !== vFull[1])
  const aActive = !!summary?.hasArm && (a[0] !== 0 || a[1] !== 100)
  const active = vActive || aActive
  const filter = useMemo(() => ({ vMin: vActive ? v[0] : 0, vMax: vActive ? v[1] : 200, aMin: aActive ? a[0] : 0, aMax: aActive ? a[1] : 100 }), [vActive, aActive, v, a])
  // the outcome measures cannot be split by speed or arm angle, and the pitch-count view needs the unfiltered cells: with a filter on, colour falls back to whiffs per swing
  const [colourNote, setColourNote] = useState('')
  useEffect(() => {
    if (active && (colour === 'density' || METRICS[colour].source === 'cells')) {
      setColourNote(`Switched back to whiffs per swing: ${colour === 'density' ? 'the pitch-count view' : METRICS[colour].label} can’t be split by speed or arm angle. Clear the filters to use it.`)
      setColour('whiff')
    } else if (!active) setColourNote('')
  }, [active, colour])

  const metric: MetricKey = colour === 'density' ? 'whiff' : colour
  const mdef = METRICS[metric]
  const isCell = colour !== 'density' && mdef.source === 'cells'
  const needBins = active || (colour !== 'density' && mdef.source === 'bins')
  const centre: Pt = payload ? { hb: payload.hb0, ivb: payload.ivb0 } : { hb: 0, ivb: 0 }
  // the speed and arm-angle filters and the measures built from the 2-inch groups only exist with every season added up, so they force all seasons; the other measures follow the chosen year
  const effSpan: number | 'all' = needBins ? 'all' : span
  const grids = useMemo(() => (payload ? { all: makeGrid(payload, 'all') } : null), [payload])
  const yearGrid = useMemo(() => (payload ? makeGrid(payload, effSpan) : null), [payload, effSpan])
  const grid = yearGrid
  const N = grid ? 2 * grid.h10 + 1 : 0
  const r10 = Math.round(radius * 10)
  const windowIn = Math.max(1, radius)
  const lat: Lat | null = isCell ? latCells : needBins ? latBins : null
  const latOk = lat != null && lat.metric === metric ? lat : null

  // what the map shows at a spot (the lattice point when the measure comes from the server, else the 0.1-inch window for whiffs)
  const readAt = (p: Pt): { value: number | null; n: number; pitches: number | null } => {
    if (latOk) {
      const ix = Math.round((p.hb - (latOk.hb0 - latOk.half)) / LATTICE_STEP), iy = Math.round((p.ivb - (latOk.ivb0 - latOk.half)) / LATTICE_STEP)
      const ok = ix >= 0 && iy >= 0 && ix < latOk.n && iy < latOk.n
      return { value: ok ? latOk.vals[iy * latOk.n + ix] : null, n: ok ? latOk.counts[iy * latOk.n + ix] : 0, pitches: null }
    }
    if (!grid) return { value: null, n: 0, pitches: null }
    const s = stats(grid, Math.round(p.hb * 10), Math.round(p.ivb * 10), r10)
    return { value: s.swings >= MIN_WINDOW_SWINGS ? s.whiffs / s.swings : null, n: s.swings, pitches: s.pitches }
  }
  // the unfiltered whiff reading at a spot, from the full-detail cells over the same seasons: shown beside a filtered or server-built value so the two can be checked against each other
  const fullAt = (p: Pt): { rate: number | null; swings: number } => {
    const g = grids?.all
    if (!g) return { rate: null, swings: 0 }
    const s = stats(g, Math.round(p.hb * 10), Math.round(p.ivb * 10), r10)
    return { rate: s.swings >= MIN_WINDOW_SWINGS ? s.whiffs / s.swings : null, swings: s.swings }
  }

  const avg: Pt = fz ? { hb: fz.row.hb, ivb: fz.row.ivb } : outl?.mean ?? centre
  const probe: Pt = hover ?? sel ?? avg
  const here = readAt(probe)
  const wRate = colour === 'whiff' ? here.value : undefined   // the pitcher groups are rated on whiffs per swing; the map's own number is handed over when it is that measure so the two agree

  // The map built from the 2-inch groups: with a filter on, or for the measures only the bins carry.
  useEffect(() => {
    if (!needBins || !payload) { setLatBins(null); return }
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      shapeHeat({ type, hand, level, radius, filter, centre, metric: (colour === 'density' ? 'whiff' : colour) as BinMetric })
        .then((r: HeatResult) => { if (live) { setLatBins(r.ok ? latOfBins(r.heat) : null); setBusy(false) } })
        .catch(e => { log.error('LeagueHeatMap', 'shapeHeat failed', e instanceof Error ? e.message : String(e)); if (live) { setLatBins(null); setBusy(false) } })
    }, 250)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needBins, colour, type, hand, level, radius, filter, payload])

  // The outcome measures (wOBA, xwOBA, runs saved, average, slugging), read on the server from the league outcomes.
  useEffect(() => {
    if (!isCell || active || !payload) { setLatCells(null); return }
    let live = true
    setBusy(true)
    const t = setTimeout(() => {
      shapeMetric({ type, hand, level, metric, radius, centre, year: effSpan === 'all' ? undefined : effSpan })
        .then((r: MetricResult) => { if (live) { setLatCells(r.ok ? { n: r.lattice.n, vals: r.lattice.values, counts: r.lattice.counts, hb0: r.lattice.hb0, ivb0: r.lattice.ivb0, half: r.lattice.half, metric: r.lattice.metric as MetricKey, league: r.lattice.leagueValue } : null); setBusy(false) } })
        .catch(e => { log.error('LeagueHeatMap', 'shapeMetric failed', e instanceof Error ? e.message : String(e)); if (live) { setLatCells(null); setBusy(false) } })
    }, 150)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCell, active, metric, type, hand, level, radius, payload, effSpan])

  // The average shape and the outlier pitchers (inside any speed or arm-angle range that is on).
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      shapeOutliers({ type, hand, level, filter })
        .then(r => { if (live) setOutl(r.ok ? r.data : null) })
        .catch(e => log.error('LeagueHeatMap', 'shapeOutliers failed', e instanceof Error ? e.message : String(e)))
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [type, hand, level, filter])

  // The panel for the spot under the cursor (or the selected spot, or the average shape): how many pitchers throw it and how they do.
  useEffect(() => {
    let live = true
    setSpotBusy(true)
    const t = setTimeout(() => {
      shapeSpot({ type, hand, level, radius, filter, hb: probe.hb, ivb: probe.ivb, leagueRate: wRate, leagueSwings: here.n })
        .then(r => { if (live) { setSpot(r); setSpotBusy(false) } })
        .catch(e => { log.error('LeagueHeatMap', 'shapeSpot failed', e instanceof Error ? e.message : String(e)); if (live) setSpotBusy(false) })
    }, 120)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe.hb, probe.ivb, type, hand, level, radius, filter, wRate])

  // The board: every pitcher with enough of this pitch, his shape and results (the finder's own Shape Score rows). Loaded once per pitch, hand and level; it feeds who throws a shape, the finder and the board below.
  useEffect(() => {
    let live = true
    setBoard(undefined)
    shapeBoard({ type, hand, level })
      .then(r => { if (live) setBoard(r.ok ? r.board : null) })
      .catch(e => { log.error('LeagueHeatMap', 'shapeBoard failed', e instanceof Error ? e.message : String(e)); if (live) setBoard(null) })
    return () => { live = false }
  }, [type, hand, level])

  // What the league has produced at the selected shape (the original results table), and the right-hand panel following the click: a selected spot shows This shape, clearing it goes back to the settings.
  useEffect(() => {
    if (!sel) { setReadout(undefined); return }
    setTab('shape')
    let live = true
    setReadout(undefined)
    const t = setTimeout(() => {
      shapeReadout({ type, hand, level, hb: sel.hb, ivb: sel.ivb, radius, year: effSpan === 'all' ? undefined : effSpan })
        .then(r => { if (live) setReadout(r) })
        .catch(e => { log.error('LeagueHeatMap', 'shapeReadout failed', e instanceof Error ? e.message : String(e)); if (live) setReadout(null) })
    }, 120)
    return () => { live = false; clearTimeout(t) }
  }, [sel?.hb, sel?.ivb, type, hand, level, radius, effSpan])

  // arriving on a pitcher moves the page to him
  useEffect(() => { if (focus) { const t = setTimeout(() => document.getElementById('pitch-shape-focus')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250); return () => clearTimeout(t) } }, [focus])

  // The colour scale: stretched over what this pitch actually does (so a sweeper is not all red), or the fixed league scale.
  const baseDef = rule === 'number' ? numberDef(METRICS[metric]) : METRICS[metric]
  const whiffScaled = useMemo(() => {
    if (!grid || scaleMode === 'fixed') return METRICS.whiff
    const pairs: [number, number][] = []
    for (let yy = 0; yy < N; yy += 4) for (let xx = 0; xx < N; xx += 4) {
      const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
      if (s.swings >= MIN_WINDOW_SWINGS) pairs.push([s.whiffs / s.swings, s.swings])
    }
    return scaledDef(METRICS.whiff, pairs)
  }, [grid, N, r10, scaleMode])
  const cdef: MetricDef = useMemo(() => {
    if (scaleMode === 'fixed' || colour === 'density') return baseDef
    if (latOk && latOk.metric === metric) {
      const pairs: [number, number][] = []
      for (let i = 0; i < latOk.vals.length; i++) { const v = latOk.vals[i]; if (v != null && latOk.counts[i] > 0) pairs.push([v, latOk.counts[i]]) }
      return scaledDef(baseDef, pairs)
    }
    return metric === 'whiff' ? whiffScaled : baseDef
  }, [scaleMode, colour, latOk, metric, baseDef, whiffScaled])
  const scaledOn = scaleMode === 'pitch' && colour !== 'density' && (cdef.lo !== baseDef.lo || cdef.hi !== baseDef.hi)

  useEffect(() => {
    const cv = canvasEl
    if (!cv) return
    if (latOk) {   // a measure built on the server: a lattice of quarter-inch blocks
      paintBlocks(cv, latOk.n, i => { const x = latOk.vals[i]; return x == null ? null : metricRgb(cdef, x) })
      return
    }
    if (needBins || isCell || !grid) return   // the server has not answered yet: leave the last picture up, dimmed
    // full detail: one block per tenth of an inch, each the whiffs per swing (or the pitch count) of the league pitches in the window around it
    const dens = DENSITY_COLORS.map(hexToRgb)
    let maxP = 1
    if (colour === 'density') {
      for (let yy = 0; yy < N; yy += 4) for (let xx = 0; xx < N; xx += 4) {
        const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
        if (s.pitches > maxP) maxP = s.pitches
      }
    }
    paintBlocks(cv, N, i => {
      const s = stats(grid, grid.gx0 + grid.m10 + (i % N), grid.gy0 + grid.m10 + Math.floor(i / N), r10)
      if (colour !== 'density') return s.swings >= MIN_WINDOW_SWINGS ? metricRgb(cdef, s.whiffs / s.swings) : null
      return s.pitches > 0 ? dens[Math.round(Math.max(0, Math.min(1, Math.sqrt(s.pitches / maxP))) * (dens.length - 1))] : null
    })
  }, [canvasEl, grid, latOk, needBins, isCell, colour, r10, N, cdef])

  // how far the filtered whiff map sits from the unfiltered one over the same seasons, measured live over every box with 150+ swings behind it
  const agree = useMemo(() => {
    if (!latOk || latOk.metric !== 'whiff' || !active || !grids) return null
    let n = 0, se = 0
    for (let yy = 0; yy < latOk.n; yy += 2) for (let xx = 0; xx < latOk.n; xx += 2) {
      const f = latOk.vals[yy * latOk.n + xx]
      if (f == null) continue
      const hb = latOk.hb0 - latOk.half + xx * LATTICE_STEP, ivb = latOk.ivb0 - latOk.half + yy * LATTICE_STEP
      const s = stats(grids.all, Math.round(hb * 10), Math.round(ivb * 10), r10)
      if (s.swings < 150) continue
      const d = f - s.whiffs / s.swings; n++; se += d * d
    }
    return n > 20 ? { rmse: Math.sqrt(se / n), n } : null
  }, [latOk, active, grids, r10])

  const multi = !!payload && payload.seasons.length > 1
  const latestLabel = payload ? (payload.pooledLabel ?? String(payload.latest)) : ''
  const allLabel = payload ? (payload.pooledLabel ?? `${payload.seasons[0].season}–${payload.latest}`) : ''
  const spanLabel = effSpan === 'all' ? (needBins && multi && span !== 'all' ? `${allLabel} (the filters and 2-inch measures need every season together)` : allLabel) : String(effSpan)
  const lw0 = grid && grid.swings > 0 ? grid.whiffs / grid.swings : null
  const lc = pitchName.toLowerCase()
  const handText = handWord(hand)
  const waiting = (needBins || isCell) && !latOk
  const cmpR = useLevelsCompared(type, 'R', !(levelsOpen || (ui === 'v3' && v3tab === 'levels')) || hand === 'L')
  const cmpL = useLevelsCompared(type, 'L', !(levelsOpen || (ui === 'v3' && v3tab === 'levels')) || hand === 'R')

  // Every way into a pitcher (a dot, a list row, the leaderboard, the finder) goes through the address, so the page is always built the same way for him, can be shared, and Back returns to the league view.
  function pick(id: number) {
    setPickBusy(id); setPickMsg('')
    const u = new URL(window.location.href)
    u.searchParams.set('pitcher', String(id))
    u.searchParams.delete('view')
    router.push(`${u.pathname}${u.search}`, { scroll: false })
  }
  function clearPitcher() {
    setFz(null); setStory('shape')
    if (focus && typeof window !== 'undefined') { const u = new URL(window.location.href); u.searchParams.delete('pitcher'); router.replace(`${u.pathname}${u.search}`, { scroll: false }) }
  }

  if (payload === null || !grids || !grid) return <Empty>The 0.1-inch league map isn’t built for {lc}s at {levelName} yet. Nothing is estimated in its place.</Empty>

  const fx = (hb: number) => ((hb - (payload.hb0 - HALF)) / (2 * HALF)) * 100
  const fy = (ivb: number) => ((payload.ivb0 + HALF - ivb) / (2 * HALF)) * 100
  const fromEvent = (e: React.MouseEvent<HTMLDivElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    return { hb: payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF }
  }
  const ticks: number[] = [], yticks: number[] = []
  for (let t = Math.ceil(payload.hb0 - HALF); t <= Math.floor(payload.hb0 + HALF); t++) if (t % 5 === 0) ticks.push(t)
  for (let t = Math.ceil(payload.ivb0 - HALF); t <= Math.floor(payload.ivb0 + HALF); t++) if (t % 5 === 0) yticks.push(t)
  const spread = (() => {
    if (!fz || fz.points.length < 5) return null
    const n = fz.points.length
    const sd = (f: (p: [number, number]) => number, m: number) => Math.sqrt(fz.points.reduce((acc, p) => acc + (f(p) - m) ** 2, 0) / n)
    return { hb: sd(p => p[0], fz.row.hb), ivb: sd(p => p[1], fz.row.ivb) }
  })()
  // The pitchers marked on the map, each at his average shape. The default set is the pitchers whose shape has produced runs but whose own results this season were below it, labelled with their ERA: the ones
  // whose numbers look worse than the pitch they throw. The other sets: ERA well above xERA, a strong shape that gets little attention, and the most unusual shapes.
  type MarkRow = { id: number; label: string; name: string; hb: number; ivb: number; note: string }
  const eraOf = (r: BoardRow) => (r.stats?.era != null ? r.stats.era.toFixed(2) : null)
  const markRowsAll: Record<Exclude<MarkSet, 'none'>, MarkRow[]> = (() => {
    const rs = board?.rows ?? []
    const mk = (r: BoardRow): MarkRow => ({ id: r.pitcherId, name: r.name, hb: r.hb, ivb: r.ivb, label: `${surname(r.name)}${eraOf(r) ? ` ${eraOf(r)}` : ''}`,
      note: `${r.name} (${r.teamAbbr}): Shape Score ${r.score ?? '—'}${r.gap != null ? `, results ${Math.abs(r.gap).toFixed(2)} runs per 100 ${r.gap < 0 ? 'below' : 'above'} his shape` : ''}${eraOf(r) ? `, ERA ${eraOf(r)}` : ''}${r.stats?.xera != null ? `, xERA ${r.stats.xera.toFixed(2)}` : ''}${r.owned != null ? `, rostered in ${Math.round(r.owned)}% of ESPN leagues` : ''}` })
    return {
      below: rs.filter(r => r.verdict === 'behind' && r.score != null && r.score >= 67).sort((a2, b2) => (a2.gap ?? 0) - (b2.gap ?? 0)).slice(0, 8).map(mk),
      era: rs.filter(r => r.stats?.era != null && r.stats?.xera != null && r.stats.era - r.stats.xera >= 0.4).sort((a2, b2) => ((b2.stats?.era ?? 0) - (b2.stats?.xera ?? 0)) - ((a2.stats?.era ?? 0) - (a2.stats?.xera ?? 0))).slice(0, 8).map(mk),
      radar: rs.filter(littleAttention).sort((a2, b2) => (b2.score ?? 0) - (a2.score ?? 0)).slice(0, 8).map(mk),
      unusual: (outl?.outliers ?? []).slice(0, 6).map(o => ({ id: o.id, name: o.name, hb: o.hb, ivb: o.ivb, label: surname(o.name), note: `${o.name}: an unusual shape, ride ${o.ivb.toFixed(1)} in, ${Math.abs(o.hb).toFixed(1)} in to the ${side(o.hb)}` })),
    }
  })()
  const markRows: MarkRow[] = markSet === 'none' ? [] : markRowsAll[markSet]
  const labels = placeLabels(markRows.map(o => ({ x: fx(o.hb), y: fy(o.ivb), text: o.label })))

  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', display: 'block', marginBottom: 4 }
  const sel2: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', color: C.ink }
  const preset = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, borderRadius: 6, padding: '4px 10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' })
  const same = (x: [number, number], y: [number, number]) => x[0] === y[0] && x[1] === y[1]
  const halo: React.CSSProperties = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 0.9, strokeLinejoin: 'round', fontWeight: 800, fill: '#1A1A1A' }
  const isHis = !!(fz && hisAvg && sel && sel.hb === hisAvg.hb && sel.ivb === hisAvg.ivb)
  const full = fullAt(probe)

  const lvl = parseLevel(level)
  const lim = limitsFor(lvl)
  const seasonsLabel = effSpan === 'all' ? allLabel : String(effSpan)
  const handsList: ('R' | 'L')[] = hand === 'B' ? ['R', 'L'] : [hand]
  const ro = readout && readout.ok ? readout.readout : null
  const sw = ro ? ro.here.n.swings : 0
  const tabBtn = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' })
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 14 }

  const best = board ? [...board.rows].filter(r => r.shape.saved != null).sort((x, y) => (y.shape.saved ?? 0) - (x.shape.saved ?? 0))[0] ?? null : null
  const explorer = (
      <div className={fz || ui === 'v3' ? 'psl-mg psl-mg2' : 'psl-mg'}>
        {/* ---------- left: the map, a chosen pitcher's note, and the spot under the cursor ---------- */}
        <div className="psl-a-map" style={{ minWidth: 0, maxWidth: 1000 }}>
          <div role="group" aria-label="What the map shows" style={{ marginBottom: 10 }}>
            <span style={k}>Color the map by</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {MAIN_METRICS.map(([m, label]) => {
                const off = active && METRICS[m].source === 'cells'
                return <button key={m} type="button" aria-pressed={colour === m} disabled={off} title={off ? 'Not available with a speed or arm-angle filter' : METRICS[m].label} onClick={() => setColour(m)}
                  style={{ minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1.5px solid ${colour === m ? C.ink : C.line}`, background: colour === m ? C.ink : '#fff', color: colour === m ? C.cream : off ? C.faint : C.ink, fontWeight: 800, fontSize: 13.5, cursor: off ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{label}</button>
              })}
              <select aria-label="More measures" value={MAIN_METRICS.some(([m]) => m === colour) ? '' : colour} onChange={e => { if (e.target.value) setColour(e.target.value as Colour) }}
                style={{ minHeight: 40, padding: '0 10px', borderRadius: 6, border: `1.5px solid ${MAIN_METRICS.some(([m]) => m === colour) ? C.line : C.ink}`, background: '#fff', fontWeight: 800, fontSize: 13.5, fontFamily: 'inherit', color: C.ink }}>
                <option value="">More…</option>
                {METRIC_ORDER.filter(m => !MAIN_METRICS.some(([x]) => x === m)).map(m => { const off = active && METRICS[m].source === 'cells'; return <option key={m} value={m} disabled={off}>{METRICS[m].label}</option> })}
                <option value="density" disabled={active}>How common each shape is (pitch count)</option>
              </select>
            </div>
            <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 6, lineHeight: 1.45 }}>{colour === 'density' ? 'Grey shows how many league pitches move each way; it is a count, not a result.' : `${METRICS[metric].explain} ${rule === 'number' ? 'Red is the higher number, blue the lower.' : 'Red is better for the pitcher, blue is worse.'}`}</div>
            <div role="group" aria-label="Colour scale" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6355' }}>Colour scale:</span>
              {([['pitch', 'Stretched to this pitch'], ['fixed', 'Fixed league scale']] as ['pitch' | 'fixed', string][]).map(([k2, l]) => <button key={k2} type="button" aria-pressed={scaleMode === k2} onClick={() => setScaleMode(k2)} style={{ minHeight: 34, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${scaleMode === k2 ? C.ink : C.line}`, background: scaleMode === k2 ? C.ink : '#fff', color: scaleMode === k2 ? C.cream : C.ink, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
              <span style={{ fontSize: 12, color: '#5b5347' }}>{scaledOn ? `Blue to red now spans ${cdef.fmt(cdef.lo)} to ${cdef.fmt(cdef.hi)} for this pitch.` : scaleMode === 'pitch' ? 'This pitch already spans the full scale.' : 'Same numbers on every pitch, so pitches can be compared.'}</span>
            </div>
            <div role="group" aria-label="What red means" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6355' }}>Red means:</span>
              {([['number', 'The higher number'], ['pitcher', 'Better for the pitcher']] as ['number' | 'pitcher', string][]).map(([k2, l]) => <button key={k2} type="button" aria-pressed={rule === k2} onClick={() => setRule(k2)} style={{ minHeight: 34, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${rule === k2 ? C.ink : C.line}`, background: rule === k2 ? C.ink : '#fff', color: rule === k2 ? C.cream : C.ink, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
              <span style={{ fontSize: 12, color: '#5b5347' }}>{rule === 'number' ? 'For wOBA, average and slugging, red is where hitters did more damage.' : 'For wOBA, average and slugging, red is where hitters did less damage.'}</span>
            </div>
          </div>
          <div role="status" style={{ fontSize: 12.5, color: '#3d382f', lineHeight: 1.45, marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, background: C.soft, borderRadius: 6, padding: '3px 10px' }}>Showing {handText} {lc}s · {levelName} · {spanLabel}</span>
            {colourNote && <span style={{ color: '#A8391F', fontWeight: 700 }}>{colourNote}</span>}
            {!colourNote && needBins && multi && span !== 'all' && <span style={{ color: '#A8391F', fontWeight: 700 }}>This view needs every season together, so it is not showing {span} alone.</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '46px minmax(0,1fr)', gridTemplateRows: 'auto 32px' }}>
            <div style={{ position: 'relative' }}>
              {yticks.map(t => <span key={t} style={{ position: 'absolute', right: 6, top: `${fy(t)}%`, transform: 'translateY(-50%)', fontSize: 14, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{t}<i aria-hidden style={{ position: 'absolute', right: -6, top: '50%', width: 6, height: 2, background: C.ink, opacity: 0.55 }} /></span>)}
            </div>
            <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', opacity: waiting && busy ? 0.6 : 1, transition: 'opacity .15s' }}
              tabIndex={0} aria-label="League movement map. Use the arrow keys to move the selected spot, and Escape to clear it."
              onKeyDown={e => {
                const d: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }
                if (e.key === 'Escape') { setSel(null); return }
                const m = d[e.key]
                if (!m) return
                e.preventDefault()
                const from = sel ?? snap(avg)
                setSel(snap({ hb: from.hb + m[0], ivb: from.ivb + m[1] }))
              }}
              onMouseMove={e => setHover(snap(fromEvent(e)))}
              onMouseLeave={() => setHover(null)}
              onClick={e => setSel(snap(fromEvent(e)))}>
              <canvas ref={setCanvasEl} role="img" aria-label={`League ${lc} movement map at ${levelName}: each box is a way a pitch moves (ride up, arm-side movement right, glove-side movement left), coloured by ${colour === 'density' ? 'how many pitches move that way' : mdef.short}. It is not the strike zone. Click a spot to see the results there and the pitchers who throw that shape.`}
                style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {fx(0) > 0 && fx(0) < 100 && <line x1={fx(0)} x2={fx(0)} y1="0" y2="100" stroke="#1A1A1A" strokeOpacity=".35" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                {hover && <>
                  <line x1={fx(hover.hb)} x2={fx(hover.hb)} y1="0" y2="100" stroke="#fff" strokeOpacity=".7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <line y1={fy(hover.ivb)} y2={fy(hover.ivb)} x1="0" x2="100" stroke="#fff" strokeOpacity=".7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </>}
                {marks && outl && <>
                  {/* the average shape, in a box */}
                  <rect x={fx(outl.mean.hb - 1)} y={fy(outl.mean.ivb + 1)} width={(2 / (2 * HALF)) * 100} height={(2 / (2 * HALF)) * 100} fill="#fff" fillOpacity=".3" stroke="#1A1A1A" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
                  <text x={fx(outl.mean.hb)} y={fy(outl.mean.ivb + 1) - 1.2} textAnchor="middle" fontSize="2.4" style={halo}>Average {lc}</text>
                  {/* the marked pitchers: click one to open his story */}
                  {markRows.map((o, i) => (
                    <g key={o.id} role="button" tabIndex={0} aria-label={`Open ${o.name}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(o.id) } }} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); pick(o.id) }} onMouseMove={e => e.stopPropagation()}>
                      <title>{o.note}. Click to open his story.</title>
                      <circle cx={fx(o.hb)} cy={fy(o.ivb)} r="1.9" fill="transparent" />
                      <circle cx={fx(o.hb)} cy={fy(o.ivb)} r="1.05" fill={pickBusy === o.id ? '#FDE047' : '#FF5722'} stroke="#1A1A1A" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                      <text x={labels[i].x} y={labels[i].y} textAnchor={labels[i].anchor} fontSize="2.3" style={halo}>{o.label}</text>
                    </g>
                  ))}
                </>}
                {fz && <>
                  {spread && <ellipse cx={fx(fz.row.hb)} cy={fy(fz.row.ivb)} rx={(spread.hb / (2 * HALF)) * 100} ry={(spread.ivb / (2 * HALF)) * 100} fill="#fff" fillOpacity=".12" stroke="#1A1A1A" strokeWidth="2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />}
                  {fz.points.map((p, i) => <circle key={i} cx={fx(p[0])} cy={fy(p[1])} r="0.6" fill="#fff" stroke="#1A1A1A" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
                  <line x1={fx(fz.row.hb) - 1.6} x2={fx(fz.row.hb) + 1.6} y1={fy(fz.row.ivb)} y2={fy(fz.row.ivb)} stroke="#FF5722" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                  <line y1={fy(fz.row.ivb) - 1.6} y2={fy(fz.row.ivb) + 1.6} x1={fx(fz.row.hb)} x2={fx(fz.row.hb)} stroke="#FF5722" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                  <text x={fx(fz.row.hb)} y={Math.max(4, fy(fz.row.ivb + (spread?.ivb ?? 1) + 0.6)) - 0.5} textAnchor="middle" fontSize="2.6" style={halo}>{fz.name}</text>
                </>}
                {sel && <>
                  <rect x={fx(sel.hb - windowIn)} y={fy(sel.ivb + windowIn)} width={(2 * windowIn / (2 * HALF)) * 100} height={(2 * windowIn / (2 * HALF)) * 100} fill="#fff" fillOpacity=".15" stroke="#1A1A1A" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  <circle cx={fx(sel.hb)} cy={fy(sel.ivb)} r="1.1" fill="#FDE047" stroke="#1A1A1A" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </>}
              </svg>
            </div>
            <div />
            <div style={{ position: 'relative' }}>
              {ticks.map(t => <span key={t} style={{ position: 'absolute', left: `${fx(t)}%`, transform: 'translateX(-50%)', top: 6, fontSize: 14, fontWeight: 800, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{t === 0 ? '0' : t > 0 ? `+${t}` : `−${Math.abs(t)}`}<i aria-hidden style={{ position: 'absolute', left: '50%', top: -6, width: 2, height: 6, background: C.ink, opacity: 0.55 }} /></span>)}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, letterSpacing: '.04em', fontWeight: 800, color: C.ink, margin: '2px 0 0', paddingLeft: 46 }}><span>← Glove side</span><span>Sideways movement (in)</span><span>Arm side →</span></div>
          <div style={{ fontSize: 12.5, letterSpacing: '.04em', fontWeight: 800, color: C.ink, margin: '2px 0 0', paddingLeft: 46 }}>↑ Up is more ride (inches of induced vertical break). Right is toward the pitcher’s arm side. Left-handers are flipped to match.</div>
          <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center' }}>
            <span>{sel ? <>Selected: ride {sel.ivb.toFixed(1)} in, {Math.abs(sel.hb).toFixed(1)} in to the {side(sel.hb)}. <button type="button" onClick={() => setSel(null)} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear</button>{ui === 'v3' && <> · <button type="button" onClick={() => setV3tab('players')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>See the pitchers here →</button> · <button type="button" onClick={() => setV3tab('average')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>League average for this shape →</button></>}</> : 'Click the map to choose a shape, or click a pitcher’s dot to open his full read.'}</span>
          </div>
          <div role="group" aria-label="Pitchers marked on the map" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Mark pitchers on the map</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([['below', 'Strong shape, results below it'], ['era', 'ERA above xERA'], ['radar', 'Strong shape, little attention'], ['unusual', 'Unusual shapes'], ['none', 'None']] as [MarkSet, string][]).map(([k2, l]) => (
                <button key={k2} type="button" aria-pressed={markSet === k2} onClick={() => setMarkSet(k2)} style={{ minHeight: 38, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${markSet === k2 ? C.ink : C.line}`, background: markSet === k2 ? C.ink : '#fff', color: markSet === k2 ? C.cream : C.ink, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{l}{k2 !== 'none' && board ? ` (${markRowsAll[k2].length})` : ''}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.5, marginTop: 6 }}>
              {markSet === 'below' ? <>Marked at their average shape and labelled with this season’s ERA: pitchers whose shape has produced runs (Shape Score 67+) but whose own results were more than 0.4 runs per 100 below it. These are the pitches whose numbers look worse than the shape they throw. Click a name to open his story.</>
                : markSet === 'era' ? <>Pitchers whose ERA is at least 0.4 runs above their xERA, labelled with ERA: the results were worse than the quality of contact allowed would usually give.</>
                : markSet === 'radar' ? <>Shape Score 67+, rostered in under 30% of ESPN leagues, no All-Star or major award, labelled with ERA.</>
                : markSet === 'unusual' ? <>The pitchers whose average shape is two or more standard deviations from the league average shape.</>
                : 'No pitchers marked.'}
              {markSet !== 'none' && markSet !== 'unusual' && board && markRowsAll[markSet].length === 0 ? ' No pitcher fits this set right now, so none are marked.' : ''}
              {markSet !== 'unusual' && markSet !== 'none' ? ' This describes the season so far; it is not a forecast.' : ''}
            </div>
          </div>
          {pickMsg && <div style={{ fontSize: 12.5, color: '#A8391F', marginTop: 6 }}>{pickMsg}</div>}

          {fz && (
            <div id="pitch-shape-card" style={{ background: '#fff', border: `1px solid ${C.line}`, borderTop: `4px solid ${C.orange}`, borderRadius: 6, padding: '10px 14px', marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: '#3d382f', scrollMarginTop: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span><b style={{ fontSize: 16 }}>{fz.name}</b> <span style={{ color: C.mute }}>{fz.team} · {fz.hand === 'R' ? 'right' : 'left'}-handed · {fz.season} at {levelName}</span></span>
                <span style={{ display: 'flex', gap: 12, fontWeight: 800 }}>
                  <button type="button" onClick={() => { setStory('why'); setTimeout(() => document.getElementById('pitch-shape-focus')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }} style={{ border: `1.5px solid ${C.ink}`, background: '#fff', color: C.ink, borderRadius: 6, padding: '4px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Why the results →</button>
                  <button type="button" onClick={clearPitcher} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear pitcher</button>
                </span>
              </div>
              <b>What the map is showing.</b> The colours are every league {lc}. The <b>white dots</b> are a sample of up to 60 of {fz.name}’s {lc}s, the <b>orange cross</b> is his average and the <b>dashed ring</b> shows his usual range: about two in three of his pitches land inside it. A tight clump means he repeats the pitch. The selected spot sits on his average shape; the panel on the right lists the pitchers who throw the same shape.
            </div>
          )}

          {fz && ui === 'v2' && <ShapeDial name={fz.name} pitcherId={fz.id} board={board} avg={snap({ hb: fz.row.hb, ivb: fz.row.ivb })} target={sel} onTarget={p => setSel(snap(p))} type={type} hand={fz.hand} level={level} radius={radius} year={effSpan === 'all' ? undefined : effSpan} lc={lc} />}

          <HoverPanel label={hover ? 'Under the cursor' : sel ? (isHis ? `${fz?.name}’s average ${lc}` : 'Selected spot') : 'League average shape'} probe={probe} here={here} full={full} spot={spot} busy={spotBusy} colour={colour} metric={metric}
            scaleDef={cdef} filterOn={active} lc={lc} handText={handText} levelName={levelName} spanLabel={spanLabel} windowIn={windowIn} showFull={(active || !!lat) && colour === 'whiff'} league={latOk ? latOk.league ?? null : colour === 'whiff' ? lw0 : null} />
        </div>

        {/* ---------- middle: league context (wide screens; under the map otherwise) ---------- */}
        {!fz && ui === 'v2' && (
        <div className="psl-a-mid" style={{ minWidth: 0 }}>
          <Standouts board={board} outl={outl} lc={lc} levelName={levelName} selectedId={null} pickBusy={pickBusy} onPick={id => pick(id)} />
        </div>
        )}

        {/* ---------- right: colour and key, then the tabs the finder always had ---------- */}
        <div className="psl-a-side" style={{ minWidth: 0 }}>
          {multi && payload && (
            <label style={{ display: 'block', marginBottom: 10 }}><span style={k}>Season</span>
              <select style={sel2} value={effSpan} onChange={e => setSpan(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                {[...payload.seasons].sort((x, y) => y.season - x.season).map(se => <option key={se.season} value={se.season} disabled={needBins}>{se.season}{se.season === payload.latest ? ' (current)' : ''}{needBins ? ' (not with this view)' : ''}</option>)}
                <option value="all">All seasons ({allLabel})</option>
              </select>
              {needBins && <span style={{ display: 'block', fontSize: 12, color: '#5b5347', marginTop: 4, lineHeight: 1.4 }}>Speed and arm-angle filters, and the called-strike, hard-hit, ground-ball and contact measures, are built from every season together. Switch to whiffs, wOBA or runs with the filters off to look at one year.</span>}
            </label>
          )}
          {colour !== 'density' ? <HeatLegend metric={metric} def={cdef} scaled={scaledOn} rule={rule} compact /> : (
            <div style={{ fontSize: 12, color: '#5b5347' }}>
              <div style={{ fontWeight: 800, color: C.ink, marginBottom: 6 }}>How common this shape is</div>
              <div style={{ display: 'flex' }}>{DENSITY_COLORS.map(c => <span key={c} style={{ width: 34, height: 18, background: c }} />)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, maxWidth: 34 * DENSITY_COLORS.length }}><span>← fewer</span><span>more pitches →</span></div>
              <div style={{ marginTop: 5 }}>Darker means more league pitches of this type move this way. This is a count, not a result, so it uses grey instead of the red-blue scale.</div>
            </div>
          )}
          {active && agree && (
            <div style={{ fontSize: 12, color: '#5b5347', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '6px 10px', marginTop: 8, lineHeight: 1.45 }}>
              <b style={{ color: C.ink }}>Filtered against unfiltered:</b> over {agree.n.toLocaleString('en-US')} boxes with 150+ swings the two maps (same seasons) differ by <b style={{ color: C.ink }}>{(agree.rmse * 100).toFixed(1)} points</b> on average. That is the smoothing, not different data.
            </div>
          )}

          <div role="tablist" aria-label="Side panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '14px 0 10px' }}>
            <button role="tab" aria-selected={tab === 'shape'} type="button" onClick={() => setTab('shape')} style={tabBtn(tab === 'shape')}>This shape</button>
            <button role="tab" aria-selected={tab === 'find'} type="button" onClick={() => setTab('find')} style={tabBtn(tab === 'find')}>Find pitchers by results</button>
            <button role="tab" aria-selected={tab === 'settings'} type="button" onClick={() => setTab('settings')} style={tabBtn(tab === 'settings')}>Advanced filters{active ? ' (on)' : ''}</button>
          </div>

          {tab === 'shape' && (sel ? (
            <>
              <div style={card}>
                {ro ? <ResultsReadout flush level={lvl} here={ro.here} league={ro.league} saved={ro.saved} score={ro.score} lc={lc} radius={radius} spanLabel={seasonsLabel} />
                  : <div style={{ fontSize: 13, color: '#5b5347' }}>{readout === undefined ? 'Loading what this shape has produced…' : readout && !readout.ok ? 'The results for this pitch type are part of Pro.' : 'What these shapes have produced isn’t built for this pitch yet; it fills after the weekly shape-results job runs.'}</div>}
                {ro && ro.here.whiff == null && <p style={{ fontSize: 13, color: '#5b5347', margin: '10px 0 0' }}>{lim.gated ? <>Fewer than {lim.windowSwings} swings in this window, so no rate is shown.</> : <>No swing at league {lc}s that move like this has been recorded, so no rate is shown.</>} Click a colored box instead.</p>}
                {ro && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: '#5b5347' }}>
                    <span style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: sw >= lim.spotSwings ? '#FFE4D6' : C.soft, color: sw >= lim.spotSwings ? '#B83A0E' : C.ink }}>{sw >= lim.spotSwings ? `STRONG SAMPLE · ${lim.spotSwings}+ SWINGS` : sw >= lim.strongSwings ? `MODERATE SAMPLE · ${lim.strongSwings}–${lim.spotSwings - 1} SWINGS` : `THIN SAMPLE · UNDER ${lim.strongSwings} SWINGS`}</span>
                    <span>{sw.toLocaleString('en-US')} swings within ±{radius} in of this movement</span>
                  </div>
                )}
              </div>
              <ShapePlayersPanel level={lvl} board={board} hb={sel.hb} ivb={sel.ivb} radius={radius} lc={lc} selectedId={fz?.id ?? null} overall={null} shapeAt={null} bins={null} diagnosis={undefined} pitchType={type} season={payload.latest} exportMap={null}
                onSelect={id => { if (id != null) pick(id) }} onOpen={id => router.push(`/mlb/lab/pitching-lab/${id}`)} headshot={id => headshotCutoutUrl(id, 240)} />
            </>
          ) : (
            <div style={{ ...card, fontSize: 14, color: '#3d382f', lineHeight: 1.55 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', marginBottom: 6 }}>Start here</div>
              <b style={{ fontSize: 17 }}>Click any box on the map.</b>
              <p style={{ margin: '6px 0 10px', color: '#5b5347' }}>Each box is one way a {lc} can move. Click one to see how often hitters missed pitches like it, what hitters did against them compared with the league average, and who throws them. Or try one of these:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {outl && <button type="button" style={{ border: `1px solid ${C.ink}`, background: '#fff', color: C.ink, borderRadius: 6, minHeight: 40, padding: '0 14px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setSel(snap(outl.mean))}>The average {lc}</button>}
                {best && <button type="button" style={{ border: `1px solid ${C.ink}`, background: '#fff', color: C.ink, borderRadius: 6, minHeight: 40, padding: '0 14px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setSel(snap({ hb: best.hb, ivb: best.ivb }))}>The shape with the best results</button>}
                {outl && outl.outliers[0] && <button type="button" style={{ border: `1px solid ${C.ink}`, background: '#fff', color: C.ink, borderRadius: 6, minHeight: 40, padding: '0 14px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setSel(snap({ hb: outl.outliers[0].hb, ivb: outl.outliers[0].ivb }))}>The most unusual shape</button>}
                <button type="button" style={{ border: `1px solid ${C.ink}`, background: '#fff', color: C.ink, borderRadius: 6, minHeight: 40, padding: '0 14px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setTab('find')}>Find pitchers by results</button>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#6b6355' }}>To look up a pitcher by name, use the Find a pitcher box in the Filters panel on the right.</p>
            </div>
          ))}

          {tab === 'find' && <FindPitcher board={board} lc={lc} hand={hand} team="" onMatches={() => {}} headshot={id => headshotCutoutUrl(id, 240)} onPick={r => pick(r.pitcherId)} />}

          {tab === 'settings' && (
            <div>
              {summary && summary.vHi > summary.vLo && (
                <div style={{ display: 'grid', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>
                  <div>
                    <RangeSlider label="Pitch speed" unit="mph" min={summary.vLo} max={summary.vHi} value={v} onChange={setV} hist={summary.veloHist} ariaFrom="Slowest pitch speed to include, in miles per hour" ariaTo="Fastest pitch speed to include, in miles per hour" />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <button type="button" style={preset(same(v, [summary.vLo, summary.q25]))} onClick={() => setV([summary.vLo, summary.q25])}>Slowest quarter</button>
                      <button type="button" style={preset(same(v, [summary.q25, summary.q75]))} onClick={() => setV([summary.q25, summary.q75])}>Middle half</button>
                      <button type="button" style={preset(same(v, [summary.q75, summary.vHi]))} onClick={() => setV([summary.q75, summary.vHi])}>Fastest quarter</button>
                      <button type="button" style={preset(!vActive)} onClick={() => setV(vFull)}>All speeds</button>
                    </div>
                  </div>
                  {summary.hasArm ? (
                    <div>
                      <RangeSlider label="Arm angle" unit="°" min={0} max={100} step={10} value={a} onChange={setA} hist={summary.slotHist} bandWidth={10} ariaFrom="Lowest arm angle to include, in degrees" ariaTo="Highest arm angle to include, in degrees" />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <button type="button" style={preset(same(a, [0, 40]))} onClick={() => setA([0, 40])}>Lower arm angle (under 40°)</button>
                        <button type="button" style={preset(same(a, [40, 60]))} onClick={() => setA([40, 60])}>Middle arm angle (40–60°)</button>
                        <button type="button" style={preset(same(a, [60, 100]))} onClick={() => setA([60, 100])}>Higher arm angle (60°+)</button>
                        <button type="button" style={preset(!aActive)} onClick={() => setA([0, 100])}>All arm angles</button>
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 12.5, color: C.mute }}>Arm angle is not tracked at {levelName}, so only the speed filter is offered.</div>}
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#5b5347' }}>
                    <b style={{ color: C.ink }}>What the filters change.</b> The map shows only league {lc}s thrown in the speed and arm-angle range you choose, so you can see where slower pitchers (or lower arm slots) actually land and how often hitters miss them. Arm angle is how high the arm is at release: low is closer to sidearm, high is closer to straight overhead. {active
                      ? <>With a filter on, the map is built from 2-inch groups of pitches, so it is coarser than the full-detail map{level === 'mlb' ? ', and uses all seasons from 2024 to 2026' : ''}. Only the measures the 2-inch groups carry (whiffs, called strikes + whiffs, hard-hit, ground-ball rate and xwOBA on contact) can be coloured while a filter is on.</>
                      : 'With no filter the map is the full-detail one, on the same seasons.'}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                <div>
                  <label><span style={k}>Comparison window</span>
                    <select style={sel2} value={radius} onChange={e => setRadius(Number(e.target.value) as (typeof RADII)[number])}>
                      {RADII.map(r => <option key={r} value={r}>±{r} in around each box</option>)}
                    </select></label>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#5b5347', marginTop: 8 }}>
                    <b style={{ color: C.ink }}>What this changes.</b> Each box on the map is one tenth of an inch, and a single box holds about one pitch, far too few to judge. So each box shows the miss rate of <i>all</i> league pitches within ±{radius} in of it, a square {radius * 2} in wide, and the colour is that group’s rate. The pitches themselves never change; only how far around each box we look.
                    <div style={{ marginTop: 6 }}>{WINDOW_NOTE[radius]}</div>
                    {(active || lat) && <div style={{ marginTop: 6 }}>For the measures built from 2-inch groups the smoothing is a little wider (about ±{(sigmaFor(radius) * 1.7).toFixed(1)} in), because the groups are 2 inches wide.</div>}
                    <div style={{ marginTop: 4, color: C.mute }}>A box needs at least {active ? MIN_SWINGS_IN_REACH : MIN_WINDOW_SWINGS} swings to be coloured for whiffs; other measures have their own minimum, shown beside the colour key.</div>
                  </div>
                </div>

              </div>
              {!active && <div style={{ fontSize: 12, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>
                All {handText} {lc}s at {levelName}, {spanLabel}: {grid.swings.toLocaleString('en-US')} swings{lw0 != null ? `, ${(lw0 * 100).toFixed(1)}% missed on average` : ''}.
              </div>}
            </div>
          )}
        </div>
      </div>
  )
  const avgPt = fz ? { hb: fz.row.hb, ivb: fz.row.ivb } : null
  const hrow = fz && board ? board.rows.find(r => r.pitcherId === fz.id) ?? null : null
  const hShape = hrow ? hrow.shape.whiff ?? hrow.shapeRaw.whiff ?? null : null, hOwn = hrow ? hrow.own.whiff ?? hrow.ownRaw.whiff ?? null : null
  const hGap = hShape != null && hOwn != null ? (hOwn - hShape) * 100 : null
  const headline = fz ? (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderLeft: `5px solid ${C.orange}`, borderRadius: 6, padding: '12px 16px', margin: '0 0 12px', fontSize: 15, lineHeight: 1.55, color: '#3d382f' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', marginBottom: 2 }}>The story so far</div>
      <b style={{ color: C.ink }}>{fz.name}’s {lc}</b> averages <b>{fz.row.ivb.toFixed(1)} inches</b> of ride and <b>{Math.abs(fz.row.hb).toFixed(1)} inches</b> of run toward his {fz.row.hb >= 0 ? 'arm' : 'glove'} side, at <b>{fz.row.velo.toFixed(1)} mph</b>.
      {hShape != null && hOwn != null && hGap != null ? <> Across the league ({allLabel}), league pitches with that shape got whiffs on <b>{(hShape * 100).toFixed(1)}%</b> of swings; his own ({board?.season ?? fz.season}) got <b>{(hOwn * 100).toFixed(1)}%</b>, <b style={{ color: Math.abs(hGap) < 1 ? C.ink : hGap > 0 ? '#13694F' : '#A8391F' }}>{Math.abs(hGap) < 1 ? 'in line with' : `${Math.abs(hGap).toFixed(1)} points ${hGap > 0 ? 'above' : 'below'}`}</b> the shape.</> : board === undefined ? ' Reading how it compares…' : ' There are too few swings to compare his own results with the shape.'}
      {' '}The tabs below walk through where it sits, who else throws it, what has changed and why the results are what they are.
    </div>
  ) : null
  const storyTabs: StoryTab[] = !fz || !avgPt ? [] : [
    { id: 'shape', label: 'His shape', question: `Where does ${fz.name}’s ${lc} rank among every other ${lc}, and how repeatable is it?`, node: explorer },
    { id: 'who', label: 'Who else throws it', question: `Who else throws a ${lc} shaped like ${fz.name}’s, and how are they doing?`, node: (
      <div className="psl-who" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(300px,.5fr)', gap: 24, alignItems: 'start' }}>
        <style>{'@media(max-width:1000px){.psl-who{grid-template-columns:1fr !important}}'}</style>
        <ShapePlayersPanel level={lvl} board={board} hb={avgPt.hb} ivb={avgPt.ivb} radius={radius} lc={lc} selectedId={fz.id} overall={null} shapeAt={null} bins={null} diagnosis={undefined} pitchType={type} season={payload.latest} exportMap={null}
          onSelect={id => { if (id != null && id !== fz.id) pick(id) }} onOpen={id => router.push(`/mlb/lab/pitching-lab/${id}`)} headshot={id => headshotCutoutUrl(id, 240)} />
        <Standouts board={board} outl={outl} lc={lc} levelName={levelName} selectedId={fz.id} pickBusy={pickBusy} onPick={id => pick(id)} />
      </div>) },
    { id: 'changed', label: 'What changed', question: `What has changed in ${fz.name}’s ${lc} across the seasons we hold, and was it a step in one season or a slow drift?`, node: (
      <div style={{ display: 'grid', gap: 22 }}>
        <div><h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800 }}>Season by season</h3><PitcherYears id={fz.id} type={fz.type} level={level} lc={lc} name={fz.name} /></div>
        {level === 'mlb' && <div><h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800 }}>Within {fz.season}, month by month</h3><PitcherSeasonChanges pitcherId={fz.id} season={fz.season} pitchType={fz.type} pitchName={pitchName} /></div>}
        <div><h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 800 }}>At each level he has thrown at</h3><PitcherShapeLevels pitcherId={fz.id} initialType={fz.type} /></div>
      </div>) },
    { id: 'why', label: 'Why the results', question: `Why does he get these results? Where does his average shape land, and what is the rest of the story?`, node: (
      <div style={{ display: 'grid', gap: 18 }}>
        <WhereHeLands avg={avgPt} board={board} id={fz.id} type={fz.type} hand={fz.hand} level={level} lvl={lvl} lc={lc} name={fz.name} seasonsLabel={allLabel} ownSeason={board?.season ?? fz.season} />
        <PitcherDetailView key={`${fz.id}|${fz.type}`} id={fz.id} type={fz.type} hand={fz.hand} level={level} pitchName={pitchName} onClose={() => setStory('shape')} />
      </div>) },
  ]

  const v2Page = (
    <div id="pitch-shape-focus" style={{ scrollMarginTop: 12 }}>
      <style>{`.psl-mg{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(400px,.9fr);grid-template-areas:"map side" "mid side";gap:24px 28px;align-items:start}.psl-a-map{grid-area:map}.psl-a-mid{grid-area:mid}.psl-a-side{grid-area:side}.psl-notes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}@media(min-width:1500px){.psl-mg{grid-template-columns:minmax(0,1.15fr) minmax(300px,.6fr) minmax(400px,.85fr);grid-template-areas:"map mid side"}}@media(min-width:1001px){.psl-mg2{grid-template-columns:minmax(0,1.1fr) minmax(400px,.9fr) !important;grid-template-areas:"map side" !important}}@media(max-width:1000px){.psl-mg{grid-template-columns:minmax(0,1fr);grid-template-areas:"map" "side" "mid"}.psl-notes{grid-template-columns:1fr}}`}</style>
      {fz ? <PitcherStory name={fz.name} headline={headline} tabs={storyTabs} tab={story} onTab={setStory} /> : explorer}

      <details onToggle={e => setLevelsOpen((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 16, minHeight: 32 }}>Across levels: how {lc}s compare at MLB, Triple-A and the Florida State League, and the same pitchers at two levels</summary>
        {levelsOpen && handsList.map(h => <LevelsCompared key={h} data={h === 'R' ? cmpR : cmpL} active={lvl} type={type} hand={h} pitchName={pitchName} place={sel} radius={radius} />)}
      </details>
      <section id="pitch-shape-board" style={{ marginTop: 26, borderTop: `3px solid ${C.ink}`, paddingTop: 14 }} aria-label="Leaderboard">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Leaderboard: every {handText} {lc} at {levelName}</h2>
        <div style={{ height: 8 }} />
        <ShapeScoreBoard board={board} lc={lc} hand={hand} onShow={id => pick(id)} />
      </section>

      <div className="psl-notes" style={{ borderTop: `1px solid ${C.line}`, marginTop: 18, paddingTop: 14, fontSize: 13.5, lineHeight: 1.55, color: '#5b5347' }}>
        <div><b style={{ color: C.ink }}>What a square means.</b> Every league {lc} within ±{radius} inch of that square’s movement: of the swings at them, the share that missed. It is a movement shape, not a place in the zone.</div>
        <div><b style={{ color: C.ink }}>What it can’t tell you.</b> Command, deception and sequencing aren’t in the map. It describes what pitches like this have done; it doesn’t predict.</div>
        <div><b style={{ color: C.ink }}>Why some squares are blank.</b> Under {MIN_WINDOW_SWINGS} swings is too few to trust, so we leave it empty rather than guess.</div>
      </div>
      <Foot>
        {handText} {lc}s at {levelName}, {spanLabel}. {multi ? `${latestLabel} only is the latest season on its own: about a third of the data, so each box rests on fewer swings; ${allLabel} adds earlier seasons for a bigger sample. ` : ''}Sideways movement is arm side to the right and glove side to the left (left-handers flipped).
        wOBA, xwOBA, runs saved, average and slugging come from the league outcomes of the pitches that ended each plate appearance; called strikes + whiffs, hard-hit rate, ground-ball rate and xwOBA on contact from 2-inch groups. The boxed average is every pitcher&apos;s average {lc}, weighted by how many he throws; outliers are the pitchers whose average is two or more standard deviations away. Source: Baseball Savant pitch data{level === 'mlb' ? '' : ', minor-league tracking'}. Describes what happened; it is not a forecast.
      </Foot>
    </div>
  )

  // ---- v3: the story as tabs ----
  const win = windowIn
  const selReadout = ro
  const average = !sel ? (
    <div style={{ ...card, fontSize: 14, color: '#3d382f', lineHeight: 1.55 }}><b>Click the map first.</b> Choose a spot in the Map tab and this tab shows what league pitches in that exact area have produced, with how many pitches and swings are behind it.</div>
  ) : (
    <div>
      <div role="group" aria-label="Window" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6355' }}>Window around the spot:</span>
        {RADII.map(r => <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1.5px solid ${radius === r ? C.ink : C.line}`, background: radius === r ? C.ink : '#fff', color: radius === r ? C.cream : C.ink, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>±{r} in</button>)}
        <span style={{ fontSize: 12.5, color: '#5b5347' }}>{radius <= 0.5 ? 'Narrow: the most detail, fewer pitches.' : radius >= 2 ? 'Wide: the steadiest, blends nearby shapes.' : 'Default: balances detail and steadiness.'}</span>
      </div>
      <div className="psl-la" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 28, alignItems: 'start', margin: '0 0 6px' }}>
        <style>{'@media(max-width:1000px){.psl-la{grid-template-columns:1fr !important}}'}</style>
        <div style={{ minWidth: 0 }}>
      <div style={card}>
        {selReadout ? <ResultsReadout flush level={lvl} here={selReadout.here} league={selReadout.league} saved={selReadout.saved} score={selReadout.score} lc={lc} radius={radius} spanLabel={seasonsLabel} />
          : <div style={{ fontSize: 13, color: '#5b5347' }}>{readout === undefined ? 'Reading what this shape has produced…' : 'What pitches with this shape have produced isn’t built for this pitch yet. Nothing is estimated in its place.'}</div>}
        {selReadout && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: '#5b5347' }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: sw >= lim.spotSwings ? '#FFE4D6' : C.soft, color: sw >= lim.spotSwings ? '#B83A0E' : C.ink }}>{sw >= lim.spotSwings ? `STRONG SAMPLE · ${lim.spotSwings}+ SWINGS` : sw >= lim.strongSwings ? `MODERATE SAMPLE · ${lim.strongSwings}–${lim.spotSwings - 1} SWINGS` : `THIN SAMPLE · UNDER ${lim.strongSwings} SWINGS`}</span>
            <span>{selReadout.here.pitches.toLocaleString('en-US')} pitches and {sw.toLocaleString('en-US')} swings within ±{radius} in of this spot ({seasonsLabel}){spot && spot.ok ? `; ${spot.spot.averaging} ${spot.spot.averaging === 1 ? 'pitcher averages' : 'pitchers average'} this shape` : ''}</span>
          </div>
        )}
      </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>Where do pitches with this shape cross the plate?</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>The league {lc}s inside the window, seen from the batter’s side, with the strike zone outlined. The map shows how a pitch moves; this shows where those pitches ended up.</p>
          <LocationPanel pitchType={type} hand={hand === 'L' ? 'L' : 'R'} probe={sel} radius={radius} span="all" scope="league" pitchName={pitchName} explainHeight />
          {hand === 'B' && <p style={{ fontSize: 12, color: '#6b6355' }}>Where a pitch crosses the plate is seen from behind it, so it differs for left- and right-handers. This view shows right-handed pitches; choose Left to see left-handed ones.</p>}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '0 0 6px' }}>League {lc}s only; every pitch whose ride and run fall inside the square window counts once. Results are pooled over speed and arm angle. A measure shows only above its minimum sample, and a blank is left blank rather than estimated.</p>
    </div>
  )
  const hisShape = fz && avgPt ? (
    <div>
      <div className="psl-hs" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 28, alignItems: 'start' }}>
        <style>{'@media(max-width:1000px){.psl-hs{grid-template-columns:1fr !important}}'}</style>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>Where does it land on the movement map?</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>How the pitch moves, set against every league {lc}.</p>
          <ShapeMap label={`${fz.name}'s ${lc}s on the league movement map: his sampled pitches, his average and the league average. Ride up, run toward the arm side.`} minRange={10} heat={yearGrid ? { grid: yearGrid, r10, def: whiffScaled } : null}
            dots={fz.points.map(pt => ({ hb: pt[0], ivb: pt[1], color: C.ink, opacity: 0.45 }))}
            rings={[{ hb: avgPt.hb, ivb: avgPt.ivb, color: C.orange, label: 'His average', strong: true }, ...(outl ? [{ hb: outl.mean.hb, ivb: outl.mean.ivb, color: '#2F6DB5', label: 'League average', dashed: true }] : [])]}
            box={{ hb: avgPt.hb, ivb: avgPt.ivb, rx: 1, ry: 1 }} />
          <div style={{ marginTop: 6 }}><HeatLegend metric="whiff" def={whiffScaled} scaled={whiffScaled !== METRICS.whiff} compact /></div>
          <div style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.55, marginTop: 6 }}>
            <b style={{ color: C.ink }}>How to read it.</b> The colours behind are the league heat map: red where hitters miss {lc}s most, blue where they miss least. Each dark dot is one of his {lc}s (a stored sample of up to 60), placed by how it moved: higher is more ride, right is more run toward his arm side. The orange ring is his average and the dashed blue ring is the league average {lc}. The box is the ±1 in window used to find league pitches with his shape. A tight clump means he repeats the pitch.
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 800 }}>Where does this shape cross the plate?</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>The other half of the picture: where {fz.name}’s {lc}s crossed the plate and what happened to each pitch, or where league {lc}s shaped like his cross it.</p>
          <PlateView id={fz.id} name={fz.name} type={fz.type} level={level} season={fz.season} hand={fz.hand} probe={sel ?? { hb: avgPt.hb, ivb: avgPt.ivb }} radius={radius} pitchName={pitchName} defaultMode="dots" />
          <div style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.55, marginTop: 6 }}>Dots are the pitches he threw; the heat map is what league pitches with his shape did. His other locations are in the <a href={`/mlb/lab/pitching-lab/${fz.id}/location`} style={{ color: C.orange, fontWeight: 800 }}>Location Lab</a>.</div>
        </div>
      </div>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {([
            ['Speed', `${fz.row.velo.toFixed(1)} mph`, outl ? `league ${outl.mean.velo.toFixed(1)}` : ''],
            ['Ride', `${fz.row.ivb.toFixed(1)} in`, outl ? `league ${outl.mean.ivb.toFixed(1)}` : ''],
            ['Run', `${Math.abs(fz.row.hb).toFixed(1)} in ${fz.row.hb >= 0 ? 'arm side' : 'glove side'}`, outl ? `league ${Math.abs(outl.mean.hb).toFixed(1)}` : ''],
            ['Arm angle', `${Math.round(fz.row.slot)}°`, outl ? `league ${Math.round(outl.mean.slot)}°` : ''],
            ['Usual range', hrow && hrow.sdIvb != null && hrow.sdHb != null ? `±${hrow.sdIvb.toFixed(1)} / ±${hrow.sdHb.toFixed(1)} in` : '—', 'ride / run, one standard deviation'],
            ['Thrown', fz.row.nPitches.toLocaleString('en-US'), `${fz.row.nSwings.toLocaleString('en-US')} swings, ${fz.season}`],
          ] as [string, string, string][]).map(([k, v, sub2]) => (
            <div key={k} style={{ background: C.soft, borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <div style={{ fontSize: 12, color: '#5b5347' }}>{sub2}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: '#3d382f' }}>
          Where this lands: {hrow?.score != null ? <>league {lc}s with a shape like his have a Shape Score of <b>{hrow.score}</b> out of 99{hrow.shape.saved != null ? <> ({hrow.shape.saved >= 0 ? '+' : '−'}{Math.abs(hrow.shape.saved).toFixed(2)} runs saved per 100 pitches)</> : null}. </> : 'there are too few league pitches in his window to give a Shape Score. '}
          {fz.row.nSwings >= 50 ? <>His own {lc}s drew whiffs on <b>{((100 * fz.row.nWhiffs) / fz.row.nSwings).toFixed(1)}%</b> of {fz.row.nSwings.toLocaleString('en-US')} swings in {fz.season}.</> : 'He has too few swings against this pitch to give a whiff rate.'}
        </p>
        {fz.repertoire.length > 1 && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#5b5347' }}>
            <span style={{ fontWeight: 800, color: '#6b6355' }}>His other pitches: </span>
            {fz.repertoire.filter(r => r.code !== fz.type).map(r => <a key={r.code} href={r.href} style={{ marginRight: 12, color: C.orange, fontWeight: 800, textDecoration: 'none' }}>{r.name} ({r.n.toLocaleString('en-US')})</a>)}
          </div>
        )}
      </div>
      <ShapeDial name={fz.name} pitcherId={fz.id} board={board} avg={snap(avgPt)} target={sel} onTarget={pt => setSel(snap(pt))} type={type} hand={fz.hand} level={level} radius={radius} year={effSpan === 'all' ? undefined : effSpan} lc={lc} />
    </div>
  ) : null
  const v3Story: StoryTab[] = !fz || !avgPt ? [] : [
    { id: 'overall', label: 'Overall', question: `What does ${fz.name}’s season look like at a glance, and what does each of his pitches look like?`, node: <PitcherOverall id={fz.id} name={fz.name} level={level} openType={fz.type} line={hrow?.stats ? { era: hrow.stats.era, xera: hrow.stats.xera, fip: hrow.stats.fip, ip: hrow.stats.ip } : null} role={hrow?.role ?? null} season={board?.season ?? fz.season} /> },
    { id: 'overview', label: `This ${lc}`, question: `How is ${fz.name}’s ${lc} doing, and what else does he throw?`, node: <PitchOverview row={hrow} id={fz.id} name={fz.name} type={fz.type} level={level} season={board?.season ?? fz.season} pitchName={pitchName} /> },
    { id: 'shape', label: 'His shape', question: `What does ${fz.name}’s ${lc} look like, and how repeatable is it?`, node: hisShape },
    storyTabs.find(t => t.id === 'who') as StoryTab,
    { id: 'season', label: 'Over the season', question: `How far did ${fz.name}’s ${lc} move from his own average each month, and what were the results in those months?`, node: (
      <div style={{ display: 'grid', gap: 24 }}>
        {level === 'mlb' && <SeasonMonths id={fz.id} type={fz.type} lc={lc} name={fz.name} />}
        <div><h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>Season to season</h3><PitcherYears id={fz.id} type={fz.type} level={level} lc={lc} name={fz.name} /></div>
      </div>) },
    { id: 'levels', label: 'Across levels', question: `Did ${fz.name}’s ${lc} change between the levels he has thrown at, and did the shape hold?`, node: <LevelsPanel id={fz.id} type={fz.type} lc={lc} /> },
    { id: 'why', label: 'Why the results', question: `Why did the ${lc} get these results? Which measured differences from league pitches with his shape line up with the gap?`, node: <WhyPanel row={hrow} id={fz.id} type={fz.type} hand={fz.hand} level={level} lc={lc} /> },
    { id: 'fantasy', label: 'Fantasy', question: `How widely is ${fz.name} rostered, and how do his results line up with the contact he allowed?`, node: <PlayerFantasy row={hrow} board={board} lc={lc} onOpen={id => pick(id)} /> },
  ]
  const v3Tabs: StoryTab[] = [
    { id: 'map', label: 'Map', question: `Where do hitters miss the most ${lc}s, and where does the pitch land that you are looking at?`, node: explorer },
    { id: 'players', label: 'Players', question: sel ? 'Which pitchers have an average shape like this, and who gets little attention?' : 'Which pitchers have a strong shape and get little attention?', node: <PlayersTab board={board} sel={sel} win={win} lc={lc} cmp={cmp} onToggleCmp={toggleCmp} onOpen={id => pick(id)} onClearSpot={() => setSel(null)} /> },
    { id: 'levels', label: 'Levels', question: 'Does the same shape look the same at Triple-A and the Florida State League as in MLB?', node: (
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>Each level is its own league: shapes are compared, but results are never compared across levels because the hitters differ. Arizona Fall League and Spring Training appear when their data is loaded.</p>
        {handsList.map(h => <LevelsCompared key={h} data={h === 'R' ? cmpR : cmpL} active={lvl} type={type} hand={h} pitchName={pitchName} place={sel} radius={radius} />)}
      </div>) },
    { id: 'average', label: 'League average', question: sel ? 'What has this exact shape produced across the league, and how many pitches is that based on?' : 'What has a shape produced across the league?', node: average },
    { id: 'board', label: 'Leaderboard', question: 'Whose results are above or below what their shape usually produces?', node: <ShapeScoreBoard board={board} lc={lc} hand={hand} onShow={id => pick(id)} /> },
    { id: 'fantasy', label: 'Fantasy', question: 'Who is rostered in few leagues, and whose results are above or below the contact they allowed?', node: <FantasyTab board={board} lc={lc} cmp={cmp} onToggleCmp={toggleCmp} onOpen={id => pick(id)} /> },
    { id: 'pitcher', label: fz ? `${fz.name.split(' ').slice(-1)[0]}’s story` : 'Pitcher story', question: fz ? `What is ${fz.name}’s ${lc} doing, how has it changed and why are the results what they are?` : 'What is a pitcher’s shape doing, how has it changed and why are the results what they are?', node: fz ? (
      <PitcherStory name={fz.name} headline={headline} tabs={v3Story} tab={story} onTab={setStory} />
    ) : <div style={{ ...card, fontSize: 14, color: '#3d382f', lineHeight: 1.55 }}><b>Choose a pitcher.</b> Search a name at the top of the page, click a dot on the map, or open a row in the Players tab or the Leaderboard. The story walks through his shape, who else throws it, what changed and why the results are what they are.</div> },
    { id: 'compare', label: cmp.length > 0 ? `Compare (${cmp.length})` : 'Compare', question: 'How do these pitchers’ shapes and results line up side by side?', node: <CompareTab board={board} ids={cmp} onToggle={toggleCmp} onOpen={id => pick(id)} lc={lc} heat={yearGrid ? { grid: yearGrid, r10, def: whiffScaled } : null} legendScaled={whiffScaled !== METRICS.whiff} type={type} hand={hand === 'L' ? 'L' : 'R'} pitchName={pitchName} radius={radius} level={level} /> },
  ]
  const v3Page = (
    <div id="pitch-shape-focus" style={{ scrollMarginTop: 12 }}>
      {      <style>{`.psl-mg{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(400px,.9fr);grid-template-areas:"map side" "mid side";gap:24px 28px;align-items:start}.psl-a-map{grid-area:map}.psl-a-mid{grid-area:mid}.psl-a-side{grid-area:side}.psl-notes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}@media(min-width:1500px){.psl-mg{grid-template-columns:minmax(0,1.15fr) minmax(300px,.6fr) minmax(400px,.85fr);grid-template-areas:"map mid side"}}@media(min-width:1001px){.psl-mg2{grid-template-columns:minmax(0,1.1fr) minmax(400px,.9fr) !important;grid-template-areas:"map side" !important}}@media(max-width:1000px){.psl-mg{grid-template-columns:minmax(0,1fr);grid-template-areas:"map" "side" "mid"}.psl-notes{grid-template-columns:1fr}}`}</style>}
      <SelectionBar league={`${handText} ${lc} · ${levelName}`} spot={sel} pitcher={fz ? fz.name : null} onClearSpot={() => setSel(null)} onClearPitcher={clearPitcher} cmpCount={cmp.length} onOpenCompare={() => setV3tab('compare')} />
      <PitcherStory name="the lab" tabs={v3Tabs} tab={v3tab} onTab={setV3tab} />
      <div className="psl-notes" style={{ borderTop: `1px solid ${C.line}`, marginTop: 18, paddingTop: 14, fontSize: 13.5, lineHeight: 1.55, color: '#5b5347' }}>
        <div><b style={{ color: C.ink }}>What a square means.</b> Every league {lc} within ±{radius} inch of that square’s movement: of the swings at them, the share that missed. It is a movement shape, not a place in the zone.</div>
        <div><b style={{ color: C.ink }}>What it can’t tell you.</b> Command, deception and sequencing aren’t in the map. It describes what pitches like this have done; it doesn’t predict.</div>
        <div><b style={{ color: C.ink }}>Why some squares are blank.</b> Under {MIN_WINDOW_SWINGS} swings is too few to trust, so we leave it empty rather than guess.</div>
      </div>
      <Foot>
        {handText} {lc}s at {levelName}, {spanLabel}. {multi ? `${latestLabel} only is the latest season on its own: about a third of the data, so each box rests on fewer swings; ${allLabel} adds earlier seasons for a bigger sample. ` : ''}Sideways movement is arm side to the right and glove side to the left (left-handers flipped).
        wOBA, xwOBA, runs saved, average and slugging come from the league outcomes of the pitches that ended each plate appearance; called strikes + whiffs, hard-hit rate, ground-ball rate and xwOBA on contact from 2-inch groups. The boxed average is every pitcher&apos;s average {lc}, weighted by how many he throws; outliers are the pitchers whose average is two or more standard deviations away. Source: Baseball Savant pitch data{level === 'mlb' ? '' : ', minor-league tracking'}. Describes what happened; it is not a forecast.
      </Foot>
    </div>
  )

  return ui === 'v3' ? v3Page : v2Page
}

const big: React.CSSProperties = { fontSize: 30, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.01em', color: C.ink }

/** the panel straight under the map: for the spot under the cursor (or the selected one, or the average shape) it shows, in big numbers, the shape, the results and the number of pitchers, then says in words what the pitch is doing */
function HoverPanel({ label, probe, here, full, spot, busy, colour, metric, scaleDef, filterOn, lc, handText, levelName, spanLabel, windowIn, showFull, league }: {
  label: string; probe: Pt
  here: { value: number | null; n: number; pitches: number | null }
  full: { rate: number | null; swings: number }
  spot: SpotResult | null; busy: boolean; colour: Colour; metric: MetricKey; scaleDef: MetricDef
  filterOn: boolean; lc: string; handText: string; levelName: string; spanLabel: string; windowIn: number; showFull: boolean
  /** the league's value of the coloured measure over every pitch of this type, null when not known */
  league: number | null
}) {
  const sp = spot && spot.ok ? spot.spot : null
  const def = scaleDef
  const cmp = (p: number | null, noun: string) => (p == null ? null : p >= 50 ? `more ${noun} than ${p}%` : `less ${noun} than ${100 - p}%`)
  const h: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', marginBottom: 6 }
  const sub: React.CSSProperties = { fontSize: 12.5, color: '#5b5347', marginTop: 3, lineHeight: 1.35 }
  const tile: React.CSSProperties = { borderTop: `3px solid ${C.ink}`, paddingTop: 8, minWidth: 0 }
  const dens = colour === 'density'
  const rgb = dens || here.value == null ? null : metricRgb(def, here.value)
  const toneCss = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : C.line
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 18px 16px', marginTop: 14, fontVariantNumeric: 'tabular-nums', opacity: busy ? 0.75 : 1, transition: 'opacity .12s' }} aria-label="What the pitch does at this spot">
      <div style={{ fontSize: 11, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px 20px' }}>
        <div style={tile}>
          <div style={h}>The shape</div>
          <div style={big}>{probe.ivb.toFixed(1)} in</div>
          <div style={sub}>ride (up)</div>
          <div style={{ ...big, marginTop: 8 }}>{Math.abs(probe.hb).toFixed(1)} in</div>
          <div style={sub}>{probe.hb >= 0 ? 'arm side' : 'glove side'}</div>
        </div>
        <div style={{ ...tile, borderTopColor: toneCss, order: -1 }}>
          <div style={h}>The results{dens ? '' : ` · ${def.short}`}</div>
          {dens ? <><div style={big}>{here.pitches != null ? here.pitches.toLocaleString('en-US') : '—'}</div><div style={sub}>pitches near here</div></>
            : here.value == null ? <><div style={{ ...big, color: C.mute }}>—</div><div style={sub}>too few {def.per} (under {def.min.toLocaleString('en-US')}) to show a rate</div></>
            : <><div style={{ ...big, fontSize: 38 }}>{def.fmt(here.value)}</div><div style={sub}>{metric === 'whiff' ? 'of swings miss' : def.explain.split('.')[0].toLowerCase()}</div>{league != null && <div style={{ ...sub, marginTop: 4 }}>League average <b style={{ color: C.ink }}>{def.fmt(league)}</b> · this spot is <b style={{ color: (METRICS[metric].betterHigh ? here.value >= league : here.value <= league) ? '#13694F' : '#A8391F' }}>{metric === 'whiff' ? `${here.value >= league ? '+' : '−'}${Math.abs((here.value - league) * 100).toFixed(1)} pts` : `${here.value >= league ? 'above' : 'below'}`}</b>{metric === 'whiff' ? '' : ' it'}</div>}</>}
          <div style={{ ...sub, marginTop: 8 }}><b style={{ color: C.ink }}>{Math.round(here.n).toLocaleString('en-US')}</b> {def.per}{here.pitches != null && !dens ? <>, <b style={{ color: C.ink }}>{here.pitches.toLocaleString('en-US')}</b> pitches</> : ''} near here ({spanLabel}{filterOn ? ', with your filters' : ''})</div>
          {showFull && <div style={{ ...sub, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.soft}` }}>Unfiltered, same seasons: <b style={{ color: C.ink }}>{full.rate == null ? 'too few swings' : `${(full.rate * 100).toFixed(1)}%`}</b> on {Math.round(full.swings).toLocaleString('en-US')} swings</div>}
        </div>
        <div style={tile}>
          <div style={h}>The pitchers</div>
          {sp == null ? <><div style={{ ...big, color: C.mute }}>…</div><div style={sub}>counting who throws this shape</div></>
            : <><div style={big}>{sp.averaging}</div><div style={sub}>{sp.averaging === 1 ? 'pitcher has' : 'pitchers have'} this as their <b style={{ color: C.ink }}>average</b> {lc} (within {windowIn} in)</div>
              <div style={{ ...sub, marginTop: 6 }}><b style={{ color: C.ink }}>{sp.pitchers}</b> {sp.pitchers === 1 ? 'pitcher throws' : 'pitchers throw'} it now and then (3 or more of their 60 sampled pitches land here)</div>
              {sp.rated > 0 && <div style={{ ...sub, marginTop: 8, fontSize: 13.5 }}><b style={{ color: BLUE }}>{sp.below} below</b> · <b style={{ color: '#5b5347' }}>{sp.at} at</b> · <b style={{ color: RED }}>{sp.above} above</b><span style={{ display: 'block', fontSize: 12, color: C.mute }}>the league miss rate here{spot && spot.ok && spot.leagueRate != null ? ` (${(spot.leagueRate * 100).toFixed(1)}%)` : ''}{sp.pitchers > sp.rated ? `; ${sp.pitchers - sp.rated} with too few swings` : ''}</span></div>}</>}
        </div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: '#3d382f', marginTop: 14 }}>
        <b style={{ color: C.ink }}>What the pitch is doing.</b> A {handText} {lc} that moves like this rides {probe.ivb.toFixed(1)} in and moves {Math.abs(probe.hb).toFixed(1)} in toward the {probe.hb >= 0 ? 'arm side' : 'glove side'}.
        {sp && sp.ridePct != null && sp.sidePct != null ? <> That is {cmp(sp.ridePct, 'ride')} and {cmp(sp.sidePct, 'arm-side movement')} of the {lc}s thrown{filterOn ? ' with your filters' : ''}.</> : null}
        {sp && sp.pitchers > 0 && sp.velo != null && sp.slot != null ? <> The pitchers who throw it average <b style={{ color: C.ink }}>{sp.velo.toFixed(1)} mph</b> from a <b style={{ color: C.ink }}>{Math.round(sp.slot)}°</b> arm angle{sp.swings > 0 ? <>, and between them miss <b style={{ color: C.ink }}>{((100 * sp.whiffs) / sp.swings).toFixed(1)}%</b> of swings on all of their {lc}s</> : null}.</> : null}
        {sp && sp.averaging === 0 ? <> <b style={{ color: C.ink }}>No pitcher averages this shape.</b>{sp.pitchers > 0 ? <> {sp.pitchers} {sp.pitchers === 1 ? 'pitcher still throws it' : 'pitchers still throw it'} now and then, so the swings and misses above come from pitchers whose usual shape is elsewhere.</> : <> None of them throw it even now and then (fewer than 3 of any pitcher’s 60 sampled {lc}s land within {windowIn} in), at {levelName}{filterOn ? ' with your filters' : ''}.</>}</> : null}
      </div>
    </section>
  )
}

/** League context beside the map, from data the page already holds: the best-performing shapes, the pitchers beating or trailing what their shape usually gets, and the most unusual shapes. Each row opens his full read. */
function Standouts({ board, outl, lc, levelName, selectedId, pickBusy, onPick }: {
  board: Board | null | undefined; outl: Outliers | null; lc: string; levelName: string; selectedId: number | null; pickBusy: number | null; onPick: (id: number) => void
}) {
  const h: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', margin: '0 0 6px' }
  const box: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', marginBottom: 12, fontVariantNumeric: 'tabular-nums' }
  const note: React.CSSProperties = { fontSize: 11.5, color: C.mute, lineHeight: 1.4, margin: '0 0 6px' }
  const sg = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`
  const rows = board?.rows ?? []
  const best = rows.filter(r => r.shape.saved != null).sort((a, b) => (b.shape.saved ?? 0) - (a.shape.saved ?? 0)).slice(0, 5)
  const gap = rows.filter(r => r.own.saved != null && r.shape.saved != null).map(r => ({ r, d: (r.own.saved ?? 0) - (r.shape.saved ?? 0) })).sort((a, b) => b.d - a.d)
  const beating = gap.slice(0, 4), trailing = gap.slice(-4).reverse().filter(x => x.d < 0)
  const row = (id: number, name: string, sub: string, right: string, key: string) => (
    <button key={key} type="button" onClick={() => onPick(id)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', textAlign: 'left', border: 0, borderTop: `1px solid ${C.soft}`, background: selectedId === id ? '#FFF3EC' : 'none', padding: '7px 2px', cursor: 'pointer', fontFamily: 'inherit', opacity: pickBusy === id ? 0.5 : 1 }}>
      <span style={{ minWidth: 0 }}><b style={{ fontSize: 13.5, color: C.ink }}>{name}</b><span style={{ display: 'block', fontSize: 11.5, color: C.mute }}>{sub}</span></span>
      <b style={{ fontSize: 13.5, color: C.ink, whiteSpace: 'nowrap' }}>{right}</b>
    </button>
  )
  const shapeTxt = (r: { ivb: number; hb: number; teamAbbr: string }) => `${r.teamAbbr} · ride ${r.ivb.toFixed(1)}, ${Math.abs(r.hb).toFixed(1)} ${r.hb >= 0 ? 'arm' : 'glove'} side`
  return (
    <div>
      {outl && (
        <div style={box}>
          <div style={h}>The league at a glance</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
            <div><b style={{ fontSize: 22 }}>{outl.mean.pitchers}</b><div style={note}>pitchers throw a {lc} at {levelName}</div></div>
            <div><b style={{ fontSize: 22 }}>{outl.mean.velo.toFixed(1)}</b><div style={note}>mph on average</div></div>
            <div><b style={{ fontSize: 22 }}>{outl.mean.ivb.toFixed(1)} in</b><div style={note}>average ride; most pitchers are within ±{outl.sd.ivb.toFixed(1)}</div></div>
            <div><b style={{ fontSize: 22 }}>{Math.abs(outl.mean.hb).toFixed(1)} in</b><div style={note}>{outl.mean.hb >= 0 ? 'arm' : 'glove'}-side run; most pitchers are within ±{outl.sd.hb.toFixed(1)}</div></div>
          </div>
        </div>
      )}
      <div style={box}>
        <div style={h}>Shapes with the best results</div>
        <p style={note}>Runs saved per 100 pitches by league pitches with that shape, against the average. Click a pitcher to open his story.</p>
        {board === undefined ? <div style={note}>Loading…</div> : best.length === 0 ? <div style={note}>No scored shapes for {lc}s here yet.</div>
          : best.map(r => row(r.pitcherId, r.name, shapeTxt(r), `${sg(r.shape.saved ?? 0)} runs`, `b${r.pitcherId}`))}
      </div>
      {(beating.length > 0 || trailing.length > 0) && (
        <div style={box}>
          <div style={h}>Above or below their shape</div>
          <p style={note}>His own runs saved per 100 pitches, minus what league pitches with his shape produced. Positive is above.</p>
          {beating.map(x => row(x.r.pitcherId, x.r.name, `${x.r.teamAbbr} · above his shape`, `${sg(x.d)}`, `u${x.r.pitcherId}`))}
          {trailing.map(x => row(x.r.pitcherId, x.r.name, `${x.r.teamAbbr} · below his shape`, `${sg(x.d)}`, `d${x.r.pitcherId}`))}
        </div>
      )}
      {outl && outl.outliers.length > 0 && (
        <div style={box}>
          <div style={h}>Most unusual shapes</div>
          <p style={note}>Average pitch farthest from the league average shape. These pitchers are marked on the map.</p>
          {outl.outliers.slice(0, 6).map(o => row(o.id, o.name, `${o.team} · ride ${o.ivb.toFixed(1)}, ${Math.abs(o.hb).toFixed(1)} ${o.hb >= 0 ? 'arm' : 'glove'} side`, o.rate != null ? `${(o.rate * 100).toFixed(1)}% whiffs per swing` : '—', `o${o.id}`))}
        </div>
      )}
    </div>
  )
}
