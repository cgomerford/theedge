'use client'

// src/components/admin/stat-line/StatLineCard.tsx
//
// The graphic itself: fixed pixel size, pure function of its props (so the PNG
// export is exactly what the preview shows). Fonts via the next/font CSS
// variables (never literal family names). Gradient + text colour come from
// the builder; the transparent MLB silo headshot sits on the gradient.

import { MONO, SANS } from '@/components/team/ui'
import { fitText } from '../story/fit'
import { gradientCss, type Field, type Gradient } from './logic'

export type CardFormat = '4:5' | '1:1' | '9:16'
export const FORMATS: Record<CardFormat, { w: number; h: number; label: string }> = {
  '4:5': { w: 1080, h: 1350, label: 'X / feed · 4:5' },
  '1:1': { w: 1080, h: 1080, label: 'Square · 1:1' },
  '9:16': { w: 1080, h: 1920, label: 'Story · 9:16' },
}

export type StatLineCardProps = {
  format: CardFormat
  name: string
  pos: string
  jersey: string
  teamAbbr: string
  teamName: string
  context: string            // "Sep 27 · @ WSH"
  headline: string           // "3-FOR-4"
  note: string               // free-form lines under the headline (one per line)
  fields: Field[]
  gradient: Gradient
  textColor: string
  photo: string | null       // data URL of the silo headshot, or null → initials
  source: string             // "MLB Stats API · game log"
}

export default function StatLineCard(p: StatLineCardProps) {
  const { w, h } = FORMATS[p.format]
  const story = p.format === '9:16'
  const k = p.format === '1:1' ? 0.78 : story ? 1.12 : 1          // scale of the lower text block
  const photoSize = p.format === '1:1' ? 500 : story ? 780 : 640
  const padX = 64
  const top = story ? 269 : 64          // Instagram safe zone for stories
  const bottom = story ? 384 : 64
  const parts = p.name.trim().split(/\s+/)
  const lastRaw = parts[parts.length - 1]
  // suffixes read as part of the surname ("Tatis Jr.")
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(lastRaw) && parts.length > 2
  const firstShown = parts.length > 1 ? parts.slice(0, suffix ? -2 : -1).join(' ') : ''
  const lastShown = parts.length > 1 ? (suffix ? `${parts[parts.length - 2]} ${lastRaw}` : lastRaw) : parts[0]
  const lastFit = fitText(lastShown.toUpperCase(), { maxWidth: w - padX * 2, maxSize: Math.round(170 * k), minSize: 80, widthEm: 0.64 })
  const cols = p.fields.length <= 4 ? p.fields.length || 1 : 4
  const tileBg = p.textColor === '#1A1A1A' ? 'rgba(26,26,26,.10)' : 'rgba(250,248,243,.14)'
  const faint = p.textColor === '#1A1A1A' ? 'rgba(26,26,26,.65)' : 'rgba(250,248,243,.78)'
  const initials = parts.map(x => x[0]).slice(0, 2).join('').toUpperCase()
  const noteLines = p.note.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 5)
  const fade = 'linear-gradient(to bottom, #000 62%, transparent 100%)'

  return (
    <div data-stat-line-card style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: gradientCss(p.gradient), color: p.textColor, fontFamily: SANS }}>
      {/* watermark */}
      <div style={{ position: 'absolute', left: -30, top: top + 40, fontWeight: 800, fontSize: 560 * (p.format === '1:1' ? 0.8 : 1), letterSpacing: '-0.05em', color: p.textColor, opacity: 0.07, lineHeight: 0.8 }}>{p.teamAbbr}</div>

      {/* headshot, faded into the gradient at its lower edge */}
      <div style={{ position: 'absolute', right: -10, top: top + 24, width: photoSize, height: photoSize, WebkitMaskImage: fade, maskImage: fade }}>
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top right', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 300, opacity: 0.25 }}>{initials}</div>
        )}
      </div>

      {/* top row: brand + game context */}
      <div style={{ position: 'absolute', left: padX, top, width: w - photoSize - padX + 40 }}>
        <div style={{ fontWeight: 700, fontSize: 34, letterSpacing: '.14em', textTransform: 'uppercase' }}>⊕ x9Lab</div>
        {p.context && <div style={{ fontFamily: MONO, fontSize: 32, color: faint, marginTop: 10, lineHeight: 1.25 }}>{p.context}</div>}
      </div>

      {/* position + club on one line so it never reaches the name block */}
      <div style={{ position: 'absolute', left: padX, top: top + (p.context ? 180 : 100), display: 'flex', alignItems: 'baseline', gap: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 110 * (p.format === '1:1' ? 0.8 : 1), letterSpacing: '-0.03em', lineHeight: 1 }}>{p.pos}</div>
        <div style={{ fontFamily: MONO, fontSize: 34, color: faint }}>{[p.teamAbbr, p.jersey ? `#${p.jersey}` : ''].filter(Boolean).join(' · ')}</div>
      </div>

      {/* lower block: name, headline, tiles */}
      <div style={{ position: 'absolute', left: padX, right: padX, bottom: bottom + 64 }}>
        {firstShown && <div style={{ fontWeight: 700, fontSize: 52 * k, letterSpacing: '-0.01em', lineHeight: 1 }}>{firstShown}</div>}
        <div style={{ fontWeight: 800, fontSize: lastFit.size, letterSpacing: '-0.03em', lineHeight: 0.95, textTransform: 'uppercase' }}>{lastShown}</div>
        <div style={{ fontWeight: 800, fontSize: 140 * k, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 20 * k, fontVariantNumeric: 'tabular-nums' }}>{p.headline}</div>
        {noteLines.length > 0 && (
          <div style={{ marginTop: 20 * k, fontWeight: 700, fontSize: 40 * k, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
            {noteLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        {p.fields.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginTop: 22 * k }}>
            {p.fields.map(f => (
              <div key={f.label} style={{ background: tileBg, borderRadius: 28, padding: `${14 * k}px 8px ${10 * k}px`, textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 76 * k, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{f.value}</div>
                <div style={{ fontFamily: MONO, fontSize: 32, color: faint, marginTop: 4 }}>{f.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ position: 'absolute', left: padX, right: padX, bottom, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 30, color: faint }}>
        <span>edgereportdaily.com</span>
        <span>{p.source}</span>
      </div>
    </div>
  )
}
