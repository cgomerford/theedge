'use client'

// src/components/graphics/otd/OtdShell.tsx
//
// The shared card for "On this day" and "Stat of the day". Fixed pixel size, positioned from the brief (logical 1200x675, exported at 2x):
//   header   x9 mark (about 64x40) at x 40, then the kicker in small caps
//   headline 46px ExtraBold, one line, shrinks to fit, at y 72
//   subline  17px regular in the subtitle colour, at y 136
//   body     y 175 to 600 (portrait: to 1275), holds sections and a tile row
//   footer   1px rule at y 620 (portrait: 55px above the bottom), the constant footer text on the left and @x9LabHQ in orange on the right
// The only image on the card is the site's own x9 mark (inlined, so the export makes no request). The shell takes no logo, headshot or image prop.

import type { ReactNode } from 'react'
import { SANS } from '@/components/team/ui'
import { FOOTER_TEXT, GT, HANDLE, OT, OTD_SIZES } from '@/lib/graphics/constants'
import type { OtdSize } from '@/lib/graphics/otd-export'
import FitLine, { type FitInfo } from './FitLine'
import X9Mark from './X9Mark'
import { CAPS } from './parts'

export type OtdKind = 'otd' | 'sotd'
export const KICKER_PREFIX: Record<OtdKind, string> = { otd: 'On this day', sotd: 'Stat of the day' }

export type ShellFit = { headline?: FitInfo; subline?: FitInfo }

export default function OtdShell({ kind, date, headline, subline, size, children, onFit }: {
  kind: OtdKind; date: string; headline: string; subline?: string; size: OtdSize; children: ReactNode; onFit?: (f: ShellFit) => void
}) {
  const { w, h } = OTD_SIZES[size]
  const portrait = size === 'portrait'
  const fits: ShellFit = {}
  const kicker = `${KICKER_PREFIX[kind]}${date.trim() ? ` · ${date.trim()}` : ''}`.toUpperCase()
  const bodyBottom = h - 75           // landscape 600, portrait 1275
  return (
    <div data-otd-root={size} style={{ position: 'relative', width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', background: GT.paper, color: GT.ink, fontFamily: SANS }}>
      <div style={{ position: 'absolute', left: OT.pad, right: OT.pad, top: 14, height: 40, display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <X9Mark height={40} />
        <span data-otd-kicker style={{ ...CAPS, fontSize: portrait ? 16 : 15, color: OT.kicker, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{kicker}</span>
      </div>
      <div style={{ position: 'absolute', left: OT.pad, right: OT.pad, top: 72, height: 58 }}>
        <FitLine text={headline} max={46} min={24} onFit={f => { fits.headline = f; onFit?.({ ...fits }) }} style={{ fontWeight: 800, letterSpacing: '-.02em', lineHeight: '58px', color: GT.ink }} />
      </div>
      <div style={{ position: 'absolute', left: OT.pad, right: OT.pad, top: 136, height: 26 }}>
        {subline ? <FitLine text={subline} max={17} min={12} onFit={f => { fits.subline = f; onFit?.({ ...fits }) }} style={{ fontWeight: 400, color: OT.subtitle, lineHeight: '26px' }} /> : null}
      </div>
      <div style={{ position: 'absolute', left: OT.pad, right: OT.pad, top: 175, height: bodyBottom - 175, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, minHeight: 0 }}>{children}</div>
      <div style={{ position: 'absolute', left: OT.pad, right: OT.pad, top: h - 55, borderTop: `1px solid ${OT.border}`, paddingTop: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: 12.5, color: '#4A4843', minWidth: 0 }}>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: GT.accent, whiteSpace: 'nowrap' }}>{HANDLE}</span>
      </div>
    </div>
  )
}
