// src/components/InlineCalibration.tsx
//
// Compact trust strip shown directly below the MatchupTilt on every game page.
// Pulls the season record for the current game's confidence tier and shows it
// inline — "Strong-edge reads this season: 23–14 · 62%".
//
// The honest version:
// - Nothing shown if fewer than 5 graded games exist for this tier
//   (soft-launch period — don't show meaningless 2–1 stats)
// - Small-sample notice if under 20 graded games
// - Always links to the full Track Record page
// - Never uses the words pick / bet / lock

import Link from 'next/link'
import type { InlineCalibration as CalibrationData } from '@/lib/track-record'

type Props = {
  calibration: CalibrationData | null
}

const TIER_LABELS: Record<string, string> = {
  strong:   'Strong-edge',
  moderate: 'Moderate-edge',
  slight:   'Slight-edge',
}

const TIER_COLORS: Record<string, string> = {
  strong:   'text-orange-600',
  moderate: 'text-yellow-600',
  slight:   'text-stone-500',
}

const TIER_BG: Record<string, string> = {
  strong:   'bg-orange-50 border-orange-200',
  moderate: 'bg-yellow-50 border-yellow-200',
  slight:   'bg-stone-100 border-stone-200',
}

export default function InlineCalibration({ calibration }: Props) {
  // Nothing to show
  if (!calibration || !calibration.has_sample) return null

  const { tier, wins, losses, total, accuracy_percent } = calibration
  const label = TIER_LABELS[tier] ?? tier
  const colorClass = TIER_COLORS[tier] ?? 'text-stone-600'
  const bgClass = TIER_BG[tier] ?? 'bg-stone-100 border-stone-200'
  const isSmallSample = total < 20

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-[11px] font-mono ${bgClass}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tier label */}
        <span className={`font-bold uppercase tracking-widest ${colorClass}`}>
          {label} reads this season
        </span>

        {/* Record */}
        <span className="text-stone-700 font-bold">
          {wins}–{losses}
        </span>

        {/* Accuracy */}
        {accuracy_percent != null && (
          <span className={`font-bold ${accuracy_percent >= 60 ? 'text-emerald-700' : accuracy_percent >= 50 ? 'text-stone-700' : 'text-stone-500'}`}>
            · {accuracy_percent.toFixed(0)}%
          </span>
        )}

        {/* Small sample caveat — honest, not hidden */}
        {isSmallSample && (
          <span className="text-stone-400 font-normal">
            ({total} graded — building sample)
          </span>
        )}
      </div>

      {/* Link to full record */}
      <Link
        href="/track-record"
        className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-stone-400 hover:text-orange-600 transition whitespace-nowrap"
      >
        Full record →
      </Link>
    </div>
  )
}
