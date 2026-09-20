'use client'

// src/components/scout/PrintButton.tsx — opens the browser's print dialog. The Manager
// card carries its own @media print rules that show only that section, so "Save as PDF"
// produces a clean one-or-two-page sheet.

export default function PrintButton({ label = 'Print the sheet' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}
      className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-900">
      ⎙ {label}
    </button>
  )
}
