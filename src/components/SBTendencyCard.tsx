'use client'

// src/components/SBTendencyCard.tsx
//
// Stolen base attempt tendency by count, season-wide. Data from
// lib/sb-tendency.ts — read that file's header before trusting this at
// face value: the count shown is the count when the plate appearance
// resolved, not necessarily the exact pitch the runner broke on. Real
// signal, not an official precise number — labelled as such here too.

import type { SBTendencyReport } from '@/lib/sb-tendency'

type Props = {
  teamAbbr: string
  color: string
  report: SBTendencyReport | null
}

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(0)}%` : '—'
}

export default function SBTendencyCard({ teamAbbr, color, report }: Props) {
  if (!report || report.totalAttempts === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
        <div className="px-3 py-2 border-b border-stone-100">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamAbbr} · SB tendency</span>
        </div>
        <div className="px-3 py-5 text-center">
          <p className="font-serif italic text-xs text-stone-400">No steal attempts recorded yet this season.</p>
        </div>
      </div>
    )
  }

  const topCounts = report.byCount.slice(0, 4)

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="px-3 py-2 border-b border-stone-100">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamAbbr} · SB tendency</span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between bg-stone-50 rounded-lg px-2.5 py-2 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500">Season</span>
          <span className="font-mono text-sm font-bold text-stone-900">
            {report.totalSuccesses}/{report.totalAttempts} ({fmtPct(report.successRate)})
          </span>
        </div>
        <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mb-1.5 px-0.5">Most common counts</p>
        <div className="space-y-1">
          {topCounts.map(b => (
            <div key={`${b.balls}-${b.strikes}`} className="flex items-center justify-between px-2 py-1.5 bg-stone-50 rounded-md">
              <span className="font-mono text-xs font-bold text-stone-800">{b.balls}-{b.strikes}</span>
              <span className="font-mono text-[10px] text-stone-600">{b.attempts} attempt{b.attempts === 1 ? '' : 's'}</span>
              <span className="font-mono text-[10px] font-semibold text-stone-700">{fmtPct(b.successRate)}</span>
            </div>
          ))}
        </div>
        <p className="text-[7px] font-mono text-stone-400 mt-2 leading-relaxed">
          Count reflects the plate appearance's final count, not necessarily the exact pitch of the attempt — a close approximation, not an official per-pitch figure.
        </p>
      </div>
    </div>
  )
}
