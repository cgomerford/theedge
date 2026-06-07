'use client'

/**
 * src/components/SiteHeader.tsx
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

type NavLink = {
  href: string
  label: string
  description?: string
  badge?: string
}

const NAV_SECTIONS: { label: string; links: NavLink[] }[] = [
  {
    label: 'MLB',
    links: [
      { href: '/mlb',     label: 'MLB Home',    description: 'Standings · leaders · edges', badge: 'LIVE' },
      { href: '/fantasy', label: 'Fantasy Desk', description: 'Streamers · Movers · Sleepers', badge: 'PRO' },
    ],
  },
  {
    label: 'NFL',
    links: [
      { href: '/nfl', label: 'NFL Home', description: 'Standings · leaders · news', badge: 'NEW' },
    ],
  },
  {
    label: 'More',
    links: [
      { href: '/track-record', label: 'Track Record', description: 'How the model is performing' },
      { href: '/how-it-works', label: 'How it works',  description: 'The 8-component model' },
      { href: '/pricing',      label: 'Pricing',        description: 'Free and Pro tiers' },
      { href: '/about',        label: 'About',          description: 'What The Edge is' },
      { href: '/faq',          label: 'FAQ',            description: 'Common questions' },
    ],
  },
]

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ text }: { text: string }) {
  const isAccent = text === 'LIVE' || text === 'NEW'
  return (
    <span
      className="font-mono font-bold uppercase tracking-wider"
      style={{
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '2px 7px',
        borderRadius: 3,
        background: isAccent ? '#FF5722' : 'rgba(255,87,34,0.1)',
        color:      isAccent ? '#FFFFFF' : '#FF5722',
      }}
    >
      {text}
    </span>
  )
}

// ─── NavDrawer ────────────────────────────────────────────────────────────────

function NavDrawer({
  open,
  onClose,
  isLoggedIn,
}: {
  open: boolean
  onClose: () => void
  isLoggedIn: boolean
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(26,25,23,0.6)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 300, maxWidth: '88vw',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          background: '#FAFAF9',
          boxShadow: '-8px 0 48px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px',
          borderBottom: '1px solid #E7E5E4',
        }}>
          <Link
            href="/"
            onClick={onClose}
            style={{ textDecoration: 'none' }}
            className="font-serif font-black text-lg tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline"
          >
            The Edge<span style={{ color: '#FF5722' }}>.</span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#F5F5F4', border: 'none', borderRadius: 6,
              cursor: 'pointer', color: '#78716C',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <line x1="13" y1="1" x2="1"  y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 0' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 28 }}>

              <div
                className="font-mono uppercase text-stone-400"
                style={{ fontSize: 10, letterSpacing: '0.18em', marginBottom: 8 }}
              >
                — {section.label}
              </div>

              {section.links.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 0',
                    borderBottom: '1px solid #F5F5F4',
                    textDecoration: 'none',
                  }}
                  className="group"
                >
                  <div>
                    <div
                      className="font-serif font-semibold text-stone-900 group-hover:text-orange-600 transition"
                      style={{ fontSize: 15, lineHeight: 1.3 }}
                    >
                      {link.label}
                    </div>
                    {link.description && (
                      <div
                        className="font-mono text-stone-400"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {link.description}
                      </div>
                    )}
                  </div>

                  {link.badge ? (
                    <Badge text={link.badge} />
                  ) : (
                    <span
                      className="text-stone-300 group-hover:text-orange-400 transition font-mono"
                      style={{ fontSize: 13 }}
                    >
                      →
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer CTA */}
        <div style={{ padding: '18px 22px', borderTop: '1px solid #E7E5E4' }}>
          <Link
            href={isLoggedIn ? '/dugout' : '/login'}
            onClick={onClose}
            className="font-mono uppercase hover:bg-stone-700 transition"
            style={{
              display: 'block', textAlign: 'center',
              padding: '13px', background: '#1A1A1A', color: '#FAFAF9',
              fontSize: 11, letterSpacing: '0.12em', textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            {isLoggedIn ? '⊕ My Dugout' : 'Sign in'}
          </Link>
          {!isLoggedIn && (
            <p
              className="font-mono text-stone-400 uppercase tracking-wider text-center"
              style={{ fontSize: 10, marginTop: 9 }}
            >
              Free · No credit card needed
            </p>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── SiteHeader ───────────────────────────────────────────────────────────────

type Props = {
  variant?: 'home' | 'page'
}

export default function SiteHeader({ variant = 'page' }: Props) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => { setIsLoggedIn(data.authenticated === true) })
      .catch(() => { setIsLoggedIn(false) })
  }, [])

  return (
    <>
      <header className="border-b border-stone-200 bg-stone-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">

          <Link
            href="/"
            className="font-serif font-black text-xl tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline shrink-0"
          >
            The Edge<span className="text-orange-600">.</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Link
              href={isLoggedIn ? '/dugout' : '/login'}
              className="text-[11px] font-mono uppercase tracking-widest bg-stone-900 text-stone-50 px-3.5 py-2 hover:bg-stone-700 transition rounded-sm"
            >
              {isLoggedIn ? 'My Dugout' : 'Sign in'}
            </Link>

            {/* Hamburger — 3 clean lines */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              className="flex flex-col justify-center items-center w-9 h-9 gap-[5px] hover:opacity-60 transition rounded-sm"
            >
              <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
              <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
              <span className="block w-[11px] h-px bg-stone-900 rounded-full self-start ml-[3px]" />
            </button>
          </div>
        </div>
      </header>

      <NavDrawer open={open} onClose={close} isLoggedIn={isLoggedIn} />
    </>
  )
}