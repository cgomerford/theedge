'use client'

import Link from 'next/link'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { SeriesBatterLine } from '@/lib/series-stats'
import PlayerPitchHover from './PlayerPitchHover'

// Link pattern matches StatsExplorer.tsx's player links exactly
// (/stats/player/[id]?subject=batter&name=...&team=...) — same
// destination page, same query convention, no new routing invented.

function StatTable({ abbr, rows, seriesStart, seriesEnd }: { abbr: string; rows: SeriesBatterLine[]; seriesStart: string; seriesEnd: string }) {
  const withAtBats = rows.filter(r => r.ab > 0)
  if (withAtBats.length === 0) return <p className="text-xs font-serif italic text-stone-400 py-2">No batting data yet.</p>
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">{abbr}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100">
            <th className="text-left pb-1.5 text-[9px] font-mono text-stone-400">Player</th>
            <th className="text-right pb-1.5 text-[9px] font-mono text-stone-400">AB</th>
            <th className="text-right pb-1.5 text-[9px] font-mono text-stone-400">H</th>
            <th className="text-right pb-1.5 text-[9px] font-mono text-stone-400">HR</th>
            <th className="text-right pb-1.5 text-[9px] font-mono text-stone-400">RBI</th>
            <th className="text-right pb-1.5 text-[9px] font-mono text-stone-400">AVG</th>
          </tr>
        </thead>
        <tbody>
          {withAtBats.map(r => (
            <tr key={r.playerId} className="border-b border-stone-50 last:border-0">
         <td className="py-1.5">
                <PlayerPitchHover playerId={r.playerId} playerName={r.name} seriesStart={seriesStart} seriesEnd={seriesEnd}>
                  <Link
                    href={`/stats/player/${r.playerId}?subject=batter&name=${encodeURIComponent(r.name)}&team=${abbr}`}
                    className="flex items-center gap-2 hover:text-orange-600 transition"
                  >
                    <img
                      src={playerHeadshotUrl(r.playerId, 60)}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover border border-stone-200 shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_60,h_60/v1/people/${r.playerId}/headshot/milb/current`
                        e.currentTarget.onerror = null
                      }}
                    />
                    <span className="font-serif text-stone-900 truncate">{r.name.split(' ').slice(-1)[0]}</span>
                  </Link>
                </PlayerPitchHover>
              </td>
              <td className="text-right font-mono text-stone-600">{r.ab}</td>
              <td className="text-right font-mono text-stone-600">{r.hits}</td>
              <td className="text-right font-mono text-stone-600">{r.home_runs}</td>
              <td className="text-right font-mono text-stone-600">{r.rbi}</td>
              <td className="text-right font-mono font-bold text-stone-900">{r.avg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export default function SeriesPlayerStats({
  awayAbbr, homeAbbr, awayRows, homeRows, seriesStart, seriesEnd,
}: {
  awayAbbr: string
  homeAbbr: string
  awayRows: SeriesBatterLine[]
  homeRows: SeriesBatterLine[]
  seriesStart: string
  seriesEnd: string
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Player stats this series</p>
      <StatTable abbr={awayAbbr} rows={awayRows} seriesStart={seriesStart} seriesEnd={seriesEnd} />
      <StatTable abbr={homeAbbr} rows={homeRows} seriesStart={seriesStart} seriesEnd={seriesEnd} />
    </div>
  )
}