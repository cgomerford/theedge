// src/app/mlb/[slug]/print/PrintButton.tsx
'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 font-mono text-[11px] uppercase tracking-widest bg-[#1A1A1A] text-white"
    >
      Print / Save as PDF
    </button>
  )
}
