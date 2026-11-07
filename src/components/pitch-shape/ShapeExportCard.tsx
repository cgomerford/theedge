'use client'

// src/components/pitch-shape/ShapeExportCard.tsx
//
// The Pitch Shape Lab's pitcher card as a picture for X: the league movement map with his pitches on it, his Shape Score, his results against what his shape has produced, and the reasons
// the data points to. Plain data in, fixed pixel size out (landscape 1200 x 675, portrait 1080 x 1350), overflow hidden so it exports at exactly that size. Same look as the graphics studio:
// cream paper, Red Hat Display only, the x9Lab wordmark, one orange accent, and the fixed footer and handle (src/lib/graphics/constants.ts) that nothing can edit away.
// Descriptions of what has happened with the sample behind them; not a forecast.

import { useEffect, useRef } from 'react'
import { FOOTER_TEXT, GT, HANDLE, SIZES } from '@/lib/graphics/constants'
import { SANS } from '@/components/team/ui'
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { makeGrid, type Span } from './heatGrid'
import { MAP_BG, boxColour } from './finder-math'

export type ExportData = {
  name: string; team: string; hand: 'R' | 'L'; pitchName: string; season: number
  score: number | null; shapeWord: string | null
  verdict: 'ahead' | 'behind' | 'level' | null
  /** one or two sentences: what the data points to */
  headline: string
  stats: { label: string; his: string; shape: string; tone: 'good' | 'bad' | 'level' }[]
  factors: { label: string; status: 'explains' | 'helps' | 'small' | 'note' | 'unknown'; number: string }[]
  map: { payload: MovementCellsPayload; span: Span; leagueRate: number; points: [number, number][]; avg: { hb: number; ivb: number } }
}

const TONE = { good: '#13694F', bad: '#A8391F', level: '#5b5347' } as const
const STATUS: Record<ExportData['factors'][number]['status'], { word: string; bg: string; fg: string }> = {
  explains: { word: 'Part of the gap', bg: '#FBE6E1', fg: '#A8391F' }, helps: { word: 'Helping him', bg: '#E3F3EC', fg: '#13694F' },
  small: { word: 'Not the cause', bg: '#F1EEE6', fg: '#5b5347' }, note: { word: 'Worth noting', bg: '#FFF4CC', fg: '#7A5B00' }, unknown: { word: 'No read', bg: '#F1EEE6', fg: '#8a8275' },
}

