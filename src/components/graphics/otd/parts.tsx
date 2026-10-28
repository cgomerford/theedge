// src/components/graphics/otd/parts.tsx
//
// The two building blocks every "On this day" / "Stat of the day" body is made of: a section card and a row of stat tiles.
// Pure markup from plain props. Neither takes an image, so a team mark or headshot cannot be drawn through them.

import type { CSSProperties, ReactNode } from 'react'
import XMarkInline from '@/components/graphics/XMarkInline'
import { SANS } from '@/components/team/ui'
import { GT, OT } from '@/lib/graphics/constants'
import FitLine, { type FitInfo } from './FitLine'

export const CAPS: CSSProperties = { fontFamily: SANS, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', fontVariantNumeric: 'tabular-nums' }

/** White rounded card. Header row: the orange x9 mark with the zero-padded number, a bold caps label in ink, and a full-width 1px divider under it.
 *  `n` is set by the template from the section's position, so numbers always run 01, 02, 03 in order. */
export function OtdSection({ n, label, children, style, portrait }: { n: number; label: string; children: ReactNode; style?: CSSProperties; portrait?: boolean }) {
  return (
    <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: OT.card, border: `1px solid ${OT.border}`, borderRadius: OT.cardRadius, overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: portrait ? '12px 22px' : '10px 20px', borderBottom: `1px solid ${OT.border}`, flexShrink: 0, minWidth: 0 }}>
        <span style={{ ...CAPS, color: GT.accent, fontWeight: 600, fontSize: portrait ? 16 : 14, whiteSpace: 'nowrap', flexShrink: 0 }}><XMarkInline /> {String(n).padStart(2, '0')}</span>
        <span style={{ ...CAPS, fontWeight: 800, color: GT.ink, fontSize: portrait ? 16 : 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

export type OtdTile = { label: string; value: string; detail?: string }

/** A row of 2 to 4 equal cream tiles, 12px apart. In portrait (4:5) the row becomes a 2 column grid, so four tiles make a 2x2. */
export function OtdTileRow({ tiles, portrait, onFit }: { tiles: OtdTile[]; portrait?: boolean; onFit?: (tileIndex: number, i: FitInfo) => void }) {
  const list = tiles.slice(0, 4)
  if (list.length === 0) return null
  const cols = portrait ? 2 : list.length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12, flexShrink: 0 }}>
      {list.map((t, i) => (
        <div key={i} style={{ minWidth: 0, background: OT.tile, borderRadius: OT.tileRadius, padding: portrait ? '16px 20px' : '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'space-between' }}>
          <FitLine text={t.label} max={portrait ? 15 : 13} min={10} style={{ ...CAPS, color: OT.kicker, lineHeight: 1.25 }} />
          <FitLine text={t.value} max={portrait ? 42 : 34} min={18} onFit={onFit ? f => onFit(i, f) : undefined} style={{ fontFamily: SANS, fontWeight: 700, color: GT.ink, lineHeight: 1.28, fontVariantNumeric: 'tabular-nums' }} />
          <FitLine text={t.detail ?? ' '} max={portrait ? 14.5 : 12.5} min={10} style={{ fontFamily: SANS, fontWeight: 600, color: GT.accent, lineHeight: 1.25 }} />
        </div>
      ))}
    </div>
  )
}
