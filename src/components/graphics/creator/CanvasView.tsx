// src/components/graphics/creator/CanvasView.tsx
//
// Draws a Graphic Creator document at its design size (the studio scales it to fit, and exports it at 1:1). Pure: document and preloaded
// pictures in, markup out. The footer strip (x9 mark and the source line) is always drawn and is not a layer, so it cannot be removed.
// One font: Red Hat via SANS; weight, size, caps and letter-spacing carry the hierarchy.

import type { CSSProperties } from 'react'
import XMarkInline from '@/components/graphics/XMarkInline'
import { SANS } from '@/components/team/ui'
import { FOOTER_TEXT, HANDLE } from '@/lib/graphics/constants'
import { teamColor } from '@/lib/graphics/teams'
import { CREATOR_SIZES, CREAM, FOOTER_H, INK, ORANGE, type Background, type CreatorDoc, type Layer } from '@/lib/graphics/creator'

export type PictureMap = Record<string, string>

export function bgColor(bg: Background): string {
  switch (bg.kind) {
    case 'cream': return CREAM
    case 'white': return '#FFFFFF'
    case 'dark': return INK
    case 'team': return teamColor(bg.team)
    case 'color': return bg.color
  }
}
/** Light text on a dark background, ink on a light one. */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return INK
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.5 ? '#FAF8F3' : INK
}

export const pictureKey = (l: Layer): string | null =>
  l.kind === 'logo' ? `team:${l.team}` : l.kind === 'headshot' && l.playerId ? `hs:${l.playerId}` : l.kind === 'image' && l.src ? `img:${l.src}` : null

function LayerBody({ l, pics, ink, edit }: { l: Layer; pics: PictureMap; ink: string; edit: boolean }) {
  const key = pictureKey(l)
  const src = key ? pics[key] : undefined
  switch (l.kind) {
    case 'text':
      return <div style={{ fontSize: l.size, fontWeight: l.weight, color: l.color, textAlign: l.align, textTransform: l.caps ? 'uppercase' : 'none', letterSpacing: l.caps ? '.12em' : '-0.01em', lineHeight: 1.12, whiteSpace: 'pre-wrap', fontVariantNumeric: 'tabular-nums' }}>{l.text}</div>
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img src={src} alt={l.alt} style={{ width: '100%', height: '100%', objectFit: l.fit, borderRadius: l.radius, display: 'block' }} /> : edit ? <Empty label="Picture loading…" /> : null
    case 'headshot':
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img src={src} alt={l.name} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom', display: 'block' }} /> : edit ? <Empty label={l.playerId ? 'Headshot loading…' : 'Choose a player'} /> : null
    case 'logo':
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img src={src} alt={l.team} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: l.h * 0.3, color: ink }}>{l.team}</div>
    case 'rect':
      return <div style={{ width: '100%', height: '100%', background: l.color, borderRadius: l.radius }} />
    case 'bars': {
      const n = Math.max(1, l.rows.length)
      const rowH = l.h / n
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {l.rows.map((r, i) => (
            <div key={i} style={{ height: rowH, display: 'grid', gridTemplateColumns: '24% 1fr 12%', alignItems: 'center', gap: 14, color: ink }}>
              <div style={{ fontSize: Math.min(30, rowH * 0.42), fontWeight: 700 }}>{r.label}</div>
              <div style={{ height: Math.min(26, rowH * 0.4), background: 'rgba(128,128,128,.18)', borderRadius: 6 }}><div style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, height: '100%', background: l.color, borderRadius: 6 }} /></div>
              <div style={{ fontSize: Math.min(30, rowH * 0.42), fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.value}</div>
            </div>
          ))}
        </div>
      )
    }
    case 'stat': {
      const bg = l.tone === 'dark' ? INK : l.tone === 'accent' ? ORANGE : '#F1EEE6'
      const fg = l.tone === 'light' ? INK : '#FFFFFF'
      return (
        <div style={{ width: '100%', height: '100%', background: bg, color: fg, borderRadius: 16, padding: '4% 6%', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
          <div style={{ fontSize: l.h * 0.4, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.value}</div>
          <div style={{ fontSize: Math.max(14, l.h * 0.1), fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginTop: l.h * 0.05 }}>{l.label}</div>
          {l.sample && <div style={{ fontSize: Math.max(13, l.h * 0.085), opacity: 0.8, marginTop: 4 }}>{l.sample}</div>}
        </div>
      )
    }
  }
}

function Empty({ label }: { label: string }) {
  return <div style={{ width: '100%', height: '100%', border: '2px dashed #b9b2a2', borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 16, color: '#8a8275', background: 'rgba(241,238,230,.6)' }}>{label}</div>
}

export default function CanvasView({ doc, pics, edit = false, children }: { doc: CreatorDoc; pics: PictureMap; edit?: boolean; children?: React.ReactNode }) {
  const { w, h } = CREATOR_SIZES[doc.size]
  const bg = bgColor(doc.bg)
  const ink = inkFor(bg)
  const muted = ink === INK ? '#5C5A55' : 'rgba(250,248,243,.7)'
  const wrap: CSSProperties = { position: 'relative', width: w, height: h, background: bg, overflow: 'hidden', fontFamily: SANS, color: ink }
  return (
    <div style={wrap}>
      {doc.layers.map(l => (
        <div key={l.id} data-layer={l.id} style={{ position: 'absolute', left: l.x, top: l.y, width: l.w, height: l.h, cursor: edit ? 'move' : undefined }}>
          <LayerBody l={l} pics={pics} ink={ink} edit={edit} />
        </div>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FOOTER_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', borderTop: `1px solid ${ink === INK ? '#D6D2C8' : 'rgba(250,248,243,.25)'}`, fontSize: 16, color: muted, boxSizing: 'border-box', pointerEvents: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: 22, color: ink }}><XMarkInline /></span>
        <span>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 800, color: ORANGE }}>{HANDLE}</span>
      </div>
      {children}
    </div>
  )
}
