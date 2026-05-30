// src/components/ProLockOverlay.tsx
//
// Shown inside Pro-only tabs when the user is on the Free tier.
// Displays a lock icon, the tab name, a short pitch, and a CTA to /pricing.

import Link from 'next/link'

type Props = {
  tabName: string
  description?: string
}

export default function ProLockOverlay({ tabName, description }: Props) {
  const defaultDesc = 'Unlock the full playbook — arsenal breakdowns, hot zones, fantasy picks, and the GM dashboard that shows you what everyone else is missing.'

  return (
    <div className="py-16 px-6 text-center">
      {/* Lock icon */}
      <div className="w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center mx-auto mb-5">
        <span className="text-3xl">🔒</span>
      </div>

      {/* Title */}
      <h3
        className="text-xl font-semibold text-stone-900 mb-2"
        style={{ fontFamily: 'Fraunces, Georgia, serif' }}
      >
        {tabName} is a Pro feature
      </h3>

      {/* Description */}
      <p
        className="text-sm text-stone-500 mb-6 max-w-sm mx-auto leading-relaxed"
        style={{ fontFamily: 'Fraunces, Georgia, serif' }}
      >
        {description || defaultDesc}
      </p>

      {/* CTA button */}
      <Link
        href="/pricing"
        className="inline-block bg-stone-900 text-yellow-300 font-mono text-[11px] font-bold tracking-widest uppercase px-8 py-3.5 rounded-lg hover:bg-orange-600 hover:text-white transition-colors"
      >
        Unlock Pro →
      </Link>

      {/* Price hint */}
      <p className="font-mono text-[10px] text-stone-400 mt-3 tracking-wider">
        £6/mo · Cancel anytime
      </p>
    </div>
  )
}
