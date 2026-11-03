'use client'

// src/app/admin/charts/ChartBuilder.tsx
//
// The chart builder. Pick a public player or team table, a chart type and the stats; click dots or bars to name them; download a PNG (1200x675 by default)
// or the data behind it. Logic lives in src/lib/graphics/scatter.ts and chart-model.ts, drawing in ./plots.tsx, tables from /api/admin/scatter-data.
// Pasted columns (for example DRS) are kept in this browser and matched to players by name.

import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { C, SANS } from '@/components/team/ui'
import { FOOTER_TEXT, GT, HANDLE } from '@/lib/graphics/constants'
import {
  AGGS, CHART_TYPES, PALETTE, aggregate, categoryColors, compareStats, donutSlices, filterRows, groupBoxes, groupRows, histogram, leagueSeries, percentileOf, seasonSeries, topRows,
  type Agg, type ChartType,
} from '@/lib/graphics/chart-model'
import {
  DATASET_CHOICES, checkScatter, fmt, joinDataset, mergeColumn, nameKey, parsePasted, pickHighlights,
  type HighlightMode, type PastedColumn, type ScatterDataset,
} from '@/lib/graphics/scatter'
import { SIT_DEFAULT, SIT_OPTIONS, SIT_PRESETS, describeSit, splitExtra, type SitFilters } from '@/lib/graphics/situations'
import { TEMPLATES, TEMPLATE_GROUPS, type Template } from '@/lib/graphics/templates'
import { BarPlot, BoxPlot, ComparePlot, DonutPlot, HistPlot, LinePlot, RadarPlot, ScatterPlot, TablePlot, type BarItem } from './plots'

const SEASON = new Date().getFullYear()
const SIZES = { landscape: { w: 1200, h: 675, head: 150, label: 'Landscape 1200×675' }, square: { w: 1080, h: 1080, head: 170, label: 'Square 1080×1080' }, portrait: { w: 1080, h: 1350, head: 190, label: 'Portrait 1080×1350' } } as const
type SizeId = keyof typeof SIZES
const STORE = 'x9_chart_builder_v2'
const PASTE_STORE = 'x9_chart_pastes_v1'

type Saved = {
  datasetId: string; chart: ChartType; xKey: string; yKey: string; sizeKey: string; colorBy: string; valueKey: string; groupKey: string; agg: Agg; topN: number; dir: 'desc' | 'asc'; bins: number
  fromYear: number; slices: number; leagueLine: boolean; tableCols: string[]; filterKey: string; filterMin: string; catKey: string; catValue: string
  xLabel: string; yLabel: string; title: string; subtitle: string; kicker: string; diagonal: boolean; diagLabel: string; zeroLines: boolean; equal: boolean; signedX: boolean | null; signedY: boolean | null
  mode: HighlightMode; count: number; names: string[]; off: string[]; size: SizeId
  onlyNames: boolean; extra: string[]; compareKeys: string[]
  /** a colour the editor chose for one player, by name key */
  pcolors: Record<string, string>; refAvg: boolean; refMedian: boolean; area: boolean; heat: boolean
  /** the situation for the team tables (count, outs, runners, pitch type...) */
  sit: SitFilters
}
const DEFAULTS: Saved = {
  datasetId: 'frv', chart: 'scatter', xKey: 'range_runs', yKey: 'total_runs', sizeKey: '', colorBy: '', valueKey: 'total_runs', groupKey: '', agg: 'sum', topN: 15, dir: 'desc', bins: 20,
  fromYear: SEASON - 7, slices: 8, leagueLine: true, tableCols: [], filterKey: 'innings', filterMin: '700', catKey: '', catValue: '',
  xLabel: '', yLabel: '', title: '', subtitle: '', kicker: '', diagonal: true, diagLabel: '', zeroLines: false, equal: true, signedX: null, signedY: null,
  mode: 'gap', count: 12, names: [], off: [], size: 'landscape', onlyNames: false, extra: [], compareKeys: [], pcolors: {}, refAvg: false, refMedian: false, area: false, heat: false, sit: { ...SIT_DEFAULT, count: '2k' },
}
const load = (): Saved => { try { const r = localStorage.getItem(STORE); return r ? { ...DEFAULTS, ...(JSON.parse(r) as Partial<Saved>) } : DEFAULTS } catch { return DEFAULTS } }
type StoredPaste = { key: string; label: string; entries: [string, number][] }
const loadPastes = (): PastedColumn[] => { try { const r = localStorage.getItem(PASTE_STORE); return r ? (JSON.parse(r) as StoredPaste[]).map(p => ({ key: p.key, label: p.label, values: new Map(p.entries) })) : [] } catch { return [] } }

