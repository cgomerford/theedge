'use client'

// src/components/pitch-shape/PitchFinderV2.tsx
//
// The redesigned Pitch Shape Lab map (mockups/pitch-shape-lab-redesign.html), shown beside the classic PitchFinder until it is made the only view.
// It answers one question: "Which [pitch] make hitters miss, and who throws them?"
//
// READ THIS FIRST (the page says it too): the squares are NOT the strike zone. Each square is a way a pitch can MOVE (ride up, run to the arm side),
// coloured by how often hitters miss pitches that move that way. Pick a red square and that movement is the most effective shape; below it the
// pitchers who throw that shape, split into those getting the results the shape usually gets and those who are not (so something other than the
// shape is holding them back). Where pitches cross the plate is the separate plate view beside it.
//
// Same data and access rules as the classic view: /api/mlb/pitch-shape/cells, /throwers, /location and /pitchers; four-seam and sweeper are free and
// every other pitch type is Pro and refused server-side. `isPro` is a REQUIRED prop. All rules live in finder-math.ts (tested).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, Empty, Foot } from '@/components/team/ui'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import type { MovementCellsPayload, PitcherDot, Thrower as ApiThrower } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand, type PitcherHit } from '@/lib/pitch-shape/model'
import { PV_CSS } from './pvCss'
import LocationPanel from './LocationPanel'
import FollowIsland from '@/components/signup/FollowIsland'
import PitcherTab from './PitcherTab'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import { FlightPlayer, SpeedToggle } from '@/components/pitching-lab/PitchFlight'
import { buildFlight } from '@/lib/sequencing-lab/flight'
import { makeGrid, stats, type Grid, type Span } from './heatGrid'
import {
  ABOUT_LEVEL_PTS, MAP_BG, SPOT_MIN_SWINGS, shrunkRate,
  boxColour, movementStats, nameSpot, rateDots, toneLine, toneOf,
} from './finder-math'
import { log } from '@/lib/log'
import { limitsFor } from '@/lib/milb-shape/limits'
import { handsOf, handWord, mergeBoards, mergeCells, mergeResults, mergeThrowers, tagDots, type HBoardRow, type HDot, type ViewHand } from './bothHands'
import { setSelectedShape } from './shapeSelection'
import { onShapePop, replaceShapeParams, useShapeView } from './shapeLevel'
import { useLevelCaps } from './LevelBar'
import type { LevelAvg } from './AcrossLevels'
import { placeLabels } from './labelLayout'
import ShapeChanges from './ShapeChanges'
import V3Intro from './V3Intro'
import LevelBar from './LevelBar'
import { usePitcherLog } from './usePitcherLog'
import { movementPoints } from '@/lib/pitch-shape/pitch-line'
import LevelsCompared, { LEVEL_COLOUR, useLevelsCompared } from './LevelsCompared'
import InfoTip from './InfoTip'
import RefinePanel, { NO_SHAPE_REFINE, shapeRefined, usePitcherStatuses, type ShapeRefine } from './RefinePanel'
import { NO_REFINE, isRefined, passes, statusChips, type Refine } from '@/lib/milb-shape/status-math'
import { LEVEL_LABEL, LEVEL_SHORT, type Level } from '@/lib/milb-shape/levels'
import { parseShapeUrl } from '@/lib/milb-shape/url'
import { BLANK, METRICS, FindPitcher, ResultsLegend, ResultsReadout, ShapePlayerDetail, ShapePlayersPanel, ShapeScoreBoard, colourFor, type MetricId } from './ShapeResultsKit'
import { makeResultsGrid, measuresOf, percentile, runsSaved, windowSums, windowSumsRect, type ResultsPayload } from '@/lib/pitch-shape/results-math'
import type { Board } from '@/lib/pitch-shape/results'
import type { Overall } from '@/lib/pitch-shape/overall'
import type { ShapeBin } from '@/lib/pitch-shape/model'
import type { DiagnosisResult } from '@/lib/pitch-shape/diagnosis'

const HALF = 12
const MILB_ORDER = ['FF', 'ST', 'SL', 'SI', 'FC', 'CH', 'CU', 'KC', 'FS', 'SV']
const RADII = [0.5, 1, 2] as const
const ORANGE_TEXT = '#B83A0E'   // small orange text that passes contrast
// The animation uses a typical release point for the hand (only the movement, speed and where it crosses come from the chosen spot).
const RELEASE = { R: { x: -1.9, z: 5.9, ext: 6.3 }, L: { x: 1.9, z: 5.9, ext: 6.3 } } as const
const TYPICAL_MPH: Record<string, number> = { FF: 94.5, SI: 94, FC: 89, SL: 86, ST: 82, SV: 81, CU: 79, KC: 80, CH: 86, FS: 85 }

type Spot = { hb: number; ivb: number; rate: number; swings: number }
type Place = { hb: number; ivb: number; spot: number | null }

const cache = new Map<string, MovementCellsPayload | null>()
const getJ = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()) as T }
const resCache = new Map<string, ResultsPayload | null>()
/** Bump when the board's shape changes, so a copy cached in the browser (or kept across a hot reload) is never reused with fields missing. */
const BOARD_V = 'b6'
const boardCache = new Map<string, Board | null>()
const shapeBinsCache = new Map<string, ShapeBin[] | null>()

/** The most effective places: highest miss rate with 200+ swings in the window, at least 4 in apart. */
function topSpots(g: Grid, r10: number, n = 3, minGapIn = 4, minSwings = SPOT_MIN_SWINGS, prior = 0, leagueRate = 0): Spot[] {
  const found: Spot[] = []
  const lo = g.m10, hi = g.size - g.m10
  for (let y = lo; y < hi; y += 5) for (let x = lo; x < hi; x += 5) {
    const s = stats(g, g.gx0 + x, g.gy0 + y, r10)
    if (s.swings >= minSwings && s.swings > 0) found.push({ hb: (g.gx0 + x) / 10, ivb: (g.gy0 + y) / 10, rate: shrunkRate(s.swings, s.whiffs, leagueRate, prior), swings: s.swings })
  }
  found.sort((a, b) => b.rate - a.rate)
  const out: Spot[] = []
  for (const f of found) {
    if (out.every(o => Math.hypot(o.hb - f.hb, o.ivb - f.ivb) >= minGapIn)) out.push(f)
    if (out.length === n) break
  }
  return out
}

