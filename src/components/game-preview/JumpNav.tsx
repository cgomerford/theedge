// src/components/game-preview/JumpNav.tsx
//
// Quick-scroll to the sections further down a long game-preview page —
// anchor `#id` links against the section ids set in page.tsx. Floating,
// not laid out in the page flow: George didn't want this eating space in
// the Edge Indicator column, so it's `fixed`, stays out of the way as a
// small tab until you hover it, and only shows up once you've actually
// scrolled (nothing to jump to yet if you're still at the top).

'use client'

import { useEffect, useState } from 'react'

type Props = {
  hasSeries: boolean
  hasPostgames: boolean
}

const SCROLL_SHOW_THRESHOLD = 420

export default function JumpNav({ hasSeries, hasPostgames }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() { setVisible(window.scrollY > SCROLL_SHOW_THRESHOLD) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={`group fixed right-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3 pointer-events-none'
      }`}
    >
      <div className="bg-white border border-r-0 border-stone-200 rounded-l-xl shadow-lg overflow-hidden">
        {/* Collapsed tab */}
        <div className="flex items-center gap-1.5 px-2.5 py-3 [writing-mode:vertical-rl] group-hover:hidden">
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold rotate-180">Jump to</span>
        </div>

        {/* Expanded on hover */}
        <div className="hidden group-hover:block p-2 w-40">
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-1.5 px-1">Jump to</p>
          <div className="space-y-1">
            <a href="#key-players" className="block px-2 py-1.5 rounded-lg text-[11px] text-stone-700 hover:bg-orange-50 hover:text-orange-700 transition">Key Players</a>
            {hasSeries && <a href="#series-stats" className="block px-2 py-1.5 rounded-lg text-[11px] text-stone-700 hover:bg-orange-50 hover:text-orange-700 transition">Series stats</a>}
            {hasPostgames && <a href="#postgame" className="block px-2 py-1.5 rounded-lg text-[11px] text-stone-700 hover:bg-orange-50 hover:text-orange-700 transition">Postgame reports</a>}
          </div>
        </div>
      </div>
    </div>
  )
}
