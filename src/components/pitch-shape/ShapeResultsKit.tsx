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
import { buildWhy, type Status } from '@/lib/pitch-shape/build-why'
import { EFFECT_NOTICE, ZONE_LABEL, type Factor } from '@/lib/pitch-shape/decompose'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import { ordinal } from '@/lib/ordinal'
import { log } from '@/lib/log'
import { renderOtdPng } from '@/lib/graphics/otd-export'
import ShapeExportCard, { type ExportData } from './ShapeExportCard'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { reasons } from '@/lib/pitch-shape/explain'
import { PITCH_NAMES, type ShapeBin } from '@/lib/pitch-shape/model'
import { ESTABLISHED_PITCHES, LENSES, STRONG_SCORE, WEAK_SCORE, findPitchers, type LensId } from '@/lib/pitch-shape/finder'
import { GATE, LEVEL_RUNS, resultsVsShape, runsSaved, type Measures } from '@/lib/pitch-shape/results-math'
import { useRoster } from './useRoster'
import { RAMP } from './parts'
import { hexToRgb } from './heatGrid'
import { TeamBadge } from '@/components/front-office/pitching/Avatar'
import { teamOf } from '@/lib/milb-shape/teams'
import { LEVEL_LABEL, isMilb, type Level } from '@/lib/milb-shape/levels'
import { limitsFor } from '@/lib/milb-shape/limits'
import { useShapeView } from './shapeLevel'
import { buildMilbWhy } from '@/lib/milb-shape/why'
import TranslationBanner, { TranslationChip } from './TranslationBanner'
import RunsSavedExplainer from './RunsSavedExplainer'
import InfoTip, { Lab } from './InfoTip'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import AcrossLevels, { type LevelAvg } from './AcrossLevels'
import ClosestMlb from './ClosestMlb'
import ShapeMap from './ShapeMap'
import DamageAndFip from './DamageAndFip'
import PitchStatLine from './PitchStatLine'
import { PitcherSeasonChanges } from './ShapeChanges'
import PlayerPhoto from './PlayerPhoto'
import { usePitcherLog } from './usePitcherLog'
import { movementPoints } from '@/lib/pitch-shape/pitch-line'
import { ABOUT_LEVEL_PTS } from './finder-math'

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

export function ResultsLegend({ metric, lc, level = 'mlb' }: { metric: Metric; lc: string; level?: Level }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, flexWrap: 'wrap' }}>
        <span>Worse for the pitcher</span>
        <span style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden' }}>{[...BLUE].reverse().map(c => <span key={c} style={{ width: 22, height: 12, background: c }} />)}<span style={{ width: 22, height: 12, background: `rgb(${NEUTRAL.join(',')})` }} />{RAMP.slice(1).map(c => <span key={c} style={{ width: 22, height: 12, background: c }} />)}</span>
        <span>Better</span>
      </div>
      <div style={{ color: '#5b5347', marginTop: 6, lineHeight: 1.5 }}><b>{metric.label}</b><InfoTip k={metric.id === 'saved' ? 'runsSaved' : metric.id} />: {metric.blurb}. {metric.up ? 'Higher is better for the pitcher.' : 'Lower is better for the pitcher.'} The middle colour is the league average for {lc}s; white means the window is too thin to show.</div>
      {metric.id === 'saved' && <RunsSavedExplainer level={level} compact />}
    </div>
  )
}

