'use client'

// src/components/lab/dash/MoreVisuals.tsx
//
// The second batch of dashboard visuals. Each takes the same props as the
// originals ({ tile, ctx }) and shares the dashboard's club selection:
//   Hist       how the clubs are distributed on one number (selected clubs marked)
//   Radar      selected clubs vs the league middle across several numbers (percentiles)
//   Mix        pitch-mix donut for the selected clubs, or the whole league
//   Dumbbell   starters vs bullpen on one number, club by club
//   Movement   break map of each pitch type for the selected clubs / league
//   Heat       club × pitch-type grid of usage, whiff % or velocity

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar as RRadar, RadarChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, Empty, SANS } from '@/components/team/ui'
import { PITCH_COLOR, PITCH_NAME, PITCH_ORDER } from '@/lib/lab/pitch-meta'
import { fmt, type TeamSummary } from '@/lib/lab/team-summary'
import type { Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import type { Tile } from '@/components/lab/dash/types'
import { AXIS, NOTE, md, short, type Ctx } from '@/components/lab/dash/shared'

type P = { tile: Tile; ctx: Ctx }
const ORDER = (t: string) => { const i = PITCH_ORDER.indexOf(t); return i === -1 ? 99 : i }
const colorOf = (t: string) => PITCH_COLOR[t] ?? '#a89e8c'
const nameOf = (t: string) => PITCH_NAME[t] ?? t

type Pooled = {
  pitchType: string; pitches: number; usage: number
  velo: number | null; hb: number | null; vb: number | null
  relX: number | null; relZ: number | null; plX: number | null; plZ: number | null
  ax: number | null; az: number | null; ft: number | null
}
/** Pitch-count-weighted pool of several clubs' pitch-type rows (club figures averaged, not re-derived from raw pitches). */
function pool(list: TeamSummary[]): Pooled[] {
  const total = list.reduce((s, t) => s + t.pitches, 0)
  const KEYS = ['velo', 'hb', 'vb', 'relX', 'relZ', 'plX', 'plZ', 'ax', 'az', 'ft'] as const
  const acc = new Map<string, { n: number; w: Record<(typeof KEYS)[number], [number, number]> }>()
  for (const t of list) for (const r of t.rows) {
    const a = acc.get(r.pitchType) ?? { n: 0, w: Object.fromEntries(KEYS.map(k => [k, [0, 0]])) as Record<(typeof KEYS)[number], [number, number]> }
    a.n += r.pitches
    const src: Record<(typeof KEYS)[number], number | null> = { velo: r.veloAvg, hb: r.hBreak, vb: r.vBreak, relX: r.relSide, relZ: r.relHeight, plX: r.plateSide, plZ: r.plateHeight, ax: r.accSide, az: r.accVert, ft: r.flightSec }
    for (const k of KEYS) if (src[k] != null) { a.w[k][0] += (src[k] as number) * r.pitches; a.w[k][1] += r.pitches }
    acc.set(r.pitchType, a)
  }
  const f = (w: [number, number]) => (w[1] ? w[0] / w[1] : null)
  return [...acc.entries()].map(([pitchType, a]) => ({
    pitchType, pitches: a.n, usage: total ? (100 * a.n) / total : 0,
    velo: f(a.w.velo), hb: f(a.w.hb), vb: f(a.w.vb), relX: f(a.w.relX), relZ: f(a.w.relZ), plX: f(a.w.plX), plZ: f(a.w.plZ), ax: f(a.w.ax), az: f(a.w.az), ft: f(a.w.ft),
  })).sort((a, b) => ORDER(a.pitchType) - ORDER(b.pitchType))
}
function group(ctx: Ctx, role: Role): { list: TeamSummary[]; label: string } {
  const ids = ctx.sel.length ? ctx.sel : ctx.clubs.map(c => c.id)
  const list = ids.flatMap(id => { const s = ctx.summaryOf(role, id); return s ? [s] : [] })
  return { list, label: ctx.sel.length ? list.map(s => s.abbrev).join(', ') : `League · ${list.length} clubs` }
}

// ─── Histogram ────────────────────────────────────────────────────────────
export function Hist({ tile, ctx }: P) {
  const m = md(tile.x)
  const vals = useMemo(() => ctx.clubs.flatMap(t => { const v = ctx.val(tile.x, t.id); return v == null ? [] : [{ t, v }] }), [ctx, tile.x])
  if (vals.length < 3) return <Empty>{ctx.loading ? 'Loading clubs…' : 'Not enough clubs.'}</Empty>
  const lo = Math.min(...vals.map(r => r.v)), hi = Math.max(...vals.map(r => r.v))
  const BINS = 8, w = (hi - lo) / BINS || 1
  const bins = Array.from({ length: BINS }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, clubs: [] as string[], hit: false }))
  for (const { t, v } of vals) {
    const b = bins[Math.min(BINS - 1, Math.floor((v - lo) / w))]
    b.clubs.push(t.abbrev)
    if (ctx.sel.includes(t.id)) b.hit = true
  }
  const data = bins.map(b => ({ label: `${b.from.toFixed(m.decimals)}`, n: b.clubs.length, clubs: b.clubs, hit: b.hit, range: `${fmt(m, b.from)} – ${fmt(m, b.to)}` }))
  const avg = vals.reduce((s, r) => s + r.v, 0) / vals.length
  return (
    <>
      <div style={NOTE}>Number of clubs in each range · club average {fmt(m, avg)} · {vals.length} clubs</div>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#f1eee6" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} label={{ value: short(tile.x), position: 'bottom', offset: 4, style: AXIS }} />
            <YAxis allowDecimals={false} tick={AXIS} width={26} />
            <Tooltip cursor={{ fill: '#f1eee6' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as (typeof data)[number]
              return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}><b>{d.range}</b><div style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 3, maxWidth: 220 }}>{d.clubs.join(', ') || 'No clubs'}</div></div>
            }} />
            <Bar dataKey="n" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.hit ? C.orange : '#cfc8b8'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// ─── Radar ────────────────────────────────────────────────────────────────
