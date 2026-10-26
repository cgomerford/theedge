// Small shared pieces for the four game tabs: card, label, readout tile, zone grid, ghost placeholder, asterisk and footnote.
import type { CSSProperties, ReactNode } from 'react'

export const MUTE = '#8a8275', LINE = '#e7e2d8', TILE = '#f0ece1'
export const num: CSSProperties = { fontVariantNumeric: 'tabular-nums' }
export const ops3 = (v: number | null | undefined) => (v == null ? '' : v.toFixed(3).replace(/^0/, ''))
export const Star = () => <span title="Small sample" style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
export const SMALL = '* small sample: under 10 swings or 10 PA.'

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, minWidth: 0, ...style }}>{children}</section>
}
export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTE, margin: '18px 0 8px', ...style }}>{children}</div>
}
export function Tile({ label, value, sub, rule }: { label: string; value: ReactNode; sub?: ReactNode; rule: string }) {
  return (
    <div style={{ background: TILE, borderLeft: `4px solid ${rule}`, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTE }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, ...num, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTE, ...num }}>{sub}</div>
    </div>
  )
}
export function Pending() { return <span style={{ color: MUTE, fontSize: 13 }}>pending</span> }

/** Orange scale for a 3x3 zone grid: 0 = near white, 1 = deep orange. */
export const zoneShade = (t: number) => `rgba(255,87,34,${(0.06 + Math.min(1, Math.max(0, t)) * 0.62).toFixed(2)})`

export function ZoneGrid({ values, fmt, scale, small }: { values: (number | null)[]; fmt: (v: number) => string; scale: [number, number]; small?: boolean[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '2px solid #1A1A1A', width: 118, ...num }}>
      {values.map((v, i) => (
        <div key={i} style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: v == null || small?.[i] ? '#f6f3ec' : zoneShade((v - scale[0]) / (scale[1] - scale[0])), border: '1px solid #fff' }}>
          {v == null ? '' : fmt(v)}{small?.[i] ? '*' : ''}
        </div>
      ))}
    </div>
  )
}

/** Ghost block for gated content: labels only, never values. */
export function GhostBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ position: 'relative', margin: '14px 0', padding: '20px 0', borderTop: `1px dashed ${LINE}`, borderBottom: `1px dashed ${LINE}` }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', opacity: 0.5 }} aria-hidden>
        {[0, 1].map(i => <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: 118, border: `2px dashed ${LINE}` }}>{Array.from({ length: 9 }, (_, j) => <div key={j} style={{ height: 34, border: `1px solid ${LINE}` }} />)}</div>)}
      </div>
      <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#57534E' }}>{detail}</div>
    </div>
  )
}
