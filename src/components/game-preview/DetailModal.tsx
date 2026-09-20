// src/components/game-preview/DetailModal.tsx
//
// Generic "grey the page out" modal shell — same visual language as
// EdgeIndicatorPanel's FactorDetailModal (dark backdrop, white rounded
// card, sticky header with a close button), factored out so the
// Pitching/Batting mini-view cards can reuse it instead of duplicating
// the overlay mechanics.
//
// Portals to document.body — same fix PlayerGradeDetailModal/MobileDrawer
// already use for the same class of bug. Rendered inline, `position:
// fixed` resolves against whatever ancestor establishes a containing
// block (a transform/filter somewhere in an ancestor's tree), so the
// backdrop can end up only covering part of the page instead of the full
// viewport depending on where in the tree a caller mounts this.

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function DetailModal({
  eyebrow, title, onClose, children, wide,
}: {
  eyebrow: string
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  // Lazy init, not an effect+setState pair — DetailModal is always
  // interaction-gated by its callers (never present in the initial
  // server-rendered tree), so there's no hydration-mismatch risk here;
  // `document` is safely available the first time this ever renders.
  const [mounted] = useState(() => typeof document !== 'undefined')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-[1px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'} w-full max-h-[85vh] overflow-y-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-start justify-between gap-3 rounded-t-2xl">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">{eyebrow}</p>
            <h3 className="font-sans text-lg text-stone-900 leading-tight">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-stone-900 text-2xl leading-none shrink-0">×</button>
        </div>
        <div className="px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
