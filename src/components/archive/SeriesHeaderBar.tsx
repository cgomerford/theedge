// src/components/game-preview/SeriesHeaderBar.tsx
//
// "Series Header, Game 1 of 3" bar from the wireframe. Presentational —
// page.tsx works out the game number/total from getSeriesGamesFromDB.

export default function SeriesHeaderBar({
  gameNumber, totalGames, awayAbbr, homeAbbr, seriesRecord,
}: {
  gameNumber: number
  totalGames: number
  awayAbbr: string
  homeAbbr: string
  seriesRecord?: { away: number; home: number }
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-2">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">
        {awayAbbr} @ {homeAbbr} — Game {gameNumber} of {totalGames}
      </p>
      {seriesRecord && (seriesRecord.away > 0 || seriesRecord.home > 0) && (
        <p className="text-[10px] font-mono text-stone-500">
          Series: {awayAbbr} {seriesRecord.away}-{seriesRecord.home} {homeAbbr}
        </p>
      )}
    </div>
  )
}
