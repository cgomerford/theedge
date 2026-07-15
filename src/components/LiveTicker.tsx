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

// Was bg-stone-900 — same near-black as the game header directly below it,
  // with no real visual break between them. Moved to the light page surface
  // so this reads as a quiet utility strip, not a second dark hero
  // (2026-07-13, third round of "still too much black" feedback).
  if (games.length === 0) {
    return (
      <div className="bg-[#FAF8F3] text-stone-400 py-2.5 px-6 text-center text-xs font-mono uppercase tracking-widest border-b border-stone-200">
        No games scheduled today
      </div>
    )
  }

  // Duplicate the games array so the marquee scroll is seamless
  const ticker = [...games, ...games]

  return (
<div className="bg-[#FAF8F3] text-stone-900 overflow-hidden border-b border-stone-200">
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      {/* Inner max-w-6xl wrapper — was `absolute left-0`, pinned to the
          literal browser edge regardless of viewport width, while every
          other section on the page aligns to a centered max-w container.
          On anything wider than ~1152px the ticker badge sat further left
          than the game header below it. This ties them to the same edge
          (2026-07-13). Outer bg-stone-900 stays full-bleed on purpose —
          only the content inside needs to align, not the background. */}
      <div className="max-w-6xl mx-auto relative">
     <div className="absolute left-4 top-0 bottom-0 z-10 bg-[#1A1A1A] text-white px-4 flex items-center text-[10px] font-mono uppercase tracking-widest font-bold">
          MLB · Today
        </div>

        <div className="flex ticker-track py-3 pl-36 pr-6 whitespace-nowrap">
          {ticker.map((g, i) => (
            <TickerItem key={`${g.slug}-${i}`} game={g} />
          ))}
        </div>
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
      className="inline-flex items-center gap-3 px-5 mr-2 hover:bg-stone-100 transition-colors"
    >
      {/* Away */}
      <span className="inline-flex items-center gap-1.5">
        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamLogoUrl(game.awayId)}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        </div>
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
       <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamLogoUrl(game.homeId)}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </span>

      {/* Status */}
      <span className={`font-mono text-[10px] uppercase tracking-widest ml-2 ${statusColor}`}>
        {statusLabel}
      </span>
    </Link>
  )
}