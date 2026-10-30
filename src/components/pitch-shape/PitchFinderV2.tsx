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
import ShapeResultsSection, { type ResultRow } from './ShapeResultsSection'
import FollowIsland from '@/components/signup/FollowIsland'
import PitcherTab from './PitcherTab'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import { FlightPlayer, SpeedToggle } from '@/components/pitching-lab/PitchFlight'
import { buildFlight } from '@/lib/sequencing-lab/flight'
import { makeGrid, stats, type Grid, type Span } from './heatGrid'
import {
  ABOUT_LEVEL_PTS, MAP_BG, MIN_OWN_SWINGS, MIN_WINDOW_SWINGS, SPOT_MIN_SWINGS, STRONG_SWINGS,
  boxColour, extremes, movementStats, nameSpot, rateDots, rateThrowers, splitThrowers, toneLine, toneOf,
} from './finder-math'

const HALF = 12
const RADII = [0.5, 1, 2] as const
const ORANGE_TEXT = '#B83A0E'   // small orange text that passes contrast
// The animation uses a typical release point for the hand (only the movement, speed and where it crosses come from the chosen spot).
const RELEASE = { R: { x: -1.9, z: 5.9, ext: 6.3 }, L: { x: 1.9, z: 5.9, ext: 6.3 } } as const
const TYPICAL_MPH: Record<string, number> = { FF: 94.5, SI: 94, FC: 89, SL: 86, ST: 82, SV: 81, CU: 79, KC: 80, CH: 86, FS: 85 }
const SPOT = { fill: '#fff', ink: '#B83A0E' }   // numbered spot markers: white with orange text, orange when chosen (no yellow, no black)
type Spot = { hb: number; ivb: number; rate: number; swings: number }
type Place = { hb: number; ivb: number; spot: number | null }

const cache = new Map<string, MovementCellsPayload | null>()

