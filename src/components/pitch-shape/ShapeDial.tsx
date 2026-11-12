'use client'

// src/components/pitch-shape/ShapeDial.tsx
//
// "Dial his shape": for a chosen pitcher, two sliders move a target shape away from his average (more or less ride, more or less run) and a table shows the change in what league pitches shaped like that have produced,
// side by side with what pitches shaped like his average have produced. The target is the map's selected spot (the parent owns it), so clicking the map moves the sliders and moving the sliders moves the map.
// It compares what other pitchers' pitches did at two shapes (all of the league's pitches within the smoothing window); it says nothing about whether he can throw that movement or that results would follow.
// Data comes from the shapeReadout server action. Describes what already happened; nothing looks forward.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import { shapeReadout, type Readout } from '@/app/mlb/lab/pitch-shape/actions'
import type { ViewHand } from './bothHands'
import type { Board } from '@/lib/pitch-shape/results'
import { limitsFor } from '@/lib/milb-shape/limits'
import { parseLevel } from '@/lib/milb-shape/levels'
import { log } from '@/lib/log'

type Pt = { hb: number; ivb: number }
const RANGE = 6, STEP = 0.5
const GREEN = '#13694F', RED = '#A8391F'

/** `band` is the size of difference below which the two shapes are treated as level: the same bands the results table uses, so a tiny change is never coloured as if it were real */
type Row = { label: string; get: (r: Readout) => number | null; up: boolean; fmt: (v: number) => string; diff: (d: number) => string; band: number; hero: boolean }
const signed = (v: number, d: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
const ROWS: Row[] = [
  { label: 'Whiffs per swing', get: r => r.here.whiff, up: true, fmt: v => `${(v * 100).toFixed(1)}%`, diff: d => `${signed(d * 100, 1)} pts`, band: 0.03, hero: true },
  { label: 'Runs saved per 100 pitches', get: r => r.saved, up: true, fmt: v => signed(v, 2), diff: d => signed(d, 2), band: 0.4, hero: true },
  { label: 'wOBA against', get: r => r.here.woba, up: false, fmt: v => v.toFixed(3).replace(/^0/, ''), diff: d => signed(d, 3).replace('0.', '.'), band: 0.03, hero: false },
  { label: 'xwOBA against', get: r => r.here.xwoba, up: false, fmt: v => v.toFixed(3).replace(/^0/, ''), diff: d => signed(d, 3).replace('0.', '.'), band: 0.03, hero: false },
  { label: 'Batting average against', get: r => r.here.avg, up: false, fmt: v => v.toFixed(3).replace(/^0/, ''), diff: d => signed(d, 3).replace('0.', '.'), band: 0.025, hero: false },
  { label: 'Slugging against', get: r => r.here.slg, up: false, fmt: v => v.toFixed(3).replace(/^0/, ''), diff: d => signed(d, 3).replace('0.', '.'), band: 0.05, hero: false },
]

export default function ShapeDial({ name, pitcherId, board, avg, target, onTarget, type, hand, level, radius, year, lc }: {
  name: string; pitcherId: number; board: Board | null | undefined; avg: Pt; target: Pt | null; onTarget: (p: Pt) => void
  type: string; hand: ViewHand; level: string; radius: number; year: number | undefined; lc: string
}) {
  const [base, setBase] = useState<Readout | null | undefined>(undefined)
  const [dial, setDial] = useState<Readout | null | undefined>(undefined)
  const dRide = target ? Math.round((target.ivb - avg.ivb) / STEP) * STEP : 0
  const dRun = target ? Math.round((target.hb - avg.hb) / STEP) * STEP : 0
  const moved = dRide !== 0 || dRun !== 0
  const at = (p: Pt) => shapeReadout({ type, hand, level, hb: p.hb, ivb: p.ivb, radius, year }).then(r => (r.ok ? r.readout : null))

  useEffect(() => {
    let live = true
    setBase(undefined)
    at(avg).then(r => { if (live) setBase(r) }).catch(e => { log.error('ShapeDial', 'base readout failed', e instanceof Error ? e.message : String(e)); if (live) setBase(null) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avg.hb, avg.ivb, type, hand, level, radius, year])

  useEffect(() => {
    if (!moved) { setDial(base); return }
    let live = true
    setDial(undefined)
    const t = setTimeout(() => {
      at({ hb: avg.hb + dRun, ivb: avg.ivb + dRide }).then(r => { if (live) setDial(r) }).catch(e => { log.error('ShapeDial', 'dialed readout failed', e instanceof Error ? e.message : String(e)); if (live) setDial(null) })
    }, 200)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moved, dRide, dRun, base, type, hand, level, radius, year])

  const set = (ride: number, run: number) => onTarget({ hb: avg.hb + run, ivb: avg.ivb + ride })
  const slider = (label: string, v: number, onChange: (x: number) => void, lo: string, hi: string) => (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, color: C.ink }}><span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v === 0 ? 'as he throws it' : `${signed(v, 1)} in`}</span></span>
      <input type="range" min={-RANGE} max={RANGE} step={STEP} value={v} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: C.orange }} aria-label={label} />
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.mute }}><span>{lo}</span><span>{hi}</span></span>
    </label>
  )
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '.1em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', textAlign: 'right', padding: '4px 6px' }
  const ready = base && dial
  const lim = limitsFor(parseLevel(level))
  const swA = base?.here.n.swings ?? 0, swB = dial?.here.n.swings ?? 0
  const thin = !!ready && (swA < lim.windowSwings || (moved && swB < lim.windowSwings))
  const sample = (n: number) => (n >= lim.spotSwings ? `STRONG SAMPLE · ${lim.spotSwings}+ SWINGS` : n >= lim.strongSwings ? `MODERATE SAMPLE · ${lim.strongSwings}–${lim.spotSwings - 1} SWINGS` : `THIN SAMPLE · UNDER ${lim.strongSwings} SWINGS`)
  // real pitchers whose average shape is near his, as one-click targets: what shapes close to his have produced for the pitchers who actually throw them
  const presets = (board?.rows ?? []).filter(r => r.pitcherId !== pitcherId && Math.abs(r.hb - avg.hb) <= RANGE && Math.abs(r.ivb - avg.ivb) <= RANGE && r.shape.saved != null)
    .sort((x, y) => (y.shape.saved ?? 0) - (x.shape.saved ?? 0)).slice(0, 4)
  const badge = (n: number): React.CSSProperties => ({ fontSize: 10, letterSpacing: '.1em', fontWeight: 800, padding: '3px 7px', borderRadius: 3, background: n >= lim.spotSwings ? '#FFE4D6' : C.soft, color: n >= lim.spotSwings ? '#B83A0E' : C.ink })
  const trow = (r: Row) => {
    const a = r.get(base as Readout), b = r.get(dial as Readout)
    const d = a != null && b != null && moved ? b - a : null
    const good = d == null || thin || Math.abs(d) < r.band ? null : (d > 0) === r.up
    return (
      <tr key={r.label} style={{ borderTop: `1px solid ${C.soft}` }}>
        <td style={{ padding: r.hero ? '9px 6px' : '6px 6px', fontWeight: r.hero ? 800 : 500 }}>{r.label}</td>
        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 800, fontSize: r.hero ? 20 : undefined }}>{a == null ? '—' : r.fmt(a)}</td>
        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 800, fontSize: r.hero ? 20 : undefined }}>{!moved ? '—' : b == null ? '—' : r.fmt(b)}</td>
        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 800, color: good == null ? C.mute : good ? GREEN : RED, background: good == null ? 'transparent' : good ? '#E6F3EC' : '#FBE9E5', borderRadius: 4 }}>{d == null ? '—' : `${r.diff(d)}${good == null ? ' (too close)' : ''}`}</td>
      </tr>
    )
  }
  const head = <thead><tr><th style={{ ...th, textAlign: 'left' }}>Measure</th><th style={th}>His average shape</th><th style={th}>{moved ? 'Shape you chose' : 'Move a slider to compare'}</th><th style={th}>Difference</th></tr></thead>
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderTop: `4px solid #2F6DB5`, borderRadius: 6, padding: '12px 14px', marginTop: 12 }} aria-label={`Dial ${name}'s shape`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <b style={{ fontSize: 16 }}>Try a different shape on {name}’s {lc}</b>
        <button type="button" disabled={!moved} onClick={() => set(0, 0)} style={{ border: 0, background: 'none', color: moved ? C.orange : C.faint, fontWeight: 800, cursor: moved ? 'pointer' : 'default', fontFamily: 'inherit', padding: 0, minHeight: 32 }}>Back to his average</button>
      </div>
      <p style={{ margin: '4px 0 6px', fontSize: 13, lineHeight: 1.5, color: '#3d382f', background: C.soft, borderRadius: 6, padding: '6px 10px' }}><b>What this is, and is not.</b> It compares what <i>other pitchers’</i> {lc}s did at two shapes. It does not say {name} can throw the dialed movement, or that his results would change.</p>
      <p style={{ fontSize: 12.5, color: '#5b5347', lineHeight: 1.5, margin: '0 0 10px' }}>His average is about <b style={{ color: C.ink }}>{avg.ivb.toFixed(1)} in of ride</b> and <b style={{ color: C.ink }}>{Math.abs(avg.hb).toFixed(1)} in {avg.hb >= 0 ? 'arm' : 'glove'}-side</b>. Speed and arm angle are held as they are; only ride and sideways movement change here. Move the sliders, click the map, or load another pitcher’s shape.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 10 }}>
        {slider('Ride (up)', dRide, v => set(v, dRun), 'less ride', 'more ride')}
        {slider('Run (sideways)', dRun, v => set(dRide, v), 'toward glove side', 'toward arm side')}
      </div>
      {presets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#6b6355' }}>Load a real pitcher’s shape:</span>
          {presets.map(r => <button key={r.pitcherId} type="button" onClick={() => onTarget({ hb: r.hb, ivb: r.ivb })} style={{ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>{r.name} <span style={{ color: C.mute, fontWeight: 600 }}>{r.ivb.toFixed(1)} in ride, {Math.abs(r.hb).toFixed(1)} in run</span></button>)}
        </div>
      )}
      {base === undefined || (moved && dial === undefined) ? <div style={{ fontSize: 13, color: C.mute }}>Loading what these shapes have produced…</div>
        : !ready ? <div style={{ fontSize: 13, color: '#5b5347' }}>What league pitches shaped like this have produced isn’t built for this pitch yet, so no difference is shown. Nothing is estimated in its place.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', fontSize: 12.5, color: '#5b5347', marginBottom: 4 }}>
              <span style={badge(swA)}>{sample(swA)}</span><span>{swA.toLocaleString('en-US')} swings at his average shape</span>
              {moved && <><span style={badge(swB)}>{sample(swB)}</span><span>{swB.toLocaleString('en-US')} swings at the shape you chose</span></>}
              <span style={{ color: C.faint }}>league {lc}s within ±{radius} in, {year ?? 'all seasons'}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>
              {head}
              <tbody>{ROWS.filter(r => r.hero).map(trow)}</tbody>
            </table>
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 800, color: C.orange, minHeight: 32, display: 'flex', alignItems: 'center' }}>More measures: wOBA, xwOBA, average, slugging</summary>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>
                {head}
                <tbody>{ROWS.filter(r => !r.hero).map(trow)}</tbody>
              </table>
            </details>
            <div style={{ fontSize: 11.5, color: '#6b6355', lineHeight: 1.5, marginTop: 6 }}>
              Green is better for the pitcher, red is worse, and grey means too close to call (inside the usual pitch-to-pitch variation{thin ? ', or there are too few swings to call it' : ''}). A dash means too few swings or plate appearances at that shape to show a number.
            </div>
          </div>
        )}
    </section>
  )
}
