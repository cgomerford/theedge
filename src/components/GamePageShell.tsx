// src/components/GamePageShell.tsx
//
// REBUILD — 2026-08-08 (v3)
// - Width bypasses Tailwind entirely. Every constraint is an inline style
//   (maxWidth: 1440). Tailwind v4 + Turbopack has been unreliable with
//   utility classes in this project — same workaround already used
//   elsewhere for responsive breakpoints.
// - Tab order: Edge Indicator → Scout Report → Pitching Lab → Batting Lab
//   → Teams → (Series, conditional) → Fantasy. Bullpen is folded into
//   Pitching Lab, no standalone tab.
// - Sidebar rendered on lg+ screens as a right rail; ordering of its
//   children (Series / Team Forms / Standings+Chart / Race for October)
//   is controlled by page.tsx, which composes the single slotSidebar
//   node in wireframe order.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import LiveScoreboard from './LiveScoreboard'

export type GamePageTab =
  | 'read' | 'scout' | 'pitching' | 'batting' | 'teams' | 'series' | 'fantasy'

const MAX_W = 1440
const centered: React.CSSProperties = { maxWidth: MAX_W, width: '100%', marginInline: 'auto' }

type LiveScoreData = {
  awayRuns: number; homeRuns: number
  awayHits?: number; homeHits?: number
  awayErrors?: number; homeErrors?: number
  inningState?: string; currentInning?: string
  isLive: boolean; isFinal: boolean
}

type GamePageShellProps = {
  homeTeam: string; awayTeam: string
  homeAbbr: string; awayAbbr: string
  homeLogoUrl?: string; awayLogoUrl?: string
  gameTime?: string; venue?: string
  isPro: boolean; isSignedIn?: boolean
  liveScore?: LiveScoreData
  pinnedHero?: React.ReactNode
  slotSidebar?: React.ReactNode
  slotRead: React.ReactNode
  slotScout: React.ReactNode
  slotPitching: React.ReactNode
  slotBatting?: React.ReactNode
  slotTeams: React.ReactNode
  slotSeriesTab?: React.ReactNode
  slotFantasy?: React.ReactNode
}

const TABS: { key: GamePageTab; label: string; proOnly: boolean }[] = [
  { key: 'read',     label: 'Edge Indicator', proOnly: false },
  { key: 'scout',    label: 'Scout Report',   proOnly: false },
  { key: 'pitching', label: 'Pitching Lab',   proOnly: true  },
  { key: 'batting',  label: 'Batting Lab',    proOnly: true  },
  { key: 'teams',    label: 'Teams',          proOnly: false },
  { key: 'fantasy',  label: 'Fantasy',        proOnly: true  },
]

