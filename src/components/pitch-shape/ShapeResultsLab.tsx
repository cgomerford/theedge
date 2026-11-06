'use client'

// src/components/pitch-shape/ShapeResultsLab.tsx
//
// The Pitch Shape Lab's results heat map and Shape Score. The map is the same 0.1 in movement map as the whiff map, but each box shows what league pitches
// within a chosen window of it have PRODUCED: runs saved per 100 pitches (Statcast run expectancy), wOBA, xwOBA, average, slugging or whiffs. Colour is always
// "better or worse for the pitcher than the league's average for this pitch": orange better, blue worse, blank where the window is too thin.
// Shape Score (1 to 99) ranks a shape's runs saved per 100 among the shapes pitchers throw. Under the map, the board lists pitchers whose own results trail
// or beat what their shape has produced. All of it describes what has happened; none of it is a forecast. `isPro` is a REQUIRED prop; the API refuses locked types too.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, Empty, Foot, SANS } from '@/components/team/ui'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import { GATE, LEVEL_RUNS, makeResultsGrid, measuresOf, percentile, runsSaved, windowSums, type Measures, type ResultsPayload, type RGrid, type Span } from '@/lib/pitch-shape/results-math'
import { RAMP } from './parts'
import { hexToRgb } from './heatGrid'
import { log } from '@/lib/log'

const HALF = 12
const RADII = [1, 2] as const
const BLUE = ['#E8EEF4', '#C6D4E3', '#9DB3CB', '#6F8BAC', '#456A90']
const NEUTRAL: [number, number, number] = [236, 233, 224]   // the league average
const BLANK: [number, number, number] = [255, 255, 255]     // window too thin to show
type MetricId = 'saved' | 'woba' | 'xwoba' | 'avg' | 'slg' | 'whiff'
type Metric = { id: MetricId; label: string; blurb: string; /** higher is better for the pitcher */ up: boolean; span: number; get: (m: Measures, l: Measures) => number | null; ref: (l: Measures) => number; fmt: (v: number) => string }
const d3 = (v: number) => v.toFixed(3).replace(/^0/, '')
const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const METRICS: Metric[] = [
  { id: 'saved', label: 'Runs saved per 100', blurb: 'Runs per 100 pitches saved against the league average for this pitch (Statcast run expectancy)', up: true, span: 1.5, get: (m, l) => runsSaved(m, l), ref: () => 0, fmt: v => signed(v) },
  { id: 'woba', label: 'wOBA against', blurb: 'wOBA on plate appearances that ended with the pitch', up: false, span: 0.07, get: m => m.woba, ref: l => l.woba ?? 0, fmt: d3 },
  { id: 'xwoba', label: 'xwOBA against', blurb: 'Expected wOBA on plate appearances that ended with the pitch', up: false, span: 0.07, get: m => m.xwoba, ref: l => l.xwoba ?? 0, fmt: d3 },
  { id: 'avg', label: 'Batting average against', blurb: 'Hits per at-bat that ended with the pitch', up: false, span: 0.06, get: m => m.avg, ref: l => l.avg ?? 0, fmt: d3 },
  { id: 'slg', label: 'Slugging against', blurb: 'Total bases per at-bat that ended with the pitch', up: false, span: 0.12, get: m => m.slg, ref: l => l.slg ?? 0, fmt: d3 },
  { id: 'whiff', label: 'Whiffs per swing', blurb: 'Swings that missed', up: true, span: 0.1, get: m => m.whiff, ref: l => l.whiff ?? 0, fmt: v => `${(v * 100).toFixed(1)}%` },
]

const cache = new Map<string, ResultsPayload | null>()
const boardCache = new Map<string, Board | null>()
const pct1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

function colourFor(g: number): [number, number, number] {
  if (Math.abs(g) < 0.06) return NEUTRAL
  const ramp = g > 0 ? RAMP.slice(1) : BLUE
  return hexToRgb(ramp[Math.round(Math.min(1, Math.abs(g)) * (ramp.length - 1))])
}