/** The most effective places: highest miss rate with 200+ swings in the window, at least 4 in apart. */
function topSpots(g: Grid, r10: number, n = 3, minGapIn = 4): Spot[] {
  const found: Spot[] = []
  const lo = g.m10, hi = g.size - g.m10
  for (let y = lo; y < hi; y += 5) for (let x = lo; x < hi; x += 5) {
    const s = stats(g, g.gx0 + x, g.gy0 + y, r10)
    if (s.swings >= SPOT_MIN_SWINGS) found.push({ hb: (g.gx0 + x) / 10, ivb: (g.gy0 + y) / 10, rate: s.whiffs / s.swings, swings: s.swings })
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

export default function PitchFinderV2({ isPro, lookLeft = false, pitchTypes }: { isPro: boolean; lookLeft?: boolean; pitchTypes: string[] }) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const [type, setType] = useState(pitchTypes.find(isFree) ?? pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<Hand>('R')
  const [span, setSpan] = useState<Span>('latest')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  const key = `${type}|${hand}`
  const [payload, setPayload] = useState<MovementCellsPayload | null | undefined>(cache.get(key))   // undefined = loading
  const [place, setPlace] = useState<Place | null>(null)
  const [hover, setHover] = useState<{ hb: number; ivb: number; x: number; y: number } | null>(null)
  const [throwers, setThrowers] = useState<ApiThrower[] | null | undefined>(null)
  const [league, setLeague] = useState<Diag | null>(null)
  const [leagueAll, setLeagueAll] = useState<Diag | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PitcherHit[]>([])
  const [shown, setShown] = useState<{ name: string; team: string; hb: number; ivb: number; velo: number } | null>(null)
  const [shownMsg, setShownMsg] = useState('')
  const [plate, setPlate] = useState<{ plateX: number; plateZ: number; n: number } | null>(null)
  const [slow, setSlow] = useState(6)
  const [focus, setFocus] = useState<number | null>(null)   // the chosen pitcher: his sampled pitches drawn as dots, a ring at his average
  const [dots, setDots] = useState<PitcherDot[]>([])
  const [showDots, setShowDots] = useState(true)
  const [focusPts, setFocusPts] = useState<[number, number][] | null>(null)
  const [tabPitcher, setTabPitcher] = useState<{ id: number; name: string } | null>(null)   // the pitcher tab, once one is opened
  const [view, setView] = useState<'map' | 'pitcher'>('map')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const locked = !isPro && !lookLeft && !isFree(type)
  const name = PITCH_NAMES[type] ?? type
  const lc = name.toLowerCase()

  useEffect(() => {
    setPlace(null); setThrowers(null); setShown(null); setShownMsg(''); setShowAll(false); setFocus(null); setFocusPts(null); setDots([]); setTabPitcher(null); setView('map')
    if (locked) { setPayload(null); return }
    if (cache.has(key)) { setPayload(cache.get(key)); return }
    setPayload(undefined)
    let live = true
    fetch(`/api/mlb/pitch-shape/cells?type=${type}&hand=${hand}&center=league&half=${HALF}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { payload: MovementCellsPayload | null }) => { cache.set(key, j.payload); if (live) setPayload(j.payload) })
      .catch(e => { console.error('[PitchFinderV2] cells fetch failed:', e instanceof Error ? e.message : e); if (live) setPayload(null) })
    return () => { live = false }
  }, [key, type, hand, locked])

  const grids = useMemo(() => (payload ? { latest: makeGrid(payload, 'latest'), all: makeGrid(payload, 'all') } : null), [payload])
  const grid = grids ? grids[span] : null
  const N = grid ? 2 * grid.h10 + 1 : 0
  const r10 = Math.round(radius * 10)
  const leagueRate = grid && grid.swings > 0 ? grid.whiffs / grid.swings : null
  const latest = payload?.latest ?? new Date().getFullYear()
  const spots = useMemo(() => (grid ? topSpots(grid, Math.max(r10, 10)) : []), [grid, r10])
  const ms = useMemo(() => {
    const se = payload ? (span === 'latest' ? payload.seasons.filter(s => s.season === payload.latest) : payload.seasons) : []
    return movementStats(se.flatMap(s => s.cells))
  }, [payload, span])

  // every pitcher on the map: one dot each, at his average movement
  useEffect(() => {
    if (!payload || locked) { setDots([]); return }
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-dots?type=${type}&hand=${hand}&season=${payload.latest}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { dots: PitcherDot[]; league?: Diag }) => { if (live) { setDots(j.dots ?? []); if (j.league) setLeagueAll(j.league) } })
      .catch(e => { console.error('[PitchFinderV2] pitcher dots fetch failed:', e instanceof Error ? e.message : e); if (live) setDots([]) })
    return () => { live = false }
  }, [payload, type, hand, locked])

  // the chosen pitcher's sampled pitches (from the list when he is in it, else fetched)
  useEffect(() => {
    if (focus == null || !payload) { setFocusPts(null); return }
    const inList = throwers?.find(t => t.pitcherId === focus)
    if (inList) { setFocusPts(inList.points); return }
    let live = true
    fetch(`/api/mlb/pitch-shape/pitcher-dots?type=${type}&hand=${hand}&season=${payload.latest}&pitcher=${focus}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { points: [number, number][] }) => { if (live) setFocusPts(j.points ?? []) })
      .catch(e => { console.error('[PitchFinderV2] pitcher points fetch failed:', e instanceof Error ? e.message : e); if (live) setFocusPts([]) })
    return () => { live = false }
  }, [focus, payload, type, hand, throwers])

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
    fetch(`/api/mlb/pitch-shape/throwers?type=${type}&hand=${hand}&hb=${place.hb.toFixed(1)}&ivb=${place.ivb.toFixed(1)}&radius=${radius}&season=${latest}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { throwers: ApiThrower[]; league?: Diag }) => { if (live) { setThrowers(j.throwers); setLeague(j.league ?? null) } })
      .catch(e => { console.error('[PitchFinderV2] throwers fetch failed:', e instanceof Error ? e.message : e); if (live) setThrowers(null) })
    return () => { live = false }
  }, [place, payload, type, hand, latest, locked, radius])

  // draw the map: one box per 0.1 in, coloured from the league rate
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid || leagueRate == null) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10)
      const rgb = boxColour(s.swings, s.whiffs, leagueRate) ?? MAP_BG
      const o = ((N - 1 - yy) * N + xx) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, r10, N, leagueRate])

  const win = (hb: number, ivb: number) => {
    if (!grid) return null
    const s = stats(grid, Math.round(hb * 10), Math.round(ivb * 10), r10)
    return { ...s, rate: s.swings >= MIN_WINDOW_SWINGS ? s.whiffs / s.swings : null }
  }
  const placeStats = place ? win(place.hb, place.ivb) : null
  const placeRate = placeStats?.rate ?? null
  const diffPts = placeRate != null && leagueRate != null ? (placeRate - leagueRate) * 100 : null
  const tone = diffPts != null ? toneOf(diffPts) : null
  const spotName = place && ms ? nameSpot(type, name, place.hb, place.ivb, ms) : null

  const rated: ResultRow[] = useMemo(() => (throwers ? rateThrowers(throwers, placeRate).map(r => ({ ...r, diag: throwers.find(t => t.pitcherId === r.pitcherId)!.diag })) : []), [throwers, placeRate])
  const split = useMemo(() => splitThrowers(rated), [rated])
  const openPitcher = (id: number, nm: string) => { setTabPitcher({ id, name: nm }); setView('pitcher'); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const showOnMap = (id: number) => { setFocus(f => (f === id ? null : id)); if (typeof document !== 'undefined') document.getElementById('pf2-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const ratedDots = useMemo(() => rateDots(dots.map(d => ({ ...d })), (hb, ivb) => {
    if (!grid) return null
    const s2 = stats(grid, Math.round(hb * 10), Math.round(ivb * 10), 10)
    return s2.swings >= MIN_WINDOW_SWINGS ? s2.whiffs / s2.swings : null
  }), [dots, grid])
  const across = useMemo(() => {
    const e = extremes(ratedDots, 6)
    const row = (r: (typeof ratedDots)[number]): ResultRow => ({ pitcherId: r.pitcherId, name: r.name, teamAbbr: r.teamAbbr, nPitches: r.nPitches, nSwings: r.nSwings, nWhiffs: r.nWhiffs, estPitches: r.nPitches, share: 1, own: r.own, gapPts: r.gapPts, verdict: r.verdict, diag: r.diag, shapeRate: r.shapeRate })
    return { ahead: e.ahead.map(row), behind: e.behind.map(row) }
  }, [ratedDots])
  const focusDot = focus != null ? ratedDots.find(d => d.pitcherId === focus) ?? null : null
  const focusT = focusDot && focusPts ? { name: focusDot.name, sample: focusPts.length, points: focusPts, hb: focusDot.hb, ivb: focusDot.ivb, velo: focusDot.velo } : null
  // speed for the animation: the average of the pitchers who throw this shape (weighted by how many land here), else a typical speed for the pitch
  const flightSpeed = useMemo(() => {
    const w = (throwers ?? []).reduce((s, t) => s + t.estPitches, 0)
    return w > 0 && throwers ? { mph: throwers.reduce((s, t) => s + t.velo * t.estPitches, 0) / w, real: true } : { mph: TYPICAL_MPH[type] ?? 90, real: false }
  }, [throwers, type])
  const flight = useMemo(() => {
    if (!place || !plate) return null
    const r = RELEASE[hand]
    return buildFlight(type, name, { plateX: plate.plateX, plateZ: plate.plateZ, relX: r.x, relZ: r.z, ext: r.ext, speed: flightSpeed.mph, spin: null, hb: place.hb, ivb: place.ivb, hand }, plate.n)
  }, [place, plate, hand, type, name, flightSpeed])
  const inBox = (hb: number, ivb: number) => !!place && Math.abs(hb - place.hb) <= radius && Math.abs(ivb - place.ivb) <= radius

  // "show a pitcher on this map": his average shape as a ring, and what the league gets at that shape
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    let live = true
    const t = setTimeout(() => {
      fetch(`/api/mlb/pitch-shape/pitchers?q=${encodeURIComponent(term)}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { pitchers: PitcherHit[] }) => { if (live) setHits(j.pitchers ?? []) })
        .catch(e => { console.error('[PitchFinderV2] pitcher search failed:', e instanceof Error ? e.message : e); if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  const pickPitcher = (h: PitcherHit) => {
    const p = h.pitches.find(x => x.pitchType === type)
    setQ(''); setHits([])
    if (dots.some(d => d.pitcherId === h.id)) { setShown(null); setShownMsg(''); setFocus(h.id); return }   // he is on the map: choose his dot
    if (!p || h.hand !== hand) { setShown(null); setShownMsg(`${h.name} does not throw a ${hand === 'L' ? 'left' : 'right'}-handed ${lc} in the data (${h.season}).`); return }
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

      <div className="pv-k">⊕ MLB · Lab · Pitch shape</div>
      <h1 style={{ margin: '4px 0 8px', fontWeight: 800, fontSize: 'clamp(28px,4.6vw,46px)', lineHeight: 1.05, letterSpacing: '-.025em', maxWidth: 940 }}>
        Which {lc}s make hitters miss, and who throws them?
      </h1>
      <p style={{ fontSize: 15.5, lineHeight: 1.55, color: '#5b5347', maxWidth: 780, margin: '0 0 14px' }}>
        Every {hand === 'L' ? 'left' : 'right'}-handed {lc} from {span === 'latest' ? latest : `${payload?.seasons[0]?.season ?? latest}–${latest}`}, placed by how it moves. Darker orange means hitters missed more often when they swung. It shows what has happened, not a forecast.{' '}
        <Link href="/mlb/lab/pitch-map" style={{ color: ORANGE_TEXT, fontWeight: 700 }}>How this works</Link>
      </p>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px', marginBottom: 14, display: view === 'map' ? undefined : 'none' }}>
        <div className="pv-k">How to read this map</div>
        <div className="pf2-read" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 6 }}>
          <style>{'@media(max-width:800px){.pf2-read{grid-template-columns:1fr !important}}'}</style>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>1 · The squares are not the strike zone.</b> Each square is a way a pitch can <i>move</i>: further right means more run toward the pitcher’s arm side, higher means more ride. Where the pitch crosses the plate is the separate plate view on the right.</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>2 · The colour is how often hitters miss.</b> For every {lc} that moves like that square, orange means more swings missed than the league average, blue-grey fewer. Blank means too few swings to say.</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#3a352c' }}><b>3 · Choose a red area.</b> That movement is the most effective shape. Below it are the pitchers who throw it: those getting the results the shape usually gets, and those who are not, which suggests something other than the shape is holding them back.</div>
        </div>
      </div>

      <div role="tablist" aria-label="Pitch Shape Lab views" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <button role="tab" aria-selected={view === 'map'} type="button" onClick={() => setView('map')} style={tabStyle(view === 'map')}>League map</button>
        {tabPitcher && (
          <span style={{ display: 'inline-flex', gap: 0 }}>
            <button role="tab" aria-selected={view === 'pitcher'} type="button" onClick={() => setView('pitcher')} style={{ ...tabStyle(view === 'pitcher'), borderRadius: '4px 0 0 4px' }}>{tabPitcher.name}</button>
            <button type="button" aria-label={`Close the ${tabPitcher.name} tab`} onClick={() => { setTabPitcher(null); setView('map') }} style={{ ...tabStyle(false), borderRadius: '0 4px 4px 0', borderLeft: 0, minWidth: 44 }}>×</button>
          </span>
        )}
      </div>
      {view === 'pitcher' && tabPitcher && <PitcherTab pitcherId={tabPitcher.id} season={latest} isPro={isPro} onClose={() => setView('map')} />}
      <div style={{ display: view === 'map' ? undefined : 'none' }}>
      <div className="pv-row" style={{ marginTop: 0 }}>
        <span className="pv-k">Pitch</span>
        {pitchTypes.map(t => {
          const lockedT = !isPro && !lookLeft && !isFree(t)
          return <button key={t} type="button" disabled={lockedT} className={`pv-pill pf2-pill${t === type ? ' on' : ''}`} style={lockedT ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => setType(t)}>{PITCH_NAMES[t] ?? t}{lockedT && <small style={{ marginLeft: 5, fontSize: 10, fontWeight: 800, color: ORANGE_TEXT }}>PRO</small>}</button>
        })}
        <span className="pv-k" style={{ marginLeft: 10 }}>Thrown by</span>
        <button type="button" className={`pv-pill pf2-pill${hand === 'R' ? ' on' : ''}`} onClick={() => setHand('R')}>Right-handers</button>
        <button type="button" className={`pv-pill pf2-pill${hand === 'L' ? ' on' : ''}`} onClick={() => setHand('L')}>Left-handers</button>
      </div>
      <details style={{ margin: '0 0 6px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#5b5347', minHeight: 32 }}>More filters</summary>
        <div className="pv-row" style={{ marginTop: 6 }}>
          <span className="pv-k">League pitches</span>
          <button type="button" className={`pv-pill${span === 'latest' ? ' on' : ''}`} onClick={() => setSpan('latest')}>{latest} only</button>
          {payload && payload.seasons.length > 1 && <button type="button" className={`pv-pill${span === 'all' ? ' on' : ''}`} onClick={() => setSpan('all')}>{payload.seasons[0].season}–{latest}</button>}
          <span className="pv-k" style={{ marginLeft: 10 }}>Window</span>
          {RADII.map(r => <button key={r} type="button" className={`pv-pill${radius === r ? ' on' : ''}`} onClick={() => setRadius(r)}>±{r} in</button>)}
        </div>
      </details>

      {locked ? <div><Empty>The {lc} map: four-seam and sweeper are free.</Empty><UpgradePrompt source="pitch_shape" /></div>
        : payload === undefined ? <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading the league map…</div>
        : payload === null || !grid || leagueRate == null ? <Empty>The 0.1-inch league map isn’t built for {hand === 'L' ? 'left' : 'right'}-handed {lc}s yet.</Empty>
        : (
        <div className="pf2-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 20, alignItems: 'start', marginTop: 8 }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 10 }}>
              {[
                ['↑ More ride', 'The ball drops less than the hitter expects, so he swings under it.', 'M4 22 C16 21 28 14 38 6'],
                ['→ More run', 'The ball moves further toward the pitcher’s arm side than expected.', 'M4 26 C18 26 32 24 40 6'],
              ].map(([h, t, d]) => (
                <div key={h} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.35, color: '#5b5347' }}>
                  <svg width="42" height="32" viewBox="0 0 46 34" aria-hidden style={{ flex: 'none' }}><path d={d.replace('21', '22')} fill="none" stroke="#8a8275" strokeWidth="1.6" strokeDasharray="3 3" /><path d={d} fill="none" stroke={ORANGE_TEXT} strokeWidth="2" /></svg>
                  <div><b style={{ color: C.ink, display: 'block', fontSize: 13.5 }}>{h}</b>{t}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#FFF1EA', border: '1px solid #f3dccf', color: C.ink, borderRadius: 6, padding: '11px 14px', fontSize: 13.5, marginBottom: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.orange, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, flex: 'none' }}>1</span>
              <span><b>Start here:</b> click a numbered spot, or any red area, to see what makes it work and who throws a pitch like it.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr)', gridTemplateRows: 'auto 22px' }}>
              <div style={{ position: 'relative' }}>
                {yticks.map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((payload.ivb0 + HALF - v) / (2 * HALF)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10.5, color: C.mute }}>{v}</span>)}
              </div>
              <div id="pf2-map" style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', background: '#EDE8DC' }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ hb: payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF, x: e.clientX - r.left, y: e.clientY - r.top }) }}
                onMouseLeave={() => setHover(null)}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  const hb = payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb = payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF
                  if (showDots) {   // a click close to a pitcher's dot chooses him; anywhere else chooses a place
                    let best: (typeof ratedDots)[number] | null = null, bd = 0.9
                    for (const d of ratedDots) { if (focus != null && d.pitcherId !== focus) continue; const dd = Math.hypot(d.hb - hb, d.ivb - ivb); if (dd < bd) { bd = dd; best = d } }
                    if (best) { setFocus(best.pitcherId); return }
                  }
                  setShowAll(false); setPlace({ hb: Math.round(hb * 10) / 10, ivb: Math.round(ivb * 10) / 10, spot: null })
                }}>
                <canvas ref={canvasRef} role="img" aria-label={`League ${lc} movement map: each square is a way a pitch moves (ride up, run right), coloured by how often hitters miss. It is not the strike zone.`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
                <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {place && (() => { const b = toBox(place.hb, place.ivb), h = Math.round(radius * 10); return <rect x={b.x - h} y={b.y - h} width={2 * h} height={2 * h} fill="rgba(255,255,255,.08)" stroke={C.ink} strokeWidth={N / 200} strokeDasharray="4 3" /> })()}
                  {focusT && focusT.points.map((p, i) => { const b = toBox(p[0], p[1]), inside = inBox(p[0], p[1]); return <circle key={i} cx={b.x} cy={b.y} r={N / 120} fill={inside ? C.orange : C.ink} fillOpacity={inside ? 1 : 0.6} stroke={inside ? C.ink : 'none'} strokeWidth={N / 700} /> })}
                  {focusT && (() => { const b = toBox(focusT.hb, focusT.ivb); return <circle cx={b.x} cy={b.y} r={N / 38} fill="none" stroke={C.ink} strokeWidth={N / 130} /> })()}
                  {shown && (() => { const b = toBox(shown.hb, shown.ivb); return <circle cx={b.x} cy={b.y} r={N / 38} fill="none" stroke={C.ink} strokeWidth={N / 130} /> })()}
                  {showDots && ratedDots.filter(d => focus == null || d.pitcherId === focus).map(d => {   // with a pitcher chosen, only he stays on the map
                    const b = toBox(d.hb, d.ivb), on = focus === d.pitcherId
                    const fill = d.verdict === 'ahead' ? C.orange : d.verdict === 'behind' ? '#5E7A99' : d.verdict === 'level' ? '#fff' : 'none'
                    return <circle key={d.pitcherId} cx={b.x} cy={b.y} r={on ? N / 70 : N / 110} fill={fill} stroke={on ? C.ink : d.verdict ? C.ink : C.mute} strokeWidth={on ? N / 150 : N / 330} strokeOpacity={d.verdict ? 0.9 : 0.5} />
                  })}
                  {spots.map((s, i) => {
                    const b = toBox(s.hb, s.ivb), on = place?.spot === i
                    return (
                      <g key={i}>
                        <circle cx={b.x} cy={b.y} r={N / 30} fill={on ? SPOT.ink : SPOT.fill} stroke={on ? '#fff' : SPOT.ink} strokeWidth={N / 110} />
                        <text x={b.x} y={b.y + N / 95} textAnchor="middle" fontSize={N / 26} fontWeight={800} fill={on ? '#fff' : SPOT.ink}>{i + 1}</text>
                      </g>
                    )
                  })}
                </svg>
                {spots.map((s, i) => { const b = toBox(s.hb, s.ivb); return <button key={i} type="button" aria-label={`Spot ${i + 1}: ${(s.rate * 100).toFixed(0)}% of swings miss`} onClick={e => { e.stopPropagation(); setShowAll(false); setPlace({ hb: Math.round(s.hb * 10) / 10, ivb: Math.round(s.ivb * 10) / 10, spot: i }) }} style={{ position: 'absolute', left: `${(b.x / N) * 100}%`, top: `${(b.y / N) * 100}%`, width: 44, height: 44, transform: 'translate(-50%,-50%)', background: 'transparent', border: 0, cursor: 'pointer' }} /> })}
                {hover && (() => { const w = win(hover.hb, hover.ivb); return w ? (
                  <div style={{ position: 'absolute', left: Math.min(hover.x + 12, 9999), top: hover.y + 12, background: C.ink, color: '#fff', fontSize: 12, padding: '6px 9px', borderRadius: 4, pointerEvents: 'none', whiteSpace: 'nowrap', transform: hover.x > 260 ? 'translateX(-110%)' : undefined }}>
                    {w.rate != null ? `${(w.rate * 100).toFixed(1)}% of ${w.swings.toLocaleString()} swings miss · ${w.swings >= STRONG_SWINGS ? 'strong' : 'thin'} sample` : `${w.swings} swings · under ${MIN_WINDOW_SWINGS}, not estimated`}
                  </div>) : null })()}
              </div>
              <div />
              <div style={{ position: 'relative' }}>
                {ticks.map(v => <span key={v} style={{ position: 'absolute', left: `${hbToPct(v)}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10.5, color: C.mute }}>{v}</span>)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, margin: '2px 0 8px', paddingLeft: 26 }}><span>↑ RIDE (INDUCED VERTICAL BREAK, IN)</span><span>RUN (ARM-SIDE BREAK, IN) →</span></div>

            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, flexWrap: 'wrap' }}>
                <span>Fewer misses than average</span>
                <span style={{ flex: 1, minWidth: 120, maxWidth: 340, height: 12, borderRadius: 3, position: 'relative', background: 'linear-gradient(90deg,#5E7A99 0%,#F4EEE3 50%,#FF8A50 75%,#A8300E 100%)' }}><i style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 18, background: C.ink }} /></span>
                <span>More misses than average</span>
              </div>
              <div style={{ color: '#5b5347', marginTop: 6 }}>League average: <b style={{ color: C.ink }}>{(leagueRate * 100).toFixed(1)}%</b> of swings miss</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12.5, color: '#3a352c' }}>
                {focus != null && <button type="button" onClick={() => setFocus(null)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: '#fff7f3', color: ORANGE_TEXT, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Clear selected pitcher</button>}
                <button type="button" aria-pressed={showDots} onClick={() => setShowDots(v => !v)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 4, border: `1px solid ${showDots ? C.ink : C.line}`, background: showDots ? C.ink : '#fff', color: showDots ? '#fff' : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{showDots ? 'Pitchers: on' : 'Pitchers: off'}</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: '50%', background: C.orange, border: `1px solid ${C.ink}`, display: 'inline-block' }} />ahead of his own shape</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: '50%', background: '#5E7A99', border: `1px solid ${C.ink}`, display: 'inline-block' }} />behind it</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: '50%', background: '#fff', border: `1px solid ${C.ink}`, display: 'inline-block' }} />about level</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: '50%', border: `1px solid ${C.mute}`, display: 'inline-block' }} />too few swings</span>
              </div>
              <div style={{ color: '#5b5347', marginTop: 4, fontSize: 12.5 }}>Each dot is one pitcher at his average {lc}. Click one to see him. Faded squares = thinner sample ({MIN_WINDOW_SWINGS}–{STRONG_SWINGS} swings) · blank = under {MIN_WINDOW_SWINGS}, not estimated</div>
            </div>

            {place && (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: '#3a352c', marginTop: 10 }}>
                <div className="pv-k">What is drawn on the map</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><rect x="3" y="3" width="16" height="16" fill="none" stroke={C.ink} strokeWidth="1.6" strokeDasharray="4 3" /></svg>
                  <span><b>The dashed box</b> is the area you chose: every league {lc} that moves within ±{radius} in of this spot. The rate, the pitchers and the plate view all use that same box.</span>
                </div>
                {focusT ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><circle cx="7" cy="8" r="3.2" fill={C.orange} stroke={C.ink} strokeWidth="1" /><circle cx="15" cy="14" r="3.2" fill={C.ink} fillOpacity=".6" /></svg>
                      <span><b>The dots</b> are {focusT.sample} of {focusT.name}’s {lc}s, one dot per pitch, placed by how that pitch moved. <b style={{ color: ORANGE_TEXT }}>Orange dots</b> landed inside the box ({focusT.points.filter(p => inBox(p[0], p[1])).length} of {focusT.sample}); dark dots are his other pitches, so you can see how much his own pitch moves around.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none', marginTop: 1 }}><circle cx="11" cy="11" r="7" fill="none" stroke={C.ink} strokeWidth="2" /></svg>
                      <span><b>The ring</b> is his average movement: {focusT.ivb.toFixed(1)} in of ride, {focusT.hb.toFixed(1)} in of run, at {focusT.velo.toFixed(1)} mph. The dots are only a sample (up to 60), so counts are approximate.</span>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 8, color: '#5b5347' }}>Choose “Show on map” beside a pitcher below, and his pitches appear here as dots with a ring at his average.</div>
                )}
              </div>
            )}

            {focusDot && (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={headshotCutoutUrl(focusDot.pitcherId, 240)} alt="" width={64} height={64} style={{ width: 64, height: 64, flex: 'none', objectFit: 'contain', objectPosition: 'center bottom' }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <Link href={`/mlb/players/${focusDot.pitcherId}`} style={{ fontWeight: 800, fontSize: 17, color: ORANGE_TEXT, textDecoration: 'none' }}>{focusDot.name} · {focusDot.teamAbbr}</Link>
                  <div style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>
                    {focusDot.own != null && focusDot.shapeRate != null
                      ? <>His {lc}: {(focusDot.own * 100).toFixed(1)}% whiffs per swing ({focusDot.nSwings.toLocaleString()} swings). Pitches that move like his get {(focusDot.shapeRate * 100).toFixed(1)}% across the league: <b>{focusDot.verdict === 'ahead' ? 'ahead of his shape' : focusDot.verdict === 'behind' ? 'behind his shape' : 'about level'}{focusDot.gapPts != null ? ` (${pts(focusDot.gapPts)})` : ''}</b>.</>
                      : <>Too few swings of his own ({focusDot.nSwings}) or too thin a spot on the map to compare.</>}
                  </div>
                </div>
                <div style={{ color: C.ink }}><FollowIsland kind="player" refId={String(focusDot.pitcherId)} name={focusDot.name} /></div>
                <button type="button" onClick={() => openPitcher(focusDot.pitcherId, focusDot.name)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: C.orange, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>Open all his pitches →</button>
                <button type="button" onClick={() => setFocus(null)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 4, border: `1.5px solid ${C.ink}`, background: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>Clear and show all pitchers</button>
              </div>
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
            {place && placeStats && spotName ? (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 14 }}>
                <div className="pv-k" style={{ color: ORANGE_TEXT }}>{place.spot != null ? `Spot ${place.spot + 1} of ${spots.length} · where ${lc}s work best` : 'The place you chose'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '4px 0 6px' }}>
                  <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', lineHeight: 1.05 }}>{spotName.name}</span>
                  {tone && <span style={{ fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: tone === 'red' ? '#FFE4D6' : tone === 'blue' ? '#E3EAF2' : C.soft, color: tone === 'red' ? ORANGE_TEXT : C.ink }}>{tone === 'red' ? 'HIGH-MISS SHAPE' : tone === 'blue' ? 'LOW-MISS SHAPE' : 'ORDINARY SHAPE'}</span>}
                </div>
                <p style={{ fontSize: 14, color: '#5b5347', lineHeight: 1.5, margin: '0 0 6px' }}>{spotName.why}</p>
                {tone && <p style={{ fontSize: 14, color: '#3a352c', lineHeight: 1.5, margin: '0 0 8px', fontWeight: 600 }}>{toneLine(tone, name)}</p>}
                {placeRate == null ? <p style={{ fontSize: 13.5, color: '#5b5347' }}>Under {MIN_WINDOW_SWINGS} swings of league {lc}s move like this, so no rate is shown. Choose a coloured square.</p> : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 44, letterSpacing: '-.03em', lineHeight: 1 }}>{(placeRate * 100).toFixed(1)}%</span>
                      <span style={{ fontSize: 14, color: '#5b5347' }}>of swings miss · <b style={{ color: C.ink }}>{pts(diffPts ?? 0)}</b> vs average</span>
                    </div>
                    <div style={{ position: 'relative', height: 8, background: C.soft, borderRadius: 4, margin: '18px 0 10px' }} aria-hidden>
                      <span style={{ position: 'absolute', left: `${barPos(leagueRate)}%`, top: -6, width: 2, height: 20, background: C.ink }}><em style={{ position: 'absolute', top: -16, left: -14, fontStyle: 'normal', fontSize: 10.5, fontWeight: 700, color: '#5b5347', whiteSpace: 'nowrap' }}>avg {(leagueRate * 100).toFixed(1)}%</em></span>
                      <span style={{ position: 'absolute', left: `${barPos(placeRate)}%`, top: -6, width: 20, height: 20, marginLeft: -10, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(26,26,26,.25)', background: C.orange }} />
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5, fontWeight: 700 }}>
                  <span>Ride {place.ivb.toFixed(1)} in</span><span>Run {place.hb.toFixed(1)} in</span><span>{placeStats.swings.toLocaleString()} swings within ±{radius} in</span>
                </div>
                <a href="#shape-vs-results" style={{ display: 'block', marginTop: 10, color: ORANGE_TEXT, fontWeight: 800, fontSize: 14, textDecoration: 'none', minHeight: 32 }}>Who gets more or less than this shape ↓</a>
                <span style={{ display: 'inline-block', marginTop: 10, fontSize: 10.5, letterSpacing: '.1em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: placeStats.swings >= SPOT_MIN_SWINGS ? '#FFE4D6' : C.soft, color: placeStats.swings >= SPOT_MIN_SWINGS ? ORANGE_TEXT : C.ink }}>{placeStats.swings >= SPOT_MIN_SWINGS ? 'STRONG SAMPLE' : placeStats.swings >= STRONG_SWINGS ? 'MODERATE SAMPLE' : 'THIN SAMPLE'}</span>
              </div>
            ) : <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, marginBottom: 14, fontSize: 14, color: '#5b5347' }}>Click a gold spot or any square to see what that movement is worth and who throws it.</div>}

            {place && (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800 }}>What it looks like on the plate</h3>
                <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 8px' }}>The map above is movement. This is the other half: where pitches that move like your chosen spot cross the plate, from the batter’s side.</p>
                <div className="pf2-plate" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'start' }}>
                  <LocationPanel pitchType={type} hand={hand} probe={{ hb: place.hb, ivb: place.ivb }} radius={radius} span={span} scope="league" pitchName={name} explainHeight onSummary={setPlate} />
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
              </div>
            )}
          </div>
        </div>
      )}

      {!locked && payload && grid && place && (
        throwers === undefined && dots.length === 0 ? <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Finding pitchers…</div>
          : (league ?? leagueAll) ? <ShapeResultsSection split={split} league={(league ?? leagueAll) as Diag} placeRate={placeRate} lc={lc} pitchName={name} latest={latest} onShow={showOnMap} onOpen={openPitcher} shownId={focus} across={across} />
          : null
      )}

      <div className="pf2-foot" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 24, borderTop: `1px solid ${C.line}`, marginTop: 26, paddingTop: 14, fontSize: 13.5, lineHeight: 1.55, color: '#5b5347' }}>
        <style>{'@media(max-width:800px){.pf2-foot{grid-template-columns:1fr !important}}'}</style>
        <div><b style={{ color: C.ink }}>What a square means.</b> Every league {lc} within ±{radius} inch of that square’s movement: of the swings at them, the share that missed. It is a movement shape, not a place in the zone.</div>
        <div><b style={{ color: C.ink }}>What it can’t tell you.</b> Command, deception and sequencing aren’t in the map. It describes what pitches like this have done; it doesn’t predict.</div>
        <div><b style={{ color: C.ink }}>Why some squares are blank.</b> Under {MIN_WINDOW_SWINGS} swings is too few to trust, so we leave it empty rather than guess.</div>
      </div>
      </div>
    </div>
  )
}

const tabStyle = (on: boolean): React.CSSProperties => ({ minHeight: 44, padding: '0 16px', borderRadius: 4, border: `1px solid ${on ? '#1A1A1A' : '#e7e2d8'}`, background: on ? '#1A1A1A' : '#fff', color: on ? '#FAF8F3' : '#1A1A1A', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' })
