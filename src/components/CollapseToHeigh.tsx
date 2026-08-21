// src/components/CollapseToHeight.tsx
'use client'

// Generic height-clipping wrapper — clips any child content to a target
// pixel height with a fade-out + expand toggle, without needing to know
// or modify the internals of what's inside it. Used to make
// ManagerDecisionsCard / UmpireReportCard match the natural height of
// the bullpen workload column next to them, whatever that height is.

import { useState } from 'react'

export default function CollapseToHeight({
  targetHeight,
  children,
}: {
  targetHeight: number
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="relative">
      <div
        style={{
          maxHeight: expanded ? 'none' : `${targetHeight}px`,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      {!expanded && (
        <div className="relative -mt-8 pt-8 bg-gradient-to-t from-white to-transparent flex justify-center">
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold bg-white px-3 py-1 border border-stone-200 rounded-full shadow-sm hover:border-orange-300"
          >
            Show more
          </button>
        </div>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 text-[10px] font-mono uppercase tracking-widest text-stone-400 font-bold hover:text-orange-600"
        >
          Show less
        </button>
      )}
    </div>
  )
}