export function Radar({ tile, ctx }: P) {
  const cols = tile.cols.slice(0, 8)
  const picked = ctx.sel.slice(0, 3)
  const { data, series } = useMemo(() => {
    const series = picked.map(id => ({ id, team: ctx.clubs.find(c => c.id === id) })).filter(s => s.team)
    const data = cols.map((c, i) => {
      const all = ctx.clubs.flatMap(t => { const v = ctx.val(c, t.id); return v == null ? [] : [{ id: t.id, v }] })
      const row: Record<string, number | string | null> = { axis: short(c).replace(/ \((starters|bullpen)\)/, ' ($1)'), med: 50 }
      for (const s of series) {
        const mine = all.find(a => a.id === s.id)
        row[`p${s.id}`] = mine && all.length > 1 ? (all.filter(a => a.v < mine.v).length / (all.length - 1)) * 100 : null
        row[`v${s.id}`] = mine ? fmt(md(c), mine.v) : '—'
      }
      row.key = i
      return row
    })
    return { data, series }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, tile.cols, ctx.sel])
  if (ctx.clubs.length < 3) return <Empty>{ctx.loading ? 'Loading clubs…' : 'Not enough clubs.'}</Empty>
  return (
    <>
      <div style={NOTE}>{series.length ? series.map(s => s.team!.short).join(' · ') : 'Click up to 3 clubs in any visual to compare'} · dashed ring = league middle (50th percentile)</div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%">
            <PolarGrid stroke="#e7e2d8" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fontFamily: SANS, fill: '#5b5347' }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <RRadar dataKey="med" stroke="#a89e8c" strokeDasharray="4 3" fill="none" isAnimationActive={false} />
            {series.map(s => <RRadar key={s.id} name={s.team!.short} dataKey={`p${s.id}`} stroke={s.team!.primary_color} fill={s.team!.primary_color} fillOpacity={0.22} isAnimationActive={false} />)}
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as Record<string, string | number | null>
              return (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}>
                  <b>{d.axis}</b>
                  {series.map(s => <div key={s.id} style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 2 }}>{s.team!.short}: {d[`v${s.id}`]} · {Math.round(Number(d[`p${s.id}`] ?? 0))}th pct</div>)}
                </div>
              )
            }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div style={NOTE}>Percentile among the clubs shown: 100 = the highest number in the group, which is not always the better result.</div>
    </>
  )
}

