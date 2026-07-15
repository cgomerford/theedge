// src/app/fantasy/yesterday/YesterdayBoard.tsx

import Link from 'next/link'
import type { YesterdaysSignals, HittingLeader, PitchingLeader, ExitVeloLeader } from '@/lib/fantasy-yesterday'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function LeaderRow({
  playerId, name, team, statValue, statLabel,
}: {
  playerId: number | null
  name: string
  team?: string
  statValue: string
  statLabel: string
}) {
  const inner = (
    <div className="flex items-center gap-4 py-3 border-b border-stone-100 last:border-0">
      {playerId ? (
        <PlayerHeadshot playerId={playerId} size={80} className="w-10 h-10 object-cover border border-stone-200 shrink-0" />
      ) : (
        <div className="w-10 h-10 bg-stone-100 border border-stone-200 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{name}</span>
        {team && <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400 ml-2">{team}</span>}
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-base font-bold text-[#1A1A1A] tabular-nums">{statValue}</div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300">{statLabel}</div>
      </div>
    </div>
  )
  return playerId ? (
    <Link href={`/stats/player/${playerId}`} className="block hover:bg-stone-50 -mx-2 px-2 transition">{inner}</Link>
  ) : inner
}

export default function YesterdayBoard({ signals }: { signals: YesterdaysSignals }) {
  const hasAnyData =
    signals.hittingLeaders.length > 0 ||
    signals.strikeoutLeaders.length > 0 ||
    signals.exitVeloLeaders.length > 0

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#0891B2] font-bold mb-1">
          ⊕ Last Night
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
          What actually happened<span className="text-[#FF5722]">.</span>
        </h1>
        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-400 block mt-3">
          {formatDate(signals.date)}
        </span>
      </div>

      {!hasAnyData && (
        <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center mb-8">
          <p className="font-serif italic text-sm text-stone-400">
            No data returned for {signals.date} — could be an off day, or an upstream fetch issue. Check server logs.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <section>
          <FantasySectionLabel accent="#DC2626">Strikeout leaders</FantasySectionLabel>
          <div className="border border-stone-200 bg-white px-4">
            {signals.strikeoutLeaders.length === 0 ? (
              <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No data.</p>
            ) : (
              signals.strikeoutLeaders.map(p => (
                <LeaderRow key={p.playerId} playerId={p.playerId} name={p.name} team={p.team} statValue={String(p.strikeOuts)} statLabel="K" />
              ))
            )}
          </div>
        </section>

        <section>
          <FantasySectionLabel accent="#2563EB">Hardest hit balls (EV)</FantasySectionLabel>
          <div className="border border-stone-200 bg-white px-4">
            {signals.exitVeloLeaders.length === 0 ? (
              <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No data.</p>
            ) : (
              signals.exitVeloLeaders.map((p, i) => (
                <LeaderRow key={`${p.playerId}-${i}`} playerId={p.playerId} name={p.name} statValue={`${p.maxExitVelo.toFixed(1)}`} statLabel="MPH" />
              ))
            )}
          </div>
        </section>

        <section>
          <FantasySectionLabel accent="#059669">Extra-base hits</FantasySectionLabel>
          <div className="border border-stone-200 bg-white px-4">
            {signals.hittingLeaders.length === 0 ? (
              <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No data.</p>
            ) : (
              signals.hittingLeaders.map(p => (
                <LeaderRow key={p.playerId} playerId={p.playerId} name={p.name} team={p.team} statValue={String(p.xbh)} statLabel="XBH" />
              ))
            )}
          </div>
        </section>

        <section>
          <FantasySectionLabel accent="#D97706">Hits leaders</FantasySectionLabel>
          <div className="border border-stone-200 bg-white px-4">
            {signals.hitsLeaders.length === 0 ? (
              <p className="font-serif italic text-sm text-stone-400 py-6 text-center">No data.</p>
            ) : (
              signals.hitsLeaders.map(p => (
                <LeaderRow key={p.playerId} playerId={p.playerId} name={p.name} team={p.team} statValue={String(p.hits)} statLabel="H" />
              ))
            )}
          </div>
        </section>
      </div>

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
