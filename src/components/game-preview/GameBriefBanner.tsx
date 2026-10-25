// src/components/game-preview/GameBriefBanner.tsx
//
// Top-of-page banner — matchup, start time and venue. Folds in the old SeriesHeaderBar content
// (Game X of Y + series record) when this game is part of a tracked
// series, rather than showing that as a separate bar further down the
// page — George asked for the series marker to move up here.

type Props = {
  awayAbbr: string
  homeAbbr: string
  gameTimeFormatted: string
  venueName: string
  city: string | null
  series: { gameNumber: number; totalGames: number; record: { away: number; home: number } } | null
}

export default function GameBriefBanner({
  awayAbbr, homeAbbr, gameTimeFormatted, venueName, city, series,
}: Props) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px] font-mono text-stone-600">
        <span className="font-bold text-stone-900">{awayAbbr} @ {homeAbbr}</span>
        <span className="text-stone-300">·</span>
        <span>{gameTimeFormatted}</span>
        <span className="text-stone-300">·</span>
        <span>{venueName}{city ? `, ${city}` : ''}</span>
      </div>

      {series && (
        <div className="flex items-center gap-3">
          <p className="text-[12px] font-mono uppercase tracking-widest text-orange-600 font-bold">
            Game {series.gameNumber} of {series.totalGames}
          </p>
          {(series.record.away > 0 || series.record.home > 0) && (
            <p className="text-[12px] font-mono text-stone-500">
              Series: {awayAbbr} {series.record.away}-{series.record.home} {homeAbbr}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
