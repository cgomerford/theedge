// src/components/LiveGameCard.tsx
//
// One out-of-town scoreboard card. For LIVE games it polls MLB's real
// live-feed endpoint (/api/v1.1/game/{gamePk}/feed/live — the same
// undocumented-but-proven statsapi.mlb.com surface used elsewhere in this
// app) every 15s and renders the real base/out state, the real current
// pitcher/batter with their real in-game line, and the real last-play
// description. One call gets all of it — linescore.offense/defense for
// runners+pitcher+batter, boxscore.teams.*.players for today's in-game
// stat line, and plays.allPlays for the last completed play's summary.
//
// Polling self-stops the moment the feed itself reports the game is no
// longer Live, rather than trusting the page's server-rendered status
// (which only refreshes on the page's own 60s revalidate).

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { slugifyGame, shortName, teamLogoUrl, type MLBGame } from '@/lib/mlb'

export interface ExtendedMLBGame extends MLBGame {
  teams: {
    away: MLBGame['teams']['away'] & { score?: number }
    home: MLBGame['teams']['home'] & { score?: number }
  }
  linescore?: {
    currentInningOrdinal?: string
    inningState?: string
    teams?: {
      away?: { hits?: number; errors?: number }
      home?: { hits?: number; errors?: number }
    }
  }
}

type LiveDetail = {
  outs: number
  balls: number
  strikes: number
  first: boolean
  second: boolean
  third: boolean
  pitcherName?: string
  pitcherToday?: string
  pitcherEra?: string
  batterName?: string
  batterToday?: string
  summary?: string
  isLive: boolean
  awayRuns: number
  homeRuns: number
}

type RawPerson = { id?: number; fullName?: string }
type RawPlayer = {
  stats?: { batting?: { summary?: string }; pitching?: { summary?: string } }
  seasonStats?: { pitching?: { era?: string } }
}
type RawPlay = { about?: { isComplete?: boolean }; result?: { description?: string } }

function findPlayer(box: unknown, personId: number | undefined): RawPlayer | undefined {
  if (!personId || !box || typeof box !== 'object') return undefined
  const key = `ID${personId}`
  const teams = (box as { teams?: Record<string, { players?: Record<string, RawPlayer> }> }).teams
  return teams?.home?.players?.[key] ?? teams?.away?.players?.[key]
}

async function fetchLiveDetail(gamePk: number): Promise<LiveDetail | null> {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
    if (!res.ok) return null
    const data = await res.json()
    const ls = data?.liveData?.linescore
    if (!ls) return null

    const offense = (ls.offense ?? {}) as { batter?: RawPerson; pitcher?: RawPerson; first?: RawPerson; second?: RawPerson; third?: RawPerson }
    const defense = (ls.defense ?? {}) as { pitcher?: RawPerson }
    const box = data.liveData?.boxscore
    const pitcherBox = findPlayer(box, defense.pitcher?.id)
    const batterBox = findPlayer(box, offense.batter?.id)

    const allPlays: RawPlay[] = data.liveData?.plays?.allPlays ?? []
    const completed = allPlays.filter(p => p.about?.isComplete)
    const lastPlay = completed[completed.length - 1]

    return {
      outs: ls.outs ?? 0,
      balls: ls.balls ?? 0,
      strikes: ls.strikes ?? 0,
      first: !!offense.first,
      second: !!offense.second,
      third: !!offense.third,
      pitcherName: defense.pitcher?.fullName,
      pitcherToday: pitcherBox?.stats?.pitching?.summary,
      pitcherEra: pitcherBox?.seasonStats?.pitching?.era,
      batterName: offense.batter?.fullName,
      batterToday: batterBox?.stats?.batting?.summary,
      summary: lastPlay?.result?.description,
      isLive: data.gameData?.status?.abstractGameState === 'Live',
      awayRuns: ls.teams?.away?.runs ?? 0,
      homeRuns: ls.teams?.home?.runs ?? 0,
    }
  } catch {
    return null
  }
}