function MapCanvas({ m, px }: { m: ExportData['map']; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const grid = makeGrid(m.payload, m.span)
  const N = 2 * grid.h10 + 1
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = N; cv.height = N
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(N, N)
    // same colouring as the lab's whiff map: orange where hitters miss more than the league average, blue-grey where fewer, blank where thin
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const x = grid.gx0 + grid.m10 + xx, y = grid.gy0 + grid.m10 + yy
      const r10 = 10
      const gx = x - grid.gx0, gy = y - grid.gy0
      const x0 = Math.max(0, gx - r10), x1 = Math.min(grid.size - 1, gx + r10), y0 = Math.max(0, gy - r10), y1 = Math.min(grid.size - 1, gy + r10)
      const w = (t: Float64Array) => t[(y1 + 1) * (grid.size + 1) + (x1 + 1)] - t[y0 * (grid.size + 1) + (x1 + 1)] - t[(y1 + 1) * (grid.size + 1) + x0] + t[y0 * (grid.size + 1) + x0]
      const rgb = boxColour(w(grid.iS), w(grid.iW), m.leagueRate) ?? MAP_BG
      const o = ((N - 1 - yy) * N + xx) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  })
  const box = (hb: number, ivb: number) => ({ x: hb * 10 - (grid.gx0 + grid.m10) + 0.5, y: N - (ivb * 10 - (grid.gy0 + grid.m10) + 0.5) })
  const a = box(m.avg.hb, m.avg.ivb)
  return (
    <div style={{ position: 'relative', width: px, height: px, border: '1px solid #e7e2d8', borderRadius: 10, overflow: 'hidden', background: '#EDE8DC' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
      <svg viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {m.points.map((p, i) => { const b = box(p[0], p[1]); return <circle key={i} cx={b.x} cy={b.y} r={N / 120} fill={GT.ink} fillOpacity={0.7} stroke="#fff" strokeWidth={N / 500} /> })}
        <circle cx={a.x} cy={a.y} r={N / 38} fill="none" stroke={GT.ink} strokeWidth={N / 140} />
        <circle cx={a.x} cy={a.y} r={N / 120} fill={GT.accent} />
      </svg>
    </div>
  )
}

export default function ShapeExportCard({ d, size }: { d: ExportData; size: 'landscape' | 'portrait' }) {
  const { w, h } = SIZES[size]
  const portrait = size === 'portrait'
  const mapPx = portrait ? 430 : 372
  const verdictWord = d.verdict === 'ahead' ? 'Outperforming his shape' : d.verdict === 'behind' ? 'Underperforming his shape' : d.verdict === 'level' ? 'In line with his shape' : null
  const verdictCol = d.verdict === 'ahead' ? '#13694F' : d.verdict === 'behind' ? '#A8391F' : '#5b5347'
  const stats = d.stats.slice(0, 4)
  const factors = d.factors.filter(f => f.status !== 'unknown').sort((a, b) => (a.status === 'explains' ? 0 : a.status === 'note' ? 1 : a.status === 'helps' ? 2 : 3) - (b.status === 'explains' ? 0 : b.status === 'note' ? 1 : b.status === 'helps' ? 2 : 3)).slice(0, 4)
  const label: React.CSSProperties = { fontSize: portrait ? 15 : 12, letterSpacing: '.14em', fontWeight: 800, color: GT.muted, textTransform: 'uppercase' }
  const statsBlock = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: portrait ? 14 : 6 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: portrait ? 80 : 58, lineHeight: 1, letterSpacing: '-.03em' }}>{d.score ?? '—'}</div>
          <div style={label}>Shape Score</div>
        </div>
        <div>
          {d.shapeWord && <div style={{ fontWeight: 800, fontSize: portrait ? 26 : 20, color: GT.accent }}>{d.shapeWord}</div>}
          {verdictWord && <div style={{ fontWeight: 800, fontSize: portrait ? 21 : 17, color: verdictCol }}>{verdictWord}</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: portrait ? '8px 20px' : '3px 22px', fontSize: portrait ? 22 : 17, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
        <span style={label}>His {d.pitchName.toLowerCase()}</span><span style={{ ...label, textAlign: 'right' }}>Him</span><span style={{ ...label, textAlign: 'right' }}>His shape</span>
        {stats.map(s => (
          <div key={s.label} style={{ display: 'contents' }}>
            <span style={{ fontWeight: 700 }}>{s.label}</span>
            <b style={{ textAlign: 'right', color: TONE[s.tone] }}>{s.his}</b>
            <span style={{ textAlign: 'right', color: GT.muted }}>{s.shape}</span>
          </div>
        ))}
      </div>
    </div>
  )
  const factorBlock = factors.length > 0 && (
    <div style={{ marginTop: portrait ? 0 : 10 }}>
      <div style={{ ...label, marginBottom: portrait ? 8 : 5 }}>Why the results are not there</div>
      <div style={{ display: 'grid', gridTemplateColumns: portrait ? '1fr' : '1fr 1fr', gap: portrait ? 8 : 5 }}>
        {factors.map(f => (
          <div key={f.label} style={{ background: STATUS[f.status].bg, borderRadius: 8, padding: portrait ? '8px 14px' : '4px 10px' }}>
            <div style={{ fontWeight: 800, fontSize: portrait ? 20 : 14, color: STATUS[f.status].fg }}>{f.label}</div>
            <div style={{ fontSize: portrait ? 17 : 12.5, color: '#3a352c' }}>{STATUS[f.status].word}{f.number ? ` · ${f.number}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div data-graphic-root style={{ width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', background: GT.paper, color: GT.ink, fontFamily: SANS, padding: portrait ? '46px 50px 34px' : '24px 44px 18px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: portrait ? 42 : 30, letterSpacing: '-.02em' }}>x9<span style={{ color: GT.accent }}>Lab</span></span>
        <span style={{ ...label, color: GT.accent }}>Pitch Shape Lab · {d.hand === 'R' ? 'RHP' : 'LHP'} · {d.team} · {d.season}</span>
      </div>
      <div style={{ marginTop: portrait ? 26 : 14, flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: portrait ? 88 : 48, lineHeight: 0.98, letterSpacing: '-.035em' }}>{d.name} <span style={{ color: GT.accent }}>{d.pitchName.toLowerCase()}</span></div>
        <div style={{ fontSize: portrait ? 30 : 19, fontWeight: 500, lineHeight: 1.25, marginTop: portrait ? 16 : 6, maxWidth: portrait ? 940 : 1100 }}>{d.headline}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: portrait ? 26 : 28, marginTop: portrait ? 22 : 12, alignItems: portrait ? 'center' : 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <MapCanvas m={d.map} px={mapPx} />
          <div style={{ fontSize: portrait ? 15 : 11, color: GT.muted, marginTop: 5, maxWidth: mapPx, lineHeight: 1.25 }}>League {d.pitchName.toLowerCase()}s by movement, coloured by whiffs per swing (orange: more than average). Dots are his pitches, the ring his average.</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, width: portrait ? '100%' : undefined, display: portrait ? 'grid' : 'block', gridTemplateColumns: portrait ? '1fr 1fr' : undefined, gap: portrait ? 26 : undefined, alignItems: 'start' }}>
          {statsBlock}
          {factorBlock}
        </div>
      </div>
      <div style={{ flexShrink: 0, borderTop: `2px solid ${GT.ink}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: portrait ? 19 : 15, fontWeight: 500 }}>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 800, fontSize: portrait ? 24 : 19, color: GT.accent, whiteSpace: 'nowrap' }}>{HANDLE}</span>
      </div>
    </div>
  )
}
