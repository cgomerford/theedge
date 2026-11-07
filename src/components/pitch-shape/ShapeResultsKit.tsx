'use client'

// src/components/pitch-shape/ShapeResultsKit.tsx
//
// Pieces of the results heat map and Shape Score that PitchFinderV2 (the top of the Pitch Shape Lab page) mounts: the measures the map can be coloured by,
// the colour scale, the "here versus league" readout for a chosen spot, and the Shape Score board. Plain data in, no fetching: PitchFinderV2 loads the
// results payload and the board. Everything describes what has happened; none of it is a forecast.
// Colour is always "better or worse for the pitcher than the league's average for this pitch": orange better, blue worse, white where the window is too thin.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { C, Empty } from '@/components/team/ui'
import FollowIsland from '@/components/signup/FollowIsland'
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import type { Overall, OverallRank } from '@/lib/pitch-shape/overall'
import type { DiagnosisResult, WhyResult } from '@/lib/pitch-shape/diagnosis'
import { r2 } from '@/lib/pitch-shape/diagnose'
import { EFFECT_NOTICE, EXTENSION_NOTICE_FT, SPEED_NOTICE_MPH, ZONE_LABEL, biggestZoneShift, verdictOf, type Factor } from '@/lib/pitch-shape/decompose'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import { ordinal } from '@/lib/ordinal'
import { log } from '@/lib/log'
import { renderOtdPng } from '@/lib/graphics/otd-export'
import ShapeExportCard, { type ExportData } from './ShapeExportCard'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { explainShape, reasons } from '@/lib/pitch-shape/explain'
import { PITCH_NAMES, type ShapeBin } from '@/lib/pitch-shape/model'
import { ESTABLISHED_PITCHES, LENSES, STRONG_SCORE, WEAK_SCORE, findPitchers, type LensId } from '@/lib/pitch-shape/finder'
import { GATE, LEVEL_RUNS, resultsVsShape, runsSaved, type Measures } from '@/lib/pitch-shape/results-math'
import { useRoster } from './useRoster'
import { RAMP } from './parts'
import { hexToRgb } from './heatGrid'

export const BLUE = ['#E8EEF4', '#C6D4E3', '#9DB3CB', '#6F8BAC', '#456A90']
export const NEUTRAL: [number, number, number] = [236, 233, 224]   // the league average
export const BLANK: [number, number, number] = [255, 255, 255]     // window too thin to show
export type MetricId = 'saved' | 'woba' | 'xwoba' | 'avg' | 'slg'
export type Metric = { id: MetricId; label: string; blurb: string; /** higher is better for the pitcher */ up: boolean; span: number; get: (m: Measures, l: Measures) => number | null; ref: (l: Measures) => number; fmt: (v: number) => string }
export const d3 = (v: number) => v.toFixed(3).replace(/^0/, '')
export const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const pct1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
export const METRICS: Metric[] = [
  { id: 'saved', label: 'Runs saved', blurb: 'Runs per 100 pitches saved against the league average for this pitch (Statcast run expectancy)', up: true, span: 1.5, get: (m, l) => runsSaved(m, l), ref: () => 0, fmt: v => signed(v) },
  { id: 'woba', label: 'wOBA against', blurb: 'wOBA on plate appearances that ended with the pitch', up: false, span: 0.07, get: m => m.woba, ref: l => l.woba ?? 0, fmt: d3 },
  { id: 'xwoba', label: 'xwOBA against', blurb: 'Expected wOBA on plate appearances that ended with the pitch', up: false, span: 0.07, get: m => m.xwoba, ref: l => l.xwoba ?? 0, fmt: d3 },
  { id: 'avg', label: 'Average against', blurb: 'Hits per at-bat that ended with the pitch', up: false, span: 0.06, get: m => m.avg, ref: l => l.avg ?? 0, fmt: d3 },
  { id: 'slg', label: 'Slugging against', blurb: 'Total bases per at-bat that ended with the pitch', up: false, span: 0.12, get: m => m.slg, ref: l => l.slg ?? 0, fmt: d3 },
]

/** g in about -1..1 (negative = worse for the pitcher than the league average, positive = better) to a colour. */
export function colourFor(g: number): [number, number, number] {
  if (Math.abs(g) < 0.06) return NEUTRAL
  const ramp = g > 0 ? RAMP.slice(1) : BLUE
  return hexToRgb(ramp[Math.round(Math.min(1, Math.abs(g)) * (ramp.length - 1))])
}

const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }

export function ResultsLegend({ metric, lc }: { metric: Metric; lc: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, flexWrap: 'wrap' }}>
        <span>Worse for the pitcher</span>
        <span style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden' }}>{[...BLUE].reverse().map(c => <span key={c} style={{ width: 22, height: 12, background: c }} />)}<span style={{ width: 22, height: 12, background: `rgb(${NEUTRAL.join(',')})` }} />{RAMP.slice(1).map(c => <span key={c} style={{ width: 22, height: 12, background: c }} />)}</span>
        <span>Better</span>
      </div>
      <div style={{ color: '#5b5347', marginTop: 6, lineHeight: 1.5 }}>{metric.blurb}. {metric.up ? 'Higher is better for the pitcher.' : 'Lower is better for the pitcher.'} The middle colour is the league average for {lc}s; white means the window is too thin to show.</div>
    </div>
  )
}

/** Shape Score and the measures at one spot, set against the league's. */
export function ResultsReadout({ here, league, saved, score, lc, radius, spanLabel }: { here: Measures; league: Measures; saved: number | null; score: number | null; lc: string; radius: number; spanLabel: string }) {
  const rows: [string, string, string][] = [
    ['Runs allowed per 100', here.runs100 == null ? '—' : here.runs100.toFixed(2), league.runs100 == null ? '—' : league.runs100.toFixed(2)],
    ['wOBA', here.woba == null ? '—' : d3(here.woba), league.woba == null ? '—' : d3(league.woba)],
    ['xwOBA', here.xwoba == null ? '—' : d3(here.xwoba), league.xwoba == null ? '—' : d3(league.xwoba)],
    ['Batting average', here.avg == null ? '—' : d3(here.avg), league.avg == null ? '—' : d3(league.avg)],
    ['Slugging', here.slg == null ? '—' : d3(here.slg), league.slg == null ? '—' : d3(league.slg)],
    ['Whiffs per swing', pct1(here.whiff), pct1(league.whiff)],
  ]
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
      <div className="pv-k" style={{ color: '#B83A0E' }}>What this shape has produced</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 8px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 38, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{score ?? '—'}</b>
        <span style={{ fontSize: 13, color: '#5b5347' }}>Shape Score (1 to 99){score == null ? ` · needs ${GATE.rvPitches}+ pitches in the window` : saved != null ? ` · ${signed(saved)} runs saved per 100 pitches` : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 14px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span style={k}>Measure</span><span style={{ ...k, textAlign: 'right' }}>Here</span><span style={{ ...k, textAlign: 'right' }}>League</span>
        {rows.map(([a, b, c]) => <div key={a} style={{ display: 'contents' }}><span style={{ color: '#5b5347' }}>{a}</span><b style={{ textAlign: 'right' }}>{b}</b><span style={{ textAlign: 'right', color: C.mute }}>{c}</span></div>)}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>League {lc}s within ±{radius} in, {spanLabel}: {here.pitches.toLocaleString()} pitches, {here.n.pa.toLocaleString()} plate appearances ended on them, {here.n.ab.toLocaleString()} at-bats, {here.n.swings.toLocaleString()} swings.</div>
    </div>
  )
}

const tabText = { behind: 'Underperforming their shape', ahead: 'Outperforming their shape', top: 'Top Shape Scores' } as const