function BasesDiamond({ first, second, third }: { first: boolean; second: boolean; third: boolean }) {
  const on = 'rgba(234,88,12,0.95)'
  const off = 'rgba(255,255,255,0.10)'
  const base = (occupied: boolean, style: React.CSSProperties) => (
    <div
      style={{
        position: 'absolute',
        width: 8, height: 8,
        background: occupied ? on : off,
        border: `1px solid ${occupied ? on : 'rgba(255,255,255,0.25)'}`,
        transform: `rotate(45deg) scale(${occupied ? 1.15 : 1})`,
        transition: 'background 0.35s ease, border-color 0.35s ease, transform 0.35s cubic-bezier(.34,1.56,.64,1)',
        boxShadow: occupied ? '0 0 6px rgba(234,88,12,0.6)' : 'none',
        ...style,
      }}
    />
  )
  return (
    <div style={{ position: 'relative', width: 26, height: 22 }}>
      {base(second, { top: 0, left: 9 })}
      {base(third, { top: 11, left: 0 })}
      {base(first, { top: 11, left: 18 })}
    </div>
  )
}

function OutsPips({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 999,
            background: i < outs ? '#ea580c' : 'rgba(255,255,255,0.15)',
            transition: 'background 0.3s ease, transform 0.3s ease',
            transform: i < outs ? 'scale(1.1)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  )
}

export default function LiveGameCard({ game }: { game: ExtendedMLBGame }) {
  const awayTeam = game.teams.away
  const homeTeam = game.teams.home
  const initialLive = game.status.abstractGameState === 'Live'
  const isFinal = game.status.abstractGameState === 'Final'

  const [detail, setDetail] = useState<LiveDetail | null>(null)
  const [polling, setPolling] = useState(initialLive)
  const [awayR, setAwayR] = useState(awayTeam.score ?? 0)
  const [homeR, setHomeR] = useState(homeTeam.score ?? 0)
  const [flash, setFlash] = useState<'away' | 'home' | null>(null)
  const prevScores = useRef({ away: awayTeam.score ?? 0, home: homeTeam.score ?? 0 })

  useEffect(() => {
    if (!polling) return
    let cancelled = false

    async function tick() {
      const d = await fetchLiveDetail(game.gamePk)
      if (cancelled || !d) return
      setDetail(d)
      if (!d.isLive) setPolling(false)

      if (d.awayRuns !== prevScores.current.away) {
        prevScores.current.away = d.awayRuns
        setAwayR(d.awayRuns)
        setFlash('away')
        setTimeout(() => setFlash(f => (f === 'away' ? null : f)), 900)
      }
      if (d.homeRuns !== prevScores.current.home) {
        prevScores.current.home = d.homeRuns
        setHomeR(d.homeRuns)
        setFlash('home')
        setTimeout(() => setFlash(f => (f === 'home' ? null : f)), 900)
      }
    }

    tick()
    const t = setInterval(tick, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [game.gamePk, polling])

  const awayH = game.linescore?.teams?.away?.hits ?? '-'
  const homeH = game.linescore?.teams?.home?.hits ?? '-'
  const awayE = game.linescore?.teams?.away?.errors ?? '-'
  const homeE = game.linescore?.teams?.home?.errors ?? '-'

  return (
    <Link
      href={`/mlb/${slugifyGame(game)}`}
      className="block bg-[#111110] border border-[#2A2A28] rounded-xl p-5 hover:border-stone-500 hover:shadow-lg transition group relative overflow-hidden live-card"
    >
      {initialLive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#ea580c] live-edge" />}

      <div className="flex justify-between items-center mb-4">
        <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${initialLive ? 'text-[#ea580c]' : 'text-stone-400'}`}>
          {initialLive ? `${game.linescore?.inningState || ''} ${game.linescore?.currentInningOrdinal || 'Live'}` :
           isFinal ? 'Final' :
           formatGameTime(game.gameDate)}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-600">
          View Matchup →
        </span>
      </div>

      <table className="w-full text-left font-mono">
        <thead>
          <tr className="text-[10px] border-b border-[#2A2A28]">
            <th className="pb-2 font-normal text-stone-500 w-full uppercase tracking-widest">Team</th>
            <th className="pb-2 font-normal px-2 text-center text-stone-400">R</th>
            <th className="pb-2 font-normal px-2 text-center text-stone-600">H</th>
            <th className="pb-2 font-normal pl-2 text-center text-stone-600">E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#2A2A28]/50">
            <td className="py-2.5 flex items-center gap-2.5">
              <img src={teamLogoUrl(awayTeam.team.id)} alt={awayTeam.team.name} className="w-5 h-5 object-contain" />
              <span className="text-white font-bold text-sm tracking-wide">{shortName(awayTeam.team.name)}</span>
            </td>
            <td className={`py-2.5 px-2 text-center text-white font-bold text-sm score-cell${flash === 'away' ? ' score-flash' : ''}`}>{awayR}</td>
            <td className="py-2.5 px-2 text-center text-stone-400 text-xs">{awayH}</td>
            <td className="py-2.5 pl-2 text-center text-stone-500 text-xs">{awayE}</td>
          </tr>
          <tr>
            <td className="py-2.5 flex items-center gap-2.5">
              <img src={teamLogoUrl(homeTeam.team.id)} alt={homeTeam.team.name} className="w-5 h-5 object-contain" />
              <span className="text-white font-bold text-sm tracking-wide">{shortName(homeTeam.team.name)}</span>
            </td>
            <td className={`py-2.5 px-2 text-center text-white font-bold text-sm score-cell${flash === 'home' ? ' score-flash' : ''}`}>{homeR}</td>
            <td className="py-2.5 px-2 text-center text-stone-400 text-xs">{homeH}</td>
            <td className="py-2.5 pl-2 text-center text-stone-500 text-xs">{homeE}</td>
          </tr>
        </tbody>
      </table>

      {initialLive && detail && (
        <div className="mt-4 pt-4 border-t border-[#2A2A28] live-detail-enter">
          <div className="flex items-center justify-between mb-3">
            <BasesDiamond first={detail.first} second={detail.second} third={detail.third} />
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-stone-400">{detail.balls}-{detail.strikes}</span>
              <OutsPips outs={detail.outs} />
              <span className="font-mono text-[8px] text-stone-500 uppercase tracking-widest">{detail.outs === 1 ? 'out' : 'outs'}</span>
            </div>
          </div>

          {(detail.pitcherName || detail.batterName) && (
            <div className="space-y-1 mb-2">
              {detail.pitcherName && (
                <div className="flex items-baseline gap-1.5 text-[10.5px]">
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[#ea580c] font-bold shrink-0">P</span>
                  <span className="text-stone-200 font-semibold truncate">{detail.pitcherName}</span>
                  <span className="font-mono text-[9px] text-stone-500 truncate">
                    {detail.pitcherToday}{detail.pitcherEra ? ` · ${detail.pitcherEra} ERA` : ''}
                  </span>
                </div>
              )}
              {detail.batterName && (
                <div className="flex items-baseline gap-1.5 text-[10.5px]">
                  <span className="font-mono text-[8px] uppercase tracking-widest text-[#ea580c] font-bold shrink-0">AB</span>
                  <span className="text-stone-200 font-semibold truncate">{detail.batterName}</span>
                  <span className="font-mono text-[9px] text-stone-500 truncate">{detail.batterToday}</span>
                </div>
              )}
            </div>
          )}

          {detail.summary && (
            <p key={detail.summary} className="text-[10px] text-stone-400 italic leading-snug summary-fade">
              {detail.summary}
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .live-edge {
          animation: edgePulse 2.2s ease-in-out infinite;
        }
        @keyframes edgePulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .score-cell { transition: color 0.2s ease; }
        .score-flash {
          animation: scoreFlash 0.9s ease-out;
          border-radius: 4px;
        }
        @keyframes scoreFlash {
          0% { background-color: rgba(234,88,12,0.55); color: #fff; }
          100% { background-color: transparent; }
        }
        .live-detail-enter {
          animation: detailIn 0.4s ease-out;
        }
        @keyframes detailIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .summary-fade {
          animation: summaryIn 0.35s ease-out;
        }
        @keyframes summaryIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </Link>
  )
}

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    }) + ' ET'
  } catch {
    return '—'
  }
}
