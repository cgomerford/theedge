'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmailSignupForm from './EmailSignupForm'
import { OPEN_SIGNUP_EVENT } from './openSignup'
import { SIGNUP_BENEFITS, SIGNUP_HEADLINE, SIGNUP_KICKER } from './copy'

// Centred dialog on desktop, sheet from the bottom on phones. Esc and the close button close it, Tab stays inside it,
// and focus goes back to whatever opened it. Mounted once in the root layout; open it with openSignup(source).

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'

export default function EmailSignupModal() {
  const [source, setSource] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setSource(null)
    openerRef.current?.focus?.()
    openerRef.current = null
  }, [])

  useEffect(() => {
    const onOpen = (e: Event) => {
      openerRef.current = document.activeElement as HTMLElement | null
      setSource((e as CustomEvent<{ source: string }>).detail?.source ?? 'popup')
    }
    window.addEventListener(OPEN_SIGNUP_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SIGNUP_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!source) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('input[name="email"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [source, close])

  if (!source) return null

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(26,26,26,.55)' }}
      className="x9-modal-backdrop"
    >
      <style>{`
        .x9-modal-backdrop{display:flex;align-items:center;justify-content:center;padding:16px}
        .x9-modal{width:100%;max-width:440px;background:#FAF8F3;border:1px solid #1A1A1A;padding:28px;box-sizing:border-box;max-height:100%;overflow-y:auto}
        @media (max-width:767px){
          .x9-modal-backdrop{align-items:flex-end;padding:0}
          .x9-modal{max-width:none;border-left:0;border-right:0;border-bottom:0;padding:24px 16px 32px}
        }
      `}</style>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="x9-signup-title" className="x9-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722' }}>{SIGNUP_KICKER}</div>
          <button type="button" onClick={close} aria-label="Close" style={{ background: 'none', border: 0, padding: 4, fontSize: 14, fontWeight: 800, color: '#1A1A1A', cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <h2 id="x9-signup-title" style={{ margin: '10px 0 14px', fontSize: 26, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.01em', color: '#1A1A1A' }}>
          {SIGNUP_HEADLINE}
        </h2>
        <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
          {SIGNUP_BENEFITS.map(b => (
            <li key={b} style={{ padding: '8px 0', borderTop: '1px solid #e7e2d8', fontSize: 15, color: '#1A1A1A' }}>{b}</li>
          ))}
        </ul>
        <EmailSignupForm source={source} returnTo={typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined} />
      </div>
    </div>
  )
}
