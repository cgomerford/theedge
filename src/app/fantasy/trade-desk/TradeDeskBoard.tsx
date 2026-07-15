// src/app/fantasy/trade-desk/TradeDeskBoard.tsx

import type { FantasyPick } from '@/lib/fantasy'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import FantasyPickRow from '@/components/fantasy/FantasyPickRow'

type Props = {
  sellHigh: FantasyPick[]
  buyLow: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  forDate: string
  isStale: boolean
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
        <FantasyPickRow key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} underOwnedThreshold={25} />
      ))}
    </div>
  )
}

export default function TradeDeskBoard({ sellHigh, buyLow, ownershipByPickId, forDate, isStale }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#B45309] font-bold mb-1">
          ⊕ Trade Desk
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
          Sell high, buy low<span className="text-[#FF5722]">.</span>
        </h1>
        <p className="font-serif italic text-stone-500 text-sm mt-2 max-w-xl leading-relaxed">
          No invented trade-value score here — we don't have rest-of-season projections, and we're not
          going to fake a number that looks precise. What follows is real: players currently performing
          well above or below their season baseline, which is exactly when trade value is most out of sync
          with reality.
        </p>
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
        <FantasySectionLabel accent="#059669">Sell high</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Running hot right now — their perceived value is at its peak. If a trade partner is chasing
          recent production, this is your leverage.
        </p>
        <div className="border border-stone-200 bg-white px-4">
          <PickList picks={sellHigh} ownershipByPickId={ownershipByPickId} emptyLabel="Nobody running hot enough to flag today." />
        </div>
      </section>

      <section className="mb-12">
        <FantasySectionLabel accent="#DC2626">Buy low</FantasySectionLabel>
        <p className="font-serif italic text-sm text-stone-500 mb-4 max-w-2xl">
          Cooling off relative to season form — the players most likely to be undervalued by an owner
          reacting to a recent slump rather than the full season body of work.
        </p>
        <div className="border border-stone-200 bg-white px-4">
          <PickList picks={buyLow} ownershipByPickId={ownershipByPickId} emptyLabel="Nobody cooling off enough to flag today." />
        </div>
      </section>

      <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-5 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1">Not built yet</p>
        <p className="font-serif italic text-sm text-stone-500">
          A mock trade builder — pick players from both sides, compare the deal — needs player search UI
          and a defined valuation approach. Worth doing as its own scoped page, not bolted onto this one.
        </p>
      </div>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