/** The Shape Score board: pitchers whose own results trail or beat what their shape has produced, and the top scores. */
export function ShapeScoreBoard({ board, lc, hand, onShow }: { board: Board | null | undefined; lc: string; hand: 'R' | 'L'; onShow?: (id: number) => void }) {
  const [tab, setTab] = useState<'behind' | 'ahead' | 'top'>('behind')
  const [all, setAll] = useState(false)
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  const rows: BoardRow[] = board ? (tab === 'behind' ? board.rows.filter(r => r.verdict === 'behind').sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))
    : tab === 'ahead' ? board.rows.filter(r => r.verdict === 'ahead').sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
    : board.rows.filter(r => r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) : []
  const shown = all ? rows : rows.slice(0, 12)
  return (
    <section id="shape-score" style={{ marginTop: 30, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="pv-k" style={{ color: '#B83A0E' }}>Shape Score</div>
      <h2 style={{ margin: '4px 0 6px', fontWeight: 800, fontSize: 'clamp(22px,3.4vw,30px)', letterSpacing: '-.02em', lineHeight: 1.1 }}>Who throws a shape that saves runs, and who is not getting them?</h2>
      <p style={{ color: '#5b5347', fontSize: 14, margin: '0 0 12px', maxWidth: 780, lineHeight: 1.5 }}>
        Each pitcher’s average {lc} is a point on the map. His Shape Score (1 to 99) ranks the runs per 100 pitches that league {hand === 'R' ? 'right' : 'left'}-handed {lc}s shaped like his have saved, against the other shapes pitchers throw. Beside it, what his own {lc} has done this season. “Underperforming” means his results are more than {LEVEL_RUNS} runs per 100 pitches worse than his shape has produced; “outperforming” means better. It describes what has happened, not a forecast, and it uses movement only: speed and arm angle are not in it.
      </p>
      <div role="group" aria-label="Board view" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {(['behind', 'ahead', 'top'] as const).map(t => <button key={t} type="button" style={pill(t === tab)} onClick={() => { setTab(t); setAll(false) }}>{tabText[t]}</button>)}
      </div>
      {board === undefined ? <div style={{ padding: 20, color: C.mute, fontSize: 13 }}>Loading the board…</div>
        : !board ? <Empty>No pitchers are scored for this pitch yet. This fills after the weekly shape-results job runs.</Empty>
        : rows.length === 0 ? <Empty>No pitcher fits this view with enough pitches ({GATE.rvPitches}+ of his own, and a shape window with {GATE.rvPitches}+ league pitches).</Empty>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 780 }}>
              <thead>
                <tr>{['Pitcher', 'Pitches', 'Shape Score', 'Shape runs saved / 100', 'His runs saved / 100', 'Gap', 'wOBA: shape · his', 'xwOBA: shape · his'].map((h, i) => <th key={h} style={{ ...k, textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}` }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>
                      {onShow ? <button type="button" onClick={() => onShow(r.pitcherId)} style={{ all: 'unset', cursor: 'pointer', color: C.ink, fontWeight: 800 }} title="Show him on the map">{r.name}</button> : <Link href={`/mlb/lab/pitching-lab/${r.pitcherId}/shape`} style={{ color: C.ink, textDecoration: 'none' }}>{r.name}</Link>} <span style={{ color: C.mute, fontWeight: 600 }}>{r.teamAbbr}</span>
                    </td>
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
            {rows.length > 12 && <button type="button" style={{ ...pill(false), marginTop: 10 }} onClick={() => setAll(s => !s)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
          </div>
        )}
      <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: '10px 0 0' }}>
        Runs saved per 100 pitches is the change in run expectancy Statcast records on each pitch (delta_run_exp, the batting side’s runs, summed over every pitch) for the league’s {lc}s minus the window’s, so higher is better for the pitcher. wOBA, xwOBA, average and slugging count the plate appearances and at-bats that ended on the pitch. A measure shows only with {GATE.rvPitches}+ pitches (run expectancy), {GATE.ab}+ at-bats (average, slugging), {GATE.den}+ plate appearances (wOBA, xwOBA) or {GATE.swings}+ swings (whiffs) in the window. The board pools every season for the shape and uses the latest season for his own results; it lists pitchers with 200+ {lc}s and compares his own results only with {GATE.rvPitches}+ of them. Location, sequencing, deception, defense and park are not in it. Source: Baseball Savant / Statcast, regular season. Independent, not affiliated with MLB.
      </p>
    </section>
  )
}

// ---- Players at a chosen shape ------------------------------------------------------------------------------------------------------------------------

type M = Measures & { saved: number | null }
type Stat = { id: string; label: string; get: (m: M) => number | null; up: boolean; band: number; fmt: (v: number) => string; diff: (d: number) => string }
const pts1 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts`
const dd3 = (d: number) => signed(d, 3).replace('0.', '.')
const STATS: Stat[] = [
  { id: 'saved', label: 'Runs saved / 100', get: m => m.saved, up: true, band: 0.4, fmt: v => signed(v), diff: d => signed(d) },
  { id: 'woba', label: 'wOBA against', get: m => m.woba, up: false, band: 0.03, fmt: d3, diff: dd3 },
  { id: 'xwoba', label: 'xwOBA against', get: m => m.xwoba, up: false, band: 0.03, fmt: d3, diff: dd3 },
  { id: 'avg', label: 'Average against', get: m => m.avg, up: false, band: 0.025, fmt: d3, diff: dd3 },
  { id: 'slg', label: 'Slugging against', get: m => m.slg, up: false, band: 0.05, fmt: d3, diff: dd3 },
  { id: 'whiff', label: 'Whiffs per swing', get: m => m.whiff, up: true, band: 0.03, fmt: v => `${(v * 100).toFixed(1)}%`, diff: pts1 },
]
type Read = { stat: Stat; own: number; shape: number; d: number; tone: 'good' | 'bad' | 'level'; z: number; /** his sample is under the gate: shown, but not coloured */ thin: boolean }
/**
 * Each stat of his against what his shape has produced. raw = every stat from whatever sample there is (a thin one is flagged and not coloured);
 * not raw = only stats with a big enough sample. good = better for the pitcher than his shape by more than the band, bad = worse by more than it.
 */
function reads(r: BoardRow, raw = false, shapeM?: M): Read[] {
  const out: Read[] = []
  for (const stat of STATS) {
    const own = stat.get(raw ? r.ownRaw : r.own), shape = stat.get(shapeM ?? (raw ? r.shapeRaw : r.shape))
    if (own == null || shape == null) continue
    const thin = raw && stat.get(r.own) == null
    const d = own - shape, z = ((stat.up ? 1 : -1) * d) / stat.band
    out.push({ stat, own, shape, d, tone: thin ? 'level' : z > 1 ? 'good' : z < -1 ? 'bad' : 'level', z, thin })
  }
  return out
}
/** How good the shape itself is, from its Shape Score (what pitches shaped like his have produced), separate from whether his own results match it. */
function shapeWord(score: number | null): { word: string; bg: string; fg: string } | null {
  if (score == null) return null
  if (score >= 67) return { word: 'Strong shape', bg: '#FFE4D6', fg: '#B83A0E' }
  if (score <= 33) return { word: 'Weak shape', bg: '#E3EAF2', fg: '#3F5F86' }
  return { word: 'Average shape', bg: C.soft, fg: '#5b5347' }
}
const toneCol = { good: { bg: '#E3F3EC', fg: '#13694F' }, bad: { bg: '#FBE6E1', fg: '#A8391F' }, level: { bg: C.soft, fg: '#5b5347' } } as const

/** The contact-quality clue: results against contact quality, as the older ahead/behind cards say it. */
function clue(r: BoardRow): string | null {
  const w = r.own.woba, x = r.own.xwoba
  if (w == null || x == null || r.own.n.pa < GATE.den) return null
  if (x - w >= 0.03) return `Results (wOBA ${d3(w)}) are better than the contact quality he allowed (xwOBA ${d3(x)}), which can point to defense or luck helping.`
  if (w - x >= 0.03) return `Results (wOBA ${d3(w)}) are worse than the contact quality he allowed (xwOBA ${d3(x)}), which can point to defense or luck hurting.`
  return null
}

const PITCH_LABEL = PITCH_NAMES

/** One pitcher's full read, full width under the map row: his season numbers and where they rank, his shape (with the window widened by his own spread), and what the league has produced at that shape. */
export function ShapePlayerDetail({ board, selectedId, overall, shapeAt, bins, diagnosis, pitchType, season, exportMap, lc, onSelect, onOpen, headshot }: Pick<PanelProps, 'board' | 'selectedId' | 'overall' | 'shapeAt' | 'bins' | 'diagnosis' | 'pitchType' | 'season' | 'exportMap' | 'lc' | 'onSelect' | 'onOpen' | 'headshot'>) {
  const [wide, setWide] = useState<'in1' | 'sd05' | 'sd1' | 'sd2'>('in1')   // how wide the shape window is: a fixed inch, or his own spread times 0.5, 1 or 2
  const [exportOpen, setExportOpen] = useState(false)
  const [exportSize, setExportSize] = useState<'landscape' | 'portrait'>('landscape')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const [why, setWhy] = useState<WhyResult | 'locked' | undefined>(undefined)   // platoon, location, sequencing, speed and extension against league pitches of the same shape; 'locked' when the viewer is not Pro
  const sel = board && selectedId != null ? board.rows.find(r => r.pitcherId === selectedId) ?? null : null
  // the shape window: a fixed inch, or his own spread (one standard deviation in ride and in run) times 0.5, 1 or 2, floored at half an inch and capped at 8
  const mult = wide === 'sd05' ? 0.5 : wide === 'sd1' ? 1 : wide === 'sd2' ? 2 : null
  const clampT = (inches: number) => Math.max(5, Math.min(80, Math.round(inches * 10)))
  const rx10 = mult == null || sel?.sdHb == null ? 10 : clampT(sel.sdHb * mult), ry10 = mult == null || sel?.sdIvb == null ? 10 : clampT(sel.sdIvb * mult)
  const selId = sel?.pitcherId ?? null
  useEffect(() => {
    if (selId == null || season == null) { setWhy(undefined); return }
    let live = true
    setWhy(undefined)
    fetch(`/api/mlb/pitch-shape/why?id=${selId}&season=${season}&type=${pitchType}&halfHb=${rx10 / 10}&halfIvb=${ry10 / 10}`)
      .then(async r => { if (r.status === 403) return 'locked' as const; if (!r.ok) throw new Error(`HTTP ${r.status}`); return ((await r.json()) as { why: WhyResult }).why })
      .then(w => { if (live) setWhy(w) })
      .catch(e => { log.error('ShapePlayerDetail', 'why fetch failed', e instanceof Error ? e.message : e); if (live) setWhy(null) })
    return () => { live = false }
  }, [selId, season, pitchType, rx10, ry10])
  if (!sel) return null
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 11px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' })
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }
    const win = shapeAt ? shapeAt(sel.hb, sel.ivb, rx10, ry10) : null
    const shapeG: M = win?.gated ?? sel.shape, shapeR: M = win?.raw ?? sel.shapeRaw
    const cmp = resultsVsShape(sel.small ? sel.ownRaw.saved : sel.own.saved, shapeG.saved)
    const verdict = cmp?.verdict ?? null, gap = cmp?.gap ?? null
    const rd = reads(sel, true, shapeR)
    const sw = shapeWord(sel.score)
    const label = (x: Read) => x.stat.label.replace(' / 100', ' per 100')
    const better = rd.filter(x => x.tone === 'good').map(label), worse = rd.filter(x => x.tone === 'bad').map(label)
    const note = clue(sel)
    const rankOf = (id: OverallRank['id']) => overall?.ranks.find(r => r.id === id) ?? null
    // overall contrast: the contact quality he allowed against the results he got, as ranks among ranked pitchers
    const rw = rankOf('woba'), rx = rankOf('xwoba')
    const overallNote = rw?.pct != null && rx?.pct != null && Math.abs(rx.pct - rw.pct) >= 25
      ? `Overall, his xwOBA against ranks ${ordinal(rx.rank ?? 0)} of ${rx.of} but his wOBA against ranks ${ordinal(rw.rank ?? 0)}: the contact quality he allowed is ${rx.pct > rw.pct ? 'better' : 'worse'} than the results he got, which can point to defense or luck.` : null
    const strong = (sel.score ?? 0) >= 67, weak = sel.score != null && sel.score <= 33
    const headline = verdict == null
      ? `Too few of his own ${lc}s (${GATE.rvPitches}+ needed) to set his results against his shape; the numbers below are shown with their sample.`
      : verdict === 'ahead'
        ? (weak ? `Outperforming a weak shape: his ${lc} results are better than pitches shaped like his have produced (${signed(gap ?? 0)} runs per 100 pitches). League ${lc}s with this shape have saved ${shapeG.saved == null ? '' : signed(shapeG.saved)} runs per 100, so the shape does not explain his results; location, sequencing, deception, defense and luck are not in it.`
          : strong ? `A strong shape and results better still (${signed(gap ?? 0)} runs per 100 pitches vs the shape): the results and the shape point the same way.`
          : `Outperforming his shape: his ${lc} results are better than pitches shaped like his have produced (${signed(gap ?? 0)} runs per 100 pitches).`)
      : verdict === 'behind'
        ? (strong ? `Underperforming a strong shape: pitches shaped like his have saved ${shapeG.saved == null ? '' : signed(shapeG.saved)} runs per 100, his own ${lc}s ${sel.own.saved == null ? '' : signed(sel.own.saved)}. His results trail what the shape has produced (${signed(gap ?? 0)} per 100).`
          : weak ? `A weak shape and results to match (${signed(gap ?? 0)} runs per 100 pitches vs the shape): his results trail an already weak shape.`
          : `Underperforming his shape: his ${lc} results trail what pitches shaped like his have produced (${signed(gap ?? 0)} runs per 100 pitches).`)
        : `His ${lc} results line up with what pitches shaped like his have produced.`
    const sec: React.CSSProperties = { ...k, margin: '16px 0 6px', color: '#B83A0E' }
    // X export: what the card says, from what the page already computed
    const whyLoaded = why !== undefined && why !== 'locked' && why !== null && !('needsSql' in why) ? why : null
    const built = whyLoaded ? buildWhy(sel, lc, whyLoaded, bins, diagnosis) : null
    const firstSentences = (t: string, n2: number) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, n2).join(' ').trim()
    const exportData: ExportData | null = exportMap ? {
      name: sel.name, team: sel.teamAbbr, hand: board?.hand ?? 'R', pitchName: (PITCH_LABEL[pitchType] ?? pitchType), season: season ?? new Date().getFullYear(),
      score: sel.score, shapeWord: sw?.word ?? null, verdict,
      headline: built?.lead ? firstSentences(built.lead, 2) : firstSentences(headline, 2),
      stats: rd.map(x => ({ label: x.stat.label.replace(' against', '').replace(' / 100', ' per 100'), his: x.stat.fmt(x.own), shape: x.stat.fmt(x.shape), tone: x.tone })),
      factors: built ? built.rows.map(r => ({ label: r.label, status: r.status, number: r.id === 'velo' || r.id === 'ext' || r.id === 'angle' ? r.number : r.status === 'explains' || r.status === 'helps' ? r.number : '' })) : [],
      map: { payload: exportMap.payload, span: exportMap.span, leagueRate: exportMap.leagueRate, points: exportMap.points, avg: { hb: sel.hb, ivb: sel.ivb } },
    } : null
    async function downloadPng() {
      const node = cardRef.current
      if (!node) return
      setExportBusy(true); setExportError('')
      try {
        await new Promise(r => setTimeout(r, 250))   // let the map canvas finish drawing
        const url = await renderOtdPng(node, exportSize)
        const a = document.createElement('a')
        a.href = url
        a.download = `x9lab-pitch-shape-${sel!.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${pitchType.toLowerCase()}-${exportSize === 'landscape' ? '16x9' : '4x5'}.png`
        a.click()
      } catch (e) {
        log.error('ShapePlayerDetail', 'export failed', e instanceof Error ? e.message : e)
        setExportError(e instanceof Error ? e.message : 'Export failed')
      } finally { setExportBusy(false) }
    }
    const th = (h: string, i: number) => <th key={h} style={{ ...k, textAlign: i === 0 ? 'left' : 'right', padding: '5px 4px', borderBottom: `2px solid ${C.ink}` }}>{h}</th>
    const fmtRank = (r: OverallRank) => (r.value == null ? '—' : r.fmt === 'runs' ? r.value.toFixed(2) : r.fmt === 'pct' ? `${(r.value * 100).toFixed(1)}%` : d3(r.value))
    return (
      <div style={card} id="pf2-detail">
        <button type="button" onClick={() => { onSelect(null); document.getElementById('pf2-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} style={{ ...pill(false), marginBottom: 10 }}>← Back to the pitchers at this shape</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={headshot(sel.pitcherId)} alt="" width={64} height={64} style={{ width: 64, height: 64, flex: 'none', objectFit: 'contain', objectPosition: 'center bottom' }} />
          <div style={{ flex: 1, minWidth: 160 }}>
            <Link href={`/mlb/players/${sel.pitcherId}`} style={{ fontWeight: 800, fontSize: 20, color: '#B83A0E', textDecoration: 'none' }}>{sel.name} · {sel.teamAbbr}</Link>
            <div style={{ fontSize: 12.5, color: '#5b5347' }}>His {lc}: {sel.ivb.toFixed(1)} in of ride, {sel.hb.toFixed(1)} in of run · {sel.pitches.toLocaleString()} pitches this season</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
              {sw && <span style={{ background: sw.bg, color: sw.fg, fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{sw.word}</span>}
              {sel.small && <span style={{ background: '#FFF4CC', color: '#7A5B00', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>Small sample · {sel.ownRaw.n.rv.toLocaleString()} {lc}s</span>}
              {sel.profile && <span style={{ background: C.soft, color: '#5b5347', fontWeight: 700, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{sel.profile.allStars > 0 ? `${sel.profile.allStars}× All-Star` : 'Never an All-Star'}{sel.profile.debutYear ? ` · debuted ${sel.profile.debutYear}` : ''}</span>}
              {verdict && <span style={{ background: verdict === 'ahead' ? '#E3F3EC' : verdict === 'behind' ? '#FBE6E1' : C.soft, color: verdict === 'ahead' ? '#13694F' : verdict === 'behind' ? '#A8391F' : '#5b5347', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{verdict === 'ahead' ? 'Outperforming his shape' : verdict === 'behind' ? 'Underperforming his shape' : 'In line with his shape'}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <Star id={sel.pitcherId} name={sel.name} />
            <div style={{ textAlign: 'center' }}><b style={{ fontSize: 30, lineHeight: 1, display: 'block' }}>{sel.score ?? '—'}</b><span style={k}>Shape Score</span></div>
          </div>
        </div>
        {exportData && (
          <div style={{ margin: '10px 0 0' }}>
            <button type="button" onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen} style={{ ...pill(exportOpen), minHeight: 40 }}>{exportOpen ? 'Close export' : 'Export for X'}</button>
            {exportOpen && (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12, marginTop: 8, background: '#FAF8F3' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  <button type="button" style={pill(exportSize === 'landscape')} onClick={() => setExportSize('landscape')}>16:9 · 2400×1350</button>
                  <button type="button" style={pill(exportSize === 'portrait')} onClick={() => setExportSize('portrait')}>4:5 · 1080×1350</button>
                  <button type="button" disabled={exportBusy} onClick={() => void downloadPng()} style={{ minHeight: 40, padding: '0 16px', borderRadius: 4, border: 'none', background: C.orange, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: exportBusy ? 0.5 : 1 }}>{exportBusy ? 'Exporting…' : 'Download PNG'}</button>
                  {why === undefined && <span style={{ fontSize: 12, color: C.mute }}>The “why” boxes fill in once the breakdown loads.</span>}
                </div>
                <div style={{ width: '100%', maxWidth: 620, aspectRatio: exportSize === 'landscape' ? '16 / 9' : '4 / 5', overflow: 'hidden', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', position: 'relative' }}>
                  <div style={{ transformOrigin: 'top left', transform: `scale(${620 / (exportSize === 'landscape' ? 1200 : 1080)})`, position: 'absolute', top: 0, left: 0 }}>
                    <div ref={cardRef}><ShapeExportCard key={exportSize} d={exportData} size={exportSize} /></div>
                  </div>
                </div>
                {exportError && <div role="alert" style={{ fontSize: 12.5, color: '#A8391F', marginTop: 6 }}>{exportError}</div>}
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>A picture of this pitcher’s read for a post: the map, his Shape Score, his results against his shape and the reasons. It carries the x9Lab footer and handle, and says what has happened, not what comes next.</div>
              </div>
            )}
          </div>
        )}
        {(() => {
          // the reason flag: what the breakdown below found, said first. Only when his results trail his shape (or the breakdown found nothing to blame).
          if (why === 'locked' || verdict !== 'behind' || !built || built.gap == null || built.gap < EFFECT_NOTICE) return null
          const names = built.hurting.map(r => r.label)
          return (
            <div style={{ margin: '12px 0 0', border: '1.5px solid #A8391F', background: '#FBE6E1', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ ...k, color: '#A8391F' }}>Why the results are not there</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 4px' }}>
                {names.length ? names.map(n => <span key={n} style={{ background: '#A8391F', color: '#fff', fontWeight: 800, fontSize: 12.5, borderRadius: 3, padding: '3px 9px' }}>{n}</span>)
                  : <span style={{ background: C.ink, color: C.cream, fontWeight: 800, fontSize: 12.5, borderRadius: 3, padding: '3px 9px' }}>Not platoon, speed, extension, angle, location or sequencing</span>}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#3a352c' }}>{built.lead}</div>
              <a href="#psd-why" style={{ fontSize: 12.5, fontWeight: 700, color: '#B83A0E' }}>See the numbers behind it</a>
            </div>
          )
        })()}
        {(() => {
          // fantasy line: the counting and rate stats a fantasy manager reads, next to the gap between his ERA and the contact he allowed. Description only.
          const wl = overall?.workload ?? null
          if (!wl && !sel.stats) return null
          const era = wl?.era ?? sel.stats?.era ?? null, xera = sel.stats?.xera ?? null, fip = sel.stats?.fip ?? null
          const whip = wl && wl.ip > 0 ? (wl.h + wl.bb) / wl.ip : null
          const kp = wl && wl.bf > 0 ? wl.k / wl.bf : null, bp = wl && wl.bf > 0 ? wl.bb / wl.bf : null
          const tiles: { label: string; v: string; sub?: string }[] = [
            { label: 'ERA', v: era == null ? '—' : era.toFixed(2) },
            { label: 'xERA', v: xera == null ? '—' : xera.toFixed(2), sub: sel.stats?.xeraPa != null && sel.stats.xeraPa < 100 ? `${sel.stats.xeraPa} PA` : undefined },
            { label: 'FIP', v: fip == null ? '—' : fip.toFixed(2) },
            { label: 'WHIP', v: whip == null ? '—' : whip.toFixed(2) },
            { label: 'K%', v: kp == null ? '—' : `${(kp * 100).toFixed(1)}%` },
            { label: 'BB%', v: bp == null ? '—' : `${(bp * 100).toFixed(1)}%` },
            { label: 'IP', v: wl ? wl.ip.toFixed(1) : '—', sub: wl ? `${wl.gs} GS · ${wl.g} G` : undefined },
            { label: 'Wins', v: wl ? String(wl.w) : '—' },
            { label: 'ESPN owned', v: fmtOwned(sel.owned), sub: 'of ESPN leagues' },
          ]
          const eg = era != null && xera != null ? era - xera : null
          // look-back: the runs his own pitches gave up beyond what pitches shaped like his have given up, spread over his innings. A re-pricing of the season already played, on this one pitch.
          const nPitch = sel.ownRaw.n.rv
          const runsOver = gap != null && nPitch > 0 ? (-gap / 100) * nPitch : null
          const eraShift = runsOver != null && wl && wl.ip >= 20 ? (runsOver * 9) / wl.ip : null
          return (
            <div style={{ margin: '12px 0 0' }}>
              <div style={{ ...k, color: '#B83A0E', marginBottom: 6 }}>Fantasy line · {overall?.season ?? season ?? ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 6 }}>
                {tiles.map(t => <div key={t.label} style={{ background: C.soft, borderRadius: 6, padding: '8px 10px' }}><div style={{ ...k, color: C.mute }}>{t.label}</div><b style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{t.v}</b>{t.sub && <div style={{ fontSize: 10.5, color: C.faint }}>{t.sub}</div>}</div>)}
              </div>
              {runsOver != null && Math.abs(runsOver) >= 1 && eraShift != null && era != null && (
                <div style={{ background: C.soft, borderRadius: 6, padding: '8px 10px', marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: '#3a352c' }}>
                  <b>His season at his shape.</b> His {nPitch.toLocaleString()} {lc}s gave up {Math.abs(runsOver).toFixed(1)} runs {runsOver > 0 ? 'more' : 'fewer'} than pitches shaped like his have given up. Over his {wl!.ip.toFixed(0)} innings, that comes to {Math.abs(eraShift).toFixed(2)} runs per nine: an ERA of {Math.max(0, era - eraShift).toFixed(2)} instead of {era.toFixed(2)}. This re-prices the season already played, on this one pitch, and counts run expectancy as runs; it is not a forecast.
                </div>
              )}
              {eg != null && Math.abs(eg) >= 0.4 && <div style={{ fontSize: 12.5, color: '#3a352c', lineHeight: 1.5, marginTop: 6 }}>His ERA is {Math.abs(eg).toFixed(2)} runs {eg > 0 ? 'higher' : 'lower'} than his xERA, so the contact he has allowed has been {eg > 0 ? 'better' : 'worse'} than his results. {kp != null && bp != null && kp - bp >= 0.15 ? `He strikes out ${((kp - bp) * 100).toFixed(0)} points more batters than he walks.` : ''}</div>}
            </div>
          )
        })()}
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: '#3a352c', margin: '12px 0 0' }}>{headline}{verdict && better.length ? <> Better than the league at his shape on {better.join(', ')}.</> : null}{verdict && worse.length ? <> Worse on {worse.join(', ')}.</> : null}</p>

        <div className="psd-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0 28px', alignItems: 'start' }}>
          <style>{'@media(max-width:900px){.psd-cols{grid-template-columns:1fr !important}}'}</style>
          <div>
        <div style={sec}>1 · His season: every pitch he threw, {overall?.season ?? 'this season'}</div>
        {overall === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Loading his overall numbers…</div>
          : overall === null ? <div style={{ fontSize: 13, color: '#5b5347' }}>No overall numbers on record for him yet.</div>
          : (
            <>
              {overall.workload && <div style={{ fontSize: 13, color: '#3a352c', marginBottom: 8 }}>{overall.workload.ip.toFixed(1)} innings · {overall.workload.era != null ? `${overall.workload.era.toFixed(2)} ERA · ` : ''}{overall.workload.bf.toLocaleString()} batters faced{overall.workload.bf ? ` · ${((overall.workload.k / overall.workload.bf) * 100).toFixed(1)}% strikeouts` : ''}</div>}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr>{['Measure', 'Number', 'Rank', 'Where he sits'].map(th)}</tr></thead>
                <tbody>
                  {overall.ranks.map(r => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: '7px 4px', fontWeight: 700 }}>{r.label}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 800 }}>{fmtRank(r)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', color: '#5b5347' }}>{r.rank == null ? '—' : `${ordinal(r.rank)} of ${r.of}`}</td>
                      <td style={{ padding: '7px 4px', width: '34%' }}>
                        {r.pct == null ? <span style={{ color: C.faint, fontSize: 12 }}>{overall.ranked ? 'thin sample' : `under 500 pitches`}</span> : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ flex: 1, height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><i style={{ display: 'block', height: 8, width: `${r.pct}%`, background: r.pct >= 60 ? C.orange : r.pct <= 40 ? '#5E7A99' : '#B7AF9F' }} /></span>
                            <b style={{ fontSize: 12, minWidth: 22, textAlign: 'right' }}>{r.pct}</b>
                          </span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: C.faint, margin: '6px 0 0' }}>Ranked among pitchers with 500+ pitches this season, all pitch types together. 99 is best, 1 is worst, whichever way the stat runs.</div>
              {overallNote && <p style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5, margin: '10px 0 0', background: C.soft, borderRadius: 4, padding: '8px 10px' }}>{overallNote}</p>}
              {overall.savant && overall.savant.rows.length > 0 && (
                <>
                  <div style={sec}>Savant percentiles</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {overall.savant.rows.map(x => <span key={x.key} style={{ background: x.pct >= 60 ? '#FFE4D6' : x.pct <= 40 ? '#E3EAF2' : C.soft, color: x.pct >= 60 ? '#B83A0E' : x.pct <= 40 ? '#3F5F86' : '#5b5347', fontWeight: 700, fontSize: 12, borderRadius: 3, padding: '3px 8px' }}>{x.label} <b>{x.pct}</b></span>)}
                    {overall.savant.lockedCount > 0 && <span style={{ fontSize: 12, color: C.mute, alignSelf: 'center' }}>+{overall.savant.lockedCount} more with Pro</span>}
                  </div>
                </>
              )}
              {overall.byPitch.length > 0 && (
                <>
                  <div style={sec}>His arsenal</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr>{['Pitch', 'Use', 'wOBA', 'xwOBA', 'Whiff'].map(th)}</tr></thead>
                    <tbody>
                      {overall.byPitch.map(b => (
                        <tr key={b.pitchType} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <td style={{ padding: '6px 4px', fontWeight: 700 }}>{b.name}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{(b.share * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{b.woba == null ? '—' : d3(b.woba)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{b.xwoba == null ? '—' : d3(b.xwoba)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{b.whiff == null ? '—' : `${(b.whiff * 100).toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          </div>
          <div>
        <div style={sec}>2 · His {lc} shape</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 6 }}>
          {([['Velocity', sel.velo == null ? '—' : `${sel.velo.toFixed(1)} mph`], ['Ride', `${sel.ivb.toFixed(1)} in`], ['Run', `${sel.hb.toFixed(1)} in`], ['Arm angle', sel.slot == null ? '—' : `${sel.slot.toFixed(0)}°`], ['Ride variation (SD)', sel.sdIvb == null ? '—' : `±${sel.sdIvb.toFixed(1)} in`], ['Run variation (SD)', sel.sdHb == null ? '—' : `±${sel.sdHb.toFixed(1)} in`]] as [string, string][]).map(([a, b]) => (
            <div key={a} style={{ background: C.soft, borderRadius: 6, padding: '6px 8px' }}><div style={{ ...k, fontSize: 9 }}>{a}</div><b style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{b}</b></div>
          ))}
        </div>
        <div role="group" aria-label="How wide the shape window is" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <span style={k}>League window</span>
          {([['in1', '±1 in'], ['sd05', '±½ SD'], ['sd1', '±1 SD'], ['sd2', '±2 SD']] as const).map(([id, text]) => <button key={id} type="button" disabled={id !== 'in1' && (sel.sdHb == null || sel.sdIvb == null)} style={pill(wide === id)} onClick={() => setWide(id)}>{text}</button>)}
        </div>
        <div style={{ fontSize: 12, color: '#5b5347', margin: '6px 0 0', lineHeight: 1.5 }}>Widening the window by how much his own pitches vary takes in league {lc}s that move a little less like his, for a bigger sample. The box is ±{(rx10 / 10).toFixed(1)} in of run by ±{(ry10 / 10).toFixed(1)} in of ride around his average.</div>

        <div style={sec}>3 · His {lc} against the league’s {lc}s at his shape</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr>{['Stat', 'His', 'League at his shape', 'Gap'].map(th)}</tr></thead>
          <tbody>
            {rd.map(x => (
              <tr key={x.stat.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td style={{ padding: '7px 4px', fontWeight: 700 }}>{x.stat.label}{x.thin && <span style={{ color: C.faint, fontWeight: 600 }}> · thin sample</span>}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 800 }}>{x.stat.fmt(x.own)}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: C.mute }}>{x.stat.fmt(x.shape)}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}><span style={{ background: toneCol[x.tone].bg, color: toneCol[x.tone].fg, fontWeight: 800, borderRadius: 3, padding: '2px 7px' }}>{x.stat.diff(x.d)}</span></td>
              </tr>
            ))}
            <tr style={{ borderBottom: `1px solid ${C.line}` }}><td style={{ padding: '7px 4px', color: '#5b5347' }}>Sample behind it</td><td colSpan={3} style={{ padding: '7px 4px', textAlign: 'right', color: '#5b5347' }}>{sel.ownRaw.pitches.toLocaleString()} pitches · {sel.ownRaw.n.pa.toLocaleString()} plate appearances · {sel.ownRaw.n.ab.toLocaleString()} at-bats · {sel.ownRaw.n.swings.toLocaleString()} swings</td></tr>
            <tr><td style={{ padding: '7px 4px', color: '#5b5347' }}>League sample at his shape</td><td colSpan={3} style={{ padding: '7px 4px', textAlign: 'right', color: '#5b5347' }}>{shapeR.pitches.toLocaleString()} league pitches (2024 on) · {shapeR.n.pa.toLocaleString()} plate appearances · {shapeR.n.swings.toLocaleString()} swings</td></tr>
          </tbody>
        </table>
        {note && <p style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5, margin: '10px 0 0', background: C.soft, borderRadius: 4, padding: '8px 10px' }}>{note}</p>}

          </div>
        </div>
        <WhySection sel={sel} lc={lc} why={why} bins={bins} verdictGap={gap} diagnosis={diagnosis} sec={sec} pill={pill} />

        <div style={{ ...sec, marginTop: 22 }}>5 · Across his whole arsenal: another pitch, a situation, or sequencing</div>
        {diagnosis === 'locked' ? (
          <div style={{ background: C.soft, borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, marginBottom: 8 }}>For a pitcher whose shape has produced more than his results show: which pitch is losing, which batters, counts and times through the order cost him, and whether first-pitch strikes, the zone, chase or repeating pitches point to sequencing.</div>
            <UpgradePrompt source="pitch_shape" />
          </div>
        ) : diagnosis === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Checking his pitches, situations and sequencing…</div>
          : diagnosis === null ? <div style={{ fontSize: 13, color: '#5b5347' }}>The leak check could not be read for him right now.</div>
          : 'needsSql' in diagnosis ? <div style={{ fontSize: 13, color: '#5b5347' }}>The leak check fills once the situation data is set up (one SQL file, shape_diagnosis_functions).</div>
          : (
            <>
              {diagnosis.summary.length > 0 && (
                <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                  {diagnosis.summary.map((x, i) => <div key={i} style={{ background: x.tone === 'leak' ? '#FBE6E1' : '#E3F3EC', color: '#3a352c', fontSize: 13.5, lineHeight: 1.5, borderRadius: 4, padding: '8px 11px' }}>{x.text}</div>)}
                </div>
              )}
              <div className="psd-leak" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ ...k, marginBottom: 6 }}>By pitch: each against its own shape</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr>{['Pitch', 'Use', 'Shape', 'His', 'Cost'].map(th)}</tr></thead>
                    <tbody>
                      {diagnosis.arsenal.map(a => (
                        <tr key={a.pitchType} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <td style={{ padding: '6px 4px', fontWeight: 700 }}>{a.name}{a.small && <span style={{ color: C.faint, fontWeight: 600 }}> · small</span>}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{(a.share * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right', color: C.mute }}>{a.shapeSaved == null ? '—' : signed(a.shapeSaved)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 800 }}>{a.ownSaved == null ? '—' : signed(a.ownSaved)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>{a.cost == null ? '—' : <span style={{ background: a.cost >= 0.2 ? '#FBE6E1' : a.cost <= -0.2 ? '#E3F3EC' : C.soft, color: a.cost >= 0.2 ? '#A8391F' : a.cost <= -0.2 ? '#13694F' : '#5b5347', fontWeight: 800, borderRadius: 3, padding: '1px 6px' }}>{signed(a.cost)}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Runs saved per 100 pitches of that type: what its shape has produced for league pitches, and what his has. Cost is the gap times its share of his pitches (positive costs him), in runs per 100 of all his pitches.</div>
                </div>
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ ...k, marginBottom: 6 }}>By situation: against league pitchers with his mix</div>
                  {diagnosis.leaks.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>No batter side, count or time through the order costs him as much as a fifth of a run per 100 pitches more than it would a league pitcher with his mix ({diagnosis.pitches.toLocaleString()} pitches checked).</div>
                    : diagnosis.leaks.slice(0, 4).map(l => (
                      <div key={l.label} style={{ borderBottom: `1px solid ${C.line}`, padding: '7px 0', fontSize: 13, lineHeight: 1.45 }}>
                        <b>{l.label[0].toUpperCase() + l.label.slice(1)}</b> · {l.pitches.toLocaleString()} pitches ({(l.share * 100).toFixed(0)}%)<br />
                        <span style={{ color: '#5b5347' }}>{r2(l.mine100)} runs per 100 against {r2(l.expected100)} expected · costs {l.cost.toFixed(2)} per 100 overall</span>
                      </div>
                    ))}
                </div>
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12 }}>
                  <div style={{ ...k, marginBottom: 6 }}>Sequencing and command</div>
                  {diagnosis.process.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>His first-pitch strikes, pitches in the zone, chase, repeat rate and fastball use when ahead are all close to what league pitchers with his mix show, so none of them points to the gap.</div>
                    : diagnosis.process.map(p => (
                      <div key={p.id} style={{ borderBottom: `1px solid ${C.line}`, padding: '7px 0', fontSize: 13, lineHeight: 1.45 }}>
                        <b style={{ color: p.hurts ? '#A8391F' : '#13694F' }}>{p.label} · {p.hurts ? 'against him' : 'helps him'}</b><br />
                        <span style={{ color: '#3a352c' }}>{p.text}</span> <span style={{ color: C.faint, fontSize: 11.5 }}>({p.n.toLocaleString()} pitches)</span>
                      </div>
                    ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Everything is set against league pitchers throwing the same pitch types to the same kind of batter, {diagnosis.season}, regular season. It cannot see command inside the zone, defense, park or luck beyond the contact-quality check. It describes what has happened and does not predict.</div>
            </>
          )}

        <div style={{ fontSize: 11, color: C.faint, margin: '10px 0 0' }}>“League at his shape” is what league {lc}s inside the window have produced, all seasons since 2024 added up; outperforming or underperforming compares his own results with that, and describes what has happened. Location, sequencing, deception, defense and luck are not in the shape. Green is better for the pitcher than his shape by more than the usual noise, red is worse.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <FollowIsland kind="player" refId={String(sel.pitcherId)} name={sel.name} />
          <button type="button" onClick={() => onOpen(sel.pitcherId, sel.name)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: C.orange, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Open all his pitches →</button>
        </div>
      </div>
    )
}

export type PanelProps = {
  board: Board | null | undefined
  hb: number; ivb: number; radius: number
  lc: string
  selectedId: number | null
  /** the selected pitcher's overall numbers: undefined while loading, null when there are none */
  overall: Overall | null | undefined
  /** league pitches in a box of half-width rx x ry (tenths of an inch) around a shape, ungated and gated, all seasons added up; null until the results map has loaded */
  shapeAt: ((hb: number, ivb: number, rx10: number, ry10: number) => { raw: M; gated: M } | null) | null
  /** the league's shape bins for this pitch and hand (speed and arm angle as well as movement): undefined while loading, null when not available */
  bins: ShapeBin[] | null | undefined
  /** where he is leaking (which pitch, situation, process measure): undefined while loading, 'locked' for a viewer who is not Pro, null when it could not be read */
  diagnosis: DiagnosisResult | 'locked' | undefined
  /** the pitch the map is showing and the season of the league data, so the detail can ask for platoon, location and sequencing against the same shape */
  pitchType: string
  season: number | null
  /** the league movement map and the chosen pitcher's sampled pitches, so the X export can draw them; null until the map has loaded */
  exportMap: { payload: MovementCellsPayload; span: 'latest' | 'all'; leagueRate: number; points: [number, number][] } | null
  onSelect: (id: number | null) => void
  onOpen: (id: number, name: string) => void
  headshot: (id: number) => string
}

/**
 * The pitchers whose average shape sits in the chosen spot, split into performing, not performing and in line with what their shape has produced, with the stats
 * that explain it flagged on each row. Click a pitcher for his full read. Pitchers are those inside the spot's box; with fewer than 6 it takes the nearest 8 and says so.
 */
export function ShapePlayersPanel({ board, hb, ivb, radius, lc, selectedId, onSelect }: PanelProps) {
  const [tab, setTab] = useState<'ahead' | 'behind' | 'level'>('behind')
  const [all, setAll] = useState(false)
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 11px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' })
  if (board === undefined) return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, fontSize: 13, color: C.mute }}>Finding the pitchers at this shape…</div>
  if (!board) return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, fontSize: 13, color: '#5b5347' }}>Pitcher results aren’t built for this pitch yet. They fill after the weekly shape-results job runs.</div>

  const dist = (r: BoardRow) => Math.hypot(r.hb - hb, r.ivb - ivb)
  const inside = board.rows.filter(r => Math.abs(r.hb - hb) <= radius && Math.abs(r.ivb - ivb) <= radius)
  const near = inside.length >= 6 ? inside : [...board.rows].sort((a, b) => dist(a) - dist(b)).slice(0, 8)
  const widened = inside.length < 6
  const cohort = near.map(r => ({ r, rd: reads(r) }))
  const group = (v: 'ahead' | 'behind' | 'level') => cohort.filter(c => c.r.verdict === v).sort((a, b) => (v === 'ahead' ? (b.r.gap ?? 0) - (a.r.gap ?? 0) : v === 'behind' ? (a.r.gap ?? 0) - (b.r.gap ?? 0) : b.r.pitches - a.r.pitches))
  const few = cohort.filter(c => c.r.verdict == null)
  const sel = selectedId != null ? board.rows.find(r => r.pitcherId === selectedId) ?? null : null

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }

  const list = group(tab)
  const shown = all ? list : list.slice(0, 6)
  const tabs: { id: 'ahead' | 'behind' | 'level'; label: string }[] = [
    { id: 'behind', label: `Underperforming (${group('behind').length})` }, { id: 'ahead', label: `Outperforming (${group('ahead').length})` }, { id: 'level', label: `In line (${group('level').length})` },
  ]
  return (
    <div style={card} id="pf2-panel">
      <div className="pv-k" style={{ color: '#B83A0E' }}>Pitchers at this shape</div>
      <p style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, margin: '2px 0 10px' }}>
        {widened ? `${inside.length === 0 ? 'No pitcher averages' : `Only ${inside.length} pitcher${inside.length === 1 ? ' averages' : 's average'}`} a ${lc} within ±${radius} in of this spot, so these are the ${near.length} nearest.` : `${inside.length} pitchers average a ${lc} within ±${radius} in of this spot.`} Outperforming means his own results beat what pitches shaped like his have produced; underperforming means they trail it. The shape word says how good the shape itself is. Click a pitcher for his shape numbers and his overall numbers, with where they rank.
      </p>
      <div role="group" aria-label="Pitchers at this shape" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {tabs.map(t => <button key={t.id} type="button" style={pill(tab === t.id)} onClick={() => { setTab(t.id); setAll(false) }}>{t.label}</button>)}
      </div>
      {shown.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347', padding: '6px 0' }}>None here with enough pitches to compare.</div> : shown.map(({ r, rd }) => {
        const top = [...rd].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).filter(x => x.tone !== 'level').slice(0, 3)
        return (
          <button key={r.pitcherId} type="button" onClick={() => { onSelect(r.pitcherId); document.getElementById('pf2-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 0, borderTop: `1px solid ${C.line}`, padding: '10px 6px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, ...(r.pitcherId === selectedId ? { background: '#FFF1EA' } : null) }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14.5 }}>{r.name}</b><span style={{ color: C.mute, fontSize: 12.5 }}>{r.teamAbbr} · {r.pitches.toLocaleString()} pitches</span>{(() => { const w = shapeWord(r.score); return w ? <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{w.word}</span> : null })()}
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5b5347' }}>Shape Score <b style={{ color: C.ink, fontSize: 14 }}>{r.score ?? '—'}</b></span>
              <span style={{ fontWeight: 800, fontSize: 13, color: r.verdict === 'ahead' ? C.good : r.verdict === 'behind' ? C.bad : C.ink }}>{r.gap != null ? `${signed(r.gap)} /100` : ''}</span>
            </div>
            {top.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                {top.map(x => <span key={x.stat.id} style={{ background: toneCol[x.tone].bg, color: toneCol[x.tone].fg, fontSize: 11.5, fontWeight: 700, borderRadius: 3, padding: '2px 7px' }}>{x.stat.label.replace(' against', '').replace(' per swing', '').replace(' / 100', '')} {x.stat.fmt(x.own)} vs {x.stat.fmt(x.shape)}</span>)}
              </div>
            )}
          </button>
        )
      })}
      {list.length > 6 && <button type="button" style={{ ...pill(false), marginTop: 8 }} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
      {few.length > 0 && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>{few.length} more here ({few.slice(0, 3).map(c => c.r.name).join(', ')}{few.length > 3 ? '…' : ''}) have too few pitches to compare.</div>}
    </div>
  )
}

// ---- Find me a pitcher --------------------------------------------------------------------------------------------------------------------------------

/** What the finder can be narrowed by. Each is a dropdown with "Any" first. */
/** Savant's xERA on fewer plate appearances than this is shown but marked thin. */
const THIN_XERA_PA = 100

/** Star toggle for "My pitchers" (kept in this browser). */
function Star({ id, name, style }: { id: number; name: string; style?: React.CSSProperties }) {
  const { has, toggle } = useRoster()
  const on = has(id)
  return <button type="button" onClick={e => { e.stopPropagation(); toggle(id) }} aria-pressed={on} aria-label={on ? `Remove ${name} from my pitchers` : `Save ${name} to my pitchers`} title={on ? 'In my pitchers' : 'Save to my pitchers'} style={{ width: 40, height: 40, borderRadius: 4, border: `1px solid ${on ? C.orange : C.line}`, background: on ? '#FFF1EA' : '#fff', color: on ? C.orange : C.mute, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', ...style }}>{on ? '★' : '☆'}</button>
}
const fmtOwned = (v: number | null | undefined) => (v == null ? '—' : v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`)
const ERA_MIN = [4.5, 5, 5.5, 6, 7]
const XERA_MAX = [3, 3.5, 4, 4.5]
const GAP_MIN = [0.5, 1, 1.5, 2, 3]
const SCORE_MIN = [50, 70, 80, 90, 95]
const OWNED_MAX = [1, 5, 10, 25, 50]   // ESPN percent rostered, at most
const selVal = (v: number | null) => (v == null ? '' : String(v))
const num = (v: string) => (v === '' ? null : Number(v))

/**
 * "Find me a pitcher": narrow the board by ERA, xERA, the gap between them and Shape Score, pick what to look for (strong shape with trailing results, a quiet line, results the shape does not
 * explain, or anyone), then either see the best matches or shuffle a random six, or let it pick one at random. Cards carry a headshot and the numbers that matter; clicking one opens his full read.
 * Established names (All-Stars, award winners, full-time veterans) are hidden unless asked for; small samples are kept and tagged.
 */
export function FindPitcher({ board, lc, hand, headshot, onPick }: { board: Board | null | undefined; lc: string; hand: 'R' | 'L'; headshot: (id: number) => string; onPick: (r: BoardRow) => void }) {
  const [lens, setLens] = useState<LensId>('hidden')
  const [open, setOpen] = useState(true)
  const [known, setKnown] = useState(false)    // include All-Stars, award winners and full-time veterans
  const [small, setSmall] = useState(true)     // include pitchers whose own sample is under the usual minimum
  const [minEra, setMinEra] = useState<number | null>(null)
  const [maxXera, setMaxXera] = useState<number | null>(null)
  const [minGap, setMinGap] = useState<number | null>(null)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [maxOwned, setMaxOwned] = useState<number | null>(null)   // ESPN percent rostered, at most
  const roster = useRoster()
  const [seed, setSeed] = useState<number | null>(null)   // null = best matches first; a number = a random six for that seed
  const L = LENSES.find(l => l.id === lens) ?? LENSES[0]
  const allRows = board ? board.rows : []
  const rows = maxOwned == null ? allRows : allRows.filter(r => r.owned != null && r.owned <= maxOwned)
  const mine = allRows.filter(r => roster.ids.includes(r.pitcherId))
  const base = { includeKnown: known, includeSmall: small, minEra, maxXera, minEraGap: minGap, minScore }
  const found = findPitchers(rows, lens, { ...base, limit: 6, seed })
  const total = findPitchers(rows, lens, { ...base, limit: 9999 }).length
  const hiddenKnown = known ? 0 : findPitchers(rows, lens, { ...base, includeKnown: true, limit: 9999 }).length - total
  const noAwards = rows.length > 0 && rows.every(r => r.profile == null)
  const noStats = rows.length > 0 && rows.every(r => r.stats == null)
  const anyFilter = minEra != null || maxXera != null || minGap != null || minScore != null || maxOwned != null
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.orange : C.line}`, background: on ? '#FFF1EA' : '#fff', color: C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
  const selectStyle: React.CSSProperties = { minHeight: 38, minWidth: 96, border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', padding: '0 8px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }
  const clear = () => { setMinEra(null); setMaxXera(null); setMinGap(null); setMinScore(null); setMaxOwned(null) }
  const surprise = () => {
    const pool = findPitchers(rows, lens, { ...base, limit: 9999 })
    if (pool.length) onPick(pool[Math.floor(Math.random() * pool.length)])
  }
  const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
  return (
    <section id="pf2-find" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px', margin: '4px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 18 }}>Find me a pitcher</b>
        <span style={{ fontSize: 13, color: '#5b5347' }}>{hand === 'R' ? 'Right' : 'Left'}-handed {lc}s. Set what you want, then shuffle or let it choose.</span>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ ...pill(false), marginLeft: 'auto', minHeight: 36 }}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <>
          <div style={{ display: 'flex', gap: '10px 16px', flexWrap: 'wrap', alignItems: 'flex-end', background: C.soft, borderRadius: 6, padding: '10px 12px', margin: '12px 0 6px' }}>
            <label style={field}><span className="pv-k">Look for</span>
              <select style={{ ...selectStyle, minWidth: 230 }} value={lens} onChange={e => setLens(e.target.value as LensId)} aria-label="What to look for">
                {LENSES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select></label>
            <label style={field}><span className="pv-k">ERA at least</span>
              <select style={selectStyle} value={selVal(minEra)} onChange={e => setMinEra(num(e.target.value))} aria-label="ERA at least">
                <option value="">Any</option>{ERA_MIN.map(v => <option key={v} value={v}>{v.toFixed(1)}</option>)}
              </select></label>
            <label style={field}><span className="pv-k">xERA at most</span>
              <select style={selectStyle} value={selVal(maxXera)} onChange={e => setMaxXera(num(e.target.value))} aria-label="xERA at most">
                <option value="">Any</option>{XERA_MAX.map(v => <option key={v} value={v}>{v.toFixed(1)}</option>)}
              </select></label>
            <label style={field}><span className="pv-k">ERA above xERA by</span>
              <select style={selectStyle} value={selVal(minGap)} onChange={e => setMinGap(num(e.target.value))} aria-label="ERA above xERA by at least">
                <option value="">Any</option>{GAP_MIN.map(v => <option key={v} value={v}>{v.toFixed(1)}+</option>)}
              </select></label>
            <label style={field}><span className="pv-k">Shape Score</span>
              <select style={selectStyle} value={selVal(minScore)} onChange={e => setMinScore(num(e.target.value))} aria-label="Shape Score at least">
                <option value="">Any</option>{SCORE_MIN.map(v => <option key={v} value={v}>{v}+</option>)}
              </select></label>
            <label style={field}><span className="pv-k">ESPN rostered</span>
              <select style={selectStyle} value={selVal(maxOwned)} onChange={e => setMaxOwned(num(e.target.value))} aria-label="ESPN percent rostered, at most">
                <option value="">Any</option>{OWNED_MAX.map(v => <option key={v} value={v}>{v}% or less</option>)}
              </select></label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 38, fontSize: 13 }}><input type="checkbox" checked={!known} onChange={e => setKnown(!e.target.checked)} /> Hide established names</label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 38, fontSize: 13 }}><input type="checkbox" checked={small} onChange={e => setSmall(e.target.checked)} /> Include small samples</label>
            {anyFilter && <button type="button" onClick={clear} style={{ ...pill(false), minHeight: 38, marginLeft: 'auto' }}>Clear filters</button>}
          </div>
          <div style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 12px' }}>{L.blurb}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <button type="button" onClick={surprise} disabled={!board || total === 0} style={{ minHeight: 46, padding: '0 22px', borderRadius: 4, border: 'none', background: C.orange, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: !board || total === 0 ? 0.4 : 1 }}>Surprise me</button>
            <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} disabled={!board || total === 0} style={{ ...pill(seed != null), minHeight: 46, opacity: !board || total === 0 ? 0.4 : 1 }}>↻ Shuffle six</button>
            {seed != null && <button type="button" onClick={() => setSeed(null)} style={{ ...pill(false), minHeight: 46 }}>Best matches first</button>}
            <span style={{ fontSize: 12.5, color: '#5b5347' }}>
              {board ? `${total} match${total === 1 ? '' : 'es'}${!known && hiddenKnown > 0 ? ` · ${hiddenKnown} established name${hiddenKnown === 1 ? '' : 's'} hidden` : ''}${seed != null ? ' · a random six' : total > found.length ? ` · best ${found.length} shown` : ''}` : ''}
            </span>
          </div>

          {board === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Looking…</div>
            : !board ? <div style={{ fontSize: 13, color: '#5b5347' }}>Pitcher results aren’t built for this pitch yet. They fill after the weekly shape-results job runs.</div>
            : found.length === 0 ? <div style={{ fontSize: 13.5, color: '#5b5347', background: C.soft, borderRadius: 6, padding: '12px 14px' }}>Nobody matches all of that for the {hand === 'R' ? 'right' : 'left'}-handed {lc}. Loosen a filter, try another lens, or switch hand or pitch.{anyFilter && noStats ? ' ERA and xERA are not loaded for this season yet.' : ''}</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 12 }}>
                {found.map(r => {
                  const w = shapeWord(r.score)
                  const gap = r.stats?.era != null && r.stats?.xera != null ? r.stats.era - r.stats.xera : null
                  return (
                    <div key={r.pitcherId} style={{ position: 'relative' }}>
                    <button type="button" onClick={() => onPick(r)} style={{ width: '100%', textAlign: 'left', background: '#FAF8F3', border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={headshot(r.pitcherId)} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: 'contain', objectPosition: 'center bottom', background: '#fff', borderRadius: 8, border: `1px solid ${C.line}` }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}><b style={{ fontSize: 17, letterSpacing: '-.01em' }}>{r.name}</b><span style={{ color: C.mute, fontSize: 12.5 }}>{r.teamAbbr}</span></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, margin: '8px 0 6px' }}>
                          {([['ERA', f1(r.stats?.era), null, ''], ['xERA', f1(r.stats?.xera), gap != null && gap >= 1 ? '#13694F' : null, r.stats?.xeraPa != null && r.stats.xeraPa < THIN_XERA_PA ? ` · ${r.stats.xeraPa} PA` : ''], ['Shape', r.score == null ? '—' : String(r.score), r.score != null && r.score >= 70 ? '#B83A0E' : null, ''], ['ESPN', fmtOwned(r.owned), null, '']] as [string, string, string | null, string][]).map(([a, b, col, note]) => (
                            <div key={a} title={note ? `Savant's xERA on only ${r.stats?.xeraPa} plate appearances: shown, but noisy` : undefined} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 8px', opacity: note ? 0.7 : 1 }}><div style={{ ...k, fontSize: 9 }}>{a}{note}</div><b style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums', color: col ?? C.ink }}>{b}</b></div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {w && <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{w.word}</span>}
                          {r.verdict && r.verdict !== 'level' && <span style={{ background: r.verdict === 'ahead' ? '#E3F3EC' : '#FBE6E1', color: r.verdict === 'ahead' ? '#13694F' : '#A8391F', fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{r.verdict === 'ahead' ? 'Outperforming' : 'Underperforming'}{r.gap != null ? ` ${signed(r.gap)}` : ''}</span>}
                          {r.small && <span style={{ background: '#FFF4CC', color: '#7A5B00', fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>Small sample · {r.ownRaw.n.rv.toLocaleString()}</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.4, marginTop: 5 }}>
                          {r.profile ? `${r.profile.allStars > 0 ? `${r.profile.allStars}× All-Star` : 'Never an All-Star'}${r.profile.debutYear ? ` · debuted ${r.profile.debutYear}` : ''}` : 'Award history not available'}{r.stats?.ip != null ? ` · ${r.stats.ip.toFixed(1)} IP` : ''}
                        </div>
                      </div>
                    </button>
                    <Star id={r.pitcherId} name={r.name} style={{ position: 'absolute', top: 8, right: 8 }} />
                    </div>
                  )
                })}
              </div>
            )}
          {mine.length > 0 && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
              <div style={{ ...k, color: '#B83A0E', marginBottom: 6 }}>My pitchers · {mine.length} on this pitch</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {mine.map(r => {
                  const w = shapeWord(r.score)
                  return (
                    <button key={r.pitcherId} type="button" onClick={() => onPick(r)} style={{ textAlign: 'left', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}><b style={{ fontSize: 14.5 }}>{r.name}</b><span style={{ color: C.mute, fontSize: 12 }}>{r.teamAbbr}</span>{w && <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 10.5, borderRadius: 3, padding: '0 5px' }}>{w.word}</span>}</div>
                      <div style={{ fontSize: 12.5, color: '#3a352c', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>Shape {r.score ?? '—'} · ERA {f1(r.stats?.era)} · xERA {f1(r.stats?.xera)} · ESPN {fmtOwned(r.owned)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: r.verdict === 'ahead' ? '#13694F' : r.verdict === 'behind' ? '#A8391F' : '#5b5347', marginTop: 2 }}>{r.verdict === 'ahead' ? 'Outperforming his shape' : r.verdict === 'behind' ? 'Underperforming his shape' : r.verdict === 'level' ? 'In line with his shape' : 'Too few pitches to compare'}</div>
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Starred pitchers are saved in this browser only. Only those who throw this pitch with this hand show here; change the pitch or hand to see the rest.</div>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>{noAwards ? 'Award history could not be read from the MLB Stats API, so established names are screened by workload only. ' : ''}ESPN is the share of ESPN fantasy leagues that roster him, updated daily. ERA, xERA and innings are this season’s (xERA from Baseball Savant, which carries it for every pitcher; one on under 100 plate appearances is greyed and marked thin, because it is noisy); the green xERA marks an ERA at least a run above it. Established means an All-Star, Cy Young, MVP or All-MLB selection, or {ESTABLISHED_PITCHES.toLocaleString()}+ pitches since 2024. A small sample is under 300 of his own {lc}s: shown, but noisy, so check the count. Strong shape means a Shape Score of {STRONG_SCORE} or more, weak {WEAK_SCORE} or less. Describes what has happened, not a forecast. Click a pitcher for his shape, his season and where they rank.</div>
        </>
      )}
    </section>
  )
}

// ---- Why aren't the results there? ---------------------------------------------------------------------------------------------------------------------

type Status = 'explains' | 'helps' | 'small' | 'note' | 'unknown'
const STATUS: Record<Status, { word: string; bg: string; fg: string }> = {
  explains: { word: 'Part of the gap', bg: '#FBE6E1', fg: '#A8391F' }, helps: { word: 'Helping him', bg: '#E3F3EC', fg: '#13694F' },
  small: { word: 'Not the cause', bg: '#F1EEE6', fg: '#5b5347' }, note: { word: 'Worth noting', bg: '#FFF4CC', fg: '#7A5B00' }, unknown: { word: 'No read', bg: '#F1EEE6', fg: '#8a8275' },
}
type WRow = { id: string; label: string; status: Status; number: string; text: string; sortKey: number }

/** The catcher's-view 3 x 3 of the strike zone with his share of the pitch in each square against the league's for the same shape, and the share outside the zone. */
function ZoneGrids({ factor }: { factor: Factor }) {
  const by = new Map(factor.slices.map(s => [s.key, s]))
  const out = (pick: (s: Factor['slices'][number]) => number) => factor.slices.filter(s => Number(s.key) >= 11).reduce((a, s) => a + pick(s), 0)
  const grid = (pick: (s: Factor['slices'][number]) => number, title: string, ref: (s: Factor['slices'][number]) => number) => (
    <div>
      <div style={{ ...k, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, width: 156 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => {
          const sl = by.get(String(z)), v = sl ? pick(sl) : 0, r = sl ? ref(sl) : 0
          const over = v - r   // over-used squares darker orange, under-used blue-grey
          const bg = Math.abs(over) < 0.01 ? '#F1EEE6' : over > 0 ? `rgba(255,87,34,${Math.min(0.85, 0.25 + over * 5)})` : `rgba(94,122,153,${Math.min(0.7, 0.2 + -over * 5)})`
          return <div key={z} title={ZONE_LABEL[String(z)]} style={{ background: bg, borderRadius: 3, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{(v * 100).toFixed(0)}%</div>
        })}
      </div>
      <div style={{ fontSize: 11.5, color: '#5b5347', marginTop: 4 }}>Outside the zone: <b>{(out(pick) * 100).toFixed(0)}%</b></div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {grid(s => s.his, 'His, catcher’s view', s => s.league)}
      {grid(s => s.league, 'League, same shape', s => s.league)}
      <div style={{ fontSize: 12, color: '#5b5347', maxWidth: 220, lineHeight: 1.5, alignSelf: 'center' }}>Orange squares are where he throws it more than league pitches of the same shape do; blue-grey, less.</div>
    </div>
  )
}

/** The factor rows and the one-line lead for a pitcher's pitch, shared by the detail table and the X export. `why` must be a loaded breakdown. */
export function buildWhy(sel: BoardRow, lc: string, why: Extract<WhyResult, { hisPitches: number }>, bins: ShapeBin[] | null | undefined, diagnosis: DiagnosisResult | 'locked' | undefined) {
  const shapeNow = sel.velo != null && sel.slot != null ? { velo: sel.velo, ivb: sel.ivb, hb: sel.hb, slot: sel.slot } : null
  const ex = bins && shapeNow ? explainShape(bins, shapeNow) : null
  const f = (id: Factor['id']) => why.factors.find(x => x.id === id) as Factor
  const platoon = f('platoon'), location = f('location'), sequencing = f('sequencing')
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`
  const eff = (v: number | null) => (v == null ? '' : Math.abs(v) < 0.005 ? '0.00 runs per 100' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} runs per 100`)
  const mixStatus = (e: number | null): Status => { const v = verdictOf(e); return v == null ? 'unknown' : v }

  const rows: WRow[] = []
  // platoon
  const lh = platoon.slices.find(x => x.key === 'L')
  rows.push({ id: 'platoon', label: 'Platoon', status: mixStatus(platoon.effect), number: eff(platoon.effect), sortKey: platoon.effect ?? -9,
    text: lh ? `He throws ${pct(lh.his)} of his ${lc}s to left-handed batters; league ${lc}s with this shape go ${pct(lh.league)} to them. Priced at what the league got from each side for this shape, his mix ${platoon.effect != null && platoon.effect >= EFFECT_NOTICE ? 'costs' : platoon.effect != null && platoon.effect <= -EFFECT_NOTICE ? 'saves' : 'changes almost nothing'}.` : 'No platoon read.' })
  // velocity
  const vd = why.velocity.diff
  const speedEff = ex?.whiffEffect.speed ?? null, speedCon = ex?.contactEffect.speed ?? null
  let vStatus: Status = 'small', vText = 'His speed is close to the league’s for this shape.'
  if (vd != null && Math.abs(vd) >= SPEED_NOTICE_MPH) {
    const slow = vd < 0
    const hurts = (speedEff != null && speedEff <= -0.03) || (speedCon != null && speedCon >= 0.015)
    const aids = (speedEff != null && speedEff >= 0.03) || (speedCon != null && speedCon <= -0.015)
    vStatus = slow ? (hurts ? 'explains' : 'note') : aids ? 'helps' : 'small'
    vText = `He throws it ${Math.abs(vd).toFixed(1)} mph ${slow ? 'slower' : 'faster'} than league ${lc}s with this movement.${ex && (speedEff != null || speedCon != null) ? ` League ${lc}s with this movement at his speed get ${ex.atSpeed.whiff == null ? '—' : `${(ex.atSpeed.whiff * 100).toFixed(1)}%`} whiffs per swing against ${ex.all.whiff == null ? '—' : `${(ex.all.whiff * 100).toFixed(1)}%`} at every speed${speedCon != null && ex.atSpeed.xwobaCon != null && ex.all.xwobaCon != null ? `, and ${d3(ex.atSpeed.xwobaCon)} xwOBA on contact against ${d3(ex.all.xwobaCon)}` : ''}.` : ''}`
  }
  rows.push({ id: 'velo', label: 'Velocity', status: vStatus, number: why.velocity.his != null && why.velocity.league != null ? `${why.velocity.his.toFixed(1)} vs ${why.velocity.league.toFixed(1)} mph` : '—', sortKey: vStatus === 'explains' ? 5 : vStatus === 'note' ? 1 : -1, text: vText })
  // extension
  const ed = why.extension.diff
  let eStatus: Status = 'small', eText = 'His extension is close to the league’s for this shape.'
  if (ed != null && Math.abs(ed) >= EXTENSION_NOTICE_FT) eStatus = ed < 0 ? 'note' : 'helps', eText = `He releases it ${Math.abs(ed).toFixed(2)} ft ${ed < 0 ? 'shorter' : 'longer'} than league ${lc}s with this movement. ${ed < 0 ? 'A shorter reach releases the ball farther from the plate, which tends to make a pitch play slower than its radar speed.' : 'A longer reach releases the ball closer to the plate, which tends to make a pitch play faster than its radar speed.'}`
  rows.push({ id: 'ext', label: 'Extension', status: eStatus, number: why.extension.his != null && why.extension.league != null ? `${why.extension.his.toFixed(2)} vs ${why.extension.league.toFixed(2)} ft` : '—', sortKey: eStatus === 'note' ? 1 : -1, text: eText })
  // arm angle
  const sd = ex?.slotDiff ?? null, angEff = ex?.whiffEffect.angle ?? null, angCon = ex?.contactEffect.angle ?? null
  let aStatus: Status = 'small', aText = bins === undefined ? 'Checking arm angle…' : 'His arm angle is close to the league’s for this shape.'
  if (ex && sd != null && Math.abs(sd) >= 8) {
    const hurts = (angEff != null && angEff <= -0.03) || (angCon != null && angCon >= 0.015), aids = (angEff != null && angEff >= 0.03) || (angCon != null && angCon <= -0.015)
    aStatus = hurts ? 'explains' : aids ? 'helps' : 'small'
    aText = `His arm angle is ${Math.abs(sd).toFixed(0)}° ${sd < 0 ? 'lower' : 'higher'} than league ${lc}s with this movement. At his angle they get ${ex.atAngle.whiff == null ? '—' : `${(ex.atAngle.whiff * 100).toFixed(1)}%`} whiffs per swing against ${ex.all.whiff == null ? '—' : `${(ex.all.whiff * 100).toFixed(1)}%`} at every angle.`
  }
  rows.push({ id: 'angle', label: 'Arm angle', status: aStatus, number: shapeNow && ex?.typicalSlot != null ? `${shapeNow.slot.toFixed(0)}° vs ${ex.typicalSlot.toFixed(0)}°` : '—', sortKey: aStatus === 'explains' ? 4 : -1, text: aText })
  // location (command)
  const zs = biggestZoneShift(location)
  const outHis = location.slices.filter(x => Number(x.key) >= 11).reduce((a, x) => a + x.his, 0), outLg = location.slices.filter(x => Number(x.key) >= 11).reduce((a, x) => a + x.league, 0)
  rows.push({ id: 'location', label: 'Location (command)', status: mixStatus(location.effect), number: eff(location.effect), sortKey: location.effect ?? -9,
    text: `${zs && zs.his - zs.league >= 0.01 ? `He throws ${pct(zs.his)} of his ${lc}s to the ${ZONE_LABEL[zs.key].toLowerCase()} square against ${pct(zs.league)} for league ${lc}s with this shape. ` : ''}${pct(outHis)} are outside the zone against ${pct(outLg)}. Priced at the league’s results for this shape in each square, where he puts it ${location.effect != null && location.effect >= EFFECT_NOTICE ? 'costs him' : location.effect != null && location.effect <= -EFFECT_NOTICE ? 'helps him' : 'changes almost nothing'}.` })
  // sequencing
  const ah = sequencing.slices.find(x => x.key === 'ahead'), bh = sequencing.slices.find(x => x.key === 'behind')
  const proc = diagnosis && diagnosis !== 'locked' && diagnosis !== null && !('needsSql' in diagnosis) ? diagnosis.process.filter(p => p.hurts && (p.id === 'repeat' || p.id === 'aheadFb')) : []
  rows.push({ id: 'sequencing', label: 'Sequencing', status: mixStatus(sequencing.effect), number: eff(sequencing.effect), sortKey: sequencing.effect ?? -9,
    text: `${ah && bh ? `He throws it ahead in the count ${pct(ah.his)} of the time and behind ${pct(bh.his)}; league ${lc}s with this shape ${pct(ah.league)} and ${pct(bh.league)}. ` : ''}Priced at the league’s results by count for this shape, his counts ${sequencing.effect != null && sequencing.effect >= EFFECT_NOTICE ? 'cost him' : sequencing.effect != null && sequencing.effect <= -EFFECT_NOTICE ? 'help him' : 'change almost nothing'}.${proc.length ? ` Across his whole arsenal: ${proc.map(p => p.text).join(' ')}` : ''}` })
  // defense and luck
  const w = sel.ownRaw.woba, x = sel.ownRaw.xwoba
  const cg = w != null && x != null && sel.ownRaw.n.pa >= 20 ? w - x : null
  rows.push({ id: 'luck', label: 'Defense and luck', status: cg == null ? 'unknown' : cg >= 0.03 ? 'explains' : cg <= -0.03 ? 'helps' : 'small', number: cg == null ? '—' : `${w != null ? d3(w) : ''} wOBA vs ${x != null ? d3(x) : ''} xwOBA`, sortKey: cg == null ? -9 : cg >= 0.03 ? 2 : -1,
    text: cg == null ? 'Too few plate appearances on this pitch to compare results with contact quality.' : cg >= 0.03 ? 'His results are worse than the contact quality he allowed on this pitch, which can point to defense or luck.' : cg <= -0.03 ? 'His results are better than the contact quality he allowed on this pitch, so defense or luck may be helping.' : 'His results match the contact quality he allowed on this pitch.' })

  const gap = why.gap
  const hurting = rows.filter(r => r.status === 'explains').sort((a, b) => b.sortKey - a.sortKey)
  const lead = gap == null ? null
    : gap >= EFFECT_NOTICE
      ? (hurting.length ? `He allows ${gap.toFixed(2)} more runs per 100 ${lc}s than league ${lc}s with this shape. The data points to ${hurting.map(r => `${r.label.toLowerCase()}${r.number && r.id !== 'velo' && r.id !== 'angle' ? ` (${r.number})` : ''}`).join(', ')}.`
        : `He allows ${gap.toFixed(2)} more runs per 100 ${lc}s than league ${lc}s with this shape, and none of platoon, speed, extension, arm angle, location or sequencing accounts for it. What is left is execution inside those slices (command inside the zone, deception), defense and luck.`)
      : gap <= -EFFECT_NOTICE ? `He allows ${Math.abs(gap).toFixed(2)} fewer runs per 100 ${lc}s than league ${lc}s with this shape. ${rows.filter(r => r.status === 'helps').length ? `What is helping him: ${rows.filter(r => r.status === 'helps').map(r => r.label.toLowerCase()).join(', ')}.` : 'None of the factors below explains it, so it sits in execution, deception, defense and luck.'}`
      : `His ${lc} results are in line with league ${lc}s with this shape (${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)} runs per 100).`
  return { rows, lead, hurting, gap, location, ex, shapeNow }
}

function WhySection({ sel, lc, why, bins, verdictGap, diagnosis, sec, pill }: { sel: BoardRow; lc: string; why: WhyResult | 'locked' | undefined; bins: ShapeBin[] | null | undefined; verdictGap: number | null; diagnosis: DiagnosisResult | 'locked' | undefined; sec: React.CSSProperties; pill: (on: boolean) => React.CSSProperties }) {
  void pill
  const title = '4 · Why aren’t the results there? Platoon, speed, extension, arm angle, location, sequencing'
  if (why === 'locked') {
    return (
      <>
        <div style={{ ...sec, marginTop: 22 }}>{title}</div>
        <div style={{ background: C.soft, borderRadius: 6, padding: 14 }}>
          <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, marginBottom: 8 }}>For a pitch whose results trail its shape: how much comes from who he throws it to, where it crosses the plate, the counts he throws it in, his speed, extension and arm angle, against league pitches of the same shape.</div>
          <UpgradePrompt source="pitch_shape" />
        </div>
      </>
    )
  }
  if (why === undefined) return <><div style={{ ...sec, marginTop: 22 }}>{title}</div><div style={{ fontSize: 13, color: C.mute }}>Checking platoon, location and sequencing…</div></>
  if (why === null) return <><div style={{ ...sec, marginTop: 22 }}>{title}</div><div style={{ fontSize: 13, color: '#5b5347' }}>The breakdown could not be read for him right now.</div></>
  if ('needsSql' in why) return <><div style={{ ...sec, marginTop: 22 }}>{title}</div><div style={{ fontSize: 13, color: '#5b5347' }}>This breakdown fills once the situation data is set up (one SQL file, shape_diagnosis_functions).</div></>

  const { rows, lead, hurting, gap, location } = buildWhy(sel, lc, why, bins, diagnosis)
  void verdictGap
  return (
    <>
      <div id="psd-why" style={{ ...sec, marginTop: 22 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, marginBottom: 8 }}>His {why.hisPitches.toLocaleString()} {lc}s against {why.leaguePitches.toLocaleString()} league {lc}s within ±{why.halfHb.toFixed(1)} in of run and ±{why.halfIvb.toFixed(1)} in of ride of his shape, {why.season}. Each factor is priced on its own, so they overlap a little and should not be totalled.</div>
      {lead && <div style={{ background: hurting.length && gap != null && gap > 0 ? '#FBE6E1' : '#F1EEE6', borderRadius: 4, padding: '9px 12px', fontSize: 14, lineHeight: 1.5, color: '#3a352c', marginBottom: 10 }}><b>{lead}</b></div>}
      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map(r => (
          <div key={r.id} className="psd-why" style={{ display: 'grid', gridTemplateColumns: '150px 118px minmax(0,1fr)', gap: '4px 14px', padding: '9px 0', borderTop: `1px solid ${C.line}`, alignItems: 'start' }}>
            <div><b style={{ fontSize: 13.5 }}>{r.label}</b><div><span style={{ display: 'inline-block', marginTop: 3, background: STATUS[r.status].bg, color: STATUS[r.status].fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 7px' }}>{STATUS[r.status].word}</span></div></div>
            <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>{r.number}</div>
            <div style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>{r.text}</div>
          </div>
        ))}
      </div>
      <style>{'@media(max-width:760px){.psd-why{grid-template-columns:1fr !important}}'}</style>
      <div style={{ ...sec, margin: '14px 0 6px', color: C.mute }}>Where it crosses the plate</div>
      <ZoneGrids factor={location} />
      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Platoon, location and sequencing are mix effects: his share of the pitch in each slice priced at the league’s runs per 100 in that slice for this shape, minus the league window’s overall figure (positive costs him). Speed and arm angle use the stored shape bins (whiffs and contact quality); extension is a difference only. Slices with under 150 league pitches are priced at the league average. It describes what has happened and does not predict.</div>
    </>
  )
}
