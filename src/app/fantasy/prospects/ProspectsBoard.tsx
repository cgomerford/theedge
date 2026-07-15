// src/app/fantasy/prospects/ProspectsBoard.tsx
//
// ⚠ Team-page link uses a basic slugify fallback (lowercase, spaces→dashes).
// If /mlb/teams/[slug] uses a different slug format (e.g. abbreviations),
// swap teamNameToSlug() for the real slugifyTeam() from src/lib/teams.ts.

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

function teamNameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
}

function ProspectCard({ pick }: { pick: FantasyPick }) {
  return (
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
}

export default function ProspectsBoard({ grouped, forDate, isStale }: {
  grouped: Group[]
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
      </div>

      {grouped.length === 0 ? (
        <div className="border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center">
          <p className="font-serif italic text-sm text-stone-400">
            No prospects flagged today — this fills in as call-up-adjacent signals clear the model's floor.
          </p>
        </div>
      ) : (
        grouped.map(({ team, prospects }) => (
          <section key={team} className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <FantasySectionLabel accent="#7C3AED">{team}</FantasySectionLabel>
            </div>
            <div className="border border-stone-200 bg-white px-4 mb-2">
              {prospects.map(p => <ProspectCard key={p.id} pick={p} />)}
            </div>
            <Link
              href={`/mlb/teams/${teamNameToSlug(team)}`}
              className="font-mono text-[9px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition"
            >
              Full {team} farm system →
            </Link>
          </section>
        ))
      )}

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Information only · Not gambling advice
        </p>
      </div>
    </div>
  )
}
