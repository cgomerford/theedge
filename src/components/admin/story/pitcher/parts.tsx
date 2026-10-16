import type { CSSProperties, ReactNode } from 'react'
import { SANS } from '@/components/team/ui'
import { SPACE, TYPE } from '../layout'
import { easeOutCubic } from '../motion'

/** Cream rounded card, same chrome as StatRow / NamePlate. `p` = reveal progress 0..1. */
export function Card({ children, p = 1, style }: { children: ReactNode; p?: number; style?: CSSProperties }) {
  const e = easeOutCubic(p)
  return (
    <div style={{ boxSizing: 'border-box', background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28, opacity: e, transform: `translateY(${(1 - e) * 24}px)`, ...style }}>
      {children}
    </div>
  )
}

/** Big number over a mono label. */
export function Tile({ label, value, p, hot = false, w, h = 150 }: { label: string; value: string; p: number; hot?: boolean; w: number; h?: number }) {
  return (
    <Card p={p} style={{ width: w, height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.heroNum - 20, lineHeight: 1, letterSpacing: '-0.02em', color: hot ? '#FF5722' : '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275', letterSpacing: '.06em' }}>{label}</div>
    </Card>
  )
}

export function Chip({ children, bg = '#FF5722', color = '#FAF8F3' }: { children: ReactNode; bg?: string; color?: string }) {
  return (
    <span style={{ display: 'inline-block', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, letterSpacing: '.08em', background: bg, color, borderRadius: 999, padding: '6px 22px', lineHeight: 1.2 }}>{children}</span>
  )
}

export const Muted = 'rgba(250,248,243,.7)'

export const KEY_ROW_H = 52

/** Colour key for the pitch types: dot + name (+ optional right-hand value), laid out in `cols` columns. */
export function PitchKey({ items, cols, width, reveal = 1 }: { items: { color: string; name: string; value?: string }[]; cols: number; width: number; reveal?: number }) {
  const colW = (width - SPACE.l * (cols - 1)) / cols
  return (
    <div style={{ width, display: 'flex', flexWrap: 'wrap', columnGap: SPACE.l, opacity: easeOutCubic(reveal) }}>
      {items.map(it => (
        <div key={it.name} style={{ width: colW, height: KEY_ROW_H, display: 'flex', alignItems: 'center', gap: SPACE.s, whiteSpace: 'nowrap' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: it.color, flex: 'none', border: '2px solid #1A1A1A', boxSizing: 'border-box' }} />
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: '#FAF8F3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
          {it.value && <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: 'rgba(250,248,243,.7)', fontVariantNumeric: 'tabular-nums' }}>{it.value}</span>}
        </div>
      ))}
    </div>
  )
}
