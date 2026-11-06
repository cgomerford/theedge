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
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import { GATE, LEVEL_RUNS, runsSaved, type Measures } from '@/lib/pitch-shape/results-math'
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

const tabText = { behind: 'Results behind their shape', ahead: 'Results ahead of their shape', top: 'Top Shape Scores' } as const

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
        Each pitcher’s average {lc} is a point on the map. His Shape Score (1 to 99) ranks the runs per 100 pitches that league {hand === 'R' ? 'right' : 'left'}-handed {lc}s shaped like his have saved, against the other shapes pitchers throw. Beside it, what his own {lc} has done this season. “Behind” means his results are more than {LEVEL_RUNS} runs per 100 pitches worse than his shape has produced; “ahead” means better. It describes what has happened, not a forecast, and it uses movement only: speed and arm angle are not in it.
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
