/**
 * src/components/StreamerPick.tsx
 *
 * Shows on each /mlb/[slug] game preview page.
 * Free tier: sees pitcher name + tier badge.
 * Pro tier: sees full score breakdown, rationale, component bars.
 *
 * Server component — no 'use client' needed.
 * All data passed as props (calculated in page.tsx).
 */

import Link from 'next/link'
import type { StreamerResult } from '@/lib/streamer'

type Props = {
  result: StreamerResult
  isPro?: boolean
}

const TIER_CONFIG: Record<'strong' | 'viable' | 'avoid', { label: string; badge: string; accent: string; icon: string }> = {
  strong: {
    label: 'Strong Stream',
    badge: 'bg-emerald-600 text-white',
    accent: 'border-emerald-600',
    icon: '⬆',
  },
  viable: {
    label: 'Viable Stream',
    badge: 'bg-yellow-400 text-stone-900',
    accent: 'border-yellow-400',
    icon: '→',
  },
  avoid: {
    label: 'Avoid Tonight',
    badge: 'bg-stone-300 text-stone-600',
    accent: 'border-stone-300',
    icon: '⬇',
  },
}

function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-yellow-400' :
    'bg-stone-300'

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">{label}</span>
        <span className="text-[10px] font-mono font-bold text-stone-700">{value}</span>
      </div>
      <div className="h-1 bg-stone-200 w-full">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function StreamerPick({ result, isPro = false }: Props) {
  const config = TIER_CONFIG[result.tier]
  const lastName = result.pitcherName.split(' ').at(-1) ?? result.pitcherName

  return (
    <div className={`border-l-2 ${config.accent} bg-[#F5F1E8] p-5`}>

      {/* Section label */}
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
        ⊕ The Streamer Pick · Fantasy
      </div>

      {/* Header row: name + tier badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-serif font-bold text-stone-900 text-lg leading-tight">
            {result.pitcherName}
          </div>
          <div className="text-[11px] font-mono text-stone-500 mt-0.5">
            {result.teamName} · vs {result.opponentName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 ${config.badge}`}>
            {config.icon} {result.tier === 'strong' ? 'Stream' : config.label}
          </span>
          <span className="text-[10px] font-mono text-stone-400">
            {result.streamerScore}/100
          </span>
        </div>
      </div>

      {/* FREE TIER: rationale teaser + Pro lock */}
      {!isPro && (
        <>
          <div className="relative">
            {/* Blurred rationale teaser */}
            <p className="font-serif text-sm text-stone-700 leading-relaxed italic select-none blur-[3px] pointer-events-none">
              {result.rationale}
            </p>
          </div>

          {/* Pro lock CTA */}
          <div className="mt-4 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
                  ⊕ Pro — unlock the full breakdown
                </div>
                <div className="text-xs text-stone-500 mt-1 font-serif">
                  Score breakdown · Rationale · Top pitch · K/9 · ERA
                </div>
              </div>
              <Link
                href="/#signup"
                className="shrink-0 text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-yellow-300 px-3 py-2 hover:bg-stone-700 transition whitespace-nowrap"
              >
                Get Pro →
              </Link>
            </div>
          </div>
        </>
      )}

      {/* PRO TIER: full analysis */}
      {isPro && (
        <>
          {/* Rationale */}
          <p className="font-serif text-sm text-stone-700 leading-relaxed italic mb-4">
            {result.rationale}
          </p>

          {/* Key stats row */}
          <div className="flex flex-wrap gap-4 mb-4">
            {result.era && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">ERA</div>
                <div className="font-mono font-bold text-stone-800 text-sm">{result.era}</div>
              </div>
            )}
            {result.kPer9 && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">K/9</div>
                <div className="font-mono font-bold text-stone-800 text-sm">{parseFloat(result.kPer9).toFixed(1)}</div>
              </div>
            )}
            {result.topPitch && (
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Best Pitch</div>
                <div className="font-mono font-bold text-stone-800 text-sm">{result.topPitch}</div>
              </div>
            )}
          </div>

          {/* Score breakdown bars */}
          <div className="space-y-2.5 pt-3 border-t border-stone-200">
            <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
              Score breakdown (out of 100)
            </div>
            <ScoreBar label="Pitcher quality"  value={result.qualityScore} />
            <ScoreBar label="Opponent offence" value={result.opponentScore} />
            <ScoreBar label="Stuff / whiff"    value={result.stuffScore} />
            <ScoreBar label="Park factor"      value={result.parkScore} />
          </div>
        </>
      )}
    </div>
  )
}
