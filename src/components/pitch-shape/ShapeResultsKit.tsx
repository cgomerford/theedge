'use client'

// src/components/pitch-shape/ShapeResultsKit.tsx
//
// Pieces of the results heat map and Shape Score that PitchFinderV2 (the top of the Pitch Shape Lab page) mounts: the measures the map can be coloured by,
// the colour scale, the "here versus league" readout for a chosen spot, and the Shape Score board. Plain data in, no fetching: PitchFinderV2 loads the
// results payload and the board. Everything describes what has happened; none of it is a forecast.
// Colour is always "better or worse for the pitcher than the league's average for this pitch": orange better, blue worse, white where the window is too thin.

import { useState } from 'react'
import Link from 'next/link'
import { C, Empty } from '@/components/team/ui'
import FollowIsland from '@/components/signup/FollowIsland'
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import type { Overall, OverallRank } from '@/lib/pitch-shape/overall'
import { ordinal } from '@/lib/ordinal'
import { explainShape, reasons } from '@/lib/pitch-shape/explain'
import type { ShapeBin } from '@/lib/pitch-shape/model'
import { LENSES, SMALL_ROLE_PITCHES, STRONG_SCORE, WEAK_SCORE, findPitchers, type LensId } from '@/lib/pitch-shape/finder'
import { GATE, LEVEL_RUNS, resultsVsShape, runsSaved, type Measures } from '@/lib/pitch-shape/results-math'
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

/** One pitcher's full read, full width under the map row: his season numbers and where they rank, his shape (with the window widened by his own spread), and what the league has produced at that shape. */
export function ShapePlayerDetail({ board, selectedId, overall, shapeAt, bins, lc, onSelect, onOpen, headshot }: Pick<PanelProps, 'board' | 'selectedId' | 'overall' | 'shapeAt' | 'bins' | 'lc' | 'onSelect' | 'onOpen' | 'headshot'>) {
  const [wide, setWide] = useState<'in1' | 'sd05' | 'sd1' | 'sd2'>('in1')   // how wide the shape window is: a fixed inch, or his own spread times 0.5, 1 or 2
  const sel = board && selectedId != null ? board.rows.find(r => r.pitcherId === selectedId) ?? null : null
  if (!sel) return null
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 11px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' })
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }
    // the shape window: a fixed inch, or his own spread (one standard deviation in ride and in run) times 0.5, 1 or 2, floored at half an inch and capped at 8
    const mult = wide === 'sd05' ? 0.5 : wide === 'sd1' ? 1 : wide === 'sd2' ? 2 : null
    const clampT = (inches: number) => Math.max(5, Math.min(80, Math.round(inches * 10)))
    const rx10 = mult == null || sel.sdHb == null ? 10 : clampT(sel.sdHb * mult), ry10 = mult == null || sel.sdIvb == null ? 10 : clampT(sel.sdIvb * mult)
    const win = shapeAt ? shapeAt(sel.hb, sel.ivb, rx10, ry10) : null
    const shapeG: M = win?.gated ?? sel.shape, shapeR: M = win?.raw ?? sel.shapeRaw
    const cmp = resultsVsShape(sel.own.saved, shapeG.saved)
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
              {verdict && <span style={{ background: verdict === 'ahead' ? '#E3F3EC' : verdict === 'behind' ? '#FBE6E1' : C.soft, color: verdict === 'ahead' ? '#13694F' : verdict === 'behind' ? '#A8391F' : '#5b5347', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{verdict === 'ahead' ? 'Outperforming his shape' : verdict === 'behind' ? 'Underperforming his shape' : 'In line with his shape'}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}><b style={{ fontSize: 30, lineHeight: 1, display: 'block' }}>{sel.score ?? '—'}</b><span style={k}>Shape Score</span></div>
        </div>
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

        {(() => {
          const shapeNow = sel.velo != null && sel.slot != null ? { velo: sel.velo, ivb: sel.ivb, hb: sel.hb, slot: sel.slot } : null
          const ex = bins && shapeNow ? explainShape(bins, shapeNow) : null
          const rs = ex && shapeNow ? reasons(ex, shapeNow, lc) : []
          const title = verdict === 'behind' ? 'Why might he trail his movement? Speed and arm angle' : verdict === 'ahead' ? 'What is behind his results? Speed and arm angle' : 'Speed and arm angle'
          return (
            <>
              <div style={sec}>{title}</div>
              {bins === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Checking speed and arm angle…</div>
                : !ex || !shapeNow ? <div style={{ fontSize: 13, color: '#5b5347' }}>No league speed and arm-angle data for this movement yet.</div>
                : (
                  <>
                    <div style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, marginBottom: 6 }}>The map’s shape is movement only. These league {lc}s move like his ({ex.all.pitches.toLocaleString()} pitches, within about ±2 in of ride and run); here they are split by his speed and his arm angle.</div>
                    {rs.length === 0
                      ? <div style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5, background: C.soft, borderRadius: 4, padding: '8px 10px' }}>His speed ({shapeNow.velo.toFixed(1)} mph) and arm angle ({shapeNow.slot.toFixed(0)}°) are close to typical for {lc}s that move like his, so they do not explain the gap. What is left is not in the shape data: location, sequencing, deception, defense and luck.</div>
                      : rs.map(r => (
                        <div key={r.factor} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 8px', background: r.lean < 0 ? '#FBE6E1' : r.lean > 0 ? '#E3F3EC' : C.soft, borderRadius: 4, padding: '8px 10px' }}>
                          <b style={{ flex: 'none', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: r.lean < 0 ? '#A8391F' : r.lean > 0 ? '#13694F' : '#5b5347', paddingTop: 2, minWidth: 74 }}>{r.factor === 'speed' ? 'Speed' : 'Arm angle'} · {r.lean < 0 ? 'hurts' : r.lean > 0 ? 'helps' : 'neutral'}</b>
                          <span style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>{r.text}</span>
                        </div>
                      ))}
                    {ex.atBoth.whiff != null && (
                      <div style={{ fontSize: 12.5, color: '#3a352c', lineHeight: 1.5 }}>At his speed and arm angle together, league {lc}s that move like his get <b>{(ex.atBoth.whiff * 100).toFixed(1)}%</b> whiffs per swing ({ex.atBoth.swings.toLocaleString()} swings), against <b>{ex.all.whiff == null ? '—' : `${(ex.all.whiff * 100).toFixed(1)}%`}</b> at every speed and angle. His own: <b>{sel.ownRaw.whiff == null ? '—' : `${(sel.ownRaw.whiff * 100).toFixed(1)}%`}</b>.</div>
                    )}
                  </>
                )}
            </>
          )
        })()}

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

