'use client'

// src/components/pitch-shape/RangeSlider.tsx
//
// A two-ended slider (from / to) with a bar chart of how many league pitches sit at each value behind it, so the slow end and the fast end are visible before anything is dragged. Two native range inputs
// share one track (keyboard and screen-reader friendly); the bars outside the chosen range are greyed. Plain controlled component: the parent owns the value.
import { C } from '@/components/team/ui'

export default function RangeSlider({ label, unit, min, max, step = 1, value, onChange, hist, bandWidth, ariaFrom, ariaTo }: {
  label: string; unit: string; min: number; max: number; step?: number
  value: [number, number]; onChange: (v: [number, number]) => void
  /** pitches at each step from min to max, drawn behind the track */
  hist?: number[]
  /** when set, each bar is a band of this width starting at min (arm angle in 10-degree bands); otherwise each bar is a single value */
  bandWidth?: number
  ariaFrom: string; ariaTo: string
}) {
  const [lo, hi] = value
  const peak = Math.max(1, ...(hist ?? [1]))
  const pos = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * 100)
  const nBars = hist?.length ?? 0
  return (
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
      <style>{`.rs-in{position:absolute;left:0;right:0;width:100%;margin:0;height:22px;background:none;pointer-events:none;-webkit-appearance:none;appearance:none}.rs-in::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:18px;height:18px;border-radius:50%;background:#1A1A1A;border:2px solid #fff;box-shadow:0 0 0 1px #1A1A1A;cursor:grab}.rs-in::-moz-range-thumb{pointer-events:auto;width:14px;height:14px;border-radius:50%;background:#1A1A1A;border:2px solid #fff;cursor:grab}.rs-in::-webkit-slider-runnable-track{background:none}.rs-in::-moz-range-track{background:none}.rs-in:focus-visible::-webkit-slider-thumb{outline:2px solid #FF5722;outline-offset:2px}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{label}</span>
        <b style={{ fontSize: 13.5 }}>{lo === min && hi === max ? `All (${min}–${max} ${unit})` : `${lo}–${hi} ${unit}`}</b>
      </div>
      <div style={{ position: 'relative', height: 62, marginTop: 4 }}>
        {nBars > 0 && (
          <div aria-hidden style={{ position: 'absolute', left: 9, right: 9, top: 0, height: 38, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            {hist!.map((n, i) => {
              const from = bandWidth != null ? min + i * bandWidth : min + (i * (max - min)) / Math.max(1, nBars - 1)
              const on = bandWidth != null ? from >= lo && from + bandWidth <= hi : from >= lo && from <= hi
              return <span key={i} style={{ flex: 1, height: `${Math.max(2, (n / peak) * 100)}%`, background: on ? '#8a8275' : '#e3dfd3', borderRadius: '2px 2px 0 0' }} />
            })}
          </div>
        )}
        <div aria-hidden style={{ position: 'absolute', left: 9, right: 9, top: 46, height: 4, background: C.line, borderRadius: 2 }}>
          <div style={{ position: 'absolute', left: `${pos(lo)}%`, right: `${100 - pos(hi)}%`, top: 0, bottom: 0, background: C.ink, borderRadius: 2 }} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 37 }}>
          <input className="rs-in" type="range" min={min} max={max} step={step} value={lo} aria-label={ariaFrom} onChange={e => onChange([Math.min(Number(e.target.value), hi), hi])} />
          <input className="rs-in" type="range" min={min} max={max} step={step} value={hi} aria-label={ariaTo} onChange={e => onChange([lo, Math.max(Number(e.target.value), lo)])} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.mute }}><span>{min} {unit}</span><span>{max} {unit}</span></div>
    </div>
  )
}
