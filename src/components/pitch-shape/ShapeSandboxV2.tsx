'use client'

// src/components/pitch-shape/ShapeSandboxV2.tsx
//
// The redesigned "Dial in a shape" (mockups/pitch-shape-lab-redesign.html, page 2), shown beside the classic ShapeSandbox. Same bins, same lookup and
// the same gates (model.ts), so every number matches the classic view; what changes is how it reads:
//   - the sliders start at the league-typical shape, and the shaded part of each slider is where real pitches live (thumb turns orange outside it);
//   - the readout is a sentence plus four cards, each with a verdict and a worse-to-better bar (its place among the league's shapes for this pitch);
//   - "Which way helps" compares the shape with two more inches of ride and of run;
//   - a shape with almost no pitches says so plainly and offers to move to the nearest shape with enough data;
//   - Pro: loading a real pitcher opens a small compare ("adding X mph and Y in of ride: whiffs A → B").
// `isPro` is a REQUIRED prop. Free = four-seam and sweeper; locked pitch types are never requested (loadBins) and the API refuses them.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, Foot } from '@/components/team/ui'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import type { MovementCellsPayload, Thrower } from '@/lib/pitch-shape/data'
import {
  FREE_SANDBOX_TYPES, GATE, PITCH_NAMES, fmtN, indexBins, lookup, typicalShape,
  type BinIndex, type Hand, type PitcherHit, type Shape, type ShapeBin,
} from '@/lib/pitch-shape/model'
import type { LoadBins, SearchPitchers } from './ShapeSandbox'
import { makeGrid, stats } from './heatGrid'
import { MAP_BG, boxColour } from './finder-math'
import { SHAPE_CSS } from './parts'

