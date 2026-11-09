'use client'

// src/components/pitch-shape/LevelsCompared.tsx
//
// How one pitch type's shapes compare across MLB, Triple-A, the Florida State League, the Arizona Fall League and Spring Training. Three views, all of the same pitch type and hand:
//   1. each level's average shape (speed, ride, run, arm angle) and how the pitchers at that level differ from each other;
//   2. the same pitchers at two levels: who threw 150+ of the pitch at both, and how his pitch moved between them (a real change in one arm's pitch);
//   3. the spot chosen on the map, at each level: how common that shape is there and how often hitters missed it.
// Shape is physical, so it is compared directly. Misses are measured within each level, against that level's own hitters, parks and strike zone, so they are shown
// side by side and are not put on one scale. Nothing here predicts anything.

import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '@/components/team/ui'
import type { LevelsCompared as Data, MoverSet, Pair } from '@/lib/milb-shape/compare-server'
import type { LevelSummary, Mover, Shape } from '@/lib/milb-shape/compare'
import { LEVEL_LABEL, LEVEL_SHORT, type Level } from '@/lib/milb-shape/levels'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { MIN_WINDOW_SWINGS } from './finder-math'
import { limitsFor } from '@/lib/milb-shape/limits'
import { makeGrid, stats, type Grid } from './heatGrid'
import { log } from '@/lib/log'

const ORANGE_TEXT = '#B83A0E'
export const LEVEL_COLOUR: Record<Level, string> = { mlb: '#1A1A1A', aaa: '#FF5722', fsl: '#5E7A99', afl: '#8A6D3B', st: '#3E8E6A' }
const dataCache = new Map<string, Data | null>()
const cellsCache = new Map<string, MovementCellsPayload | null>()