function ComingSoon({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">⊕ {label}</div>
      <h2 className="font-serif font-light text-4xl text-stone-900 mb-3">Coming soon<span className="text-orange-600">.</span></h2>
      <p className="text-stone-500 font-serif italic text-base max-w-sm leading-relaxed mb-8">
        Rebuilding from the ground up — deeper analysis, player-level intelligence, built for decisions not just data.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 text-left bg-stone-100 rounded-lg px-4 py-2.5">
            <span className="text-orange-400 text-xs">◎</span>
            <span className="text-[11px] font-mono text-stone-600">{item}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-8">Launching in days, not weeks</p>
    </div>
  )
}

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr,
  homeLogoUrl, awayLogoUrl,
  gameTime, venue, isPro, isSignedIn = false,
  liveScore,
  pinnedHero,
  slotSidebar,
  slotRead, slotScout, slotPitching, slotBatting, slotTeams, slotSeriesTab, slotFantasy,
}: GamePageShellProps) {
  const hasSeries = slotSeriesTab != null
  const tabs = hasSeries
    ? [...TABS.slice(0, 5), { key: 'series' as const, label: 'Series', proOnly: false }, TABS[5]]
    : TABS
  const validTabKeys = new Set<GamePageTab>(tabs.map(t => t.key))

  const searchParams = useSearchParams()
  const initialTab: GamePageTab = (() => {
    const t = searchParams?.get('tab')
    if (t && validTabKeys.has(t as GamePageTab)) return t as GamePageTab
    return 'read'
  })()
  const [activeTab, setActiveTab] = useState<GamePageTab>(initialTab)

  // Scout Report gets the full width — sidebar drops entirely rather than
  // sitting there empty next to a report that wants the room.
  const showSidebar = !!slotSidebar && activeTab !== 'scout'
  const handleTabChange = (tab: GamePageTab) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (tab === 'read') url.searchParams.delete('tab')
      else url.searchParams.set('tab', tab)
      window.history.replaceState({}, '', url.toString())
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">

        {/* Logo vs logo strip */}
        <div className="flex items-center px-4 py-2 gap-2" style={centered}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {awayLogoUrl && (
              <img src={awayLogoUrl} alt={awayAbbr} className="w-8 h-8 object-contain flex-shrink-0" />
            )}
            <span className="text-[13px] font-mono font-bold text-stone-900 truncate">{awayAbbr}</span>
          </div>

          <div className="flex flex-col items-center shrink-0 px-1">
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
        <div
          className="flex overflow-x-auto scrollbar-hide border-t border-stone-100 px-4"
          style={{ ...centered, WebkitOverflowScrolling: 'touch' }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            const isLocked = tab.proOnly && !isPro
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
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
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.proOnly && (
                  <span className="ml-1 text-[8px]">{isLocked ? '🔒' : '⊕'}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── LIVE SCOREBOARD ── */}
      {liveScore && (liveScore.isLive || liveScore.isFinal) && (
        <LiveScoreboard
          awayTeam={awayTeam} homeTeam={homeTeam}
          awayAbbr={awayAbbr} homeAbbr={homeAbbr}
          awayLogoUrl={awayLogoUrl ?? ''} homeLogoUrl={homeLogoUrl ?? ''}
          awayRuns={liveScore.awayRuns} homeRuns={liveScore.homeRuns}
          awayHits={liveScore.awayHits} homeHits={liveScore.homeHits}
          awayErrors={liveScore.awayErrors} homeErrors={liveScore.homeErrors}
          inningState={liveScore.inningState} currentInning={liveScore.currentInning}
          isLive={liveScore.isLive} isFinal={liveScore.isFinal}
          gameTime={gameTime}
        />
      )}

      {/* ── PINNED HERO ── */}
      {pinnedHero}

      {/* ── TAB CONTENT + SIDEBAR ── */}
      <div className="px-4 py-6" style={centered}>
        <div
          style={{
            display: 'grid',
            gap: 40,
            gridTemplateColumns: showSidebar ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)',
          }}
          className="edge-page-grid"
        >
          <style>{`
            @media (max-width: 1023px) {
              .edge-page-grid { grid-template-columns: minmax(0, 1fr) !important; }
            }
          `}</style>

          <div style={{ minWidth: 0 }}>
            {activeTab === 'read' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotRead}</div>
            )}
            {activeTab === 'scout' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotScout}</div>
            )}
            {activeTab === 'pitching' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotPitching}</div>
            )}
            {activeTab === 'batting' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {slotBatting ?? (
                  <ComingSoon
                    label="Batting Lab"
                    items={['Spray charts & hot zones', 'Plate discipline percentiles', 'Platoon splits vs tonight\'s starter', 'Barrel% / hard-hit trend']}
                  />
                )}
              </div>
            )}
            {activeTab === 'teams' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotTeams}</div>
            )}
            {activeTab === 'series' && hasSeries && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotSeriesTab}</div>
            )}
            {activeTab === 'fantasy' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {slotFantasy ?? (
                  <ComingSoon
                    label="Fantasy"
                    items={['Start/sit signal for tonight', 'Ownership-aware waiver picks', 'Regression-adjusted projections']}
                  />
                )}
              </div>
            )}
          </div>

         {showSidebar && (
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {slotSidebar}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}