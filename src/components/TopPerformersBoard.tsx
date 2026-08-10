'use client'

// src/components/TopPerformersBoard.tsx
//
// Six mini-leaderboards for the Post-Game Report: fastest exit velo,
// highest spin rate, best launch angle, slowest pitch, fastest pitch,
// hardest hit ball. Visually matches the compact NotesCard language used
// in ScoutReportTab (mono labels, colored dot per rank, team-colored
// left border) so the Post-Game Report reads as a sibling of the Scout
// Report rather than a different product.

import { playerHeadshotUrl } from '@/lib/mlb'
import type { TopPerformersBoardData, TopPerformerEntry } from '@/lib/postgame'

type TeamColorMap = Record<string, string>

function LeaderRow({ entry, rank, teamColors }: { entry: TopPerformerEntry; rank: number; teamColors: TeamColorMap }) {
  const color = teamColors[entry.teamAbbr] ?? '#a8a29e'
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-stone-50 last:border-0">
      <span
        className="w-4 text-right text-stone-300 font-bold leading-none flex-shrink-0"
        style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem' }}
      >
        {rank}
      </span>
      <img
        src={playerHeadshotUrl(entry.playerId, 60)}
        alt={entry.playerName}
        className="w-7 h-7 rounded-full object-cover border border-stone-200 flex-shrink-0 bg-white"
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-[12px] font-semibold text-stone-800 truncate">{entry.playerName}</span>
        </div>
        <p className="font-mono text-[9.5px] text-stone-400 truncate">{entry.context}</p>
      </div>
      <span className="font-mono text-[12px] font-bold text-stone-900 flex-shrink-0">{entry.displayValue}</span>
    </div>
  )
}

function LeaderboardCard({
  title, entries, teamColors, accent = '#FF5722',
}: {
  title: string
  entries: TopPerformerEntry[]
  teamColors: TeamColorMap
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-stone-500">{title}</span>
      </div>
      <div>
        {entries.length > 0 ? (
          entries.map((e, i) => <LeaderRow key={`${e.playerId}-${i}`} entry={e} rank={i + 1} teamColors={teamColors} />)
        ) : (
          <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No tracked data</div>
        )}
      </div>
    </div>
  )
}

type Props = {
  data: TopPerformersBoardData
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}

export default function TopPerformersBoard({ data, awayAbbr, homeAbbr, awayColor, homeColor }: Props) {
  const teamColors: TeamColorMap = { [awayAbbr]: awayColor, [homeAbbr]: homeColor }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Top performers</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        <LeaderboardCard title="Fastest exit velo" entries={data.fastestExitVelo} teamColors={teamColors} />
        <LeaderboardCard title="Hardest hit ball" entries={data.hardestHitBall} teamColors={teamColors} />
        <LeaderboardCard title="Best launch angle" entries={data.bestLaunchAngle} teamColors={teamColors} />
        <LeaderboardCard title="Highest spin rate" entries={data.highestSpinRate} teamColors={teamColors} />
        <LeaderboardCard title="Fastest pitch" entries={data.fastestPitch} teamColors={teamColors} />
        <LeaderboardCard title="Slowest pitch" entries={data.slowestPitch} teamColors={teamColors} />
      </div>
    </div>
  )
}