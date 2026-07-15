'use client'

// Per-batter career history vs tonight's probable starter, for all 9 lineup
// spots at once. Same BatterVsPitcher shape BatterDetailView's "vs Pitcher"
// tab already fetches one player at a time (/api/batter-stats?type=vs) —
// this reuses the exact same data, just batched for a whole lineup.
//
// NOTE: no RBI column. BatterVsPitcher (src/lib/batter-stats.ts) doesn't
// track RBI vs a specific pitcher — only ab/hits/home_runs/strikeouts/
// avg/obp/slg/ops. Not shown rather than invented.

import type { LineupBatter } from '@/lib/lineups'
import type { BatterVsPitcher } from '@/lib/batter-stats'

type Row = { batter: LineupBatter; vs: BatterVsPitcher | null }

export default function MatchupsTable({
  teamAbbr, rows, pitcherName,
}: {
  teamAbbr: string
  rows: Row[]
  pitcherName: string | null
}) {
  if (!pitcherName) {
    return (
      <div className="p-5 bg-white border border-stone-200 rounded-xl">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-2">{teamAbbr}</div>
        <p className="text-sm font-serif italic text-stone-400">Pending opposing pitcher info.</p>
      </div>
    )
  }

  const withHistory = rows.filter(r => r.vs && r.vs.ab >= 1)

  return (
    <div className="p-5 bg-white border border-stone-200 rounded-xl overflow-x-auto">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">{teamAbbr} vs {pitcherName}</div>
      {withHistory.length === 0 ? (
        <p className="text-sm font-serif italic text-stone-400">No career history vs this pitcher yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Player</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">HR</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">AB</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">AVG</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">OPS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ batter, vs }) => (
              <tr key={batter.player_id} className="border-b border-stone-50 last:border-0">
                <td className="py-2 pr-3">
                  <span className="font-serif font-semibold text-stone-900">{batter.player_name.split(' ').slice(-1)[0]}</span>
                  <span className="text-[10px] font-mono text-stone-400 ml-1.5">{batter.position}</span>
                </td>
                <td className="text-right py-2 px-2 font-mono text-xs text-stone-700">{vs && vs.ab > 0 ? vs.home_runs : '—'}</td>
                <td className="text-right py-2 px-2 font-mono text-xs text-stone-700">{vs && vs.ab > 0 ? vs.ab : '—'}</td>
                <td className="text-right py-2 px-2 font-mono text-xs text-stone-700">{vs && vs.ab > 0 ? vs.avg : '—'}</td>
                <td className="text-right py-2 px-2 font-mono text-xs font-bold text-stone-900">{vs && vs.ab > 0 ? vs.ops : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}