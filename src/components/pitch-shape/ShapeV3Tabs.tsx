'use client'

// src/components/pitch-shape/ShapeV3Tabs.tsx
//
// The extra tab contents for the v3 (story tabs) view of the Pitch Shape Lab, all plain data in, no fetching (the board is loaded once by the map component):
//   PlayersTab     who has an AVERAGE shape inside the window around the chosen spot (or anywhere in the league), with lenses that surface pitchers that get little attention, and a Compare button on every row
//   CompareTab     up to four pitchers side by side: their average shapes on one movement map and their numbers in one table, each difference taken from the first pitcher
//   SelectionBar   the breadcrumb that keeps your place: league, pitch, spot, pitcher; every step can be undone
// Descriptions of what already happened: shapes, results this season against what the shape produced, and how many leagues roster each pitcher. Nothing here forecasts.

import { useMemo, useState } from 'react'
import { C } from '@/components/team/ui'
import type { Board, BoardRow } from '@/lib/pitch-shape/results'
import ShapeMap from './ShapeMap'
import PlayerPhoto from './PlayerPhoto'
import PlateView from './PlateDots'
import HeatLegend from './HeatLegend'
import type { HeatBackdrop } from './ShapeMap'

type Pt = { hb: number; ivb: number }
export const CMP_MAX = 4
export const CMP_COLORS = ['#FF5722', '#2F6DB5', '#1D9E75', '#8A4FBF'] as const

const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const own = (r: BoardRow) => r.own.whiff ?? r.ownRaw.whiff
const shp = (r: BoardRow) => r.shape.whiff ?? r.shapeRaw.whiff
const verdictWord = (v: BoardRow['verdict']) => (v === 'ahead' ? 'Above his shape' : v === 'behind' ? 'Below his shape' : v === 'level' ? 'In line' : '—')
const verdictTone = (v: BoardRow['verdict']) => (v === 'ahead' ? { bg: '#E6F3EC', fg: '#13694F' } : v === 'behind' ? { bg: '#FBE9E5', fg: '#A8391F' } : { bg: C.soft, fg: '#5b5347' })

/** a pitcher that gets little attention: a strong shape (Shape Score 67+), rostered in under 30% of ESPN leagues (or not matched), and no All-Star or major award selection */
export const littleAttention = (r: BoardRow) => r.score != null && r.score >= 67 && (r.owned == null || r.owned < 30) && !(r.profile && (r.profile.allStars > 0 || r.profile.major))

const LENSES = {
  all: { label: 'Everyone', blurb: 'Every pitcher whose average shape is in the window.' },
  radar: { label: 'Strong shape, little attention', blurb: 'Shape Score 67+, rostered in under 30% of ESPN leagues, no All-Star or major award. A description of who gets attention, not a ranking of who is better.' },
  above: { label: 'Results above their shape', blurb: 'His own runs saved this season were more than 0.4 per 100 above what league pitches with his shape produced.' },
  below: { label: 'Results below their shape', blurb: 'His own runs saved this season were more than 0.4 per 100 below what league pitches with his shape produced.' },
} as const
type Lens = keyof typeof LENSES


// ---- shared row filters (Players and Fantasy tables) ----

const ROLE_WORD: Record<string, string> = { starter: 'Starter', closer: 'Closer', setup: 'Setup', reliever: 'Reliever' }
type Filters = { q: string; team: string; role: string; minPitches: number; veloMin: string; veloMax: string; rosteredMax: number | null; scoreMin: number; hideKnown: boolean }
const NO_FILTERS: Filters = { q: '', team: '', role: '', minPitches: 0, veloMin: '', veloMax: '', rosteredMax: null, scoreMin: 0, hideKnown: false }
const filtersOn = (f: Filters) => JSON.stringify(f) !== JSON.stringify(NO_FILTERS)

function applyFilters(rows: BoardRow[], f: Filters): BoardRow[] {
  const q = f.q.trim().toLowerCase(), vmin = f.veloMin === '' ? null : Number(f.veloMin), vmax = f.veloMax === '' ? null : Number(f.veloMax)
  return rows.filter(r =>
    (!q || r.name.toLowerCase().includes(q)) && (!f.team || r.teamAbbr === f.team) && (!f.role || r.role === f.role) && r.pitches >= f.minPitches
    && (vmin == null || (r.velo != null && r.velo >= vmin)) && (vmax == null || (r.velo != null && r.velo <= vmax))
    && (f.rosteredMax == null || (r.owned != null && r.owned < f.rosteredMax) || (r.owned == null && f.rosteredMax != null))
    && (f.scoreMin === 0 || (r.score != null && r.score >= f.scoreMin))
    && (!f.hideKnown || !(r.profile && (r.profile.allStars > 0 || r.profile.major))))
}

const fieldStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', color: C.ink, minHeight: 40 }
const labelStyle: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', display: 'block', marginBottom: 3 }

