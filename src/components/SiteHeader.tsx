'use client'

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
      { href: '/tonight',             label: '← Tonight',     description: "Tonight's full slate" },
      { href: '/fantasy',      label: 'Fantasy Desk',  description: 'Streamers · Movers · Sleepers', badge: 'NEW' },
      { href: '/track-record', label: 'Track Record',  description: 'Our accuracy log' },
      { href: '/how-it-works', label: 'How it works',  description: 'What The Edge does' },
    ],
  },
  {
    label: 'Sports',
    links: [
      { href: '/tonight',            label: 'MLB', description: 'Live now',    badge: 'LIVE' },
      { href: '/preview/nfl', label: 'NFL', description: 'Coming soon', badge: 'SOON' },
      { href: '/preview/nba', label: 'NBA', description: 'Coming soon', badge: 'SOON' },
      { href: '/preview/nhl', label: 'NHL', description: 'Coming soon', badge: 'SOON' },
    ],
  },
  {
    label: 'About',
    links: [
      { href: '/about',   label: 'About',   description: 'What we are' },
      { href: '/faq',     label: 'FAQ',     description: 'Common questions' },
      { href: '/privacy', label: 'Privacy', description: 'How we use your data' },
      { href: '/terms',   label: 'Terms',   description: 'Terms of use' },
    ],
  },
]

// ─── NavDrawer ────────────────────────────────────────────────────────────────
// Rendered via React Portal directly into document.body.

function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(28,25,23,0.55)' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 320, maxWidth: '90vw',
          zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          background: '#FAFAF9',
          boxShadow: '-4px 0 40px rgba(0,0,0,0.16)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #E7E5E4',
        }}>
          <Link
            href="/"
            onClick={onClose}
            className="font-serif font-black text-lg tracking-tight text-stone-900 flex items-baseline hover:opacity-70 transition"
          >
            The Edge<span className="text-orange-600">.</span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 36, height: 36, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', padding: 0,
              color: '#78716C',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <line x1="2" y1="2"  x2="16" y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <line x1="16" y1="2" x2="2"  y2="16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 0' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 28 }}>

              <div
                className="font-mono uppercase tracking-widest text-stone-400"
                style={{ fontSize: 10, marginBottom: 10 }}
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
                    padding: '10px 0', borderBottom: '1px solid #F5F5F4',
                    textDecoration: 'none',
                  }}
                  className="group"
                >
                  <div>
                    <div
                      className="font-serif font-semibold text-stone-900 group-hover:text-orange-600 transition"
                      style={{ fontSize: 15 }}
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
                    <span
                      className="font-mono font-bold uppercase"
                      style={{
                        fontSize: 9, letterSpacing: '0.08em', padding: '2px 6px',
                        background: link.badge === 'LIVE' ? '#EA580C'
                                  : link.badge === 'NEW'  ? '#FDE047'
                                  : '#E7E5E4',
                        color:      link.badge === 'LIVE' ? '#fff'
                                  : link.badge === 'NEW'  ? '#1C1917'
                                  : '#78716C',
                      }}
                    >
                      {link.badge}
                    </span>
                  ) : (
                    <span
                      className="text-stone-300 group-hover:text-orange-400 transition"
                      style={{ fontSize: 14 }}
                    >
                      →
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: '20px 24px', borderTop: '1px solid #E7E5E4' }}>
          <Link
            href="/login"
            onClick={onClose}
            className="font-mono uppercase tracking-widest hover:bg-stone-700 transition"
            style={{
              display: 'block', textAlign: 'center', padding: '12px',
              background: '#1C1917', color: '#FAFAF9',
              fontSize: 11, textDecoration: 'none', letterSpacing: '0.1em',
            }}
          >
            Sign in
          </Link>
          <p
            className="font-mono text-stone-400 uppercase tracking-wider text-center"
            style={{ fontSize: 10, marginTop: 10 }}
          >
            Free · No credit card needed
          </p>
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

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-mono uppercase tracking-widest bg-stone-900 text-stone-50 px-3 py-1.5 hover:bg-stone-700 transition"
            >
              Sign in
            </Link>

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              className="flex flex-col justify-center items-center w-9 h-9 gap-1.5 hover:opacity-70 transition"
            >
              <span className="block w-5 h-px bg-stone-900" />
              <span className="block w-5 h-px bg-stone-900" />
              <span className="block w-3 h-px bg-stone-900 self-start ml-1" />
            </button>
          </div>
        </div>
      </header>

      <NavDrawer open={open} onClose={close} />
    </>
  )
}
