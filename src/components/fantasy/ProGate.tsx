'use client'

/**
 * src/components/fantasy/ProGate.tsx
 *
 * Wraps Pro-only content. Free users see a blurred teaser with an upgrade CTA.
 * Pro users see the content normally.
 *
 * Usage:
 *   <ProGate isPro={isPro} feature="Weekly Planner">
 *     <ActualContent />
 *   </ProGate>
 */

import Link from 'next/link'

interface ProGateProps {
  isPro: boolean
  feature: string
  description?: string
  children: React.ReactNode
  /** How many items to show as a teaser before the gate (0 = show nothing) */
  previewCount?: number
}

export default function ProGate({
  isPro,
  feature,
  description,
  children,
  previewCount = 0,
}: ProGateProps) {
  if (isPro) return <>{children}</>

  return (
    <div className="relative">
      {/* Blurred preview of actual content */}
      <div className="pointer-events-none select-none" aria-hidden>
        <div className="blur-[6px] opacity-40 max-h-[400px] overflow-hidden">
          {children}
        </div>
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border border-stone-200 px-8 py-8 max-w-md text-center mx-4">
          {/* Lock icon */}
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h3 className="font-serif font-semibold text-xl text-stone-900 mb-2">
            {feature}
          </h3>
          <p className="text-sm text-stone-500 mb-5 leading-relaxed">
            {description || `${feature} is a Pro feature. Upgrade to see the full breakdown and get the edge on your league.`}
          </p>

          <Link
            href="/pricing"
            className="inline-block font-mono text-xs uppercase tracking-widest bg-stone-900 text-white px-6 py-3 hover:bg-stone-800 transition rounded"
          >
            Unlock Pro · £4/mo →
          </Link>

          <p className="text-[10px] text-stone-400 mt-3 font-mono">
            Founding member rate · locked for early subscribers
          </p>
        </div>
      </div>
    </div>
  )
}
