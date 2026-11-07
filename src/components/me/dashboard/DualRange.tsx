'use client'
// A Power BI style range slicer: a low and a high number box over a two-thumb slider, bounded by what the league data holds. Two native range inputs sit on top of
// each other, so it works with the keyboard and with touch.

import { C, GREY, NUMS } from '../ui'

export default function DualRange({ min, max, lo, hi, step = 1, onChange, label }: { min: number; max: number; lo: number | null; hi: number | null; step?: number; onChange: (lo: number | null, hi: number | null) => void; label: string }) {
  const a = lo ?? min, b = hi ?? max, span = Math.max(1e-9, max - min)
  const set = (nl: number, nh: number) => onChange(nl <= min ? null : nl, nh >= max ? null : nh)   // at the ends the slicer is open (null)
  const box: React.CSSProperties = { width: '46%', minHeight: 30, border: `1px solid ${C.line}`, borderRadius: 4, background: '#F1EEE6', padding: '0 6px', fontSize: 13, fontWeight: 700, ...NUMS, color: C.ink }
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <input type="number" aria-label={`${label}, lowest`} value={a} min={min} max={b} step={step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) set(Math.min(Math.max(v, min), b), b) }} style={box} />
        <input type="number" aria-label={`${label}, highest`} value={b} min={a} max={max} step={step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) set(a, Math.max(Math.min(v, max), a)) }} style={box} />
      </div>
      <div style={{ position: 'relative', height: 28, marginTop: 4 }}>
        <style>{'.db-rs::-webkit-slider-thumb{pointer-events:auto;cursor:pointer}.db-rs::-moz-range-thumb{pointer-events:auto;cursor:pointer}'}</style>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 3, background: '#cfcabd', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: `${((a - min) / span) * 100}%`, right: `${100 - ((b - min) / span) * 100}%`, top: 12, height: 3, background: C.orange, borderRadius: 2 }} />
        <input className="db-rs" type="range" min={min} max={max} step={step} value={a} aria-label={`${label}, low end`} onChange={e => set(Math.min(Number(e.target.value), b), b)} style={thumb} />
        <input className="db-rs" type="range" min={min} max={max} step={step} value={b} aria-label={`${label}, high end`} onChange={e => set(a, Math.max(Number(e.target.value), a))} style={thumb} />
      </div>
      <div style={{ fontSize: 10.5, color: GREY, display: 'flex', justifyContent: 'space-between', ...NUMS }}><span>{min}</span><span>{max}</span></div>
    </div>
  )
}
const thumb: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: 28, margin: 0, background: 'none', pointerEvents: 'none', WebkitAppearance: 'none', appearance: 'none', accentColor: '#FF5722' }
