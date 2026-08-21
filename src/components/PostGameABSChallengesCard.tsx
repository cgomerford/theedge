// src/components/PostGameABSChallengesCard.tsx
'use client'

// ABS (Automated Ball-Strike) challenge results for THIS GAME. Reads
// report.umpireReport.challengeEvents. Field mapping (reviewDetails at
// the top level of the play event, not nested under details) VERIFIED
// 2026-08-20 against gamePk 823424 — 4 real confirmed challenges.
//
// RENAMED from ABSChallengeCard.tsx — that filename collided with a
// pre-existing, unrelated season-record component (same name, different
// shape) used by ScoutReportTab.tsx's pregame page, which silently broke
// when this file overwrote it. This is now a distinct file so the
// collision can't recur.

import type { ChallengeEvent } from '@/lib/postgame'

function overturnColor(overturned: boolean | null): string {
  if (overturned === true) return '#16a34a'
  if (overturned === false) return '#dc2626'
  return '#a8a29e'
}

function ChallengeZoneBox({ challenges }: { challenges: ChallengeEvent[] }) {
  const plotted = challenges.filter(c => c.pX != null && c.pZ != null)
  if (plotted.length === 0) return null

  const SIZE = 160
  const X_RANGE = 2.5
  const Y_MIN = 0.5
  const Y_MAX = 4.5
  const toX = (x: number) => SIZE / 2 + (x / X_RANGE) * (SIZE / 2 - 10)
  const toY = (z: number) => SIZE - ((z - Y_MIN) / (Y_MAX - Y_MIN)) * SIZE

  return (
    <div className="mb-3">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[160px] mx-auto block">
        <rect x={SIZE * 0.3} y={SIZE * 0.25} width={SIZE * 0.4} height={SIZE * 0.5} fill="none" stroke="#78716c60" strokeWidth={1.5} />
        {plotted.map((c, i) => (
          <circle
            key={i}
            cx={toX(c.pX!)}
            cy={toY(c.pZ!)}
            r={5}
            fill={overturnColor(c.overturned)}
            fillOpacity={0.8}
            stroke="#fff"
            strokeWidth={1}
          >
            <title>{c.batterName} vs {c.pitcherName} · Inn {c.inning} · {c.overturned === true ? 'Overturned' : c.overturned === false ? 'Upheld' : 'Unknown'}</title>
          </circle>
        ))}
      </svg>
      <p className="text-center font-mono text-[9px] text-stone-400 mt-1">Catcher's-eye view</p>
    </div>
  )
}

export default function PostGameABSChallengesCard({ challenges = [] }: { challenges?: ChallengeEvent[] }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden h-full">
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-stone-900">ABS challenges</span>
      </div>
      <div className="p-3">
        {challenges.length === 0 ? (
          <p className="text-[11px] font-serif italic text-stone-400 text-center py-4">
            No challenges recorded this game.
          </p>
        ) : (
          <>
            <ChallengeZoneBox challenges={challenges} />
            <div className="flex justify-center gap-3 mb-3 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="font-mono text-[8px] text-stone-400">Overturned</span></div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="font-mono text-[8px] text-stone-400">Upheld</span></div>
            </div>
            <div className="space-y-2">
              {challenges.map((c, i) => (
                <div key={i} className="flex items-start gap-2 pb-2 border-b border-stone-50 last:border-0 last:pb-0">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    c.overturned === true ? 'bg-green-500' : c.overturned === false ? 'bg-red-400' : 'bg-stone-300'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-serif text-stone-800 leading-snug">
                      {c.batterName} vs {c.pitcherName}
                      <span className="text-stone-400"> · Inn {c.inning}</span>
                    </p>
                    <p className="text-[10px] font-mono text-stone-500 mt-0.5">
                      {c.overturned === true ? 'Overturned' : c.overturned === false ? 'Upheld' : 'Result unknown'}
                      {c.challengingTeam ? ` · challenged by ${c.challengingTeam}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="font-mono text-[8px] text-stone-300 mt-3 leading-relaxed">
          Field mapping verified 2026-08-20 against a confirmed challenged pitch.
        </p>
      </div>
    </div>
  )
}