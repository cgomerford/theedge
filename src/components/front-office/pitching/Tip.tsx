'use client'

// Hover / focus tooltip for the Pitching Desk. The popover is position: fixed and measured from the trigger, so it is
// never clipped by a card's or table wrapper's overflow. Pass `content` (any React node; <TipBody> gives the standard
// layout). Keyboard focus shows it too. Pointer-events are off on the popover so it never steals the hover.

import { useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'

type Pos = { x: number; y: number; below: boolean }

export function TipBody({ title, lines, note }: { title?: string; lines?: [string, string][]; note?: string }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.45 }}>
      {title && <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: lines?.length || note ? 4 : 0 }}>{title}</div>}
      {lines?.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span style={{ opacity: .7 }}>{k}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</span>
        </div>
      ))}
      {note && <div style={{ marginTop: lines?.length ? 5 : 0, opacity: .75, fontFamily: MONO, fontSize: 10, lineHeight: 1.4 }}>{note}</div>}
    </div>
  )
}

export default function Tip({ content, children, block = false }: { content: React.ReactNode; children: React.ReactNode; block?: boolean }) {
  const [pos, setPos] = useState<Pos | null>(null)

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 150), vw - 150), y: r.top > 150 ? r.top - 8 : r.bottom + 8, below: r.top <= 150 })
  }

  return (
    <span
      onMouseEnter={e => show(e.currentTarget)} onMouseLeave={() => setPos(null)}
      onFocus={e => show(e.currentTarget)} onBlur={() => setPos(null)}
      style={{ display: block ? 'block' : 'inline-block', width: block ? '100%' : undefined }}>
      {children}
      {pos && (
        <span role="tooltip" style={{
          position: 'fixed', left: pos.x, top: pos.y, transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          zIndex: 80, pointerEvents: 'none', width: 'max-content', maxWidth: 290, textAlign: 'left', fontWeight: 400, whiteSpace: 'normal',
          background: C.ink, color: C.cream, borderRadius: 10, padding: '9px 12px', boxShadow: '0 8px 24px rgba(0,0,0,.28)', textTransform: 'none', letterSpacing: 0,
        }}>{content}</span>
      )}
    </span>
  )
}
