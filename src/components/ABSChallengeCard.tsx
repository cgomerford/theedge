// src/components/ABSChallengeCard.tsx
'use client'

// Season-long ABS challenge tendency card — batting-initiated vs
// pitching/catching-initiated challenge success rates, per team. Reads
// ABSChallengeRecord from lib/abs-challenges.ts (getABSChallengeRecord).
//
// REBUILT 2026-08-20 — the original was accidentally overwritten by a
// same-named postgame component earlier tonight and had no git history
// to recover from. Rebuilt fresh against the real ABSChallengeRecord
// type (confirmed via grep against abs-challenges.ts), not guessed.
// If anything here differs visually from the pre-collision version,
// that's expected — this is a reconstruction, not a restore.

import type { ABSChallengeRecord } from '@/lib/abs-challenges'

function pct(v: number | null): string {
  return v != null ? `${Math.round(v * 100)}%` : '—'
}

function StatRow({ label, challenges, overturns, successRate }: {
  label: string
  challenges: number
  overturns: number
  successRate: number | null
}) {
  return (
    <div className="px-3 py-2 border-b border-stone-50 last:border-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-semibold text-stone-800">{label}</span>
        <span className="font-mono text-[11px] font-bold text-stone-900">{pct(successRate)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${successRate != null ? successRate * 100 : 0}%` }}
          />
        </div>
        <span className="font-mono text-[9px] text-stone-400 shrink-0">{overturns}/{challenges}</span>
      </div>
    </div>
  )
}

export default function ABSChallengeCard({
  teamAbbr, color, record,
}: {
  teamAbbr: string
  color: string
  record: ABSChallengeRecord | null
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{teamAbbr} · ABS challenges</span>
        {record && (
          <span className="font-mono text-[9px] text-stone-400">{record.total_challenges} this season</span>
        )}
      </div>
      {!record || record.total_challenges === 0 ? (
        <p className="text-[11px] font-serif italic text-stone-400 text-center py-4">
          No ABS challenge data this season.
        </p>
      ) : (
        <div>
          <StatRow
            label="Batting challenges"
            challenges={record.batting_challenges}
            overturns={record.batting_overturns}
            successRate={record.batting_success_rate}
          />
          <StatRow
            label="Pitching/catching challenges"
            challenges={record.pitching_challenges}
            overturns={record.pitching_overturns}
            successRate={record.pitching_success_rate}
          />
          <div className="px-3 py-2 bg-stone-50/60">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">Overall success rate</span>
              <span className="font-mono text-[12px] font-bold" style={{ color }}>{pct(record.total_success_rate)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}