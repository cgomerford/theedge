import Link from 'next/link'
import type { TopEdge } from './types'
import { slugifyGame, shortName } from '@/lib/mlb'

type Props = {
  edge: TopEdge
  size?: 'default' | 'featured'
}

function tierMeta(tier: string) {
  if (tier === 'strong') {
    return {
      styles: 'text-orange-700 border-orange-200 bg-orange-50',
      text: 'Strong edge',
    }
  }
  if (tier === 'moderate') {
    return {
      styles: 'text-yellow-700 border-yellow-200 bg-yellow-50',
      text: 'Moderate edge',
    }
  }
  return {
    styles: 'text-stone-600 border-stone-200 bg-stone-50',
    text: 'Slight edge',
  }
}

export default function EdgeCard({ edge, size = 'default' }: Props) {
  const { game, pred } = edge
  const winnerTeam =
    pred.predicted_winner === 'home' ? game.teams.home.team : game.teams.away.team
  const winnerShort = shortName(winnerTeam.name)
  const { styles, text } = tierMeta(pred.confidence_tier)
  const time = new Date(game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  if (size === 'featured') {
    return (
      <Link
        href={`/mlb/${slugifyGame(game)}`}
        className="block bg-stone-900 text-stone-100 p-8 md:p-10 border border-stone-800 shadow-lg hover:shadow-xl transition group"
      >
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#fdba74] mb-4">
          Tonight&apos;s top edge
        </div>
        <div className="text-2xl md:text-3xl font-serif font-bold mb-4">
          {shortName(game.teams.away.team.name)}{' '}
          <span className="text-stone-500 font-normal">@</span>{' '}
          {shortName(game.teams.home.team.name)}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span
            className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm ${styles}`}
          >
            {text}
          </span>
          <span className="text-[11px] font-mono text-stone-400">
            favours <span className="font-bold text-white">{winnerShort}</span>
          </span>
        </div>
        {pred.summary && (
          <p className="text-lg text-stone-300 leading-relaxed font-serif italic line-clamp-4 mb-8">
            &ldquo;{pred.summary}&rdquo;
          </p>
        )}
        <div className="flex justify-between items-center text-[10px] font-mono text-stone-500 pt-4 border-t border-stone-700">
          <span>{time}</span>
          <span className="text-[#fdba74] group-hover:text-white transition">Full analysis →</span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/mlb/${slugifyGame(game)}`}
      className="bg-white p-6 rounded-lg border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition group flex flex-col h-full"
    >
      <div className="text-[13px] font-semibold text-stone-900 mb-4 flex items-center gap-2">
        <span>{shortName(game.teams.away.team.name)}</span>
        <span className="text-stone-300 font-normal">@</span>
        <span>{shortName(game.teams.home.team.name)}</span>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm ${styles}`}
        >
          {text}
        </div>
        <div className="text-[10px] font-mono text-stone-500">
          favours <span className="font-bold text-stone-900">{winnerShort}</span>
        </div>
      </div>
      {pred.summary && (
        <p className="text-[13px] text-stone-600 leading-relaxed font-serif italic line-clamp-3 mb-6 flex-1">
          &ldquo;{pred.summary}&rdquo;
        </p>
      )}
      <div className="flex justify-between items-center text-[10px] text-stone-400 font-mono mt-auto pt-4 border-t border-stone-100">
        <span>{time}</span>
        <span className="text-[#ea580c] group-hover:text-stone-900 transition">Full analysis →</span>
      </div>
    </Link>
  )
}