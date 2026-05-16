/**
 * src/components/StreamerSummary.tsx
 *
 * Compact strip on /tonight showing top 2-3 streamer picks.
 * Only shows strong + viable — never shows avoid tier.
 * Designed for the tonight page's dark theme.
 */

import Link from 'next/link'
import type { StreamerResult } from '@/lib/streamer'

type Props = {
  picks: StreamerResult[]
  isPro?: boolean
}

const TIER_STYLES: Record<'strong' | 'viable' | 'avoid', { badge: string; label: string }> = {
  strong: { badge: 'bg-emerald-600 text-white',    label: 'Strong stream' },
  viable: { badge: 'bg-yellow-400 text-stone-900', label: 'Viable'        },
  avoid:  { badge: 'bg-stone-600 text-stone-300',  label: 'Avoid'         },
}

export default function StreamerSummary({ picks, isPro = false }: Props) {
  // Never show avoid tier in the summary strip
  const visible = picks.filter(p => p.tier !== 'avoid').slice(0, 3)
  if (!visible.length) return null

  return (
    <section>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-500 font-bold mb-1">
            ⊕ The Streamer Pick · Fantasy
          </div>
          <h2 className="text-2xl font-serif font-light text-stone-100">
            Tonight&apos;s top streams.
          </h2>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 hidden sm:block">
          DFS · Season-long
        </span>
      </div>

      {/* Pick rows */}
      <div className="space-y-2">
        {visible.map((pick, i) => {
          const style = TIER_STYLES[pick.tier]
          return (
            <div
              key={pick.gameSlug + pick.pitcherName}
              className="bg-stone-900 border border-stone-800 p-4 flex items-center justify-between gap-4"
            >
              {/* Rank + name + matchup */}
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-mono text-stone-600 text-sm shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  <div className="font-serif font-semibold text-stone-100 leading-tight">
                    {pick.pitcherName}
                  </div>
                  <div className="text-[11px] font-mono text-stone-500 mt-0.5 truncate">
                    {pick.teamName} · vs {pick.opponentName} · {pick.gameTime}
                  </div>
                  {isPro && (
                    <p className="text-xs font-serif italic text-stone-400 mt-1 leading-relaxed">
                      {pick.rationale}
                    </p>
                  )}
                  {!isPro && (
                    <div className="text-[10px] font-mono text-stone-600 mt-1">
                      <span className="text-orange-500">⊕</span> Full analysis · Pro only
                    </div>
                  )}
                </div>
              </div>

              {/* Badge + score + link */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 ${style.badge}`}>
                  {style.label}
                </span>
                {isPro && (
                  <span className="text-[10px] font-mono text-stone-500">{pick.streamerScore}/100</span>
                )}
                <Link
                  href={`/mlb/${pick.gameSlug}`}
                  className="text-[10px] font-mono uppercase tracking-widest text-orange-500 hover:text-yellow-300 transition whitespace-nowrap"
                >
                  View game →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <p className="text-[10px] font-mono text-stone-600 mt-4 leading-relaxed">
        Scores weight pitcher quality (40%), opponent offence (30%), stuff/whiff (15%), park (15%).
        {!isPro && (
          <>{' '}<Link href="/#signup" className="text-orange-500 hover:underline">Upgrade to Pro</Link> for full rationale.</>
        )}
      </p>
    </section>
  )
}
