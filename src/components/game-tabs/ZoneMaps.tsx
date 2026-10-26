'use client'

// Hot-zone maps with all 13 zones (the 3x3 strike zone plus the four chase zones around it, catcher's view) and a metric switch.
// Batters: xwOBA, AVG, SLG. Pitchers: share of pitches, AVG against, SLG against, xwOBA against. Only receives data the viewer may see (gated on the server).
import { useState } from 'react'

export type Cell = { n: number; ba: number | null; slg: number | null; xwoba: number | null; share?: number | null }
export type Mode = 'share' | 'ba' | 'slg' | 'xwoba'
const MODE_LABEL: Record<Mode, string> = { share: 'Pitch share', ba: 'AVG', slg: 'SLG', xwoba: 'xwOBA' }
const SCALE: Record<Mode, [number, number]> = { share: [0, 12], ba: [0.15, 0.35], slg: [0.25, 0.65], xwoba: [0.15, 0.5] }
const shade = (t: number) => `rgba(255,87,34,${(0.06 + Math.min(1, Math.max(0, t)) * 0.62).toFixed(2)})`
const f3 = (v: number) => v.toFixed(3).replace(/^0/, '')

function Map13({ cells, mode, minN }: { cells: Record<string, Cell>; mode: Mode; minN: number }) {
  const val = (z: string): { text: string; bg: string } => {
    const c = cells[z]
    if (!c) return { text: '', bg: '#f6f3ec' }
    const v = mode === 'share' ? c.share ?? null : c[mode]
    if (v == null) return { text: '', bg: '#f6f3ec' }
    const small = mode !== 'share' && c.n < minN
    const text = mode === 'share' ? `${Math.round(v)}%` : f3(v)
    return { text: text + (small ? '*' : ''), bg: small ? '#f6f3ec' : shade((v - SCALE[mode][0]) / (SCALE[mode][1] - SCALE[mode][0])) }
  }
  const cell = (z: string, extra: React.CSSProperties = {}) => {
    const v = val(z)
    return <div key={z} title={`Zone ${z}${cells[z] ? `, n ${cells[z].n}` : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: v.bg, ...extra }}>{v.text}</div>
  }
  // 150px square: the four chase zones are the quadrants of the outer box; the 3x3 zone sits in the middle.
  return (
    <div style={{ position: 'relative', width: 150, height: 150, border: '2px solid #1A1A1A', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1, background: '#fff' }}>
        {['11', '12', '13', '14'].map((z, i) => cell(z, { alignItems: i < 2 ? 'flex-start' : 'flex-end', justifyContent: i % 2 ? 'flex-end' : 'flex-start', padding: 3 }))}
      </div>
      <div style={{ position: 'absolute', left: 25, top: 25, width: 100, height: 100, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 1, background: '#fff', border: '2px solid #1A1A1A' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(z => cell(z))}
      </div>
    </div>
  )
}

export default function ZoneMaps({ maps, modes, defaultMode, minN, footnote }: { maps: { title: string; sub?: string; cells: Record<string, Cell> }[]; modes: Mode[]; defaultMode: Mode; minN: number; footnote: string }) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  return (
    <div>
      <div role="group" aria-label="Zone metric" style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        {modes.map(m => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} style={{ background: 'none', border: 0, borderBottom: `3px solid ${mode === m ? '#FF5722' : 'transparent'}`, padding: '2px 0', fontSize: 13, fontWeight: 800, color: mode === m ? '#1A1A1A' : '#8a8275', cursor: 'pointer', font: 'inherit' }}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {maps.map(m => (
          <div key={m.title}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.title} <span style={{ color: '#8a8275', fontWeight: 400 }}>{m.sub}</span></div>
            <Map13 cells={m.cells} mode={mode} minN={minN} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#8a8275', marginTop: 6 }}>{footnote}</div>
    </div>
  )
}
