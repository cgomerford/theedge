'use client'

// src/components/player/SignatureSummary.tsx
//
// REWRITTEN — no longer fetches statcast-full itself. The merged player
// page now owns that fetch (PlayerPageClient), because the same dials
// feed both this card AND computeSeasonGrade for the grade banner. Two
// components independently hitting /api/player/statcast-full for the
// same player would be the exact dual-fetch pattern the project's data
// notes warn against. This is now pure presentation.

import type { SignatureDial } from '@/lib/player-signature'

export default function SignatureSummary({
  dials, oneLine, loading,
}: {
  dials: SignatureDial[]
  oneLine: string | null
  loading: boolean
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
        ⊕ Signature
      </div>

      {loading ? (
        <p className="text-xs font-serif italic text-stone-400 py-6">Loading Statcast…</p>
      ) : (
        <>
          {oneLine && (
            <p className="font-serif text-base sm:text-lg text-stone-800 leading-relaxed mb-5">
              {oneLine}
            </p>
          )}
          {dials.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 sm:gap-5">
              {dials.map((d, i) => <Dial key={i} dial={d} />)}
            </div>
          ) : (
            <p className="text-xs font-serif italic text-stone-400">
              Below qualifier threshold for Statcast rankings.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Dial({ dial }: { dial: SignatureDial }) {
  const pct = dial.percentile
  const color = pct == null ? '#a8a29e' : pct >= 75 ? '#059669' : pct >= 50 ? '#f59e0b' : pct >= 25 ? '#f97316' : '#dc2626'
  const width = pct == null ? 0 : pct

  return (
    <div className="bg-stone-50 border border-stone-100 rounded-lg p-3 sm:p-4">
      <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-1">{dial.label}</div>
      <div className="text-2xl sm:text-3xl font-mono font-bold text-stone-900 tabular-nums leading-none">{dial.value}</div>
      <div className="mt-3 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[9px] font-mono text-stone-400">{dial.reference}</span>
        <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color }}>
          {pct == null ? '—' : `${Math.round(pct)}`}
        </span>
      </div>
    </div>
  )
}