const pctText = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const pts = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts`

export default function PitchFinderV2({ isPro, lookLeft = false, pitchTypes, v3 = false }: { isPro: boolean; lookLeft?: boolean; pitchTypes: string[]; /** the v3 layout, switched on with ?v=3 */ v3?: boolean }) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const [type, setType] = useState(pitchTypes.find(isFree) ?? pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<ViewHand>('R')   // Right, Left, or Both: both hands draw on the same map (run is arm-side positive for either arm), see bothHands.ts
  const hands = handsOf(hand)
  const dataHand: Hand = hand === 'B' ? 'R' : hand   // for the few parts that only make sense for one arm (the plate view and the flight)
  const [span, setSpan] = useState<Span>('latest')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  // the shared level (MLB, Triple-A or Florida State League): one value for the map, filters, pitcher panel and sandbox. MLB is the default and behaves exactly as before.
  const lv = useShapeView()
  const level = lv.level, mlb = level === 'mlb'
  const lim = limitsFor(level)   // sample-size rules for this level: none at Spring Training and the Arizona Fall League
  const lq = mlb ? '' : `&level=${level}${lv.season != null ? `&season=${lv.season}` : ''}`
  const caps = useLevelCaps(level, lv.season)
  const types = useMemo(() => (mlb ? pitchTypes : MILB_ORDER.filter(t => (caps?.types[t]?.pitches ?? 0) >= lim.comparePitches)), [mlb, pitchTypes, caps, lim.comparePitches])
  const key = mlb ? `${type}|${hand}` : `${level}|${lv.season ?? ''}|${type}|${hand}`
  const [payload, setPayload] = useState<MovementCellsPayload | null | undefined>(cache.get(key))   // undefined = loading
  const [place, setPlace] = useState<Place | null>(null)
  const [hover, setHover] = useState<{ hb: number; ivb: number; x: number; y: number } | null>(null)
  const [throwers, setThrowers] = useState<ApiThrower[] | null | undefined>(null)
  const [leagueAll, setLeagueAll] = useState<Diag | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PitcherHit[]>([])
  const [shown, setShown] = useState<{ name: string; team: string; hb: number; ivb: number; velo: number } | null>(null)
  const [shownMsg, setShownMsg] = useState('')
  const [plate, setPlate] = useState<{ plateX: number; plateZ: number; n: number } | null>(null)
  const [slow, setSlow] = useState(6)
  const [focus, setFocus] = useState<number | null>(null)   // the chosen pitcher: his sampled pitches drawn as dots, a ring at his average
  const [dots, setDots] = useState<HDot[]>([])
  const [showLevels, setShowLevels] = useState(false)   // draw each level's average pitch as a ring on the map
  const [side, setSide] = useState<'find' | 'shape'>('shape')   // the right-hand panel: the finder, or what the chosen shape has produced
  const [mapIds, setMapIds] = useState<Set<number> | null>(null)   // pitchers passing the finder's filters; null = show everyone
  const [refine, setRefine] = useState<Refine>(NO_REFINE)   // minor-league views: who has made the jump, was sent down, was traded, struggled in MLB
  const [shapeRefine, setShapeRefine] = useState<ShapeRefine>(NO_SHAPE_REFINE)
  const [team, setTeam] = useState('')   // a club's abbreviation: only its pitchers are drawn, each with his name; '' = everyone
  const [focusPts, setFocusPts] = useState<[number, number][] | null>(null)
  const [tabPitcher, setTabPitcher] = useState<{ id: number; name: string } | null>(null)   // the pitcher tab, once one is opened
  const [view, setView] = useState<'map' | 'pitcher' | 'changes'>('map')
  const [readOpen, setReadOpen] = useState(false)   // the three-line map explainer, opened from the top row
  const [measure, setMeasure] = useState<'whiff' | MetricId>('whiff')   // what colours the map: whiffs per swing, or what the shape has produced
  const [resPayload, setResPayload] = useState<ResultsPayload | null | undefined>(resCache.get(key))
  const [board, setBoard] = useState<Board | null | undefined>(boardCache.get(`${key}|${BOARD_V}`))
  const [shapeBins, setShapeBins] = useState<ShapeBin[] | null | undefined>(null)   // the league's speed and arm-angle bins, for the "why" read on a chosen pitcher
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | 'locked' | undefined>(undefined)   // where the chosen pitcher is leaking; 'locked' when the viewer is not Pro
  const [overall, setOverall] = useState<Overall | null | undefined>(null)   // the chosen pitcher's whole-season numbers and ranks; undefined while loading
  // the arm of the chosen pitcher: his own dot or board row says it when both hands are on the map
  const focusHand: Hand = hand !== 'B' ? hand : (dots.find(d => d.pitcherId === focus)?.hand ?? (board?.rows.find(r => r.pitcherId === focus) as HBoardRow | undefined)?.hand ?? 'R')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const noStatus = mlb || (!isPro && !lookLeft && !isFree(type))
  const stR = usePitcherStatuses(level, type, 'R', noStatus || hand === 'L'), stL = usePitcherStatuses(level, type, 'L', noStatus || hand === 'R')
  const statuses = hand === 'R' ? stR : hand === 'L' ? stL : (stR === undefined || stL === undefined ? undefined : stR && stL ? { ...stR, statuses: new Map([...stR.statuses, ...stL.statuses]) } : stR ?? stL)
  const cmpLocked = !isPro && !lookLeft && !isFree(type)
  const cmpR = useLevelsCompared(type, 'R', cmpLocked || hand === 'L'), cmpL = useLevelsCompared(type, 'L', cmpLocked || hand === 'R')   // Both shows the right-handed and the left-handed comparison, one after the other
  const cmpData = (hand === 'L' ? cmpL : cmpR) ?? (hand === 'B' ? cmpL : null)   // for the Level averages switch: on when the arm(s) shown have any level data
  const focusRef = useRef<number | null>(null)
  useEffect(() => { focusRef.current = focus })   // read by the level-change effect below, which runs after this one
  const prevLevel = useRef(level)
  const carry = useRef<number | null>(null)   // the pitcher chosen when the level changed: kept if he has pitches at the new level
  const [carryMsg, setCarryMsg] = useState('')
  const [urlReady, setUrlReady] = useState(false)
  const locked = !isPro && !lookLeft && !isFree(type)
  const name = PITCH_NAMES[type] ?? type
  const lc = name.toLowerCase()

  // the address is the starting point for pitch, hand, window and window size; Back and Forward restore them (the level has its own store, shapeLevel.ts)
  useEffect(() => {
    const apply = (u: ReturnType<typeof parseShapeUrl>) => {
      if (u.hand) setHand(u.hand)
      if (u.window) setSpan(u.window)
      if (u.radius) setRadius(u.radius)
      if (u.pitch && u.pitch in PITCH_NAMES) setType(u.pitch)
      setRefine({ mlb: u.rmlb ?? 'any', results: u.rres ?? 'any', moves: u.rmov ?? 'any', ageMin: u.rmin ?? null, ageMax: u.rmax ?? null, org: u.rorg ?? null })
      setShapeRefine({ carry: u.rcarry ?? 'any', verdict: u.rver ?? 'any', rankMin: u.rrank ?? 0 })
    }
    apply(parseShapeUrl(window.location.search))
    setUrlReady(true)   // eslint-disable-line react-hooks/set-state-in-effect -- writing the address waits for the first read, so a shared link is never overwritten by the defaults
    return onShapePop(apply)
  }, [])
  useEffect(() => {
    if (!urlReady) return
    replaceShapeParams({
      pitch: type, hand, window: span === 'latest' ? undefined : span, radius: radius === 1 ? undefined : radius,
      rmlb: refine.mlb === 'any' ? undefined : refine.mlb, rres: refine.results === 'any' ? undefined : refine.results, rmov: refine.moves === 'any' ? undefined : refine.moves,
      rmin: refine.ageMin ?? undefined, rmax: refine.ageMax ?? undefined, rorg: refine.org ?? undefined,
      rcarry: shapeRefine.carry === 'any' ? undefined : shapeRefine.carry, rver: shapeRefine.verdict === 'any' ? undefined : shapeRefine.verdict, rrank: shapeRefine.rankMin > 0 ? shapeRefine.rankMin : undefined,
    })
  }, [urlReady, type, hand, span, radius, refine, shapeRefine])

  // a level switch: a team that does not exist at the new level, the finder's filters and any message from the last level are cleared; the pitch moves to one this level has
  useEffect(() => {
    setTeam(''); setMapIds(null); setCarryMsg(''); setSelectedShape(null)   // eslint-disable-line react-hooks/set-state-in-effect -- a level switch clears what belonged to the last level
    if (!mlb) { setMeasure('whiff'); setSide('shape') }
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mlb && caps && types.length > 0 && !types.includes(type)) setType(types.find(isFree) ?? types[0])   // eslint-disable-line react-hooks/set-state-in-effect -- the level's own pitch types decide which pitch is shown
  }, [mlb, caps, types, type])

  const consumeCarry = (ds: PitcherDot[]) => {
    const id = carry.current
    carry.current = null
    if (id == null) return
    if (ds.some(d => d.pitcherId === id)) setFocus(id)
    else setCarryMsg(`The pitcher you had selected has no ${lc} data at ${LEVEL_LABEL[level]}, so the selection was cleared.`)
  }

  useEffect(() => {
    if (prevLevel.current !== level) { prevLevel.current = level; carry.current = focusRef.current }
    setPlace(null); setThrowers(null); setShown(null); setShownMsg(''); setShowAll(false); setFocus(null); setFocusPts(null); setDots([]); setTabPitcher(null); setView('map')
    if (locked) { setPayload(null); return }
    if (cache.has(key)) { setPayload(cache.get(key)); return }
    setPayload(undefined)
    let live = true
    Promise.all(hands.map(h => getJ<{ payload: MovementCellsPayload | null }>(`/api/mlb/pitch-shape/cells?type=${type}&hand=${h}&center=league&half=${HALF}${lq}`).then(j => j.payload)))
      .then(ps => { const v = ps.length === 2 ? (ps[0] && ps[1] ? mergeCells(ps[0], ps[1]) : ps[0] ?? ps[1]) : ps[0]; cache.set(key, v); if (live) setPayload(v) })
      .catch(e => { log.error('PitchFinderV2', 'cells fetch failed', e instanceof Error ? e.message : e); if (live) setPayload(null) })
    return () => { live = false }
  }, [key, type, hand, locked])

  // what these shapes have produced (runs saved, wOBA, xwOBA, average, slugging) and the Shape Score board: separate tables, so the whiff map never waits on them
  useEffect(() => {
    if (locked) { setResPayload(null); setBoard(null); return }
    let live = true
    const load = <T,>(urls: string[], store: Map<string, T | null>, ck: string, pick: (j: never) => T | null, set: (v: T | null | undefined) => void, merge: (a: T, b: T) => T) => {
      if (store.has(ck)) { set(store.get(ck) ?? null); return }
      set(undefined)
      Promise.all(urls.map(u => getJ<unknown>(u))).then(js => { const vs = js.map(j => pick(j as never)); const v = vs.length === 2 ? (vs[0] && vs[1] ? merge(vs[0], vs[1]) : vs[0] ?? vs[1]) : vs[0]; store.set(ck, v); if (live) set(v) })
        .catch(e => { log.error('PitchFinderV2', 'results fetch failed', e instanceof Error ? e.message : e); if (live) set(null) })
    }
    load(hands.map(h => `/api/mlb/pitch-shape/results?type=${type}&hand=${h}&half=${HALF}${lq}`), resCache, key, (j: { payload: ResultsPayload | null }) => j.payload, setResPayload, mergeResults)
    load(hands.map(h => `/api/mlb/pitch-shape/board?type=${type}&hand=${h}${lq}`), boardCache, `${key}|${BOARD_V}`, (j: { board: Board | null }) => j.board, setBoard, mergeBoards)   // a minor-league board is level-only: its shape, results and Shape Score come from that level's pitches
    return () => { live = false }
  }, [key, type, hand, locked, mlb, lq]) // eslint-disable-line react-hooks/exhaustive-deps

  // the chosen pitcher's overall numbers and where they rank (all his pitch types, this season)
  useEffect(() => {
    if (focus == null || locked || !payload) { setOverall(null); return }
    let live = true
    setOverall(undefined)
    fetch(`/api/mlb/pitch-shape/pitcher-overall?id=${focus}&season=${payload.latest}${lq}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { overall: Overall | null }) => { if (live) setOverall(j.overall) })
      .catch(e => { log.error('PitchFinderV2', 'overall fetch failed', e instanceof Error ? e.message : e); if (live) setOverall(null) })
    return () => { live = false }
  }, [focus, payload, locked, lq])

  // where the chosen pitcher is leaking (Pro): which pitch, situation and process measure
  useEffect(() => {
    if (focus == null || locked || !payload || !mlb) { setDiagnosis(undefined); return }
    let live = true
    setDiagnosis(undefined)
    fetch(`/api/mlb/pitch-shape/diagnosis?id=${focus}&season=${payload.latest}`)
      .then(async r => { if (r.status === 403) return 'locked' as const; if (!r.ok) throw new Error(`HTTP ${r.status}`); return ((await r.json()) as { diagnosis: DiagnosisResult }).diagnosis })
      .then(d => { if (live) setDiagnosis(d) })
      .catch(e => { log.error('PitchFinderV2', 'diagnosis fetch failed', e instanceof Error ? e.message : e); if (live) setDiagnosis(null) })
    return () => { live = false }
  }, [focus, payload, locked, mlb])

  // speed and arm-angle bins, only once a pitcher is chosen
  useEffect(() => {
    if (focus == null || locked) { setShapeBins(null); return }
    const bkey = `${key}|${focusHand}`   // a pitcher's speed and arm-angle bins are his own hand's
    if (shapeBinsCache.has(bkey)) { setShapeBins(shapeBinsCache.get(bkey) ?? null); return }
    let live = true
    setShapeBins(undefined)
    fetch(`/api/mlb/pitch-shape/bins?type=${type}&hand=${focusHand}${lq}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { bins?: ShapeBin[] }) => { const b = j.bins ?? null; shapeBinsCache.set(bkey, b); if (live) setShapeBins(b) })
      .catch(e => { log.error('PitchFinderV2', 'bins fetch failed', e instanceof Error ? e.message : e); if (live) setShapeBins(null) })
    return () => { live = false }
  }, [focus, key, type, focusHand, locked, lq])

  const grids = useMemo(() => (payload ? { latest: makeGrid(payload, 'latest'), all: makeGrid(payload, 'all') } : null), [payload])
  const grid = grids ? grids[span] : null
  const N = grid ? 2 * grid.h10 + 1 : 0
  const rGrid = useMemo(() => (resPayload ? makeResultsGrid(resPayload, span === 'latest' ? 'latest' : 'all') : null), [resPayload, span])
  const rLeague = useMemo(() => (rGrid ? measuresOf(rGrid.total, lim.gated) : null), [rGrid])
  const metric = METRICS.find(m => m.id === measure) ?? null
  // the player detail always compares a pitcher with league pitches from every season added up (the same as the Shape Score board), whichever span colours the map
  const rGridAll = useMemo(() => (resPayload ? makeResultsGrid(resPayload, 'all') : null), [resPayload])
  const rLeagueAll = useMemo(() => (rGridAll ? measuresOf(rGridAll.total, lim.gated) : null), [rGridAll])
  const shapeAt = useMemo(() => {
    if (!rGridAll || !rLeagueAll) return null
    return (hb: number, ivb: number, rx10: number, ry10: number) => {
      const s = windowSumsRect(rGridAll, Math.round(hb * 10), Math.round(ivb * 10), rx10, ry10)
      const g = measuresOf(s, lim.gated), raw = measuresOf(s, false)
      return { gated: { ...g, saved: runsSaved(g, rLeagueAll) }, raw: { ...raw, saved: runsSaved(raw, rLeagueAll) } }
    }
  }, [rGridAll, rLeagueAll])
  const r10 = Math.round(radius * 10)
  const leagueRate = grid && grid.swings > 0 ? grid.whiffs / grid.swings : null
  const latest = payload?.latest ?? new Date().getFullYear()
  const spots = useMemo(() => (grid ? topSpots(grid, Math.max(r10, 10), 3, 4, lim.spotSwings, lim.priorSwings, grid.swings > 0 ? grid.whiffs / grid.swings : 0) : []), [grid, r10, lim.spotSwings, lim.priorSwings])
  const ms = useMemo(() => {
    const se = payload ? (span === 'latest' ? payload.seasons.filter(s => s.season === payload.latest) : payload.seasons) : []
    return movementStats(se.flatMap(s => s.cells))
  }, [payload, span])

  // every pitcher on the map: one dot each, at his average movement
  useEffect(() => {
    if (!payload || locked) { setDots([]); return }
    let live = true
    Promise.all(hands.map(h => getJ<{ dots: PitcherDot[]; league?: Diag }>(`/api/mlb/pitch-shape/pitcher-dots?type=${type}&hand=${h}&season=${payload.latest}${lq}`).then(j => ({ ...j, dots: tagDots(j.dots ?? [], h) }))))
      .then(js => { const all = js.flatMap(j => j.dots); if (live) { setDots(all); const lg = js[0]?.league; if (lg) setLeagueAll(lg); consumeCarry(all) } })
      .catch(e => { log.error('PitchFinderV2', 'pitcher dots fetch failed', e instanceof Error ? e.message : e); if (live) setDots([]) })
    return () => { live = false }
  }, [payload, type, hand, locked, lq]) // eslint-disable-line react-hooks/exhaustive-deps

  // the chosen pitcher's sampled pitches (from the list when he is in it, else fetched)
  useEffect(() => {
    if (focus == null || !payload) { setFocusPts(null); return }
    const inList = throwers?.find(t => t.pitcherId === focus)
    if (inList) { setFocusPts(inList.points); return }
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-dots?type=${type}&hand=${focusHand}&season=${payload.latest}&pitcher=${focus}${lq}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { points: [number, number][] }) => { if (live) setFocusPts(j.points ?? []) })
      .catch(e => { log.error('PitchFinderV2', 'pitcher points fetch failed', e instanceof Error ? e.message : e); if (live) setFocusPts([]) })
    return () => { live = false }
  }, [focus, payload, type, focusHand, throwers, lq])

  // choose the top spot when a map arrives, so the right-hand column is never empty
  useEffect(() => {
    if (!payload || !grid || place) return
    if (spots[0]) setPlace({ hb: Math.round(spots[0].hb * 10) / 10, ivb: Math.round(spots[0].ivb * 10) / 10, spot: 0 })
  }, [payload, grid, spots, place])

  // who throws it here
  useEffect(() => {
    if (!place || !payload || locked) { setThrowers(null); return }
    setThrowers(undefined)
    let live = true
    Promise.all(hands.map(h => getJ<{ throwers: ApiThrower[]; league?: Diag }>(`/api/mlb/pitch-shape/throwers?type=${type}&hand=${h}&hb=${place.hb.toFixed(1)}&ivb=${place.ivb.toFixed(1)}&radius=${radius}&season=${latest}${lq}`)))
      .then(js => { if (live) { setThrowers(js.length === 2 ? mergeThrowers(js[0].throwers, js[1].throwers) : js[0].throwers) } })
      .catch(e => { log.error('PitchFinderV2', 'throwers fetch failed', e instanceof Error ? e.message : e); if (live) setThrowers(null) })
    return () => { live = false }
  }, [place, payload, type, hand, latest, locked, radius, lq])

  // draw the map: one box per 0.1 in, coloured from the league rate
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid || leagueRate == null) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const useRes = metric != null && rGrid != null && rLeague != null
    const ref = useRes ? metric.ref(rLeague) : 0
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      let rgb: [number, number, number]
      if (useRes) {   // coloured by what the shape has produced: orange better for the pitcher than the league average, blue worse, white too thin
        const v = metric.get(measuresOf(windowSums(rGrid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10), lim.gated), rLeague)
        rgb = v == null ? BLANK : colourFor(((metric.up ? 1 : -1) * (v - ref)) / metric.span)
      } else {
        const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
        rgb = boxColour(s.swings, s.whiffs, leagueRate, lim.windowSwings, lim.strongSwings, lim.priorSwings) ?? MAP_BG
      }
      const o = ((N - 1 - yy) * N + xx) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, r10, N, leagueRate, metric, rGrid, rLeague])

  const win = (hb: number, ivb: number) => {
    if (!grid) return null
    const s = stats(grid, Math.round(hb * 10), Math.round(ivb * 10), r10)
    return { ...s, rate: s.swings >= lim.windowSwings && s.swings > 0 ? s.whiffs / s.swings : null }
  }
  const placeStats = place ? win(place.hb, place.ivb) : null
  const placeRate = placeStats?.rate ?? null
  const diffPts = placeRate != null && leagueRate != null ? (placeRate - leagueRate) * 100 : null
  const tone = diffPts != null ? toneOf(diffPts) : null
  const spotName = place && ms ? nameSpot(type, name, place.hb, place.ivb, ms) : null

  const openPitcher = (id: number, nm: string) => { setTabPitcher({ id, name: nm }); setView('pitcher'); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showOnMap = (id: number) => { setFocus(f => (f === id ? null : id)); if (typeof document !== 'undefined') document.getElementById('pf2-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const ratedDots = useMemo(() => rateDots(dots.map(d => ({ ...d })), (hb, ivb) => {
    if (!grid) return null
    const s2 = stats(grid, Math.round(hb * 10), Math.round(ivb * 10), 10)
    return s2.swings >= lim.windowSwings && s2.swings > 0 ? s2.whiffs / s2.swings : null
  }, lim.ownSwings), [dots, grid, lim.windowSwings, lim.ownSwings])
  const teams = useMemo(() => Array.from(new Set(ratedDots.map(d => d.teamAbbr).filter(Boolean))).sort(), [ratedDots])
  const teamOn = team && teams.includes(team) ? team : ''
  const teamDots = useMemo(() => teamOn ? ratedDots.filter(d => d.teamAbbr === teamOn).sort((a, b) => b.nPitches - a.nPitches) : [], [ratedDots, teamOn])
  const teamLabels = useMemo(() => {
    if (!grid || teamDots.length === 0) return []
    const toB = (hb: number, ivb: number) => ({ x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) })
    const surname = (n: string) => n.replace(/\s+(Jr\.?|Sr\.?|II|III)$/, '').split(' ').slice(-1)[0]
    return placeLabels(teamDots.map(d => ({ id: d.pitcherId, ...toB(d.hb, d.ivb), text: surname(d.name) })), { fs: N / 44, r: N / 70, x0: 0, y0: 0, x1: N, y1: N })
  }, [grid, teamDots, N])
  // the chosen pitcher's own shape goes to "Dial in a shape" below, so its sliders start from it
  useEffect(() => {
    const r = board && focus != null ? board.rows.find(x => x.pitcherId === focus) ?? null : null
    if (!r || r.velo == null || r.slot == null) return
    setSelectedShape({ id: r.pitcherId, name: r.name, team: r.teamAbbr, pitchType: type, hand: focusHand, shape: { velo: r.velo, ivb: r.ivb, hb: r.hb, slot: r.slot }, ownWhiff: r.ownRaw.whiff, ownSwings: r.ownRaw.n.swings })
  }, [focus, board, type, hand])
  // a minor-league pitcher chosen on the map loads his own shape into Dial in a shape (the MLB pitcher does it through the Shape Score board above)
  useEffect(() => {
    if (mlb || focus == null) return
    const d = dots.find(x => x.pitcherId === focus)
    if (!d || !caps?.axes.armAngle) return
    setSelectedShape({ id: d.pitcherId, name: d.name, team: d.teamAbbr, pitchType: type, hand: focusHand, shape: { velo: d.velo, ivb: d.ivb, hb: d.hb, slot: d.slot }, ownWhiff: d.nSwings >= 150 ? d.nWhiffs / d.nSwings : null, ownSwings: d.nSwings })
  }, [mlb, focus, dots, type, hand, caps])
  // who passes the Refine choices (minor-league levels): the record-based choices need his status, the shape choices need his row on the level's board. A pitcher missing what a choice needs does not pass it.
  const refined = !mlb && (isRefined(refine) || shapeRefined(shapeRefine))
  const universe = useMemo(() => { const ids = new Set<number>(); board?.rows.forEach(r => ids.add(r.pitcherId)); dots.forEach(d => ids.add(d.pitcherId)); return ids }, [board, dots])
  const refineIds = useMemo(() => {
    if (!refined) return null
    const rowOf = new Map((board?.rows ?? []).map(r => [r.pitcherId, r]))
    const out = new Set<number>()
    for (const id of universe) {
      const st = statuses ? statuses.statuses.get(id) : undefined
      if (isRefined(refine) && !passes(st, refine, statuses?.season ?? new Date().getFullYear(), statuses?.leagueRuns100 ?? null, statuses?.asOf ?? new Date().toISOString().slice(0, 10))) continue
      if (shapeRefined(shapeRefine)) {
        const r = rowOf.get(id)
        if (!r) continue
        if (shapeRefine.carry !== 'any' && r.translation?.status !== shapeRefine.carry) continue
        if (shapeRefine.verdict !== 'any' && r.verdict !== shapeRefine.verdict) continue
        if (shapeRefine.rankMin > 0 && (r.score == null || r.score < shapeRefine.rankMin)) continue
      }
      out.add(id)
    }
    return out
  }, [refined, refine, shapeRefine, universe, statuses, board])
  const idFilter = mlb ? mapIds : refineIds   // the pitchers the map and list show: the finder's filters at MLB, the Refine choices at a minor-league level
  const chipsFor = useMemo(() => (statuses ? (id: number) => statusChips(statuses.statuses.get(id), statuses.season, statuses.leagueRuns100, statuses.asOf) : undefined), [statuses])
  // each level's average for the pitch and the chosen pitcher's hand, so his row at every level is set against that level's own average
  const levelAvg = useMemo(() => {
    const d = focusHand === 'L' ? cmpL : cmpR
    return Object.fromEntries((d?.levels ?? []).map(l => [l.level, { whiff: l.swings > 0 ? l.whiffs / l.swings : null, velo: l.mean.velo, ivb: l.mean.ivb, hb: l.mean.hb, slotKnown: l.slotKnown }])) as Partial<Record<Level, LevelAvg>>
  }, [focusHand, cmpL, cmpR])
  const focusDot = focus != null ? ratedDots.find(d => d.pitcherId === focus) ?? null : null
  const focusLog = usePitcherLog(focus, payload?.latest ?? null, level)   // every pitch he threw: the dots are all of them, not the stored sample
  const focusAll = focusLog ? movementPoints(focusLog.pitches, type, focusLog.throws) : null
  const focusAllPts = focusAll && focusAll.length ? focusAll : focusPts
  const focusT = focusDot && focusAllPts ? { name: focusDot.name, sample: focusAllPts.length, points: focusAllPts, hb: focusDot.hb, ivb: focusDot.ivb, velo: focusDot.velo } : null
  // speed for the animation: the average of the pitchers who throw this shape (weighted by how many land here), else a typical speed for the pitch
  const flightSpeed = useMemo(() => {
    const w = (throwers ?? []).reduce((s, t) => s + t.estPitches, 0)
    return w > 0 && throwers ? { mph: throwers.reduce((s, t) => s + t.velo * t.estPitches, 0) / w, real: true } : { mph: TYPICAL_MPH[type] ?? 90, real: false }
  }, [throwers, type])
  const flight = useMemo(() => {
    if (!place || !plate) return null
    const r = RELEASE[dataHand]
    return buildFlight(type, name, { plateX: plate.plateX, plateZ: plate.plateZ, relX: r.x, relZ: r.z, ext: r.ext, speed: flightSpeed.mph, spin: null, hb: place.hb, ivb: place.ivb, hand: dataHand }, plate.n)
  }, [place, plate, dataHand, type, name, flightSpeed])
  const inBox = (hb: number, ivb: number) => !!place && Math.abs(hb - place.hb) <= radius && Math.abs(ivb - place.ivb) <= radius

  // "show a pitcher on this map": his average shape as a ring, and what the league gets at that shape
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    let live = true
    const t = setTimeout(() => {
      fetch(`/api/mlb/pitch-shape/pitchers?q=${encodeURIComponent(term)}${lq}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { pitchers: PitcherHit[] }) => { if (live) setHits(j.pitchers ?? []) })
        .catch(e => { log.error('PitchFinderV2', 'pitcher search failed', e instanceof Error ? e.message : e); if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q, lq])
  const pickPitcher = (h: PitcherHit) => {
    const p = h.pitches.find(x => x.pitchType === type)
    setQ(''); setHits([])
    if (dots.some(d => d.pitcherId === h.id)) { setShown(null); setShownMsg(''); setFocus(h.id); return }   // he is on the map: choose his dot
    if (!p || (hand !== 'B' && h.hand !== hand)) { setShown(null); setShownMsg(`${h.name} does not throw a ${handWord(hand)} ${lc} in the data (${h.season}).`); return }
    setShownMsg(''); setShown({ name: h.name, team: h.team, hb: p.shape.hb, ivb: p.shape.ivb, velo: p.shape.velo })
  }
  const shownStats = shown ? win(shown.hb, shown.ivb) : null

  const ticks: number[] = [], yticks: number[] = []
  if (payload) {
    for (let v = Math.ceil(payload.hb0 - HALF); v <= Math.floor(payload.hb0 + HALF); v++) if (v % 5 === 0) ticks.push(v)
    for (let v = Math.ceil(payload.ivb0 - HALF); v <= Math.floor(payload.ivb0 + HALF); v++) if (v % 5 === 0) yticks.push(v)
  }
  const toBox = (hb: number, ivb: number) => (grid ? { x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) } : { x: 0, y: 0 })
  const barPos = (v: number) => Math.max(0, Math.min(100, ((v - 0.05) / 0.35) * 100))
  const hbToPct = (v: number) => (payload ? ((v - (payload.hb0 - HALF)) / (2 * HALF)) * 100 : 0)

  return (
    <div className="pf2-root">
      <style>{PV_CSS}</style>
      <style>{'.pf2-root .pv-pill{border-radius:4px}@media(max-width:960px){.pf2-grid{grid-template-columns:1fr !important}} .pf2-pill{min-height:44px;padding:0 16px;font-size:14px}'}</style>

      {/* the heading and the long explanation moved to the guide page; the heading stays for screen readers and search */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Pitch Shape Lab: which {lc}s make hitters miss, and who throws them</h1>

      {v3 && <V3Intro goal="whiff" onGoal={() => setMeasure('whiff')} lc={lc} offUrl="/mlb/lab/pitch-shape" />}
      <LevelBar trailing={<>
        <div role="tablist" aria-label="Pitch Shape Lab views" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button role="tab" aria-selected={view === 'map'} type="button" onClick={() => setView('map')} style={tabStyle(view === 'map')}>League map</button>
        <button role="tab" aria-selected={view === 'changes'} type="button" onClick={() => setView('changes')} style={tabStyle(view === 'changes')}>What changed</button>
        {tabPitcher && (
          <span style={{ display: 'inline-flex', gap: 0 }}>
            <button role="tab" aria-selected={view === 'pitcher'} type="button" onClick={() => setView('pitcher')} style={{ ...tabStyle(view === 'pitcher'), borderRadius: '4px 0 0 4px' }}>{tabPitcher.name}</button>
            <button type="button" aria-label={`Close the ${tabPitcher.name} tab`} onClick={() => { setTabPitcher(null); setView('map') }} style={{ ...tabStyle(false), borderRadius: '0 4px 4px 0', borderLeft: 0, minWidth: 44 }}>×</button>
          </span>
        )}
        </div>
        {view === 'map' && <button type="button" aria-expanded={readOpen} onClick={() => setReadOpen(o => !o)} style={{ ...tabStyle(false), minHeight: 40, fontSize: 13 }}>{readOpen ? 'Hide how to read' : 'How to read'}</button>}
        <Link href="/mlb/lab/pitch-shape/guide" style={{ color: ORANGE_TEXT, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>Guide →</Link>
      </>} />
      {view === 'map' && readOpen && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '10px 14px', marginBottom: 8 }}>
        <div className="pf2-read" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, margin: '2px 0 10px' }}>
          <style>{'@media(max-width:800px){.pf2-read{grid-template-columns:1fr !important}}'}</style>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>1 · The squares are not the strike zone.</b> Each square is a way a pitch can <i>move</i>: further right means more run toward the pitcher’s arm side, higher means more ride. Where the pitch crosses the plate is the separate plate view on the right.</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>2 · The colour is how often hitters miss.</b> For every {lc} that moves like that square, orange means more swings missed than the league average, blue-grey fewer. Blank means too few swings to say.</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>3 · Choose a red area.</b> That movement is the most effective shape. Below it are the pitchers who throw it: those getting the results the shape usually gets, and those who are not, which suggests something other than the shape is holding them back.</div>
        </div>
        </div>
      )}
      {view === 'changes' && <ShapeChanges season={latest} onOpen={openPitcher} />}
      {view === 'pitcher' && tabPitcher && <PitcherTab pitcherId={tabPitcher.id} season={latest} isPro={isPro} onClose={() => setView('map')} />}
      <div style={{ display: view === 'map' ? undefined : 'none' }}>
      <div className="pf2-filters" role="group" aria-label="Filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'flex-end', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 12px', margin: '0 0 8px' }}>
        <label style={fLabel}><span className="pv-k">Pitch</span>
          <select value={type} onChange={e => setType(e.target.value)} style={fSelect} aria-label="Pitch type">
            {types.map(t => { const lockedT = !isPro && !lookLeft && !isFree(t); return <option key={t} value={t} disabled={lockedT}>{PITCH_NAMES[t] ?? t}{lockedT ? ' (Pro)' : ''}</option> })}
          </select>
        </label>
        <div style={fLabel}><span className="pv-k">Thrown by</span>
          <span style={{ display: 'inline-flex' }} role="group" aria-label="Thrown by">
            <button type="button" aria-pressed={hand === 'R'} onClick={() => setHand('R')} style={fSeg(hand === 'R', true)}>Right</button>
            <button type="button" aria-pressed={hand === 'L'} onClick={() => setHand('L')} style={{ ...fSeg(hand === 'L', false), borderRadius: 0 }}>Left</button>
            <button type="button" aria-pressed={hand === 'B'} onClick={() => setHand('B')} style={fSeg(hand === 'B', false)} title="Left- and right-handed pitches together on one map">Both</button>
          </span>
        </div>
        <label style={fLabel}><span className="pv-k">Colour by</span>
          <select value={measure} onChange={e => setMeasure(e.target.value as 'whiff' | MetricId)} style={fSelect} aria-label="Colour the map by">
            <option value="whiff">Whiffs per swing</option>
            {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label style={fLabel}><span className="pv-k">League pitches<InfoTip k="leaguePitches" /></span>
          <select value={span} onChange={e => setSpan(e.target.value as Span)} style={fSelect} aria-label="Which seasons of league pitches">
            <option value="latest">{latest} only</option>
            {payload && payload.seasons.length > 1 && <option value="all">{payload.seasons[0].season}–{latest}</option>}
          </select>
        </label>
        <label style={fLabel}><span className="pv-k">Window<InfoTip k="window" /></span>
          <select value={radius} onChange={e => setRadius(Number(e.target.value) as (typeof RADII)[number])} style={fSelect} aria-label="Size of the window around each box">
            {RADII.map(r => <option key={r} value={r}>±{r} in</option>)}
          </select>
        </label>
        <label style={fLabel}><span className="pv-k">Team</span>
          <select value={teamOn} onChange={e => { setTeam(e.target.value); setFocus(null) }} style={fSelect} aria-label="Show every pitcher for one team on the map">
            <option value="">All teams</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setMeasure('whiff'); setSpan('latest'); setRadius(1); setHand('R'); setPlace(null); setFocus(null); setTeam('') }} style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Reset</button>
      </div>

      {!mlb && !locked && (
        <RefinePanel level={level} refine={refine} setRefine={setRefine} shape={shapeRefine} setShape={setShapeRefine} statuses={statuses} lc={lc}
          matched={refineIds ? refineIds.size : universe.size} total={universe.size} />
      )}

      {locked ? <div><Empty>The {lc} map: four-seam and sweeper are free.</Empty><UpgradePrompt source="pitch_shape" /></div>
        : payload === undefined ? <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading the league map…</div>
        : payload === null || !grid || leagueRate == null ? <Empty>{mlb ? <>The 0.1-inch league map isn’t built for {handWord(hand)} {lc}s yet.</> : caps && caps.coverage === 'none' ? <>No {LEVEL_LABEL[level]} data is loaded yet.</> : <>{LEVEL_LABEL[level]} has no {handWord(hand)} {lc} map in the data yet.</>}</Empty>
        : (
        <>
        <div id="pf2-selected" role="status" aria-live="polite" style={{ background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.orange}`, borderRadius: 8, padding: '12px 16px', margin: '4px 0 10px', display: 'flex', flexWrap: 'wrap', gap: '8px 22px', alignItems: 'center' }}>
          {(() => {
            const k2: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, textTransform: 'uppercase', color: ORANGE_TEXT }
            const big: React.CSSProperties = { fontWeight: 800, fontSize: 22, letterSpacing: '-.01em', lineHeight: 1.1 }
            const num: React.CSSProperties = { fontWeight: 800, fontSize: 17, fontVariantNumeric: 'tabular-nums' }
            const sub: React.CSSProperties = { fontSize: 12.5, color: '#5b5347', lineHeight: 1.4 }
            const bt: React.CSSProperties = { minHeight: 38, padding: '0 14px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }
            if (focus != null) {
              const fr = board?.rows.find(r => r.pitcherId === focus) ?? null
              const nm = fr?.name ?? focusDot?.name ?? 'this pitcher', tm = fr?.teamAbbr ?? focusDot?.teamAbbr ?? ''
              const v = fr?.velo ?? focusDot?.velo ?? null, ride = fr?.ivb ?? focusDot?.ivb ?? null, run = fr?.hb ?? focusDot?.hb ?? null
              return (
                <>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={k2}>Pitcher selected · his {lc}</div>
                    <div style={big}>{nm}{tm ? <span style={{ fontWeight: 600, color: C.mute, fontSize: 16 }}> · {tm}</span> : null}</div>
                    <div style={sub}>Only his {lc}s are on the map. His full read is below.</div>
                  </div>
                  {ride != null && run != null && (
                    <div style={{ display: 'flex', gap: 18 }}>
                      <div><div style={k2}>Ride</div><div style={num}>{ride.toFixed(1)} in</div></div>
                      <div><div style={k2}>Run</div><div style={num}>{run.toFixed(1)} in</div></div>
                      {v != null && <div><div style={k2}>Speed</div><div style={num}>{v.toFixed(1)} mph</div></div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href="#pf2-detail" style={bt}>See his read ↓</a>
                    <button type="button" onClick={() => setFocus(null)} style={bt}>Clear</button>
                  </div>
                </>
              )
            }
            if (place && spotName) {
              return (
                <>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={k2}>Shape selected</div>
                    <div style={{ ...big, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{spotName.name}{tone && <span style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: tone === 'red' ? '#FFE4D6' : tone === 'blue' ? '#E3EAF2' : C.soft, color: tone === 'red' ? ORANGE_TEXT : tone === 'blue' ? '#3F5F86' : '#5b5347' }}>{tone === 'red' ? 'HIGH-MISS SHAPE' : tone === 'blue' ? 'LOW-MISS SHAPE' : 'ORDINARY SHAPE'}</span>}</div>
                    <div style={sub}>{spotName.why}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <div><div style={k2}>Ride</div><div style={num}>{place.ivb.toFixed(1)} in</div></div>
                    <div><div style={k2}>Run</div><div style={num}>{place.hb.toFixed(1)} in</div></div>
                    <div><div style={k2}>Window</div><div style={num}>±{radius} in</div></div>
                    {placeRate != null && <div><div style={k2}>Hitters miss</div><div style={num}>{(placeRate * 100).toFixed(1)}%{diffPts != null ? <span style={{ fontSize: 12.5, fontWeight: 700, color: '#5b5347' }}> {pts(diffPts)} vs avg</span> : null}</div></div>}
                  </div>
                </>
              )
            }
            return (
              <div style={{ flex: '1 1 260px' }}>
                <div style={k2}>No shape selected yet</div>
                <div style={{ ...big, fontSize: 18 }}>Click anywhere on the map to dial in a pitch movement</div>
                <div style={sub}>You get its results, and who throws it, over- and under-performing.</div>
              </div>
            )
          })()}
        </div>
        <div className="pf2-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16, alignItems: 'start', marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.4, margin: '0 0 6px' }}><b style={{ color: C.ink }}>↑ More ride:</b> the ball drops less than the hitter expects. <b style={{ color: C.ink }}>→ More run:</b> it moves further toward the pitcher’s arm side. Click anywhere to change the shape.</div>
            {carryMsg && <div role="status" style={{ background: C.soft, border: `1px solid ${C.line}`, borderRadius: 6, padding: '9px 12px', fontSize: 13.5, color: '#3a352c', marginBottom: 10 }}>{carryMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr)', gridTemplateRows: 'auto 22px', maxWidth: 'max(420px, min(100%, calc(100vh - 160px)))', margin: '0 auto' }}>
              <div style={{ position: 'relative' }}>
                {yticks.map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((payload.ivb0 + HALF - v) / (2 * HALF)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10.5, color: C.mute }}>{v}</span>)}
              </div>
              <div id="pf2-map" style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', background: '#EDE8DC' }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ hb: payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF, x: e.clientX - r.left, y: e.clientY - r.top }) }}
                onMouseLeave={() => setHover(null)}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const hb = payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb = payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF
                  if (teamOn && focus == null) {   // with a team chosen, a click close to one of his pitchers picks that pitcher; anywhere else dials in a movement
                    let best: (typeof teamDots)[number] | null = null, bd = 1.6
                    for (const d of teamDots) { const dd = Math.hypot(d.hb - hb, d.ivb - ivb); if (dd < bd) { bd = dd; best = d } }
                    if (best) { setFocus(best.pitcherId); return }
                  }
                  setShowAll(false); setFocus(null); setSide('shape'); setPlace({ hb: Math.round(hb * 10) / 10, ivb: Math.round(ivb * 10) / 10, spot: null })
                }}>
                <canvas ref={canvasRef} role="img" aria-label={`League ${lc} movement map: each square is a way a pitch moves (ride up, run right), coloured by how often hitters miss. It is not the strike zone.`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
                <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {place && (() => { const b = toBox(place.hb, place.ivb), h = Math.round(radius * 10); return <rect x={b.x - h} y={b.y - h} width={2 * h} height={2 * h} fill="rgba(255,255,255,.08)" stroke={C.ink} strokeWidth={N / 200} strokeDasharray="4 3" /> })()}
                  {focusT && focusT.points.map((p, i) => { const b = toBox(p[0], p[1]), inside = inBox(p[0], p[1]); return <circle key={i} cx={b.x} cy={b.y} r={N / 120} fill={inside ? C.orange : C.ink} fillOpacity={inside ? 1 : 0.6} stroke={inside ? C.ink : 'none'} strokeWidth={N / 700} /> })}
                  {focusT && (() => { const b = toBox(focusT.hb, focusT.ivb); return <circle cx={b.x} cy={b.y} r={N / 38} fill="none" stroke={C.ink} strokeWidth={N / 130} /> })()}
                  {shown && (() => { const b = toBox(shown.hb, shown.ivb); return <circle cx={b.x} cy={b.y} r={N / 38} fill="none" stroke={C.ink} strokeWidth={N / 130} /> })()}
                  {teamOn && focus == null && teamLabels.map(l => { const d = teamDots.find(x => x.pitcherId === l.id); if (!d) return null; const b = toBox(d.hb, d.ivb); return l.leader ? <line key={`l${l.id}`} x1={b.x} y1={b.y} x2={l.x} y2={l.y - N / 120} stroke={C.ink} strokeWidth={N / 600} strokeOpacity={0.55} /> : null })}
                  {teamOn && focus == null && teamDots.map(d => { const b = toBox(d.hb, d.ivb); return <circle key={d.pitcherId} cx={b.x} cy={b.y} r={N / 70} fill={C.orange} fillOpacity={0.92} stroke={C.ink} strokeWidth={N / 220} /> })}
                  {teamOn && focus == null && teamLabels.map(l => <text key={`t${l.id}`} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={N / 44} fontWeight={800} fill={C.ink} stroke="#EDE8DC" strokeWidth={N / 190} paintOrder="stroke">{l.text}</text>)}
                  {showLevels && (hand === 'B' ? (['R', 'L'] as const) : ([hand] as const)).flatMap(h => { const cd = h === 'R' ? cmpR : cmpL; return (cd ? cd.levels : []).map(l => ({ l, h })) }).map(({ l, h }) => { const b = toBox(l.mean.hb, l.mean.ivb); return (
                    <g key={`${l.level}${h}`}><circle cx={b.x} cy={b.y} r={N / 42} fill={LEVEL_COLOUR[l.level]} fillOpacity={0.18} stroke={LEVEL_COLOUR[l.level]} strokeWidth={N / 110} strokeDasharray={hand === 'B' && h === 'L' ? `${N / 90} ${N / 140}` : undefined} />
                      <text x={b.x} y={b.y - N / 34} textAnchor="middle" fontSize={N / 40} fontWeight={800} fill={LEVEL_COLOUR[l.level]} stroke="#EDE8DC" strokeWidth={N / 190} paintOrder="stroke">{LEVEL_SHORT[l.level]}{hand === 'B' ? ` ${h}` : ''}</text></g>) })}
                </svg>
                {hover && metric && rGrid && rLeague && (() => {
                  const m = measuresOf(windowSums(rGrid, Math.round(hover.hb * 10), Math.round(hover.ivb * 10), r10), lim.gated), v = metric.get(m, rLeague)
                  return (
                    <div style={{ position: 'absolute', left: Math.min(hover.x + 12, 9999), top: hover.y + 12, background: C.ink, color: '#fff', fontSize: 12, padding: '6px 9px', borderRadius: 4, pointerEvents: 'none', whiteSpace: 'nowrap', transform: hover.x > 260 ? 'translateX(-110%)' : undefined }}>
                      {v == null ? `${m.pitches.toLocaleString()} pitches · too few to show ${metric.label.toLowerCase()}` : `${metric.label}: ${metric.fmt(v)} · ${m.pitches.toLocaleString()} pitches`}
                    </div>)
                })()}
                {hover && !metric && (() => { const w = win(hover.hb, hover.ivb); return w ? (
                  <div style={{ position: 'absolute', left: Math.min(hover.x + 12, 9999), top: hover.y + 12, background: C.ink, color: '#fff', fontSize: 12, padding: '6px 9px', borderRadius: 4, pointerEvents: 'none', whiteSpace: 'nowrap', transform: hover.x > 260 ? 'translateX(-110%)' : undefined }}>
                    {w.rate != null ? `${(w.rate * 100).toFixed(1)}% of ${w.swings.toLocaleString()} swings miss · ${w.swings >= lim.strongSwings ? 'strong' : 'thin'} sample` : `${w.swings} swings · ${w.swings === 0 ? 'none here' : `under ${lim.windowSwings}`}, not estimated`}
                  </div>) : null })()}
              </div>
              <div />
              <div style={{ position: 'relative' }}>
                {ticks.map(v => <span key={v} style={{ position: 'absolute', left: `${hbToPct(v)}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10.5, color: C.mute }}>{v}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, margin: '2px 0 8px', paddingLeft: 26 }}><span>↑ RIDE (INDUCED VERTICAL BREAK, IN)</span><span>RUN (ARM-SIDE BREAK, IN) →</span></div>

            {metric && <div style={{ marginBottom: 10 }}>{rGrid ? <ResultsLegend metric={metric} lc={lc} level={level} /> : <div style={{ fontSize: 13, color: '#5b5347', padding: '8px 2px' }}>{resPayload === undefined ? 'Loading what these shapes have produced…' : 'What these shapes have produced isn’t built for this pitch yet; it fills after the weekly shape-results job runs.'}</div>}</div>}
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', fontSize: 13 }}>
              {!metric && <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, flexWrap: 'wrap' }}>
                <span>Fewer misses than average</span>
                <span style={{ flex: 1, minWidth: 120, maxWidth: 340, height: 12, borderRadius: 3, position: 'relative', background: 'linear-gradient(90deg,#5E7A99 0%,#F4EEE3 50%,#FF8A50 75%,#A8300E 100%)' }}><i style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 18, background: C.ink }} /></span>
                <span>More misses than average</span>
              </div>}
              {!metric && <div style={{ color: '#5b5347', marginTop: 6 }}>League average: <b style={{ color: C.ink }}>{(leagueRate * 100).toFixed(1)}%</b> of swings miss</div>}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12.5, color: '#3a352c' }}>
                {focus != null && <button type="button" onClick={() => setFocus(null)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: '#fff7f3', color: ORANGE_TEXT, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Clear selected pitcher</button>}
                <button type="button" aria-pressed={showLevels} disabled={!cmpData || cmpData.levels.length === 0} onClick={() => setShowLevels(v => !v)} title="Draw the average pitch at every level we hold" style={{ minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1px solid ${showLevels ? C.ink : C.line}`, background: showLevels ? C.ink : '#fff', color: showLevels ? '#fff' : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: cmpData && cmpData.levels.length ? 1 : 0.5 }}>{showLevels ? 'Level averages: on' : 'Level averages: off'}</button>
                {teamOn && teamDots.length > 0 && <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b>{teamOn} {lc} throwers, each dot is his average movement on the map:</b>
                  {teamDots.map(d => <button key={d.pitcherId} type="button" onClick={() => setFocus(f => (f === d.pitcherId ? null : d.pitcherId))} style={{ minHeight: 34, padding: '0 10px', borderRadius: 4, border: `1px solid ${focus === d.pitcherId ? C.ink : C.line}`, background: focus === d.pitcherId ? C.ink : '#fff', color: focus === d.pitcherId ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{d.name}</button>)}
                </div>}
              </div>
              <div style={{ color: '#5b5347', marginTop: 4, fontSize: 12.5 }}>Faded squares = thinner sample ({lim.windowSwings}–{lim.strongSwings} swings) · blank = {lim.gated ? <>under {lim.windowSwings}, not estimated</> : <>no swing recorded; a square with few swings is pulled toward the league average, so one swing cannot paint it red or blue</>}</div>
            </div>

            {place && (
              <details style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.55, color: '#3a352c', marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, minHeight: 28 }}>What is drawn on the map</summary>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><rect x="3" y="3" width="16" height="16" fill="none" stroke={C.ink} strokeWidth="1.6" strokeDasharray="4 3" /></svg>
                  <span><b>The dashed box</b> is the spot you clicked. Every league {lc} that moves within {radius} inch{radius === 1 ? '' : 'es'} of it, up, down, left or right, counts as “shaped like this”. The miss rate, the list of pitchers and the plate view all use those same pitches.</span>
                </div>
                {focusT ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><circle cx="7" cy="8" r="3.2" fill={C.orange} stroke={C.ink} strokeWidth="1" /><circle cx="15" cy="14" r="3.2" fill={C.ink} fillOpacity=".6" /></svg>
                      <span><b>Each dot is one of {focusT.name}’s {lc}s</b> (all {focusT.sample.toLocaleString()} with tracked movement), placed by how that pitch moved. <b style={{ color: ORANGE_TEXT }}>Orange</b> dots moved inside the dashed box, like the pitch you picked ({focusT.points.filter(p => inBox(p[0], p[1])).length} of {focusT.sample}). <b>Dark</b> dots moved differently. A tight cluster means he throws it the same way every time; a wide scatter means it moves around.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><circle cx="11" cy="11" r="7" fill="none" stroke={C.ink} strokeWidth="2" /></svg>
                      <span><b>The ring</b> marks his average {lc}: {focusT.ivb.toFixed(1)} in of ride (how much it rises against gravity), {focusT.hb.toFixed(1)} in of run (sideways toward his arm side), at {focusT.velo.toFixed(1)} mph.</span>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 8, color: '#5b5347' }}>Click a pitcher in the list beside the map, and his pitches appear here as dots with a ring at his average.</div>
                )}
              </details>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12, position: 'relative' }}>
              <b style={{ fontSize: 14 }}>Show a pitcher on this map</b>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a pitcher…" aria-label="Search a pitcher" style={{ flex: 1, minWidth: 180, minHeight: 44, border: `1px solid ${C.line}`, borderRadius: 4, padding: '0 12px', background: '#fff', fontFamily: 'inherit', fontSize: 14 }} />
              {hits.length > 0 && (
                <div style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 5, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 4, maxHeight: 240, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                  {hits.map(h => <button key={h.id} type="button" onClick={() => pickPitcher(h)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: `1px solid ${C.soft}`, padding: '10px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>{h.name} · {h.team} · {h.hand}HP</button>)}
                </div>
              )}
            </div>
            {shownMsg && <div style={{ fontSize: 13, color: '#5b5347', marginTop: 8 }}>{shownMsg}</div>}
            {shown && (
              <div style={{ fontSize: 13.5, color: '#3a352c', marginTop: 8, lineHeight: 1.5 }}>
                <b>{shown.name}</b> ({shown.team}) · his average {lc}: {shown.velo.toFixed(1)} mph, {shown.ivb.toFixed(1)} in of ride, {shown.hb.toFixed(1)} in of run (the ring on the map).{' '}
                {shownStats?.rate != null ? <>The ring is his average movement. Across the league, {lc}s that move like his get {(shownStats.rate * 100).toFixed(1)}% misses per swing ({pts((shownStats.rate - leagueRate) * 100)} vs average). The dashed box is the area you chose, so compare where the ring sits with it. To see his individual pitches as dots, find him in the “Ahead or behind the shape” section below and choose Show on map.</> : 'Too few league swings at his shape to give a rate.'}
              </div>
            )}
          </div>

          <div>
            <div role="tablist" aria-label="Side panel" style={{ display: 'flex', gap: 6, margin: '0 0 10px' }}>
              {mlb && <button role="tab" aria-selected={side === 'find'} type="button" onClick={() => setSide('find')} style={tabStyle(side === 'find')}>Find a pitcher</button>}
              <button role="tab" aria-selected={side === 'shape'} type="button" onClick={() => setSide('shape')} style={tabStyle(side === 'shape')}>This shape{place ? '' : ' (click the map)'}</button>
            </div>
            <div style={{ display: side === 'find' && mlb ? undefined : 'none' }}>
              <FindPitcher board={board} lc={lc} hand={hand} team={teamOn} onMatches={setMapIds} headshot={id => headshotCutoutUrl(id, 240)} onPick={r => { setShowAll(false); setPlace({ hb: Math.round(r.hb * 10) / 10, ivb: Math.round(r.ivb * 10) / 10, spot: null }); setFocus(r.pitcherId); if (typeof document !== 'undefined') setTimeout(() => document.getElementById('pf2-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150) }} />
            </div>
            <div style={{ display: side === 'shape' ? undefined : 'none' }}>
            {place && placeStats && spotName ? (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 14 }}>
                {rGrid && rLeague ? (() => {
                  const here = measuresOf(windowSums(rGrid, Math.round(place.hb * 10), Math.round(place.ivb * 10), r10), lim.gated), saved = runsSaved(here, rLeague)
                  const score = saved != null && board && board.dist.length ? percentile(board.dist, saved) : null
                  return <ResultsReadout flush level={level} here={here} league={rLeague} saved={saved} score={score} lc={lc} radius={radius} spanLabel={span === 'latest' ? String(latest) : `${payload.seasons[0].season}–${latest}`} />
                })() : <div style={{ fontSize: 13, color: '#5b5347' }}>{resPayload === undefined ? 'Loading what this shape has produced…' : 'What these shapes have produced isn’t built for this pitch yet; it fills after the weekly shape-results job runs.'}</div>}
                {placeRate == null && <p style={{ fontSize: 13.5, color: '#5b5347', margin: '10px 0 0' }}>{lim.gated ? <>Under {lim.windowSwings} swings of league {lc}s move like this, so no rate is shown.</> : <>No swing at league {lc}s that move like this has been recorded, so no rate is shown.</>} Choose a coloured square.</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5, color: '#5b5347' }}>
                  <span style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: placeStats.swings >= SPOT_MIN_SWINGS ? '#FFE4D6' : C.soft, color: placeStats.swings >= SPOT_MIN_SWINGS ? ORANGE_TEXT : C.ink }}>{placeStats.swings >= SPOT_MIN_SWINGS ? 'STRONG SAMPLE' : placeStats.swings >= lim.strongSwings ? 'MODERATE SAMPLE' : 'THIN SAMPLE'}</span>
                  <span>{placeStats.swings.toLocaleString()} swings within ±{radius} in of this movement</span>
                </div>
              </div>
            ) : <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 14, fontSize: 14, color: '#5b5347' }}>Click anywhere on the map to dial in a pitch movement and see what it is worth and who throws it.</div>}

            {place && <div style={{ marginBottom: 14 }}><ShapePlayersPanel level={level} only={idFilter} chipsFor={chipsFor} board={board} hb={place.hb} ivb={place.ivb} radius={radius} lc={lc} selectedId={focus} overall={overall} shapeAt={shapeAt} bins={shapeBins} diagnosis={diagnosis} pitchType={type} season={payload?.latest ?? null} exportMap={null} onSelect={setFocus} onOpen={openPitcher} headshot={id => headshotCutoutUrl(id, 240)} /></div>}

            {place && (
              <details style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 16px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 16, minHeight: 28 }}>What it looks like on the plate</summary>
                {hand === 'B' && <p role="note" style={{ margin: '8px 0 0', fontSize: 13, color: '#5b5347' }}>Where a pitch crosses the plate is seen from behind it, so it is different for left- and right-handers. This view shows right-handed pitches; choose Left to see left-handed ones.</p>}
                <h3 style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 700 }}>Where these pitches cross, and how they travel</h3>
                <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 8px' }}>The map above is movement. This is the other half: where pitches that move like your chosen spot cross the plate, from the batter’s side.</p>
                <div className="pf2-plate" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'start' }}>
                  <LocationPanel pitchType={type} hand={dataHand} probe={{ hb: place.hb, ivb: place.ivb }} radius={radius} span={span} scope="league" pitchName={name} explainHeight onSummary={setPlate} />
                  <div style={{ minWidth: 0 }}>
                    <div className="pv-k" style={{ marginBottom: 4 }}>How it travels</div>
                    {flight ? (
                      <>
                        <div style={{ maxWidth: 300 }}><FlightPlayer key={`${place.hb}|${place.ivb}|${slow}|${type}|${hand}`} paths={[flight]} slow={slow} showPlate /></div>
                        <SpeedToggle slow={slow} setSlow={setSlow} />
                        <p style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, margin: '6px 0 0' }}>
                          A {lc} with {place.ivb.toFixed(1)} in of ride and {place.hb.toFixed(1)} in of run, thrown at about {flightSpeed.mph.toFixed(0)} mph, from behind the plate. The dashed box is the strike zone and the ball ends where these pitches cross on average, drawn for a right-handed batter.
                        </p>
                        <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, margin: '4px 0 0' }}>Illustrative: the movement, speed ({flightSpeed.real ? 'the average of pitchers who throw this shape' : 'a typical speed for the pitch'}) and where it crosses come from your choice; the release point is a typical one for {hand === 'L' ? 'left' : 'right'}-handers.</p>
                      </>
                    ) : <p style={{ fontSize: 13, color: '#5b5347' }}>{plate === null ? 'Too few pitches near this spot to draw how it travels.' : 'Drawing…'}</p>}
                  </div>
                </div>
              </details>
            )}
            </div>
          </div>
        </div>
        </>
      )}

      {!locked && payload && grid && place && focus != null && (
        <div style={{ marginTop: 14 }}><ShapePlayerDetail level={level} dialed={place ? { hb: place.hb, ivb: place.ivb } : null} levelAvg={levelAvg} focusHand={focusHand} diag={focusDot?.diag ?? null} leagueDiag={leagueAll} board={board} selectedId={focus} overall={overall} shapeAt={shapeAt} bins={shapeBins} diagnosis={diagnosis} pitchType={type} season={payload?.latest ?? null} exportMap={payload && grid && leagueRate != null ? { payload, span, leagueRate, points: focusPts ?? [] } : null} lc={lc} onSelect={setFocus} onOpen={openPitcher} headshot={id => headshotCutoutUrl(id, 240)} /></div>
      )}



      {!locked && payload && grid && (
        <>{(hand === 'B' ? (['R', 'L'] as const) : ([hand] as const)).map(h => <LevelsCompared key={h} data={h === 'R' ? cmpR : cmpL} active={level} type={type} hand={h} pitchName={name} place={place ? { hb: place.hb, ivb: place.ivb } : null} radius={radius} />)}</>
      )}

      {!locked && payload && grid && (
        <details style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 16, minHeight: 32 }}>Every pitcher: the Shape Score board for {lc}s</summary>
          <ShapeScoreBoard board={board} lc={lc} hand={hand} onShow={showOnMap} />
        </details>
      )}

      <div className="pf2-foot" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 24, borderTop: `1px solid ${C.line}`, marginTop: 26, paddingTop: 14, fontSize: 13.5, lineHeight: 1.55, color: '#5b5347' }}>
        <style>{'@media(max-width:800px){.pf2-foot{grid-template-columns:1fr !important}}'}</style>
        <div><b style={{ color: C.ink }}>What a square means.</b> Every league {lc} within ±{radius} inch of that square’s movement: of the swings at them, the share that missed. It is a movement shape, not a place in the zone.</div>
        <div><b style={{ color: C.ink }}>What it can’t tell you.</b> Command, deception and sequencing aren’t in the map. It describes what pitches like this have done; it doesn’t predict.</div>
        <div><b style={{ color: C.ink }}>Why some squares are blank.</b> {lim.gated ? <>Under {lim.windowSwings} swings is too few to trust, so we leave it empty rather than guess.</> : <>A square is blank only where no swing has been recorded at all; a short season has only a small minimum (30 pitches for a pitcher to be listed), so every other square shows, thin ones faded and pulled toward the average.</>}</div>
      </div>
      </div>
    </div>
  )
}

const fLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
const fSelect: React.CSSProperties = { minHeight: 40, minWidth: 150, border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', padding: '0 10px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }
const fSeg = (on: boolean, first: boolean): React.CSSProperties => ({ minHeight: 40, minWidth: 64, padding: '0 14px', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#FAF8F3' : C.ink, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', borderRadius: first ? '4px 0 0 4px' : '0 4px 4px 0', marginLeft: first ? 0 : -1 })
const tabStyle = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 16px', borderRadius: 4, border: `1px solid ${on ? '#1A1A1A' : '#e7e2d8'}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#FAF8F3' : '#1A1A1A', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' })
