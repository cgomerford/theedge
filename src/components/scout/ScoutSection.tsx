// src/components/scout/ScoutSection.tsx
//
// The frame every Scout section sits in: numbered eyebrow, title, tier badge,
// and the scroll-anchor id the side nav links to. Server component — section
// bodies are passed in as children.
//   live + locked  → short upgrade note (free user on a Pro section)
//   live           → children
//   planned        → the scope as a quiet dashed placeholder; `compact` renders
//                    it as a small tile so the not-yet-built sections sit in a
//                    grid instead of a long stack.

import Link from 'next/link'
import type { ScoutSectionMeta } from './sections'

const TIER_LABEL = { free: 'Free', teaser: 'Free teaser · Pro full', pro: 'Pro' } as const

export default function ScoutSection({
  meta, locked, compact = false, children,
}: {
  meta: ScoutSectionMeta
  locked: boolean
  compact?: boolean
  children?: React.ReactNode
}) {
  const live = meta.status === 'live'
  return (
    <section id={meta.id} className={`scroll-mt-28 bg-white border border-stone-200 rounded-2xl ${compact ? 'p-3.5' : 'p-4 sm:p-5'}`}>
      <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-2.5' : 'mb-4'}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-orange-600 font-semibold">§ {String(meta.num).padStart(2, '0')}</p>
          <h2 className={`font-sans font-bold text-stone-900 tracking-tight leading-tight mt-0.5 ${compact ? 'text-[14px]' : 'text-[17px]'}`}>{meta.title}</h2>
        </div>
        <span className={`shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${
          meta.tier === 'pro' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-stone-100 text-stone-500 border-stone-200'
        }`}>{TIER_LABEL[meta.tier]}</span>
      </div>

      {live && locked ? (
        <div className="rounded-xl bg-stone-50 border border-stone-200 px-4 py-5 text-center">
          <p className="text-[12px] font-sans text-stone-500 leading-relaxed">This section is part of the Pro Scout Report.</p>
          <Link href="/pricing" className="inline-block mt-2 text-[10px] font-mono uppercase tracking-widest text-orange-600 font-semibold hover:text-orange-700">See Pro →</Link>
        </div>
      ) : live ? (
        children
      ) : (
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
          <p className="text-[9px] font-mono uppercase tracking-widest font-bold text-stone-500 mb-1.5">Being built</p>
          <ul className="space-y-1">
            {meta.scope.map((line) => (
              <li key={line} className={`font-sans text-stone-500 leading-snug flex gap-2 ${compact ? 'text-[11px]' : 'text-[11.5px]'}`}>
                <span className="text-orange-400 shrink-0">◎</span>{line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
