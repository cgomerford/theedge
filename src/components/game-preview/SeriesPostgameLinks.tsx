// src/components/game-preview/SeriesPostgameLinks.tsx
//
// "Postgame reports of the Series So Far" box from the wireframe —
// presentational, page.tsx builds `rows` from getSeriesGamesFromDB.

import Link from 'next/link'

type Row = {
  gameNumber: number
  slug: string
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
}

export default function SeriesPostgameLinks({ rows }: { rows: Row[] }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Postgame reports — this series</p>
      {rows.length === 0 ? (
        <p className="text-xs font-sans italic text-stone-400 py-2">No completed games in this series yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {rows.map(r => (
            <Link
              key={r.gameNumber}
              href={`/mlb/${r.slug}/postgame`}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 px-3 py-2 hover:border-orange-300 hover:bg-orange-50/40 transition"
            >
              <span className="text-[10px] font-mono text-stone-400 shrink-0">G{r.gameNumber}</span>
              <span className="text-xs font-mono text-stone-700 truncate">{r.awayAbbr} {r.awayScore} – {r.homeScore} {r.homeAbbr}</span>
              <span className="text-[9px] font-mono text-orange-600 shrink-0">Recap →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
