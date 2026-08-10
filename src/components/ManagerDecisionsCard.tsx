'use client'

// src/components/ManagerDecisionsCard.tsx
//
// Broken down per team: manager name (best-effort — see the note in
// lib/postgame.ts -> computeManagerDecisions), pinch-hit results, and
// lead-protection outcomes, each tagged with a dot color:
//   green = positive, red = negative, grey = neutral/no real impact.

import type { TeamManagerDecisions } from '@/lib/postgame'

const IMPACT_COLOR: Record<string, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-red-500',
  neutral: 'bg-stone-300',
}

function DecisionRow({ dotColor, name, meta, description }: { dotColor: string; name: string; meta: string; description: string }) {
  return (
    <div className="px-3 py-1.5 flex items-start gap-2 border-b border-stone-50 last:border-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
      <div className="min-w-0">
        <span className="text-[11.5px] text-stone-800 font-semibold">{name}</span>
        <span className="font-mono text-[9px] text-stone-400"> · {meta}</span>
        <p className="text-[10.5px] text-stone-500 leading-snug">{description}</p>
      </div>
    </div>
  )
}

function TeamSection({ team }: { team: TeamManagerDecisions }) {
  const hasAny = team.pinchHitResults.length > 0 || team.pitchingDecisions.length > 0
  return (
    <div className="border-b border-stone-100 last:border-0">
      <div className="px-3 py-2 bg-stone-50/60 flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-stone-800">{team.managerName ?? `${team.teamAbbr} manager`}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400">{team.teamAbbr}</span>
      </div>
      {!hasAny ? (
        <div className="px-3 py-3 font-mono text-[10px] text-stone-400">No pinch-hit or lead-protecting situations</div>
      ) : (
        <>
          {team.pinchHitResults.map((r, i) => (
            <DecisionRow
              key={`ph-${i}`}
              dotColor={IMPACT_COLOR[r.impact]}
              name={r.playerName}
              meta={`PH slot ${r.battingOrderSlot} · Inn ${r.inning}`}
              description={r.description}
            />
          ))}
          {team.pitchingDecisions.map((r, i) => (
            <DecisionRow
              key={`pd-${i}`}
              dotColor={IMPACT_COLOR[r.impact]}
              name={r.pitcherName}
              meta={`entered Inn ${r.inning} up ${r.enteredLead}`}
              description={`${r.outcome === 'held' ? 'Held the lead' : 'Blew the lead'}${r.description ? ` — ${r.description}` : ''}`}
            />
          ))}
        </>
      )}
    </div>
  )
}

export default function ManagerDecisionsCard({ decisions }: { decisions: { away: TeamManagerDecisions; home: TeamManagerDecisions } }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">Manager decisions</span>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="font-mono text-[8px] text-stone-400">Good</span></div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stone-300" /><span className="font-mono text-[8px] text-stone-400">No impact</span></div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="font-mono text-[8px] text-stone-400">Negative</span></div>
        </div>
      </div>
      <TeamSection team={decisions.away} />
      <TeamSection team={decisions.home} />
    </div>
  )
}