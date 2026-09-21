'use client'

// src/components/SportLiveTicker.tsx
//
// Sport-switchable version of LiveTicker: receives BOTH pre-fetched arrays
// as props (matching the "no client-side fetching" convention already used
// by TradingFloorBoard) and toggles which one is shown. The page (server
// component) fetches MLB via getTodayTickerGames() and NFL via
// getNflTickerGames(season, week) and passes both down — this component
// does no fetching of its own.
//
// Visual/animation approach matches the existing LiveTicker (seamless
// marquee via duplicated array + CSS keyframe, pause on hover) so the
// homepage doesn't grow a second, differently-behaved ticker.

import Link from 'next/link'
import { useState } from 'react'
import type { TickerGame } from '@/lib/mlb'
import { teamLogoUrl } from '@/lib/mlb'
import type { NflTickerGame } from '@/lib/nfl-ticker'

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

type Sport = 'mlb' | 'nfl'

// One normalized shape both sports render through — built by the two
// mappers below, never by inventing fields either data source lacks.
type Row = {
  key: string
  href: string
  awayAbbr: string
  homeAbbr: string
  awayLogo: string
  homeLogo: string
  awayScore: number | null
  homeScore: number | null
  status: 'scheduled' | 'live' | 'final'
  statusLabel: string
}

function fromMlb(g: TickerGame, i: number): Row {
  const isFinal = g.status === 'final'
  const isLive = g.status === 'live'
  return {
    key: `mlb-${g.slug}-${i}`,
    href: `/mlb/${g.slug}`,
    awayAbbr: g.awayShort.slice(0, 3).toUpperCase(),
    homeAbbr: g.homeShort.slice(0, 3).toUpperCase(),
    awayLogo: teamLogoUrl(g.awayId),
    homeLogo: teamLogoUrl(g.homeId),
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    status: isLive ? 'live' : isFinal ? 'final' : 'scheduled',
    statusLabel: isLive ? '● LIVE' : isFinal ? 'FINAL' : g.gameTime,
  }
}

function fromNfl(g: NflTickerGame, i: number): Row {
  return {
    key: `nfl-${g.slug}-${i}`,
    href: `/nfl/${g.slug}`,
    awayAbbr: g.awayAbbr,
    homeAbbr: g.homeAbbr,
    awayLogo: g.awayLogo,
    homeLogo: g.homeLogo,
    awayScore: g.awayScore,
    homeScore: g.homeScore,
    status: g.status,
    statusLabel: g.status === 'live' ? '● LIVE' : g.status === 'final' ? 'FINAL' : g.statusDisplay,
  }
}

function TickerRow({ row }: { row: Row }) {
  const hasScore = row.awayScore !== null && row.homeScore !== null
  const statusColor =
    row.status === 'live' ? 'text-yellow-300' :
    row.status === 'final' ? 'text-stone-400' :
    'text-orange-400'

  return (
    <Link href={row.href} className="inline-flex items-center gap-3 px-5 mr-2 hover:bg-stone-100 transition-colors">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.awayLogo} alt="" className="max-w-full max-h-full object-contain" />
        </span>
        <span className="font-mono text-sm font-semibold">{row.awayAbbr}</span>
        {hasScore && (
          <span className={`font-mono text-sm font-bold ml-1 ${row.status === 'final' && (row.awayScore ?? 0) > (row.homeScore ?? 0) ? 'text-yellow-300' : ''}`}>
            {row.awayScore}
          </span>
        )}
      </span>

      <span className="text-stone-600 text-xs">·</span>

      <span className="inline-flex items-center gap-1.5">
        {hasScore && (
          <span className={`font-mono text-sm font-bold mr-1 ${row.status === 'final' && (row.homeScore ?? 0) > (row.awayScore ?? 0) ? 'text-yellow-300' : ''}`}>
            {row.homeScore}
          </span>
        )}
        <span className="font-mono text-sm font-semibold">{row.homeAbbr}</span>
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.homeLogo} alt="" className="max-w-full max-h-full object-contain" />
        </span>
      </span>

      <span className={`font-mono text-[10px] uppercase tracking-widest ml-2 ${statusColor}`}>
        {row.statusLabel}
      </span>
    </Link>
  )
}

export default function SportLiveTicker({
  mlbGames,
  nflGames,
  defaultSport = 'mlb',
}: {
  mlbGames: TickerGame[]
  nflGames: NflTickerGame[]
  /** which tab opens first; the NFL pages pass 'nfl' */
  defaultSport?: Sport
}) {
  const [sport, setSport] = useState<Sport>(defaultSport)

  const rows: Row[] =
    sport === 'mlb' ? mlbGames.map(fromMlb) : nflGames.map(fromNfl)

  if (mlbGames.length === 0 && nflGames.length === 0) {
    return (
      <div className="bg-[#FAF8F3] text-stone-400 py-2.5 px-6 text-center text-xs font-mono uppercase tracking-widest border-b border-stone-200">
        No games scheduled today
      </div>
    )
  }

  const track = [...rows, ...rows] // duplicated for seamless marquee, same as LiveTicker

  return (
    <div className="bg-[#FAF8F3] text-stone-900 overflow-hidden border-b border-stone-200">
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
      <div className="max-w-6xl mx-auto relative">
        <div className="absolute left-4 top-0 bottom-0 z-10 flex items-center gap-1">
          <button
            onClick={() => setSport('mlb')}
            className={`px-3 h-full text-[10px] font-mono uppercase tracking-widest font-bold transition-colors ${sport === 'mlb' ? 'bg-[#1A1A1A] text-white' : 'bg-transparent text-stone-400'}`}
          >
            MLB
          </button>
          <button
            onClick={() => setSport('nfl')}
            className={`px-3 h-full text-[10px] font-mono uppercase tracking-widest font-bold transition-colors ${sport === 'nfl' ? 'bg-[#1A1A1A] text-white' : 'bg-transparent text-stone-400'}`}
          >
            NFL
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="py-3 pl-40 pr-6 text-xs font-mono uppercase tracking-widest text-stone-400">
            No {sport.toUpperCase()} games today
          </div>
        ) : (
          <div className="flex ticker-track py-3 pl-40 pr-6 whitespace-nowrap" key={sport}>
            {track.map((row, i) => (
              <TickerRow key={`${row.key}-${i}`} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
