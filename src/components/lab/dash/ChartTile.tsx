'use client'

// src/components/lab/dash/ChartTile.tsx
//
// One visual on the dashboard canvas: KPI card, scatter/bubble, ranked bars or
// table. Every visual reads the same already-filtered club list and shares one
// selection (click a dot / bar / row → that club is highlighted everywhere).

import ArmClock from '@/components/lab/dash/ArmClock'
import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { C, Empty, SANS } from '@/components/team/ui'
import { fmt, linearFit, pearson } from '@/lib/lab/team-summary'
import type { Tile } from '@/components/lab/dash/types'
import { AXIS, md, ramp, short, type Ctx } from '@/components/lab/dash/shared'
import { Dumbbell, Flight, Heat, Hist, Mix, Movement, Radar } from '@/components/lab/dash/MoreVisuals'

export type { Ctx } from '@/components/lab/dash/shared'
export { short }

export function autoTitle(t: Tile): string {
  switch (t.kind) {
    case 'scatter': return `${short(t.y)} vs ${short(t.x)}`
    case 'bars': return `${short(t.x)} by club`
    case 'kpi': return short(t.x)
    case 'hist': return `How clubs are distributed: ${short(t.x)}`
    case 'radar': return 'Club profile vs league'
    case 'mix': return 'Pitch mix'
    case 'dumbbell': return `${md(t.x)?.label ?? t.x.metric}: starters vs bullpen`
    case 'movement': return 'Pitch movement map'
    case 'armclock': return 'Arm-angle clock'
    case 'flight': return 'Pitch flight into the strike zone'
    case 'heat': return `Pitch types by club: ${t.heat === 'whiff' ? 'whiff %' : t.heat === 'velo' ? 'velocity' : 'usage'}`
    default: return 'Club table'
  }
}

type Pt = { id: number; abbrev: string; name: string; color: string; x: number; y: number; z: number; c: number | null }

// ─── KPI ──────────────────────────────────────────────────────────────────
function Kpi({ tile, ctx }: { tile: Tile; ctx: Ctx }) {
  const m = md(tile.x)
  const vals = ctx.clubs.flatMap(t => { const v = ctx.val(tile.x, t.id); return v == null ? [] : [{ t, v }] })
  if (!vals.length) return <Empty>{ctx.loading ? 'Loading…' : 'No data'}</Empty>
  const avg = vals.reduce((s, r) => s + r.v, 0) / vals.length
  const sorted = [...vals].sort((a, b) => a.v - b.v)
  const lo = sorted[0], hi = sorted[sorted.length - 1]
  const one = ctx.sel.length === 1 ? vals.find(r => r.t.id === ctx.sel[0]) : null
  const rank = one ? [...vals].sort((a, b) => b.v - a.v).findIndex(r => r.t.id === one.t.id) + 1 : null
  return (
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{fmt(m, one ? one.v : avg)}</div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.mute, marginTop: 4 }}>
        {one ? `${one.t.short} · #${rank} highest of ${vals.length}` : `Club average · ${vals.length} clubs`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SANS, fontSize: 9.5, color: C.faint, marginTop: 8 }}>
        <span>Low {lo.t.abbrev} {fmt(m, lo.v)}</span><span>High {hi.t.abbrev} {fmt(m, hi.v)}</span>
      </div>
    </div>
  )
}

