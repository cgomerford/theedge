// src/components/graphics/GraphicFrame.tsx
//
// Shared shell for every block: x9 mark + kicker, team logos, title (with headshot for pitcher cards),
// subtitle, body slot and the constant footer. Root has a fixed pixel size from SIZES and
// overflow hidden so it exports at exactly that size.

import type { ReactNode } from 'react'
import { SANS } from '@/components/team/ui'
import { FOOTER_TEXT, GT, HANDLE, SIZES } from '@/lib/graphics/constants'
import type { GraphicImages, GraphicSpec, SizeKey } from '@/lib/graphics/types'
import { LABEL, specColor, TeamChip, TeamLogo } from './parts'

export default function GraphicFrame({ spec, size, images, children }: { spec: GraphicSpec; size: SizeKey; images?: GraphicImages; children: ReactNode }) {
  const { w, h } = SIZES[size]
  const portrait = size === 'portrait'
  const long = spec.title.length > 28
  const real = spec.chips.filter(c => c.team !== 'neutral')
  const pills = spec.chips.filter(c => c.team === 'neutral')
  const mark = images?.x9
  const shot = spec.player ? images?.[`player:${spec.player.id}`] : undefined
  const ring = specColor(spec.chips, spec.player)
  const av = portrait ? 104 : 84
  return (
    <div data-graphic-root style={{ width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', background: GT.paper, color: GT.ink, fontFamily: SANS, display: 'flex', flexDirection: 'column', padding: portrait ? '30px 40px 26px' : '22px 40px 18px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {mark
            // eslint-disable-next-line @next/next/no-img-element -- exported via html-to-image from a data URL
            ? <img src={mark} alt="x9Lab" style={{ height: portrait ? 44 : 38, width: 'auto', display: 'block' }} />
            : <span style={{ fontWeight: 800, fontSize: portrait ? 30 : 26 }}>x9<span style={{ color: GT.accent }}>Lab</span></span>}
          <span style={{ ...LABEL, fontSize: portrait ? 15 : 14, color: GT.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.kicker}</span>
        </div>
        {real.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {real.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {i > 0 && <span style={{ color: GT.muted, fontSize: 18 }}>@</span>}
                <TeamLogo abbr={c.team} images={images} h={portrait ? 54 : 46} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: portrait ? 18 : 10, flexShrink: 0 }}>
        {spec.player && (
          shot
            // eslint-disable-next-line @next/next/no-img-element -- exported via html-to-image from a data URL
            ? <img src={shot} alt="" style={{ width: av, height: av, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${ring}`, background: GT.panel, flexShrink: 0 }} />
            : <div style={{ width: av, height: av, borderRadius: '50%', border: `3px solid ${ring}`, background: GT.panel, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.05, fontSize: portrait ? (long ? 54 : 66) : long ? 44 : 50, minWidth: 0 }}>{spec.title}</h1>
            {pills.map((c, i) => <TeamChip key={i} chip={c} size={portrait ? 22 : 20} />)}
          </div>
          {spec.subtitle && <p style={{ margin: portrait ? '10px 0 0' : '6px 0 0', fontSize: portrait ? 24 : 20, color: '#5b5347', lineHeight: 1.25 }}>{spec.subtitle}</p>}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: portrait ? 18 : 12, marginTop: portrait ? 18 : 12, paddingBottom: portrait ? 14 : 10 }}>{children}</div>
      <div style={{ flexShrink: 0, borderTop: `1px solid #e7e2d8`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: portrait ? 16 : 15, color: GT.muted, minWidth: 0 }}>{FOOTER_TEXT}</span>
        <span style={{ fontWeight: 800, fontSize: portrait ? 20 : 18, color: GT.accent, whiteSpace: 'nowrap' }}>{HANDLE}</span>
      </div>
    </div>
  )
}
