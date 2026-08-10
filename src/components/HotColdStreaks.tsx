'use client'

import Link from 'next/link'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { StreakRow } from '@/lib/hot-cold'

function TeamStreakColumn({ teamName, rows }: { teamName: string; rows: StreakRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold mb-2">{teamName}</p>
        <p className="text-xs font-serif italic text-stone-400">No streaks meeting the sample floor.</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold mb-2">{teamName}</p>
      <div className="space-y-3">
        {rows.map(r => {
          const hot = r.delta > 0
          return (
            <Link
              key={r.playerId}
              href={`/stats/player/${r.playerId}?subject=batter&name=${encodeURIComponent(r.name)}&team=${r.teamAbbr}`}
              className="flex items-center gap-3 hover:bg-stone-50 -mx-2 px-2 py-1.5 rounded transition"
            >
              <img
                src={playerHeadshotUrl(r.playerId, 60)}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif font-semibold text-sm text-stone-900 truncate">{r.name}</span>
                  <span className="text-[9px] font-mono text-stone-400">{r.position}</span>
                </div>
                <div className="text-[10px] font-mono text-stone-400">
                  {r.window}: <span className="text-stone-700 font-bold">{r.windowOps.toFixed(3)}</span> vs season <span className="text-stone-700 font-bold">{r.seasonOps.toFixed(3)}</span> ({r.pa} PA)
                </div>
              </div>
              <span className={`font-mono text-xs font-bold shrink-0 ${hot ? 'text-green-600' : 'text-red-500'}`}>
                {hot ? '📈' : '📉'} {hot ? '+' : ''}{r.delta.toFixed(3)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function HotColdStreaks({
  rows, awayAbbr, homeAbbr, awayTeamName, homeTeamName,
}: {
  rows: StreakRow[]
  awayAbbr: string
  homeAbbr: string
  awayTeamName: string
  homeTeamName: string
}) {
  const awayRows = rows.filter(r => r.teamAbbr === awayAbbr)
  const homeRows = rows.filter(r => r.teamAbbr === homeAbbr)

  if (awayRows.length === 0 && homeRows.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 py-4">No streaks meeting the sample floor (10+ PA in last 7 days, or 18+ in last 14) right now.</p>
  }

  return (
    <div className="p-5 bg-white border border-stone-200 rounded-xl">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-1">Streaks to notice</p>
      <p className="text-[10px] font-mono text-stone-400 mb-4">Last 7 days (or 14, when noted) vs. season OPS — up to 5 per team</p>
      <div className="grid md:grid-cols-2 gap-6">
        <TeamStreakColumn teamName={awayTeamName} rows={awayRows} />
        <TeamStreakColumn teamName={homeTeamName} rows={homeRows} />
      </div>
    </div>
  )
}