// ─── Scatter ──────────────────────────────────────────────────────────────
function ScatterVis({ tile, ctx }: { tile: Tile; ctx: Ctx }) {
  const xm = md(tile.x), ym = md(tile.y)
  const sm = tile.size ? md(tile.size) : null, cm = tile.color ? md(tile.color) : null
  const pts: Pt[] = useMemo(() => ctx.clubs.flatMap(t => {
    const x = ctx.val(tile.x, t.id), y = ctx.val(tile.y, t.id)
    const z = tile.size ? ctx.val(tile.size, t.id) : 1
    if (x == null || y == null || z == null) return []
    return [{ id: t.id, abbrev: t.abbrev, name: t.name, color: t.primary_color, x, y, z, c: tile.color ? ctx.val(tile.color, t.id) : null }]
  }), [ctx, tile.x, tile.y, tile.size, tile.color])
  if (!pts.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No clubs have both numbers.'}</Empty>

  const cv = pts.map(p => p.c).filter((v): v is number => v != null)
  const cMin = Math.min(...cv), cMax = Math.max(...cv)
  const fill = (p: Pt) => (cm && p.c != null && cMax > cMin ? ramp((p.c - cMin) / (cMax - cMin)) : p.color)
  const r = pearson(pts.map(p => p.x), pts.map(p => p.y))
  const fit = tile.trend ? linearFit(pts.map(p => p.x), pts.map(p => p.y)) : null
  const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x))
  const anySel = ctx.sel.length > 0

  return (
    <>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute, marginBottom: 2 }}>
        <b style={{ fontFamily: SANS, fontSize: 16, color: C.ink }}>{r == null ? '—' : `r = ${r.toFixed(2)}`}</b> · {pts.length} clubs
        {sm ? ` · size = ${short(tile.size!)}` : ''}{cm ? ` · colour = ${short(tile.color!)}` : ''}
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 2 }}>
            <CartesianGrid stroke="#f1eee6" />
            <XAxis type="number" dataKey="x" tick={AXIS} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(xm.decimals)} label={{ value: short(tile.x), position: 'bottom', offset: 6, style: AXIS }} />
            <YAxis type="number" dataKey="y" tick={AXIS} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(ym.decimals)} width={44} label={{ value: short(tile.y), angle: -90, position: 'insideLeft', offset: 8, style: { ...AXIS, textAnchor: 'middle' } }} />
            <ZAxis type="number" dataKey="z" range={tile.size ? [50, 460] : [100, 100]} />
            {fit && <ReferenceLine segment={[{ x: x0, y: fit.intercept + fit.slope * x0 }, { x: x1, y: fit.intercept + fit.slope * x1 }]} stroke="#1A1A1A" strokeDasharray="5 4" strokeOpacity={0.45} />}
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as Pt
              return (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: SANS, fontSize: 12 }}>
                  <b>{p.name}</b>
                  <div style={{ fontFamily: SANS, fontSize: 10.5, color: '#5b5347', marginTop: 3, lineHeight: 1.5 }}>
                    {short(tile.x)}: {fmt(xm, p.x)}<br />{short(tile.y)}: {fmt(ym, p.y)}
                    {sm && <><br />{short(tile.size!)}: {fmt(sm, p.z)}</>}{cm && <><br />{short(tile.color!)}: {fmt(cm, p.c)}</>}
                  </div>
                </div>
              )
            }} />
            <Scatter data={pts} onClick={(d: unknown) => { const id = (d as { id?: number } | undefined)?.id; if (id != null) ctx.toggle(id) }} shape={(props: { cx?: number; cy?: number; size?: number; payload?: Pt }) => {
              const p = props.payload
              if (!p || props.cx == null || props.cy == null) return <g />
              const rad = Math.max(4, Math.sqrt((props.size ?? 100) / Math.PI))
              const on = ctx.sel.includes(p.id)
              return (
                <g opacity={anySel && !on ? 0.28 : 1} style={{ cursor: 'pointer' }}>
                  <circle cx={props.cx} cy={props.cy} r={rad} fill={fill(p)} fillOpacity={0.85} stroke={on ? '#1A1A1A' : '#fff'} strokeWidth={on ? 2.5 : 1} />
                  {(tile.labels || on) && <text x={props.cx + rad + 3} y={props.cy + 3} fontSize={on ? 11 : 9} fontWeight={on ? 700 : 400} fontFamily={SANS} fill="#5b5347">{p.abbrev}</text>}
                </g>
              )
            }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {cm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 9.5, color: C.faint }}>
          <span>{fmt(cm, cMin)}</span><div style={{ flex: 1, maxWidth: 140, height: 7, borderRadius: 4, background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(1)})` }} /><span>{fmt(cm, cMax)}</span>
        </div>
      )}
    </>
  )
}

// ─── Bars ─────────────────────────────────────────────────────────────────
function BarsVis({ tile, ctx }: { tile: Tile; ctx: Ctx }) {
  const m = md(tile.x)
  const data = useMemo(() => ctx.clubs.flatMap(t => {
    const v = ctx.val(tile.x, t.id)
    return v == null ? [] : [{ id: t.id, abbrev: t.abbrev, color: t.primary_color, v }]
  }).sort((a, b) => (tile.desc ? b.v - a.v : a.v - b.v)), [ctx, tile.x, tile.desc])
  if (!data.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No data.'}</Empty>
  const anySel = ctx.sel.length > 0
  return (
    <div style={{ height: Math.max(200, data.length * 19 + 24) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 56, bottom: 2, left: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="abbrev" tick={{ ...AXIS, fontSize: 11 }} width={40} interval={0} />
          <Bar dataKey="v" radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={(d: unknown) => { const id = (d as { id?: number } | undefined)?.id; if (id != null) ctx.toggle(id) }}>
            {data.map(p => <Cell key={p.id} fill={p.color} fillOpacity={anySel && !ctx.sel.includes(p.id) ? 0.22 : 0.9} />)}
            <LabelList dataKey="v" position="right" formatter={(v: unknown) => fmt(m, Number(v))} style={{ fontFamily: SANS, fontSize: 10, fill: '#5b5347' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────
function TableVis({ tile, ctx }: { tile: Tile; ctx: Ctx }) {
  const [sortCol, setSortCol] = useState<number>(-1)
  const [asc, setAsc] = useState(false)
  const rows = ctx.clubs.map(t => ({ t, vals: tile.cols.map(c => ctx.val(c, t.id)) }))
  const range = tile.cols.map((_, i) => {
    const v = rows.map(r => r.vals[i]).filter((x): x is number => x != null)
    return { min: Math.min(...v), max: Math.max(...v) }
  })
  const sorted = [...rows].sort((a, b) => {
    if (sortCol < 0) return a.t.name.localeCompare(b.t.name)
    const av = a.vals[sortCol], bv = b.vals[sortCol]
    if (av == null) return 1
    if (bv == null) return -1
    return asc ? av - bv : bv - av
  })
  if (!rows.length) return <Empty>{ctx.loading ? 'Loading clubs…' : 'No clubs.'}</Empty>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute }}>
            <th onClick={() => setSortCol(-1)} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400, cursor: 'pointer' }}>Team</th>
            {tile.cols.map((c, i) => (
              <th key={i} onClick={() => { if (sortCol === i) setAsc(!asc); else { setSortCol(i); setAsc(false) } }} style={{ padding: '4px 8px', fontWeight: sortCol === i ? 700 : 400, color: sortCol === i ? C.ink : C.mute, textAlign: 'right', cursor: 'pointer', maxWidth: 110 }}>
                {short(c)}{sortCol === i ? (asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ t, vals }) => (
            <tr key={t.id} onClick={() => ctx.toggle(t.id)} style={{ borderTop: `1px solid ${C.soft}`, cursor: 'pointer', background: ctx.sel.includes(t.id) ? '#FFF3D6' : 'transparent' }}>
              <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.short}</td>
              {vals.map((v, i) => {
                const { min, max } = range[i]
                const f = v != null && max > min ? (v - min) / (max - min) : 0
                return <td key={i} style={{ padding: '4px 8px', textAlign: 'right', background: v == null ? 'transparent' : `rgba(255,87,34,${(f * 0.28).toFixed(3)})` }}>{fmt(md(tile.cols[i]), v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tile frame ───────────────────────────────────────────────────────────
export type DragProps = {
  dragging: boolean
  over: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
  onResize: (span: 1 | 2 | 4) => void
}

export default function ChartTile({ tile, ctx, active, onActivate, onDuplicate, onRemove, drag }: {
  tile: Tile; ctx: Ctx; active: boolean; onActivate: () => void; onDuplicate: () => void; onRemove: () => void; drag: DragProps
}) {
  const ref = useRef<HTMLDivElement>(null)
  const title = tile.title.trim() || autoTitle(tile)
  const kpi = tile.kind === 'kpi'

  async function download() {
    if (!ref.current) return
    const { toPng } = await import('html-to-image')
    const url = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', filter: n => !(n as HTMLElement).dataset?.noExport })
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`
    a.click()
  }

  // Drag the right edge to resize: snaps to 1, 2 or 4 columns of the canvas.
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const el = ref.current
    const canvas = el?.parentElement
    if (!el || !canvas) return
    const colW = canvas.clientWidth / 4
    const startW = el.getBoundingClientRect().width
    const startX = e.clientX
    const move = (ev: PointerEvent) => {
      const cols = (startW + (ev.clientX - startX)) / colW
      drag.onResize(cols < 1.5 ? 1 : cols < 3 ? 2 : 4)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const btn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: SANS, fontSize: 11, color: C.mute, padding: '2px 5px' }

  return (
    <div
      ref={ref}
      onClick={onActivate}
      onDragOver={e => { e.preventDefault(); drag.onDragOver() }}
      onDrop={e => { e.preventDefault(); drag.onDrop() }}
      className={`dash-s${tile.span}`}
      style={{
        position: 'relative', background: '#fff', borderRadius: 14, padding: kpi ? '12px 14px' : 16, minWidth: 0, cursor: 'default',
        border: drag.over ? `2px dashed ${C.orange}` : `${active ? 2 : 1}px solid ${active ? C.orange : C.line}`,
        opacity: drag.dragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
          <span
            data-no-export="1"
            draggable
            title="Drag to move"
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tile.id); if (ref.current) e.dataTransfer.setDragImage(ref.current, 20, 20); drag.onDragStart() }}
            onDragEnd={drag.onDragEnd}
            onClick={e => e.stopPropagation()}
            style={{ cursor: 'grab', fontFamily: SANS, fontSize: 13, color: C.faint, lineHeight: 1.1, userSelect: 'none', padding: '0 2px' }}
          >⠿</span>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: kpi ? 11 : 15, letterSpacing: kpi ? '.06em' : '-.01em', textTransform: kpi ? 'uppercase' : 'none', color: kpi ? C.mute : C.ink, lineHeight: 1.2 }}>{title}</div>
        </div>
        <div data-no-export="1" style={{ display: 'flex', flexShrink: 0 }}>
          {!kpi && <button title="Download PNG" style={btn} onClick={e => { e.stopPropagation(); void download() }}>PNG</button>}
          <button title="Duplicate" style={btn} onClick={e => { e.stopPropagation(); onDuplicate() }}>⧉</button>
          <button title="Remove" style={btn} onClick={e => { e.stopPropagation(); onRemove() }}>✕</button>
        </div>
      </div>
      {tile.kind === 'kpi' ? <Kpi tile={tile} ctx={ctx} />
        : tile.kind === 'scatter' ? <ScatterVis tile={tile} ctx={ctx} />
        : tile.kind === 'bars' ? <BarsVis tile={tile} ctx={ctx} />
        : tile.kind === 'hist' ? <Hist tile={tile} ctx={ctx} />
        : tile.kind === 'radar' ? <Radar tile={tile} ctx={ctx} />
        : tile.kind === 'mix' ? <Mix tile={tile} ctx={ctx} />
        : tile.kind === 'dumbbell' ? <Dumbbell tile={tile} ctx={ctx} />
        : tile.kind === 'movement' ? <Movement tile={tile} ctx={ctx} />
        : tile.kind === 'flight' ? <Flight tile={tile} ctx={ctx} />
        : tile.kind === 'armclock' ? <ArmClock tile={tile} ctx={ctx} />
        : tile.kind === 'heat' ? <Heat tile={tile} ctx={ctx} />
        : <TableVis tile={tile} ctx={ctx} />}
      <div data-no-export="1" className="dash-resize" onPointerDown={startResize} title="Drag to resize" style={{ position: 'absolute', top: 0, right: -3, bottom: 0, width: 10, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 3, height: 34, borderRadius: 2, background: active || drag.over ? C.orange : C.line }} />
      </div>
    </div>
  )
}
