// src/components/fantasy/FantasyPickRow.tsx
//
// Shared row for rendering a FantasyPick with headshot + ownership badge.
// Used by start-sit, trending, prospects. Not used by the Hub tiles
// (FantasyHub.tsx keeps its own compact TileRow — same visual language,
// different density).
//
// ── Link routing ──
// Rows can now route two different ways depending on the surface:
//   linkTo='game'   → /mlb/[game_slug] — matchup context (Start Today)
//   linkTo='player' → /fantasy/player/[player_id]?from=<board>
//                     — the deep-dive page with radar + trend + why
// Default is 'game' for backward compatibility with any surface that
// hasn't been migrated yet.

import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

export type PickRowLinkTo = 'game' | 'player'

export default function FantasyPickRow({
  pick,
  ownership,
  underOwnedThreshold = 15,
  linkTo = 'game',
  fromBoard,
}: {
  pick: FantasyPick
  ownership: number | null
  /** Below this %, tag the row "Under-owned" — a real signal, not a guess. */
  underOwnedThreshold?: number
  /** Where clicking the row goes. Defaults to 'game'. */
  linkTo?: PickRowLinkTo
  /** Board slug used as the ?from= param on player links, for the back link. */
  fromBoard?: 'trending' | 'prospects' | 'start-sit' | 'trade-desk' | 'yesterday'
}) {
  const ownPct = ownership != null ? Math.round(ownership) : null
  const isUnderOwned = ownPct != null && ownPct < underOwnedThreshold

  const href = resolveHref(pick, linkTo, fromBoard)

  return (
    <Link
      href={href}
      className="flex items-center gap-4 py-3.5 border-b border-stone-100 last:border-0 hover:bg-stone-50 -mx-2 px-2 transition"
    >
      {pick.player_id ? (
        <PlayerHeadshot
          playerId={pick.player_id}
          size={80}
          className="w-11 h-11 object-cover border border-stone-200 shrink-0"
        />
      ) : (
        <div className="w-11 h-11 bg-stone-100 border border-stone-200 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{pick.player_name}</span>
          {pick.team_name && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">
              {pick.team_name}{pick.opponent_name ? ` vs ${pick.opponent_name}` : ''}
            </span>
          )}
          {isUnderOwned && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#7C3AED] border border-[#7C3AED] px-1.5 py-0.5">
              Under-owned
            </span>
          )}
        </div>
        <div className="font-serif italic text-xs text-stone-500 mt-0.5 truncate">
          {pick.one_liner}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300">Owned</div>
        <div className="font-mono text-sm font-bold text-stone-700 tabular-nums">
          {ownPct != null ? `${ownPct}%` : '—'}
        </div>
      </div>
    </Link>
  )
}

function resolveHref(
  pick: FantasyPick,
  linkTo: PickRowLinkTo,
  fromBoard: string | undefined,
): string {
  // If caller wants the player deep-dive AND we have an mlb id, use it.
  if (linkTo === 'player' && pick.player_id) {
    const suffix = fromBoard ? `?from=${fromBoard}` : ''
    return `/fantasy/player/${pick.player_id}${suffix}`
  }
  // Game context — keep the old behavior.
  if (pick.game_slug) return `/mlb/${pick.game_slug}`
  // Last-ditch fallback so we never generate a broken href even when
  // both linkTo='player' and no player_id — better a no-op than a 404.
  return '#'
}
