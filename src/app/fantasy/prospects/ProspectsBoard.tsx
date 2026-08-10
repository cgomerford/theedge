// src/app/fantasy/prospects/ProspectsBoard.tsx
//
// Changes vs prior version:
//   1. Prospect rows now link to the player deep-dive (/fantasy/player/[id])
//      instead of being static — solves the "clicking does nothing" gap.
//   2. "Full farm system" link now resolves the team name to a MiLB team id
//      via the teamIdByName map from resolveTeamNameMap() — actually reaches
//      the roster page instead of dropping onto a broken MLB slug.
//   3. Copy explains what the deep-dive gives you.

import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'
import FantasySectionLabel from '@/components/fantasy/FantasySectionLabel'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

type Group = { team: string; prospects: FantasyPick[] }

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function ProspectRow({ pick }: { pick: FantasyPick }) {
  const inner = (
    <div className="flex items-center gap-4 py-3.5 border-b border-stone-100 last:border-0">
      {pick.player_id ? (
        <PlayerHeadshot playerId={pick.player_id} size={80} className="w-11 h-11 object-cover border border-stone-200 shrink-0" />
      ) : (
        <div className="w-11 h-11 bg-stone-100 border border-stone-200 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{pick.player_name}</span>
        <div className="font-serif italic text-xs text-stone-500 mt-0.5">{pick.one_liner}</div>
      </div>
    </div>
  )
  return pick.player_id ? (
    <Link
      href={`/fantasy/player/${pick.player_id}?from=prospects`}
      className="block hover:bg-stone-50 -mx-2 px-2 transition"
    >
      {inner}
    </Link>
  ) : inner
}

export default function ProspectsBoard({
  grouped, teamIdByName, forDate, isStale,
}: {
  grouped: Group[]
  teamIdByName: Map<string, number>
  forDate: string
  isStale: boolean
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-16">
      <div className="py-6 border-b border-stone-900 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#7C3AED] font-bold mb-1">
          ⊕ Prospect Watch
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-none">
          Names to know before the call-up<span className="text-[#FF5722]">.</span>
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
          Click any prospect for a full deep-dive on their recent form.
          Click the farm system link under each group to browse the whole affiliate roster —
          age, level, hot/cold indicator, and every teammate we&apos;re not yet tracking.
        </p>
      </div>

      {grouped.length === 0 ? (
        <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center">
          <p className="font-serif italic text-sm text-stone-400">
            No prospects flagged today — this fills in as call-up-adjacent signals clear the model&apos;s floor.
          </p>
        </div>
      ) : (
        grouped.map(({ team, prospects }) => {
          const teamId = teamIdByName.get(team)
          return (
            <section key={team} className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <FantasySectionLabel accent="#7C3AED">{team}</FantasySectionLabel>
              </div>
              <div className="border border-stone-200 bg-white px-4 mb-2">
                {prospects.map(p => <ProspectRow key={p.id} pick={p} />)}
              </div>
              {teamId ? (
                <Link
                  href={`/fantasy/minors/team/${teamId}`}
                  className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition"
                >
                  Full {team} roster · levels, hot bats, MLB ETA →
                </Link>
              ) : (
                <span className="font-mono text-[9px] uppercase tracking-widest text-stone-300">
                  Roster page unavailable — team not resolved
                </span>
              )}
            </section>
          )
        })
      )}

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
