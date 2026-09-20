'use client'

// src/components/postgame/SheetFrame.tsx
//
// Wraps one server-rendered scorecard sheet: horizontal scroll on small screens and a
// "Download completed scorecard" button, with the sheet itself collapsed until asked for. The button clones the sheet into a print-only root, then opens the
// browser's print dialog (Save as PDF); print CSS in ScorecardSection hides everything else and
// scales the sheet to one portrait page. (A closed <details> still keeps the sheet in the DOM, so
// the clone works with it collapsed.) This replaced an html-to-image PNG export, which never
// finished on a sheet this dense (1,100+ DOM nodes) — printing is instant and stays vector-sharp.

import { useRef } from 'react'

export default function SheetFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  function download() {
    const node = ref.current
    if (!node) return
    const root = document.createElement('div')
    root.id = 'pg-print-root'
    root.appendChild(node.cloneNode(true))
    document.body.appendChild(root)
    document.body.setAttribute('data-printing', '1')
    const cleanup = () => { root.remove(); document.body.removeAttribute('data-printing'); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-stone-600 font-semibold">{title}</p>
        <button type="button" onClick={download}
          className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 bg-[#1A1A1A] text-[#FAF8F3] border border-[#1A1A1A] hover:bg-[#FF5722] hover:border-[#FF5722]">
          ↓ Download completed scorecard
        </button>
      </div>
      <details className="group">
        <summary className="cursor-pointer select-none text-[10.5px] font-mono uppercase tracking-widest text-stone-500 hover:text-orange-600 list-none">
          <span className="group-open:hidden">▸ View scorecard</span><span className="hidden group-open:inline">▾ Hide scorecard</span>
        </summary>
        <div className="overflow-x-auto pb-2 mt-2"><div ref={ref} style={{ width: 'fit-content' }}>{children}</div></div>
      </details>
    </div>
  )
}