const lab: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, margin: '14px 0 4px' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontFamily: SANS, fontSize: 13.5, boxSizing: 'border-box', color: C.ink }
const btn: React.CSSProperties = { padding: '11px 18px', border: 'none', borderRadius: 6, fontFamily: SANS, fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer' }
const btnLite: React.CSSProperties = { padding: '6px 12px', border: `1px solid ${C.line}`, borderRadius: 999, background: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', color: C.ink }
const chk: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '5px 0', cursor: 'pointer' }
const short = (t: string) => t.replace(/\s*\(.*\)/, '')

/** The tables that take a situation, and the query that carries it. */
const takesSit = (id: string) => id.startsWith('tsit')
/** The name a joined table goes by in the stat lists: its table, plus its own situation when it has one. */
const extraLabel = (id: string) => { const x = splitExtra(id); const base = DATASET_CHOICES.find(d => d.id === x.dataset)?.label.replace(/,.*$/, '') ?? id; return x.sit ? `${base} (${describeSit(x.sit) || 'all pitches'})` : base }
const sitQuery = (id: string, sit: SitFilters) => (takesSit(id) ? `&sit=${encodeURIComponent(JSON.stringify(sit))}` : '')

export default function ChartBuilder() {
  const [s, setS] = useState<Saved>(DEFAULTS)
  const [ready, setReady] = useState(false)
  const [base, setBase] = useState<ScatterDataset | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [err, setErr] = useState('')
  const [pastes, setPastes] = useState<PastedColumn[]>([])
  const [pasteText, setPasteText] = useState('')
  const [pasteMsg, setPasteMsg] = useState('')
  const [nameIn, setNameIn] = useState('')
  const [hi, setHi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exportErr, setExportErr] = useState('')
  const [extras, setExtras] = useState<Map<string, ScatterDataset>>(new Map())
  const [teamIn, setTeamIn] = useState('')
  const [bulk, setBulk] = useState('')
  const pendingSub = useRef(false)
  const [history, setHistory] = useState<Map<number, ScatterDataset>>(new Map())
  const [histState, setHistState] = useState<'idle' | 'loading'>('idle')
  const cache = useRef(new Map<string, ScatterDataset>())
  const frame = useRef<HTMLDivElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  useEffect(() => { setS(load()); setPastes(loadPastes()); setReady(true) }, [])
  useEffect(() => { if (ready) try { localStorage.setItem(STORE, JSON.stringify(s)) } catch { /* private window */ } }, [s, ready])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(PASTE_STORE, JSON.stringify(pastes.map(p => ({ key: p.key, label: p.label, entries: [...p.values.entries()] })))) } catch { /* storage full or blocked */ }
  }, [pastes, ready])
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setS(p => ({ ...p, [k]: v }))

  // Load the table whenever the choice changes; then make sure every chosen stat still exists in it.
  useEffect(() => {
    if (!ready) return
    let live = true
    setState('loading'); setErr('')
    fetch(`/api/admin/scatter-data?dataset=${s.datasetId}&season=${SEASON}${sitQuery(s.datasetId, s.sit)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`); return j as ScatterDataset })
      .then(d => {
        if (!live) return
        cache.current.set(`${s.datasetId}:${SEASON}:${takesSit(s.datasetId) ? JSON.stringify(s.sit) : ''}`, d)
        setBase(d); setState('idle'); setHistory(new Map())
        setS(p => {
          const keys = d.columns.map(c => c.key), cats = d.cats.map(c => c.key)
          // keys from a pasted column (p<id>_<n>) or a joined table (<table>__<key>) are not in the base table
          const ok = (k: string, alt: string) => (keys.includes(k) || /^p[a-z0-9]+_\d+$/.test(k) || k.includes('__')) ? k : alt
          // team situation tables start on expected against actual wOBA, so the diagonal shows who is over- or under-performing
          const pref = (want: string, alt: string) => (takesSit(s.datasetId) && keys.includes(want) ? want : alt)
          const x = ok(p.xKey, pref('xwoba', keys[0])), y = ok(p.yKey, pref('woba', keys.find(k => k !== x) ?? x))
          return {
            ...p, xKey: x, yKey: y, valueKey: ok(p.valueKey, pref('woba', keys[0])), sizeKey: p.sizeKey && keys.includes(p.sizeKey) ? p.sizeKey : '', filterKey: keys.includes(p.filterKey) ? p.filterKey : keys[0], filterMin: keys.includes(p.filterKey) ? p.filterMin : '',
            colorBy: cats.includes(p.colorBy) ? p.colorBy : '', groupKey: cats.includes(p.groupKey) ? p.groupKey : '', catKey: cats.includes(p.catKey) ? p.catKey : '', catValue: cats.includes(p.catKey) ? p.catValue : '',
            tableCols: p.tableCols.filter(k => keys.includes(k)),
          }
        })
      })
      .catch(e => { if (live) { setState('error'); setErr(e instanceof Error ? e.message : 'Could not load'); setBase(null) } })
    return () => { live = false }
  }, [s.datasetId, ready, takesSit(s.datasetId) ? JSON.stringify(s.sit) : ''])

  // Other tables joined on by player name (stats from one table set against stats from another).
  useEffect(() => {
    if (!ready) return
    let live = true
    Promise.all(s.extra.filter(id => id !== s.datasetId).map(async id => {
      const x = splitExtra(id)
      const sit = x.sit ?? s.sit            // a joined table with its own situation uses that; otherwise the current one
      const k = `${x.dataset}:${SEASON}:${takesSit(x.dataset) ? JSON.stringify(sit) : ''}`
      if (cache.current.has(k)) return [id, cache.current.get(k)!] as const
      try {
        const r = await fetch(`/api/admin/scatter-data?dataset=${x.dataset}&season=${SEASON}${sitQuery(x.dataset, sit)}`)
        if (!r.ok) return [id, null] as const
        const d = (await r.json()) as ScatterDataset
        cache.current.set(k, d)
        return [id, d] as const
      } catch { return [id, null] as const }
    })).then(res => { if (live) setExtras(new Map(res.filter((x): x is readonly [string, ScatterDataset] => !!x[1]))) })
    return () => { live = false }
  }, [ready, s.extra, s.datasetId, JSON.stringify(s.sit)])

  // Season-by-season tables, only while a line chart is on screen.
  const wantsLine = s.chart === 'line'
  const meta = DATASET_CHOICES.find(d => d.id === s.datasetId)
  useEffect(() => {
    if (!ready || !wantsLine || !base || !meta?.seasons) return
    let live = true
    const from = Math.max(2015, Math.min(SEASON, s.fromYear))
    const years = Array.from({ length: SEASON - from + 1 }, (_, i) => from + i)
    setHistState('loading')
    Promise.all(years.map(async y => {
      const k = `${s.datasetId}:${y}:${takesSit(s.datasetId) ? JSON.stringify(s.sit) : ''}`
      // the current season is already loaded in full; past seasons come without the roster join
      if (cache.current.has(k)) return [y, cache.current.get(k)!] as const
      try {
        const r = await fetch(`/api/admin/scatter-data?dataset=${s.datasetId}&season=${y}&lite=1${sitQuery(s.datasetId, s.sit)}`)
        if (!r.ok) return [y, null] as const
        const d = (await r.json()) as ScatterDataset
        cache.current.set(k, d)
        return [y, d] as const
      } catch { return [y, null] as const }
    })).then(res => { if (live) { setHistory(new Map(res.filter((x): x is readonly [number, ScatterDataset] => !!x[1]))); setHistState('idle') } })
    return () => { live = false }
  }, [ready, wantsLine, base, s.datasetId, s.fromYear, meta?.seasons])

  const merged = useMemo(() => {
    if (!base) return null
    let ds = base; const unmatched: string[] = []
    const joined: { id: string; matched: number }[] = []
    for (const id of s.extra) {
      const other = extras.get(id)
      if (!other || id === base.id) continue
      const r = joinDataset(ds, { ...other, id }, extraLabel(id))
      ds = r.dataset; joined.push({ id, matched: r.matched })
    }
    for (const c of pastes) { const r = mergeColumn(ds, c); ds = r.dataset; unmatched.push(...r.unmatched) }
    // Pasted player numbers mean nothing on a team table, so they are not reported as unmatched there.
    return { ds, unmatched: base.rows.length > 60 ? unmatched : [], joined }
  }, [base, pastes, extras, s.extra])
  const ds = merged?.ds ?? null
  const col = (k: string) => ds?.columns.find(c => c.key === k)
  const xc = col(s.xKey), yc = col(s.yKey), vc = col(s.valueKey)
  const xLabel = s.xLabel || xc?.label || '', yLabel = s.yLabel || yc?.label || ''

  // `pool` is everyone who passes the minimum sample and group; percentiles are always taken against it. `rows` is what the chart plots:
  // the pool, or only the players the editor included.
  const pool = useMemo(() => {
    if (!ds) return []
    const min = s.filterMin.trim() === '' ? null : Number(s.filterMin)
    return filterRows(ds.rows, { key: s.filterKey, min: min != null && Number.isFinite(min) ? min : null, catKey: s.catKey, catValue: s.catValue })
  }, [ds, s.filterKey, s.filterMin, s.catKey, s.catValue])
  const nameSet = useMemo(() => new Set(s.names.map(nameKey)), [s.names])
  const only = s.onlyNames && s.names.length > 0 && s.chart !== 'compare' && s.chart !== 'radar'
  const rows = useMemo(() => (only ? pool.filter(r => nameSet.has(nameKey(r.name))) : pool), [pool, only, nameSet])
  const colors = useMemo(() => (s.colorBy ? categoryColors(rows.map(r => r.c[s.colorBy]).filter(Boolean)) : null), [rows, s.colorBy])

  // ── scatter and bubble
  const pts = useMemo(() => {
    if (!xc || !yc) return []
    return rows.flatMap(r => { const x = r.v[s.xKey], y = r.v[s.yKey], z = s.sizeKey ? r.v[s.sizeKey] ?? null : null; return x != null && y != null && (s.chart !== 'bubble' || z != null || !s.sizeKey) ? [{ name: r.name, x, y, size: z, cat: s.colorBy ? r.c[s.colorBy] ?? null : null }] : [] })
  }, [rows, xc, yc, s.xKey, s.yKey, s.sizeKey, s.colorBy, s.chart])
  const picks = useMemo(() => (only ? pickHighlights(pts, 'none', 0, s.names, []) : pickHighlights(pts, s.mode, s.count, s.names, s.off)), [pts, s.mode, s.count, s.names, s.off, only])
  const signedX = s.signedX ?? pts.some(p => p.x < 0), signedY = s.signedY ?? pts.some(p => p.y < 0)
  const bubbleRange = useMemo(() => { const z = pts.map(p => p.size).filter((v): v is number => v != null); return z.length ? { lo: Math.min(...z), hi: Math.max(...z) } : null }, [pts])

  // ── value charts
  const valueSigned = useMemo(() => rows.some(r => (r.v[s.valueKey] ?? 0) < 0), [rows, s.valueKey])
  const vDec = vc?.decimals ?? 0
  const fv = (v: number) => { const t = fmt(v, Number.isInteger(v) ? 0 : vDec, valueSigned); return Math.abs(v) >= 1000 ? t.replace(/\d+(?=(\.|$))/, d => Number(d).toLocaleString('en-US')) : t }
  const topList = useMemo(() => (s.chart === 'bar' || s.chart === 'column' || s.chart === 'table') && vc ? topRows(rows, s.valueKey, s.topN, s.dir, s.names) : [], [rows, s.chart, s.valueKey, s.topN, s.dir, s.names, vc])
  const groups = useMemo(() => (s.groupKey ? groupRows(rows, s.groupKey, s.agg === 'count' ? null : s.valueKey, s.agg) : []), [rows, s.groupKey, s.valueKey, s.agg])
  const hist = useMemo(() => histogram(rows.flatMap(r => (r.v[s.valueKey] != null ? [r.v[s.valueKey] as number] : [])), s.bins), [rows, s.valueKey, s.bins])
  const marks = useMemo(() => s.names.flatMap(n => { const r = rows.find(q => nameKey(q.name) === nameKey(n)); const v = r?.v[s.valueKey]; return r && v != null ? [{ name: r.name, x: v }] : [] }), [s.names, rows, s.valueKey])
  const series = useMemo(() => seasonSeries(s.names.slice(0, 8), history, s.valueKey), [s.names, history, s.valueKey])
  const league = useMemo(() => (s.leagueLine && history.size ? leagueSeries(history, s.valueKey, s.agg === 'median' ? 'median' : 'mean') : null), [s.leagueLine, history, s.valueKey, s.agg])
  const slices = useMemo(() => donutSlices(groups, s.slices), [groups, s.slices])
  // The table always shows the stat it is sorted by, first.
  const picked = (s.tableCols.length ? s.tableCols : (ds?.columns ?? []).slice(0, 4).map(c => c.key)).filter(k => k !== s.valueKey)
  const cmpKeys = (s.compareKeys.length ? s.compareKeys : (ds?.columns ?? []).slice(0, 6).map(c => c.key)).filter(k => ds?.columns.some(c => c.key === k)).slice(0, 10)
  const cmpPlayers = s.names.slice(0, 6)
  const compare = useMemo(() => ((s.chart === 'compare' || s.chart === 'radar') && ds ? compareStats(cmpPlayers, pool, cmpKeys.map(k => ({ key: k, label: ds.columns.find(c => c.key === k)?.label ?? k, decimals: ds.columns.find(c => c.key === k)?.decimals ?? 0 })), ds.rows) : []), [s.chart, ds, pool, cmpPlayers.join('|'), cmpKeys.join('|')])
  // A colour chosen for one player wins; otherwise the brand orange (or, when players are drawn side by side, the next palette colour).
  const pcolor = (n: string): string | undefined => s.pcolors[nameKey(n)]
  const seriesColor = (n: string, i: number) => pcolor(n) ?? PALETTE[i % PALETTE.length]
  const statOf = (key: string) => pool.flatMap(r => (r.v[key] != null ? [r.v[key] as number] : []))
  const wantsRef = s.refAvg || s.refMedian
  const scatterRefs = wantsRef && (s.chart === 'scatter' || s.chart === 'bubble') ? { xAvg: s.refAvg ? aggregate(statOf(s.xKey), 'mean') : undefined, xMed: s.refMedian ? aggregate(statOf(s.xKey), 'median') : undefined, yAvg: s.refAvg ? aggregate(statOf(s.yKey), 'mean') : undefined, yMed: s.refMedian ? aggregate(statOf(s.yKey), 'median') : undefined } : null
  const valueStat = useMemo(() => statOf(s.valueKey), [pool, s.valueKey])
  const boxGroups = useMemo(() => (s.chart === 'box' && s.groupKey ? groupBoxes(pool, s.groupKey, s.valueKey) : []), [s.chart, s.groupKey, pool, s.valueKey])
  const tableCols = [s.valueKey, ...picked].filter(k => ds?.columns.some(c => c.key === k)).slice(0, 6)

  const size = SIZES[s.size]
  const W = size.w - 80, H = size.h - size.head - 56 - 40
  const fs = s.size === 'landscape' ? 14 : 15

  useEffect(() => {
    const el = holder.current
    if (!el) return
    let doubt = 0
    const fit = () => {
      const w = el.clientWidth
      if (w <= 50) return
      const next = Math.max(0.2, Math.min(1, (w - 2) / size.w))
      // A sudden big shrink is usually a transient reading (a screenshot or a scrollbar), so it must show up on two measurements in a row.
      setScale(cur => { if (next < cur * 0.6 && doubt < 1) { doubt++; return cur } doubt = 0; return next })
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el); fit()
    window.addEventListener('resize', fit)
    const tick = setInterval(fit, 1000) // cheap safety net: a layout change the observer misses cannot leave the preview mis-sized
    return () => { ro.disconnect(); clearInterval(tick); window.removeEventListener('resize', fit) }
    // the picture is replaced while a table loads, so measure again whenever it comes back
  }, [size.w, ds !== null, state])

  const isPoints = s.chart === 'scatter' || s.chart === 'bubble'
  const plotted = isPoints ? pts.length : s.chart === 'donut' || (s.chart === 'bar' && s.groupKey) ? groups.length : s.chart === 'histogram' ? hist.n : s.chart === 'line' ? series.length : s.chart === 'compare' || s.chart === 'radar' ? cmpPlayers.length : s.chart === 'box' ? boxGroups.length : topList.length
  const sitText = takesSit(s.datasetId) ? describeSit(s.sit) : ''
  const unit = (base?.rows.length ?? 99) <= 40 ? 'clubs' : 'players'
  const rawKicker = s.kicker || autoKicker()
  // the label in the corner must stay short, or it crowds the wordmark
  const kicker = rawKicker.length > 60 ? `${rawKicker.slice(0, 57).trimEnd()}…` : rawKicker
  function autoKicker() {
    if (isPoints) return xc && yc ? `${xLabel} vs ${yLabel}${sitText ? ` ${sitText}` : ''}, ${SEASON}`.toUpperCase() : ''
    if (s.chart === 'compare' || s.chart === 'radar') return `Player comparison, ${SEASON}`.toUpperCase()
    if (s.chart === 'box') return `${short(vc?.label ?? '')} by ${ds?.cats.find(c => c.key === s.groupKey)?.label ?? 'group'}, ${SEASON}`.toUpperCase()
    if (s.chart === 'line') return `${short(vc?.label ?? '')} by season`.toUpperCase()
    if (s.chart === 'histogram') return `Distribution of ${short(vc?.label ?? '')}, ${SEASON}`.toUpperCase()
    return `${vc?.label ?? ''}${sitText ? ` ${sitText}` : ''}, ${SEASON}`.toUpperCase()
  }
  const diagLabel = s.diagLabel || `${short(xLabel)} = ${short(yLabel)}`
  const warnings = checkScatter({ title: s.title, subtitle: s.subtitle, xKey: isPoints ? s.xKey : 'a', yKey: isPoints ? s.yKey : 'b', points: s.chart === 'line' || s.chart === 'donut' || s.chart === 'table' || s.chart === 'bar' || s.chart === 'column' || s.chart === 'compare' || s.chart === 'radar' || s.chart === 'box' || only ? 99 : plotted, missing: isPoints ? picks.missing : [], unmatched: merged?.unmatched ?? [] })
  if (ds && rows.length === 0) warnings.push('Nobody passes the minimum sample. Lower it or choose another stat.')
  if (s.chart === 'radar' && ds && cmpKeys.length < 3) warnings.push('A radar needs 3 or more stats.')
  if (s.chart === 'box' && ds && !s.groupKey) warnings.push('Choose a group (team, league, position) for the boxes.')
  if ((s.chart === 'compare' || s.chart === 'radar') && ds) {
    if (cmpPlayers.length < 2) warnings.push('Include two or more players by name to compare them (up to 6).')
    const lost = cmpPlayers.filter(n => !ds.rows.some(r => nameKey(r.name) === nameKey(n)))
    if (lost.length) warnings.push(`Not found in this table: ${lost.join(', ')}.`)
    if (s.names.length > 6) warnings.push('Only the first 6 players are compared.')
  }
  if (s.chart === 'line' && s.valueKey.includes('__')) warnings.push('A stat joined from another table has the current season only, so its line has one point.')
  if (s.chart === 'line' && !series.length && ds) warnings.push('Include one or more players by name to follow them across seasons.')
  if (s.chart === 'line' && !meta?.seasons) warnings.push('This table has no season-by-season history. Choose another table.')

  // After the DRS preset loads, write the subtitle its chart needs.
  useEffect(() => {
    if (pendingSub.current && s.datasetId === 'frv' && s.xKey === 'drs' && pts.length > 0 && s.chart === 'scatter') {
      pendingSub.current = false
      set('subtitle', `${pts.length} fielders with ${s.filterMin || 0}+ innings. Below the line: DRS likes him more. Above: FRV does.`)
    }
  }, [pts.length, s.datasetId, s.xKey, s.chart, s.filterMin])

  function autoSubtitle() {
    const f = s.filterMin.trim() && col(s.filterKey) ? ` with ${s.filterMin}+ ${short(col(s.filterKey)!.label).toLowerCase()}` : ''
    const g = s.catKey && s.catValue ? ` in the ${s.catValue}` : ''
    if (isPoints) {
      const diag = s.diagonal ? ` Below the line: ${short(xLabel)} is higher. Above: ${short(yLabel)} is higher.` : ''
      set('subtitle', `${pts.length} ${unit}${sitText ? ` ${sitText}` : ''}${f}${g}.${diag}`)
    } else if (s.chart === 'box') set('subtitle', `The middle half of players is the box, the line inside is the median, whiskers reach the rest and circles are outliers${f}${g}.`)
    else if (s.chart === 'compare' || s.chart === 'radar') set('subtitle', `Each bar is where the player ranks among ${pool.length} players${f}${g}. The number beside it is his figure.`)
    else if (s.chart === 'histogram') set('subtitle', `${hist.n} ${unit}${sitText ? ` ${sitText}` : ''}${f}${g}. Orange bars hold the ones named.`)
    else if (s.chart === 'line') set('subtitle', `${short(vc?.label ?? '')} each season, ${s.fromYear} to ${SEASON}${s.leagueLine ? '. Dashed line: league average' : ''}.`)
    else if (s.chart === 'donut') set('subtitle', `Share of ${s.agg === 'count' ? 'players' : short(vc?.label ?? '').toLowerCase()} by ${ds?.cats.find(c => c.key === s.groupKey)?.label.toLowerCase() ?? 'group'}${f}.`)
    else set('subtitle', `${s.groupKey ? `${AGGS.find(a => a.id === s.agg)?.label.toLowerCase()} by ${ds?.cats.find(c => c.key === s.groupKey)?.label.toLowerCase()}` : `${s.dir === 'desc' ? 'Top' : 'Bottom'} ${s.topN} ${unit}${sitText ? ` ${sitText}` : ''}${f}${g}`}.`)
  }

  function toggle(name: string) {
    const k = nameKey(name)
    setS(p => {
      const inNames = p.names.some(n => nameKey(n) === k)
      if (inNames) return { ...p, names: p.names.filter(n => nameKey(n) !== k) }
      const auto = isPoints && picks.picked.some(q => nameKey(q.name) === k)
      if (auto) return { ...p, off: [...p.off, name] }
      return { ...p, names: [...p.names, name], off: p.off.filter(n => nameKey(n) !== k) }
    })
  }
  function includeName(n: string) {
    const t = n.trim()
    if (!t) return
    if (!s.names.some(x => nameKey(x) === nameKey(t))) setS(p => ({ ...p, names: [...p.names, t], off: p.off.filter(o => nameKey(o) !== nameKey(t)) }))
    setNameIn('')
  }
  function includePaste() {
    const r = parsePasted(pasteText, `p${Date.now().toString(36)}_`)
    if (r.error) { setPasteMsg(r.error); return }
    setPastes(p => [...p.filter(q => !r.columns.some(c => c.label.toLowerCase() === q.label.toLowerCase())), ...r.columns])
    setPasteMsg(`${r.columns.map(c => c.label).join(', ')} saved: ${r.names} names read. Choose the new stat in the lists above.`)
    setPasteText('')
  }

  /** One click: table, situation, chart, stats, headline, subtitle and reference lines all set from a template. Named players and colours are kept. */
  function applyTemplate(t: Template) {
    const q = t.patch
    pendingSub.current = false
    setS(p => ({
      ...p, datasetId: q.datasetId, chart: q.chart, title: q.title, subtitle: q.subtitle, kicker: `${t.label}, ${SEASON}`.toUpperCase(), sit: { ...SIT_DEFAULT, gt: p.sit.gt, ...q.sit }, extra: q.extra ?? [],
      xKey: q.xKey ?? p.xKey, yKey: q.yKey ?? p.yKey, valueKey: q.valueKey ?? p.valueKey, dir: q.dir ?? 'desc', topN: q.topN ?? p.topN, colorBy: q.colorBy ?? '', groupKey: '', agg: 'sum',
      xLabel: q.xLabel ?? '', yLabel: q.yLabel ?? '', diagonal: q.diagonal ?? false, diagLabel: q.diagLabel ?? '', equal: q.equal ?? true, refAvg: q.refAvg ?? false, refMedian: q.refMedian ?? false,
      mode: q.mode ?? 'none', count: q.count ?? 0, names: [], off: [], onlyNames: false, filterKey: 'pa', filterMin: '', catKey: '', catValue: '', signedX: null, signedY: null, zeroLines: false, size: q.size ?? 'landscape',
    }))
  }

  function drsPreset() {
    pendingSub.current = true
    // DRS is joined onto the fielding table by the server (The Fielding Bible archive), so nothing needs pasting.
    setS(p => ({
      ...p, datasetId: 'frv', chart: 'scatter', xKey: 'drs', yKey: 'total_runs', xLabel: 'DRS (runs saved)', yLabel: 'FRV (runs)', filterKey: 'innings', filterMin: '700', catKey: '', catValue: '', colorBy: '',
      title: "Where the two stats agree, and where they don't", kicker: `DRS VS FRV, ${SEASON}`, diagonal: true, diagLabel: 'DRS = FRV', equal: true, zeroLines: false, signedX: true, signedY: true, mode: 'gap', count: 12, off: [], size: 'landscape',
    }))
  }

  async function download(mode: 'png' | 'copy' | 'csv') {
    if (mode === 'csv') { downloadCsv(); return }
    if (!frame.current) return
    setBusy(true); setExportErr('')
    try {
      const url = await toPng(frame.current, { pixelRatio: hi ? 2 : 1, cacheBust: true, backgroundColor: GT.paper, style: { transform: 'none' } })
      if (mode === 'copy') {
        const blob = await (await fetch(url)).blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } else save(url, `${slug()}-${size.w}x${size.h}.png`)
    } catch (e) {
      console.error('[ChartBuilder] export failed:', e instanceof Error ? e.message : e)
      setExportErr(mode === 'copy' ? 'Could not copy the picture. Download it instead.' : 'Could not make the picture. Try again.')
    } finally { setBusy(false) }
  }
  const slug = () => (s.title || s.chart).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart'
  function save(href: string, filename: string) { const a = document.createElement('a'); a.href = href; a.download = filename; a.click() }
  function downloadCsv() {
    let head: string[] = [], out: (string | number)[][] = []
    if (isPoints) { head = ['Player', xLabel, yLabel, ...(s.sizeKey ? [col(s.sizeKey)?.label ?? 'Size'] : []), ...(s.colorBy ? ['Group'] : [])]; out = pts.map(p => [p.name, p.x, p.y, ...(s.sizeKey ? [p.size ?? ''] : []), ...(s.colorBy ? [p.cat ?? ''] : [])]) }
    else if (s.chart === 'box') { head = ['Group', 'Players', 'Q1', 'Median', 'Q3', 'Low whisker', 'High whisker']; out = boxGroups.map(g => [g.label, g.stats.n, g.stats.q1, g.stats.median, g.stats.q3, g.stats.lo, g.stats.hi]) }
    else if (s.chart === 'compare' || s.chart === 'radar') { head = ['Stat', 'Player', 'Number', 'Percentile']; out = compare.flatMap(c => cmpPlayers.map((n, i) => [c.label, n, c.values[i] ?? '', c.pct[i] ?? ''])) }
    else if (s.chart === 'histogram') { head = [`${vc?.label ?? 'Stat'} from`, 'to', 'Players']; out = hist.bins.map(b => [b.lo, b.hi, b.count]) }
    else if (s.chart === 'line') { head = ['Player', 'Season', vc?.label ?? 'Stat']; out = series.flatMap(x => x.points.map(q => [x.name, q.season, q.v ?? ''])) }
    else if (s.chart === 'donut' || (s.chart === 'bar' || s.chart === 'column') && s.groupKey) { head = ['Group', vc?.label ?? 'Stat', 'Players']; out = groups.map(g => [g.label, g.value, g.n]) }
    else { head = ['Rank', 'Player', ...(s.chart === 'table' ? tableCols.map(k => col(k)?.label ?? k) : [vc?.label ?? 'Stat'])]; out = topList.map(t => [t.rank, t.name, ...(s.chart === 'table' ? tableCols.map(k => t.row.v[k] ?? '') : [t.value])]) }
    const esc = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const csv = [head, ...out].map(r => r.map(esc).join(',')).join('\n')
    save(URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), `${slug()}-data.csv`)
  }

  const colOpts = (ds?.columns ?? []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)
  const catOpts = (ds?.cats ?? []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)
  const catValues = useMemo(() => (s.catKey && ds ? [...new Set(ds.rows.map(r => r.c[s.catKey]).filter(Boolean))].sort() : []), [ds, s.catKey])
  const groups2 = DATASET_CHOICES.reduce<Record<string, typeof DATASET_CHOICES>>((a, d) => { (a[d.group] ??= []).push(d); return a }, {})
  const needsValue = s.chart !== 'scatter' && s.chart !== 'bubble' && s.chart !== 'compare' && s.chart !== 'radar'

  // ── the plot for the chosen chart type
  const barItems: BarItem[] = s.groupKey && (s.chart === 'bar' || s.chart === 'column')
    ? [...groups].sort((a, b) => (s.dir === 'desc' ? b.value - a.value : a.value - b.value)).slice(0, s.topN).map(g => ({ key: g.label, label: g.label, value: g.value, color: '#BDB9AF', hl: false, clickable: false }))
    : topList.map(t => ({ key: t.name, label: s.colorBy && !colors ? t.name : t.name, value: t.value, color: colors && t.row.c[s.colorBy] ? colors.get(t.row.c[s.colorBy]) ?? '#BDB9AF' : '#BDB9AF', hl: nameSet.has(nameKey(t.name)), hlColor: pcolor(t.name), clickable: true }))
  const plot = !ds ? null : isPoints ? (
    <ScatterPlot W={W} H={H} fs={fs} pts={pts} picked={picks.picked} xDec={xc?.decimals ?? 0} yDec={yc?.decimals ?? 0} signedX={signedX} signedY={signedY} xLabel={xLabel} yLabel={yLabel}
      diagonal={s.diagonal} diagLabel={diagLabel} equal={s.equal} zeroLines={s.zeroLines} colors={colors} bubble={s.chart === 'bubble' && s.sizeKey && bubbleRange ? { label: col(s.sizeKey)?.label ?? '', ...bubbleRange } : null} pcolor={pcolor} refs={scatterRefs} onToggle={toggle} />
  ) : s.chart === 'bar' || s.chart === 'column' ? (
    <BarPlot W={W} H={H} fs={fs} items={barItems} horizontal={s.chart === 'bar'} fmtV={fv} valueLabel={s.agg !== 'count' || !s.groupKey ? `${s.groupKey ? `${AGGS.find(a => a.id === s.agg)?.label} of ` : ''}${vc?.label ?? ''}` : 'Players'} onToggle={toggle} legend={!s.groupKey && colors ? [...colors.entries()] : []} refLines={!s.groupKey && wantsRef ? [...(s.refAvg ? [{ value: aggregate(valueStat, 'mean'), label: `League avg ${fv(aggregate(valueStat, 'mean'))}`, dash: '2 4' }] : []), ...(s.refMedian ? [{ value: aggregate(valueStat, 'median'), label: `League median ${fv(aggregate(valueStat, 'median'))}`, dash: '7 4' }] : [])] : []} />
  ) : s.chart === 'histogram' ? (
    <HistPlot W={W} H={H} fs={fs} bins={hist.bins} mean={hist.mean} median={hist.median} marks={marks} xLabel={vc?.label || ''} fmtV={fv} n={hist.n} showMean={s.refAvg} markColor={pcolor} />
  ) : s.chart === 'line' ? (
    <LinePlot W={W} H={H} fs={fs} series={series} league={league} leagueLabel={s.agg === 'median' ? 'League median' : 'League average'} yLabel={vc?.label || ''} fmtV={fv} colors={series.map((x, i) => seriesColor(x.name, i))} area={s.area} />
  ) : s.chart === 'donut' ? (
    <DonutPlot W={W} H={H} fs={fs} slices={slices} fmtV={fv} totalLabel={s.agg === 'count' ? 'players' : short(vc?.label ?? '')} />
  ) : s.chart === 'compare' ? (
    <ComparePlot W={W} H={H} fs={fs} players={cmpPlayers} stats={compare} fmtV={(st, v) => fmt(v, st.decimals, false)} colors={cmpPlayers.map((n, i) => seriesColor(n, i))} />
  ) : s.chart === 'radar' ? (
    <RadarPlot W={W} H={H} fs={fs} players={cmpPlayers} stats={compare} fmtV={(st, v) => fmt(v, st.decimals, false)} colors={cmpPlayers.map((n, i) => seriesColor(n, i))} />
  ) : s.chart === 'box' ? (
    <BoxPlot W={W} H={H} fs={fs} groups={boxGroups} fmtV={fv} valueLabel={vc?.label ?? ''} avg={s.refAvg ? aggregate(valueStat, 'mean') : null} markColor={pcolor}
      marks={s.names.flatMap(n => { const r = pool.find(q => nameKey(q.name) === nameKey(n)); const v = r?.v[s.valueKey]; const g = r?.c[s.groupKey]; return r && v != null && g ? [{ name: r.name, group: g, value: v }] : [] })} />
  ) : (
    <TablePlot W={W} H={H} fs={fs} heads={tableCols.map(k => short(col(k)?.label ?? k))} onToggle={toggle}
      heat={s.heat} rows={topList.map(t => ({ key: t.name, rank: t.rank, name: t.name, hl: nameSet.has(nameKey(t.name)), color: pcolor(t.name), heat: tableCols.map(k => { const v = t.row.v[k]; return v == null ? null : percentileOf(statOf(k), v) }), cells: tableCols.map(k => { const v = t.row.v[k]; const c = col(k); return v == null ? '—' : fmt(v, c?.decimals ?? 0, false) }) }))} />
  )

  const sel = (key: keyof Saved, opts: React.ReactNode, none?: string) => (
    <select style={inp} value={String(s[key] ?? '')} onChange={e => set(key, e.target.value as never)}>{none != null && <option value="">{none}</option>}{opts}</select>
  )

  return (
    <div className="sb-grid" style={{ display: 'grid', gridTemplateColumns: '350px minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
      <style>{'@media (max-width: 980px){.sb-grid{grid-template-columns:1fr !important}} .cb, .cb *{font-family:var(--font-redhat), system-ui, sans-serif !important}'}</style>

      <aside style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '4px 16px 16px' }}>
        <label style={lab}>Ready-made charts</label>
        {TEMPLATE_GROUPS.map(g => (
          <div key={g}>
            <div style={{ fontSize: 11, color: C.mute, margin: '2px 0 6px' }}>{g}: one click sets the table, situation, stats and headline.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATES.filter(t => t.group === g).map(t => <button key={t.id} type="button" title={t.blurb} onClick={() => applyTemplate(t)} style={{ ...btnLite, padding: '5px 10px', fontSize: 12 }}>{t.label}</button>)}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: C.mute, margin: '8px 0 0' }}>Fielding: <button type="button" onClick={drsPreset} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>DRS vs FRV</button>. Everything below stays editable.</div>
        <label style={lab}>Chart type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {CHART_TYPES.map(t => <button key={t.id} type="button" title={t.blurb} onClick={() => setS(p => ({ ...p, chart: t.id, kicker: '' }))} style={{ ...btnLite, borderRadius: 8, textAlign: 'left', borderColor: s.chart === t.id ? C.orange : C.line, background: s.chart === t.id ? '#FFF1EA' : '#fff' }}>{t.label}</button>)}
        </div>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{CHART_TYPES.find(t => t.id === s.chart)?.blurb}</div>

        <label style={lab}>Table</label>
        <select style={inp} value={s.datasetId} onChange={e => setS(p => ({ ...p, datasetId: e.target.value, kicker: '', xLabel: '', yLabel: '', diagLabel: '', signedX: null, signedY: null, extra: [], groupKey: '' }))}>
          {Object.entries(groups2).map(([g, list]) => <optgroup key={g} label={g}>{list.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</optgroup>)}
        </select>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{meta?.blurb} · {SEASON}</div>
        {state === 'loading' && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8 }}>Loading the table…</div>}
        {state === 'error' && <div role="alert" style={{ fontSize: 12.5, color: C.bad, marginTop: 8 }}>{err}</div>}

        {takesSit(s.datasetId) && (
          <>
            <label style={lab}>Situation</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SIT_PRESETS.map(p => <button key={p.label} type="button" onClick={() => setS(q => ({ ...q, sit: { ...SIT_DEFAULT, gt: q.sit.gt, ...p.set } }))} style={{ ...btnLite, padding: '4px 10px', fontSize: 12 }}>{p.label}</button>)}
              <button type="button" onClick={() => setS(q => ({ ...q, sit: { ...SIT_DEFAULT, gt: q.sit.gt } }))} style={{ ...btnLite, padding: '4px 10px', fontSize: 12 }}>All pitches</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px', marginTop: 8 }}>
              {(Object.keys(SIT_OPTIONS) as (keyof SitFilters)[]).map(k => (
                <label key={k} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute }}>
                  {SIT_OPTIONS[k].label}
                  <select style={{ ...inp, marginTop: 3, padding: '6px 8px', fontSize: 12.5, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }} value={s.sit[k]} onChange={e => setS(q => ({ ...q, sit: { ...q.sit, [k]: e.target.value } }))}>
                    {SIT_OPTIONS[k].options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#5B5347', marginTop: 6 }}>Showing every club {describeSit(s.sit) || 'on all pitches'}. A rate is the result of plate appearances that ended in this situation.</div>
          </>
        )}

        {ds && (
          <>
            <label style={lab}>Join another table</label>
            <select style={inp} value="" onChange={e => { const v = e.target.value; if (v) set('extra', [...s.extra.filter(x => x !== v), v]) }}>
              <option value="">Bring in stats from another table (matched by name)</option>
              {DATASET_CHOICES.filter(d => d.id !== s.datasetId && !s.extra.includes(d.id)).map(d => <option key={d.id} value={d.id}>{d.group}: {d.label}</option>)}
            </select>
            {s.extra.filter(id => id !== s.datasetId).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {s.extra.filter(id => id !== s.datasetId).map(id => { const j = merged?.joined.find(q => q.id === id); return <button key={id} type="button" onClick={() => set('extra', s.extra.filter(x => x !== id))} style={{ ...btnLite, padding: '3px 10px' }} aria-label={`Remove ${id}`}>{extraLabel(id)}{j ? ` (${j.matched} matched)` : ' (loading)'} ×</button> })}
              </div>
            )}
            {s.extra.filter(id => id !== s.datasetId).length > 0 && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>Its stats now appear in every stat list below, labelled with the table name. Current season only.</div>}
            {isPoints && (
              <>
                <label style={lab}>Across (x axis)</label>
                {sel('xKey', colOpts)}
                <input style={{ ...inp, marginTop: 6 }} placeholder="Axis label (optional)" value={s.xLabel} onChange={e => set('xLabel', e.target.value)} />
                <label style={lab}>Up (y axis)</label>
                {sel('yKey', colOpts)}
                <input style={{ ...inp, marginTop: 6 }} placeholder="Axis label (optional)" value={s.yLabel} onChange={e => set('yLabel', e.target.value)} />
                {s.chart === 'bubble' && (<><label style={lab}>Dot size</label>{sel('sizeKey', colOpts, 'Choose a stat')}</>)}
              </>
            )}
            {needsValue && (
              <>
                <label style={lab}>{s.chart === 'donut' ? 'Stat to share out' : s.chart === 'line' ? 'Stat to follow' : s.chart === 'table' ? 'Sort by' : 'Stat'}</label>
                {sel('valueKey', colOpts)}
              </>
            )}
            {s.chart === 'box' && (<><label style={lab}>One box per</label>{sel('groupKey', catOpts, 'Choose a group')}</>)}
            {(s.chart === 'bar' || s.chart === 'column' || s.chart === 'donut') && (
              <>
                <label style={lab}>{s.chart === 'donut' ? 'Slice by' : 'One bar per'}</label>
                {sel('groupKey', catOpts, s.chart === 'donut' ? 'Choose a group' : unit === 'clubs' ? 'Club' : 'Player')}
                {s.groupKey && (<div style={{ marginTop: 6 }}>{sel('agg', AGGS.filter(a => s.chart !== 'donut' || a.id === 'sum' || a.id === 'count').map(a => <option key={a.id} value={a.id}>{a.label}</option>))}</div>)}
              </>
            )}
            {s.chart === 'donut' && (<><label style={lab}>Most slices</label><input style={inp} type="number" min={2} max={12} value={s.slices} onChange={e => set('slices', Math.max(2, Math.min(12, Number(e.target.value) || 8)))} /></>)}
            {(s.chart === 'bar' || s.chart === 'column' || s.chart === 'table') && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <select style={{ ...inp, flex: 2 }} value={s.dir} onChange={e => set('dir', e.target.value as 'desc' | 'asc')}><option value="desc">Highest first</option><option value="asc">Lowest first</option></select>
                <input style={{ ...inp, flex: 1 }} type="number" min={3} max={40} value={s.topN} onChange={e => set('topN', Math.max(3, Math.min(40, Number(e.target.value) || 10)))} aria-label="How many" />
              </div>
            )}
            {(s.chart === 'bar' || s.chart === 'column' || isPoints) && (<><label style={lab}>Colour by group</label>{sel('colorBy', catOpts, 'One colour')}</>)}
            {s.chart === 'histogram' && (<><label style={lab}>Bars</label><input style={inp} type="number" min={5} max={60} value={s.bins} onChange={e => set('bins', Math.max(5, Math.min(60, Number(e.target.value) || 20)))} /></>)}
            {s.chart === 'line' && (
              <>
                <label style={lab}>From season</label>
                <input style={inp} type="number" min={2015} max={SEASON} value={s.fromYear} onChange={e => set('fromYear', Math.max(2015, Math.min(SEASON, Number(e.target.value) || SEASON - 7)))} />
                <label style={chk}><input type="checkbox" checked={s.leagueLine} onChange={e => set('leagueLine', e.target.checked)} /> League line (average of everyone in the table)</label>
                {histState === 'loading' && <div style={{ fontSize: 12, color: C.mute }}>Loading seasons…</div>}
              </>
            )}
            {s.chart === 'table' && (
              <>
                <label style={lab}>More columns (the sort stat is always first)</label>
                {Array.from({ length: 5 }, (_, i) => (
                  <select key={i} style={{ ...inp, marginBottom: 5 }} value={picked[i] ?? ''} onChange={e => { const v = [...picked]; if (e.target.value) v[i] = e.target.value; else v.splice(i, 1); set('tableCols', v.filter(Boolean)) }}><option value="">{i < picked.length ? 'Remove this column' : 'Another column (optional)'}</option>{colOpts}</select>
                ))}
              </>
            )}

            {(s.chart === 'compare' || s.chart === 'radar') && (
              <>
                <label style={lab}>{s.chart === 'radar' ? 'Stats for the axes (3 to 10)' : 'Stats to compare (up to 10)'}</label>
                {Array.from({ length: Math.min(10, cmpKeys.length + 1) }, (_, i) => (
                  <select key={i} style={{ ...inp, marginBottom: 5 }} value={cmpKeys[i] ?? ''} onChange={e => { const v = [...cmpKeys]; if (e.target.value) v[i] = e.target.value; else v.splice(i, 1); set('compareKeys', v.filter(Boolean)) }}>
                    <option value="">{i < cmpKeys.length ? 'Remove this stat' : 'Another stat (optional)'}</option>{colOpts}
                  </select>
                ))}
                <div style={{ fontSize: 11.5, color: C.mute }}>The players are the ones in your list below. Bars show where each ranks among everyone who passes the minimum sample; 100% is the highest number, which is not always the best result (a low ERA is good).</div>
              </>
            )}

            <label style={lab}>Who is included</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ ...inp, flex: 2 }} value={s.filterKey} onChange={e => set('filterKey', e.target.value)}>{colOpts}</select>
              <input style={{ ...inp, flex: 1 }} inputMode="decimal" placeholder="at least" value={s.filterMin} onChange={e => set('filterMin', e.target.value)} aria-label="Minimum" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <select style={{ ...inp, flex: 1 }} value={s.catKey} onChange={e => { set('catKey', e.target.value); set('catValue', '') }}><option value="">Everyone</option>{catOpts}</select>
              {s.catKey && <select style={{ ...inp, flex: 1 }} value={s.catValue} onChange={e => set('catValue', e.target.value)}><option value="">All</option>{catValues.map(v => <option key={v} value={v}>{v}</option>)}</select>}
            </div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>{rows.length} in the table after these · {plotted} shown</div>

            <label style={lab}>Text</label>
            <input style={inp} placeholder="Headline" value={s.title} onChange={e => set('title', e.target.value)} />
            <textarea style={{ ...inp, marginTop: 6, minHeight: 56, resize: 'vertical' }} placeholder="Subtitle" value={s.subtitle} onChange={e => set('subtitle', e.target.value)} />
            <button type="button" onClick={autoSubtitle} style={{ ...btnLite, marginTop: 6 }}>Write the subtitle for me</button>
            <input style={{ ...inp, marginTop: 6 }} placeholder={`Top-right label (${kicker || 'optional'})`} value={s.kicker} onChange={e => set('kicker', e.target.value)} />

            {isPoints && (
              <>
                <label style={lab}>Line and grid</label>
                <label style={chk}><input type="checkbox" checked={s.diagonal} onChange={e => set('diagonal', e.target.checked)} /> Diagonal line (where the two stats are equal)</label>
                {s.diagonal && <input style={{ ...inp, margin: '4px 0 6px' }} placeholder={`Line label (${diagLabel})`} value={s.diagLabel} onChange={e => set('diagLabel', e.target.value)} />}
                {s.diagonal && <label style={chk}><input type="checkbox" checked={s.equal} onChange={e => set('equal', e.target.checked)} /> Same scale on both axes</label>}
                <label style={chk}><input type="checkbox" checked={s.zeroLines} onChange={e => set('zeroLines', e.target.checked)} /> Darker lines at zero</label>
                <label style={chk}><input type="checkbox" checked={signedX} onChange={e => set('signedX', e.target.checked)} /> Show + and − on the x axis</label>
                <label style={chk}><input type="checkbox" checked={signedY} onChange={e => set('signedY', e.target.checked)} /> Show + and − on the y axis</label>
              </>
            )}

            {(isPoints || s.chart === 'bar' || s.chart === 'column' || s.chart === 'histogram' || s.chart === 'box') && (
              <>
                <label style={lab}>League reference lines</label>
                <label style={chk}><input type="checkbox" checked={s.refAvg} onChange={e => set('refAvg', e.target.checked)} /> League average{isPoints ? ' (both stats)' : ''}</label>
                {s.chart !== 'histogram' && <label style={chk}><input type="checkbox" checked={s.refMedian} onChange={e => set('refMedian', e.target.checked)} /> League median{isPoints ? ' (both stats)' : ''}</label>}
                <div style={{ fontSize: 11.5, color: C.mute }}>Taken from everyone who passes the minimum sample, not just the players you include.{(s.chart === 'bar' || s.chart === 'column') && s.groupKey ? ' Not drawn when the bars are groups.' : ''}</div>
              </>
            )}
            {s.chart === 'line' && <label style={chk}><input type="checkbox" checked={s.area} onChange={e => set('area', e.target.checked)} /> Fill under the lines</label>}
            {s.chart === 'table' && <label style={chk}><input type="checkbox" checked={s.heat} onChange={e => set('heat', e.target.checked)} /> Colour the cells by rank (darker is higher)</label>}

            <label style={lab}>{s.chart === 'line' ? 'Players to follow' : s.chart === 'compare' || s.chart === 'radar' ? 'Players to compare' : 'Players named'}</label>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 6 }}>{s.chart === 'compare' || s.chart === 'radar' ? 'Include 2 to 6 players by name; each gets a colour you can change.' : isPoints ? 'Click any dot in the picture to name it; click a named dot to remove its label.' : s.chart === 'line' ? 'Each player you include becomes a line (up to 8).' : 'Click a bar or row in the picture to highlight it.'}</div>
            {isPoints && (
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={{ ...inp, flex: 2 }} value={s.mode} onChange={e => { set('mode', e.target.value as HighlightMode); set('off', []) }}>
                  <option value="gap">Automatic: furthest from the diagonal</option><option value="top-y">Automatic: highest up</option><option value="bottom-y">Automatic: lowest down</option>
                  <option value="top-x">Automatic: furthest right</option><option value="bottom-x">Automatic: furthest left</option><option value="none">None (only the ones I click)</option>
                </select>
                <input style={{ ...inp, flex: 1 }} type="number" min={0} max={30} value={s.count} onChange={e => set('count', Math.max(0, Math.min(30, Number(e.target.value) || 0)))} aria-label="How many" />
              </div>
            )}
            <input style={{ ...inp, marginTop: 6 }} list="sb-names" placeholder="Include a player by name, then Enter" value={nameIn} onChange={e => setNameIn(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); includeName(nameIn) } }} />
            <datalist id="sb-names">{rows.map(r => <option key={`${r.name}${r.id}`} value={r.name} />)}</datalist>
            {(s.names.length > 0 || s.off.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {s.names.map((n, i) => {
                  const side = s.chart === 'compare' || s.chart === 'radar' || s.chart === 'line'
                  const now = pcolor(n) ?? (side ? PALETTE[i % PALETTE.length] : '#FF5722')
                  return (
                    <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${now}`, borderRadius: 999, padding: '2px 4px 2px 4px', background: '#fff' }}>
                      <input type="color" value={now} onChange={e => setS(p => ({ ...p, pcolors: { ...p.pcolors, [nameKey(n)]: e.target.value } }))} title={`Colour for ${n}`} aria-label={`Colour for ${n}`} style={{ width: 22, height: 22, padding: 0, border: 'none', borderRadius: 999, background: 'none', cursor: 'pointer' }} />
                      <button type="button" onClick={() => toggle(n)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: '2px 6px 2px 0' }} aria-label={`Remove ${n}`}>{n} ×</button>
                    </span>
                  )
                })}
                {Object.keys(s.pcolors).length > 0 && <button type="button" onClick={() => set('pcolors', {})} style={{ ...btnLite, padding: '3px 10px' }}>Reset colours</button>}
                {s.off.length > 0 && <button type="button" onClick={() => set('off', [])} style={{ ...btnLite, padding: '3px 10px' }}>Bring back {s.off.length} removed</button>}
                {s.names.length > 0 && <button type="button" onClick={() => set('names', [])} style={{ ...btnLite, padding: '3px 10px' }}>Clear my list</button>}
              </div>
            )}

            {s.chart !== 'compare' && s.chart !== 'radar' && (
              <label style={{ ...chk, marginTop: 10 }}><input type="checkbox" checked={s.onlyNames} onChange={e => set('onlyNames', e.target.checked)} /> Show only the players in my list{s.onlyNames && s.names.length === 0 ? ' (list is empty)' : ''}</label>
            )}
            <textarea style={{ ...inp, minHeight: 56, marginTop: 6, resize: 'vertical' }} placeholder={'Paste a list of names, one per line or separated by commas'} value={bulk} onChange={e => setBulk(e.target.value)} aria-label="List of names" />
            <button type="button" onClick={() => { const names = bulk.split(/[\n,;\t]+/).map(x => x.trim()).filter(Boolean); setS(p => ({ ...p, names: [...p.names, ...names.filter(n => !p.names.some(x => nameKey(x) === nameKey(n)))], off: p.off.filter(o => !names.some(n => nameKey(n) === nameKey(o))) })); setBulk('') }} disabled={!bulk.trim()} style={{ ...btnLite, marginTop: 6, opacity: bulk.trim() ? 1 : 0.5 }}>Include these players</button>
            {ds.cats.some(c => c.key === 'team') && (
              <select style={{ ...inp, marginTop: 8 }} value={teamIn} onChange={e => { const t = e.target.value; setTeamIn(''); if (!t) return; const mates = pool.filter(r => r.c.team === t).map(r => r.name); setS(p => ({ ...p, names: [...p.names, ...mates.filter(n => !p.names.some(x => nameKey(x) === nameKey(n)))].slice(0, 80) })) }}>
                <option value="">Include a whole team's players</option>
                {[...new Set(pool.map(r => r.c.team).filter(Boolean))].sort().map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            <label style={lab}>Your own numbers (DRS and others)</label>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 4 }}>Paste a table with a Name column and a header row, for example Name, DRS. Each number column becomes a stat you can choose, matched to players by name. They stay saved in this browser.</div>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder={'Name\tDRS\nPete Crow-Armstrong\t16\nJJ Wetherholt\t12'} value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <button type="button" onClick={includePaste} disabled={!pasteText.trim()} style={{ ...btnLite, marginTop: 6, opacity: pasteText.trim() ? 1 : 0.5 }}>Save these numbers</button>
            {pasteMsg && <div style={{ fontSize: 12, color: '#5B5347', marginTop: 6 }}>{pasteMsg}</div>}
            {pastes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {pastes.map(p => <button key={p.key} type="button" onClick={() => setPastes(q => q.filter(x => x.key !== p.key))} style={{ ...btnLite, padding: '3px 10px' }} aria-label={`Remove ${p.label}`}>{p.label} ({p.values.size}) ×</button>)}
              </div>
            )}
            <details style={{ marginTop: 8, fontSize: 12, color: '#5B5347', lineHeight: 1.5 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>About DRS</summary>
              Defensive Runs Saved (DRS) is loaded from The Fielding Bible archive (numbers from Sports Info Solutions) for any season back to 2015. It is its own table and is also joined, by player name, onto the fielding runs (FRV) and outs above average tables. A name spelled differently on the two sites is left without a DRS figure. Use the box above only for numbers from somewhere else.
            </details>
            <button type="button" onClick={drsPreset} style={{ ...btnLite, marginTop: 10, width: '100%' }} title="Recreate the DRS vs FRV chart">Set up the DRS vs FRV chart</button>

            <label style={lab}>Picture</label>
            <select style={inp} value={s.size} onChange={e => set('size', e.target.value as SizeId)}>{(Object.keys(SIZES) as SizeId[]).map(k => <option key={k} value={k}>{SIZES[k].label}</option>)}</select>
            <label style={{ ...chk, marginTop: 8 }}><input type="checkbox" checked={hi} onChange={e => setHi(e.target.checked)} /> Double resolution (2×)</label>
          </>
        )}
      </aside>

      <section style={{ minWidth: 0 }}>
        {warnings.length > 0 && ds && (
          <ul style={{ margin: '0 0 12px', padding: '10px 14px 10px 30px', background: '#FEF9C3', border: '1px solid #e8dc7a', borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>{warnings.map(w => <li key={w}>{w}</li>)}</ul>
        )}
        <div ref={holder} style={{ border: `1px dashed ${C.line}`, borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
          {!ds ? <div style={{ padding: 40, textAlign: 'center', color: C.mute, fontSize: 14 }}>{state === 'loading' ? 'Loading…' : 'Choose a table to begin.'}</div> : (
            <div style={{ width: size.w * scale, height: size.h * scale }}>
              <div ref={frame} style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left', background: GT.paper, color: GT.ink, fontFamily: SANS, boxSizing: 'border-box', padding: '36px 40px 0', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: SANS }}>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>x9<span style={{ color: GT.accent }}>Lab</span></div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.12em', color: GT.muted, textTransform: 'uppercase', maxWidth: '68%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kicker}</div>
                </div>
                <div style={{ height: size.head - 62, overflow: 'hidden', marginTop: 8, fontFamily: SANS }}>
                  <div style={{ fontSize: s.size === 'landscape' ? 38 : 44, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.08 }}>{s.title || 'Your headline here'}</div>
                  <div style={{ fontSize: 17, color: '#5B5347', marginTop: 8, lineHeight: 1.35 }}>{s.subtitle}</div>
                </div>
                {plot}
                <div style={{ position: 'absolute', left: 40, right: 40, bottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: GT.muted, fontFamily: SANS }}>
                  <span>{FOOTER_TEXT}</span><span style={{ fontWeight: 800, color: GT.accent }}>{HANDLE}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => download('png')} disabled={!ds || busy} style={{ ...btn, background: C.orange, color: '#1A1A1A', opacity: !ds || busy ? 0.5 : 1 }}>{busy ? 'Making the picture…' : `Download PNG (${hi ? size.w * 2 : size.w}×${hi ? size.h * 2 : size.h})`}</button>
          <button type="button" onClick={() => download('copy')} disabled={!ds || busy} style={{ ...btn, background: '#fff', color: C.ink, border: `1px solid ${C.ink}`, opacity: !ds || busy ? 0.5 : 1 }}>Copy picture</button>
          <button type="button" onClick={() => download('csv')} disabled={!ds} style={{ ...btn, background: '#fff', color: C.ink, border: `1px solid ${C.line}`, opacity: !ds ? 0.5 : 1 }}>Download the data (CSV)</button>
        </div>
        {exportErr && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: C.bad }}>{exportErr}</div>}
        <div style={{ fontSize: 12, color: C.mute, marginTop: 10, lineHeight: 1.5 }}>
          The footer and handle are fixed. Settings and pasted numbers are remembered in this browser. Every number is from the table shown (Baseball Savant, the MLB Stats API or The Fielding Bible / Sports Info Solutions, {SEASON}) or from what you pasted, so check pasted figures against their source before you publish.
        </div>
      </section>
    </div>
  )
}
