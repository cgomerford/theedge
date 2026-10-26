'use client'

// Hot-zone maps with all 13 zones (the 3x3 strike zone plus the four chase zones around it, catcher's view) and a metric switch.
// Batters: xwOBA, AVG, SLG. Pitchers: share of pitches, AVG against, SLG against, xwOBA against. Only receives data the viewer may see (gated on the server).
import { useRef, useState } from 'react'

export type Cell = { n: number; ba: number | null; slg: number | null; xwoba: number | null; share?: number | null }
export type Mode = 'share' | 'ba' | 'slg' | 'xwoba'
const MODE_LABEL: Record<Mode, string> = { share: 'Pitch share', ba: 'AVG', slg: 'SLG', xwoba: 'xwOBA' }
const SCALE: Record<Mode, [number, number]> = { share: [0, 12], ba: [0.15, 0.37], slg: [0.25, 0.65], xwoba: [0.17, 0.5] }
// Man City sky blue (#6CABDD) for low, neutral in the middle, red for high, the same direction as the site's percentile bars. Red always means the higher number.
const BLUE = [108, 171, 221], MID = [239, 234, 224], RED = [212, 83, 59]
const shade = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  const [a, b, k] = x < 0.5 ? [BLUE, MID, x / 0.5] : [MID, RED, (x - 0.5) / 0.5]
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
}
const f3 = (v: number) => v.toFixed(3).replace(/^0/, '')

const ZONE_NAME: Record<string, string> = {
  '1': 'High left', '2': 'High middle', '3': 'High right', '4': 'Middle left', '5': 'Middle middle', '6': 'Middle right', '7': 'Low left', '8': 'Low middle', '9': 'Low right',
  '11': 'Chase: up and left', '12': 'Chase: up and right', '13': 'Chase: down and left', '14': 'Chase: down and right',
}
type Tip = { z: string; x: number; y: number }

function Map13({ cells, mode, minN, nLabel, onTip }: { cells: Record<string, Cell>; mode: Mode; minN: number; nLabel: string; onTip: (t: (Tip & { cell?: Cell; nLabel: string }) | null) => void }) {
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
    const show = (e: React.SyntheticEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); onTip({ z, x: r.left + r.width / 2, y: r.top, cell: cells[z], nLabel }) }
    return <div key={z} tabIndex={0} aria-label={`${ZONE_NAME[z]}${cells[z] ? `, n ${cells[z].n}` : ''}`} onMouseEnter={show} onFocus={show} onMouseLeave={() => onTip(null)} onBlur={() => onTip(null)} style={{ cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: v.bg, ...extra }}>{v.text}</div>
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

export default function ZoneMaps({ maps, modes, defaultMode, minN, footnote, nLabel = 'pitches' }: { maps: { title: string; sub?: string; cells: Record<string, Cell> }[]; modes: Mode[]; defaultMode: Mode; minN: number; footnote: string; nLabel?: string }) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [tip, setTip] = useState<(Tip & { cell?: Cell; nLabel: string }) | null>(null)
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div role="group" aria-label="Zone metric" style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        {modes.map(m => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} style={{ background: 'none', border: 0, borderBottom: `3px solid ${mode === m ? '#FF5722' : 'transparent'}`, padding: '2px 0', fontSize: 13, fontWeight: 800, color: mode === m ? '#1A1A1A' : '#8a8275', cursor: 'pointer', font: 'inherit' }}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {maps.map(m => (
          <div key={m.title}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.title} <span style={{ color: '#8a8275', fontWeight: 400 }}>{m.sub}</span></div>
            <Map13 cells={m.cells} mode={mode} minN={minN} nLabel={nLabel} onTip={setTip} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#8a8275', marginTop: 6 }}>{footnote} Blue is low, red is high. Hover a zone for its numbers.</div>
      {tip && box.current ? (() => {
        const b = box.current.getBoundingClientRect()
        const c = tip.cell
        return (
          <div role="tooltip" style={{ position: 'absolute', left: Math.min(Math.max(tip.x - b.left - 80, 0), Math.max(0, b.width - 170)), top: tip.y - b.top - 8, transform: 'translateY(-100%)', width: 160, background: '#1A1A1A', color: '#fff', borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.5, pointerEvents: 'none', zIndex: 5, fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ fontWeight: 800 }}>{ZONE_NAME[tip.z]}</div>
            {c ? (
              <>
                <div>n {c.n.toLocaleString('en-US')} {tip.nLabel}{c.n < minN ? ' (small sample)' : ''}</div>
                {c.share != null ? <div>Pitch share {c.share.toFixed(1)}%</div> : null}
                <div>AVG {c.ba == null ? 'pending' : f3(c.ba)} · SLG {c.slg == null ? 'pending' : f3(c.slg)}</div>
                <div>xwOBA {c.xwoba == null ? 'pending' : f3(c.xwoba)}</div>
              </>
            ) : <div>No data for this zone</div>}
          </div>
        )
      })() : null}
    </div>
  )
}