/** The comparison for one pitch type and hand. undefined while loading, null when it could not be read. Not requested for a locked pitch type. */
export function useLevelsCompared(type: string, hand: string, skip: boolean): Data | null | undefined {
  const key = `${type}|${hand}`
  const [got, setGot] = useState<{ key: string; v: Data | null } | null>(null)
  useEffect(() => {
    if (skip || dataCache.has(key)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/levels-compared?type=${type}&hand=${hand}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: Data) => { dataCache.set(key, j); if (live) setGot({ key, v: j }) })
      .catch(e => { log.error('LevelsCompared', 'fetch failed', e instanceof Error ? e.message : e); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key, type, hand, skip])
  if (skip) return null
  if (dataCache.has(key)) return dataCache.get(key)
  return got?.key === key ? got.v : undefined
}

function useCells(level: Level, type: string, hand: string, skip: boolean) {
  const key = `${level}|${type}|${hand}`
  const [got, setGot] = useState<{ key: string; v: MovementCellsPayload | null } | null>(null)
  useEffect(() => {
    if (skip || cellsCache.has(key)) return
    let live = true
    fetch(`/api/mlb/pitch-shape/cells?type=${type}&hand=${hand}&center=league&half=12${level === 'mlb' ? '' : `&level=${level}`}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { payload: MovementCellsPayload | null }) => { cellsCache.set(key, j.payload); if (live) setGot({ key, v: j.payload }) })
      .catch(e => { log.error('LevelsCompared', 'cells fetch failed', e instanceof Error ? e.message : e); cellsCache.set(key, null); if (live) setGot({ key, v: null }) })
    return () => { live = false }
  }, [key, level, type, hand, skip])
  if (skip) return null
  if (cellsCache.has(key)) return cellsCache.get(key)
  return got?.key === key ? got.v : undefined
}

const sgn = (x: number, d = 1) => { const r = Number(x.toFixed(d)); return r === 0 ? (0).toFixed(d) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(d)}` }
const pc = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '8px 10px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'top' }

const Dot = ({ level }: { level: Level }) => <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: LEVEL_COLOUR[level], marginRight: 8 }} />
const delta = (v: number, d: number) => <div style={{ fontSize: 11.5, fontWeight: 700, color: Math.abs(v) < Math.pow(10, -d) / 2 ? C.mute : '#3a352c' }}>{sgn(v, d)}</div>

function Averages({ levels, active, lc }: { levels: LevelSummary[]; active: Level; lc: string }) {
  const mlb = levels.find(l => l.level === 'mlb')
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 }}>
        <thead><tr><th style={th}>Level</th><th style={th}>Pitchers</th><th style={th}>Pitches</th><th style={th}>Velocity</th><th style={th}>Ride</th><th style={th}>Run</th><th style={th}>Arm angle</th><th style={th}>Whiffs per swing</th></tr></thead>
        <tbody>
          {levels.map(l => {
            const d = mlb && l.level !== 'mlb' ? { velo: l.mean.velo - mlb.mean.velo, ivb: l.mean.ivb - mlb.mean.ivb, hb: l.mean.hb - mlb.mean.hb, slot: l.slotKnown ? l.mean.slot - mlb.mean.slot : null } : null
            return (
              <tr key={l.level} style={{ background: l.level === active ? '#FFF3EA' : undefined }}>
                <td style={{ ...td, fontWeight: 800 }}><Dot level={l.level} />{LEVEL_LABEL[l.level]}<div style={{ fontSize: 11.5, fontWeight: 500, color: C.mute }}>{l.season}</div></td>
                <td style={td}>{l.pitchers.toLocaleString()}</td>
                <td style={td}>{l.pitches.toLocaleString()}</td>
                <td style={td}><b>{l.mean.velo.toFixed(1)}</b> mph<div style={{ fontSize: 11.5, color: C.mute }}>varies ±{l.spread.velo.toFixed(1)}</div>{d && delta(d.velo, 1)}</td>
                <td style={td}><b>{l.mean.ivb.toFixed(1)}</b> in<div style={{ fontSize: 11.5, color: C.mute }}>varies ±{l.spread.ivb.toFixed(1)}</div>{d && delta(d.ivb, 1)}</td>
                <td style={td}><b>{l.mean.hb.toFixed(1)}</b> in<div style={{ fontSize: 11.5, color: C.mute }}>varies ±{l.spread.hb.toFixed(1)}</div>{d && delta(d.hb, 1)}</td>
                <td style={td}>{l.slotKnown ? <><b>{Math.round(l.mean.slot)}</b>°<div style={{ fontSize: 11.5, color: C.mute }}>varies ±{l.spread.slot.toFixed(0)}</div>{d && d.slot != null && delta(d.slot, 0)}</> : <span style={{ color: C.mute }}>pending</span>}</td>
                <td style={td}>{l.swings >= 150 ? <b>{((l.whiffs / l.swings) * 100).toFixed(1)}%</b> : 'pending'}<div style={{ fontSize: 11.5, color: C.mute }}>{l.whiffs.toLocaleString()} of {l.swings.toLocaleString()}</div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: C.mute, margin: '6px 2px 0', lineHeight: 1.5 }}>Average shape of every {lc}, weighted by pitches. The small figure under a minor-league or exhibition row is how far it sits from MLB. Spring Training and the Arizona Fall League list a pitcher from 30 pitches and have no arm angle, so that column is pending for them. Variation is how much pitchers at that level differ from each other.</div>
    </div>
  )
}

const PAIR_LABEL: Record<Pair, string> = { 'aaa-mlb': 'Triple-A to MLB', 'fsl-aaa': 'Florida State League to Triple-A', 'fsl-mlb': 'Florida State League to MLB' }

function MoverRow({ m }: { m: Mover }) {
  const cell = (s: Shape) => `${s.velo.toFixed(1)} mph · ${s.ivb.toFixed(1)} ride · ${s.hb.toFixed(1)} run`
  return (
    <li style={{ background: C.soft, borderRadius: 6, padding: '9px 12px', display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>{m.name}</b>
        <span style={{ fontSize: 12, color: C.mute }}>{m.low.pitches.toLocaleString()} pitches at {LEVEL_SHORT[m.low.level]}, {m.high.pitches.toLocaleString()} at {LEVEL_SHORT[m.high.level]}</span>
      </div>
      <div style={{ fontSize: 13, color: '#3a352c', fontVariantNumeric: 'tabular-nums' }}><Dot level={m.low.level} />{cell(m.low.shape)}</div>
      <div style={{ fontSize: 13, color: '#3a352c', fontVariantNumeric: 'tabular-nums' }}><Dot level={m.high.level} />{cell(m.high.shape)} <b style={{ marginLeft: 6, color: ORANGE_TEXT }}>{sgn(m.delta.velo)} mph, {sgn(m.delta.ivb)} ride, {sgn(m.delta.hb)} run</b></div>
    </li>
  )
}

function Movers({ sets, lc }: { sets: MoverSet[]; lc: string }) {
  const [pair, setPair] = useState<Pair | null>(null)
  const usable = sets.filter(s => s.count > 0)
  const cur = usable.find(s => s.pair === pair) ?? usable[0]
  if (!cur) return <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>No pitcher has thrown 150 or more {lc}s at two of these levels in the loaded seasons yet.</p>
  const m = cur.mean
  return (
    <div>
      <div role="group" aria-label="Which two levels" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
        {usable.map(s => (
          <button key={s.pair} type="button" aria-pressed={s.pair === cur.pair} onClick={() => setPair(s.pair)}
            style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1px solid ${s.pair === cur.pair ? C.ink : C.line}`, background: s.pair === cur.pair ? C.ink : '#fff', color: s.pair === cur.pair ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {PAIR_LABEL[s.pair]} ({s.count})
          </button>
        ))}
      </div>
      {m && cur.count >= 3 && (
        <p style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.55, margin: '0 0 8px' }}>
          Across <b>{cur.count} pitchers</b> who threw the {lc} at both levels, the {LEVEL_LABEL[cur.high]} version averaged <b>{sgn(m.velo)} mph</b>, <b>{sgn(m.ivb)} in of ride</b> and <b>{sgn(m.hb)} in of run</b> compared with the {LEVEL_LABEL[cur.low]} version. This is the same arm, so it is a change in the pitch, not a different pitcher.
        </p>
      )}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>{cur.list.slice(0, 6).map(x => <MoverRow key={x.pitcherId} m={x} />)}</ol>
    </div>
  )
}

function Spot({ type, hand, place, radius, lc }: { type: string; hand: string; place: { hb: number; ivb: number }; radius: number; lc: string }) {
  const m = useCells('mlb', type, hand, false), a = useCells('aaa', type, hand, false), f = useCells('fsl', type, hand, false), x = useCells('afl', type, hand, false), y = useCells('st', type, hand, false)
  const rows = useMemo(() => {
    const out: { level: Level; share: number | null; pitches: number; swings: number; rate: number | null; avg: number | null; total: number }[] = []
    const r10 = Math.round(radius * 10)
    for (const [level, p] of [['mlb', m], ['aaa', a], ['fsl', f], ['afl', x], ['st', y]] as [Level, MovementCellsPayload | null | undefined][]) {
      if (!p) continue
      const g = makeGrid(p, 'latest')
      const s = stats(g, Math.round(place.hb * 10), Math.round(place.ivb * 10), r10)
      const total = p.seasons.find(x => x.season === p.latest)?.league.pitches ?? 0
      out.push({ level, pitches: s.pitches, share: total > 0 ? s.pitches / total : null, swings: s.swings, rate: s.swings >= limitsFor(level).windowSwings && s.swings > 0 ? s.whiffs / s.swings : null, avg: g.swings > 0 ? g.whiffs / g.swings : null, total })
    }
    return out
  }, [m, a, f, x, y, place.hb, place.ivb, radius])
  if (m === undefined || a === undefined || f === undefined || x === undefined || y === undefined) return <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>Loading each level’s map…</p>
  if (rows.length === 0) return <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>No league maps for this pitch yet.</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
        <thead><tr><th style={th}>Level</th><th style={th}>{lc}s in the box</th><th style={th}>Share of its {lc}s</th><th style={th}>Whiffs per swing in the box</th><th style={th}>Level average</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.level}>
              <td style={{ ...td, fontWeight: 800 }}><Dot level={r.level} />{LEVEL_LABEL[r.level]}</td>
              <td style={td}>{r.pitches.toLocaleString()}</td>
              <td style={td}>{r.share == null ? '—' : `${(r.share * 100).toFixed(1)}%`}</td>
              <td style={td}>{r.rate == null ? <span style={{ color: C.mute }}>pending, {r.swings.toLocaleString()} swings (needs {MIN_WINDOW_SWINGS})</span> : <><b>{(r.rate * 100).toFixed(1)}%</b> <span style={{ color: C.mute, fontSize: 12 }}>of {r.swings.toLocaleString()} swings</span></>}</td>
              <td style={td}>{r.avg == null ? '—' : `${(r.avg * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: C.mute, margin: '6px 2px 0', lineHeight: 1.5 }}>The box is ±{radius} in of ride {place.ivb.toFixed(1)} and run {place.hb.toFixed(1)}, the spot chosen on the map. Share is how many of that level’s {lc}s move like this. Misses are measured against each level’s own hitters, so read each row against its own level average.</div>
    </div>
  )
}


// ---- the three maps side by side --------------------------------------------------------------------------------------------------------------------

type Metric = 'swing' | 'whiff'
const HALF = 12
// One absolute colour scale per measure, shared by every map, so a redder map really is a level where hitters swung more (or missed more) and a bluer one fewer.
const RANGE: Record<Metric, [number, number]> = { swing: [0.32, 0.58], whiff: [0.12, 0.36] }
const METRIC_LABEL: Record<Metric, string> = { swing: 'Swings per pitch', whiff: 'Whiffs per swing' }
const MIN_PITCHES_WINDOW = 60
// Blue (least) through a pale middle to red (most): the progression between levels reads at a glance, which one orange scale did not show.
const RAMP_LOW: [number, number, number] = [49, 104, 178], RAMP_MID: [number, number, number] = [248, 244, 238], RAMP_HIGH: [number, number, number] = [190, 38, 24]
const rgbCss = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`
function ramp(t: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, t))
  const [p, q, u] = k < 0.5 ? [RAMP_LOW, RAMP_MID, k / 0.5] : [RAMP_MID, RAMP_HIGH, (k - 0.5) / 0.5]
  return [Math.round(p[0] + (q[0] - p[0]) * u), Math.round(p[1] + (q[1] - p[1]) * u), Math.round(p[2] + (q[2] - p[2]) * u)]
}
/** The measure in a window of half-width r10 (tenths of an inch) around a point, or null when the window holds too little to show. */
export function windowRate(g: Grid, metric: Metric, hb: number, ivb: number, r10: number, minSwings: number): { rate: number | null; pitches: number; swings: number } {
  const s = stats(g, Math.round(hb * 10), Math.round(ivb * 10), r10)
  const rate = metric === 'swing' ? (s.pitches >= MIN_PITCHES_WINDOW ? s.swings / s.pitches : null) : (s.swings >= minSwings ? s.whiffs / s.swings : null)
  return { rate, pitches: s.pitches, swings: s.swings }
}

function MapCanvas({ grid, c0, r10, metric, level, place, hover, onHover, minSwings }: {
  grid: Grid; c0: { hb: number; ivb: number }; r10: number; metric: Metric; level: Level; place: { hb: number; ivb: number } | null
  hover: { hb: number; ivb: number } | null; onHover: (h: { hb: number; ivb: number } | null) => void; minSwings: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const N = 2 * HALF * 10 + 1
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    const [lo, hi] = RANGE[metric]
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hb = c0.hb - HALF + x / 10, ivb = c0.ivb + HALF - y / 10
      const r = windowRate(grid, metric, hb, ivb, r10, minSwings).rate
      const rgb: [number, number, number] = r == null ? [237, 232, 220] : ramp((r - lo) / (hi - lo))
      const o = (y * N + x) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [grid, c0.hb, c0.ivb, r10, metric, minSwings, N])
  const toPct = (hb: number, ivb: number) => ({ left: `${((hb - (c0.hb - HALF)) / (2 * HALF)) * 100}%`, top: `${((c0.ivb + HALF - ivb) / (2 * HALF)) * 100}%` })
  return (
    <div style={{ position: 'relative', aspectRatio: '1 / 1', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', cursor: 'crosshair', background: '#EDE8DC' }}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); onHover({ hb: c0.hb - HALF + ((e.clientX - r.left) / r.width) * 2 * HALF, ivb: c0.ivb + HALF - ((e.clientY - r.top) / r.height) * 2 * HALF }) }}
      onMouseLeave={() => onHover(null)}>
      <canvas ref={ref} role="img" aria-label={`${LEVEL_LABEL[level]} movement map coloured by ${METRIC_LABEL[metric].toLowerCase()}`} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
      {place && <span aria-hidden style={{ position: 'absolute', ...toPct(place.hb, place.ivb), width: 14, height: 14, marginLeft: -7, marginTop: -7, border: `2px dashed ${C.ink}`, background: 'rgba(255,255,255,.25)' }} />}
      {hover && <span aria-hidden style={{ position: 'absolute', ...toPct(hover.hb, hover.ivb), width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', border: `2px solid ${C.ink}`, background: 'rgba(255,255,255,.5)' }} />}
    </div>
  )
}

function SideBySide({ type, hand, place, radius, lc }: { type: string; hand: string; place: { hb: number; ivb: number } | null; radius: number; lc: string }) {
  const m = useCells('mlb', type, hand, false), a = useCells('aaa', type, hand, false), f = useCells('fsl', type, hand, false), x = useCells('afl', type, hand, false), y = useCells('st', type, hand, false)
  const [metric, setMetric] = useState<Metric>('swing')
  const [hover, setHover] = useState<{ hb: number; ivb: number } | null>(null)
  const r10 = Math.round(radius * 10)
  const levels = useMemo(() => ([['mlb', m], ['aaa', a], ['fsl', f], ['afl', x], ['st', y]] as [Level, MovementCellsPayload | null | undefined][]).filter((x): x is [Level, MovementCellsPayload] => !!x[1]).map(([level, p]) => ({ level, p, grid: makeGrid(p, 'latest'), tot: p.seasons.find(s => s.season === p.latest)?.league ?? { pitches: 0, swings: 0, whiffs: 0 } })), [m, a, f, x, y])
  if (m === undefined || a === undefined || f === undefined || x === undefined || y === undefined) return <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>Loading the maps…</p>
  if (levels.length < 2) return <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>Fewer than two levels have a map for this pitch yet.</p>
  const c0 = { hb: levels[0].p.hb0, ivb: levels[0].p.ivb0 }
  const [lo, hi] = RANGE[metric]
  const swingPct = (t: { pitches: number; swings: number }) => (t.pitches ? t.swings / t.pitches : null)
  return (
    <div>
      <Chips2 label="Measure" value={metric} onChange={v => setMetric(v as Metric)} options={[{ id: 'swing', text: 'Swings per pitch' }, { id: 'whiff', text: 'Whiffs per swing' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))`, gap: 12 }} className="lc-maps">
        {levels.map(l => {
          const here = hover ? windowRate(l.grid, metric, hover.hb, hover.ivb, r10, limitsFor(l.level).gated ? MIN_SW : 10) : null
          return (
            <div key={l.level} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}><Dot level={l.level} />{LEVEL_LABEL[l.level]}</div>
              <MapCanvas grid={l.grid} c0={c0} r10={r10} metric={metric} level={l.level} place={place} hover={hover} onHover={setHover} minSwings={limitsFor(l.level).gated ? MIN_SW : 10} />
              <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.45 }}>
                <b>{metric === 'swing' ? pc(swingPct(l.tot), 1) : l.tot.swings ? pc(l.tot.whiffs / l.tot.swings, 1) : '—'}</b> <span style={{ color: C.mute }}>{metric === 'swing' ? 'of all pitches drew a swing' : 'of swings missed'} ({l.tot.pitches.toLocaleString()} pitches)</span>
                {hover && <div style={{ color: '#3a352c' }}>{here && here.rate != null ? <><b>{pc(here.rate, 1)}</b> at the pointer <span style={{ color: C.mute }}>({here.pitches.toLocaleString()} pitches, {here.swings.toLocaleString()} swings)</span></> : <span style={{ color: C.mute }}>Pointer: too few {lc}s here to show</span>}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <style>{'@media(max-width:760px){.lc-maps{grid-template-columns:1fr !important}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px', fontSize: 12.5, fontWeight: 700 }}>
        <span>{pc(lo)}</span>
        <span aria-hidden style={{ flex: 1, minWidth: 140, maxWidth: 340, height: 12, borderRadius: 3, background: `linear-gradient(90deg, ${rgbCss(RAMP_LOW)}, ${rgbCss(RAMP_MID)} 50%, ${rgbCss(RAMP_HIGH)})` }} />
        <span>{pc(hi)}</span>
        <span style={{ color: C.mute, fontWeight: 500 }}>{METRIC_LABEL[metric]}: one scale on every map</span>
      </div>
      <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.5 }}>Each point of a map is a way a {lc} can move (right is more run toward the pitcher’s arm side, up is more ride), read over every {lc} within ±{radius} in. A grey area has too few pitches ({MIN_PITCHES_WINDOW} for swings per pitch, {MIN_SW} swings for whiffs per swing). Hover one map and the same spot is read on the others.</div>
    </div>
  )
}
const MIN_SW = MIN_WINDOW_SWINGS

function Chips2({ options, value, onChange, label }: { options: { id: string; text: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
      {options.map(o => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}
          style={{ minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1px solid ${o.id === value ? C.ink : C.line}`, background: o.id === value ? C.ink : '#fff', color: o.id === value ? C.cream : C.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{o.text}</button>
      ))}
    </div>
  )
}

export default function LevelsCompared({ data, active, type, hand, pitchName, place, radius }: {
  data: Data | null | undefined; active: Level; type: string; hand: 'R' | 'L'; pitchName: string; place: { hb: number; ivb: number } | null; radius: number
}) {
  const lc = pitchName.toLowerCase()
  const [open, setOpen] = useState(true)
  const head: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: ORANGE_TEXT, textTransform: 'uppercase', margin: '18px 0 8px' }
  return (
    <section aria-label="How shapes compare across levels" style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minHeight: 32 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{open ? '▾' : '▸'} How {hand === 'L' ? 'left' : 'right'}-handed {lc}s compare across MLB, Triple-A, the Florida State League, the Arizona Fall League and Spring Training</span>
      </button>
      {open && (
        <div>
          <p style={{ fontSize: 13.5, color: '#5b5347', lineHeight: 1.5, margin: '6px 0 4px', maxWidth: 900 }}>The same pitch, every level we hold. Shape is physical, so it is compared directly. Misses are measured within each level and are shown side by side, not on one scale.</p>
          {data === undefined ? <p style={{ fontSize: 13, color: C.mute }}>Loading the levels…</p>
            : data === null || data.levels.length === 0 ? <p style={{ fontSize: 13, color: C.mute }}>The level comparison could not be loaded.</p>
            : (
              <>
                <div style={head}>Average shape by level</div>
                <Averages levels={data.levels} active={active} lc={lc} />
                <div style={head}>The maps side by side</div>
                <SideBySide type={type} hand={hand} place={place} radius={radius} lc={lc} />
                <div style={head}>The same pitchers at two levels</div>
                <Movers sets={data.movers} lc={lc} />
                <div style={head}>The spot you chose, at each level</div>
                {place ? <Spot type={type} hand={hand} place={place} radius={radius} lc={lc} /> : <p style={{ fontSize: 13, color: C.mute, margin: 0 }}>Click a spot on the map to see how common it is at each level and how often hitters missed it.</p>}
              </>
            )}
        </div>
      )}
    </section>
  )
}