// ─── Pitch-mix donut ──────────────────────────────────────────────────────
function Donut({ rows, height, legend }: { rows: Pooled[]; height: number; legend: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: legend ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', alignItems: 'center', gap: 8 }}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="usage" nameKey="pitchType" innerRadius="55%" outerRadius="92%" paddingAngle={1} isAnimationActive={false} stroke="#fff">
              {rows.map(r => <Cell key={r.pitchType} fill={colorOf(r.pitchType)} />)}
            </Pie>
            <Tooltip formatter={(v: unknown, n: unknown) => [`${Number(v).toFixed(1)}%`, nameOf(String(n))]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {legend && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map(r => (
            <div key={r.pitchType} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 7, alignItems: 'center', fontFamily: SANS, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(r.pitchType) }} />
              <span style={{ fontWeight: 600 }}>{nameOf(r.pitchType)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.usage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Mix({ tile, ctx }: P) {
  const role = ctx.force ?? tile.x.role
  const { list, label } = group(ctx, role)
  const rows = useMemo(() => pool(list).filter(r => r.usage >= 1), [list])
  // One donut per selected club (Phillies next to Braves) instead of one pooled donut.
  const split = tile.split !== false && ctx.sel.length >= 2
  const perClub = useMemo(() => (split ? list.map(s => ({ s, rows: pool([s]).filter(r => r.usage >= 1) })) : []), [split, list])
  const roleNote = role === 'all' ? '' : role === 'sp' ? ' · starters' : ' · bullpen'
  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No data.'}</Empty>
  if (split) {
    const used = [...new Set(perClub.flatMap(c => c.rows.map(r => r.pitchType)))].sort((a, b) => ORDER(a) - ORDER(b))
    return (
      <>
        <div style={NOTE}>One donut per selected club{roleNote}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 6 }}>
          {perClub.map(({ s, rows: r }) => (
            <div key={s.teamId} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13 }}>{s.name}</div>
              <Donut rows={r} height={150} legend={false} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontFamily: SANS, fontSize: 11.5, fontWeight: 600 }}>
          {used.map(t => <span key={t}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: colorOf(t), marginRight: 4 }} />{nameOf(t)}</span>)}
        </div>
      </>
    )
  }
  return (
    <>
      <div style={NOTE}>{label}{roleNote}{ctx.sel.length === 0 ? ' · select 2+ clubs to split into one donut each' : ''}</div>
      <Donut rows={rows} height={230} legend />
    </>
  )
}

// ─── Starters vs bullpen dumbbell ─────────────────────────────────────────
export function Dumbbell({ tile, ctx }: P) {
  const m = md(tile.x)
  const rows = useMemo(() => ctx.clubs.flatMap(t => {
    const sp = ctx.summaryOf('sp', t.id), rp = ctx.summaryOf('rp', t.id)
    const a = sp ? m.get(sp) : null, b = rp ? m.get(rp) : null
    return a != null && b != null ? [{ t, sp: a, rp: b }] : []
  }).sort((x, y) => (y.rp - y.sp) - (x.rp - x.sp)), [ctx, m])
  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No clubs have both numbers.'}</Empty>
  const all = rows.flatMap(r => [r.sp, r.rp])
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1
  const pos = (v: number) => `${((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100}%`
  return (
    <>
      <div style={{ ...NOTE, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: C.ink, marginRight: 4 }} />Starters</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: C.orange, marginRight: 4 }} />Bullpen</span>
        <span>{m.label} · ordered by bullpen minus starters</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
        {rows.map(({ t, sp, rp }) => {
          const on = ctx.sel.includes(t.id)
          return (
            <div key={t.id} onClick={() => ctx.toggle(t.id)} style={{ display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) 92px', gap: 8, alignItems: 'center', cursor: 'pointer', background: on ? '#FFF3D6' : 'transparent', borderRadius: 4, padding: '1px 2px', opacity: ctx.sel.length && !on ? 0.45 : 1 }}>
              <span style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347' }}>{t.abbrev}</span>
              <div style={{ position: 'relative', height: 14 }}>
                <div style={{ position: 'absolute', top: 6, height: 2, background: '#cfc8b8', left: pos(Math.min(sp, rp)), width: `calc(${pos(Math.max(sp, rp))} - ${pos(Math.min(sp, rp))})` }} />
                <div title={`Starters ${fmt(m, sp)}`} style={{ position: 'absolute', top: 2, width: 10, height: 10, borderRadius: '50%', background: C.ink, left: `calc(${pos(sp)} - 5px)` }} />
                <div title={`Bullpen ${fmt(m, rp)}`} style={{ position: 'absolute', top: 2, width: 10, height: 10, borderRadius: '50%', background: C.orange, left: `calc(${pos(rp)} - 5px)` }} />
              </div>
              <span style={{ fontFamily: SANS, fontSize: 10, color: C.mute, textAlign: 'right' }}>{fmt(m, sp)} / {fmt(m, rp)}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Movement map ─────────────────────────────────────────────────────────
export function Movement({ tile, ctx }: P) {
  const role = ctx.force ?? tile.x.role
  const { list, label } = group(ctx, role)
  const rows = useMemo(() => pool(list).filter(r => r.hb != null && r.vb != null && r.usage >= 1), [list])
  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No movement data.'}</Empty>
  return (
    <>
      <div style={NOTE}>{label}{role === 'all' ? '' : role === 'sp' ? ' · starters' : ' · bullpen'} · dot size = usage · pitcher&apos;s view, arm side to the right</div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 14, bottom: 22, left: 0 }}>
            <CartesianGrid stroke="#f1eee6" />
            <XAxis type="number" dataKey="hb" tick={AXIS} domain={[-25, 25]} unit="″" label={{ value: '← glove side · arm side →', position: 'bottom', offset: 4, style: AXIS }} />
            <YAxis type="number" dataKey="vb" tick={AXIS} domain={[-25, 25]} unit="″" width={38} />
            <ZAxis type="number" dataKey="usage" range={[70, 520]} />
            <ReferenceLine x={0} stroke="#cfc8b8" /><ReferenceLine y={0} stroke="#cfc8b8" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as Pooled
              return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}><b style={{ color: colorOf(p.pitchType) }}>{nameOf(p.pitchType)}</b><div style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 3 }}>{p.hb?.toFixed(1)}″ arm-side · {p.vb?.toFixed(1)}″ vertical<br />{p.usage.toFixed(1)}% usage{p.velo != null ? ` · ${p.velo.toFixed(1)} mph` : ''}</div></div>
            }} />
            {rows.map(r => <Scatter key={r.pitchType} data={[r]} fill={colorOf(r.pitchType)} fillOpacity={0.85} isAnimationActive={false} />)}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', ...NOTE }}>
        {rows.map(r => <span key={r.pitchType}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colorOf(r.pitchType), marginRight: 4 }} />{nameOf(r.pitchType)}</span>)}
      </div>
    </>
  )
}

