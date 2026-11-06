// src/components/graphics/HeadlineCard.tsx  (template: headline)
//
// The big-type title graphic: x9Lab mark, a headline set very large with one phrase in orange, a one-line question or subline, and the constant footer, over a baseball seam
// drawing. The headline is the spec title: a line break starts a new line, and text between *asterisks* is orange. The subtitle is the line under it. No stats, no data panel.
// Fixed pixel size from SIZES with overflow hidden so it exports at exactly that size. The footer and handle come from constants and cannot be edited away.

import { FOOTER_TEXT, GT, HANDLE, SIZES } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import { SANS } from '@/components/team/ui'

/** "Paul Skenes\nlost his *99 mph*\nfastball." -> lines of {text, hot} runs. */
export function headlineLines(title: string): { text: string; hot: boolean }[][] {
  return title.split('\n').map(line => line.split('*').map((text, i) => ({ text, hot: i % 2 === 1 })).filter(r => r.text !== ''))
}

/** Stitch ticks along an arc, perpendicular to it. */
function seam(cx: number, cy: number, r: number, from: number, to: number, n: number, len: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (n - 1)
    const c = Math.cos(a), s = Math.sin(a)
    return { x1: cx + (r - len) * c, y1: cy + (r - len) * s, x2: cx + (r + len) * c, y2: cy + (r + len) * s, k: i / (n - 1) }
  })
}

function Ball({ w, h, portrait }: { w: number; h: number; portrait: boolean }) {
  const R = portrait ? 330 : 270
  const cx = portrait ? w - 120 : w - 50, cy = portrait ? h - 360 : h * 0.47
  const left = seam(cx + 190, cy, R + 20, Math.PI * 0.62, Math.PI * 1.38, 30, 11)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0 }} aria-hidden>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={GT.ink} strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="2 5" />
      <path d={`M ${cx + 190 + (R + 20) * Math.cos(Math.PI * 0.62)} ${cy + (R + 20) * Math.sin(Math.PI * 0.62)} A ${R + 20} ${R + 20} 0 0 1 ${cx + 190 + (R + 20) * Math.cos(Math.PI * 1.38)} ${cy + (R + 20) * Math.sin(Math.PI * 1.38)}`} fill="none" stroke={GT.ink} strokeOpacity={0.5} strokeWidth={1.4} />
      {left.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.k < 0.55 ? GT.accent : GT.ink} strokeOpacity={t.k < 0.55 ? 1 : 0.35} strokeWidth={t.k < 0.55 ? 3 : 2} strokeLinecap="round" />)}
      {[0, 1, 2, 3].map(i => (
        <path key={i} d={`M ${portrait ? 200 + i * 40 : 560 + i * 30} ${h - (portrait ? 190 : 110) + i * 4} Q ${w * 0.66} ${cy + 150 - i * 20} ${cx - R * 0.15} ${cy + 60 - i * 38}`} fill="none" stroke={i === 2 ? GT.accent : GT.ink} strokeOpacity={i === 2 ? 1 : 0.4} strokeWidth={i === 2 ? 2.4 : 1.2} />
      ))}
    </svg>
  )
}

export default function HeadlineCard({ spec, size, images }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages }) {
  const { w, h } = SIZES[size]
  const portrait = size === 'portrait'
  const lines = headlineLines(spec.title)
  const longest = Math.max(1, ...lines.map(l => l.reduce((n, r) => n + r.text.length, 0)))
  const textW = portrait ? w - 100 : Math.round(w * 0.68)
  const room = portrait ? 700 : 340
  const fs = Math.floor(Math.min(portrait ? 170 : 124, textW / (longest * 0.54), room / (Math.max(1, lines.length) * 1.0)))
  const mark = images?.x9
  return (
    <div data-graphic-root style={{ width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', background: GT.paper, color: GT.ink, fontFamily: SANS, position: 'relative', padding: portrait ? '46px 50px 34px' : '34px 44px 24px', display: 'flex', flexDirection: 'column' }}>
      <Ball w={w} h={h} portrait={portrait} />
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {mark
          // eslint-disable-next-line @next/next/no-img-element -- exported via html-to-image from a data URL
          ? <img src={mark} alt="x9Lab" style={{ height: portrait ? 54 : 42, width: 'auto', display: 'block' }} />
          : <span style={{ fontWeight: 800, fontSize: portrait ? 44 : 36, letterSpacing: '-.02em' }}>x9<span style={{ color: GT.accent }}>Lab</span></span>}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: textW }}>
        <h1 style={{ margin: 0, fontWeight: 800, fontSize: fs, lineHeight: 0.98, letterSpacing: '-.035em' }}>
          {lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l.map((r, j) => <span key={j} style={r.hot ? { color: GT.accent } : undefined}>{r.text}</span>)}</div>)}
        </h1>
        {spec.subtitle && <p style={{ margin: portrait ? '34px 0 0' : '26px 0 0', fontSize: portrait ? 40 : 29, fontWeight: 500, lineHeight: 1.2 }}>{spec.subtitle}</p>}
      </div>
      <div style={{ position: 'relative', flexShrink: 0, borderTop: `2px solid ${GT.ink}`, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: portrait ? 22 : 18, fontWeight: 500 }}>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 800, fontSize: portrait ? 26 : 21, color: GT.accent, whiteSpace: 'nowrap' }}>{HANDLE}</span>
      </div>
    </div>
  )
}
