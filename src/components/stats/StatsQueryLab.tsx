'use client'

// src/components/stats/StatsQueryLab.tsx
//
// "Ask the Stats" — a query builder for league-wide MLB numbers.
// Type a plain-English search ("postseason OPS after the 6th inning") or set
// the filters by hand; the result is tiles, tables and charts, grouped by
// whatever you pick (overall, season, team, player, any situation family, or
// a hand-picked set of years to compare).
//
// Numbers come from /api/stats/query (MLB Stats API team/player splits, summed
// server-side). Metric math (AVG, OPS, ERA, FIP, ...) lives in
// stats-query-catalog.ts and runs here on the summed counting stats, so a rate
// is always recomputed from totals, never averaged.
//
// FREE: standard (box-score) stats, every filter and grouping, the default
// chart for each view. PRO: advanced metrics, chart-type switching (+ scatter
// with a second metric), PNG export, CSV, column picker. `isPro` is a required
// prop; the API independently re-checks the session and strips the raw fields
// advanced metrics need, so the gate is not UI-only.
//
// Honesty rules: one situation filter at a time (MLB's API cannot intersect
// two); a slice with no data shows an empty state, never a substitute;
// small samples are flagged, not hidden.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, SANS, MONO, Card, Tile, Empty, teamLogo, headshot } from '@/components/team/ui'
import { MLB_TEAMS } from '@/lib/teams'
import type { QueryResult, RecentHit, TeamPart } from '@/lib/stats-query'
import type { DrillDetail, DrillGame, DrillPlayer, PitchLite } from '@/lib/stats-drill'
import {
  CURRENT_SEASON, DEFAULT_QUERY, FIRST_SEASON, FREE_COLS, GROUPS, GROUP_LABEL, SAMPLE_FIELD, defaultMetric, FREE_HEADLINE, GAME_TYPES, HEADLINE, MATRIX_COLS, PRESETS, PROMPT_GROUPS, SAMPLE,
  extractMatchup, familiesFor, familyFor, familySplits, isStandardMetric, isValidSplit, metricByKey, metricsFor, parseQuery, splitLabel, standardMetricsFor,
  type HitRef, GAMES_KEY, canStack, contribOf, deepGroupLabel, DEEP_GROUP_BY, DEEP_ONLY_FAMILIES, deepSupports, describeDeep, isDeepMetric, type ChartType, type Group, type MetricDef, type QueryState, type Totals, type ViewMode,
} from '@/lib/stats-query-catalog'
import {
  ChartPanel, ChartTypePicker, Chip, CsvButton, Disclosure, Field, Hint, PngButton, QUERY_CSS, Seg, SegBar,
  axisTick, labelStyle, selectStyle, td, tdName, th, tooltipStyle, type ChartRow, type ChartSeries, type ScatterPoint,
} from '@/components/stats/queryUi'
import { AskCard, DeepPanel, OUTPUTS, OutputBar, type Output } from '@/components/stats/queryOutput'
import { resolveMatchup } from '@/components/stats/queryWho'
import HelpBar from '@/components/stats/queryHelp'
import { HitMatchPanel, type HitSearch } from '@/components/stats/queryHit'
import { Avatar, ExpandBtn, GameDetailRow, NoteRow, RecentList, drillUrl, subCell, subHead, useDrill, type DrillQs } from '@/components/stats/queryDrill'
import { ProLockBar } from '@/components/stats/queryUi'

// "Group by" entries that map 1:1 onto a view. Filter families are appended at runtime
// and all map onto the 'breakdown' view.
const VIEWS: { key: ViewMode; label: string; blurb: string }[] = [
  { key: 'summary', label: 'Overall', blurb: 'Every metric for one slice' },
  { key: 'trend', label: 'Season', blurb: 'How the number moved year to year' },
  { key: 'compare', label: 'Compare years', blurb: 'Line up hand-picked seasons against a base year' },
  { key: 'teams', label: 'Team', blurb: 'All 30 clubs for this slice' },
  { key: 'players', label: 'Player', blurb: 'Leaders for this slice' },
]

const DEFAULT_CHART: Record<ViewMode, ChartType> = {
  summary: 'bar', breakdown: 'bar', trend: 'line', compare: 'bar', teams: 'bar', players: 'hbar', recent: 'bar',
}
const BASE_COLOR = C.orange
const OTHER_COLOR = '#c9c2b0'

const SEASON_OPTIONS = Array.from({ length: CURRENT_SEASON - FIRST_SEASON + 1 }, (_, i) => CURRENT_SEASON - i)
const QUICK_YEARS = SEASON_OPTIONS.slice(0, 14)

const param = (q: QueryState) => {
  const p = new URLSearchParams()
  p.set('group', q.group); p.set('gameType', q.gameType); p.set('from', String(q.from)); p.set('to', String(q.to))
  p.set('view', q.view); p.set('metric', q.metric); p.set('family', q.family); p.set('minSample', String(q.minSample))
  if (q.split) p.set('split', q.split)
  if (q.view === 'compare') p.set('years', q.years.join(','))
  if (q.deep) p.set('deep', JSON.stringify(q.deep))
  if (q.teams) p.set('teams', '1')
  return p
}

function fromSearch(search: string): Partial<QueryState> {
  const p = new URLSearchParams(search)
  if (!p.has('q_group')) return {}
  const out: Partial<QueryState> = {}
  const gp = p.get('q_group')
  const group: Group = gp === 'pitching' || gp === 'fielding' ? gp : 'hitting'
  out.group = group
  const gt = p.get('q_gt'); if (gt && GAME_TYPES.some(g => g.key === gt)) out.gameType = gt
  const from = Number(p.get('q_from')), to = Number(p.get('q_to'))
  if (from >= FIRST_SEASON && from <= CURRENT_SEASON) out.from = from
  if (to >= FIRST_SEASON && to <= CURRENT_SEASON) out.to = to
  const split = p.get('q_split'); if (split && isValidSplit(split, group)) out.split = split
  const fam = p.get('q_family'); if (fam && familyFor(fam)) out.family = fam
  const m = p.get('q_metric'); if (m && metricByKey(m)?.group === group) out.metric = m
  const v = p.get('q_view') as ViewMode | null; if (v && (VIEWS.some(x => x.key === v) || v === 'breakdown' || v === 'recent')) out.view = v
  const ys = (p.get('q_years') ?? '').split(',').map(Number).filter(y => y >= FIRST_SEASON && y <= CURRENT_SEASON)
  if (ys.length) out.years = [...new Set(ys)].slice(0, 12)
  try {
    const d = p.get('q_deep')
    if (d) { const parsed = JSON.parse(d); if (parsed && Array.isArray(parsed.stack)) out.deep = parsed }
  } catch { /* bad deep param — ignore */ }
  return out
}

function toSearch(q: QueryState): string {
  const p = new URLSearchParams()
  p.set('q_group', q.group); p.set('q_gt', q.gameType); p.set('q_from', String(q.from)); p.set('q_to', String(q.to))
  p.set('q_view', q.view); p.set('q_metric', q.metric); p.set('q_family', q.family)
  if (q.split) p.set('q_split', q.split)
  if (q.view === 'compare') p.set('q_years', q.years.join(','))
  if (q.deep) p.set('q_deep', JSON.stringify(q.deep))
  return p.toString()
}

