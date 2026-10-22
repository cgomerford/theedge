'use client'

// src/components/LabsMenu.tsx — the header's "Labs" item. NOT yet wired into SiteHeader.
//
// Data comes from LABS_MENU (src/lib/nav/labsMenu.ts); no per-item JSX here.
// Open rules: mouse hover opens (pointerType 'mouse' only, so a tap can't open-then-instantly-
// toggle-shut); focus inside the wrapper keeps it open for keyboard users; a tap/click on the
// button toggles it on touch devices; Escape or an outside press closes it.
// Layout: inline styles + one <style> block with a plain @media (Tailwind responsive is
// unreliable under Turbopack). Under 900px the panel becomes a full-width sheet.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { LABS_MENU, STATUS_LABEL, type LabStatus } from '@/lib/nav/labsMenu'

const SANS = 'var(--font-outfit), system-ui, sans-serif'
const MONO = 'var(--font-jetbrains), ui-monospace, monospace'

const PILL: Record<LabStatus, { bg: string; fg: string }> = {
  live: { bg: '#E3F4EC', fg: '#1D9E75' },
  new:  { bg: '#FDE047', fg: '#1A1A1A' },
  soon: { bg: '#F1EEE6', fg: '#8a8275' },
}

export default function LabsMenu({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const wrap = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => { if (timer.current) clearTimeout(timer.current) }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])

  return (
    <div
      ref={wrap}
      className="labs-menu"
      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') { clear(); setOpen(true) } }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') { clear(); timer.current = setTimeout(() => setOpen(false), 150) } }}
      onFocus={() => { clear(); setOpen(true) }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false) }}
    >
      <style>{`
        .labs-panel { position: absolute; top: 100%; left: 0; width: 420px; }
        @media (max-width: 900px) {
          .labs-panel { position: fixed; top: 64px; left: 0; right: 0; width: auto; max-height: calc(100vh - 64px); overflow-y: auto; }
        }
        .labs-item:hover, .labs-item:focus-visible { background: #FAF8F3; outline: none; }
        .labs-item:focus-visible { box-shadow: inset 2px 0 0 #FF5722; }
      `}</style>

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="labs-menu-panel"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '8px 0', background: 'none', border: 0, cursor: 'pointer', fontFamily: SANS, fontSize: 14,
          color: open ? '#1c1917' : '#78716c', fontWeight: open ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        Labs
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id="labs-menu-panel"
          className="labs-panel"
          style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.12)', zIndex: 60, padding: 8 }}
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {LABS_MENU.map(item => {
              const pill = PILL[item.status]
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="labs-item"
                    style={{ display: 'block', padding: '10px 12px', borderRadius: 10, textDecoration: 'none', color: '#1A1A1A' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14 }}>{item.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', background: pill.bg, color: pill.fg, padding: '2px 6px', borderRadius: 4 }}>
                        {item.badge ?? STATUS_LABEL[item.status]}
                      </span>
                    </span>
                    {item.blurb && <span style={{ display: 'block', fontFamily: SANS, fontSize: 12, color: '#5b5347', marginTop: 2 }}>{item.blurb}</span>}
                    {item.tabs && (
                      <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, color: '#a89e8c', marginTop: 4, lineHeight: 1.5 }}>
                        {item.tabs.join(' · ')}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
