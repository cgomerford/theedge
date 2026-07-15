'use client'

import Link from 'next/link'

type Row = {
  gameNumber: number
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
  isFinal: boolean
  predicted_winner: string | null
  confidence_tier: string | null
  gameSlug: string
}

export default function SeriesPredictions({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Model predictions</p>
      <div className="divide-y divide-stone-50">
        {rows.map(r => {
          const actualWinner = r.isFinal && r.awayScore !== null && r.homeScore !== null
            ? (r.awayScore > r.homeScore ? r.awayAbbr : r.homeScore > r.awayScore ? r.homeAbbr : null)
            : null
          const correct = r.predicted_winner && actualWinner ? r.predicted_winner === actualWinner : null
          return (
           <Link key={r.gameNumber} href={`/mlb/${r.gameSlug}`} className="flex items-center justify-between py-2.5 gap-3 hover:bg-stone-50 transition -mx-2 px-2 rounded">
              <span className="text-[10px] font-mono text-stone-400 w-10 shrink-0">G{r.gameNumber}</span>
              {r.predicted_winner ? (
                <span className="text-xs font-mono text-stone-700 flex-1">
                  Model: <span className="font-bold">{r.predicted_winner}</span>
                  {r.confidence_tier && <span className="text-stone-400 ml-1">({r.confidence_tier})</span>}
                </span>
              ) : (
                <span className="text-xs font-serif italic text-stone-400 flex-1">No prediction on record</span>
              )}
              {correct !== null && (
                <span className={`text-[10px] font-mono font-bold shrink-0 ${correct ? 'text-green-600' : 'text-red-500'}`}>
                  {correct ? 'Correct' : 'Incorrect'}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}