const val = (t: Totals | null | undefined, key: string, lg?: Totals | null): number | null => {
  const m = metricByKey(key)
  if (!t || !m) return null
  const v = m.compute(t, lg ?? undefined)
  return v != null && Number.isFinite(v) ? v : null
}
const show = (m: MetricDef, v: number | null) => (v == null ? '—' : m.fmt(v))
const signed = (m: MetricDef, d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${m.fmt(Math.abs(d))}`

function sampleOf(group: Group, t: Totals | null | undefined): number {
  return t ? t[SAMPLE_FIELD[group]] ?? 0 : 0
}

function describe(q: QueryState): string {
  const gt = GAME_TYPES.find(g => g.key === q.gameType)?.label ?? q.gameType
  const yrs = q.view === 'compare'
    ? q.years.join(' vs ')
    : q.from === q.to ? String(q.from) : `${Math.min(q.from, q.to)}–${Math.max(q.from, q.to)}`
  const sit = q.deep ? describeDeep(q.deep).join(' + ') : q.split ? splitLabel(q.split) : ''
  return `${gt} · ${yrs} · ${GROUP_LABEL[q.group]}${sit ? ` · ${sit}` : ''}`
}

function SmallSample({ group, t }: { group: Group; t: Totals | null | undefined }) {
  const n = sampleOf(group, t)
  if (!t || n >= SAMPLE[group].min) return null
  return <span title={`Fewer than ${SAMPLE[group].min} ${SAMPLE[group].label}`} style={{ marginLeft: 6, fontFamily: MONO, fontSize: 9, color: C.bad }}>small sample</span>
}

function heat(norm: number): string {
  return `rgba(255,87,34,${(0.04 + 0.34 * Math.max(0, Math.min(1, norm))).toFixed(3)})`
}

/** Everything a view needs, bundled so each view takes one prop. */
type Ctx = {
  q: QueryState
  data: QueryResult
  metric: MetricDef
  xMetric: MetricDef
  colKeys: string[]
  isPro: boolean
  chartType: ChartType
  /** what the person asked to see — views render only the matching parts */
  output: Output
  show: { tiles: boolean; chart: boolean; table: boolean }
  /** break each number down by club (Pro) */
  byTeam: boolean
  /** data labels on bars / points */
  labels: boolean
  /** club abbreviation → logo as a data URI (so it also survives PNG export) */
  logos: Record<string, string>
  /** ranked tables (teams / players): how the person asked for them to be sorted and how many rows to show */
  sort: { key: string | null; asc: boolean | null; limit: number }
}

function Gate({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <>{children}</> : null
}

/** Table columns: Games first (not in stacked-filter mode — plate-appearance rows have no game count), then the chosen metrics. */
function tableCols(ctx: Ctx): string[] {
  const g = GAMES_KEY[ctx.q.group]
  return ctx.q.deep || ctx.colKeys.includes(g) ? ctx.colKeys : [g, ...ctx.colKeys]
}

const TEAM_PALETTE = ['#FF5722', '#4C7EF3', '#1D9E75', '#E0B84A', '#9b7ede', '#D4533B', '#5FBF9B', '#d98a6b']

/** Stacked-by-club chart data: each club's contribution to the row's value; the stack adds up to the row's number. */
function stackFrom(
  items: { name: string; totals: Totals | null; teams?: TeamPart[] }[], metric: MetricDef, logos: Record<string, string>, maxTeams = 8,
): { data: ChartRow[]; series: ChartSeries[] } | null {
  if (!canStack(metric.key) || !items.some(i => i.teams?.length)) return null
  const weight = new Map<string, number>()
  for (const it of items) {
    if (!it.totals) continue
    for (const t of it.teams ?? []) { const k = t.abbr || t.name; weight.set(k, (weight.get(k) ?? 0) + Math.abs(contribOf(metric.key, t.totals, it.totals) ?? 0)) }
  }
  const top = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTeams).map(e => e[0])
  const data: ChartRow[] = items.map(it => {
    const row: ChartRow = { name: it.name }
    let total = 0, other = 0
    for (const t of it.teams ?? []) {
      const c = it.totals ? contribOf(metric.key, t.totals, it.totals) : null
      if (c == null) continue
      total += c
      const k = t.abbr || t.name
      if (top.includes(k)) row[k] = c; else other += c
    }
    row.other = other
    row.total = total
    return row
  })
  const series: ChartSeries[] = [
    ...top.map((abbr, i) => {
      const club = MLB_TEAMS.find(t => t.abbrev === abbr)
      // Club primary colour; a fallback palette colour for franchises we have no colour for.
      return { key: abbr, name: abbr, color: club?.primary_color ?? TEAM_PALETTE[i % TEAM_PALETTE.length], logo: logos[abbr] }
    }),
    { key: 'other', name: 'All other clubs', color: '#c9c2b0' },
  ]
  return { data, series }
}
const stackType = (t: ChartType): ChartType => (t === 'bar' || t === 'hbar' || t === 'area' ? t : 'bar')

/** Club-by-club rows under an expanded table row. Values use the parent row's totals as the league (matters for FIP). */
function TeamSubRows({ parts, parent, cols, group, sampleCol = false }: { parts: TeamPart[]; parent: Totals | null; cols: MetricDef[]; group: Group; sampleCol?: boolean }) {
  const total = parts.reduce((a, t) => a + sampleOf(group, t.totals), 0)
  const sorted = [...parts].sort((a, b) => sampleOf(group, b.totals) - sampleOf(group, a.totals))
  return (
    <>
      {sorted.map(t => (
        <tr key={t.abbr} style={{ background: '#faf8f3', borderBottom: `1px solid ${C.soft}` }}>
          <td style={{ ...tdName, paddingLeft: 30, fontWeight: 600, color: C.mute }}>
            {t.abbr || t.name}
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginLeft: 6 }}>{total > 0 ? `${((sampleOf(group, t.totals) / total) * 100).toFixed(0)}% of ${SAMPLE[group].label}` : ''}</span>
          </td>
          {sampleCol && <td style={{ ...td, color: C.mute }}>{sampleOf(group, t.totals).toLocaleString()}</td>}
          {cols.map(m => <td key={m.key} style={{ ...td, color: C.mute }}>{show(m, val(t.totals, m.key, parent))}</td>)}
        </tr>
      ))}
    </>
  )
}

function scatterOf(items: { name: string; totals: Totals | null; league: Totals | null }[], x: MetricDef, y: MetricDef): ScatterPoint[] {
  const out: ScatterPoint[] = []
  for (const it of items) {
    const xv = val(it.totals, x.key, it.league), yv = val(it.totals, y.key, it.league)
    if (xv != null && yv != null) out.push({ name: it.name, x: xv, y: yv })
  }
  return out
}

// ── main component ──────────────────────────────────────────────────────

export default function StatsQueryLab({ isPro }: { isPro: boolean }) {
  const [q, setQ] = useState<QueryState>(DEFAULT_QUERY)
  const [text, setText] = useState('')
  const [understood, setUnderstood] = useState<string[]>([])
  const [data, setData] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string[]>([defaultMetric('hitting')])
  const [output, setOutput] = useState<Output>('table')
  const [askOpen, setAskOpen] = useState(false)
  const [deepPreview, setDeepPreview] = useState(false)
  const [mode, setMode] = useState<'simple' | 'pro'>('simple')   // Simple = a question box and a few basics; Pro = every filter, grouped
  const [labels, setLabels] = useState(true)
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean | null>(null)
  const [rowLimit, setRowLimit] = useState(25)
  const [epoch, setEpoch] = useState(0)
  const [hitRef, setHitRef] = useState<{ ref: HitRef; who: string } | null>(null)   // a hit picked for "find hits like this"
  const [deepProgress, setDeepProgress] = useState<{ done: number; total: number } | null>(null)
  const [tick, setTick] = useState(0)   // bumps to ask again while Savant days are still being pulled
  const [openFam, setOpenFam] = useState('inning')
  const [chartPick, setChartPick] = useState<ChartType | null>(null)
  const [xKey, setXKey] = useState<string>('slg')
  const exportRef = useRef<HTMLDivElement>(null)

  // Club logos, fetched once through the allow-listed image proxy as data URIs (cross-origin images would
  // otherwise come out blank in the PNG export). Only needed while breaking numbers down by club.
  useEffect(() => {
    if (!isPro || !q.teams || !data) return
    const abbrs = new Set<string>()
    for (const r of data.breakdown ?? []) for (const t of r.teams ?? []) if (t.abbr) abbrs.add(t.abbr)
    for (const r of data.bySeason ?? []) for (const t of r.teams ?? []) if (t.abbr) abbrs.add(t.abbr)
    for (const t of data.leagueTeams ?? []) if (t.abbr) abbrs.add(t.abbr)
    const missing = [...abbrs].filter(a => !logos[a])
    if (!missing.length) return
    let cancelled = false
    ;(async () => {
      const got: Record<string, string> = {}
      await Promise.all(missing.map(async abbr => {
        const club = MLB_TEAMS.find(t => t.abbrev === abbr)
        if (!club) return
        try {
          const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(teamLogo(club.id))}`)
          const j = await res.json()
          if (j?.dataUri) got[abbr] = j.dataUri as string
        } catch { /* a missing logo just means a plain colour swatch */ }
      }))
      if (!cancelled && Object.keys(got).length) setLogos(prev => ({ ...prev, ...got }))
    })()
    return () => { cancelled = true }
  }, [data, q.teams, isPro, logos])

  const clampMetric = useCallback((group: Group, key: string): string => {
    const m = metricByKey(key)
    if (m && m.group === group && (isPro || isStandardMetric(key))) return key
    return defaultMetric(group)
  }, [isPro])

  // Restore a shared link once, on mount.
  useEffect(() => {
    try {
      const fromUrl = fromSearch(window.location.search)
      if (Object.keys(fromUrl).length) {
        const group = fromUrl.group ?? 'hitting'
        const metricKey = clampMetric(group, fromUrl.metric ?? defaultMetric(group))
        setQ(prev => ({ ...prev, ...fromUrl, metric: metricKey }))
        setChosen([metricKey])
        if (fromUrl.view === 'breakdown' && fromUrl.family) setOpenFam(fromUrl.family)
      }
    } catch { /* URL unreadable — defaults are fine */ }
  }, [clampMetric])

  // Fetch whenever the query changes (debounced; earlier request aborted).
  useEffect(() => {
    const ctrl = new AbortController()
    let retry: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(async () => {
      setLoading(true); setErr(null)
      try {
        const res = await fetch(`/api/stats/query?${param(q).toString()}`, { signal: ctrl.signal })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)
        // Stacked filters pull Baseball Savant a batch of game days at a time: show progress and ask again.
        if (json.loading) {
          setDeepProgress(json.loading as { done: number; total: number })
          retry = setTimeout(() => setTick(n => n + 1), 250)
          return
        }
        setDeepProgress(null)
        setData(json as QueryResult)
        try {
          const keep = new URLSearchParams(window.location.search)
          for (const k of [...keep.keys()]) if (k.startsWith('q_')) keep.delete(k)
          const merged = new URLSearchParams([...keep.entries(), ...new URLSearchParams(toSearch(q)).entries()])
          window.history.replaceState(null, '', `${window.location.pathname}?${merged.toString()}`)
        } catch { /* history unavailable */ }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setErr((e as Error).message); setData(null); setDeepProgress(null) }
      } finally {
        if (!ctrl.signal.aborted && !retry) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(t); if (retry) clearTimeout(retry); ctrl.abort() }
  }, [q, tick])

  useEffect(() => {
    setXKey(q.group === 'hitting' ? 'slg' : q.group === 'pitching' ? 'k9' : 'rf9')
  }, [q.group])

  // The first chosen metric drives charts and sorting.
  useEffect(() => {
    const first = chosen.find(k => metricByKey(k)?.group === q.group)
    if (first && first !== q.metric) setQ(prev => ({ ...prev, metric: first }))
  }, [chosen, q.group, q.metric])

  const patch = useCallback((p: Partial<QueryState>) => {
    if (p.view && p.view !== 'breakdown') setChartPick(null)
    if (p.view || p.family) setChartPick(null)
    setQ(prev => {
      const next = { ...prev, ...p }
      if (p.group && p.group !== prev.group) {
        next.metric = defaultMetric(p.group)
        setChosen([defaultMetric(p.group)])
        if (p.group === 'fielding') next.deep = null
        if (next.split && !isValidSplit(next.split, p.group)) next.split = ''
        if (!familiesFor(p.group).some(f => f.key === next.family)) next.family = 'inning'
      }
      if (p.metric) next.metric = clampMetric(next.group, p.metric)
      if (next.deep && next.view === 'breakdown' && !DEEP_GROUP_BY[next.family]) next.view = 'summary'
      if (next.from > next.to) { if (p.from != null) next.to = next.from; else next.from = next.to }
      return next
    })
  }, [clampMetric])

  const runSearch = async (s: string) => {
    // "Bryce Harper vs San Diego": a player and a club are read out first; the rest of the text goes to the normal parser.
    const mu = await resolveMatchup(s)
    const { state, understood: u, metrics } = parseQuery(mu ? mu.rest : s, q)
    const notes = [...(mu?.notes ?? []), ...u]
    if (mu?.who) {
      const stack = state.deep?.stack ?? (state.split ? [state.split] : [])
      state.deep = { ...(state.deep ?? { stack }), stack, who: mu.who }
      state.split = ''
      if (!state.view || state.view === 'summary') state.view = 'summary'
      if (state.from == null) { state.from = CURRENT_SEASON; state.to = CURRENT_SEASON }
      notes.push(...describeDeep({ stack: [], who: mu.who }))
    } else if (!isPro && extractMatchup(s)?.team) {
      notes.push('Player-vs-club searches are a Pro feature')
    }
    const grp = state.group ?? q.group
    if (state.deep && !isPro) {
      notes.push('Stacking filters is a Pro feature — applied the first one only')
      state.split = state.deep.stack[0] ?? ''
      state.deep = null
    }
    let picked = metrics.filter(k => metricByKey(k)?.group === grp)
    const proOnly = picked.filter(k => !isPro && !isStandardMetric(k))
    if (proOnly.length) notes.push(`${proOnly.map(k => metricByKey(k)?.label).join(', ')}: Pro metric — not included`)
    picked = picked.filter(k => isPro || isStandardMetric(k))
    if (state.deep) picked = picked.filter(k => isDeepMetric(k, grp))
    state.metric = picked[0] ?? clampMetric(grp, state.metric ?? defaultMetric(grp))
    setUnderstood(notes)
    setChosen(picked.length ? picked : [state.metric])
    if (state.view === 'recent' && !isPro) {
      notes.push('The last-happened finder is a Pro feature — showing the overall numbers')
      state.view = 'summary'
    }
    setOutput('table')
    setAskOpen(state.view !== 'recent')   // the finder is a list of occurrences — nothing to choose first
    setChartPick(null)
    if (state.deep) setDeepPreview(true)
    setQ(prev => {
      const merged = { ...prev, ...state }
      if (state.deep === undefined && state.split === undefined) { merged.split = ''; merged.deep = null }
      return merged
    })
  }

  const isAvailable = (key: string) => {
    const m = metricByKey(key)
    return !!m && m.group === q.group && (isPro || isStandardMetric(key)) && (!q.deep || isDeepMetric(key, q.group))
  }
  const availMetrics = metricsFor(q.group).filter(m => isAvailable(m.key))
  const metric = metricByKey(q.metric) ?? availMetrics[0]
  const xMetric = metricByKey(xKey) && metricByKey(xKey)!.group === q.group ? metricByKey(xKey)! : availMetrics[0]
  const families = familiesFor(q.group)
  const deepFamilies = [...families.filter(f => DEEP_GROUP_BY[f.key]), ...DEEP_ONLY_FAMILIES]
  // Situation chips: only real MLB situation codes (fielding's position family is a grouping, not a filter).
  const situationFamilies = families.filter(f => f.key !== 'fieldpos')
  const colKeys = chosen.filter(isAvailable)
  const effectiveChart: ChartType = isPro && chartPick ? chartPick : (q.view === 'breakdown' && q.family === 'inning' ? 'line' : DEFAULT_CHART[q.view])

  const groupByItems: { id: string; label: string; blurb: string; apply: () => void }[] = [
    ...VIEWS.map(v => ({ id: v.key as string, label: v.label, blurb: v.blurb, apply: () => { patch({ view: v.key }); if (v.key === 'teams' || v.key === 'players') { setSortKey(null); setSortAsc(null); setAskOpen(true) } } })),
    ...(q.deep ? deepFamilies : families).map(f => ({ id: `fam:${f.key}`, label: f.label, blurb: `Compare every ${f.label.toLowerCase()} option`, apply: () => { setOpenFam(f.key); patch({ view: 'breakdown', family: f.key, split: '' }) } })),
  ]
  if (isPro) groupByItems.push({ id: 'recent', label: 'Last happened', blurb: 'The most recent times this situation came up — click one to open the game', apply: () => patch({ view: 'recent' }) })
  const activeGroupBy = q.view === 'breakdown' ? `fam:${q.family}` : q.view

  // 'Just the answer' only makes sense for a single overall number; any expanded grouping shows the table.
  const effOut: Output = output === 'answer' && q.view !== 'summary' ? 'table' : output
  const vis = { tiles: effOut === 'answer' || effOut === 'full', chart: effOut === 'chart' || effOut === 'full', table: effOut === 'table' || effOut === 'full' }
  const ctx: Ctx | null = data ? { q, data, metric, xMetric, colKeys, isPro, chartType: effectiveChart, output: effOut, show: vis, byTeam: isPro && q.teams, labels, logos, sort: { key: sortKey, asc: sortAsc, limit: rowLimit } } : null
  const chartable = q.view !== 'summary' && vis.chart
  const engineDeep = !!q.deep || deepPreview
  const setEngine = (deep: boolean) => {
    setDeepPreview(deep)
    if (!deep) { patch({ deep: null }); return }
    if (!isPro) return
    const carry = q.split && deepSupports(q.split, q.group) ? [q.split] : []
    setChosen(prev => { const ok = prev.filter(k => isDeepMetric(k, q.group)); return ok.length ? ok : [defaultMetric(q.group)] })
    patch({ deep: { stack: carry }, split: '' })
  }
  const switchMode = (m: 'simple' | 'pro') => {
    setMode(m)
    // The grouped filters all live on the stacked engine, so Pro viewers start on it.
    if (m === 'pro' && isPro && q.group !== 'fielding' && !engineDeep) setEngine(true)
  }
  const grouped = mode === 'pro' && isPro && q.group !== 'fielding'
  type Fam = NonNullable<ReturnType<typeof familyFor>>
  const famsOf = (...keys: string[]) => keys.map(k => familyFor(k)).filter((f): f is Fam => !!f)
  const deepNow = q.deep ?? { stack: [] }
  const coverageNote = data?.engine === 'deep' && data.coverage
    ? (data.coverage.length
        ? 'From Baseball Savant: ' + data.coverage.map(c => `${c.season} ${c.type} (${c.pas.toLocaleString()} plate appearances, ${c.first} → ${c.last})`).join(' · ')
        : 'No plate appearances found for this range yet.')
    : undefined

  const toggleYear = (y: number) => {
    const has = q.years.includes(y)
    if (has && q.years.length === 1) return
    if (!has && q.years.length >= 12) return
    patch({ years: has ? q.years.filter(v => v !== y) : [...q.years, y] })
  }
  const setBase = (y: number) => patch({ years: [y, ...q.years.filter(v => v !== y)] })

  const tryExample = (t: string) => { setText(t); void runSearch(t); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="ql-shell" style={{ fontFamily: SANS, color: C.ink }}>
      <style>{QUERY_CSS}</style>
      <div style={{ minWidth: 0 }}>

      {/* Search — a question box first, with prompts grouped by what you are curious about */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '20px 20px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', marginBottom: 2 }}>What do you want to know?</div>
          <div role="group" aria-label="Search mode" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 999, padding: 3 }}>
            {(['simple', 'pro'] as const).map(m => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}
                style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 999, background: mode === m ? C.ink : 'transparent', color: mode === m ? '#fff' : C.mute }}>
                {m === 'simple' ? 'Simple' : 'Pro filters'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: '#5b5347', marginBottom: 12 }}>
          Ask it the way you’d say it — a player, a club, a situation, a year. We’ll turn it into filters you can adjust below.
        </div>
        <form onSubmit={e => { e.preventDefault(); void runSearch(text) }} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={text} onChange={e => setText(e.target.value)}
            placeholder='Try "Bryce Harper vs San Diego" or "ERA with runners in scoring position"'
            aria-label="Search the stats"
            style={{ ...selectStyle, padding: '14px 16px', fontSize: 16, flex: 1, borderRadius: 10 }}
          />
          <button type="submit" style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, padding: '0 24px', border: 'none', borderRadius: 10, background: C.orange, color: '#fff', cursor: 'pointer' }}>
            Search
          </button>
        </form>
        <div className="ql-prompts" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
          {PROMPT_GROUPS.map(g => (
            <div key={g.title}>
              <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>
                {g.title}{g.pro && <span style={{ marginLeft: 6, background: C.yellow, color: C.ink, padding: '1px 5px', borderRadius: 3, letterSpacing: '.06em' }}>PRO</span>}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: '2px 0 6px' }}>{g.blurb}</div>
              <div style={{ display: 'grid', gap: 5 }}>
                {g.prompts.map(p => (
                  <button key={p.label} type="button" onClick={() => { setText(p.text); void runSearch(p.text) }}
                    style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, textAlign: 'left', padding: '8px 11px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.cream, color: C.ink, cursor: 'pointer' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {understood.length > 0 && (
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.mute, marginTop: 12 }}>
            <b style={{ color: C.ink }}>Understood:</b> {understood.join(' · ')}
          </div>
        )}
      </div>

      {hitRef && (
        <div style={{ marginBottom: 14 }}>
          <HitMatchPanel hitRef={hitRef.ref} who={hitRef.who} onClose={() => setHitRef(null)}
            onRun={({ hit, events }: HitSearch) => {
              setDeepPreview(true); setAskOpen(false); setChartPick(null)
              patch({ deep: { stack: [], hit, events, who: q.deep?.who }, view: 'recent', split: '' })
              setUnderstood([`hits like ${hitRef.who}'s: ${describeDeep({ stack: [], hit, events }).join(' · ')}`])
              setHitRef(null)
            }} />
        </div>
      )}

      {askOpen && (
        <AskCard output={output} onOutput={setOutput} chosen={chosen.filter(isAvailable)} onChosen={setChosen} group={q.group} isPro={isPro}
          available={isAvailable} heard={[describe(q)]} onShow={() => { setAskOpen(false); setEpoch(e => e + 1) }}
          ranked={q.view === 'teams' || q.view === 'players' ? {
            sortKey, sortAsc, limit: rowLimit, noun: q.view === 'teams' ? 'clubs' : 'players',
            onSort: (k, a) => { setSortKey(k); setSortAsc(a) }, onLimit: setRowLimit,
          } : undefined} />
      )}

      <div style={{ display: askOpen ? 'none' : 'block' }}>
      {/* The three things almost every question needs — always visible */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', alignItems: 'end' }}>
          <Field label="Side of the ball" hint="Batting looks at hitters, Pitching at pitchers, Fielding at defense (errors, putouts, fielding %).">
            <Seg<Group> value={q.group} onChange={v => patch({ group: v })} options={GROUPS} />
          </Field>
          <Field label="Games" hint="Regular season, or any postseason round — or all postseason rounds together.">
            <select style={selectStyle} value={q.gameType} onChange={e => patch({ gameType: e.target.value })}>
              {GAME_TYPES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </Field>
          {q.view !== 'compare' && (
            <>
              <Field label="From year" hint="First season to include. Choose the same year in both boxes for a single season.">
                <select style={selectStyle} value={q.from} onChange={e => patch({ from: Number(e.target.value) })}>
                  {SEASON_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="To year">
                <select style={selectStyle} value={q.to} onChange={e => patch({ to: Number(e.target.value) })}>
                  {SEASON_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
            </>
          )}
          {q.view === 'players' && (
            <Field label={`Minimum ${SAMPLE[q.group].label}`} hint="Hides players with too small a sample to mean much.">
              <input type="number" min={1} max={1000} style={selectStyle} value={q.minSample}
                onChange={e => patch({ minSample: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
            </Field>
          )}
        </div>

        {q.view === 'compare' && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.soft}` }}>
            <div style={{ ...labelStyle, display: 'flex', gap: 6, alignItems: 'center' }}>Years to compare <Hint text="Choose any seasons. The ★ year is the base — every other year is measured against it. Years are never added together." /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '6px 0' }}>
              {[...new Set([...q.years, ...QUICK_YEARS])].sort((a, b) => b - a).map(y => (
                <Chip key={y} on={q.years.includes(y)} onClick={() => toggleYear(y)}>{y}{y === q.years[0] ? ' ★' : ''}</Chip>
              ))}
              <select aria-label="Include an older season" style={{ ...selectStyle, width: 'auto', padding: '4px 8px', fontSize: 12.5 }} value=""
                onChange={e => { if (e.target.value) toggleYear(Number(e.target.value)) }}>
                <option value="">+ older</option>
                {SEASON_OPTIONS.filter(y => !QUICK_YEARS.includes(y) && !q.years.includes(y)).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.mute, alignSelf: 'center', marginLeft: 6 }}>Base year</span>
              <select style={{ ...selectStyle, width: 'auto', padding: '4px 8px', fontSize: 12.5 }} value={q.years[0]} onChange={e => setBase(Number(e.target.value))}>
                {q.years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 10, fontFamily: SANS, fontSize: 12.5, color: C.mute }}>
          <span>Looking at: <b style={{ color: C.ink }}>{describe(q)}</b></span>
          <button type="button" onClick={() => { setQ({ ...DEFAULT_QUERY, group: q.group, metric: defaultMetric(q.group) }); setUnderstood([]); setText(''); setChartPick(null) }}
            style={{ all: 'unset', cursor: 'pointer', color: C.mute, textDecoration: 'underline', fontSize: 12 }}>Reset everything</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {mode === 'pro' && grouped && (
          <>
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ ...labelStyle, color: C.orange }}>⊕ Your search, in plain English</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, lineHeight: 1.4, marginTop: 4 }}>{describe(q)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => patch({ deep: { stack: [] } })}
                  style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>Clear filters</button>
              </div>
            </div>
            <Disclosure step="1 ·" title="Who" defaultOpen summary={deepNow.who ? describeDeep({ stack: [], who: deepNow.who }).join(' · ') : 'Any player, any club'}
              hint="Pick a player, a club, or both — for example a hitter against one club's pitching.">
              <DeepPanel parts={['who']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={[]} isPro={isPro} />
              <div style={{ marginTop: 12 }}><DeepPanel parts={['stack']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={famsOf('hand')} isPro={isPro} /></div>
            </Disclosure>
            <Disclosure step="2 ·" title="When" defaultOpen summary={`${GAME_TYPES.find(g => g.key === q.gameType)?.label ?? ''} · ${q.from === q.to ? q.from : `${q.from}–${q.to}`}`}
              hint="Seasons and game type are set in the row above. Home / away and day / night are here.">
              <DeepPanel parts={['stack']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={famsOf('venue')} isPro={isPro} />
            </Disclosure>
            <Disclosure step="3 ·" title="Game situation" summary="Inning, count, outs, runners, score"
              hint="The moment in the game. Choose one option from each group; they all apply together.">
              <div style={{ display: 'grid', gap: 12 }}>
                <DeepPanel parts={['numbers']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={[]} isPro={isPro} />
                <DeepPanel parts={['stack']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={famsOf('inning', 'count', 'outs', 'runners', 'state')} isPro={isPro} />
              </div>
            </Disclosure>
            <Disclosure step="4 ·" title="The pitch" summary="Pitch type, speed, movement, spin — coming with pitch-level data"
              hint="These filters need every pitch stored, not just each plate appearance. They are not available yet, so nothing here changes your search.">
              <Empty>Pitch type, velocity, movement, spin and location filters arrive with pitch-level data.</Empty>
            </Disclosure>
            <Disclosure step="5 ·" title="What happened" summary="Batted ball and result"
              hint="How the ball was hit — exit velocity, launch angle, distance, kind of contact.">
              <DeepPanel parts={['hit']} deep={deepNow} onChange={d => patch({ deep: d })} group={q.group} families={[]} isPro={isPro} coverage={coverageNote} />
            </Disclosure>
            <div style={{ ...labelStyle, margin: '6px 0 0' }}>6 · Show me</div>
          </>
        )}
        {mode === 'pro' && !grouped && (
          <>
        <Disclosure title="Situation" defaultOpen
          summary={engineDeep ? (q.deep && describeDeep(q.deep).length ? describeDeep(q.deep).join(' + ') : 'Stack filters — none chosen yet') : q.split ? splitLabel(q.split) : 'Any situation'}
          hint="The moment in the game — an inning, the count, runners on base, the score… Leave it empty to look at everything."
          right={!engineDeep && q.split ? <button type="button" onClick={() => patch({ split: '' })} style={{ all: 'unset', cursor: 'pointer', color: C.orange, fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>Clear</button> : undefined}>
          <div style={{ display: 'grid', gap: 12 }}>
            {q.group !== 'fielding' && (
              <Field label="How many at once" hint="Quick: one situation at a time, any year — fast. Stack filters: combine as many as you like (7th inning or later AND runners in scoring position AND a 6+ pitch at-bat). Stacking pulls every pitch from Baseball Savant, so the first search is slower.">
                <SegBar<'quick' | 'deep'> value={engineDeep ? 'deep' : 'quick'} onChange={v => setEngine(v === 'deep')}
                  options={[{ key: 'quick', label: 'One situation · quick' }, { key: 'deep', label: 'Stack filters · Pro' }]} />
              </Field>
            )}
            {engineDeep && q.group !== 'fielding' ? (
              <DeepPanel deep={q.deep ?? { stack: [] }} onChange={d => patch({ deep: d })} group={q.group} families={situationFamilies} isPro={isPro} coverage={coverageNote} />
            ) : situationFamilies.length > 0 ? (
              <div>
                <SegBar<string> dense value={openFam} onChange={setOpenFam}
                  options={situationFamilies.map(f => ({ key: f.key, label: f.label, title: f.blurb, mark: !!q.split && familySplits(f, q.group).some(sp => sp.code === q.split) }))} />
                {(() => {
                  const fam = situationFamilies.find(f => f.key === openFam) ?? situationFamilies[0]
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginBottom: 6 }}>{fam.blurb}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {familySplits(fam, q.group).map(sp => (
                          <Chip key={sp.code} on={q.split === sp.code} onClick={() => patch({ split: q.split === sp.code ? '' : sp.code })}>{sp.label}</Chip>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.faint }}>MLB publishes fielding only as season totals, so there are no situations here. Use “Break it down by → Position” to split it up.</div>
            )}
          </div>
        </Disclosure>

          </>
        )}
        {mode === 'pro' && (
          <>
        <div>
          <div style={{ ...labelStyle, display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 6px' }}>
            Break it down by <Hint text="Turns one number into a comparison: by inning, count, season, team, player… Choose “Overall” for a single answer. Open any row (▸) to go deeper." />
          </div>
          <SegBar<string> dense value={activeGroupBy} onChange={id => groupByItems.find(g => g.id === id)?.apply()}
            options={groupByItems.map(g => ({ key: g.id, label: g.label, title: g.blurb }))} />
        </div>

        <Disclosure title="Output & display"
          summary={`${OUTPUTS.find(o => o.key === output)?.label ?? ''} · ${colKeys.map(k => metricByKey(k)?.label).filter(Boolean).join(', ')}${labels ? ' · labels on' : ''}`}
          hint="Choose how to see the result (just the answer, a table, a chart or everything), which stats to show, and whether to print numbers on the bars.">
          <div style={{ display: 'grid', gap: 14 }}>
            <OutputBar output={output} onOutput={setOutput} chosen={colKeys} onChosen={setChosen} group={q.group} isPro={isPro} available={isAvailable} />

            <div data-noexport="1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.soft}`, paddingTop: 12 }}>
              <span style={{ ...labelStyle, marginBottom: 0, marginRight: 4, display: 'flex', gap: 6, alignItems: 'center' }}>Display <Hint text="Data labels print each number on its bar, point or slice. Break down by team splits every number into the clubs that make it up (Pro)." /></span>
              <Chip on={labels} solid onClick={() => setLabels(v => !v)}>Data labels</Chip>
              {isPro && <Chip on={q.teams} solid onClick={() => patch({ teams: !q.teams })}>Break down by team</Chip>}
            </div>
            {isPro ? (
              <div data-noexport="1" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                {chartable ? <ChartTypePicker value={effectiveChart} onChange={setChartPick} /> : <span />}
                <PngButton isPro={isPro} target={exportRef} filename={`edge-stats-${q.view}-${q.gameType}-${q.group}.png`} />
              </div>
            ) : (
              <ProLockBar features={['Last-happened finder & live situations', 'Break down by team', 'Advanced metrics', 'Switch chart type (columns, bars, line, area, donut, radar, scatter)', 'Stack filters', 'PNG export', 'CSV download']} />
            )}
            {isPro && chartable && effectiveChart === 'scatter' && (
              <div data-noexport="1" style={{ maxWidth: 320 }}>
                <Field label="X-axis metric (Y is the first metric)">
                  <select style={selectStyle} value={xMetric.key} onChange={e => setXKey(e.target.value)}>
                    {availMetrics.filter(m => m.kind === 'rate').map(m => <option key={m.key} value={m.key}>{m.label} — {m.full}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
        </Disclosure>

          </>
        )}
        <Link href="/mlb/stats/live" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff', textDecoration: 'none', color: C.ink, fontFamily: SANS }}>
          <span><b>Watching a game right now?</b> <span style={{ color: C.mute }}>See the live situation and find the last time it happened — by year, postseason, club or player.</span></span>
          <span style={{ color: C.orange, fontWeight: 800, whiteSpace: 'nowrap' }}>Live situations →</span>
        </Link>
      </div>
      <div style={{ height: 14 }} />

      {/* Everything inside this frame is what the PNG captures */}
      <div ref={exportRef} style={{ background: C.cream, padding: 4 }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', marginBottom: 12 }}>
          {describe(q)}
          {loading && <span data-noexport="1" style={{ fontFamily: MONO, fontSize: 11, color: C.faint, fontWeight: 400, marginLeft: 10 }}>loading…</span>}
        </div>

        {err && <Empty>{err}</Empty>}
        {deepProgress && (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15 }}>Pulling Baseball Savant — {deepProgress.done} of {deepProgress.total} game days</div>
            <div style={{ height: 8, background: C.soft, borderRadius: 4, margin: '10px 0', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((deepProgress.done / Math.max(1, deepProgress.total)) * 100)}%`, height: '100%', background: C.orange, transition: 'width .3s' }} />
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: C.mute }}>Stacked filters read every pitch of every game in the range. This only happens the first time — finished days are kept, so the next search is instant. A postseason takes about 20 seconds; a full regular season several minutes.</div>
          </div>
        )}
        {!err && !data && loading && !deepProgress && <Empty>Loading league data…</Empty>}
        {!err && ctx && !deepProgress && (
          <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
            {q.view === 'summary' && <SummaryView ctx={ctx} />}
            {q.view === 'breakdown' && <BreakdownView key={q.family} ctx={ctx} onPick={code => patch({ split: code, view: 'summary' })} />}
            {q.view === 'trend' && <TrendView ctx={ctx} />}
            {q.view === 'compare' && <CompareView ctx={ctx} />}
            {q.view === 'teams' && <RankedView key={`t${epoch}`} ctx={ctx} kind="team" />}
            {q.view === 'players' && <RankedView key={`p${epoch}`} ctx={ctx} kind="player" />}
            {q.view === 'recent' && <RecentView ctx={ctx} onFindSimilar={r => { setHitRef({ ref: { ev: r.ev as number, la: r.la, dist: r.dist, bbType: r.bbType, event: r.event }, who: r.batter }); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}
          </div>
        )}

        <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
          The Edge · edgereportdaily.com — Source: MLB Stats API team and player splits. League totals are the sum of all clubs’ counting stats; every rate is recomputed from those totals.
          {' '}FIP uses a constant set so the selection’s league FIP equals its league ERA. Park and era are not adjusted.
        </div>
      </div>
      </div>
      </div>
      <HelpBar onTry={tryExample} />
    </div>
  )
}

// ── Summary ─────────────────────────────────────────────────────────────

const COMPOSITION_COLORS = ['#1D9E75', '#5FBF9B', '#9ADBC0', C.orange, '#4C7EF3', '#8a8275', C.bad, '#d9d3c4']

/** Formatted value of one metric from a totals blob ('—' when it can't be computed). */
function show2(key: string, t: Totals | null | undefined, lg?: Totals | null): string {
  const m = metricByKey(key)
  return m ? show(m, val(t, key, lg)) : '—'
}

function SummaryView({ ctx }: { ctx: Ctx }) {
  const { q, data, isPro, colKeys, show: vis, output, metric: focus, chartType, byTeam, labels } = ctx
  const lg = data.league
  const base = data.baseline
  if (!lg || sampleOf(q.group, lg) === 0) return <Empty>{data.engine === 'deep' ? 'No plate appearances match these stacked filters in the data loaded so far. Loosen a filter or choose other seasons.' : 'MLB has no data for this slice. Try another season, game type or situation.'}</Empty>
  const metrics = isPro ? metricsFor(q.group) : standardMetricsFor(q.group)
  const filtered = !!q.split

  const delta = (m: MetricDef) => {
    const a = val(lg, m.key, lg), b = val(base, m.key, base)
    if (a == null || b == null) return null
    return { a, b, diff: a - b }
  }
  const tableKeys = tableCols(ctx)
  const tiles = (output === 'answer' ? colKeys : (isPro ? HEADLINE : FREE_HEADLINE)[q.group]).map(k => metricByKey(k)!).filter(Boolean)

  const pa = sampleOf(q.group, lg)
  const fielding = q.group === 'fielding'
  let comp: { name: string; v: number }[]
  if (fielding) {
    comp = [{ name: 'Putouts', v: lg.putOuts }, { name: 'Assists', v: lg.assists }, { name: 'Errors', v: lg.errors }].filter(p => p.v > 0)
  } else {
    const singles = lg.hits - lg.doubles - lg.triples - lg.homeRuns
    const parts = [
      { name: 'Single', v: singles }, { name: 'Double', v: lg.doubles }, { name: 'Triple', v: lg.triples }, { name: 'Home run', v: lg.homeRuns },
      { name: 'Walk', v: lg.baseOnBalls }, { name: 'Hit by pitch', v: lg.hitByPitch }, { name: 'Strikeout', v: lg.strikeOuts },
    ]
    const other = Math.max(0, pa - parts.reduce((s, p) => s + p.v, 0))
    comp = [...parts, { name: 'Ball in play out / other', v: other }].filter(p => p.v > 0)
  }

  const diffRows = filtered
    ? metrics.filter(m => m.kind === 'rate').map(m => {
        const d = delta(m); return d && d.b !== 0 ? { name: m.label, pct: ((d.a - d.b) / Math.abs(d.b)) * 100 } : null
      }).filter((x): x is { name: string; pct: number } => !!x).sort((a, b) => b.pct - a.pct)
    : []

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Gate on={vis.tiles}>
      <div className="ql-tiles">
        {tiles.map(m => {
          const d = delta(m)
          const sub = !filtered || !d
            ? `${pa.toLocaleString()} ${SAMPLE[q.group].label}`
            : m.kind === 'count'
              ? `${((d.a / (d.b || 1)) * 100).toFixed(1)}% of overall`
              : `overall ${m.fmt(d.b)}`
          return <Tile key={m.key} label={m.full} value={show(m, val(lg, m.key, lg))} sub={sub} />
        })}
      </div>
      </Gate>

      <Gate on={vis.chart}>
      <div className="ql-two">
        <Card title={fielding ? 'How chances were handled' : 'How plate appearances ended'} note={`${pa.toLocaleString()} ${SAMPLE[q.group].label} in this slice`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 200, height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={comp} dataKey="v" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={1} stroke="#fff">
                    {comp.map((_, i) => <Cell key={i} fill={COMPOSITION_COLORS[i % COMPOSITION_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [`${Number(v).toLocaleString()} (${((Number(v) / pa) * 100).toFixed(1)}%)`, String(n)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gap: 4, fontSize: 13, minWidth: 180, flex: 1 }}>
              {comp.map((p, i) => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: COMPOSITION_COLORS[i % COMPOSITION_COLORS.length] }} />
                  <span style={{ flex: 1, fontFamily: SANS }}>{p.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12 }}>{((p.v / pa) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {filtered ? (
          <Card title="This slice vs overall" note="Percent difference, rate stats only">
            {diffRows.length === 0 ? <Empty>No baseline to compare against.</Empty> : (
              <div style={{ height: Math.max(200, diffRows.length * 22) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diffRows} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} stroke="#f1eee6" />
                    <XAxis type="number" tick={axisTick} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={axisTick} width={64} />
                    <ReferenceLine x={0} stroke={C.ink} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`} />
                    <Bar dataKey="pct" radius={3}>
                      {diffRows.map((r, i) => <Cell key={i} fill={r.pct >= 0 ? C.orange : '#4C7EF3'} />)}
                      {labels && <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`} style={{ fontSize: 10 }} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        ) : (
          <Card title="Counting totals" note="Everything summed across all clubs">
            <div style={{ display: 'grid', gap: 6 }}>
              {metrics.filter(m => m.kind === 'count').slice(0, 10).map(m => (
                <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.soft}`, padding: '4px 0', fontSize: 13 }}>
                  <span>{m.full}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{show(m, val(lg, m.key, lg))}</b>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      </Gate>

      <Gate on={output === 'table'}>
        <Card title="Result" note={`${pa.toLocaleString()} ${SAMPLE[q.group].label} in this slice`}>
          <div style={{ textAlign: 'right', marginBottom: 6 }}>
            <CsvButton isPro={isPro} filename={`edge-result-${q.gameType}-${q.from}-${q.to}.csv`} headers={['Row', ...tableKeys.map(k => metricByKey(k)!.label)]}
              rows={[[filtered ? (q.deep ? describeDeep(q.deep).join(' + ') : splitLabel(q.split)) : 'League total', ...tableKeys.map(k => show2(k, lg, lg))], ...(filtered ? [['All situations', ...tableKeys.map(k => show2(k, base, base))]] : [])]} />
          </div>
          <div className="ql-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left' }}>Row</th>{tableKeys.map(k => <th key={k} style={th} title={metricByKey(k)?.full}>{metricByKey(k)?.label}</th>)}</tr></thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${C.soft}` }}>
                  <td style={tdName}>{filtered ? (q.deep ? describeDeep(q.deep).join(' + ') : splitLabel(q.split)) : 'League total'}</td>
                  {tableKeys.map((k, i) => <td key={k} style={{ ...td, fontWeight: i === 0 ? 800 : 400, fontSize: i === 0 ? 14 : 12 }}>{show2(k, lg, lg)}</td>)}
                </tr>
                {filtered && (
                  <tr>
                    <td style={{ ...tdName, color: C.mute }}>All situations</td>
                    {tableKeys.map(k => <td key={k} style={{ ...td, color: C.mute }}>{show2(k, base, base)}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginTop: 10 }}>Expand this table with the “Group results by” buttons — Team, Season, Player, or any situation.</div>
        </Card>
      </Gate>

      {byTeam && data.leagueTeams && data.leagueTeams.length > 0 && (() => {
        const parts = data.leagueTeams!
        const stackable = canStack(focus.key)
        const rowsT = parts.map(t => ({
          t, v: stackable ? contribOf(focus.key, t.totals, lg) : val(t.totals, focus.key, lg),
        })).filter(x => x.v != null).sort((a, b) => (b.v as number) - (a.v as number))
        const chartT: ChartRow[] = rowsT.map(x => ({ name: x.t.abbr || x.t.name, full: x.t.name, v: x.v as number }))
        const total = parts.reduce((a, t) => a + sampleOf(q.group, t.totals), 0)
        const tcols = tableKeys.map(k => metricByKey(k)!).filter(Boolean)
        return (
          <>
            <Gate on={vis.chart}>
              <Card title={`How the league ${focus.full} is made up`}
                note={stackable ? `Each club's contribution — together they sum to ${show(focus, val(lg, focus.key, lg))}.` : `${focus.label} can't be split into pieces that sum to the whole, so each club's own number is shown.`}>
                <ChartPanel type={chartType === 'hbar' || chartType === 'bar' ? chartType : 'hbar'} data={chartT} series={[{ key: 'v', name: focus.label, color: C.orange }]} fmt={focus.fmt}
                  labels={labels} refValue={stackable ? null : val(lg, focus.key, lg)} refLabel="league" height={Math.max(300, chartT.length * 22 + 40)} />
              </Card>
            </Gate>
            <Gate on={vis.table}>
              <Card title="Club by club" note="Each club's own numbers, with its share of the sample.">
                <div className="ql-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={{ ...th, textAlign: 'left' }}>Club</th><th style={th}>Share</th>{tcols.map(m => <th key={m.key} style={th} title={m.full}>{m.label}</th>)}</tr></thead>
                    <tbody>
                      {[...parts].sort((a, b) => sampleOf(q.group, b.totals) - sampleOf(q.group, a.totals)).map(t => (
                        <tr key={t.abbr || t.name} style={{ borderBottom: `1px solid ${C.soft}` }}>
                          <td style={tdName}>{t.abbr || t.name}<SmallSample group={q.group} t={t.totals} /></td>
                          <td style={td}>{total > 0 ? `${((sampleOf(q.group, t.totals) / total) * 100).toFixed(1)}%` : '—'}</td>
                          {tcols.map(m => <td key={m.key} style={td}>{show(m, val(t.totals, m.key, lg))}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Gate>
          </>
        )
      })()}

      <Gate on={output === 'full'}>
      <Card title={isPro ? 'Every metric' : 'Standard stats'} note={filtered ? 'Slice, overall, and the difference' : 'League totals for the selection'}>
        <div style={{ textAlign: 'right', marginBottom: 6 }}>
          <CsvButton isPro={isPro} filename={`edge-summary-${q.gameType}-${q.from}-${q.to}.csv`} headers={['Metric', 'Total', ...(filtered ? ['Overall'] : [])]}
            rows={metrics.map(m => [m.full, show(m, val(lg, m.key, lg)), ...(filtered ? [show(m, val(base, m.key, base))] : [])])} />
        </div>
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Metric</th>
                <th style={th}>{filtered ? splitLabel(q.split) : 'Total'}</th>
                {filtered && <th style={th}>Overall</th>}
                {filtered && <th style={th}>Diff</th>}
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const d = delta(m)
                return (
                  <tr key={m.key} style={{ borderBottom: `1px solid ${C.soft}` }}>
                    <td style={tdName}>{m.full} <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, fontWeight: 400 }}>{m.label}</span></td>
                    <td style={{ ...td, fontWeight: 700 }}>{show(m, val(lg, m.key, lg))}</td>
                    {filtered && <td style={td}>{show(m, d?.b ?? null)}</td>}
                    {filtered && <td style={{ ...td, color: C.mute }}>{d ? (m.kind === 'rate' ? signed(m, d.diff) : '') : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </Gate>
    </div>
  )
}

// ── Breakdown ───────────────────────────────────────────────────────────

const SERIES_COLORS = [C.orange, '#4C7EF3', '#1D9E75', '#8a8275', '#d98a6b']

function BreakdownView({ ctx, onPick }: { ctx: Ctx; onPick: (code: string) => void }) {
  const { q, data, metric, xMetric, colKeys, isPro, chartType, show: vis, byTeam, labels } = ctx
  const [open, setOpen] = useState<string[]>([])   // rows expanded into clubs
  // Which rows to show (empty = all) and which one the others are measured against.
  const [picked, setPicked] = useState<string[]>([])
  const [baseCode, setBaseCode] = useState('')
  const all = (data.breakdown ?? []).filter(r => r.totals && sampleOf(q.group, r.totals) > 0)
  // Innings: show 1st–9th + extras by default (the combined rows like "7th or later" overlap them and
  // would muddy an inning-on-inning line); they stay available as chips.
  const defaults = q.family === 'inning' ? all.filter(r => /^i0[1-9]$|^ix$/.test(r.code)) : []
  const base0 = defaults.length ? defaults : all
  const rows = picked.length ? all.filter(r => picked.includes(r.code)) : base0
  const famLabel = familyFor(q.family)?.label ?? ''
  if (!all.length) return <Empty>MLB has no {famLabel.toLowerCase()} data for this selection.</Empty>

  const base = rows.find(r => r.code === baseCode) ?? null
  const baseVal = val(data.baseline, metric.key, data.baseline)
  const cols = tableCols(ctx).map(k => metricByKey(k)!).filter(Boolean)

  // Chart: every chosen rate metric that shares the first one's number format (AVG/OBP/SLG/OPS together,
  // not AVG against home runs) — otherwise just the first metric.
  const seriesMetrics = chartType === 'pie' || chartType === 'scatter' ? [metric] : cols.filter(m => m.fmt === metric.fmt && m.kind === 'rate').slice(0, 5)
  const plotted = seriesMetrics.length ? seriesMetrics : [metric]
  const multi = plotted.length > 1
  const chart: ChartRow[] = rows.map(r => {
    const row: ChartRow = { name: r.label }
    if (multi) plotted.forEach(m => { row[m.key] = val(r.totals, m.key, data.baseline) })
    else row.v = val(r.totals, metric.key, data.baseline)
    return row
  })
  const series = multi
    ? plotted.map((m, i) => ({ key: m.key, name: m.label, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    : [{ key: 'v', name: metric.label, color: BASE_COLOR }]
  const scatter = scatterOf(rows.map(r => ({ name: r.label, totals: r.totals, league: data.baseline })), xMetric, metric)
  const colRange = cols.map(m => {
    const vs = rows.map(r => val(r.totals, m.key, data.baseline)).filter((x): x is number => x != null)
    return { min: Math.min(...vs), max: Math.max(...vs) }
  })
  const stack = byTeam ? stackFrom(rows.map(r => ({ name: r.label, totals: r.totals, teams: r.teams })), metric, ctx.logos) : null
  const hasTeams = byTeam && rows.some(r => r.teams?.length)
  const togglePick = (code: string) => setPicked(prev => {
    const start = prev.length ? prev : base0.map(r => r.code)   // first click starts from what is currently shown
    return start.includes(code) ? start.filter(c => c !== code) : [...start, code]
  })

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div data-noexport="1" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Compare {famLabel.toLowerCase()}</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>
            {picked.length ? `${picked.length} selected` : defaults.length ? 'each inning shown' : 'all shown'} — choose two or more to line them up
          </span>
          {picked.length > 0 && (
            <button type="button" onClick={() => setPicked([])} style={{ fontFamily: SANS, fontSize: 12, border: 'none', background: 'transparent', color: C.orange, cursor: 'pointer', fontWeight: 700 }}>Reset</button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {all.map(r => <Chip key={r.code} on={picked.length ? picked.includes(r.code) : base0.includes(r)} solid={picked.length > 0} onClick={() => togglePick(r.code)}>{r.label}</Chip>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SANS, fontSize: 13, color: C.mute }}>Measure everything against</span>
          <select style={{ ...selectStyle, width: 'auto' }} value={baseCode} onChange={e => setBaseCode(e.target.value)}>
            <option value="">— nothing (just show values) —</option>
            {rows.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
          {base && <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>Δ = row minus {base.label}. Rate stats only.</span>}
        </div>
      </div>

      <Gate on={vis.chart}>
      <Card title={`${stack ? metric.full : multi ? plotted.map(m => m.label).join(' / ') : metric.full} by ${famLabel.toLowerCase()}`}
        note={stack ? `Each bar is stacked by club — the pieces sum to the overall ${metric.label}.` : byTeam && !canStack(metric.key) ? `${metric.label} can't be split into clubs that sum to the whole (it isn't a simple sum), so the overall is shown.` : !multi && baseVal != null ? `Dashed line = overall ${metric.fmt(baseVal)}${base ? ` · orange = ${base.label}` : ''}` : undefined}>
        <ChartPanel type={stack ? stackType(chartType) : chartType} data={stack ? stack.data : chart} series={stack ? stack.series : series} fmt={metric.fmt}
          stacked={!!stack} labels={labels}
          refValue={multi || stack ? null : baseVal} refLabel="overall" scatter={scatter} xLabel={xMetric.label} yLabel={metric.label}
          pointColor={base && !multi && !stack ? (r => (r.name === base.label ? BASE_COLOR : OTHER_COLOR)) : undefined} />
      </Card>
      </Gate>

      <Gate on={vis.table}>
      <Card title={base ? `${famLabel} vs ${base.label}` : 'Heat table'} note={base ? 'Each cell shows the number and its gap from the base row.' : 'Darker = higher within each column. Click a row for its full summary.'}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
          {hasTeams && (
            <button data-noexport="1" type="button" onClick={() => setOpen(open.length ? [] : rows.map(r => r.code))}
              style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>
              {open.length ? 'Collapse clubs' : 'Expand all by club'}
            </button>
          )}
          <CsvButton isPro={isPro} filename={`edge-${q.family}-${q.gameType}-${q.from}-${q.to}.csv`}
            headers={[famLabel, ...cols.flatMap(m => (base ? [m.label, `${m.label} Δ vs ${base.label}`] : [m.label]))]}
            rows={rows.map(r => [r.label, ...cols.flatMap(m => {
              const v = val(r.totals, m.key, data.baseline), b = base ? val(base.totals, m.key, data.baseline) : null
              return base ? [show(m, v), m.kind === 'rate' && v != null && b != null ? signed(m, v - b) : ''] : [show(m, v)]
            })])} />
        </div>
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>{famLabel}</th>
                {cols.map(m => <th key={m.key} style={th} title={m.full}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isBase = !!base && r.code === base.code
                const isOpen = open.includes(r.code)
                return (
                  <Fragment key={r.code}>
                  <tr onClick={() => onPick(r.code)} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.soft}`, background: isBase ? '#fff1ec' : undefined }}>
                    <td style={tdName}>{r.teams?.length ? <ExpandBtn open={isOpen} onClick={() => setOpen(o => (o.includes(r.code) ? o.filter(c => c !== r.code) : [...o, r.code]))} /> : null}{r.label}{isBase ? ' ★' : ''}<SmallSample group={q.group} t={r.totals} /></td>
                    {cols.map((m, i) => {
                      const v = val(r.totals, m.key, data.baseline)
                      const b = base ? val(base.totals, m.key, data.baseline) : null
                      const d = base && !isBase && m.kind === 'rate' && v != null && b != null ? v - b : null
                      const { min, max } = colRange[i]
                      const norm = v != null && max > min ? (v - min) / (max - min) : 0
                      return (
                        <td key={m.key} style={{ ...td, background: !base && v != null && m.key !== 'pa' && m.key !== 'bf' ? heat(norm) : undefined }}>
                          {show(m, v)}
                          {d != null && <div style={{ fontSize: 10, color: d > 0 ? C.orange : d < 0 ? '#4C7EF3' : C.faint }}>{signed(m, d)}</div>}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && r.teams && <TeamSubRows parts={r.teams} parent={r.totals} cols={cols} group={q.group} />}
                  </Fragment>
                )
              })}
              {data.baseline && !picked.length && !defaults.length && (
                <tr style={{ borderTop: `2px solid ${C.ink}` }}>
                  <td style={{ ...tdName, fontWeight: 800 }}>All situations</td>
                  {cols.map(m => <td key={m.key} style={{ ...td, fontWeight: 700 }}>{show(m, val(data.baseline, m.key, data.baseline))}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </Gate>
    </div>
  )
}

// ── Season trend ────────────────────────────────────────────────────────

function TrendView({ ctx }: { ctx: Ctx }) {
  const { q, data, metric, xMetric, colKeys, isPro, chartType, show: vis, output, byTeam, labels } = ctx
  const [open, setOpen] = useState<string[]>([])
  const rows = (data.bySeason ?? []).filter(r => r.totals && sampleOf(q.group, r.totals) > 0)
  if (!rows.length) return <Empty>MLB has no data for this slice in these seasons.</Empty>
  const filtered = !!q.split
  const stack = byTeam ? stackFrom(rows.map(r => ({ name: String(r.season), totals: r.totals, teams: r.teams })), metric, ctx.logos) : null
  const hasTeams = byTeam && rows.some(r => r.teams?.length)
  const chart: ChartRow[] = rows.map(r => ({
    name: String(r.season),
    slice: val(r.totals, metric.key, r.baseline),
    overall: filtered ? val(r.baseline, metric.key, r.baseline) : null,
  }))
  const series = [
    { key: 'slice', name: q.split ? splitLabel(q.split) : metric.label, color: C.orange },
    ...(filtered ? [{ key: 'overall', name: 'Overall', color: C.mute, dashed: true }] : []),
  ]
  const scatter = scatterOf(rows.map(r => ({ name: String(r.season), totals: r.totals, league: r.baseline })), xMetric, metric)
  const cols = tableCols(ctx).map(k => metricByKey(k)!).filter(Boolean)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Gate on={vis.chart}>
      <Card title={`${metric.full}, season by season`} note={stack ? `Each bar is stacked by club — the pieces sum to the league ${metric.label}.` : byTeam && !canStack(metric.key) ? `${metric.label} can't be split into clubs that sum to the whole, so the overall is shown.` : rows.length < 2 ? 'Widen the season range to see a trend line.' : undefined}>
        <ChartPanel type={stack ? stackType(chartType) : chartType} data={stack ? stack.data : chart} series={stack ? stack.series : series} fmt={metric.fmt}
          stacked={!!stack} labels={labels} scatter={scatter} xLabel={xMetric.label} yLabel={metric.label} height={300} />
      </Card>
      </Gate>
      <Gate on={vis.table}>
      <Card title="Season table">
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
          {hasTeams && (
            <button data-noexport="1" type="button" onClick={() => setOpen(open.length ? [] : rows.map(r => String(r.season)))}
              style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>
              {open.length ? 'Collapse clubs' : 'Expand all by club'}
            </button>
          )}
          <CsvButton isPro={isPro} filename={`edge-seasons-${q.gameType}-${q.split || 'all'}.csv`} headers={['Season', SAMPLE[q.group].label, ...cols.map(m => m.label)]}
            rows={[...rows].reverse().map(r => [r.season, sampleOf(q.group, r.totals), ...cols.map(m => show(m, val(r.totals, m.key, r.baseline)))])} />
        </div>
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Season</th>
                <th style={th}>{SAMPLE[q.group].label}</th>
                {cols.map(m => <th key={m.key} style={th} title={m.full}>{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(r => {
                const key = String(r.season)
                const isOpen = open.includes(key)
                return (
                  <Fragment key={r.season}>
                    <tr style={{ borderBottom: `1px solid ${C.soft}` }}>
                      <td style={tdName}>{r.teams?.length ? <ExpandBtn open={isOpen} onClick={() => setOpen(o => (o.includes(key) ? o.filter(c => c !== key) : [...o, key]))} /> : null}{r.season}<SmallSample group={q.group} t={r.totals} /></td>
                      <td style={td}>{sampleOf(q.group, r.totals).toLocaleString()}</td>
                      {cols.map(m => <td key={m.key} style={td}>{show(m, val(r.totals, m.key, r.baseline))}</td>)}
                    </tr>
                    {isOpen && r.teams && <TeamSubRows parts={r.teams} parent={r.totals} cols={cols} group={q.group} sampleCol />}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </Gate>
    </div>
  )
}

// ── Compare years ───────────────────────────────────────────────────────

function CompareView({ ctx }: { ctx: Ctx }) {
  const { q, data, metric, xMetric, colKeys, isPro, chartType, show: vis, output, byTeam, labels } = ctx
  // Keep the order the person chose: years[0] is the base year.
  const list = q.years
    .map(y => (data.bySeason ?? []).find(s => s.season === y))
    .filter((s): s is NonNullable<typeof s> => !!s)
  const usable = list.filter(s => s.totals && sampleOf(q.group, s.totals) > 0)
  if (!usable.length) return <Empty>MLB has no data for this slice in the selected seasons.</Empty>

  const base = usable.find(s => s.season === q.years[0]) ?? usable[0]
  const others = usable.filter(s => s.season !== base.season)
  const metrics = output === 'full' ? (isPro ? metricsFor(q.group) : standardMetricsFor(q.group)) : tableCols(ctx).map(k => metricByKey(k)!).filter(Boolean)
  const tiles = (output === 'answer' ? colKeys : (isPro ? HEADLINE : FREE_HEADLINE)[q.group]).map(k => metricByKey(k)!).filter(Boolean).slice(0, 8)

  const chart: ChartRow[] = usable.map(s => ({ name: String(s.season), v: val(s.totals, metric.key, s.baseline) }))
  const scatter = scatterOf(usable.map(s => ({ name: String(s.season), totals: s.totals, league: s.baseline })), xMetric, metric)
  const baseVal = val(base.totals, metric.key, base.baseline)
  const stack = byTeam ? stackFrom(usable.map(s => ({ name: String(s.season), totals: s.totals, teams: s.teams })), metric, ctx.logos) : null
  const missing = q.years.filter(y => !usable.some(s => s.season === y))

  const csvHeaders = ['Metric', String(base.season), ...others.flatMap(o => [String(o.season), `Δ vs ${o.season}`])]
  const csvRows = metrics.map(m => [
    m.full, show(m, val(base.totals, m.key, base.baseline)),
    ...others.flatMap(o => {
      const a = val(base.totals, m.key, base.baseline), b = val(o.totals, m.key, o.baseline)
      return [show(m, b), m.kind === 'rate' && a != null && b != null ? signed(m, a - b) : '']
    }),
  ])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {missing.length > 0 && <Empty>No data for {missing.join(', ')} with these filters — left out.</Empty>}

      <Gate on={vis.tiles}>
      <div className="ql-tiles">
        {tiles.map(m => {
          const a = val(base.totals, m.key, base.baseline)
          const sub = others.slice(0, 2).map(o => {
            const b = val(o.totals, m.key, o.baseline)
            return b == null ? `${o.season} —` : `${o.season} ${m.fmt(b)}`
          }).join(' · ')
          return <Tile key={m.key} label={`${base.season} ${m.full}`} value={show(m, a)} sub={sub || undefined} />
        })}
      </div>
      </Gate>

      <Gate on={vis.chart}>
      <Card title={`${metric.full}: ${base.season} vs ${others.length ? others.map(o => o.season).join(', ') : 'other seasons'}`}
        note={`Orange = ${base.season} (base year)${baseVal != null ? ` · dashed line = ${base.season} ${metric.fmt(baseVal)}` : ''}`}>
        <ChartPanel type={stack ? stackType(chartType) : chartType} data={stack ? stack.data : chart} series={stack ? stack.series : [{ key: 'v', name: metric.label, color: BASE_COLOR }]} fmt={metric.fmt}
          stacked={!!stack} labels={labels}
          refValue={stack ? null : baseVal} refLabel={String(base.season)} scatter={scatter} xLabel={xMetric.label} yLabel={metric.label}
          pointColor={stack ? undefined : (r) => (r.name === String(base.season) ? BASE_COLOR : OTHER_COLOR)} />
      </Card>
      </Gate>

      <Gate on={vis.table}>
      <Card title="Side by side" note={`Difference = ${base.season} minus the other year. Counting stats show both totals without a difference (different numbers of games).`}>
        <div style={{ textAlign: 'right', marginBottom: 6 }}>
          <CsvButton isPro={isPro} filename={`edge-compare-${q.gameType}-${q.years.join('-')}.csv`} headers={csvHeaders} rows={csvRows} />
        </div>
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Metric</th>
                <th style={{ ...th, color: C.orange }}>{base.season} ★</th>
                {others.flatMap(o => [
                  <th key={`y${o.season}`} style={th}>{o.season}</th>,
                  <th key={`d${o.season}`} style={th}>Δ</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${C.soft}` }}>
                <td style={tdName}>{SAMPLE[q.group].label} (sample)</td>
                <td style={{ ...td, fontWeight: 700 }}>{sampleOf(q.group, base.totals).toLocaleString()}<SmallSample group={q.group} t={base.totals} /></td>
                {others.flatMap(o => [
                  <td key={`y${o.season}`} style={td}>{sampleOf(q.group, o.totals).toLocaleString()}<SmallSample group={q.group} t={o.totals} /></td>,
                  <td key={`d${o.season}`} style={td} />,
                ])}
              </tr>
              {metrics.map(m => {
                const a = val(base.totals, m.key, base.baseline)
                return (
                  <tr key={m.key} style={{ borderBottom: `1px solid ${C.soft}` }}>
                    <td style={tdName}>{m.full} <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, fontWeight: 400 }}>{m.label}</span></td>
                    <td style={{ ...td, fontWeight: 700 }}>{show(m, a)}</td>
                    {others.flatMap(o => {
                      const b = val(o.totals, m.key, o.baseline)
                      const d = m.kind === 'rate' && a != null && b != null ? a - b : null
                      return [
                        <td key={`y${o.season}`} style={td}>{show(m, b)}</td>,
                        <td key={`d${o.season}`} style={{ ...td, color: d == null ? C.faint : d > 0 ? C.orange : d < 0 ? '#4C7EF3' : C.mute }}>{d == null ? '' : signed(m, d)}</td>,
                      ]
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </Gate>
    </div>
  )
}

// ── Teams & Players ─────────────────────────────────────────────────────

// ── Last happened ───────────────────────────────────────────────────────

function RecentView({ ctx, onFindSimilar }: { ctx: Ctx; onFindSimilar: (r: RecentHit) => void }) {
  return <RecentList rows={ctx.data.recent ?? []} total={ctx.data.recentTotal} deep={!!ctx.q.deep} onFindSimilar={onFindSimilar} hitRef={ctx.q.deep?.hit?.ref} />
}

type RankRow = { id: number; name: string; abbr: string; pos?: string; link?: string; totals: Totals }

/** Player → their games (same columns, one game each); a game opens into its plate appearances / pitches. */
function DrillGames({ playerId, qs, cols, league, key0 }: { playerId: number; qs: DrillQs; cols: MetricDef[]; league: Totals | null; key0: string }) {
  const [open, setOpen] = useState<number[]>([])
  const { loading, error, data } = useDrill<{ rows: DrillGame[] }>(drillUrl('player-games', qs, { playerId }))
  const span = cols.length + 2
  if (loading) return <NoteRow span={span}>Loading games…</NoteRow>
  if (error) return <NoteRow span={span}>{error}</NoteRow>
  if (!data?.rows.length) return <NoteRow span={span}>No games found for this player in the selection.</NoteRow>
  return (
    <>
      {data.rows.map(g => {
        const isOpen = open.includes(g.gamePk)
        const [y, m, d] = g.date.split('-')
        return (
          <Fragment key={`${key0}-${g.gamePk}`}>
            <tr style={{ background: '#faf8f3', borderBottom: `1px solid ${C.soft}` }}>
              <td style={td} />
              <td style={{ ...tdName, paddingLeft: 40, fontWeight: 600, color: C.mute }}>
                <ExpandBtn open={isOpen} onClick={() => setOpen(o => (o.includes(g.gamePk) ? o.filter(x => x !== g.gamePk) : [...o, g.gamePk]))} />
                {`${Number(m)}/${Number(d)}/${y.slice(2)} ${g.isHome ? 'vs' : '@'} ${g.opp}`}
                {g.isWin != null && <span style={{ fontFamily: MONO, fontSize: 9, marginLeft: 6, color: g.isWin ? C.good : C.bad }}>{g.isWin ? 'W' : 'L'}</span>}
              </td>
              {cols.map(c => <td key={c.key} style={{ ...td, color: C.mute }}>{show(c, val(g.totals, c.key, league))}</td>)}
            </tr>
            {isOpen && <GameDetailRow gamePk={g.gamePk} playerId={playerId} group={qs.group} span={span} />}
          </Fragment>
        )
      })}
    </>
  )
}

/** Club → its players (headshot + same columns); each player opens into their games. */
function DrillPlayers({ teamId, qs, cols, league }: { teamId: number; qs: DrillQs; cols: MetricDef[]; league: Totals | null }) {
  const [open, setOpen] = useState<string[]>([])
  const { loading, error, data } = useDrill<{ rows: DrillPlayer[] }>(drillUrl('team-players', qs, { teamId }))
  const span = cols.length + 2
  if (loading) return <NoteRow span={span}>Loading players…</NoteRow>
  if (error) return <NoteRow span={span}>{error}</NoteRow>
  if (!data?.rows.length) return <NoteRow span={span}>No players for this club in the selection.</NoteRow>
  return (
    <>
      {data.rows.map(p => {
        const k = `${p.id}|${p.pos ?? ''}`
        const isOpen = open.includes(k)
        return (
          <Fragment key={k}>
            <tr style={{ background: '#faf8f3', borderBottom: `1px solid ${C.soft}` }}>
              <td style={td} />
              <td style={{ ...tdName, paddingLeft: 24 }}>
                <ExpandBtn open={isOpen} onClick={() => setOpen(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Avatar id={p.id} name={p.name} size={22} />
                  <Link href={`/mlb/players/${p.id}`} style={{ color: C.ink, textDecoration: 'none' }}>{p.name}</Link>
                  {p.pos && <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, fontWeight: 400 }}>{p.pos}</span>}
                </span>
                <SmallSample group={qs.group} t={p.totals} />
              </td>
              {cols.map(c => <td key={c.key} style={td}>{show(c, val(p.totals, c.key, league))}</td>)}
            </tr>
            {isOpen && <DrillGames playerId={p.id} qs={qs} cols={cols} league={league} key0={k} />}
          </Fragment>
        )
      })}
    </>
  )
}

function RankedView({ ctx, kind }: { ctx: Ctx; kind: 'team' | 'player' }) {
  const { q, data, metric, xMetric, colKeys, isPro, chartType, show: vis, output } = ctx
  const [sortKey, setSortKey] = useState<string | null>(ctx.sort.key)
  const [asc, setAsc] = useState<boolean | null>(ctx.sort.asc)
  const [open, setOpen] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  const lg = data.league
  const canDrill = isPro && !q.deep

  const rows: RankRow[] = useMemo(() => (
    kind === 'team'
      ? (data.teams ?? []).filter(t => sampleOf(q.group, t.totals) > 0).map(t => ({ id: t.teamId, name: t.name, abbr: t.abbr, totals: t.totals }))
      : (data.players ?? []).map(p => ({ id: p.id, name: p.name, abbr: p.abbr, pos: p.pos, link: `/mlb/players/${p.id}`, totals: p.totals }))
  ), [data, kind, q.group])

  // Free viewers can't sort by an advanced column even if one was picked earlier.
  const sortable = sortKey && (isPro || isStandardMetric(sortKey)) ? sortKey : null
  const key = sortable ?? metric.key
  const sortMetric = metricByKey(key) ?? metric
  const dirAsc = asc ?? !sortMetric.sortDesc

  const sorted = useMemo(() => {
    const withV = rows.map(r => ({ r, v: val(r.totals, key, lg) }))
    withV.sort((a, b) => {
      if (a.v == null && b.v == null) return 0
      if (a.v == null) return 1
      if (b.v == null) return -1
      return dirAsc ? a.v - b.v : b.v - a.v
    })
    return withV
  }, [rows, key, dirAsc, lg])

  const cols = tableCols(ctx).map(k => metricByKey(k)!).filter(Boolean)
  const valid = sorted.filter(x => x.v != null)
  const top = valid.slice(0, kind === 'team' ? 30 : 15)
  const chart: ChartRow[] = top.map(x => ({ name: kind === 'team' ? (x.r.abbr || x.r.name) : `${x.r.name}${x.r.pos ? ` (${x.r.pos})` : ''}`, full: x.r.name, v: x.v as number }))
  const scatter = scatterOf(valid.slice(0, 40).map(x => ({ name: x.r.abbr || x.r.name, totals: x.r.totals, league: lg })), xMetric, sortMetric)
  const leagueVal = val(lg, key, lg)
  const limit = showAll || !ctx.sort.limit ? sorted.length : ctx.sort.limit
  const shown = sorted.slice(0, limit)
  const qs: DrillQs = { group: q.group, gameType: q.gameType, from: q.from, to: q.to, split: q.split }

  if (!rows.length) return <Empty>No {kind === 'team' ? 'clubs' : 'players'} met the filters for this slice.</Empty>

  const headerClick = (k: string) => {
    if (k === key) setAsc(!dirAsc)
    else { setSortKey(k); setAsc(!(metricByKey(k)?.sortDesc ?? true)) }
  }
  const rowKey = (r: RankRow) => `${r.id}-${r.pos ?? ''}`
  const toggle = (k: string) => setOpen(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Gate on={vis.chart}>
      <Card title={`${sortMetric.full} — ${kind === 'team' ? 'all clubs' : 'top 15'}`} note={leagueVal != null ? `Dashed line = league ${sortMetric.fmt(leagueVal)}` : undefined}>
        <ChartPanel type={chartType} data={chart} series={[{ key: 'v', name: sortMetric.label, color: C.orange }]} fmt={sortMetric.fmt}
          refValue={leagueVal} refLabel="league" labels={ctx.labels} scatter={scatter} xLabel={xMetric.label} yLabel={sortMetric.label} height={kind === 'team' ? 320 : 380} />
      </Card>
      </Gate>

      <Gate on={vis.table}>
      <Card title={kind === 'team' ? 'Team table' : 'Player table'}
        note={canDrill
          ? `Click a column header to sort. Open a row (▸) to go deeper: ${kind === 'team' ? 'club → players → games → ' : 'player → games → '}${q.group === 'pitching' ? 'every pitch' : 'every plate appearance'}.`
          : 'Click a column header to sort.'}>
        <div style={{ textAlign: 'right', marginBottom: 6 }}>
          <CsvButton isPro={isPro} filename={`edge-${kind}s-${q.gameType}-${q.from}-${q.to}.csv`} headers={[kind === 'team' ? 'Club' : 'Player', ...cols.map(m => m.label)]}
            rows={sorted.map(({ r }) => [r.name, ...cols.map(m => show(m, val(r.totals, m.key, lg)))])} />
        </div>
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>#</th>
                <th style={{ ...th, textAlign: 'left' }}>{kind === 'team' ? 'Club' : 'Player'}</th>
                {cols.map(m => (
                  <th key={m.key} style={{ ...th, cursor: 'pointer', color: m.key === key ? C.orange : C.faint, fontWeight: m.key === key ? 700 : 400 }}
                    onClick={() => headerClick(m.key)} title={m.full}>
                    {m.label}{m.key === key ? (dirAsc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r }, i) => {
                const k = rowKey(r)
                const isOpen = open.includes(k)
                const drillable = canDrill && (kind === 'player' || r.id > 0)
                return (
                  <Fragment key={k}>
                    <tr style={{ borderBottom: `1px solid ${C.soft}` }}>
                      <td style={{ ...td, textAlign: 'left', color: C.faint }}>{i + 1}</td>
                      <td style={tdName}>
                        {drillable ? <ExpandBtn open={isOpen} onClick={() => toggle(k)} /> : null}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {kind === 'player' && <Avatar id={r.id} name={r.name} size={28} />}
                          {r.link ? <Link href={r.link} style={{ color: C.ink, textDecoration: 'none' }}>{r.name}</Link> : r.name}
                        </span>
                        {kind === 'player' && (r.abbr || r.pos) && <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, fontWeight: 400, marginLeft: 6 }}>{[r.abbr, r.pos].filter(Boolean).join(' · ')}</span>}
                        <SmallSample group={q.group} t={r.totals} />
                      </td>
                      {cols.map(m => <td key={m.key} style={{ ...td, fontWeight: m.key === key ? 700 : 400 }}>{show(m, val(r.totals, m.key, lg))}</td>)}
                    </tr>
                    {isOpen && drillable && (kind === 'team'
                      ? <DrillPlayers teamId={r.id} qs={qs} cols={cols} league={lg} />
                      : <DrillGames playerId={r.id} qs={qs} cols={cols} league={lg} key0={k} />)}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > shown.length && (
          <div data-noexport="1" style={{ textAlign: 'center', marginTop: 10 }}>
            <button type="button" onClick={() => setShowAll(true)}
              style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>
              Showing {shown.length} of {sorted.length} — show all
            </button>
          </div>
        )}
        {!isPro && <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginTop: 10 }}>Pro: open any row to go deeper — {kind === 'team' ? 'club → players → games → ' : 'player → games → '}every {q.group === 'pitching' ? 'pitch' : 'plate appearance'}.</div>}
      </Card>
      </Gate>
      {kind === 'player' && data.playersTruncated && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>
          Player lists include at most the latest 5 seasons of your range and the 400 players with the largest samples.
        </div>
      )}
    </div>
  )
}
