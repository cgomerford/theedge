'use client'

// src/components/ExpandableCard.tsx
//
// Generic wrapper: adds an expand button to any card. Expanded state
// renders the SAME children a second time, larger, in a centered modal
// over a blurred backdrop. Works because every chart this wraps
// (PitchLocationCard, TTOFatigueChart, LineupSprayChart, TeamHotZoneCard)
// is a pure display component driven entirely by props — no internal
// data fetching or mutable state — so mounting a second independent copy
// simultaneously is cheap and side-effect-free. If a component with real
// internal state or fetching ever needs this treatment, this approach
// would need revisiting.
//
// Escape key and backdrop click both close it. Body scroll is locked
// while open so the blurred page behind can't scroll out from under the
// modal on mobile.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function ExpandableCard({
  children, label,
}: {
  children: React.ReactNode
  label?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Avoid SSR/hydration mismatch — createPortal needs document, which
  // doesn't exist server-side.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [expanded])

  return (
    <div className="relative">
      {children}

      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={label ? `Expand ${label}` : 'Expand'}
        className="absolute top-2 right-2 w-7 h-7 rounded-md bg-white/90 border border-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-white shadow-sm transition-colors z-10"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
        </svg>
      </button>

      {mounted && expanded && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: 'rgba(26,26,26,0.55)' }}
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 z-10 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
            <div className="p-6 sm:p-8">
              {children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
