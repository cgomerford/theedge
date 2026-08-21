'use client'

// src/components/PitchSequencingSnippet.tsx
//
// Condensed preview of PitchSequencingCard's two tools, sized for the
// Scout Report's pitcher column rather than the full Pitching Lab view.
// Shows the 0-0 tendency, the sharpest 2-strike tendency available, and
// the single most-telling "after a [X], likely a [Y]" sequencing fact —
// then links through to the full interactive version in Pitching Lab,
// landing on the correct pitcher via the same ?tab=pitching&pitcher=
// pattern PitchingTab.tsx now reads.

import Link from 'next/link'
import type { PitcherCountTendency, PitcherPitchSequencing } from '@/lib/pitcher-sequencing'

type Props = {
  pitcherName: string
  abbr: string
  color: string
  side: 'away' | 'home'
  countTendency: Record<string, PitcherCountTendency>
  sequencing: Record<string, PitcherPitchSequencing>
}

// Prefer showing the 0-0 tendency plus whichever of these classic
// 2-strike counts actually has enough sample, in this priority order.
const TWO_STRIKE_PRIORITY = ['0-2', '1-2', '2-2', '3-2']

export default function PitchSequencingSnippet({ pitcherName, abbr, color, side, countTendency, sequencing }: Props) {
  const counts = countTendency['all']?.counts ?? {}
  const transitions = sequencing['all']?.transitions ?? {}

  const firstPitch = counts['0-0']?.pitches?.[0]
  const twoStrikeKey = TWO_STRIKE_PRIORITY.find(k => counts[k]?.pitches?.[0])
  const twoStrike = twoStrikeKey ? counts[twoStrikeKey].pitches[0] : null

  // Most-thrown pitch overall, by total sample in the sequencing table —
  // used to pick a single headline "after a X, likely Y" fact rather
  // than showing all of them (that's what the full card is for).
  const topFromPitch = Object.entries(transitions).sort((a, b) => b[1].total_followed - a[1].total_followed)[0]
  const topNext = topFromPitch?.[1]?.next_pitches?.[0]

  const hasAnything = firstPitch || twoStrike || topNext
  if (!hasAnything) return null

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{abbr} · Pitch IQ</span>
        <Link
          href={`?tab=pitching&pitcher=${side}`}
          scroll={false}
          className="font-mono text-[9px] uppercase tracking-wider hover:underline"
          style={{ color }}
        >
          Full breakdown →
        </Link>
      </div>
      <div className="p-3 space-y-2">
        {firstPitch && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono text-stone-400">0-0</span>
            <span className="font-serif text-stone-700">
              <span className="font-semibold">{firstPitch.pitch_name}</span> ({firstPitch.pct}%){firstPitch.top_zone_label ? `, ${firstPitch.top_zone_label}` : ''}
            </span>
          </div>
        )}
        {twoStrike && twoStrikeKey && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono text-stone-400">{twoStrikeKey}</span>
            <span className="font-serif text-stone-700">
              <span className="font-semibold">{twoStrike.pitch_name}</span> ({twoStrike.pct}%){twoStrike.top_zone_label ? `, ${twoStrike.top_zone_label}` : ''}
            </span>
          </div>
        )}
        {topFromPitch && topNext && (
          <div className="pt-2 border-t border-stone-100 text-[11px] font-serif text-stone-600">
            After a <span className="font-semibold text-stone-900">{topFromPitch[1].pitch_name}</span>, likely a{' '}
            <span className="font-semibold text-stone-900">{topNext.pitch_name}</span> ({topNext.pct}%)
          </div>
        )}
      </div>
    </div>
  )
}