/** The results at one spot against the level's overall average: Shape Score, then each measure with the gap (green better for the pitcher, red worse). */
export function ResultsReadout({ here, league, saved, score, lc, radius, spanLabel, level = 'mlb', flush = false }: { here: Measures; league: Measures; saved: number | null; score: number | null; lc: string; radius: number; spanLabel: string; level?: Level; /** no rule above it: it is the first thing in its card */ flush?: boolean }) {
  type R = { label: string; a: number | null; b: number | null; fmt: (v: number) => string; diff: (d: number) => string; up: boolean; band: number }
  const r2s = (v: number) => v.toFixed(2)
  const rows: R[] = [
    { label: 'Whiffs per swing', a: here.whiff, b: league.whiff, fmt: v => `${(v * 100).toFixed(1)}%`, diff: d => `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)} pts`, up: true, band: 0.03 },
    { label: 'Runs allowed per 100', a: here.runs100, b: league.runs100, fmt: r2s, diff: d => signed(d), up: false, band: 0.4 },
    { label: 'wOBA', a: here.woba, b: league.woba, fmt: d3, diff: d => signed(d, 3).replace('0.', '.'), up: false, band: 0.03 },
    { label: 'xwOBA', a: here.xwoba, b: league.xwoba, fmt: d3, diff: d => signed(d, 3).replace('0.', '.'), up: false, band: 0.03 },
    { label: 'Batting average', a: here.avg, b: league.avg, fmt: d3, diff: d => signed(d, 3).replace('0.', '.'), up: false, band: 0.025 },
    { label: 'Slugging', a: here.slg, b: league.slg, fmt: d3, diff: d => signed(d, 3).replace('0.', '.'), up: false, band: 0.05 },
  ]
  const lvl = LEVEL_LABEL[level]
  const gated = limitsFor(level).gated
  const thin = gated && here.n.swings < 40   // too few swings to say a gap is real: shown, not coloured
  const small = !gated && here.n.swings < 100   // no minimum at this level: the numbers stay, marked with an asterisk
  return (
    <div style={flush ? undefined : { borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
      <div className="pv-k" style={{ color: '#B83A0E' }}>This shape’s results against the {lvl} average</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 8px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 38, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{score ?? '—'}</b>
        <span style={{ fontSize: 13, color: '#5b5347' }}>Shape Score<InfoTip k="shapeScore" /> (1 to 99){score == null ? (gated ? ` · needs ${GATE.rvPitches}+ pitches in the window` : saved == null ? ' · no run values at this level, so no score' : ' · too few pitchers at this level to rank it') : saved != null ? ` · ${signed(saved)} runs saved per 100 pitches` : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '5px 14px', fontSize: 13, fontVariantNumeric: 'tabular-nums', alignItems: 'center' }}>
        <span style={k}>Measure</span><span style={{ ...k, textAlign: 'right' }}>This shape</span><span style={{ ...k, textAlign: 'right' }}>{lvl} avg</span><span style={{ ...k, textAlign: 'right' }}>Gap{small ? '*' : ''}</span>
        {rows.map(x => {
          const d = x.a != null && x.b != null ? x.a - x.b : null
          const z = d == null ? 0 : ((x.up ? 1 : -1) * d) / x.band
          const tone = d == null || thin ? 'level' : z > 1 ? 'good' : z < -1 ? 'bad' : 'level'
          return (
            <div key={x.label} style={{ display: 'contents' }}>
              <span style={{ color: '#5b5347' }}><Lab t={x.label} /></span>
              <b style={{ textAlign: 'right' }}>{x.a == null ? '—' : x.fmt(x.a)}</b>
              <span style={{ textAlign: 'right', color: C.mute }}>{x.b == null ? '—' : x.fmt(x.b)}</span>
              <span style={{ textAlign: 'right' }}>{d == null ? <span style={{ color: C.faint }}>—</span> : <span style={{ background: toneCol[tone].bg, color: toneCol[tone].fg, fontWeight: 800, borderRadius: 3, padding: '2px 7px' }}>{x.diff(d)}</span>}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>League {lc}s within ±{radius} in, {spanLabel}: {here.pitches.toLocaleString()} pitches, {here.n.pa.toLocaleString()} plate appearances ended on them, {here.n.ab.toLocaleString()} at-bats, {here.n.swings.toLocaleString()} swings. {small ? `* A small sample (${here.n.swings.toLocaleString()} swings): the gaps are hard to judge. ` : null}{thin ? 'Under 40 swings behind it, so the gaps are shown but not coloured. ' : small ? '' : 'Green is better for the pitcher than the average by more than the usual noise, red is worse. '}<RunsSavedExplainer level={level} compact example={saved} /></div>
    </div>
  )
}

type Preset = 'basics' | 'shape' | 'results'
type SortKey = 'name' | 'pitches' | 'velo' | 'ownWhiff' | 'shapeWhiff' | 'ivb' | 'hb' | 'slot' | 'shapeSaved' | 'ownSaved' | 'gap' | 'score' | 'ownWoba' | 'shapeWoba' | 'ownXwoba' | 'shapeXwoba'
const presetText: Record<Preset, string> = { basics: 'Basics', shape: 'Shape', results: 'Results' }
const filterText = { all: 'Everyone', ahead: 'Above their shape', behind: 'Below their shape' } as const

/**
 * The Shape Score leaderboard, laid out like the other leaderboards fans know: column sets (Basics, Shape, Results), a filter on whether his results are ahead of or behind what his shape has produced, and
 * every column header sorts. It opens on Results sorted by the gap, so the first thing seen is who is furthest ahead of his shape. The minimum sample and the colour rule are stated above the table.
 */
export function ShapeScoreBoard({ board, lc, hand, onShow }: { board: Board | null | undefined; lc: string; hand: 'R' | 'L' | 'B'; onShow?: (id: number) => void }) {
  const lim = limitsFor(useShapeView().level)
  const [preset, setPreset] = useState<Preset>('results')
  const [filter, setFilter] = useState<keyof typeof filterText>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'gap', dir: -1 })
  const [all, setAll] = useState(false)
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  const val = (r: BoardRow, key: SortKey): number | string | null => {
    switch (key) {
      case 'name': return r.name
      case 'pitches': return r.pitches
      case 'velo': return r.velo
      case 'ownWhiff': return r.own.whiff ?? r.ownRaw.whiff
      case 'shapeWhiff': return r.shape.whiff ?? r.shapeRaw.whiff
      case 'ivb': return r.ivb
      case 'hb': return r.hb
      case 'slot': return r.slot
      case 'shapeSaved': return r.shape.saved
      case 'ownSaved': return r.own.saved
      case 'gap': return r.gap
      case 'score': return r.score
      case 'ownWoba': return r.own.woba
      case 'shapeWoba': return r.shape.woba
      case 'ownXwoba': return r.own.xwoba
      case 'shapeXwoba': return r.shape.xwoba
    }
  }
  const rows: BoardRow[] = board ? board.rows.filter(r => filter === 'all' || r.verdict === filter).sort((x, y) => {
    const a = val(x, sort.key), b = val(y, sort.key)
    if (a == null && b == null) return 0
    if (a == null) return 1   // a blank always sorts last, whichever way the column runs
    if (b == null) return -1
    return (typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b) * sort.dir
  }) : []
  const shown = all ? rows : rows.slice(0, 15)
  type Col = { key: SortKey; label: string; tip: string; cell: (r: BoardRow) => React.ReactNode }
  const num = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d))
  const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
  const gapCell = (r: BoardRow) => {
    if (r.gap == null) return '—'
    const w = Math.min(1, Math.abs(r.gap) / 1.5) * 44
    const col = r.verdict === 'behind' ? C.bad : r.verdict === 'ahead' ? C.good : C.mute
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><span aria-hidden style={{ display: 'inline-block', width: w, height: 8, borderRadius: 2, background: col, opacity: 0.85 }} /><b style={{ color: col, minWidth: 44, textAlign: 'right' }}>{signed(r.gap)}</b>{r.small && <span title="His own sample on this pitch is small" style={{ fontSize: 10, color: C.mute }}>small</span>}</span>
  }
  const COLS: Record<Preset, Col[]> = {
    basics: [
      { key: 'pitches', label: 'Pitches', tip: 'Pitches of this type he threw this season', cell: r => r.pitches.toLocaleString('en-US') },
      { key: 'velo', label: 'Speed (mph)', tip: 'His average speed on this pitch', cell: r => num(r.velo) },
      { key: 'ownWhiff', label: 'His whiffs per swing', tip: 'Share of swings at his pitch that missed, this season', cell: r => pc(r.own.whiff ?? r.ownRaw.whiff) },
      { key: 'score', label: 'Shape Score', tip: 'Where the runs saved by his shape rank among every shape, 1 to 99', cell: r => <b>{r.score ?? '—'}</b> },
    ],
    shape: [
      { key: 'velo', label: 'Speed (mph)', tip: 'His average speed on this pitch', cell: r => num(r.velo) },
      { key: 'ivb', label: 'Ride (in)', tip: 'Induced vertical break: how much more it stays up than a pitch with no spin', cell: r => num(r.ivb) },
      { key: 'hb', label: 'Run (in, arm side +)', tip: 'Sideways movement: positive is toward his arm side, negative toward his glove side', cell: r => num(r.hb) },
      { key: 'slot', label: 'Arm angle (°)', tip: 'How high his arm is at release: low is close to sidearm, high is overhead', cell: r => (r.slot == null ? '—' : Math.round(r.slot)) },
      { key: 'shapeSaved', label: 'Shape: runs saved per 100', tip: 'Runs per 100 pitches saved by league pitches shaped like his', cell: r => (r.shape.saved == null ? '—' : signed(r.shape.saved)) },
      { key: 'score', label: 'Shape Score', tip: 'Where the runs saved by his shape rank among every shape, 1 to 99', cell: r => <b>{r.score ?? '—'}</b> },
    ],
    results: [
      { key: 'ownSaved', label: 'His runs saved per 100', tip: 'Runs per 100 pitches his own pitch has saved this season', cell: r => (r.own.saved == null ? '—' : signed(r.own.saved)) },
      { key: 'shapeSaved', label: 'Shape: runs saved per 100', tip: 'Runs per 100 pitches saved by league pitches shaped like his', cell: r => (r.shape.saved == null ? '—' : signed(r.shape.saved)) },
      { key: 'gap', label: 'Gap: his minus shape', tip: 'Positive: his results are above what his shape has produced. Bars and colour show only gaps beyond the normal noise', cell: gapCell },
      { key: 'ownWhiff', label: 'His whiffs per swing', tip: 'Share of swings at his pitch that missed', cell: r => pc(r.own.whiff ?? r.ownRaw.whiff) },
      { key: 'shapeWhiff', label: 'Shape whiffs per swing', tip: 'Share of swings that missed for league pitches shaped like his', cell: r => pc(r.shape.whiff ?? r.shapeRaw.whiff) },
      { key: 'ownWoba', label: 'His wOBA', tip: 'wOBA on plate appearances that ended with his pitch; lower is better for the pitcher', cell: r => (r.own.woba == null ? '—' : d3(r.own.woba)) },
      { key: 'shapeWoba', label: 'Shape wOBA', tip: 'wOBA for league pitches shaped like his', cell: r => (r.shape.woba == null ? '—' : d3(r.shape.woba)) },
      { key: 'ownXwoba', label: 'His xwOBA', tip: 'Expected wOBA on plate appearances that ended with his pitch', cell: r => (r.own.xwoba == null ? '—' : d3(r.own.xwoba)) },
    ],
  }
  const cols = COLS[preset]
  const sortBy = (key: SortKey) => setSort(s0 => (s0.key === key ? { key, dir: (s0.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }))
  const handText = hand === 'B' ? 'left- and right-handed' : hand === 'R' ? 'right-handed' : 'left-handed'
  const th = (key: SortKey, label: string, tip: string, left = false) => (
    <th key={key} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} style={{ ...k, textAlign: left ? 'left' : 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
      <button type="button" title={tip} onClick={() => sortBy(key)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 800 }}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
    </th>
  )
  return (
    <section id="shape-score" style={{ marginTop: 6, paddingTop: 4 }}>
      <p style={{ color: '#5b5347', fontSize: 14, margin: '0 0 8px', maxWidth: 900, lineHeight: 1.5 }}>
        Each pitcher’s average {lc} is a point on the map. His <b>Shape Score</b><InfoTip k="shapeScore" /> (1 to 99) ranks the runs per 100 pitches that league {handText} {lc}s shaped like his have saved. <b>Gap</b> is his own runs saved this season minus what his shape has produced: green means above the shape by more than {LEVEL_RUNS} runs per 100, red means below by more than that, grey means about level. Click any column heading to sort.
      </p>
      <div style={{ fontSize: 12.5, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '6px 10px', marginBottom: 10, lineHeight: 1.5 }}>
        <b>Who is listed:</b> {lim.gated ? <>pitchers with {GATE.rvPitches}+ of his own {lc}s and a shape window of {GATE.rvPitches}+ league pitches; a pitcher under that has no gap shown.</> : <>pitchers with {lim.boardPitches}+ {lc}s at this level.</>} His results are this season ({board ? board.season : 'latest'}); the shape side adds up every season we hold.
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div role="group" aria-label="Columns" style={{ display: 'flex', gap: 6 }}>
          {(['basics', 'shape', 'results'] as const).map(t => <button key={t} type="button" aria-pressed={t === preset} style={pill(t === preset)} onClick={() => { setPreset(t); setSort({ key: t === 'results' ? 'gap' : t === 'shape' ? 'score' : 'pitches', dir: -1 }); setAll(false) }}>{presetText[t]}</button>)}
        </div>
        <div role="group" aria-label="Who to show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(filterText) as (keyof typeof filterText)[]).map(t => <button key={t} type="button" aria-pressed={t === filter} style={pill(t === filter)} onClick={() => { setFilter(t); setAll(false) }}>{filterText[t]}{board ? ` (${t === 'all' ? board.rows.length : board.rows.filter(r => r.verdict === t).length})` : ''}</button>)}
        </div>
      </div>
      {board === undefined ? <div style={{ padding: 20, color: C.mute, fontSize: 13 }}>Loading the board…</div>
        : !board ? <Empty>No pitchers are scored for this pitch yet. This fills after the weekly shape-results job runs.</Empty>
        : rows.length === 0 ? <Empty>{lim.gated ? <>No pitcher fits this view with enough pitches ({GATE.rvPitches}+ of his own, and a shape window with {GATE.rvPitches}+ league pitches).</> : <>No pitcher with {lim.boardPitches}+ pitches fits this view.</>}</Empty>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 720 }}>
              <thead><tr>{th('name', 'Pitcher', 'Sort by name', true)}{cols.map(c => th(c.key, c.label, c.tip))}</tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>
                      {onShow ? <button type="button" onClick={() => onShow(r.pitcherId)} style={{ all: 'unset', cursor: 'pointer', color: C.ink, fontWeight: 800, textDecoration: 'underline', textDecorationColor: C.line, textUnderlineOffset: 3 }} title="Open his story">{r.name}</button> : <Link href={`/mlb/lab/pitching-lab/${r.pitcherId}/shape`} style={{ color: C.ink, textDecoration: 'none' }}>{r.name}</Link>} <span style={{ color: C.mute, fontWeight: 600 }}>{r.teamAbbr}</span>
                    </td>
                    {cols.map(c => <td key={c.key} style={{ padding: '8px', textAlign: 'right' }}>{c.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 15 && <button type="button" style={{ ...pill(false), marginTop: 10 }} onClick={() => setAll(s0 => !s0)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
          </div>
        )}
      <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: '10px 0 0' }}>
        Runs saved per 100 pitches is the change in run expectancy Statcast records on each pitch (delta_run_exp, the batting side’s runs, summed over every pitch) for the league’s {lc}s minus the window’s, so higher is better for the pitcher. wOBA, xwOBA, average and slugging count the plate appearances and at-bats that ended on the pitch. {lim.gated ? <>A measure shows only with {GATE.rvPitches}+ pitches (run expectancy), {GATE.ab}+ at-bats (average, slugging), {GATE.den}+ plate appearances (wOBA, xwOBA) or {GATE.swings}+ swings (whiffs) in the window. The board pools every season for the shape and uses the latest season for his own results; it lists pitchers with 200+ {lc}s and compares his own results only with {GATE.rvPitches}+ of them.</> : <>This level is a few weeks of games, so the minimum is small: a pitcher is listed with {lim.boardPitches}+ pitches of the type, and a measure is blank only where nothing was recorded. Read each figure with its sample beside it. A measure the source does not carry (arm angle, run values or xwOBA at some levels) is shown as pending.</>} Location, sequencing, deception, defense and park are not in it. Source: Baseball Savant / Statcast, regular season. Independent, not affiliated with MLB.
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
  if (w == null || x == null) return null   // own.woba is already null under the level's sample rule
  if (x - w >= 0.03) return `Results (wOBA ${d3(w)}) are better than the contact quality he allowed (xwOBA ${d3(x)}), which can point to defense or luck helping.`
  if (w - x >= 0.03) return `Results (wOBA ${d3(w)}) are worse than the contact quality he allowed (xwOBA ${d3(x)}), which can point to defense or luck hurting.`
  return null
}

const PITCH_LABEL = PITCH_NAMES

/** One pitcher's full read, full width under the map row: his season numbers and where they rank, his shape (with the window widened by his own spread), and what the league has produced at that shape. */
export function ShapePlayerDetail({ board, selectedId, overall, shapeAt, bins, diagnosis, pitchType, season, exportMap, lc, onSelect, onOpen, headshot, level = 'mlb', diag, leagueDiag, dialed, levelAvg, focusHand }: Pick<PanelProps, 'board' | 'selectedId' | 'overall' | 'shapeAt' | 'bins' | 'diagnosis' | 'pitchType' | 'season' | 'exportMap' | 'lc' | 'onSelect' | 'onOpen' | 'headshot' | 'level' | 'diag' | 'leagueDiag' | 'dialed' | 'levelAvg' | 'focusHand'>) {
  const milb = isMilb(level)   // a minor-league read: the MLB-only pieces (season line, ESPN, the pitch-by-pitch breakdown) give way to what that level stores
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
    if (selId == null || season == null || milb) { setWhy(undefined); return }   // the pitch-by-pitch breakdown is MLB only
    let live = true
    setWhy(undefined)
    fetch(`/api/mlb/pitch-shape/why?id=${selId}&season=${season}&type=${pitchType}&halfHb=${rx10 / 10}&halfIvb=${ry10 / 10}`)
      .then(async r => { if (r.status === 403) return 'locked' as const; if (!r.ok) throw new Error(`HTTP ${r.status}`); return ((await r.json()) as { why: WhyResult }).why })
      .then(w => { if (live) setWhy(w) })
      .catch(e => { log.error('ShapePlayerDetail', 'why fetch failed', e instanceof Error ? e.message : e); if (live) setWhy(null) })
    return () => { live = false }
  }, [selId, season, pitchType, rx10, ry10, milb])
  const fullLog = usePitcherLog(selId, season, level)   // every pitch he threw, for the movement map (null at levels that keep no pitch log)
  if (!sel) return null
  const allPts = fullLog ? movementPoints(fullLog.pitches, pitchType, fullLog.throws) : null
  const closestInput = milb && sel.velo != null && sel.slot != null ? { pitcherId: sel.pitcherId, velo: sel.velo, ivb: sel.ivb, hb: sel.hb, slot: sel.slot } : null
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
    const noMinimum = !limitsFor(level).gated   // Arizona Fall League and Spring Training keep no sample minimum: the numbers are shown, and a small sample is marked with an asterisk
    const smallSample = noMinimum && sel.ownRaw.n.swings < 100
    const wh = rd.find(x => x.stat.id === 'whiff')
    const headline = verdict == null
      ? (noMinimum
        ? (wh ? `Results so far${smallSample ? '*' : ''}: his ${lc}s get ${wh.stat.fmt(wh.own)} whiffs per swing against ${wh.stat.fmt(wh.shape)} for pitches shaped like his (${wh.stat.diff(wh.d)}).${smallSample ? ` * A small sample (${sel.ownRaw.n.swings.toLocaleString()} swings), so results are hard to judge.` : ''}` : `Results so far${smallSample ? '*' : ''}: there are no swings at his ${lc} to set against his shape yet. * Results are hard to judge on a small sample.`)
        : `Too few of his own ${lc}s (${GATE.rvPitches}+ needed) to set his results against his shape; the numbers below are shown with their sample.`)
      : verdict === 'ahead'
        ? (weak ? `Above a weak shape: his ${lc} results were better than pitches with his shape produced (${signed(gap ?? 0)} runs per 100 pitches). League ${lc}s with this shape saved ${shapeG.saved == null ? '' : signed(shapeG.saved)} runs per 100, so the shape does not explain his results; location, sequencing, deception, defense and luck are not in it.`
          : strong ? `A strong shape and results above it (${signed(gap ?? 0)} runs per 100 pitches vs the shape): the results and the shape agree.`
          : `Above his shape: his ${lc} results were better than pitches with his shape produced (${signed(gap ?? 0)} runs per 100 pitches).`)
      : verdict === 'behind'
        ? (strong ? `Below a strong shape: pitches with his shape saved ${shapeG.saved == null ? '' : signed(shapeG.saved)} runs per 100; his own ${lc}s saved ${sel.own.saved == null ? '' : signed(sel.own.saved)}. His results were ${Math.abs(gap ?? 0).toFixed(2)} runs per 100 below what the shape produced.`
          : weak ? `A weak shape and results to match (${signed(gap ?? 0)} runs per 100 pitches vs the shape): his results are below an already weak shape.`
          : `Below his shape: his ${lc} results were below what pitches with his shape produced (${signed(gap ?? 0)} runs per 100 pitches).`)
        : `His ${lc} results line up with what pitches shaped like his have produced.`
    const sec: React.CSSProperties = { ...k, margin: '16px 0 6px', color: '#B83A0E' }
    // what nearby movements have produced: the league's pitches within a small step of his average, priced the same way as his own shape (runs saved per 100 pitches, enough pitches to count)
    const dial = (() => {
      if (!shapeAt) return null
      const base = shapeAt(sel.hb, sel.ivb, 10, 10)?.gated.saved ?? null
      if (base == null) return null
      const cand: { dh: number; di: number; dist: number; saved: number; pitches: number }[] = []
      for (let dh = -30; dh <= 30; dh += 5) for (let di = -30; di <= 30; di += 5) {
        if (dh === 0 && di === 0) continue
        const m = shapeAt(sel.hb + dh / 10, sel.ivb + di / 10, 10, 10)
        if (m?.gated.saved != null) cand.push({ dh: dh / 10, di: di / 10, dist: Math.hypot(dh, di) / 10, saved: m.gated.saved, pitches: m.raw.pitches })
      }
      const best = (d: number) => cand.filter(c => c.dist <= d && c.saved > base + 0.1).sort((a, b) => b.saved - a.saved)[0] ?? null
      const all = [1, 2, 3].map(d => ({ d, c: best(d) }))
      const rows = all.filter((r, i) => i === 0 || r.c !== all[i - 1].c)   // a wider step that finds the same shape adds nothing
      return { base, rows: rows.length ? rows : [all[0]], all }
    })()
    // X export: what the card says, from what the page already computed
    const whyLoaded = why !== undefined && why !== 'locked' && why !== null && !('needsSql' in why) ? why : null
    const built = whyLoaded ? buildWhy(sel, lc, whyLoaded, bins, diagnosis) : null
    const firstSentences = (t: string, n2: number) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, n2).join(' ').trim()
    const exportData: ExportData | null = exportMap && !milb ? {
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
    const th = (h: string, i: number) => <th key={h} style={{ ...k, textAlign: i === 0 ? 'left' : 'right', padding: '5px 4px', borderBottom: `2px solid ${C.ink}` }}><Lab t={h} /></th>
    const fmtRank = (r: OverallRank) => (r.value == null ? '—' : r.fmt === 'runs' ? r.value.toFixed(2) : r.fmt === 'pct' ? `${(r.value * 100).toFixed(1)}%` : d3(r.value))
    return (
      <div style={card} id="pf2-detail">
        <button type="button" onClick={() => { onSelect(null); document.getElementById('pf2-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} style={{ ...pill(false), marginBottom: 10 }}>← Back to his shape</button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <PlayerPhoto id={sel.pitcherId} size={64} minor={milb} round={false} />
          <div style={{ flex: 1, minWidth: 160 }}>
            {(() => {
              const club = teamOf(level, sel.teamAbbr)
              const nm = { fontWeight: 800, fontSize: 20, color: '#B83A0E', textDecoration: 'none' } as const
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {milb ? <span style={nm}>{sel.name}</span> : <Link href={`/mlb/players/${sel.pitcherId}`} style={nm}>{sel.name}</Link>}
                  {club && <TeamBadge id={club.id} size={30} disc={false} />}<span style={{ fontWeight: 800, fontSize: 18, color: '#B83A0E' }}>{sel.teamAbbr}</span>
                  {milb && club?.parentId != null && <span title="Parent club" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.mute }}>parent <TeamBadge id={club.parentId} size={22} disc={false} /></span>}
                </span>
              )
            })()}
            <div style={{ fontSize: 12.5, color: '#5b5347' }}>His {lc}: {sel.ivb.toFixed(1)} in of ride, {sel.hb.toFixed(1)} in of run · {sel.pitches.toLocaleString()} pitches this season{milb ? ` at ${LEVEL_LABEL[level]}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
              {sw && <span style={{ background: sw.bg, color: sw.fg, fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{sw.word}</span>}
              {sel.small && <span style={{ background: '#FFF4CC', color: '#7A5B00', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>Small sample · {sel.ownRaw.n.rv.toLocaleString()} {lc}s</span>}
              {sel.profile && <span style={{ background: C.soft, color: '#5b5347', fontWeight: 700, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{sel.profile.allStars > 0 ? `${sel.profile.allStars}× All-Star` : 'Never an All-Star'}{sel.profile.debutYear ? ` · debuted ${sel.profile.debutYear}` : ''}</span>}
              {verdict && <span style={{ background: verdict === 'ahead' ? '#E3F3EC' : verdict === 'behind' ? '#FBE6E1' : C.soft, color: verdict === 'ahead' ? '#13694F' : verdict === 'behind' ? '#A8391F' : '#5b5347', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>{verdict === 'ahead' ? 'Above his shape' : verdict === 'behind' ? 'Below his shape' : 'In line with his shape'}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {!milb && <Star id={sel.pitcherId} name={sel.name} />}
            <div style={{ textAlign: 'center' }}><b style={{ fontSize: 30, lineHeight: 1, display: 'block' }}>{sel.score ?? '—'}</b><span style={k}>Shape Score{milb ? ` · ${LEVEL_LABEL[level]}` : ''}</span></div>
          </div>
        </div>
        {milb && <TranslationBanner t={sel.translation} levelLabel={LEVEL_LABEL[level]} />}
        <div style={{ margin: '8px 0 0', borderLeft: `4px solid ${verdict === 'ahead' ? '#13694F' : verdict === 'behind' ? '#A8391F' : C.line}`, background: C.soft, borderRadius: 4, padding: '7px 12px' }}>
        <p style={{ lineHeight: 1.5, color: '#3a352c', margin: 0, fontSize: 13.5 }}>{headline}{verdict && better.length ? <> Better than the league at his shape on {better.join(', ')}.</> : null}{verdict && worse.length ? <> Worse on {worse.join(', ')}.</> : null}</p>

        </div>
        {season != null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...sec, margin: '0 0 2px' }}>His {lc}: the full stat line on the pitch</div>
            <PitchStatLine pitcherId={sel.pitcherId} season={season} level={level} pitchType={pitchType} pitchName={PITCH_LABEL[pitchType] ?? pitchType} era={overall?.workload?.era ?? sel.stats?.era ?? null} fip={sel.stats?.fip ?? null} xera={sel.stats?.xera ?? null} ip={sel.stats?.ip ?? overall?.workload?.ip ?? null} />
          </div>
        )}
        <div className="psd-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0 28px', alignItems: 'start', marginTop: 4 }}>
          <style>{'@media(max-width:900px){.psd-cols{grid-template-columns:1fr !important}}'}</style>
          <div>
        <div style={sec}>His average {lc}, and what nearby shapes have produced</div>
        {(() => {
          // his average, what that shape has produced, and what a small step in ride and run has produced: the possible improvement, as a difference
          const own = sel.own.saved ?? sel.ownRaw.saved ?? null
          const best = dial ? (dial.all[1].c ?? dial.all[0].c ?? dial.all[2].c) : null
          const pick = best ? dial?.all.find(r => r.c === best) : null
          const gain = best && dial ? best.saved - dial.base : null
          return (
            <div style={{ background: C.soft, borderRadius: 6, padding: '10px 12px', margin: '0 0 10px' }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#3a352c' }}>
                <b>His average {lc}</b> is <b>{sel.ivb.toFixed(1)} in of ride</b> and <b>{sel.hb.toFixed(1)} in of run</b>{sel.velo != null ? <> at <b>{sel.velo.toFixed(1)} mph</b></> : null}.
                {dial ? <> Pitches shaped like that have produced <b>{signed(dial.base)}</b> runs saved per 100 pitches{own != null ? <>; his own have produced <b>{signed(own)}</b></> : null}.</> : null}
              </p>
              {best && gain != null && pick ? (
                <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55, color: '#3a352c' }}>
                  <b>Dialed in within {pick.d} in:</b> {[best.di !== 0 ? `${Math.abs(best.di).toFixed(1)} in ${best.di > 0 ? 'more' : 'less'} ride` : '', best.dh !== 0 ? `${Math.abs(best.dh).toFixed(1)} in ${best.dh > 0 ? 'more' : 'less'} run` : ''].filter(Boolean).join(' and ')} puts it at <b>{(sel.ivb + best.di).toFixed(1)} / {(sel.hb + best.dh).toFixed(1)}</b>, where pitches have produced <b style={{ color: '#13694F' }}>{signed(best.saved)}</b> per 100. That is a difference of <b style={{ color: '#13694F' }}>{signed(gain)} runs per 100 pitches</b> against where he sits now.
                </p>
              ) : dial ? <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.55, color: '#3a352c' }}>Within 3 in of his average, no shape has produced more than his own, so there is no small step to point to.</p> : null}
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>What other pitchers’ pitches did at those movements ({milb ? LEVEL_LABEL[level] : 'MLB since 2024'}, ±1 in window). It does not say he can throw that movement or that his results would follow.{dialed ? ` You clicked ${dialed.ivb.toFixed(1)} / ${dialed.hb.toFixed(1)} on the map.` : ''}</div>
            </div>
          )
        })()}
        {exportMap && (
          <div style={{ maxWidth: 430, margin: '0 0 10px' }}>
            <ShapeMap label={`His ${lc}s on the movement map: his sampled pitches, his average, the league window and the movement you dialed in`}
              dots={(allPts && allPts.length ? allPts : exportMap.points).map(pt => ({ hb: pt[0], ivb: pt[1], color: C.ink, opacity: 0.4 }))}
              rings={[{ hb: sel.hb, ivb: sel.ivb, color: C.orange, label: 'His average', strong: true }]}
              box={{ hb: sel.hb, ivb: sel.ivb, rx: rx10 / 10, ry: ry10 / 10 }}
              marks={(() => { const c = dial ? (dial.all[1].c ?? dial.all[0].c ?? dial.all[2].c) : null; return c ? [{ hb: sel.hb + c.dh, ivb: sel.ivb + c.di, label: 'Dialed in', color: '#2F6DB5' }] : [] })()} />
            {(() => {
              const all = !!(allPts && allPts.length)
              const pts2 = all ? (allPts as [number, number][]) : exportMap.points
              const inside = pts2.filter(q => Math.abs(q[0] - sel.hb) <= rx10 / 10 && Math.abs(q[1] - sel.ivb) <= ry10 / 10).length
              const stepOn = !!dial?.all.some(r => r.c)
              return (
                <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 6, lineHeight: 1.55 }}>
                  <b style={{ color: C.ink }}>Why the dots?</b> Each dot is one of his {lc}s{all ? ` (all ${pts2.length.toLocaleString()} with tracked movement)` : fullLog === null ? ` (a stored sample of up to 60: ${LEVEL_LABEL[level]} keeps no pitch-by-pitch log)` : ' (a sample while the full log loads)'}, placed by how it moved. They show how <i>consistent</i> the pitch is: a tight clump means he repeats it, a wide scatter means it moves around from pitch to pitch{sel.sdIvb != null && sel.sdHb != null ? ` (his own variation is ±${sel.sdIvb.toFixed(1)} in of ride and ±${sel.sdHb.toFixed(1)} in of run)` : ''}.
                  {pts2.length > 0 ? ` ${inside} of the ${pts2.length.toLocaleString()} dots fall inside the dashed box, the window of league pitches his results are compared with.` : ''}
                  {stepOn ? ' The blue cross is the small step that has produced the most.' : ''}
                </div>
              )
            })()}
          </div>
        )}

          </div>
          <div>
        <div style={sec}>Does his shape get results, and do his own match it?</div>
        {(() => {
          // is the shape itself above the level's average? Pitches shaped like his against the average pitch of this level (misses per swing), then his own
          const lg = board?.league.whiff ?? null, sw2 = shapeG.whiff ?? shapeR.whiff ?? null, own = sel.own.whiff ?? sel.ownRaw.whiff ?? null
          if (lg == null || sw2 == null) return null
          const d = (sw2 - lg) * 100, word = d >= ABOUT_LEVEL_PTS ? 'above' : d <= -ABOUT_LEVEL_PTS ? 'below' : 'about the same as'
          const tile2 = (label: string, v: number, sub: string, hi?: boolean) => <div key={label} style={{ background: hi ? '#FFF1EA' : C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 120px' }}><div style={{ ...k, fontSize: 9 }}>{label}</div><b style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{(v * 100).toFixed(1)}%</b><div style={{ fontSize: 11, color: C.mute }}>{sub}</div></div>
          return (
            <div style={{ margin: '0 0 12px' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tile2(`${LEVEL_LABEL[level]} average`, lg, 'whiffs per swing, every pitcher')}
                {tile2('Pitches shaped like his', sw2, `${shapeR.n.swings.toLocaleString()} swings`, true)}
                {own != null && tile2('His own', own, `${sel.ownRaw.n.swings.toLocaleString()} swings`)}
              </div>
              <p style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, margin: '8px 0 0' }}>Pitches shaped like his get <b>{word}</b> the {LEVEL_LABEL[level]} average for misses per swing{word === 'about the same as' ? '' : ` (${signed(d, 1)} pts)`}. {sel.score != null ? `That makes it a ${sel.score >= 67 ? 'strong' : sel.score <= 33 ? 'weak' : 'middling'} shape on runs saved (Shape Score ${sel.score}).` : ''}</p>
            </div>
          )
        })()}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr>{['Stat', 'His', 'League at his shape', 'Gap'].map(th)}</tr></thead>
          <tbody>
            {rd.map(x => (
              <tr key={x.stat.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td style={{ padding: '7px 4px', fontWeight: 700 }}><Lab t={x.stat.label} />{x.thin && <span style={{ color: C.faint, fontWeight: 600 }}> · thin sample</span>}{smallSample && <span style={{ color: C.faint }}> *</span>}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 800 }}>{x.stat.fmt(x.own)}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: C.mute }}>{x.stat.fmt(x.shape)}</td>
                <td style={{ padding: '7px 4px', textAlign: 'right' }}><span style={{ background: toneCol[x.tone].bg, color: toneCol[x.tone].fg, fontWeight: 800, borderRadius: 3, padding: '2px 7px' }}>{x.stat.diff(x.d)}</span></td>
              </tr>
            ))}
            <tr style={{ borderBottom: `1px solid ${C.line}` }}><td style={{ padding: '7px 4px', color: '#5b5347' }}>Sample behind it</td><td colSpan={3} style={{ padding: '7px 4px', textAlign: 'right', color: '#5b5347' }}>{sel.ownRaw.pitches.toLocaleString()} pitches · {sel.ownRaw.n.pa.toLocaleString()} plate appearances · {sel.ownRaw.n.ab.toLocaleString()} at-bats · {sel.ownRaw.n.swings.toLocaleString()} swings</td></tr>
            <tr><td style={{ padding: '7px 4px', color: '#5b5347' }}>League sample at his shape</td><td colSpan={3} style={{ padding: '7px 4px', textAlign: 'right', color: '#5b5347' }}>{shapeR.pitches.toLocaleString()} {milb ? ` ${LEVEL_LABEL[level]} pitches (${season ?? ''})` : ' league pitches (2024 on)'} · {shapeR.n.pa.toLocaleString()} plate appearances · {shapeR.n.swings.toLocaleString()} swings</td></tr>
          </tbody>
        </table>
        {smallSample && <div style={{ fontSize: 12, color: '#7A5B00', margin: '6px 0 0' }}>* A small sample ({sel.ownRaw.n.swings.toLocaleString()} swings, {sel.ownRaw.n.ab.toLocaleString()} at-bats): his results are hard to judge.</div>}
        <RunsSavedExplainer level={level} compact example={shapeG.saved} />
        {note && <p style={{ fontSize: 13, color: '#3a352c', lineHeight: 1.5, margin: '10px 0 0', background: C.soft, borderRadius: 4, padding: '8px 10px' }}>{note}</p>}

            <div style={{ ...sec, margin: '18px 0 6px' }}>His shape numbers, and the league window</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 6 }}>
          {([['Velocity', sel.velo == null ? '—' : `${sel.velo.toFixed(1)} mph`], ['Ride', `${sel.ivb.toFixed(1)} in`], ['Run', `${sel.hb.toFixed(1)} in`], ['Arm angle', sel.slot == null ? '—' : `${sel.slot.toFixed(0)}°`], ['Ride variation (SD)', sel.sdIvb == null ? '—' : `±${sel.sdIvb.toFixed(1)} in`], ['Run variation (SD)', sel.sdHb == null ? '—' : `±${sel.sdHb.toFixed(1)} in`]] as [string, string][]).map(([a, b]) => (
            <div key={a} style={{ background: C.soft, borderRadius: 6, padding: '6px 8px' }}><div style={{ ...k, fontSize: 9 }}><Lab t={a} /></div><b style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{b}</b></div>
          ))}
        </div>
        <div role="group" aria-label="How wide the shape window is" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <span style={k}>League window</span>
          {([['in1', '±1 in'], ['sd05', '±½ SD'], ['sd1', '±1 SD'], ['sd2', '±2 SD']] as const).map(([id, text]) => <button key={id} type="button" disabled={id !== 'in1' && (sel.sdHb == null || sel.sdIvb == null)} style={pill(wide === id)} onClick={() => setWide(id)}>{text}</button>)}
        </div>
        <div style={{ fontSize: 12, color: '#5b5347', margin: '6px 0 0', lineHeight: 1.5 }}>Widening the window by how much his own pitches vary takes in league {lc}s that move a little less like his, for a bigger sample. The box is ±{(rx10 / 10).toFixed(1)} in of run by ±{(ry10 / 10).toFixed(1)} in of ride around his average.</div>
          </div>
        </div>
        <div style={{ ...sec, marginTop: 22 }}>His {lc} at each level: has the shape changed, and how did it compare with the level’s average?</div>
        {!milb && season != null && (
          <div style={{ margin: '14px 0 0' }}>
            <div style={{ ...sec, margin: '0 0 6px', color: C.mute }}>Through this season</div>
            <PitcherSeasonChanges pitcherId={sel.pitcherId} season={season} pitchType={pitchType} pitchName={PITCH_LABEL[pitchType] ?? pitchType} />
          </div>
        )}
        <AcrossLevels pitcherId={sel.pitcherId} type={pitchType} pitchName={PITCH_LABEL[pitchType] ?? pitchType} level={level} levelAvg={levelAvg ?? {}} />
        {milb ? <MilbWhySection sel={sel} lc={lc} level={level} bins={bins} diag={diag} leagueDiag={leagueDiag} verdictGap={gap} sec={sec} /> : <WhySection sel={sel} lc={lc} why={why} bins={bins} verdictGap={gap} diagnosis={diagnosis} sec={sec} pill={pill} />}
        {!milb && season != null && (sel.stats || overall?.workload) && (
          <div style={{ marginTop: 22 }}>
            <div style={{ ...sec, margin: '0 0 6px' }}>Also: did this pitch inflate his ERA? Judged on FIP</div>
            <DamageAndFip pitcherId={sel.pitcherId} season={season} pitchType={pitchType} pitchName={PITCH_LABEL[pitchType] ?? pitchType} era={overall?.workload?.era ?? sel.stats?.era ?? null} fip={sel.stats?.fip ?? null} xera={sel.stats?.xera ?? null} ip={sel.stats?.ip ?? overall?.workload?.ip ?? null} />
          </div>
        )}
        {dial && (() => {
          const { base, rows } = dial
          const move = (c: { dh: number; di: number }) => [c.di !== 0 ? `${Math.abs(c.di).toFixed(1)} in ${c.di > 0 ? 'more' : 'less'} ride` : '', c.dh !== 0 ? `${Math.abs(c.dh).toFixed(1)} in ${c.dh > 0 ? 'more' : 'less'} run` : ''].filter(Boolean).join(', ')
          return (
            <div style={{ marginTop: 22 }}>
              <div style={{ ...sec, margin: '0 0 6px' }}>Nearby shapes: what slightly different movement has produced</div>
              <p style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.55, margin: '0 0 8px' }}>Ride and run change with grip, release height, arm angle and spin. Pitching groups test small changes and look at what pitches with the new movement have already done. Here are the league’s {lc}s within a few inches of his own, priced the same way as his: runs saved per 100 pitches, with his shape at <b>{signed(base)}</b>.</p>
              <div style={{ fontSize: 12, color: C.faint, margin: '6px 0 0', lineHeight: 1.5 }}>This is what other pitchers’ pitches have done at those movements, in {milb ? LEVEL_LABEL[level] : 'MLB since 2024'}. It does not say he can throw that movement, or that his own results would follow: location, speed and sequencing travel with the pitcher, not the shape.</div>
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5, minHeight: 32 }}>How teams use shape to find pitchers, and to build them</summary>
                <div style={{ display: 'grid', gap: 8, fontSize: 13.5, lineHeight: 1.6, color: '#3a352c', marginTop: 4 }}>
                  <div><b>What a shape is.</b> Ride (how much less the pitch drops than gravity says it should) and run (how far it moves toward the arm side), with speed and arm angle, set most of how a pitch behaves. Pitches that move alike draw similar swings and misses, so the league’s record at a shape is a fair yardstick for any pitch that moves that way.</div>
                  <div><b>Finding pitchers.</b> Set a pitcher’s results against what his shape has produced. A strong shape with results trailing points to something other than movement holding him back (location, sequencing, defense, luck): a pitcher worth a closer look. A weak shape with good results says the movement is not what is carrying him. The Refine filters (never pitched in MLB, works here but not in MLB, traded) ask that same question across a whole level.</div>
                  <div><b>Building a pitch.</b> Because shape is physical, it can be changed on purpose: a grip or release change moves ride and run, and speed adds or takes away from what a movement is worth. The table above is the first look a development group takes: what has the nearest movement done, and how far is it to get there.</div>
                  <div style={{ fontSize: 12.5, color: '#5b5347' }}>Everything on this page describes what has happened. <a href="/mlb/lab/pitch-shape/guide" style={{ color: '#B83A0E', fontWeight: 700 }}>The guide</a> walks through each part with pictures.</div>
                </div>
              </details>
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
            <div style={{ marginTop: 22 }}>
              <div style={{ ...k, color: '#B83A0E', marginBottom: 6 }}>For fantasy managers · {overall?.season ?? season ?? ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 6 }}>
                {tiles.map(t => <div key={t.label} style={{ background: C.soft, borderRadius: 6, padding: '8px 10px' }}><div style={{ ...k, color: C.mute }}><Lab t={t.label} /></div><b style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{t.v}</b>{t.sub && <div style={{ fontSize: 10.5, color: C.faint }}>{t.sub}</div>}</div>)}
              </div>
              {runsOver != null && Math.abs(runsOver) >= 1 && eraShift != null && era != null && (
                <div style={{ background: C.soft, borderRadius: 6, padding: '8px 10px', marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: '#3a352c' }}>
                  <b>His season at his shape.</b> His {nPitch.toLocaleString()} {lc}s gave up {Math.abs(runsOver).toFixed(1)} runs {runsOver > 0 ? 'more' : 'fewer'} than pitches shaped like his have given up. Over his {wl!.ip.toFixed(0)} innings, that comes to {Math.abs(eraShift).toFixed(2)} runs per nine: an ERA of {Math.max(0, era - eraShift).toFixed(2)} instead of {era.toFixed(2)}. This re-prices the season already played, on this one pitch, and counts run expectancy as runs; it is not a forecast.
                </div>
              )}
              {eg != null && Math.abs(eg) >= 0.4 && <div style={{ fontSize: 12.5, color: '#3a352c', lineHeight: 1.5, marginTop: 6 }}>His ERA is {Math.abs(eg).toFixed(2)} runs {eg > 0 ? 'higher' : 'lower'} than his xERA, so the contact he has allowed has been {eg > 0 ? 'better' : 'worse'} than his results. {kp != null && bp != null && kp - bp >= 0.15 ? `He strikes out ${((kp - bp) * 100).toFixed(0)} points more batters than he walks.` : ''}</div>}
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: '#3a352c' }}>
                <li>Shape is physics, so it is measured the same way whoever is batting; ERA, wins and strand rate also reflect defense, park and luck. Fantasy points come from those, so the shape and FIP show what the pitcher himself is doing.</li>
                {sel.score != null && <li>Shape Score <b>{sel.score}</b> ({sw?.word.toLowerCase() ?? 'average shape'}){sel.owned != null ? <>, rostered in <b>{fmtOwned(sel.owned)}</b> of ESPN leagues{sel.score >= 67 && sel.owned < 30 ? ': a strong shape, rostered in few leagues' : sel.score <= 33 && sel.owned >= 50 ? ': rostered in many leagues on a weaker shape' : ''}</> : null}.</li>}
                {verdict === 'behind' && (strong) && <li>His results trail a strong shape by {Math.abs(gap ?? 0).toFixed(2)} runs per 100 pitches. The reasons in section 4 and the FIP line above are what to read before judging his ERA.</li>}
                {verdict === 'ahead' && weak && <li>His results are better than a weak shape has produced, so the movement does not explain them; location, sequencing, defense or luck are doing the work.</li>}
                {verdict === 'level' && <li>His results match what his shape has produced, so there is no gap between the two to explain.</li>}
              </ul>
            </div>
          )
        })()}
        {milb && closestInput && <div style={{ marginTop: 22 }}><ClosestMlb p={closestInput} level={level} type={pitchType} hand={focusHand ?? 'R'} pitchName={PITCH_LABEL[pitchType] ?? pitchType} armAngle={sel.slot != null} /></div>}
        <details style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 15, minHeight: 32 }}>More on his season: ranks, arsenal, fantasy line and where he leaks{exportData ? ', and export for X' : ''}</summary>
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
          <div style={{ marginTop: 6 }}>
        <div style={sec}>His season: every pitch he threw, {overall?.season ?? 'this season'}</div>
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
                      <td style={{ padding: '7px 4px', fontWeight: 700 }}><Lab t={r.label} /></td>
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

        {milb ? (
          <>
            <div style={{ ...sec, marginTop: 22 }}>Across his whole arsenal</div>
            <div style={{ fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>The check by pitch, batter side, count and times through the order uses MLB situation data and is MLB only. His other pitches at {LEVEL_LABEL[level]}, each with its own results, are listed in the card below.</div>
          </>
        ) : (
          <>
        <div style={{ ...sec, marginTop: 22 }}>Across his whole arsenal: another pitch, a situation, or sequencing</div>
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

          </>
        )}

        </details>
        <div style={{ fontSize: 11, color: C.faint, margin: '10px 0 0' }}>“League at his shape” is what league {lc}s inside the window have produced, {milb ? `${season ?? ''} at ${LEVEL_LABEL[level]}` : 'all seasons since 2024 added up'}; outperforming or underperforming compares his own results with that, and describes what has happened. Location, sequencing, deception, defense and luck are not in the shape. Green is better for the pitcher than his shape by more than the usual noise, red is worse.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          {!milb && <FollowIsland kind="player" refId={String(sel.pitcherId)} name={sel.name} />}
          {!milb && <button type="button" onClick={() => onOpen(sel.pitcherId, sel.name)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1.5px solid ${C.orange}`, background: C.orange, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Open all his pitches →</button>}
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
  /** the level being read: MLB (the default, unchanged) or a minor-league level, whose board, shape and results are all that level's own */
  level?: Level
  /** the chosen pitcher's location and contact rates at this level, and the level's, for the location row of the reasons (minor-league levels only) */
  diag?: Diag | null
  leagueDiag?: Diag | null
  /** the pitchers the page is showing after its filters (null = everyone), and short career facts for a row (minor-league views) */
  only?: Set<number> | null
  chipsFor?: (id: number) => string[]
  /** the movement dialed in on the map, so the pitcher's own average can be set against it */
  dialed?: { hb: number; ivb: number } | null
  /** each level's average for this pitch and hand (whiffs per swing and shape), for his row at each level */
  levelAvg?: Partial<Record<Level, LevelAvg>>
  /** the hand of the pitcher chosen */
  focusHand?: 'R' | 'L'
}

/**
 * The pitchers whose average shape sits in the chosen spot, split into performing, not performing and in line with what their shape has produced, with the stats
 * that explain it flagged on each row. Click a pitcher for his full read. Pitchers are those inside the spot's box; with fewer than 6 it takes the nearest 8 and says so.
 */
export function ShapePlayersPanel({ board, hb, ivb, radius, lc, selectedId, onSelect, level = 'mlb', headshot, only, chipsFor }: PanelProps) {
  const [tab, setTab] = useState<'here' | 'all' | 'ahead' | 'behind' | 'level' | null>(null)   // null: the panel picks (the pitchers who average this shape when there are any, else the ones below their shape)
  const [all, setAll] = useState(false)
  const [byVelo, setByVelo] = useState(false)   // list the fastest first, instead of the biggest gap first
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 38, padding: '0 11px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' })
  if (board === undefined) return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, fontSize: 13, color: C.mute }}>Finding the pitchers at this shape…</div>
  if (!board) return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, fontSize: 13, color: '#5b5347' }}>Pitcher results aren’t built for this pitch yet. They fill after the weekly shape-results job runs.</div>

  const dist = (r: BoardRow) => Math.hypot(r.hb - hb, r.ivb - ivb)
  const pool = only ? board.rows.filter(r => only.has(r.pitcherId)) : board.rows   // the page's filters (minor-league Refine) narrow who can appear here
  const inside = pool.filter(r => Math.abs(r.hb - hb) <= radius && Math.abs(r.ivb - ivb) <= radius)
  const near = inside.length >= 6 ? inside : [...pool].sort((a, b) => dist(a) - dist(b)).slice(0, 8)
  const widened = inside.length < 6
  const cohort = near.map(r => ({ r, rd: reads(r) }))
  const group = (v: 'ahead' | 'behind' | 'level') => cohort.filter(c => c.r.verdict === v).sort((a, b) => (v === 'ahead' ? (b.r.gap ?? 0) - (a.r.gap ?? 0) : v === 'behind' ? (a.r.gap ?? 0) - (b.r.gap ?? 0) : b.r.pitches - a.r.pitches))
  const few = cohort.filter(c => c.r.verdict == null)
  const sel = selectedId != null ? board.rows.find(r => r.pitcherId === selectedId) ?? null : null

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }

  // a level with no run value (the Arizona Fall League) has no verdicts at all, so list everyone at the shape rather than three empty tabs
  const isHere = (r: BoardRow) => Math.abs(r.hb - hb) <= radius && Math.abs(r.ivb - ivb) <= radius
  const here = cohort.filter(c => isHere(c.r))
  const hasHere = widened && here.length > 0
  const effTab: 'here' | 'all' | 'ahead' | 'behind' | 'level' = tab ?? (cohort.length > 0 && few.length === cohort.length ? 'all' : hasHere ? 'here' : 'behind')
  const listBase = effTab === 'all' ? [...cohort].sort((a, b) => b.r.pitches - a.r.pitches) : effTab === 'here' ? [...here].sort((a, b) => b.r.pitches - a.r.pitches) : group(effTab)
  const list = byVelo ? [...listBase].sort((a, b) => (b.r.velo ?? -1) - (a.r.velo ?? -1)) : listBase
  // average speed of each group (weighted by pitches thrown): do the pitchers getting the shape's results throw harder or softer than the ones who are not?
  const avgVelo = (cs: typeof cohort) => { const w = cs.filter(c => c.r.velo != null); const n = w.reduce((t, c) => t + c.r.pitches, 0); return n > 0 ? w.reduce((t, c) => t + (c.r.velo as number) * c.r.pitches, 0) / n : null }
  const veloGroups = ([['Above his shape', group('ahead'), '#13694F'], ['In line', group('level'), '#5b5347'], ['Below his shape', group('behind'), '#A8391F']] as const).map(([label, g, col]) => ({ label, n: g.length, v: avgVelo(g), col })).filter(x => x.n > 0 && x.v != null)
  const shown = all ? list : list.slice(0, 6)
  const tabs: { id: 'here' | 'all' | 'ahead' | 'behind' | 'level'; label: string }[] = [
    ...(hasHere ? [{ id: 'here' as const, label: `Averages this shape (${here.length})` }] : []),
    { id: 'all', label: widened ? `Averages it or nearest (${cohort.length})` : `Everyone (${cohort.length})` }, { id: 'behind', label: `Below his shape (${group('behind').length})` }, { id: 'ahead', label: `Above his shape (${group('ahead').length})` }, { id: 'level', label: `In line (${group('level').length})` },
  ]
  return (
    <div style={card} id="pf2-panel">
      <div className="pv-k" style={{ color: '#B83A0E' }}>Who throws this shape, and how they are doing</div>
      <p style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, margin: '2px 0 8px' }}>
        {widened
          ? <>
              {inside.length === 0
                ? <><b style={{ color: C.ink }}>No pitcher’s average {lc} is within ±{radius} in of this spot.</b> The {near.length} below are the nearest pitchers; each shows how far his average is from the spot.</>
                : <><b style={{ color: C.ink }}>Only {inside.length === 1 ? '1 pitcher averages' : `${inside.length} pitchers average`} a {lc} within ±{radius} in of this spot: {here.map(h => h.r.name).join(', ')}.</b> The other {near.length - inside.length} below are the nearest pitchers, marked with how far their average is from the spot.</>}
            </>
          : <>{inside.length} pitchers average a {lc} within ±{radius} in of this spot.</>}
        {' '}“Above his shape” means his own results this season were above what league pitches with his shape produced; “below” means they were below it. Click a pitcher for his overview.
      </p>
      {(() => {
        // the group as one: their average shape and speed, and their results together against what the shape has produced
        const rs = cohort.map(c => c.r)
        const wavg = (f: (r: BoardRow) => number | null, w: (r: BoardRow) => number) => { const xs = rs.filter(r => f(r) != null && w(r) > 0); const n = xs.reduce((t2, r) => t2 + w(r), 0); return n > 0 ? xs.reduce((t2, r) => t2 + (f(r) as number) * w(r), 0) / n : null }
        const velo = wavg(r => r.velo, r => r.pitches), ride = wavg(r => r.ivb, r => r.pitches), run = wavg(r => r.hb, r => r.pitches)
        const own = wavg(r => r.ownRaw.whiff, r => r.ownRaw.n.swings), shp = wavg(r => r.shapeRaw.whiff, r => r.ownRaw.n.swings)
        const swings = rs.reduce((t2, r) => t2 + r.ownRaw.n.swings, 0)
        if (rs.length === 0) return null
        const cell = (label: string, v: React.ReactNode, sub?: string) => <div style={{ background: C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={{ ...k, fontSize: 9 }}>{label}</div><b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{v}</b>{sub && <div style={{ fontSize: 11, color: C.mute }}>{sub}</div>}</div>
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
            {cell(widened ? 'Shown' : 'Pitchers', rs.length, `${widened ? `${here.length} average this shape · ${rs.length - here.length} nearest · ` : ''}${group('ahead').length} above · ${group('level').length} in line · ${group('behind').length} below`)}
            {cell('Average speed', velo == null ? '—' : `${velo.toFixed(1)} mph`)}
            {cell('Average shape', ride == null || run == null ? '—' : `${ride.toFixed(1)} / ${run.toFixed(1)}`, 'ride / run, in')}
            {own != null && cell('Their whiffs per swing', `${(own * 100).toFixed(1)}%`, shp != null ? `shape produced ${(shp * 100).toFixed(1)}% · ${swings.toLocaleString()} swings` : `${swings.toLocaleString()} swings`)}
          </div>
        )
      })()}
      {veloGroups.length >= 2 && (
        <div style={{ background: C.soft, borderRadius: 6, padding: '8px 10px', margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: '#3a352c' }}>
          <b>Average speed at this shape:</b>{' '}
          {veloGroups.map((x, i) => <span key={x.label}>{i ? ' · ' : ''}<span style={{ color: x.col, fontWeight: 800 }}>{x.label}</span> {(x.v as number).toFixed(1)} mph ({x.n})</span>)}
          <span style={{ color: '#5b5347' }}> Same shape, so the speed difference is part of why some get its results and some do not.</span>
        </div>
      )}
      <div role="group" aria-label="Pitchers at this shape" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 10px' }}>
        {tabs.map(t => <button key={t.id} type="button" style={pill(effTab === t.id)} onClick={() => { setTab(t.id); setAll(false) }}>{t.label}</button>)}
        <button type="button" aria-pressed={byVelo} style={{ ...pill(byVelo), marginLeft: 'auto' }} onClick={() => setByVelo(v => !v)}>{byVelo ? 'Fastest first' : 'Sort by speed'}</button>
      </div>
      {shown.length === 0 ? <div style={{ fontSize: 13, color: '#5b5347', padding: '6px 0' }}>None here with enough pitches to compare.</div> : shown.map(({ r, rd }) => {
        return (
          <button key={r.pitcherId} type="button" onClick={() => { onSelect(r.pitcherId); document.getElementById('pf2-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 0, borderTop: `1px solid ${C.line}`, padding: '10px 6px', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, ...(r.pitcherId === selectedId ? { background: '#FFF1EA' } : null) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <PlayerPhoto id={r.pitcherId} size={40} minor={isMilb(level)} />
              <b style={{ fontSize: 14.5 }}>{r.name}</b>
              <span style={{ color: C.mute, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{(() => { const t = teamOf(level, r.teamAbbr); return t ? <TeamBadge id={t.id} size={20} disc={false} /> : null })()}{r.teamAbbr} · {r.pitches.toLocaleString()} pitches{r.velo != null ? ` · ${r.velo.toFixed(1)} mph` : ''}</span>{isMilb(level) && <TranslationChip t={r.translation} />}{(() => { const w = shapeWord(r.score); return w ? <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{w.word}</span> : null })()}
              {widened && (isHere(r) ? <span style={{ background: '#E6F3EC', color: '#13694F', fontWeight: 800, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>Averages this shape</span> : <span style={{ background: C.soft, color: '#5b5347', fontWeight: 700, fontSize: 11.5, borderRadius: 3, padding: '2px 8px' }}>Nearest · {dist(r).toFixed(1)} in away</span>)}
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5b5347' }}>Shape Score <b style={{ color: C.ink, fontSize: 14 }}>{r.score ?? '—'}</b></span>
              <span style={{ fontWeight: 800, fontSize: 13, color: r.verdict === 'ahead' ? C.good : r.verdict === 'behind' ? C.bad : C.ink }}>{r.gap != null ? `${signed(r.gap)} /100` : ''}</span>
            </div>
            {chipsFor && (() => { const c = chipsFor(r.pitcherId); return c.length ? <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>{c.map(t => <span key={t} style={{ background: C.soft, color: '#5b5347', fontWeight: 600, fontSize: 11.5, borderRadius: 3, padding: '2px 7px' }}>{t}</span>)}</div> : null })()}
            {r.gap != null && <div style={{ fontSize: 13, lineHeight: 1.4, marginTop: 4, color: r.verdict === 'ahead' ? '#13694F' : r.verdict === 'behind' ? '#A8391F' : '#5b5347', fontWeight: 700 }}>{r.verdict === 'level' ? `His ${lc} results are in line with what pitches shaped like his have produced.` : `His ${lc} results are ${Math.abs(r.gap).toFixed(2)} runs per 100 pitches ${r.verdict === 'ahead' ? 'better' : 'worse'} than pitches shaped like his have produced.`}</div>}
            {(() => {
              const want = ['saved', 'woba', 'xwoba', 'whiff'].map(id => rd.find(x => x.stat.id === id)).filter((x): x is Read => !!x)
              if (want.length === 0) return null
              const head: React.CSSProperties = { fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, fontWeight: 800 }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)', gap: '3px 10px', marginTop: 6, fontSize: 13, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
                  <span />
                  <span style={{ ...head, textAlign: 'right' }}>His {lc}s</span>
                  <span style={{ ...head, textAlign: 'right' }}>Shape produced</span>
                  {want.map(x => (
                    <div key={x.stat.id} style={{ display: 'contents' }}>
                      <span style={{ color: '#3a352c' }}>{x.stat.label.replace(' against', '').replace(' per swing', '').replace(' / 100', ' per 100')}{x.stat.up ? '' : ' (lower is better)'}</span>
                      <b style={{ textAlign: 'right', color: toneCol[x.tone].fg }}>{x.stat.fmt(x.own)}</b>
                      <span style={{ textAlign: 'right', color: '#5b5347' }}>{x.stat.fmt(x.shape)}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </button>
        )
      })}
      {list.length > 6 && <button type="button" style={{ ...pill(false), marginTop: 8 }} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}
      {few.length > 0 && effTab !== 'all' && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>{few.length} more here ({few.slice(0, 3).map(c => c.r.name).join(', ')}{few.length > 3 ? '…' : ''}) have no results to set against their shape (too few pitches, or this level has no runs-saved figure). Open Everyone to see them.</div>}
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
const ROLES = [['any', 'Any role'], ['starter', 'Starters'], ['reliever', 'All relievers'], ['closer', 'Closers (5+ saves)'], ['setup', 'Setup men (5+ holds)']] as const
type RoleFilter = (typeof ROLES)[number][0]
const EXPERIENCE = [['any', 'Any'], ['0-1', 'Rookie or second year'], ['2-4', '2 to 4 years'], ['5-9', '5 to 9 years'], ['10+', '10+ years']] as const
type ExpFilter = (typeof EXPERIENCE)[number][0]

/** Two-thumb slider for a low and a high value, 0 to 100. Two native range inputs sit on top of each other so it works with keyboard and touch. */
function RangeSlider({ lo, hi, onChange, label }: { lo: number; hi: number; onChange: (lo: number, hi: number) => void; label: string }) {
  const thumb: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: 28, margin: 0, background: 'none', pointerEvents: 'none', WebkitAppearance: 'none', appearance: 'none', accentColor: C.orange }
  return (
    <div style={{ minWidth: 210 }}>
      <div style={{ position: 'relative', height: 28 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 4, borderRadius: 2, background: C.line }} />
        <div style={{ position: 'absolute', left: `${lo}%`, right: `${100 - hi}%`, top: 12, height: 4, borderRadius: 2, background: C.orange }} />
        <style>{'.rs2::-webkit-slider-thumb{pointer-events:auto;cursor:pointer}.rs2::-moz-range-thumb{pointer-events:auto;cursor:pointer}'}</style>
        <input className="rs2" type="range" min={0} max={100} step={1} value={lo} aria-label={`${label}, lowest`} onChange={e => onChange(Math.min(Number(e.target.value), hi), hi)} style={thumb} />
        <input className="rs2" type="range" min={0} max={100} step={1} value={hi} aria-label={`${label}, highest`} onChange={e => onChange(lo, Math.max(Number(e.target.value), lo))} style={thumb} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{lo}% to {hi}%</div>
    </div>
  )
}
const selVal = (v: number | null) => (v == null ? '' : String(v))
const num = (v: string) => (v === '' ? null : Number(v))

/**
 * "Find me a pitcher": narrow the board by ERA, xERA, the gap between them and Shape Score, pick what to look for (strong shape with trailing results, a quiet line, results the shape does not
 * explain, or anyone), then either see the best matches or shuffle a random six, or let it pick one at random. Cards carry a headshot and the numbers that matter; clicking one opens his full read.
 * Established names (All-Stars, award winners, full-time veterans) are hidden unless asked for; small samples are kept and tagged.
 */
export function FindPitcher({ board, lc, hand, headshot, onPick, team, onMatches }: { board: Board | null | undefined; lc: string; hand: 'R' | 'L' | 'B'; headshot: (id: number) => string; onPick: (r: BoardRow) => void; /** the club chosen in the map's Team picker; '' = all teams */ team: string; /** the pitchers that pass every filter here, for the map to show only them; null = the map shows everyone */ onMatches: (ids: Set<number> | null) => void }) {
  const finderLim = limitsFor(useShapeView().level)
  const [lens, setLens] = useState<LensId>(finderLim.gated ? 'hidden' : 'any')
  useEffect(() => { setLens(finderLim.gated ? 'hidden' : 'any') }, [finderLim.gated])   // the exhibition levels have no results to ahead/behind lenses on, so they open on Anyone
  const [open, setOpen] = useState(true)
  const [known, setKnown] = useState(false)    // include All-Stars, award winners and full-time veterans
  const [small, setSmall] = useState(true)     // include pitchers whose own sample is under the usual minimum
  const [minEra, setMinEra] = useState<number | null>(null)
  const [maxXera, setMaxXera] = useState<number | null>(null)
  const [minGap, setMinGap] = useState<number | null>(null)
  const [minScore, setMinScore] = useState<number | null>(null)
  const [ownLo, setOwnLo] = useState(0)     // ESPN percent rostered, from
  const [ownHi, setOwnHi] = useState(100)   // ESPN percent rostered, to
  const [role, setRole] = useState<RoleFilter>('any')
  const [exp, setExp] = useState<ExpFilter>('any')
  const roster = useRoster()
  const [seed, setSeed] = useState<number | null>(null)   // null = best matches first; a number = a random six for that seed
  const L = LENSES.find(l => l.id === lens) ?? LENSES[0]
  const allRows = board ? board.rows : []
  const ownOn = ownLo > 0 || ownHi < 100
  const yearsIn = (r: BoardRow) => (r.profile?.debutYear != null && board ? board.season - r.profile.debutYear : null)
  const passes = (r: BoardRow) => {
    if (ownOn) { const v = r.owned ?? 0; if (v < ownLo || v > ownHi) return false }   // no ESPN match means nobody rosters him: 0%
    if (role === 'starter' && r.role !== 'starter') return false
    if (role === 'reliever' && !(r.role === 'reliever' || r.role === 'closer' || r.role === 'setup')) return false
    if ((role === 'closer' || role === 'setup') && r.role !== role) return false
    if (exp !== 'any') { const y = yearsIn(r); if (y == null) return false; if (exp === '0-1' ? y > 1 : exp === '2-4' ? y < 2 || y > 4 : exp === '5-9' ? y < 5 || y > 9 : y < 10) return false }
    if (team && r.teamAbbr !== team) return false
    return true
  }
  const rows = allRows.filter(passes)
  const mine = allRows.filter(r => roster.ids.includes(r.pitcherId))
  const [mapToo, setMapToo] = useState(true)   // the filters also decide which pitchers the map shows
  const base = { includeKnown: known, includeSmall: small, minEra, maxXera, minEraGap: minGap, minScore, includeUnscored: !finderLim.gated }
  const found = findPitchers(rows, lens, { ...base, limit: 6, seed })
  const total = findPitchers(rows, lens, { ...base, limit: 9999 }).length
  const hiddenKnown = known ? 0 : findPitchers(rows, lens, { ...base, includeKnown: true, limit: 9999 }).length - total
  const noAwards = rows.length > 0 && rows.every(r => r.profile == null)
  const noStats = rows.length > 0 && rows.every(r => r.stats == null)
  const anyFilter = minEra != null || maxXera != null || minGap != null || minScore != null || ownOn || role !== 'any' || exp !== 'any'
  // the map's pitchers: those passing the numbers, role, experience, ESPN and team filters (not the lens, and not the established-name or small-sample screens, which shape the list only)
  useEffect(() => {
    if (!mapToo || !anyFilter) { onMatches(null); return }
    onMatches(new Set(findPitchers(rows, 'any', { ...base, includeKnown: true, includeSmall: true, limit: 9999 }).map(r => r.pitcherId)))
  }, [board, mapToo, anyFilter, minEra, maxXera, minGap, minScore, ownLo, ownHi, role, exp, team]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 4, border: `1px solid ${on ? C.orange : C.line}`, background: on ? '#FFF1EA' : '#fff', color: C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })
  const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
  const selectStyle: React.CSSProperties = { minHeight: 38, minWidth: 96, border: `1px solid ${C.line}`, borderRadius: 4, background: '#fff', padding: '0 8px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink, cursor: 'pointer' }
  const clear = () => { setMinEra(null); setMaxXera(null); setMinGap(null); setMinScore(null); setOwnLo(0); setOwnHi(100); setRole('any'); setExp('any') }
  const surprise = () => {
    const pool = findPitchers(rows, lens, { ...base, limit: 9999 })
    if (pool.length) onPick(pool[Math.floor(Math.random() * pool.length)])
  }
  const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
  return (
    <section id="pf2-find" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px', margin: '4px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 18 }}>Find me a pitcher</b>
        <span style={{ fontSize: 13, color: '#5b5347' }}>{hand === 'B' ? 'Left- and right-handed' : hand === 'R' ? 'Right-handed' : 'Left-handed'} {lc}s. Set what you want, then shuffle or let it choose.</span>
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
            <label style={field}><span className="pv-k">Shape Score<InfoTip k="shapeScore" /></span>
              <select style={selectStyle} value={selVal(minScore)} onChange={e => setMinScore(num(e.target.value))} aria-label="Shape Score at least">
                <option value="">Any</option>{SCORE_MIN.map(v => <option key={v} value={v}>{v}+</option>)}
              </select></label>
            <label style={field}><span className="pv-k">Role</span>
              <select style={selectStyle} value={role} onChange={e => setRole(e.target.value as RoleFilter)} aria-label="Starter or reliever">
                {ROLES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select></label>
            <label style={field}><span className="pv-k">Experience</span>
              <select style={selectStyle} value={exp} onChange={e => setExp(e.target.value as ExpFilter)} aria-label="Years since MLB debut">
                {EXPERIENCE.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select></label>
            <div style={field}><span className="pv-k">ESPN rostered</span>
              <RangeSlider lo={ownLo} hi={ownHi} onChange={(a, b) => { setOwnLo(a); setOwnHi(b) }} label="ESPN percent rostered" /></div>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 38, fontSize: 13 }}><input type="checkbox" checked={!known} onChange={e => setKnown(!e.target.checked)} /> Hide established names</label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 38, fontSize: 13 }}><input type="checkbox" checked={small} onChange={e => setSmall(e.target.checked)} /> Include small samples</label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', minHeight: 38, fontSize: 13 }}><input type="checkbox" checked={mapToo} onChange={e => setMapToo(e.target.checked)} /> Filter the map too</label>
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
                            <div key={a} title={note ? `Savant's xERA on only ${r.stats?.xeraPa} plate appearances: shown, but noisy` : undefined} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 6px', opacity: note ? 0.7 : 1 }}><div style={{ ...k, fontSize: 9, whiteSpace: 'nowrap', letterSpacing: '.06em' }}>{a}</div><b style={{ fontSize: 18, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: col ?? C.ink }}>{b}</b>{note && <div style={{ fontSize: 9.5, color: C.mute, whiteSpace: 'nowrap' }}>{note.replace(' · ', '')}</div>}</div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {w && <span style={{ background: w.bg, color: w.fg, fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{w.word}</span>}
                          {r.verdict && r.verdict !== 'level' && <span style={{ background: r.verdict === 'ahead' ? '#E3F3EC' : '#FBE6E1', color: r.verdict === 'ahead' ? '#13694F' : '#A8391F', fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{r.verdict === 'ahead' ? 'Above his shape' : 'Below his shape'}{r.gap != null ? ` ${signed(r.gap)}` : ''}</span>}
                          {r.role && <span style={{ background: C.soft, color: '#5b5347', fontWeight: 800, fontSize: 11, borderRadius: 3, padding: '1px 6px' }}>{r.role === 'starter' ? 'SP' : r.role === 'closer' ? 'RP · closer' : r.role === 'setup' ? 'RP · setup' : 'RP'}</span>}
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
                      <div style={{ fontSize: 12, fontWeight: 700, color: r.verdict === 'ahead' ? '#13694F' : r.verdict === 'behind' ? '#A8391F' : '#5b5347', marginTop: 2 }}>{r.verdict === 'ahead' ? 'Above his shape' : r.verdict === 'behind' ? 'Below his shape' : r.verdict === 'level' ? 'In line with his shape' : 'Too few pitches to compare'}</div>
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Starred pitchers are saved in this browser only. Only those who throw this pitch with this hand show here; change the pitch or hand to see the rest.</div>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>{noAwards ? 'Award history could not be read from the MLB Stats API, so established names are screened by workload only. ' : ''}ESPN is the share of ESPN fantasy leagues that roster him, updated daily. ERA, xERA and innings are this season’s (xERA from Baseball Savant, which carries it for every pitcher; one on under 100 plate appearances is greyed and marked thin, because it is noisy); the green xERA marks an ERA at least a run above it. Established means an All-Star, Cy Young, MVP or All-MLB selection, or {ESTABLISHED_PITCHES.toLocaleString()}+ pitches since 2024. Role comes from this season’s games: a starter has half or more of his games as starts; a closer 5+ saves; a setup man 5+ holds. Experience is years since his MLB debut. ESPN % counts a pitcher ESPN does not list as 0%. A small sample is under 300 of his own {lc}s: shown, but noisy, so check the count. Strong shape means a Shape Score of {STRONG_SCORE} or more, weak {WEAK_SCORE} or less. Describes what has happened, not a forecast. Click a pitcher for his shape, his season and where they rank.</div>
        </>
      )}
    </section>
  )
}

// ---- Why aren't the results there? ---------------------------------------------------------------------------------------------------------------------

const STATUS: Record<Status, { word: string; bg: string; fg: string }> = {
  explains: { word: 'Part of the gap', bg: '#FBE6E1', fg: '#A8391F' }, helps: { word: 'Helping him', bg: '#E3F3EC', fg: '#13694F' },
  small: { word: 'Not the cause', bg: '#F1EEE6', fg: '#5b5347' }, note: { word: 'Worth noting', bg: '#FFF4CC', fg: '#7A5B00' }, unknown: { word: 'No read', bg: '#F1EEE6', fg: '#8a8275' },
}

/** The catcher's view of every zone: the nine squares of the strike zone (1 to 9) in the middle and the four outside quadrants around them (11 to 14), each with his share of the pitch against the league's for the same shape. */
function ZoneGrids({ factor }: { factor: Factor }) {
  const by = new Map(factor.slices.map(s => [s.key, s]))
  const out = (pick: (s: Factor['slices'][number]) => number) => factor.slices.filter(s => Number(s.key) >= 11).reduce((a, s) => a + pick(s), 0)
  const OUTER: Record<number, { pts: string; tx: number; ty: number }> = {
    11: { pts: '0,0 100,0 100,40 40,40 40,100 0,100', tx: 21, ty: 25 }, 12: { pts: '100,0 200,0 200,100 160,100 160,40 100,40', tx: 179, ty: 25 },
    13: { pts: '0,100 40,100 40,160 100,160 100,200 0,200', tx: 21, ty: 183 }, 14: { pts: '160,100 200,100 200,200 100,200 100,160 160,160', tx: 179, ty: 183 },
  }
  const grid = (pick: (s: Factor['slices'][number]) => number, title: string, ref: (s: Factor['slices'][number]) => number) => {
    const fill = (z: number) => {
      const sl = by.get(String(z)), over = (sl ? pick(sl) : 0) - (sl ? ref(sl) : 0)   // over-used squares darker orange, under-used blue-grey
      return Math.abs(over) < 0.01 ? '#F1EEE6' : over > 0 ? `rgba(255,87,34,${Math.min(0.85, 0.25 + over * 5)})` : `rgba(94,122,153,${Math.min(0.7, 0.2 + -over * 5)})`
    }
    const pct = (z: number) => `${((by.get(String(z)) ? pick(by.get(String(z))!) : 0) * 100).toFixed(0)}%`
    return (
      <div>
        <div style={{ ...k, marginBottom: 4 }}>{title}</div>
        <svg viewBox="0 0 200 200" width={200} height={200} role="img" aria-label={`${title}: share of pitches in each of the thirteen zones`} style={{ display: 'block' }}>
          {[11, 12, 13, 14].map(z => <g key={z}><title>{ZONE_LABEL[String(z)]}</title><polygon points={OUTER[z].pts} fill={fill(z)} stroke="#fff" strokeWidth="2" /><text x={OUTER[z].tx} y={OUTER[z].ty} textAnchor="middle" fontSize="13" fontWeight="800" fill={C.ink}>{pct(z)}</text></g>)}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => {
            const cx = 40 + ((z - 1) % 3) * 40, cy = 40 + Math.floor((z - 1) / 3) * 40
            return <g key={z}><title>{ZONE_LABEL[String(z)]}</title><rect x={cx} y={cy} width="40" height="40" fill={fill(z)} stroke="#fff" strokeWidth="2" /><text x={cx + 20} y={cy + 25} textAnchor="middle" fontSize="13" fontWeight="800" fill={C.ink}>{pct(z)}</text></g>
          })}
        </svg>
        <div style={{ fontSize: 11.5, color: '#5b5347', marginTop: 4 }}>Outside the zone: <b>{(out(pick) * 100).toFixed(0)}%</b></div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {grid(s => s.his, 'His, catcher’s view', s => s.league)}
      {grid(s => s.league, 'League, same shape', s => s.league)}
      <div style={{ fontSize: 12, color: '#5b5347', maxWidth: 240, lineHeight: 1.5, alignSelf: 'center' }}>The middle nine squares are the strike zone; the four corners are the pitches outside it (upper and lower, left and right). Orange squares are where he throws it more than league pitches of the same shape do; blue-grey, less.</div>
    </div>
  )
}

/** The reasons for a minor-league pitcher, from what that level stores (speed, arm angle, location, defense and luck); the pitch-by-pitch ones are listed as not measured. */
function MilbWhySection({ sel, lc, level, bins, diag, leagueDiag, verdictGap, sec }: { sel: BoardRow; lc: string; level: Level; bins: ShapeBin[] | null | undefined; diag: Diag | null | undefined; leagueDiag: Diag | null | undefined; verdictGap: number | null; sec: React.CSSProperties }) {
  const label = LEVEL_LABEL[level]
  const { rows, lead, hurting, allowedMore } = buildMilbWhy(sel, lc, label, bins, diag, leagueDiag, verdictGap)
  return (
    <>
      <div id="psd-why" style={{ ...sec, marginTop: 22 }}>Why aren’t the results there? Speed, arm angle, location, defense and luck at {label}</div>
      <div style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, marginBottom: 8 }}>Set against {label} {lc}s with a similar shape and against that level’s own rates. Platoon, extension and sequencing are not measured at {label}, so they show no read. Each factor is read on its own, so they overlap a little and should not be totalled.</div>
      {lead && <div style={{ background: hurting.length && allowedMore != null && allowedMore > 0 ? '#FBE6E1' : '#F1EEE6', borderRadius: 4, padding: '9px 12px', fontSize: 14, lineHeight: 1.5, color: '#3a352c', marginBottom: 10 }}><b>{lead}</b></div>}
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
    </>
  )
}

export function WhySection({ sel, lc, why, bins, verdictGap, diagnosis, sec, pill }: { sel: BoardRow; lc: string; why: WhyResult | 'locked' | undefined; bins: ShapeBin[] | null | undefined; verdictGap: number | null; diagnosis: DiagnosisResult | 'locked' | undefined; sec: React.CSSProperties; pill: (on: boolean) => React.CSSProperties }) {
  void pill
  const title = 'Platoon, speed, extension, arm angle, location and sequencing against league pitches with his shape'
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
