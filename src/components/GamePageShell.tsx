'use client'

/**
 * src/components/GamePageShell.tsx
 *
 * Redesigned shell — 4 tabs: The Read · Lineups · Pitching · Teams
 * Brand tokens: Cream #FAF8F3 · Orange #FF5722 · Yellow #FDE047 · Stone Black #1A1A1A
 * Fonts: Fraunces (serif display) · Bebas Neue (display) · JetBrains Mono (data)
 */

import { useState } from 'react'

export type GamePageTab = 'read' | 'lineups' | 'pitching' | 'teams'

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
  liveScore?: LiveScoreData

  slotSeries?: React.ReactNode
  slotRead: React.ReactNode
  slotLineups?: React.ReactNode
  slotPitching?: React.ReactNode
  slotTeams?: React.ReactNode
}
// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { key: GamePageTab; label: string; proOnly: boolean }[] = [
  { key: 'read',     label: 'The Read',  proOnly: false },
  { key: 'lineups',  label: 'Lineups',   proOnly: false },
  { key: 'pitching', label: 'Pitching',  proOnly: true  },
  { key: 'teams',    label: 'Teams',     proOnly: false },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr,
  homeLogoUrl, awayLogoUrl,
  gameTime, venue, isPro, isSignedIn = false,
  liveScore,
  slotSeries,
  slotRead, slotLineups, slotPitching, slotTeams,
}: GamePageShellProps) {
  const [activeTab, setActiveTab] = useState<GamePageTab>('read')

  const isLive  = liveScore?.isLive  ?? false
  const isFinal = liveScore?.isFinal ?? false
  const showScore = isLive || isFinal

  return (
    <div className="min-h-screen" style={{ background: '#FAF8F3' }}>

      {/* ── STICKY GAME HEADER ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b" style={{ background: '#1A1A1A', borderColor: 'rgba(250,248,243,0.08)' }}>

        {/* Match strip */}
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">

            {/* Away team */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {awayLogoUrl && (
                <img
                  src={awayLogoUrl}
                  alt={awayAbbr}
                  className="w-9 h-9 object-contain flex-shrink-0"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
                />
              )}
              <span
                className="font-bold text-sm tracking-wider truncate"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FAF8F3', letterSpacing: '0.05em' }}
              >
                {awayAbbr}
              </span>
            </div>
{/* ── SERIES TRAJECTORY — shown above tab content when available ── */}
    {/* ── SERIES TRAJECTORY ── */}
    
            {/* Score / time centre */}
            <div className="flex flex-col items-center shrink-0 px-2">
              {showScore ? (
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold leading-none"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#FAF8F3', letterSpacing: '0.04em' }}
                  >
                    {liveScore!.awayRuns}
                  </span>
                  <span style={{ color: 'rgba(250,248,243,0.25)', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>–</span>
                  <span
                    className="text-2xl font-bold leading-none"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", color: '#FAF8F3', letterSpacing: '0.04em' }}
                  >
                    {liveScore!.homeRuns}
                  </span>
                </div>
              ) : (
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FF5722', letterSpacing: '0.05em' }}
                >
                  {gameTime ?? 'TBD'}
                </span>
              )}

              {/* Status line */}
              {isLive && liveScore?.currentInning && (
                <span
                  className="text-[9px] font-bold uppercase tracking-widest mt-0.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FF5722' }}
                >
                  ● {liveScore.currentInning}
                </span>
              )}
              {isFinal && (
                <span
                  className="text-[9px] font-bold uppercase tracking-widest mt-0.5"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(250,248,243,0.35)' }}
                >
                  FINAL
                </span>
              )}
              {!showScore && venue && (
                <span
                  className="text-[9px] uppercase tracking-widest mt-0.5 truncate max-w-[140px] text-center"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(250,248,243,0.3)' }}
                >
                  {venue}
                </span>
              )}
            </div>

            {/* Home team */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
              <span
                className="font-bold text-sm tracking-wider truncate text-right"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FAF8F3', letterSpacing: '0.05em' }}
              >
                {homeAbbr}
              </span>
              {homeLogoUrl && (
                <img
                  src={homeLogoUrl}
                  alt={homeAbbr}
                  className="w-9 h-9 object-contain flex-shrink-0"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── TAB BAR ────────────────────────────────────────────────────────── */}
        <div
          className="max-w-3xl mx-auto flex"
          style={{ borderTop: '1px solid rgba(250,248,243,0.06)' }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const isLocked = tab.proOnly && !isPro

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors relative"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: isActive ? '#FF5722' : 'rgba(250,248,243,0.35)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
                {isLocked && (
                  <svg
                    width="9" height="10" viewBox="0 0 9 10" fill="none"
                    style={{ opacity: 0.4, flexShrink: 0 }}
                  >
                    <rect x="1" y="4" width="7" height="6" rx="1" fill="currentColor"/>
                    <path d="M2.5 4V2.5a2 2 0 0 1 4 0V4" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  </svg>
                )}
                {/* Active underline */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: '2px', background: '#FF5722' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

{/* ── SERIES TRAJECTORY ── */}
      {slotSeries}

      {/* ── TAB CONTENT ── */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'read' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotRead}</div>
        )}
        {activeTab === 'lineups' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotLineups}</div>
        )}
        {activeTab === 'pitching' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotPitching}</div>
        )}
        {activeTab === 'teams' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotTeams}</div>
        )}
      </div>
    </div>
  )
}