// ─── Pitch-type heatmap ───────────────────────────────────────────────────
const HEAT_COLS = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'CH', 'FS']
export function Heat({ tile, ctx }: P) {
  const role = ctx.force ?? tile.x.role
  const mode = tile.heat ?? 'use'
  const rows = ctx.clubs.flatMap(t => {
    const s = ctx.summaryOf(role, t.id)
    return s ? [{ t, cells: HEAT_COLS.map(c => { const r = s.rows.find(x => x.pitchType === c); return r ? (mode === 'whiff' ? r.whiffPct : mode === 'velo' ? r.veloAvg : r.usagePct) : null }) }] : []
  }).sort((a, b) => a.t.name.localeCompare(b.t.name))
  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No clubs.'}</Empty>
  const range = HEAT_COLS.map((_, i) => { const v = rows.map(r => r.cells[i]).filter((x): x is number => x != null); return { min: Math.min(...v), max: Math.max(...v) } })
  const unit = mode === 'velo' ? '' : '%'
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400, color: C.mute }}>Team</th>
          {HEAT_COLS.map(c => <th key={c} style={{ padding: '4px 6px', fontWeight: 400, color: colorOf(c) }}>{nameOf(c)}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(({ t, cells }) => (
            <tr key={t.id} onClick={() => ctx.toggle(t.id)} style={{ borderTop: `1px solid ${C.soft}`, cursor: 'pointer', outline: ctx.sel.includes(t.id) ? `2px solid ${C.orange}` : 'none', outlineOffset: -2 }}>
              <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.short}</td>
              {cells.map((v, i) => {
                const { min, max } = range[i]
                const f = v != null && max > min ? (v - min) / (max - min) : 0
                return <td key={i} style={{ padding: '4px 6px', textAlign: 'center', background: v == null ? 'transparent' : `${colorOf(HEAT_COLS[i])}${Math.round(f * 0.6 * 255).toString(16).padStart(2, '0')}` }}>{v == null ? <span style={{ color: C.faint }}>–</span> : `${v.toFixed(1)}${unit}`}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ ...NOTE, marginTop: 6 }}>{mode === 'whiff' ? 'Whiff % per swing' : mode === 'velo' ? 'Average velocity (mph)' : 'Share of pitches'} · darker = higher within that pitch type · click a club to select it</div>
    </div>
  )
}

// ─── Animated pitch flight into the strike zone ───────────────────────────
// Front view (arm side to the right). Each pitch type is a constant-acceleration
// path through its averaged release point and plate crossing, using Statcast's
// averaged ax / az:  pos(s) = start + (end - start) s + 1/2 a T^2 (s^2 - s),  s = t / T.
// The dashed line is the same throw with gravity only; the gap between the
// two is the pitch's movement. A model through averages, not a tracked ball.
const G = -32.174
const VB_W = 420, VB_H = 450, FT = 60            // viewBox px, px per foot
const X_MIN = -3.5, Z_MAX = 7.5
const sx = (x: number) => (x - X_MIN) * FT
const sz = (z: number) => (Z_MAX - z) * FT

type Path = { x: (s: number) => number; z: (s: number) => number; gx: (s: number) => number; gz: (s: number) => number; T: number }
function pathOf(p: Pooled): Path | null {
  if (p.relX == null || p.relZ == null || p.plX == null || p.plZ == null || p.ax == null || p.az == null) return null
  const T = p.ft ?? (p.velo ? 52.6 / (p.velo * 1.4667 * 0.965) : null)
  if (!T) return null
  const dx = p.plX - p.relX, dz = p.plZ - p.relZ, h = 0.5 * T * T
  const vx = dx - h * p.ax, vz = dz - h * p.az             // initial-velocity * T, per axis
  return {
    T,
    x: s => p.relX! + dx * s + h * p.ax! * (s * s - s),
    z: s => p.relZ! + dz * s + h * p.az! * (s * s - s),
    gx: s => p.relX! + vx * s,                              // no sideways force
    gz: s => p.relZ! + vz * s + h * G * s * s,              // gravity only
  }
}
const poly = (f: (s: number) => [number, number], upTo = 1) =>
  Array.from({ length: 41 }, (_, i) => { const [x, y] = f((i / 40) * upTo); return `${x.toFixed(1)},${y.toFixed(1)}` }).join(' ')

const SPEEDS = [{ k: 1, label: 'Real time' }, { k: 4, label: '4× slower' }, { k: 10, label: '10× slower' }]
const HOLD = 1.6                                           // seconds the finished pitch is held on screen

export function Flight({ tile, ctx }: P) {
  const role = ctx.force ?? tile.x.role
  const { list, label } = group(ctx, role)
  const rows = useMemo(() => pool(list).filter(r => r.usage >= 2).map(r => ({ r, path: pathOf(r) })).filter((x): x is { r: Pooled; path: Path } => x.path != null), [list])
  const zone = useMemo(() => {
    const t = list.map(s => s.szTop).filter((v): v is number => v != null), b = list.map(s => s.szBot).filter((v): v is number => v != null)
    return t.length && b.length ? { top: t.reduce((a, c) => a + c, 0) / t.length, bot: b.reduce((a, c) => a + c, 0) / b.length } : { top: 3.4, bot: 1.6 }
  }, [list])

  const [slow, setSlow] = useState(10)
  const [playing, setPlaying] = useState(false)
  const [clock, setClock] = useState(1e9)                  // sim seconds since release; huge = finished frame
  const [hidden, setHidden] = useState<string[]>([])
  const start = useRef(0)
  const maxT = Math.max(0.4, ...rows.map(x => x.path.T))

  useEffect(() => {                                        // autoplay unless the viewer prefers reduced motion
    if (typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true)
  }, [])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    start.current = performance.now()
    const cycle = maxT * slow + HOLD
    const tick = (now: number) => {
      const el = ((now - start.current) / 1000) % cycle
      setClock(el / slow)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, slow, maxT])

  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No flight data for this selection.'}</Empty>
  const shown = rows.filter(x => !hidden.includes(x.r.pitchType))
  const zx0 = sx(-17 / 24), zx1 = sx(17 / 24), zy0 = sz(zone.top), zy1 = sz(zone.bot)
  const btn = (on: boolean): React.CSSProperties => ({ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : '#5b5347' })

  return (
    <>
      <div data-no-export="1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <button style={btn(playing)} onClick={e => { e.stopPropagation(); if (playing) setPlaying(false); else { setClock(0); setPlaying(true) } }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button style={btn(false)} onClick={e => { e.stopPropagation(); setClock(0); setPlaying(false); requestAnimationFrame(() => setPlaying(true)) }}>↺ Replay</button>
        {SPEEDS.map(sp => <button key={sp.k} style={btn(slow === sp.k)} onClick={e => { e.stopPropagation(); setSlow(sp.k) }}>{sp.label}</button>)}
      </div>
      <div style={NOTE}>{label}{role === 'all' ? '' : role === 'sp' ? ' · starters' : ' · bullpen'} · front view, arm side to the right · dots grow as the ball nears the plate</div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', maxHeight: 460, display: 'block' }} role="img" aria-label="Animated pitch flight into the strike zone">
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#FAF8F3" rx={10} />
        <line x1={0} x2={VB_W} y1={sz(0)} y2={sz(0)} stroke="#cfc8b8" />
        <polygon points={`${sx(-17 / 24)},${sz(0)} ${sx(17 / 24)},${sz(0)} ${sx(17 / 24)},${sz(0) - 6} ${sx(0)},${sz(0) - 12} ${sx(-17 / 24)},${sz(0) - 6}`} fill="#fff" stroke="#a89e8c" />
        <text x={8} y={18} fontSize={10} fontFamily={SANS} fill="#a89e8c">RELEASE HEIGHT</text>
        {[2, 4, 6].map(z => <g key={z}><line x1={0} x2={VB_W} y1={sz(z)} y2={sz(z)} stroke="#efeadf" /><text x={VB_W - 6} y={sz(z) - 3} fontSize={9} textAnchor="end" fontFamily={SANS} fill="#c4bcab">{z} ft</text></g>)}
        <rect x={zx0} y={zy0} width={zx1 - zx0} height={zy1 - zy0} fill="rgba(255,87,34,.05)" stroke="#FF5722" strokeWidth={1.5} />
        {[1, 2].map(i => <g key={i}><line x1={zx0 + ((zx1 - zx0) * i) / 3} x2={zx0 + ((zx1 - zx0) * i) / 3} y1={zy0} y2={zy1} stroke="#FF5722" strokeOpacity={0.25} /><line x1={zx0} x2={zx1} y1={zy0 + ((zy1 - zy0) * i) / 3} y2={zy0 + ((zy1 - zy0) * i) / 3} stroke="#FF5722" strokeOpacity={0.25} /></g>)}
        {shown.map(({ r, path }) => {
          const s = Math.min(1, Math.max(0, clock / path.T))
          const col = colorOf(r.pitchType)
          const at = (u: number): [number, number] => [sx(path.x(u)), sz(path.z(u))]
          const gAt = (u: number): [number, number] => [sx(path.gx(u)), sz(path.gz(u))]
          const [cx, cy] = at(s)
          const [ex, ey] = gAt(1)
          return (
            <g key={r.pitchType}>
              <polyline points={poly(gAt)} fill="none" stroke={col} strokeOpacity={0.4} strokeDasharray="3 4" strokeWidth={1.2} />
              <circle cx={ex} cy={ey} r={4} fill="none" stroke={col} strokeOpacity={0.5} strokeDasharray="2 2" />
              <polyline points={poly(at, s)} fill="none" stroke={col} strokeOpacity={0.9} strokeWidth={2} strokeLinecap="round" />
              <circle cx={cx} cy={cy} r={3 + 7 * s * s} fill={col} stroke="#fff" strokeWidth={1.2} />
              {s >= 1 && <text x={cx + 12} y={cy + 3} fontSize={9.5} fontFamily={SANS} fill={col}>{r.pitchType}</text>}
            </g>
          )
        })}
      </svg>
      <div data-no-export="1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {rows.map(({ r, path }) => {
          const off = hidden.includes(r.pitchType)
          return (
            <button key={r.pitchType} onClick={e => { e.stopPropagation(); setHidden(h => (off ? h.filter(x => x !== r.pitchType) : [...h, r.pitchType])) }}
              style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${off ? C.line : colorOf(r.pitchType)}`, background: off ? '#fff' : `${colorOf(r.pitchType)}1f`, color: off ? C.faint : '#3a342b' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colorOf(r.pitchType), opacity: off ? 0.3 : 1, marginRight: 5 }} />
              {nameOf(r.pitchType)} <span style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute }}>{r.velo != null ? `${r.velo.toFixed(0)} mph · ` : ''}{(path.T * 1000).toFixed(0)} ms</span>
            </button>
          )
        })}
      </div>
      <div style={{ ...NOTE, marginTop: 6 }}>
        Solid line = the pitch&apos;s average path; dashed line and hollow dot = where the same throw would land with gravity only, so the gap is its movement. Orange box = average strike zone ({zone.bot.toFixed(1)}–{zone.top.toFixed(1)} ft).
        Modeled through each pitch type&apos;s average release point, plate crossing and Statcast acceleration; it is not a tracked ball. Click a pitch to hide it.
      </div>
    </>
  )
}
