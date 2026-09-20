'use client'

// src/components/HelpLink.tsx
//
// Small "?" button that sits on a chart and links out to /mlb/glossary,
// deep-linked to the specific stat this chart is built on (category
// pre-selected, entry scrolled-to and expanded — see that page's ?stat=
// handling). Complements, not replaces, the existing inline InfoButton
// tooltips (src/components/InfoButton.tsx) — InfoButton answers "what does
// THIS number mean right here," HelpLink answers "explain this stat
// properly, with a diagram, and show me what's related." Opens in a new
// tab so a reader doesn't lose their place on the chart they were looking
// at.

import Link from 'next/link'
import { getStatBySlug } from '@/lib/stats-glossary'

export function HelpLink({ stat, label = 'Explain this stat' }: { stat: string; label?: string }) {
  const entry = getStatBySlug(stat)
  const title = entry ? `${label}: ${entry.name}` : label

  return (
    <Link
      href={`/mlb/glossary?stat=${stat}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#DEDACE] text-[9px] font-bold text-[#8A8577] hover:border-[#FF5722] hover:text-[#FF5722] transition shrink-0"
    >
      ?
    </Link>
  )
}
