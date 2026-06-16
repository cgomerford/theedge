'use client'

/**
 * src/components/GamePageShell.tsx
 */

import { useState } from 'react'
import Link from 'next/link'
import LiveScoreboard from './LiveScoreboard'

export type GamePageTab = 'read' | 'teams' | 'pitching' | 'batting' | 'bullpen' | 'gmlab' | 'fantasy'

type LiveScoreData = {
  awayRuns: number
  homeRuns: number
  awayHits?: number
  homeHits?: number
  awayErrors?: number
  homeErrors?: number
  inningState?: string
  currentInning?: string
  isLive: boolean
  isFinal: boolean
}

type GamePageShellProps = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  homeLogoUrl?: string
  awayLogoUrl?: string
  gameTime?: string
  venue?: string
  isPro: boolean
  isSignedIn?: boolean
  liveScore?: LiveScoreData   // ← new optional prop

  slotRead: React.ReactNode
  slotTeams: React.ReactNode
  slotPitching: React.ReactNode
  slotBullpen: React.ReactNode
  slotGmlab: React.ReactNode
  slotFantasy: React.ReactNode
  slotBatting?: React.ReactNode
}

const TABS = [
  { key: 'read'     as const, label: 'The Read',  shortLabel: 'Read',    proOnly: false },
  { key: 'teams'    as const, label: 'Teams',     shortLabel: 'Teams',   proOnly: false },
  { key: 'pitching' as const, label: 'Pitching',  shortLabel: 'Pitching', proOnly: true },
    { key: 'bullpen' as const, label: 'Bullpen',   shortLabel: 'Pen',     proOnly: true  },
  { key: 'batting'  as const, label: 'Batting',   shortLabel: 'Batting', proOnly: true  },
  { key: 'gmlab'    as const, label: 'GM Lab',    shortLabel: 'Lab',     proOnly: true  },
  { key: 'fantasy'  as const, label: 'Fantasy',   shortLabel: 'Fantasy', proOnly: true  },
  
]

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr,
  homeLogoUrl, awayLogoUrl,
  gameTime, venue, isPro, isSignedIn = false,
  liveScore,
slotRead, slotTeams, slotPitching, slotBullpen, slotGmlab, slotFantasy, slotBatting,
}: GamePageShellProps) {
  const [activeTab, setActiveTab] = useState<GamePageTab>('read')

  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── STICKY HEADER ── */}
     <div className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">

        {/* Logo vs logo strip */}
        <div className="flex items-center px-3 py-2 max-w-4xl mx-auto gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {awayLogoUrl && (
              <img src={awayLogoUrl} alt={awayAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
            )}
            <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{awayAbbr}</span>
          </div>

          <div className="flex flex-col items-center shrink-0 px-1">
            {/* Show live score in header if game is live/final */}
            {liveScore && (liveScore.isLive || liveScore.isFinal) ? (
              <div className="flex items-center gap-2">
                <span className={`text-lg font-mono font-black leading-none ${liveScore.awayRuns > liveScore.homeRuns ? 'text-stone-900' : 'text-stone-400'}`}>
                  {liveScore.awayRuns}
                </span>
                <span className="text-stone-300 font-mono text-xs">–</span>
                <span className={`text-lg font-mono font-black leading-none ${liveScore.homeRuns > liveScore.awayRuns ? 'text-stone-900' : 'text-stone-400'}`}>
                  {liveScore.homeRuns}
                </span>
              </div>
            ) : (
              <span className="text-[11px] font-serif italic text-stone-400 leading-none">at</span>
            )}
            <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5 whitespace-nowrap">
              {liveScore?.isLive
                ? liveScore.currentInning ?? 'Live'
                : liveScore?.isFinal
                ? 'Final'
                : gameTime ?? ''}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{homeAbbr}</span>
            {homeLogoUrl && (
              <img src={homeLogoUrl} alt={homeAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
            )}
          </div>

          <div className="ml-2 shrink-0">
            {isPro ? (
              <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                ⊕ Pro
              </span>
            ) : (
              <Link
                href={isSignedIn ? '/pricing' : '/signup'}
                className="text-[9px] font-mono font-bold tracking-widest uppercase text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition whitespace-nowrap"
              >
                {isSignedIn ? 'Upgrade' : 'Sign up'}
              </Link>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto scrollbar-hide max-w-4xl mx-auto border-t border-stone-100">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const isLocked = tab.proOnly && !isPro
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  shrink-0 px-4 py-3 text-[11px] font-mono font-bold uppercase tracking-wider
                  transition-colors border-b-2 whitespace-nowrap
                  ${isActive
                    ? 'text-orange-600 border-orange-600'
                    : isLocked
                      ? 'text-stone-300 border-transparent hover:text-stone-400'
                      : 'text-stone-500 border-transparent hover:text-stone-800'
                  }
                `}
              >
                <span className="sm:hidden">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.proOnly && (
                  <span className="ml-1 text-[8px]">{isLocked ? '🔒' : '⊕'}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── LIVE SCOREBOARD — shown below sticky header when live/final ── */}
      {liveScore && (liveScore.isLive || liveScore.isFinal) && (
        <LiveScoreboard
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          awayAbbr={awayAbbr}
          homeAbbr={homeAbbr}
          awayLogoUrl={awayLogoUrl ?? ''}
          homeLogoUrl={homeLogoUrl ?? ''}
          awayRuns={liveScore.awayRuns}
          homeRuns={liveScore.homeRuns}
          awayHits={liveScore.awayHits}
          homeHits={liveScore.homeHits}
          awayErrors={liveScore.awayErrors}
          homeErrors={liveScore.homeErrors}
          inningState={liveScore.inningState}
          currentInning={liveScore.currentInning}
          isLive={liveScore.isLive}
          isFinal={liveScore.isFinal}
          gameTime={gameTime}
        />
      )}

      {/* ── TAB CONTENT ── */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'read' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotRead}</div>
        )}
        {activeTab === 'teams' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotTeams}</div>
        )}
        {activeTab === 'pitching' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotPitching}</div>
        )}
        {activeTab === 'gmlab' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {isPro ? slotGmlab : (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">⊕ GM Lab</div>
                <h2 className="font-serif font-light text-4xl text-stone-900 mb-3">Coming soon<span className="text-orange-600">.</span></h2>
                <p className="text-stone-500 font-serif italic text-base max-w-sm leading-relaxed mb-8">
                  Rebuilding from the ground up — deeper analysis, player-level intelligence, built for decisions not just data.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {['Player-level fantasy ratings', 'Regression alarms & FIP vs ERA flags', 'Bullpen availability matrix', 'Front Office Memo'].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-left bg-stone-100 rounded-lg px-4 py-2.5">
                      <span className="text-orange-400 text-xs">◎</span>
                      <span className="text-[11px] font-mono text-stone-600">{item}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-8">Launching in days, not weeks</p>
              </div>
            )}
          </div>
        )}
  {activeTab === 'bullpen' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotBullpen}</div>
        )}
        {activeTab === 'fantasy' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotFantasy}</div>
        )}
        {activeTab === 'batting' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotBatting}</div>
        )}
      </div>
    </div>
  )
}