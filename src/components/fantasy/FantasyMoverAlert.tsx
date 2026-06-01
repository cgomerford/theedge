/**
 * src/components/fantasy/FantasyMoverAlert.tsx
 *
 * Alert-style card for games where the Edge score swung hard today.
 * Shows the matchup, the reason, and the score change.
 * Server component — no state needed.
 */

import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'

export default function FantasyMoverAlert({ pick }: { pick: FantasyPick }) {
  const d = pick.details ?? {}
  const prevScore = d.prev_score ?? d.previous_score ?? d.edge_before
  const currScore = d.curr_score ?? d.current_score ?? d.edge_after ?? pick.signal_score
  const isUp = currScore != null && prevScore != null && currScore > prevScore

  const gameLink = pick.game_slug ? `/mlb/${pick.game_slug}` : null

  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-white rounded-lg shadow-sm border border-stone-200 ${
      isUp ? 'border-l-[3px] border-l-emerald-500' : 'border-l-[3px] border-l-red-500'
    }`}>
      {/* Icon */}
      <span className="text-base shrink-0 mt-0.5" aria-hidden>
        {isUp ? '⚡' : '⚠'}
      </span>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif font-semibold text-sm text-stone-900">
            {pick.player_name}
          </span>
          {pick.team_name && pick.opponent_name && (
            <span className="font-mono text-[10px] text-stone-400">
              {pick.team_name} vs {pick.opponent_name}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-1 leading-relaxed">
          {pick.one_liner}
        </p>
        {gameLink && (
          <Link
            href={gameLink}
            className="inline-block mt-1.5 font-mono text-[9px] tracking-widest uppercase text-orange-600 hover:text-orange-700 transition"
          >
            View game →
          </Link>
        )}
      </div>

      {/* Score change */}
      {prevScore != null && currScore != null && (
        <div className={`shrink-0 font-mono text-xs font-bold ${
          isUp ? 'text-emerald-600' : 'text-red-600'
        }`}>
          {prevScore > 0 ? '+' : ''}{prevScore} → {currScore > 0 ? '+' : ''}{currScore}
        </div>
      )}
    </div>
  )
}