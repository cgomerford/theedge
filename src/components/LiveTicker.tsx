import Link from 'next/link'
import { getTodayTickerGames, teamLogoUrl, type TickerGame } from '@/lib/mlb'

// CSS animation for continuous scroll — pauses on hover
const ANIMATION_STYLES = `
@keyframes tickerScroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.ticker-track {
  animation: tickerScroll 30s linear infinite;
  will-change: transform;
}
.ticker-track:hover {
  animation-play-state: paused;
}
`

export default async function LiveTicker() {
  const games = await getTodayTickerGames()

  if (games.length === 0) {
    return (
      <div className="bg-stone-900 text-stone-400 py-3 px-6 text-center text-xs font-mono uppercase tracking-widest">
        No games scheduled today
      </div>
    )
  }

  // Duplicate the games array so the marquee scroll is seamless
  const ticker = [...games, ...games]

  return (
    <div className="bg-stone-900 text-stone-100 overflow-hidden border-b border-stone-800 relative">
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      {/* "MLB Today" label on left */}
      <div className="absolute left-0 top-0 bottom-0 z-10 bg-orange-600 text-white px-4 flex items-center text-[10px] font-mono uppercase tracking-widest font-bold">
        MLB · Today
      </div>

      {/* Scrolling track */}
      <div className="flex ticker-track py-3 pl-32 pr-6 whitespace-nowrap">
        {ticker.map((g, i) => (
          <TickerItem key={`${g.slug}-${i}`} game={g} />
        ))}
      </div>
    </div>
  )
}

function TickerItem({ game }: { game: TickerGame }) {
  const isFinal = game.status === 'final'
  const isLive = game.status === 'live'
  const hasScore = game.awayScore !== null && game.homeScore !== null

  const statusColor =
    isLive ? 'text-yellow-300' :
    isFinal ? 'text-stone-400' :
    'text-orange-400'

  const statusLabel =
    isLive ? '● LIVE' :
    isFinal ? 'FINAL' :
    game.gameTime

  return (
    <Link
      href={`/mlb/${game.slug}`}
      className="inline-flex items-center gap-3 px-5 mr-2 hover:bg-stone-800 transition-colors"
    >
      {/* Away */}
      <span className="inline-flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={teamLogoUrl(game.awayId)}
          alt=""
          className="w-5 h-5 object-contain"
        />
        <span className="font-mono text-sm font-semibold">{game.awayShort.slice(0, 3).toUpperCase()}</span>
        {hasScore && (
          <span className={`font-mono text-sm font-bold ml-1 ${
            isFinal && (game.awayScore ?? 0) > (game.homeScore ?? 0) ? 'text-yellow-300' : ''
          }`}>
            {game.awayScore}
          </span>
        )}
      </span>

      <span className="text-stone-600 text-xs">·</span>

      {/* Home */}
      <span className="inline-flex items-center gap-1.5">
        {hasScore && (
          <span className={`font-mono text-sm font-bold mr-1 ${
            isFinal && (game.homeScore ?? 0) > (game.awayScore ?? 0) ? 'text-yellow-300' : ''
          }`}>
            {game.homeScore}
          </span>
        )}
        <span className="font-mono text-sm font-semibold">{game.homeShort.slice(0, 3).toUpperCase()}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={teamLogoUrl(game.homeId)}
          alt=""
          className="w-5 h-5 object-contain"
        />
      </span>

      {/* Status */}
      <span className={`font-mono text-[10px] uppercase tracking-widest ml-2 ${statusColor}`}>
        {statusLabel}
      </span>
    </Link>
  )
}