// src/app/fantasy/FantasyHub.tsx
//
// Fantasy Desk landing page — pure presentation over the FantasyPicksByType
// shape from getFantasyPicks(), plus per-pick ownership. No client state
// needed, so this stays a server component.
//
// Headshot rendering is delegated to PlayerHeadshot (client component) —
// Next 16's RSC boundary rejects an inline onError handler on a raw <img>
// inside a server component.

import Link from 'next/link'
import type { FantasyPick, FantasyPicksByType } from '@/lib/fantasy'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

type Props = {
  picks: FantasyPicksByType
  ownershipByPickId: Record<number, number | null>
  forDate: string
  isStale: boolean
  isPro: boolean
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function OwnershipTag({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const underOwned = pct < 15
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 shrink-0 ${
        underOwned ? 'text-[#7C3AED] bg-[#7C3AED]/10' : 'text-stone-400 bg-stone-100'
      }`}
    >
      {pct.toFixed(0)}% own
    </span>
  )
}

function TileRow({ pick, ownership }: { pick: FantasyPick; ownership: number | null }) {
  return (
    <Link
      href={pick.game_slug ? `/mlb/${pick.game_slug}` : '#'}
      className="flex items-center gap-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-stone-50 -mx-1 px-1 transition"
    >
      {pick.player_id ? (
        <PlayerHeadshot playerId={pick.player_id} size={32} className="rounded-full shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-stone-100 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-sm text-[#1A1A1A] truncate">
            {pick.headline ?? pick.player_name}
          </span>
        </div>
        <p className="font-serif italic text-xs text-stone-500 truncate">{pick.one_liner}</p>
      </div>
      <OwnershipTag pct={ownership} />
    </Link>
  )
}

function CategoryTile({
  title,
  accent,
  picks,
  ownershipByPickId,
  href,
  emptyLabel,
}: {
  title: string
  accent: string
  picks: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  href: string
  emptyLabel: string
}) {
  const top3 = picks.slice(0, 3)
  return (
    <div className="border border-stone-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>
          {title}
        </span>
        <span className="font-mono text-[10px] text-stone-300">{picks.length}</span>
      </div>
      <div className="px-4 py-1 flex-1">
        {top3.length === 0 ? (
          <p className="font-serif italic text-xs text-stone-400 py-4">{emptyLabel}</p>
        ) : (
          top3.map(p => (
            <TileRow key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} />
          ))
        )}
      </div>
      <Link
        href={href}
        className="px-4 py-2.5 border-t border-stone-200 font-mono text-[9px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition"
      >
        Full board →
      </Link>
    </div>
  )
}

export default function FantasyHub({ picks, ownershipByPickId, forDate, isStale, isPro }: Props) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* Header */}
      <div className="mb-8">
        <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-wider mb-1">
          ⊕ Fantasy Desk
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold text-[#1A1A1A]"
          style={{ fontFamily: 'Fraunces, serif' }}
        >
          Today&rsquo;s board
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {formatDate(forDate)}
          {isStale && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-amber-600">
              · showing most recent available slate
            </span>
          )}
        </p>
      </div>

      {/* Category grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CategoryTile
          title="Start Today"
          accent="#15803D"
          picks={picks.streamer}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/start-sit"
          emptyLabel="Streamers populate ~3–4 hrs pre-game, once starters confirm."
        />
        <CategoryTile
          title="Waiver Targets"
          accent="#D97706"
          picks={picks.sleeper}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/start-sit"
          emptyLabel="No hidden gems clearing the signal floor today."
        />
        <CategoryTile
          title="Movers"
          accent="#2563EB"
          picks={picks.mover}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/trending"
          emptyLabel="No significant model movement today."
        />
        <CategoryTile
          title="Fallers"
          accent="#DC2626"
          picks={picks.faller}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/trending"
          emptyLabel="Nothing sliding hard enough to flag."
        />
        <CategoryTile
          title="Cooling Off"
          accent="#DC2626"
          picks={picks.cooler}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/trending"
          emptyLabel="No cold streaks meeting the threshold today."
        />
        <CategoryTile
          title="Heating Up"
          accent="#059669"
          picks={picks.riser}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/trending"
          emptyLabel="No hot streaks meeting the threshold today."
        />
        <CategoryTile
          title="Prospect Watch"
          accent="#7C3AED"
          picks={picks.prospect}
          ownershipByPickId={ownershipByPickId}
          href="/fantasy/prospects"
          emptyLabel="No AAA hitters heating up right now."
        />
      </div>

      <div className="pt-8 mt-4 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}