const ORANGE_TEXT = '#B83A0E'
const HALF = 12
const SLIDERS: { k: keyof Shape; label: string; unit: string; digits: number }[] = [
  { k: 'velo', label: 'Velocity', unit: 'mph', digits: 1 },
  { k: 'ivb', label: 'Ride (induced vert. break)', unit: 'in', digits: 1 },
  { k: 'hb', label: 'Run (arm-side break)', unit: 'in', digits: 1 },
  { k: 'slot', label: 'Arm angle', unit: '°', digits: 0 },
]
const sliderRange = (k: keyof Shape, c: Shape): [number, number] => (k === 'velo' ? [c.velo - 8, c.velo + 8] : k === 'slot' ? [10, 90] : [c[k] - 18, c[k] + 18])
const STEP: Record<keyof Shape, number> = { velo: 0.5, ivb: 1, hb: 1, slot: 5 }
const f1 = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`)
const w3 = (x: number | null) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))

type Metric = 'whiff' | 'csw' | 'gb' | 'xw'
/** where a value sits among the league's shapes for this pitch (weighted by pitches), 0 = lowest .. 1 = highest */
function buildDist(bins: ShapeBin[]) {
  const d: Record<Metric, [number, number][]> = { whiff: [], csw: [], gb: [], xw: [] }
  for (const b of bins) {
    if (b.swings >= 20) d.whiff.push([b.whiffs / b.swings, b.pitches])
    if (b.pitches >= 20) d.csw.push([b.csw / b.pitches, b.pitches])
    if (b.bbe >= 20) { d.gb.push([b.gb / b.bbe, b.pitches]); d.xw.push([b.xwobaConSum / b.bbe, b.pitches]) }
  }
  const tot: Record<string, number> = {}
  for (const k of Object.keys(d) as Metric[]) { d[k].sort((a, b) => a[0] - b[0]); tot[k] = d[k].reduce((s, x) => s + x[1], 0) }
  return { d, tot }
}
const verdictOf = (g: number) => (g < 1 / 3 ? 'below average' : g < 2 / 3 ? 'about average' : 'above average')

const cellsCache = new Map<string, MovementCellsPayload | null>()

export default function ShapeSandboxV2({ isPro, lookLeft = false, pitchTypes, loadBins, searchPitchers }: {
  isPro: boolean; lookLeft?: boolean; pitchTypes: string[]; loadBins: LoadBins; searchPitchers: SearchPitchers
}) {
  const isFree = (t: string) => (FREE_SANDBOX_TYPES as readonly string[]).includes(t)
  const locked = (t: string) => !isPro && !lookLeft && !isFree(t)
  const [type, setType] = useState(pitchTypes[0] ?? 'FF')
  const [hand, setHand] = useState<Hand>('R')
  const [loaded, setLoaded] = useState<{ key: string; bins: ShapeBin[] | null } | null>(null)
  const [A, setA] = useState<Shape | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [cmp, setCmp] = useState({ dv: 1, di: 2 })
  const pending = useRef<Shape | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PitcherHit[] | null>(null)
  const [cells, setCells] = useState<MovementCellsPayload | null | undefined>(undefined)
  const [near, setNear] = useState<Thrower[] | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const name = PITCH_NAMES[type] ?? type
  const lc = name.toLowerCase()

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let cancelled = false
    const t = setTimeout(() => { searchPitchers(term).then(r => { if (!cancelled) setHits(r) }) }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, searchPitchers])

  const choose = (h: PitcherHit, pitchType: string, shape: Shape) => {
    pending.current = shape
    setFrom(`${h.name} · ${PITCH_NAMES[pitchType] ?? pitchType}`)
    setCmp({ dv: 1, di: 2 })
    if (pitchType === type && h.hand === hand) { setA(shape); pending.current = null } else { setType(pitchType); setHand(h.hand) }
    setQ(''); setHits(null)
  }

  const key = `${type}|${hand}`
  useEffect(() => {
    if (locked(type)) return
    let cancelled = false
    loadBins(type, hand).then(rows => {
      if (cancelled) return
      const ok = rows && rows.length > 0 ? rows : null
      setLoaded({ key, bins: ok })
      const start = pending.current ?? (ok ? typicalShape(ok) : null)
      pending.current = null
      if (start) setA(start)
    }).catch(() => { if (!cancelled) setLoaded({ key, bins: null }) })
    return () => { cancelled = true }
  }, [type, hand, key, isPro, loadBins]) // eslint-disable-line react-hooks/exhaustive-deps
  const bins = loaded?.key === key ? loaded.bins : null
  const state: 'loading' | 'ready' | 'failed' = loaded?.key !== key ? 'loading' : bins ? 'ready' : 'failed'

  const index: BinIndex | null = useMemo(() => (bins ? indexBins(bins) : null), [bins])
  const center = useMemo(() => (bins ? typicalShape(bins) : null), [bins])
  const dist = useMemo(() => (bins ? buildDist(bins) : null), [bins])
  const league = useMemo(() => {
    if (!bins) return null
    let sw = 0, wh = 0, p = 0, cs = 0, bb = 0, gb = 0, xw = 0
    for (const b of bins) { sw += b.swings; wh += b.whiffs; p += b.pitches; cs += b.csw; bb += b.bbe; gb += b.gb; xw += b.xwobaConSum }
    return { whiff: sw ? wh / sw : null, csw: p ? cs / p : null, gb: bb ? gb / bb : null, xw: bb ? xw / bb : null }
  }, [bins])
  const good = (k: Metric, v: number) => {
    if (!dist) return 0.5
    let a = 0
    for (const [x, w] of dist.d[k]) { if (x < v) a += w; else break }
    const p = a / (dist.tot[k] || 1)
    return k === 'xw' ? 1 - p : p   // lower damage is better for the pitcher
  }

  const L = index && A ? lookup(index, A) : null
  const thin = !!L && L.whiff.value == null

  // the shaded part of each slider: where the bins have enough swings given the other three settings
  const bands = useMemo(() => {
    const out: Partial<Record<keyof Shape, [number, number] | null>> = {}
    if (!index || !A || !center) return out
    for (const s of SLIDERS) {
      const [lo, hi] = sliderRange(s.k, center)
      let mn: number | null = null, mx: number | null = null
      for (let v = lo; v <= hi + 1e-9; v += STEP[s.k]) if (lookup(index, { ...A, [s.k]: v }).whiff.value != null) { if (mn == null) mn = v; mx = v }
      out[s.k] = mn == null || mx == null ? null : [mn, mx]
    }
    return out
  }, [index, A, center])

  // the same league map the lab page draws, for "where it sits"
  useEffect(() => {
    if (locked(type)) { setCells(null); return }
    const k = `${type}|${hand}`
    if (cellsCache.has(k)) { setCells(cellsCache.get(k)); return }
    setCells(undefined)
    let live = true
    fetch(`/api/mlb/pitch-shape/cells?type=${type}&hand=${hand}&center=league&half=${HALF}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { payload: MovementCellsPayload | null }) => { cellsCache.set(k, j.payload); if (live) setCells(j.payload) })
      .catch(e => { console.error('[ShapeSandboxV2] cells fetch failed:', e instanceof Error ? e.message : e); if (live) setCells(null) })
    return () => { live = false }
  }, [type, hand]) // eslint-disable-line react-hooks/exhaustive-deps
  const grid = useMemo(() => (cells ? makeGrid(cells, 'latest') : null), [cells])
  const N = grid ? 2 * grid.h10 + 1 : 0
  const lw = grid && grid.swings > 0 ? grid.whiffs / grid.swings : null
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !grid || lw == null) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const s = stats(grid, grid.gx0 + grid.m10 + xx, grid.gy0 + grid.m10 + yy, 10)
      const rgb = boxColour(s.swings, s.whiffs, lw) ?? MAP_BG
      const o = ((N - 1 - yy) * N + xx) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, N, lw])

  // pitchers who throw something close: those whose pitches land within 2 in of this movement, nearest on all four settings first
  useEffect(() => {
    if (!A || !cells || locked(type)) { setNear(null); return }
    let live = true
    const t = setTimeout(() => {
      fetch(`/api/mlb/pitch-shape/throwers?type=${type}&hand=${hand}&hb=${A.hb.toFixed(1)}&ivb=${A.ivb.toFixed(1)}&radius=3&season=${cells.latest}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { throwers: Thrower[] }) => { if (live) setNear(j.throwers) })
        .catch(e => { console.error('[ShapeSandboxV2] nearby pitchers fetch failed:', e instanceof Error ? e.message : e); if (live) setNear(null) })
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [A, cells, type, hand]) // eslint-disable-line react-hooks/exhaustive-deps
  const nearest = useMemo(() => {
    if (!A || !near) return []
    const sd = { velo: 1.6, ivb: 2.4, hb: 2.4, slot: 9 }
    return near.map(p => ({ p, d: Math.sqrt(((p.velo - A.velo) / sd.velo) ** 2 + ((p.ivb - A.ivb) / sd.ivb) ** 2 + ((p.hb - A.hb) / sd.hb) ** 2 + ((p.slot - A.slot) / sd.slot) ** 2) })).sort((a, b) => a.d - b.d).slice(0, 3).map(x => x.p)
  }, [near, A])

  const snapNearest = () => {
    if (!bins || !index || !A) return
    const sd = { velo: 1.5, ivb: 2.5, hb: 2.5, slot: 10 }
    let best: Shape | null = null, bd = 6
    for (const b of bins) {
      const sh: Shape = { velo: b.veloBin * 1, ivb: b.ivbBin * 2, hb: b.hbBin * 2, slot: b.slotBin * 10 + 5 }
      const d = Math.sqrt(((sh.velo - A.velo) / sd.velo) ** 2 + ((sh.ivb - A.ivb) / sd.ivb) ** 2 + ((sh.hb - A.hb) / sd.hb) ** 2 + ((sh.slot - A.slot) / sd.slot) ** 2)
      if (d >= bd) continue
      if (lookup(index, sh).whiff.value != null) { bd = d; best = sh }
    }
    if (best) { setA(best); setFrom(null) }
  }

  const way = (() => {
    if (!index || !A || !L || L.whiff.value == null) return null
    const wI = lookup(index, { ...A, ivb: A.ivb + 2 }).whiff.value, wH = lookup(index, { ...A, hb: A.hb + 2 }).whiff.value
    if (wI == null || wH == null) return null
    const dI = (wI - L.whiff.value) * 100, dH = (wH - L.whiff.value) * 100
    const ride = Math.abs(dI) >= Math.abs(dH), d = ride ? dI : dH
    return { text: `${ride ? 'ride' : 'run'}`, other: ride ? 'run' : 'ride', d }
  })()
  const compare = (() => {
    if (!isPro || !from || !index || !A || !L) return null
    const Bsh = { ...A, velo: A.velo + cmp.dv, ivb: A.ivb + cmp.di }
    return { B: lookup(index, Bsh), Bsh }
  })()

  const bar = (k: Metric, v: number | null, lgv: number | null) => {
    const g = v == null ? null : good(k, v), gl = lgv == null ? 0.5 : good(k, lgv)
    return { g, gl }
  }
  const card = (title: string, sub: string, k: Metric, v: number | null, fmt: (x: number | null) => string, lgv: number | null) => {
    const { g, gl } = bar(k, v, lgv)
    return (
      <div key={title} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 12, background: C.cream }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 13 }}><b style={{ fontSize: 14.5 }}>{title}</b><span style={{ color: C.mute, fontSize: 11.5, textAlign: 'right' }}>{sub}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
          <strong style={{ fontSize: 30, letterSpacing: '-.02em' }}>{fmt(v)}</strong>
          {g != null && <em style={{ fontStyle: 'normal', fontSize: 12, background: C.soft, borderRadius: 3, padding: '3px 7px' }}>{verdictOf(g)[0].toUpperCase() + verdictOf(g).slice(1)}</em>}
        </div>
        <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'linear-gradient(90deg,#5E7A99,#d8d3c8 50%,#FF8A50)', margin: '12px 0 6px' }} aria-hidden>
          {g != null && <span style={{ position: 'absolute', left: `${g * 100}%`, top: -6, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: C.ink, border: '2px solid #fff' }} />}
          <span style={{ position: 'absolute', left: `${gl * 100}%`, top: -5, width: 2, height: 15, background: C.ink, opacity: 0.7 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.mute }}><span>worse for the pitcher</span><span>league {fmt(lgv)}</span><span>better</span></div>
      </div>
    )
  }

  const headLine = A ? `THIS SHAPE · ${A.velo.toFixed(1)} MPH · ${A.ivb.toFixed(1)} IN RIDE · ${A.hb.toFixed(1)} IN RUN · ${Math.round(A.slot)}°` : ''
  const gw = L && L.whiff.value != null ? good('whiff', L.whiff.value) : null
  const gg = L && L.gb.value != null ? good('gb', L.gb.value) : null
  const ring = grid && A ? { x: A.hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (A.ivb * 10 - (grid.gy0 + grid.m10) + 0.5) } : null

  return (
    <div className="ps2-root">
      <style>{SHAPE_CSS}</style>
      <style>{'.ps2-root .pv-pill,.ps2-root .ps-chip{border-radius:4px}.ps2-grid{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:20px;align-items:start}.ps2-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.ps2-mets{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:900px){.ps2-grid,.ps2-two{grid-template-columns:1fr}}@media(max-width:620px){.ps2-mets{grid-template-columns:1fr}}.ps2-rg{position:relative;height:34px;margin-top:4px}.ps2-rg input{position:absolute;left:0;right:0;top:0;width:100%;height:34px;margin:0;background:none;-webkit-appearance:none;appearance:none}.ps2-rg input::-webkit-slider-runnable-track{height:8px;background:transparent}.ps2-rg input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#1A1A1A;border:3px solid #fff;box-shadow:0 0 0 1px #1A1A1A;margin-top:-8px}.ps2-out input::-webkit-slider-thumb{background:#FF5722;box-shadow:0 0 0 1px #FF5722}.ps2-rg input::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#1A1A1A;border:3px solid #fff}.ps2-out .ps2-rg input::-moz-range-thumb{background:#FF5722}'}</style>

      <div className="ps2-grid">
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
          <div className="pv-k">Build a pitch</div>
          <div className="pv-row" style={{ marginTop: 6 }}>
            {pitchTypes.map(t => <button key={t} type="button" className={`pv-pill${t === type ? ' on' : ''}`} style={{ minHeight: 44, fontSize: 14, opacity: locked(t) ? 0.6 : 1 }} onClick={() => { setType(t); setFrom(null) }}>{PITCH_NAMES[t] ?? t}{locked(t) && <small style={{ marginLeft: 5, fontSize: 10, fontWeight: 800, color: ORANGE_TEXT }}>PRO</small>}</button>)}
            {(['R', 'L'] as Hand[]).map(h => <button key={h} type="button" className={`pv-pill${h === hand ? ' on' : ''}`} style={{ minHeight: 44, fontSize: 14 }} onClick={() => setHand(h)}>{h === 'R' ? 'Right' : 'Left'}</button>)}
          </div>
          <label htmlFor="ps2-pitcher" style={{ display: 'block', fontWeight: 800, fontSize: 14, marginTop: 10 }}>Start from a real pitcher</label>
          <input id="ps2-pitcher" type="search" autoComplete="off" placeholder="Search a pitcher…" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', minHeight: 44, border: `1px solid ${C.line}`, borderRadius: 4, padding: '0 12px', marginTop: 6, fontFamily: 'inherit', fontSize: 14, background: C.cream }} />
          {q.trim().length >= 2 && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 4, marginTop: 6, background: '#fff', maxHeight: 260, overflowY: 'auto' }}>
              {!hits && <div style={{ padding: 10, fontSize: 12, color: C.mute }}>Searching…</div>}
              {hits && hits.length === 0 && <div style={{ padding: 10, fontSize: 12, color: C.mute }}>No pitcher found{!isPro ? ' (free covers four-seam and sweeper)' : ''}.</div>}
              {hits?.map(h => (
                <div key={h.id} style={{ padding: '8px 10px', borderTop: `1px solid ${C.soft}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{h.name} <span style={{ color: C.mute, fontWeight: 500 }}>· {h.team} · {h.hand}HP · {h.season}</span></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                    {h.pitches.map(p => <button key={p.pitchType} type="button" className="ps-chip" style={{ minHeight: 36 }} onClick={() => choose(h, p.pitchType, p.shape)}>{PITCH_NAMES[p.pitchType] ?? p.pitchType}<small style={{ opacity: 0.7, marginLeft: 4 }}>{p.shape.velo.toFixed(1)}</small></button>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>{from ? <>Showing <b style={{ color: C.ink }}>{from}</b> (his average shape this season). Move a slider to change it.</> : 'Loads his pitch as shape A and opens a compare so you can try changes.'}</div>

          {A && center && index && SLIDERS.map(s => {
            const [lo, hi] = sliderRange(s.k, center)
            const b = bands[s.k], out = !b || A[s.k] < b[0] - 1e-9 || A[s.k] > b[1] + 1e-9
            return (
              <div key={s.k} className={out ? 'ps2-out' : ''} style={{ marginTop: 16 }}>
                <label htmlFor={`ps2-${s.k}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, letterSpacing: '.12em', fontWeight: 800, textTransform: 'uppercase', color: C.mute }}>{s.label}<b style={{ fontSize: 20, letterSpacing: 0, color: C.ink }}>{A[s.k].toFixed(s.digits)} {s.unit}</b></label>
                <div className="ps2-rg">
                  <div style={{ position: 'absolute', top: 13, left: 0, right: 0, height: 8, background: C.soft, borderRadius: 4 }} />
                  {b && <div style={{ position: 'absolute', top: 13, height: 8, background: '#FFB48A', borderRadius: 4, left: `${((b[0] - lo) / (hi - lo)) * 100}%`, width: `${Math.max(1, ((b[1] - b[0]) / (hi - lo)) * 100)}%` }} />}
                  <input id={`ps2-${s.k}`} type="range" min={lo} max={hi} step={s.k === 'slot' ? 1 : 0.1} value={A[s.k]} onChange={e => { setA({ ...A, [s.k]: Number(e.target.value) }); setFrom(null) }} />
                </div>
                <div style={{ fontSize: 12, color: C.mute }}>{b ? `Shaded: ${b[0].toFixed(s.digits)}–${b[1].toFixed(s.digits)} ${s.unit}` : 'No real pitches near here'}{out && b && <span style={{ color: ORANGE_TEXT, fontWeight: 700 }}> · outside where real pitches live</span>}</div>
              </div>
            )
          })}
          <button type="button" onClick={() => { if (center) { setA(center); setFrom(null) } }} style={{ marginTop: 16, minHeight: 44, padding: '0 16px', border: `1.5px solid ${C.ink}`, background: '#fff', borderRadius: 4, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Reset to league-average shape</button>
        </div>

        <div style={{ minWidth: 0 }}>
          {locked(type) ? (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}><h4 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800 }}>{name} shapes</h4><UpgradePrompt source="pitch_shape" /></div>
          ) : state === 'loading' ? <div style={{ padding: 24, color: C.mute, fontSize: 13 }}>Loading league shapes…</div>
          : state === 'failed' || !bins || !index || !league || !L || !A ? (
            <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 6, padding: 16, textAlign: 'center', color: C.mute, fontSize: 13 }}><b style={{ display: 'block', color: C.ink, fontSize: 14 }}>No league sample for this pitch yet</b>The shape table has no rows for {lc}s thrown {hand === 'R' ? 'right' : 'left'}-handed. We don’t estimate. Choose another pitch type or hand.</div>
          ) : thin ? (
            <div style={{ border: `2px solid ${C.ink}`, borderRadius: 6, padding: 18, background: '#fff' }}>
              <div className="pv-k" style={{ color: ORANGE_TEXT }}>{headLine}</div>
              <h3 style={{ fontSize: 32, margin: '10px 0 8px', fontWeight: 800, letterSpacing: '-.02em' }}>Almost no one throws this</h3>
              <p style={{ fontSize: 14, color: '#5b5347', lineHeight: 1.5, margin: 0 }}>Only {fmtN(L.swings)} swings in the ±2-bin neighbourhood (needs {GATE.swings}). We don’t estimate. Try a shape closer to where real pitches live.</p>
              <p style={{ fontSize: 12, color: C.faint, margin: '8px 0 0' }}>Sample gates: {GATE.swings} swings for whiff%, {GATE.pitches} pitches for CSW%, {GATE.bbe} balls in play for GB% and damage on contact.</p>
              <button type="button" onClick={snapNearest} style={{ marginTop: 12, minHeight: 44, padding: '0 16px', border: `1.5px solid ${C.ink}`, background: '#fff', borderRadius: 4, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Move to the nearest shape with enough data</button>
            </div>
          ) : (
            <div style={{ border: `2px solid ${C.ink}`, borderRadius: 6, padding: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="pv-k" style={{ color: ORANGE_TEXT, margin: 0 }}>{headLine}</span>
                <span style={{ fontSize: 11, letterSpacing: '.08em', fontWeight: 800, padding: '4px 8px', borderRadius: 3, background: L.reach === 1 ? C.ink : C.soft, color: L.reach === 1 ? C.yellow : C.ink }}>{L.reach === 1 ? `STRONG SAMPLE · ${fmtN(L.swings)} SWINGS` : `THIN SAMPLE · WIDENED TO ±2 BINS · ${fmtN(L.swings)} SWINGS`}</span>
              </div>
              <h3 style={{ fontSize: 'clamp(22px,3vw,30px)', lineHeight: 1.2, letterSpacing: '-.015em', margin: '12px 0 14px', fontWeight: 800 }}>
                {hand === 'L' ? 'Left' : 'Right'}-handed {lc}s shaped like this have been <mark style={{ background: C.yellow, padding: '0 4px', borderRadius: 4 }}>{verdictOf(gw ?? 0.5)}</mark> at getting misses{gg == null ? '.' : <>, and <mark style={{ background: C.yellow, padding: '0 4px', borderRadius: 4 }}>{verdictOf(gg)}</mark> at getting ground balls.</>}
              </h3>
              <div className="ps2-mets">
                {card('Whiff%', 'misses per swing', 'whiff', L.whiff.value, f1, league.whiff)}
                {card('CSW%', 'called + swinging strikes per pitch', 'csw', L.csw.value, f1, league.csw)}
                {card('GB%', 'ground balls per batted ball', 'gb', L.gb.value, f1, league.gb)}
                {card('Damage on contact', 'xwOBAcon, lower is better', 'xw', L.xwobaCon.value, w3, league.xw)}
              </div>
              {way && <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.ink, color: '#fff', borderRadius: 6, padding: '12px 14px', marginTop: 12, fontSize: 14, lineHeight: 1.4 }}><span style={{ fontSize: 22 }}>↑</span><span><b style={{ color: C.yellow }}>Which way helps:</b> shapes with 2 more inches of {way.text} than this have got <b>{way.d >= 0 ? '+' : '−'}{Math.abs(way.d).toFixed(1)} points</b> {way.d >= 0 ? 'more' : 'fewer'} whiffs per swing. Extra {way.other} has mattered less here.</span></div>}
              {compare && L.whiff.value != null && (
                <div style={{ marginTop: 10, background: C.soft, borderRadius: 6, padding: '10px 12px', fontSize: 13.5 }}>
                  <b>Compare, shape B:</b> adding{' '}
                  <button type="button" aria-label="Less velocity" onClick={() => setCmp(c => ({ ...c, dv: c.dv - 0.5 }))} style={stepBtn}>−</button> <b>{cmp.dv.toFixed(1)} mph</b> <button type="button" aria-label="More velocity" onClick={() => setCmp(c => ({ ...c, dv: c.dv + 0.5 }))} style={stepBtn}>+</button>{' '}and{' '}
                  <button type="button" aria-label="Less ride" onClick={() => setCmp(c => ({ ...c, di: c.di - 1 }))} style={stepBtn}>−</button> <b>{cmp.di.toFixed(1)} in of ride</b> <button type="button" aria-label="More ride" onClick={() => setCmp(c => ({ ...c, di: c.di + 1 }))} style={stepBtn}>+</button>
                  {' '}· whiffs A {f1(L.whiff.value)} → B <b>{f1(compare.B.whiff.value)}</b>
                </div>
              )}
              {!isPro && from && <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Pro opens a compare for a real pitcher: try adding velocity or ride and see the whiff rate move.</div>}
              <Foot>{fmtN(L.swings)} swings · {fmtN(L.pitches)} pitches · {fmtN(L.bbe)} balls in play in the neighbourhood. The verdict is where this shape sits among the league’s shapes for this pitch, weighted by pitches: the lower third reads below average, the middle third about average, the upper third above. It describes what has happened, not what will.</Foot>
            </div>
          )}

          {state === 'ready' && !locked(type) && (
            <div className="ps2-two">
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800 }}>Where it sits</h3>
                {cells === undefined ? <div style={{ color: C.mute, fontSize: 13 }}>Loading the map…</div> : !grid || lw == null ? <div style={{ color: C.mute, fontSize: 13 }}>The league map isn’t built for this pitch yet.</div> : (
                  <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', background: '#EDE8DC' }}>
                    <canvas ref={canvasRef} role="img" aria-label={`League ${lc} movement map with your shape marked. The squares are movement (ride up, run right), not the strike zone.`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
                    {ring && <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden><circle cx={ring.x} cy={ring.y} r={N / 28} fill="#FDE047" fillOpacity=".85" stroke={C.ink} strokeWidth={N / 90} /></svg>}
                  </div>
                )}
                <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>↑ ride · run → · each square is a way a pitch moves (not the strike zone) · the ring is your shape (velocity and arm angle are not on this map)</div>
              </div>
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800 }}>Pitchers who throw something close</h3>
                {near === null ? <div style={{ color: C.mute, fontSize: 13 }}>Finding pitchers…</div> : nearest.length === 0 ? <div style={{ color: C.mute, fontSize: 13 }}>No pitcher with 300+ {lc}s moves like this.</div> : nearest.map(p => (
                  <div key={p.pitcherId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5 }}>
                    <button type="button" onClick={() => { pending.current = null; setA({ velo: p.velo, ivb: p.ivb, hb: p.hb, slot: p.slot }); setFrom(`${p.name} · ${name}`); setCmp({ dv: 1, di: 2 }) }} style={{ background: 'none', border: 0, padding: 0, color: ORANGE_TEXT, fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left', minHeight: 44 }}>{p.name} · {p.teamAbbr}</button>
                    <span style={{ color: '#5b5347', fontSize: 12.5, textAlign: 'right' }}>{p.velo.toFixed(1)} mph · {p.ivb.toFixed(1)} in ride · {p.hb.toFixed(1)} in run</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: C.mute, marginTop: 8 }}>Click a name to load his pitch as shape A. Closest on velocity, ride, run and arm angle among pitchers who throw near this movement.</div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 12 }}>Looking for one pitcher? <Link href="/mlb/lab/pitching-lab" style={{ color: ORANGE_TEXT, fontWeight: 700 }}>Open the Pitching Lab</Link> and use its Shape tab.</div>
        </div>
      </div>
    </div>
  )
}

const stepBtn: React.CSSProperties = { minHeight: 36, minWidth: 36, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 4, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }
