// src/app/fantasy/trending/TrendingBoard.tsx
//
// Change vs prior version: every FantasyPickRow now routes to the player
// deep-dive page (linkTo="player" fromBoard="trending"). Ownership change
// rows also link into the deep-dive so clicking any name here always
// lands on a page that answers "why is this happening".

import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'
import type { OwnershipChange } from '@/lib/fantasy-ownership'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import FantasyPickRow from '@/components/fantasy/FantasyPickRow'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

type Props = {
  modelUp: FantasyPick[]
  modelDown: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  ownershipTrend: { risers: OwnershipChange[]; fallers: OwnershipChange[] }
  forDate: string
  isStale: boolean
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function ModelPickList({ picks, ownershipByPickId, emptyLabel }: {
  picks: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  emptyLabel: string
}) {
  if (picks.length === 0) {
    return <p className="font-serif italic text-sm text-stone-400 py-8 text-center">{emptyLabel}</p>
  }
  return (
    <div>
      {picks.map(p => (
        <FantasyPickRow
          key={p.id}
          pick={p}
          ownership={ownershipByPickId[p.id] ?? null}
          linkTo="player"
          fromBoard="trending"
        />
      ))}
    </div>
  )
}

function OwnershipChangeRow({ change, direction }: { change: OwnershipChange; direction: 'up' | 'down' }) {
  const color = direction === 'up' ? 'text-green-600' : 'text-red-500'
  const arrow = direction === 'up' ? '▲' : '▼'
  const inner = (
    <div className="flex items-center gap-4 py-3.5 border-b border-stone-100 last:border-0">
      {change.mlb_player_id ? (
        <PlayerHeadshot playerId={change.mlb_player_id} size={80} className="w-11 h-11 object-cover border border-stone-200 shrink-0" />
      ) : (
        <div className="w-11 h-11 bg-stone-100 border border-stone-200 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{change.full_name}</span>
        <div className="font-mono text-[10px] text-stone-400">
          {change.previous.toFixed(1)}% → {change.current.toFixed(1)}% owned
        </div>
      </div>
      <div className={`font-mono text-sm font-bold shrink-0 ${color}`}>
        {arrow} {direction === 'up' ? '+' : ''}{change.delta.toFixed(1)}pp
      </div>
    </div>
  )
  return change.mlb_player_id ? (
    <Link
      href={`/fantasy/player/${change.mlb_player_id}?from=trending`}
      className="block hover:bg-stone-50 -mx-2 px-2 transition"
    >
      {inner}
    </Link>
  ) : inner
}

export default function TrendingBoard({ modelUp, modelDown, ownershipByPickId, ownershipTrend, forDate, isStale }: Props) {
  const hasOwnershipHistory = ownershipTrend.risers.length > 0 || ownershipTrend.fallers.length > 0

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#059669] font-bold mb-1">
          ⊕ Trending
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
          Who&apos;s moving<span className="text-[#FF5722]">.</span>
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">{formatDate(forDate)}</span>
          {isStale && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-amber-600">
              Showing yesterday — today updates ~23:30 UTC
            </span>
          )}
        </div>
        <p className="font-serif italic text-sm text-stone-500 mt-3 max-w-2xl leading-relaxed">
          Every name here opens into a full deep-dive — radar of Statcast shape, OPS trend, splits table,
          and the plain-English read on why the trend is happening.
        </p>
      </div>

      {/* ── Model signals ─────────────────────────────────────────── */}
      <section className="mb-12">
        <FantasySectionLabel accent="#059669">Model signal — heating up</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Recent form outpacing season baseline — usage, role, and performance trending up together.
        </p>
        <div className="border border-stone-200 bg-white px-4 mb-8">
          <ModelPickList picks={modelUp} ownershipByPickId={ownershipByPickId} emptyLabel="Nobody heating up enough to flag today." />
        </div>

        <FantasySectionLabel accent="#DC2626">Model signal — cooling off</FantasySectionLabel>
        <div className="border border-stone-200 bg-white px-4">
          <ModelPickList picks={modelDown} ownershipByPickId={ownershipByPickId} emptyLabel="Nobody cooling off enough to flag today." />
        </div>
      </section>

      {/* ── Real ownership movement ─────────────────────────────────── */}
      <section className="mb-12">
        <FantasySectionLabel accent="#2563EB">Ownership movement — last 7 days</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Real ESPN roster-percentage change, independent of our model — this is what fantasy managers
          are actually doing, not what our signals say they should do. The two won&apos;t always agree,
          and that gap is itself useful: a big model riser nobody&apos;s rostering yet is your best add.
        </p>
        {!hasOwnershipHistory ? (
          <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
            <p className="font-serif italic text-sm text-stone-400">
              Ownership history is still accumulating — this section fills in after ~7 days of daily snapshots.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-stone-200 bg-white px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-green-600 font-bold">
                Rostering up
              </div>
              {ownershipTrend.risers.length === 0 ? (
                <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No significant moves.</p>
              ) : (
                ownershipTrend.risers.map(c => <OwnershipChangeRow key={c.espn_player_id} change={c} direction="up" />)
              )}
            </div>
            <div className="border border-stone-200 bg-white px-4">
              <div className="py-2 border-b border-stone-200 font-mono text-[10px] uppercase tracking-widest text-red-500 font-bold">
                Rostering down
              </div>
              {ownershipTrend.fallers.length === 0 ? (
                <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No significant moves.</p>
              ) : (
                ownershipTrend.fallers.map(c => <OwnershipChangeRow key={c.espn_player_id} change={c} direction="down" />)
              )}
            </div>
          </div>
        )}
      </section>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