/** The filter bar: name, team, role, minimum pitches, speed range, how widely rostered, Shape Score, and a switch to leave out pitchers with an All-Star or major award. Everything narrows the rows below it. */
function FilterBar({ rows, f, setF, count, total }: { rows: BoardRow[]; f: Filters; setF: (f: Filters) => void; count: number; total: number }) {
  const teams = useMemo(() => [...new Set(rows.map(r => r.teamAbbr).filter(Boolean))].sort(), [rows])
  const set = (patch: Partial<Filters>) => setF({ ...f, ...patch })
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 12px' }}>
        <label><span style={labelStyle}>Name</span><input value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Search a pitcher" style={fieldStyle} /></label>
        <label><span style={labelStyle}>Team</span><select value={f.team} onChange={e => set({ team: e.target.value })} style={fieldStyle}><option value="">Any team</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label><span style={labelStyle}>Role</span><select value={f.role} onChange={e => set({ role: e.target.value })} style={fieldStyle}><option value="">Any role</option>{Object.entries(ROLE_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span style={labelStyle}>Pitches thrown</span><select value={f.minPitches} onChange={e => set({ minPitches: Number(e.target.value) })} style={fieldStyle}>{[0, 100, 200, 300, 500, 800].map(n => <option key={n} value={n}>{n === 0 ? 'Any amount' : `${n}+ pitches`}</option>)}</select></label>
        <label><span style={labelStyle}>Speed (mph)</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <input value={f.veloMin} onChange={e => set({ veloMin: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="from" inputMode="decimal" style={fieldStyle} aria-label="Slowest average speed" />
            <input value={f.veloMax} onChange={e => set({ veloMax: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="to" inputMode="decimal" style={fieldStyle} aria-label="Fastest average speed" />
          </span></label>
        <label><span style={labelStyle}>Rostered in ESPN leagues</span><select value={f.rosteredMax ?? ''} onChange={e => set({ rosteredMax: e.target.value === '' ? null : Number(e.target.value) })} style={fieldStyle}><option value="">Any amount</option><option value="5">Under 5%</option><option value="15">Under 15%</option><option value="30">Under 30%</option><option value="50">Under 50%</option></select></label>
        <label><span style={labelStyle}>Shape Score</span><select value={f.scoreMin} onChange={e => set({ scoreMin: Number(e.target.value) })} style={fieldStyle}>{[0, 50, 67, 80, 90].map(n => <option key={n} value={n}>{n === 0 ? 'Any score' : `${n}+`}</option>)}</select></label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 10, fontSize: 13, color: '#5b5347' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={f.hideKnown} onChange={e => set({ hideKnown: e.target.checked })} /> Leave out pitchers with an All-Star or major award</label>
        <span><b style={{ color: C.ink }}>{count}</b> of {total} pitchers match</span>
        {filtersOn(f) && <button type="button" onClick={() => setF(NO_FILTERS)} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear filters</button>}
      </div>
    </div>
  )
}

type SortDir = 1 | -1
/** a header that sorts its column; the arrow shows the direction and aria-sort tells screen readers */
function SortTh({ label, k, sort, setSort, left = false, th }: { label: string; k: string; sort: { key: string; dir: SortDir }; setSort: (s: { key: string; dir: SortDir }) => void; left?: boolean; th: React.CSSProperties }) {
  const on = sort.key === k
  return (
    <th aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} style={{ ...th, textAlign: left ? 'left' : 'right' }}>
      <button type="button" onClick={() => setSort({ key: k, dir: on ? ((sort.dir * -1) as SortDir) : k === 'name' ? 1 : -1 })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 800 }}>{label}{on ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
    </th>
  )
}
const sortVal = (r: BoardRow, k: string): number | string | null => {
  switch (k) {
    case 'name': return r.name
    case 'pitches': return r.pitches
    case 'velo': return r.velo
    case 'ivb': return r.ivb
    case 'hb': return r.hb
    case 'whiff': return own(r)
    case 'score': return r.score
    case 'gap': return r.gap
    case 'owned': return r.owned
    case 'ip': return r.stats?.ip ?? null
    case 'era': return r.stats?.era ?? null
    case 'xera': return r.stats?.xera ?? null
    case 'fip': return r.stats?.fip ?? null
    case 'eraGap': return r.stats?.era != null && r.stats?.xera != null ? r.stats.era - r.stats.xera : null
    default: return null
  }
}
function sortRows(rows: BoardRow[], sort: { key: string; dir: SortDir } | null): BoardRow[] {
  if (!sort) return rows
  return [...rows].sort((x, y) => {
    const a = sortVal(x, sort.key), b = sortVal(y, sort.key)
    if (a == null && b == null) return 0
    if (a == null) return 1   // blanks sort last whichever way the column runs
    if (b == null) return -1
    return (typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b) * sort.dir
  })
}

export function PlayersTab({ board, sel, win, lc, cmp, onToggleCmp, onOpen, onClearSpot }: {
  board: Board | null | undefined; sel: Pt | null; win: number; lc: string
  cmp: number[]; onToggleCmp: (id: number) => void; onOpen: (id: number) => void; onClearSpot: () => void
}) {
  const [lens, setLens] = useState<Lens>(sel ? 'all' : 'radar')
  const [scope, setScope] = useState<'spot' | 'league'>('spot')
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)
  const useSpot = scope === 'spot' && sel != null
  const base = useMemo(() => {
    if (!board) return []
    let r = board.rows
    if (useSpot && sel) r = r.filter(x => Math.abs(x.hb - sel.hb) <= win && Math.abs(x.ivb - sel.ivb) <= win)
    if (lens === 'radar') r = r.filter(littleAttention)
    else if (lens === 'above') r = r.filter(x => x.verdict === 'ahead')
    else if (lens === 'below') r = r.filter(x => x.verdict === 'behind')
    return r
  }, [board, sel, win, lens, useSpot])
  const filtered = useMemo(() => applyFilters(base, f), [base, f])
  const rows = useMemo(() => sortRows(filtered, sort ?? { key: lens === 'radar' ? 'score' : lens === 'below' ? 'gap' : lens === 'above' ? 'gap' : 'pitches', dir: lens === 'below' ? 1 : -1 }), [filtered, sort, lens])
  const inWindow = useMemo(() => (board && sel ? board.rows.filter(x => Math.abs(x.hb - sel.hb) <= win && Math.abs(x.ivb - sel.ivb) <= win).length : 0), [board, sel, win])
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' })
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const eff: { key: string; dir: SortDir } = sort ?? { key: lens === 'radar' ? 'score' : lens === 'above' || lens === 'below' ? 'gap' : 'pitches', dir: lens === 'below' ? 1 : -1 }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <div role="group" aria-label="Where to look" style={{ display: 'flex', gap: 6 }}>
          <button type="button" aria-pressed={useSpot} disabled={!sel} onClick={() => setScope('spot')} style={{ ...pill(useSpot), opacity: sel ? 1 : 0.5 }}>Near the spot I chose{sel ? ` (${inWindow})` : ''}</button>
          <button type="button" aria-pressed={!useSpot} onClick={() => setScope('league')} style={pill(!useSpot)}>Whole league</button>
        </div>
        {sel && <span style={{ fontSize: 13, color: '#5b5347' }}>Spot: <b style={{ color: C.ink }}>{sel.ivb.toFixed(1)} in ride, {Math.abs(sel.hb).toFixed(1)} in run</b> toward the {sel.hb >= 0 ? 'arm' : 'glove'} side, window {win} in. <button type="button" onClick={onClearSpot} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear spot</button></span>}
      </div>
      <div role="group" aria-label="Lens" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 4px' }}>
        {(Object.keys(LENSES) as Lens[]).map(k => <button key={k} type="button" aria-pressed={lens === k} onClick={() => { setLens(k); setSort(null) }} style={pill(lens === k)}>{LENSES[k].label}</button>)}
      </div>
      <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 10px', lineHeight: 1.5 }}>{LENSES[lens].blurb} Use <b>Compare</b> on any row to line pitchers up side by side.</p>
      {board && <FilterBar rows={base} f={f} setF={setF} count={rows.length} total={base.length} />}
      {board === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Loading the pitchers…</div>
        : !board ? <div style={{ fontSize: 13, color: '#5b5347' }}>No pitchers are scored for this pitch yet. Nothing is estimated in its place.</div>
        : rows.length === 0 ? (
          <div style={{ fontSize: 14, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '12px 14px', lineHeight: 1.55 }}>
            <b>No pitcher fits.</b> {filtersOn(f) ? <>The filters leave nobody. <button type="button" onClick={() => setF(NO_FILTERS)} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear filters</button> </> : useSpot ? <>No pitcher’s <i>average</i> {lc} is within {win} in of this spot{lens === 'all' ? '' : ' with this lens on'}. Some pitchers may still throw it now and then; the Map tab counts those separately. </> : <>No pitcher in the league fits this lens right now. </>}
            {useSpot && !filtersOn(f) && <button type="button" onClick={() => setScope('league')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Look across the whole league →</button>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 900 }}>
              <thead><tr>
                <SortTh label="Pitcher" k="name" sort={eff} setSort={setSort} left th={th} /><SortTh label="Pitches" k="pitches" sort={eff} setSort={setSort} th={th} /><SortTh label="Speed" k="velo" sort={eff} setSort={setSort} th={th} /><SortTh label="Ride" k="ivb" sort={eff} setSort={setSort} th={th} /><SortTh label="Run" k="hb" sort={eff} setSort={setSort} th={th} />
                <SortTh label="His whiffs / swing" k="whiff" sort={eff} setSort={setSort} th={th} /><SortTh label="Shape Score" k="score" sort={eff} setSort={setSort} th={th} /><SortTh label="Against his shape" k="gap" sort={eff} setSort={setSort} th={th} /><SortTh label="Rostered" k="owned" sort={eff} setSort={setSort} th={th} /><th style={{ ...th, textAlign: 'right' }}>Compare</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 40).map(r => {
                  const on = cmp.includes(r.pitcherId), full = !on && cmp.length >= CMP_MAX, tone = verdictTone(r.verdict)
                  return (
                    <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: '8px', textAlign: 'left' }}>
                        <button type="button" onClick={() => onOpen(r.pitcherId)} title="Open his story" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PlayerPhoto id={r.pitcherId} size={32} />
                          <span><b style={{ color: C.ink, textDecoration: 'underline', textDecorationColor: C.line, textUnderlineOffset: 3 }}>{r.name}</b> <span style={{ color: C.mute }}>{r.teamAbbr}{r.role ? ` · ${ROLE_WORD[r.role]}` : ''}</span></span>
                        </button>
                      </td>
                      <td style={td}>{r.pitches.toLocaleString('en-US')}</td>
                      <td style={td}>{r.velo == null ? '—' : r.velo.toFixed(1)}</td>
                      <td style={td}>{r.ivb.toFixed(1)}</td>
                      <td style={td}>{r.hb.toFixed(1)}</td>
                      <td style={td}><b>{pc(own(r))}</b></td>
                      <td style={td}><b>{r.score ?? '—'}</b></td>
                      <td style={td}><span style={{ background: tone.bg, color: tone.fg, fontWeight: 800, fontSize: 12, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{verdictWord(r.verdict)}{r.gap != null && r.verdict !== 'level' ? ` ${signed(r.gap)}` : ''}</span></td>
                      <td style={td}>{r.owned == null ? <span style={{ color: C.faint }} title="No ESPN match">—</span> : `${Math.round(r.owned)}%`}</td>
                      <td style={td}><button type="button" aria-pressed={on} disabled={full} onClick={() => onToggleCmp(r.pitcherId)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${on ? C.orange : C.line}`, background: on ? C.orange : '#fff', color: on ? '#fff' : full ? C.faint : C.ink, fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap', cursor: full ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{on ? 'Chosen ✓' : full ? 'Full' : '+ Compare'}</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 40 && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>Showing 40 of {rows.length}. Narrow the filters, or use the Leaderboard tab to sort everyone.</div>}
          </div>
        )}
      <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '8px 0 0' }}>
        “Average shape” is the typical ride and run of the pitch over the pitcher’s season, so a pitcher is listed when that average falls inside the window. Pitches with 100+ thrown are listed; “against his shape” is judged from 300+ and a gap counts only beyond 0.4 runs per 100. Rostered is the share of ESPN fantasy leagues that roster him; a dash means no ESPN match. Click a heading to sort.
      </p>
    </div>
  )
}

// ---- Fantasy: the league view and the single-pitcher view ----

const FLENS = {
  all: { label: 'Everyone', blurb: 'Every pitcher with enough of this pitch to be scored.' },
  few: { label: 'Rostered in few leagues', blurb: 'Rostered in under 30% of ESPN leagues (or not matched to an ESPN player).' },
  strong: { label: 'Strong shape (67+)', blurb: 'Shape Score 67 or higher: league pitches with this shape have saved runs.' },
  worse: { label: 'ERA above xERA', blurb: 'ERA at least 0.4 runs above xERA: the results were worse than the quality of contact allowed would usually give.' },
  better: { label: 'ERA below xERA', blurb: 'ERA at least 0.4 runs below xERA: the results were better than the quality of contact allowed would usually give.' },
} as const
type FLens = keyof typeof FLENS
const eraGap = (r: BoardRow) => (r.stats?.era != null && r.stats?.xera != null ? r.stats.era - r.stats.xera : null)
const n2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

/** The league fantasy view: how widely each pitcher is rostered, his role, season ERA / xERA / FIP and the gap between ERA and xERA, next to his Shape Score. Descriptions of the season so far, with the same filters as the Players tab. */
export function FantasyTab({ board, lc, cmp, onToggleCmp, onOpen }: { board: Board | null | undefined; lc: string; cmp: number[]; onToggleCmp: (id: number) => void; onOpen: (id: number) => void }) {
  const [lens, setLens] = useState<FLens>('few')
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)
  const base = useMemo(() => {
    if (!board) return []
    const r = board.rows
    if (lens === 'few') return r.filter(x => x.owned == null || x.owned < 30)
    if (lens === 'strong') return r.filter(x => x.score != null && x.score >= 67)
    if (lens === 'worse') return r.filter(x => { const g = eraGap(x); return g != null && g >= 0.4 })
    if (lens === 'better') return r.filter(x => { const g = eraGap(x); return g != null && g <= -0.4 })
    return r
  }, [board, lens])
  const filtered = useMemo(() => applyFilters(base, f), [base, f])
  const eff: { key: string; dir: SortDir } = sort ?? { key: lens === 'few' || lens === 'strong' ? 'score' : lens === 'worse' ? 'eraGap' : lens === 'better' ? 'eraGap' : 'ip', dir: lens === 'better' ? 1 : -1 }
  const rows = useMemo(() => sortRows(filtered, eff), [filtered, eff.key, eff.dir]) // eslint-disable-line react-hooks/exhaustive-deps
  const pill = (on: boolean): React.CSSProperties => ({ minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? C.cream : C.ink, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' })
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', padding: '6px 8px', borderBottom: `2px solid ${C.ink}`, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div>
      <div role="group" aria-label="Fantasy lens" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 4px' }}>
        {(Object.keys(FLENS) as FLens[]).map(k => <button key={k} type="button" aria-pressed={lens === k} onClick={() => { setLens(k); setSort(null) }} style={pill(lens === k)}>{FLENS[k].label}</button>)}
      </div>
      <p style={{ fontSize: 12.5, color: '#5b5347', margin: '0 0 10px', lineHeight: 1.5 }}>{FLENS[lens].blurb} This describes the season so far; it is not a forecast.</p>
      {board && <FilterBar rows={base} f={f} setF={setF} count={rows.length} total={base.length} />}
      {board === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Loading the pitchers…</div>
        : !board ? <div style={{ fontSize: 13, color: '#5b5347' }}>No pitchers are scored for this pitch yet. Nothing is estimated in its place.</div>
        : rows.length === 0 ? <div style={{ fontSize: 14, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '12px 14px' }}><b>No pitcher fits.</b> {filtersOn(f) ? <button type="button" onClick={() => setF(NO_FILTERS)} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear filters</button> : 'Try a different lens.'}</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 980 }}>
              <thead><tr>
                <SortTh label="Pitcher" k="name" sort={eff} setSort={setSort} left th={th} /><SortTh label="Rostered" k="owned" sort={eff} setSort={setSort} th={th} /><SortTh label="Innings" k="ip" sort={eff} setSort={setSort} th={th} />
                <SortTh label="ERA" k="era" sort={eff} setSort={setSort} th={th} /><SortTh label="xERA" k="xera" sort={eff} setSort={setSort} th={th} /><SortTh label="FIP" k="fip" sort={eff} setSort={setSort} th={th} /><SortTh label="ERA − xERA" k="eraGap" sort={eff} setSort={setSort} th={th} />
                <SortTh label="Shape Score" k="score" sort={eff} setSort={setSort} th={th} /><SortTh label="Against his shape" k="gap" sort={eff} setSort={setSort} th={th} /><th style={{ ...th, textAlign: 'right' }}>Compare</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 40).map(r => {
                  const on = cmp.includes(r.pitcherId), full = !on && cmp.length >= CMP_MAX, tone = verdictTone(r.verdict), g = eraGap(r)
                  return (
                    <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.line}` }}>
                      <td style={{ padding: '8px', textAlign: 'left' }}>
                        <button type="button" onClick={() => onOpen(r.pitcherId)} title="Open his story" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PlayerPhoto id={r.pitcherId} size={32} />
                          <span><b style={{ color: C.ink, textDecoration: 'underline', textDecorationColor: C.line, textUnderlineOffset: 3 }}>{r.name}</b> <span style={{ color: C.mute }}>{r.teamAbbr}{r.role ? ` · ${ROLE_WORD[r.role]}` : ''}</span></span>
                        </button>
                      </td>
                      <td style={td}>{r.owned == null ? <span style={{ color: C.faint }} title="No ESPN match">—</span> : <b>{Math.round(r.owned)}%</b>}</td>
                      <td style={td}>{r.stats?.ip == null ? '—' : r.stats.ip.toFixed(1)}</td>
                      <td style={td}>{n2(r.stats?.era)}</td><td style={td}>{n2(r.stats?.xera)}</td><td style={td}>{n2(r.stats?.fip)}</td>
                      <td style={{ ...td, fontWeight: 800, color: g == null || Math.abs(g) < 0.4 ? C.ink : g > 0 ? '#A8391F' : '#13694F' }}>{g == null ? '—' : signed(g)}</td>
                      <td style={td}><b>{r.score ?? '—'}</b></td>
                      <td style={td}><span style={{ background: tone.bg, color: tone.fg, fontWeight: 800, fontSize: 12, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{verdictWord(r.verdict)}</span></td>
                      <td style={td}><button type="button" aria-pressed={on} disabled={full} onClick={() => onToggleCmp(r.pitcherId)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1.5px solid ${on ? C.orange : C.line}`, background: on ? C.orange : '#fff', color: on ? '#fff' : full ? C.faint : C.ink, fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap', cursor: full ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{on ? 'Chosen ✓' : full ? 'Full' : '+ Compare'}</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 40 && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>Showing 40 of {rows.length}. Narrow the filters to see the rest.</div>}
          </div>
        )}
      <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '8px 0 0' }}>
        Listed pitchers have enough {lc}s to be scored. ERA, xERA, FIP and innings are the {board ? board.season : 'current'} season (xERA is Statcast’s expected ERA from the quality of contact, strikeouts and walks; FIP uses only strikeouts, walks, hit batters and home runs). ERA − xERA above zero means results were worse than the contact quality; below zero, better. Rostered is the share of ESPN leagues that roster him. Shape Score ranks the shape of this one pitch, not the pitcher’s whole season, so read it beside his other pitches.
      </p>
    </div>
  )
}

/** One pitcher's fantasy profile: how widely he is rostered, his role, his season line against what his contact quality and strikeouts and walks usually give, and the pitchers whose shape is closest to his with the same facts. */
export function PlayerFantasy({ row, board, lc, onOpen }: { row: BoardRow | null; board: Board | null | undefined; lc: string; onOpen: (id: number) => void }) {
  if (board === undefined) return <div style={{ fontSize: 13, color: C.mute }}>Reading his season…</div>
  if (!row) return <div style={{ fontSize: 14, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '12px 14px', lineHeight: 1.55 }}><b>No fantasy profile for this pitch.</b> He is not on the {lc} board (it needs {100}+ of the pitch), so his season line and rostered share are not shown here. Nothing is estimated in its place.</div>
  const st = row.stats, g = eraGap(row)
  const near = (board?.rows ?? []).filter(r => r.pitcherId !== row.pitcherId).map(r => ({ r, d: Math.hypot(r.hb - row.hb, r.ivb - row.ivb) })).sort((a, b) => a.d - b.d).slice(0, 6)
  const tile: React.CSSProperties = { background: C.soft, borderRadius: 6, padding: '10px 12px' }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase' }
  const big: React.CSSProperties = { fontSize: 26, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={tile}><div style={k}>Rostered</div><div style={big}>{row.owned == null ? '—' : `${Math.round(row.owned)}%`}</div><div style={{ fontSize: 12, color: '#5b5347' }}>{row.owned == null ? 'No ESPN match' : 'of ESPN leagues'}</div></div>
        <div style={tile}><div style={k}>Role</div><div style={{ ...big, fontSize: 22 }}>{row.role ? ROLE_WORD[row.role] : '—'}</div><div style={{ fontSize: 12, color: '#5b5347' }}>{st?.ip == null ? 'no innings found' : `${st.ip.toFixed(1)} innings`}</div></div>
        <div style={tile}><div style={k}>ERA · xERA · FIP</div><div style={{ ...big, fontSize: 21 }}>{n2(st?.era)} · {n2(st?.xera)} · {n2(st?.fip)}</div><div style={{ fontSize: 12, color: '#5b5347' }}>{board ? board.season : ''} season</div></div>
        <div style={tile}><div style={k}>Shape Score</div><div style={big}>{row.score ?? '—'}</div><div style={{ fontSize: 12, color: '#5b5347' }}>{lc} only, 1 to 99</div></div>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.6, color: '#3d382f', maxWidth: 900 }}>
        {st?.era != null && st?.xera != null && g != null ? <>His ERA is <b>{n2(st.era)}</b> against an xERA of <b>{n2(st.xera)}</b>{st.fip != null ? <> and a FIP of <b>{n2(st.fip)}</b></> : null}. {Math.abs(g) < 0.4 ? 'The two are close: his results lined up with the quality of contact he allowed.' : g > 0 ? `His ERA is ${g.toFixed(2)} runs above his xERA, so his results were worse than the contact quality he allowed would usually give.` : `His ERA is ${Math.abs(g).toFixed(2)} runs below his xERA, so his results were better than the contact quality he allowed would usually give.`} </> : 'His season line is not available here. '}
        {row.score != null ? <>His {lc} has a Shape Score of <b>{row.score}</b>{row.owned != null ? <> and he is rostered in <b>{Math.round(row.owned)}%</b> of ESPN leagues</> : null}. Shape Score covers one pitch, so it describes what the {lc} has produced, not his whole season.</> : null}
      </p>
      <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>Pitchers with the closest {lc} shape</h3>
      <div style={{ overflowX: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 560, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr>{['Pitcher', 'Distance (in)', 'Rostered', 'ERA', 'xERA', 'Shape Score'].map((h, i) => <th key={h} style={{ fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}` }}>{h}</th>)}</tr></thead>
          <tbody>{near.map(({ r, d }) => (
            <tr key={r.pitcherId} style={{ borderBottom: `1px solid ${C.soft}` }}>
              <td style={{ padding: '8px' }}><button type="button" onClick={() => onOpen(r.pitcherId)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 800, textDecoration: 'underline', textDecorationColor: C.line, textUnderlineOffset: 3 }}>{r.name}</button> <span style={{ color: C.mute }}>{r.teamAbbr}</span></td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{d.toFixed(1)}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{r.owned == null ? '—' : `${Math.round(r.owned)}%`}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{n2(r.stats?.era)}</td><td style={{ padding: '8px', textAlign: 'right' }}>{n2(r.stats?.xera)}</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>{r.score ?? '—'}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '6px 0 0' }}>Distance is how far each pitcher’s average ride and run are from his, in inches. This describes the season so far; it is not a forecast.</p>
    </div>
  )
}

export function CompareTab({ board, ids, onToggle, onOpen, lc, heat, legendScaled = false, type, hand, pitchName, radius, level }: { board: Board | null | undefined; ids: number[]; onToggle: (id: number) => void; onOpen: (id: number) => void; lc: string; heat: HeatBackdrop | null; legendScaled?: boolean; type: string; hand: 'R' | 'L'; pitchName: string; radius: number; level: string }) {
  const [q, setQ] = useState('')
  const chosen = ids.map(id => board?.rows.find(r => r.pitcherId === id)).filter((r): r is BoardRow => !!r)
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!board || t.length < 2) return []
    return board.rows.filter(r => !ids.includes(r.pitcherId) && r.name.toLowerCase().includes(t)).slice(0, 6)
  }, [board, q, ids])
  const base = chosen[0] ?? null
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: '#6b6355', textTransform: 'uppercase', textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${C.ink}` }
  const td: React.CSSProperties = { padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  type Line = { label: string; get: (r: BoardRow) => number | null; fmt: (v: number) => string; diff: (d: number) => string }
  const lines: Line[] = [
    { label: 'Pitches', get: r => r.pitches, fmt: v => v.toLocaleString('en-US'), diff: d => `${d >= 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-US')}` },
    { label: 'Speed (mph)', get: r => r.velo, fmt: v => v.toFixed(1), diff: d => signed(d, 1) },
    { label: 'Ride (in)', get: r => r.ivb, fmt: v => v.toFixed(1), diff: d => signed(d, 1) },
    { label: 'Run (in, arm side +)', get: r => r.hb, fmt: v => v.toFixed(1), diff: d => signed(d, 1) },
    { label: 'Arm angle (°)', get: r => r.slot, fmt: v => String(Math.round(v)), diff: d => signed(d, 0) },
    { label: 'His whiffs per swing', get: own, fmt: v => `${(v * 100).toFixed(1)}%`, diff: d => `${signed(d * 100, 1)} pts` },
    { label: 'Whiffs per swing for his shape', get: shp, fmt: v => `${(v * 100).toFixed(1)}%`, diff: d => `${signed(d * 100, 1)} pts` },
    { label: 'His runs saved per 100', get: r => r.own.saved, fmt: v => signed(v), diff: d => signed(d) },
    { label: 'Shape runs saved per 100', get: r => r.shape.saved, fmt: v => signed(v), diff: d => signed(d) },
    { label: 'Gap: his minus shape', get: r => r.gap, fmt: v => signed(v), diff: d => signed(d) },
    { label: 'Shape Score (1–99)', get: r => r.score, fmt: v => String(v), diff: d => signed(d, 0) },
    { label: 'Rostered in ESPN leagues', get: r => r.owned, fmt: v => `${Math.round(v)}%`, diff: d => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))} pts` },
  ]
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>Choose up to {CMP_MAX} pitchers with <b>+ Compare</b> in the Players tab, or search below. Each difference is measured from the first pitcher (the orange one).</p>
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search a pitcher who throws a ${lc}…`} aria-label="Search pitchers to compare" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
        {hits.length > 0 && (
          <div style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 5, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
            {hits.map(h => <button key={h.pitcherId} type="button" disabled={ids.length >= CMP_MAX} onClick={() => { onToggle(h.pitcherId); setQ('') }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderBottom: `1px solid ${C.soft}`, background: 'none', padding: '10px 12px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{h.name} <span style={{ color: C.mute }}>{h.teamAbbr} · {h.pitches.toLocaleString('en-US')} pitches</span></button>)}
          </div>
        )}
      </div>
      {board === undefined ? <div style={{ fontSize: 13, color: C.mute }}>Loading the pitchers…</div>
        : chosen.length === 0 ? <div style={{ fontSize: 14, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '12px 14px', lineHeight: 1.55 }}><b>Nobody to compare yet.</b> Choose a spot on the map, open the Players tab, and press <b>+ Compare</b> on two or more pitchers, or search above.</div>
        : (
          <div className="psl-cmp" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,420px) minmax(0,1fr)', gap: 22, alignItems: 'start' }}>
            <style>{'@media(max-width:1000px){.psl-cmp{grid-template-columns:1fr !important}}'}</style>
            <div>
              <ShapeMap label={`Average ${lc} shapes of ${chosen.map(r => r.name).join(', ')}: ride up, run toward the arm side`} minRange={10}
                heat={heat}
                rings={chosen.map((r, i) => ({ hb: r.hb, ivb: r.ivb, color: CMP_COLORS[i % CMP_COLORS.length], label: r.name.split(' ').slice(-1)[0], strong: i === 0 }))}
                box={base ? { hb: base.hb, ivb: base.ivb, rx: 1, ry: 1 } : null} />
              <div style={{ marginTop: 6 }}><HeatLegend metric="whiff" def={heat?.def} scaled={legendScaled} compact /></div>
              <div style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, marginTop: 4 }}>The colours behind are the league heat map of whiffs per swing. Each ring is a pitcher’s average {lc}; the dashed box is the ±1 in window used to find league pitches with the first pitcher’s shape. The closer two rings, the more alike the shapes, and the same colour under them means hitters missed similar shapes about as often.</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 420 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>Measure</th>
                  {chosen.map((r, i) => (
                    <th key={r.pitcherId} style={{ ...th, color: CMP_COLORS[i % CMP_COLORS.length] }}>
                      <button type="button" onClick={() => onOpen(r.pitcherId)} title="Open his story" style={{ all: 'unset', cursor: 'pointer', fontWeight: 800, textTransform: 'none', fontSize: 13.5 }}>{r.name}</button><br />
                      <button type="button" onClick={() => onToggle(r.pitcherId)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: C.mute, textTransform: 'none', fontWeight: 600 }}>remove ✕</button>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.label} style={{ borderBottom: `1px solid ${C.soft}` }}>
                      <td style={{ padding: '8px', color: '#5b5347' }}>{l.label}</td>
                      {chosen.map((r, i) => {
                        const v = l.get(r), b = base ? l.get(base) : null
                        return <td key={r.pitcherId} style={td}><b>{v == null ? '—' : l.fmt(v)}</b>{i > 0 && v != null && b != null && <span style={{ display: 'block', fontSize: 11, color: '#2F6DB5', fontWeight: 700 }}>{l.diff(v - b)}</span>}</td>
                      })}
                    </tr>
                  ))}
                  <tr><td style={{ padding: '8px', color: '#5b5347' }}>Against his shape</td>{chosen.map(r => { const t = verdictTone(r.verdict); return <td key={r.pitcherId} style={td}><span style={{ background: t.bg, color: t.fg, fontWeight: 800, fontSize: 12, borderRadius: 4, padding: '2px 8px' }}>{verdictWord(r.verdict)}</span></td> })}</tr>
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, margin: '6px 0 0' }}>Results are each pitcher’s {board ? board.season : 'latest'} season; “for his shape” is what league pitches with his shape produced, all seasons together. Blue figures are the difference from the first pitcher. Describes what happened; it does not say who will do better.</p>
            </div>
          </div>
        )}
      {chosen.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Where does each shape cross the plate?</h3>
          <p style={{ margin: '2px 0 10px', fontSize: 13.5, color: '#5b5347', lineHeight: 1.5 }}>For each pitcher: where his {lc}s crossed the plate and what happened to each one, with a switch to the league heat map for pitches shaped like his (within {radius} in).</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {chosen.map((r, i) => (
              <div key={r.pitcherId}>
                <div style={{ fontWeight: 800, fontSize: 14, color: CMP_COLORS[i % CMP_COLORS.length], marginBottom: 4 }}>{r.name}</div>
                <PlateView id={r.pitcherId} name={r.name} type={type} level={level} season={board ? board.season : new Date().getFullYear()} hand={hand} probe={{ hb: r.hb, ivb: r.ivb }} radius={radius} pitchName={pitchName} defaultMode="dots" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** The place-keeping bar: league, pitch, spot, pitcher. Each step can be cleared without losing the others. */
export function SelectionBar({ league, spot, pitcher, onClearSpot, onClearPitcher, cmpCount, onOpenCompare }: {
  league: string; spot: Pt | null; pitcher: string | null; onClearSpot: () => void; onClearPitcher: () => void; cmpCount: number; onOpenCompare: () => void
}) {
  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 700 }
  const x: React.CSSProperties = { border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontSize: 13 }
  return (
    <nav aria-label="Your selection" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center', margin: '0 0 12px', fontSize: 13, color: '#5b5347' }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>Your selection</span>
      <span style={chip}>{league}</span>
      <span aria-hidden>›</span>
      <span style={chip}>{spot ? <>Spot {spot.ivb.toFixed(1)} in ride, {Math.abs(spot.hb).toFixed(1)} in run <button type="button" onClick={onClearSpot} aria-label="Clear the spot" style={x}>✕</button></> : <span style={{ color: C.mute, fontWeight: 600 }}>No spot yet: click the map</span>}</span>
      <span aria-hidden>›</span>
      <span style={chip}>{pitcher ? <>{pitcher} <button type="button" onClick={onClearPitcher} aria-label="Clear the pitcher" style={x}>✕</button></> : <span style={{ color: C.mute, fontWeight: 600 }}>No pitcher yet</span>}</span>
      {cmpCount > 0 && <button type="button" onClick={onOpenCompare} style={{ ...chip, cursor: 'pointer', borderColor: C.orange, color: C.orange, fontFamily: 'inherit' }}>Comparing {cmpCount} →</button>}
    </nav>
  )
}