type Probe = { hb: number; ivb: number }

export default function ShapeResultsLab({ isPro, pitchTypes }: { isPro: boolean; pitchTypes: string[] }) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const [type, setType] = useState(pitchTypes.find(isFree) ?? pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<Hand>('R')
  const [metricId, setMetricId] = useState<MetricId>('saved')
  const [span, setSpan] = useState<Span>('all')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1)
  const key = `${type}|${hand}`
  const locked = !isPro && !isFree(type)
  const [payload, setPayload] = useState<ResultsPayload | null | undefined>(cache.get(key))
  const [board, setBoard] = useState<Board | null | undefined>(boardCache.get(key))
  const [hover, setHover] = useState<Probe | null>(null)
  const [tab, setTab] = useState<'behind' | 'ahead' | 'top'>('behind')
  const [showAll, setShowAll] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const metric = METRICS.find(m => m.id === metricId) ?? METRICS[0]
  const lc = (PITCH_NAMES[type] ?? type).toLowerCase()

  useEffect(() => {
    if (locked) { setPayload(null); setBoard(null); return }
    let live = true
    const load = <T,>(url: string, store: Map<string, T | null>, pick: (j: never) => T | null, set: (v: T | null) => void) => {
      if (store.has(key)) { set(store.get(key) ?? null); return }
      set(undefined as unknown as null)
      fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(j => { const v = pick(j as never); store.set(key, v); if (live) set(v) })
        .catch(e => { log.error('ShapeResultsLab', 'fetch failed', e instanceof Error ? e.message : e); if (live) set(null) })
    }
    load(`/api/mlb/pitch-shape/results?type=${type}&hand=${hand}&half=${HALF}`, cache, (j: { payload: ResultsPayload | null }) => j.payload, setPayload)
    load(`/api/mlb/pitch-shape/board?type=${type}&hand=${hand}`, boardCache, (j: { board: Board | null }) => j.board, setBoard)
    return () => { live = false }
  }, [key, type, hand, locked])
  useEffect(() => { setHover(null); setShowAll(false) }, [key])

  const grid: RGrid | null = useMemo(() => (payload ? makeResultsGrid(payload, span === 'latest' ? 'latest' : 'all') : null), [payload, span])
  const league = useMemo(() => (grid ? measuresOf(grid.total) : null), [grid])
  const N = grid ? 2 * grid.h10 + 1 : 0
  const r10 = Math.round(radius * 10)
  const only = payload && payload.seasons.length > 1
  const latest = payload?.latest ?? 0
  const firstSeason = payload ? payload.seasons[0].season : 0

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid || !league) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const ref = metric.ref(league)
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const m = measuresOf(windowSums(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, r10))
      const v = metric.get(m, league)
      const o = ((N - 1 - yy) * N + xx) * 4
      const rgb = v == null ? BLANK : colourFor(((metric.up ? 1 : -1) * (v - ref)) / metric.span)
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, league, N, r10, metric])

  if (locked) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Shape results and Shape Score · {PITCH_NAMES[type] ?? type}</div>
        <UpgradePrompt source="pitch_shape" />
        <p style={{ fontSize: 13, color: '#5b5347', margin: '10px 0 0' }}>Four-seam and sweeper are free. <button type="button" onClick={() => setType(pitchTypes.find(isFree) ?? 'FF')} style={{ color: '#B83A0E', fontWeight: 700, background: 'none', border: 0, cursor: 'pointer', padding: 0, fontFamily: SANS }}>Back to the free pitches</button></p>
      </div>
    )
  }

  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: SANS })
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }

  const probe: Probe | null = hover ?? (payload ? { hb: payload.hb0, ivb: payload.ivb0 } : null)
  const here = grid && probe ? measuresOf(windowSums(grid, Math.round(probe.hb * 10), Math.round(probe.ivb * 10), r10)) : null
  const hereSaved = here && league ? runsSaved(here, league) : null
  const spotScore = hereSaved != null && board && board.dist.length ? percentile(board.dist, hereSaved) : null
  const toBox = (hb: number, ivb: number) => (grid ? { x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) } : { x: 0, y: 0 })
  const ticks: number[] = []
  if (payload) for (let v = Math.ceil(payload.hb0 - HALF); v <= Math.floor(payload.hb0 + HALF); v++) if (v % 5 === 0) ticks.push(v)
  const yticks: number[] = []
  if (payload) for (let v = Math.ceil(payload.ivb0 - HALF); v <= Math.floor(payload.ivb0 + HALF); v++) if (v % 5 === 0) yticks.push(v)

  const rows: BoardRow[] = board ? (tab === 'behind' ? board.rows.filter(r => r.verdict === 'behind').sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))
    : tab === 'ahead' ? board.rows.filter(r => r.verdict === 'ahead').sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
    : board.rows.filter(r => r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) : []
  const shown = showAll ? rows : rows.slice(0, 12)
  const tabText = { behind: 'Results behind their shape', ahead: 'Results ahead of their shape', top: 'Top Shape Scores' } as const

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }} role="group" aria-label="Pitch type">
        {pitchTypes.map(t => <button key={t} type="button" style={pill(t === type)} onClick={() => setType(t)}>{PITCH_NAMES[t] ?? t}{!isFree(t) && !isPro ? ' · Pro' : ''}</button>)}
        <span style={{ width: 8 }} />
        {(['R', 'L'] as Hand[]).map(h => <button key={h} type="button" style={pill(h === hand)} onClick={() => setHand(h)}>{h === 'R' ? 'Right-handed' : 'Left-handed'}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }} role="group" aria-label="Measure">
        <span style={k}>Colour by</span>
        {METRICS.map(m => <button key={m.id} type="button" style={pill(m.id === metricId)} onClick={() => setMetricId(m.id)}>{m.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={k}>League pitches</span>
        <button type="button" style={pill(span === 'latest')} onClick={() => setSpan('latest')}>{latest || ''} only</button>
        {only && <button type="button" style={pill(span === 'all')} onClick={() => setSpan('all')}>{firstSeason}–{latest}</button>}
        <span style={{ ...k, marginLeft: 10 }}>Window</span>
        {RADII.map(r => <button key={r} type="button" style={pill(r === radius)} onClick={() => setRadius(r)}>±{r} in</button>)}
      </div>

      {payload === undefined ? <div style={{ padding: 30, color: C.mute, fontSize: 13 }}>Loading the league map…</div>
        : !payload || !grid || !league ? <Empty>The results map isn’t built for {hand === 'L' ? 'left' : 'right'}-handed {lc}s yet. It fills after the weekly shape-results job runs.</Empty>
        : (
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 380px', maxWidth: 520, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr)', gridTemplateRows: 'auto 22px' }}>
                <div style={{ position: 'relative' }}>
                  {yticks.map(v => <span key={v} style={{ position: 'absolute', right: 4, top: `${((payload.ivb0 + HALF - v) / (2 * HALF)) * 100}%`, transform: 'translateY(-50%)', fontSize: 10, color: C.mute }}>{v}</span>)}
                </div>
                <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' }}
                  onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ hb: payload.hb0 - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: payload.ivb0 + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF }) }}
                  onMouseLeave={() => setHover(null)}>
                  <canvas ref={canvasRef} role="img" aria-label={`${PITCH_NAMES[type] ?? type} results map, coloured by ${metric.label}`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
                  {probe && (() => { const b = toBox(probe.hb, probe.ivb); return (
                    <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                      <circle cx={b.x} cy={b.y} r={N / 70} fill="none" stroke={C.ink} strokeWidth={N / 220} />
                      <rect x={b.x - r10} y={b.y - r10} width={2 * r10} height={2 * r10} fill="none" stroke={C.ink} strokeWidth={N / 400} strokeDasharray={`${N / 90} ${N / 120}`} />
                    </svg>) })()}
                </div>
                <div />
                <div style={{ position: 'relative' }}>
                  {ticks.map(v => <span key={v} style={{ position: 'absolute', left: `${((v - (payload.hb0 - HALF)) / (2 * HALF)) * 100}%`, transform: 'translateX(-50%)', top: 4, fontSize: 10, color: C.mute }}>{v}</span>)}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: '.12em', fontWeight: 800, color: C.mute, margin: '2px 0 8px', paddingLeft: 30 }}><span>↑ INDUCED VERTICAL BREAK (IN)</span><span>ARM-SIDE BREAK (IN) →</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.mute, flexWrap: 'wrap' }}>
                <span>Worse for the pitcher</span>
                <span style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>{[...BLUE].reverse().map(c => <span key={c} style={{ width: 18, height: 10, background: c }} />)}<span style={{ width: 18, height: 10, background: `rgb(${NEUTRAL.join(',')})` }} />{RAMP.slice(1).map(c => <span key={c} style={{ width: 18, height: 10, background: c }} />)}</span>
                <span>better</span>
                <span>· the league average for {lc}s is the middle · white = window too thin</span>
              </div>
            </div>
            <div style={{ flex: '1 1 300px', minWidth: 260 }}>
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={k}>{hover ? 'Under the cursor' : 'League’s average shape'}</div>
                <div style={{ fontSize: 12.5, color: '#5b5347', marginBottom: 8 }}>{probe ? `${probe.hb.toFixed(1)} in of arm-side break, ${probe.ivb.toFixed(1)} in of ride. League ${lc}s within ±${radius} in, ${span === 'latest' ? latest : `${firstSeason}–${latest}`}.` : ''}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <b style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{spotScore ?? '—'}</b>
                  <span style={{ fontSize: 12.5, color: '#5b5347' }}>Shape Score{spotScore == null ? ` (needs ${GATE.rvPitches}+ pitches in the window)` : ` · ${hereSaved != null ? signed(hereSaved) : ''} runs saved per 100 pitches`}</span>
                </div>
                {here ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '5px 12px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={k}>Measure</span><span style={{ ...k, textAlign: 'right' }}>Here</span><span style={{ ...k, textAlign: 'right' }}>League</span>
                    {([
                      ['Runs allowed / 100', here.runs100 == null ? '—' : here.runs100.toFixed(2), league.runs100 == null ? '—' : league.runs100.toFixed(2)],
                      ['wOBA', here.woba == null ? '—' : d3(here.woba), league.woba == null ? '—' : d3(league.woba)],
                      ['xwOBA', here.xwoba == null ? '—' : d3(here.xwoba), league.xwoba == null ? '—' : d3(league.xwoba)],
                      ['Batting average', here.avg == null ? '—' : d3(here.avg), league.avg == null ? '—' : d3(league.avg)],
                      ['Slugging', here.slg == null ? '—' : d3(here.slg), league.slg == null ? '—' : d3(league.slg)],
                      ['Whiffs per swing', pct1(here.whiff), pct1(league.whiff)],
                    ] as [string, string, string][]).map(([a, b, c]) => <div key={a} style={{ display: 'contents' }}><span style={{ color: '#5b5347' }}>{a}</span><b style={{ textAlign: 'right' }}>{b}</b><span style={{ textAlign: 'right', color: C.mute }}>{c}</span></div>)}
                  </div>
                ) : null}
                {here && <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>{here.pitches.toLocaleString()} pitches, {here.n.pa.toLocaleString()} plate appearances ended on them, {here.n.ab.toLocaleString()} at-bats, {here.n.swings.toLocaleString()} swings.</div>}
              </div>
              <p style={{ fontSize: 12.5, color: '#5b5347', margin: '10px 2px 0', lineHeight: 1.5 }}>{metric.blurb}. {metric.up ? 'Higher is better for the pitcher.' : 'Lower is better for the pitcher.'}</p>
            </div>
          </div>
        )}

      <div style={{ margin: '34px 0 8px', borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.01em' }}>Shape Score: {PITCH_NAMES[type] ?? type}, {hand === 'R' ? 'right' : 'left'}-handed</div>
        <p style={{ color: '#5b5347', fontSize: 14, margin: '4px 0 12px', maxWidth: 760, lineHeight: 1.5 }}>
          Each pitcher’s average {lc} is a point on the map. His Shape Score (1 to 99) ranks the runs per 100 pitches that league {lc}s shaped like his have saved against the other shapes pitchers throw. Next to it, what his own {lc} has done this season. “Behind” means his results are more than {LEVEL_RUNS} runs per 100 pitches worse than his shape has produced; “ahead” means better. A description of what has happened, not a forecast.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Board view">
          {(['behind', 'ahead', 'top'] as const).map(t => <button key={t} type="button" style={pill(t === tab)} onClick={() => { setTab(t); setShowAll(false) }}>{tabText[t]}</button>)}
        </div>
        {board === undefined ? <div style={{ padding: 20, color: C.mute, fontSize: 13 }}>Loading the board…</div>
          : !board ? <Empty>No pitchers scored for this pitch yet.</Empty>
          : rows.length === 0 ? <Empty>No pitcher fits this view with enough pitches ({GATE.rvPitches}+ of his own, and a shape window with {GATE.rvPitches}+ league pitches).</Empty>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 760 }}>
                <thead>
                  <tr>{['Pitcher', 'Pitches', 'Shape Score', 'Shape runs saved / 100', 'His runs saved / 100', 'Gap', 'wOBA: shape · his', 'xwOBA: shape · his'].map((h, i) => <th key={h} style={{ ...k, textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, fontWeight: 800 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}><Link href={`/mlb/lab/pitching-lab/${r.pitcherId}/shape`} style={{ color: C.ink, textDecoration: 'none' }}>{r.name}</Link> <span style={{ color: C.mute, fontWeight: 600 }}>{r.teamAbbr}</span></td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.pitches.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, fontSize: 15 }}>{r.score ?? '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.shape.saved == null ? '—' : signed(r.shape.saved)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.own.saved == null ? '—' : signed(r.own.saved)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: r.verdict === 'behind' ? C.bad : r.verdict === 'ahead' ? C.good : C.ink }}>{r.gap == null ? '—' : signed(r.gap)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.shape.woba == null ? '—' : d3(r.shape.woba)} · {r.own.woba == null ? '—' : d3(r.own.woba)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{r.shape.xwoba == null ? '—' : d3(r.shape.xwoba)} · {r.own.xwoba == null ? '—' : d3(r.own.xwoba)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 12 && <button type="button" style={{ ...pill(false), marginTop: 10 }} onClick={() => setShowAll(s => !s)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>}
            </div>
          )}
      </div>
      <Foot>
        Each 0.1 in box is every league {lc} thrown {hand === 'R' ? 'right' : 'left'}-handed within ±{radius} in of it, all speeds and arm angles, regular season, {span === 'latest' ? latest : `${firstSeason}–${latest}`}. Runs saved per 100 pitches is the change in run expectancy Statcast records on each pitch (delta_run_exp, the batting side’s runs, summed over every pitch) for the league’s {lc}s minus the window’s, so higher is better for the pitcher. wOBA, xwOBA, average and slugging count the plate appearances and at-bats that ended on the pitch, as Savant’s pitch arsenal does. A measure shows only with {GATE.rvPitches}+ pitches (run expectancy), {GATE.ab}+ at-bats (average, slugging), {GATE.den}+ plate appearances (wOBA, xwOBA) or {GATE.swings}+ swings (whiffs) in the window. The board pools every season for the shape and uses the latest season for his own results; it lists pitchers with 200+ {lc}s, and compares his own results only with {GATE.rvPitches}+ of them. Shape is not everything: location, sequencing, deception, defense and park are not in it. Source: Baseball Savant / Statcast, regular season. Independent, not affiliated with MLB.
      </Foot>
    </div>
  )
}