/** Lenses that surface pitchers whose shape and results disagree, or whose shape is strong but whose role or overall line keeps them quiet. Picking one opens his full read. */
export function FindPitcher({ board, lc, hand, onPick }: { board: Board | null | undefined; lc: string; hand: 'R' | 'L'; onPick: (r: BoardRow) => void }) {
  const [lens, setLens] = useState<LensId>('hidden')
  const [open, setOpen] = useState(true)
  const L = LENSES.find(l => l.id === lens) ?? LENSES[0]
  const rows = board ? board.rows : []
  const found = findPitchers(rows, lens, 6)
  const total = rows.filter(L.test).length
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.orange : C.line}`, background: on ? '#FFF1EA' : '#fff', color: C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  return (
    <section id="pf2-find" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 16px', margin: '4px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 16 }}>Find me a pitcher</b>
        <span style={{ fontSize: 12.5, color: '#5b5347' }}>Under-the-radar {hand === 'R' ? 'right' : 'left'}-handed {lc}s: shape and results that do not match, or a strong shape with a quiet line.</span>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ ...pill(false), marginLeft: 'auto', minHeight: 36 }}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <>
          <div role="group" aria-label="What to look for" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 6px' }}>
            {LENSES.map(l => <button key={l.id} type="button" style={pill(l.id === lens)} onClick={() => setLens(l.id)}>{l.label}</button>)}
          </div>
          <div style={{ fontSize: 12.5, color: '#5b5347', marginBottom: 10 }}>{L.blurb}{board ? ` ${total} found${total > found.length ? `, top ${found.length} shown` : ''}.` : ''}</div>
          {board === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Looking…</div>
            : !board ? <div style={{ fontSize: 13, color: '#5b5347' }}>Pitcher results aren’t built for this pitch yet. They fill after the weekly shape-results job runs.</div>
            : found.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347' }}>Nobody fits this lens for the {hand === 'R' ? 'right' : 'left'}-handed {lc} right now. Try another lens, hand or pitch.</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
                {found.map(r => {
                  const w = shapeWord(r.score), top = [...reads(r)].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).filter(x => x.tone !== 'level').slice(0, 2)
                  return (
                    <button key={r.pitcherId} type="button" onClick={() => onPick(r)} style={{ textAlign: 'left', background: '#FAF8F3', border: `1px solid ${C.line}`, borderRadius: 6, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}><b style={{ fontSize: 14.5 }}>{r.name}</b><span style={{ color: C.mute, fontSize: 12 }}>{r.teamAbbr}</span><span style={{ marginLeft: 'auto', fontSize: 12, color: '#5b5347' }}>Shape Score <b style={{ color: C.ink, fontSize: 15 }}>{r.score ?? '—'}</b></span></div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '5px 0' }}>
                        {w && <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{w.word}</span>}
                        {r.verdict && r.verdict !== 'level' && <span style={{ background: r.verdict === 'ahead' ? '#E3F3EC' : '#FBE6E1', color: r.verdict === 'ahead' ? '#13694F' : '#A8391F', fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{r.verdict === 'ahead' ? 'Outperforming' : 'Underperforming'} {r.gap != null ? `${signed(r.gap)} /100` : ''}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#5b5347', lineHeight: 1.45 }}>
                        {r.overall ? `${r.overall.pitches.toLocaleString()} pitches this season${r.overall.runsPct != null ? ` · overall runs allowed ranks in the ${r.overall.runsPct}th percentile` : ' · too few pitches to rank overall'}` : ''}
                      </div>
                      {top.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>{top.map(x => <span key={x.stat.id} style={{ background: toneCol[x.tone].bg, color: toneCol[x.tone].fg, fontSize: 11, fontWeight: 700, borderRadius: 3, padding: '1px 6px' }}>{x.stat.label.replace(' against', '').replace(' per swing', '').replace(' / 100', '')} {x.stat.fmt(x.own)} vs {x.stat.fmt(x.shape)}</span>)}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Describes what has happened, not a forecast. Strong shape means a Shape Score of {STRONG_SCORE} or more, weak {WEAK_SCORE} or less; a small role is under {SMALL_ROLE_PITCHES.toLocaleString()} pitches this season. Click a pitcher for his shape numbers, his season numbers and where they rank.</div>
        </>
      )}
    </section>
  )
}
