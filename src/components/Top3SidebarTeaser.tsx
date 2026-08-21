/**
 * src/components/Top3SidebarTeaser.tsx
 *
 * Compact "Top 3 To Watch" teaser for the game page sidebar — visible
 * regardless of which tab is active (unlike the full Top3ForTheSeries
 * breakdown, which only shows up inside the Series tab). Takes the SAME
 * awayTop3/homeTop3 already computed for slotSeriesTab — no new fetch,
 * this is purely a second, smaller view of data that's already there.
 *
 * Shows just the #1 read per team + an edge count, with a jump link down
 * into the full Series tab breakdown.
 */

import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import type { SeriesTop3Result, Top3Batter } from '@/lib/series-matchup'

function leanLabel(score: number): { label: string; color: string } {
  if (score > 0.15) return { label: 'Strong advantage', color: 'text-green-600' }
  if (score > 0.03) return { label: 'Slight edge', color: 'text-green-600' }
  if (score > -0.03) return { label: 'Neutral matchup', color: 'text-stone-600' }
  if (score > -0.15) return { label: 'Slight pitcher edge', color: 'text-orange-500' }
  return { label: 'Tough matchup', color: 'text-red-500' }
}

function TeamRow({ result, teamId, abbr }: { result: SeriesTop3Result; teamId: number; abbr: string }) {
  const top: Top3Batter | undefined = result.batters[0]
  const edgeCount = result.batters.filter((b) => b.series_score > 0.03).length

  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0 border-b border-stone-100 last:border-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogoUrl(teamId)} alt={abbr} className="w-5 h-5 object-contain shrink-0" />
      {top ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(top.player_id)}
            alt={top.player_name}
            className="w-7 h-7 rounded-full object-cover bg-stone-100 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-serif font-bold text-stone-900 truncate">{top.player_name}</p>
            <p className={`text-[9px] font-mono font-bold ${leanLabel(top.series_score).color}`}>
              {leanLabel(top.series_score).label}
            </p>
          </div>
          {edgeCount > 0 && (
            <span className="text-[9px] font-mono font-bold text-orange-600 bg-orange-50 border border-orange-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
              {edgeCount}
            </span>
          )}
        </>
      ) : (
        <p className="text-[10px] font-mono text-stone-400 italic flex-1">Waiting on confirmed starters</p>
      )}
    </div>
  )
}

type Props = {
  awayResult: SeriesTop3Result
  homeResult: SeriesTop3Result
  awayTeamId: number
  homeTeamId: number
  awayAbbr: string
  homeAbbr: string
}

export default function Top3SidebarTeaser({
  awayResult, homeResult, awayTeamId, homeTeamId, awayAbbr, homeAbbr,
}: Props) {
  const hasAnyData = awayResult.batters.length > 0 || homeResult.batters.length > 0
  if (!hasAnyData) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">§ Top 3 For The Series</p>
      <div>
        <TeamRow result={awayResult} teamId={awayTeamId} abbr={awayAbbr} />
        <TeamRow result={homeResult} teamId={homeTeamId} abbr={homeAbbr} />
      </div>
      <a
        href="?tab=series"
        className="mt-3 flex items-center justify-center gap-1 text-[10px] font-mono font-bold uppercase tracking-widest text-orange-600 hover:text-orange-700 transition py-1.5"
      >
        See full breakdown →
      </a>
    </div>
  )
}
