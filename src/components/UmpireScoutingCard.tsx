'use client'

// src/components/UmpireScoutingCard.tsx
//
// Goes in the Scout Report's right "Notes" column: tonight's home plate
// umpire, their season accuracy (scoped to this team's games — see the
// scope note in lib/umpire-scouting.ts), and where they tend to miss
// calls most.

import type { UmpireSeasonProfile } from '@/lib/umpire-scouting'

function TendencyBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] text-stone-400 w-12 flex-shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[9px] text-stone-400 w-4 text-right flex-shrink-0">{count}</span>
    </div>
  )
}

type Props = {
  umpireName: string | null
  profile: UmpireSeasonProfile | null
}

export default function UmpireScoutingCard({ umpireName, profile }: Props) {
  if (!umpireName) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Home plate umpire</span>
        </div>
        <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">Not assigned yet</div>
      </div>
    )
  }

  const maxTendency = profile ? Math.max(1, ...Object.values(profile.missTendency)) : 1

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: '3px solid #a8a29e' }}>
      <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Home plate umpire</span>
      </div>
      <div className="px-3 py-2.5">
        <span className="text-[13px] font-semibold text-stone-800">{umpireName}</span>
        {profile ? (
          <>
            <p className="text-[11px] text-stone-500 mt-1">
              <strong className="text-stone-800">{profile.accuracyPct}%</strong> ball/strike accuracy across {profile.gamesWorkedAsHP} game{profile.gamesWorkedAsHP === 1 ? '' : 's'} worked this season
            </p>
            <p className="font-mono text-[9.5px] text-amber-700 mt-1">{profile.tendencySummary}</p>
            <div className="flex flex-col gap-1 mt-2.5">
              <TendencyBar label="high" count={profile.missTendency.high} max={maxTendency} />
              <TendencyBar label="low" count={profile.missTendency.low} max={maxTendency} />
              <TendencyBar label="inside" count={profile.missTendency.inside} max={maxTendency} />
              <TendencyBar label="outside" count={profile.missTendency.outside} max={maxTendency} />
            </div>
          </>
        ) : (
          <p className="font-mono text-[10px] text-stone-400 mt-1.5">No season sample available for this ump yet</p>
        )}
      </div>
    </div>
  )
}
