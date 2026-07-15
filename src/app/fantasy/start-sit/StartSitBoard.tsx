// src/app/fantasy/start-sit/StartSitBoard.tsx

import type { FantasyPick } from '@/lib/fantasy'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import FantasyPickRow from '@/components/fantasy/FantasyPickRow'

type Props = {
  streamers: FantasyPick[]
  sleepers: FantasyPick[]
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

function PickList({ picks, ownershipByPickId, emptyLabel }: {
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
        <FantasyPickRow key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} />
      ))}
    </div>
  )
}

export default function StartSitBoard({ streamers, sleepers, ownershipByPickId, forDate, isStale }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#15803D] font-bold mb-1">
          ⊕ Start/Sit & Waiver Wire
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
          Who to start, who to add<span className="text-[#FF5722]">.</span>
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400">{formatDate(forDate)}</span>
          {isStale && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-amber-600">
              Showing yesterday — today updates ~23:30 UTC
            </span>
          )}
        </div>
      </div>

      <section className="mb-12">
        <FantasySectionLabel accent="#15803D">Start today</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Favorable matchups worth starting even if they're not your usual lineup lock — park factors,
          opposing pitcher weaknesses, and recent form all factor in.
        </p>
        <div className="border border-stone-200 bg-white px-4">
          <PickList picks={streamers} ownershipByPickId={ownershipByPickId} emptyLabel="Streamer picks populate 3–4 hrs before first pitch, once lineups confirm." />
        </div>
      </section>

      <section className="mb-12">
        <FantasySectionLabel accent="#D97706">Waiver wire & hidden gems</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Signal-based, not ownership-based — these clear our model's threshold regardless of how
          widely rostered they already are. The <span className="text-[#7C3AED] font-semibold">Under-owned</span> tag
          means real ESPN ownership under 15%, so you know which ones are genuinely available.
        </p>
        <div className="border border-stone-200 bg-white px-4">
          <PickList picks={sleepers} ownershipByPickId={ownershipByPickId} emptyLabel="No hidden gems clearing the signal floor today." />
        </div>
      </section>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
