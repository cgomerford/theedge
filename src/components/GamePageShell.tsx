'use client'

/**
 * src/components/GamePageShell.tsx
 *
 * Phone-first game page wrapper.
 * Sticky header shows logo vs logo matchup context on all screen sizes.
 * Tabs are horizontally scrollable on mobile with short labels.
 */

import { useState } from 'react'
import Link from 'next/link'

export type GamePageTab = 'read' | 'teams' | 'pitching' | 'gmlab' | 'fantasy'

type GamePageShellProps = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  homeLogoUrl?: string   // ← new: for the sticky header logo strip
  awayLogoUrl?: string   // ← new
  gameTime?: string
  venue?: string
  isPro: boolean
  isSignedIn?: boolean

  slotRead: React.ReactNode
  slotTeams: React.ReactNode
  slotPitching: React.ReactNode
  slotGmlab: React.ReactNode
  slotFantasy: React.ReactNode
}

type Tab = {
  key: GamePageTab
  label: string
  shortLabel: string
  proOnly: boolean
}

const TABS: Tab[] = [
  { key: 'read',     label: 'The Read',  shortLabel: 'Read',    proOnly: false },
  { key: 'teams',    label: 'Teams',     shortLabel: 'Teams',   proOnly: false },
  { key: 'pitching', label: 'Pitching',  shortLabel: 'Pitching', proOnly: true },
  { key: 'gmlab',    label: 'GM Lab',    shortLabel: 'Lab',     proOnly: true  },
  { key: 'fantasy',  label: 'Fantasy',   shortLabel: 'Fantasy', proOnly: true  },
]

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr,
  homeLogoUrl, awayLogoUrl,
  gameTime, venue, isPro, isSignedIn = false,
  slotRead, slotTeams, slotPitching, slotGmlab, slotFantasy,
}: GamePageShellProps) {
  const [activeTab, setActiveTab] = useState<GamePageTab>('read')

  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── STICKY HEADER ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-stone-200 shadow-sm">

        {/* Logo vs logo matchup strip */}
        <div className="flex items-center px-3 py-2 max-w-4xl mx-auto gap-2">

          {/* Away team */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {awayLogoUrl ? (
              <img
                src={awayLogoUrl}
                alt={awayAbbr}
                className="w-8 h-8 object-contain flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : null}
            <span className="text-[13px] font-mono font-bold text-stone-900 truncate">
              {awayAbbr}
            </span>
          </div>

          {/* Centre — "at" + game time */}
          <div className="flex flex-col items-center shrink-0 px-1">
            <span className="text-[11px] font-serif italic text-stone-400 leading-none">at</span>
            {gameTime && (
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5 whitespace-nowrap">
                {gameTime}
              </span>
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span className="text-[13px] font-mono font-bold text-stone-900 truncate">
              {homeAbbr}
            </span>
            {homeLogoUrl ? (
              <img
                src={homeLogoUrl}
                alt={homeAbbr}
                className="w-8 h-8 object-contain flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : null}
          </div>

          {/* Pro badge / CTA — always visible, never takes much space */}
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

        {/* Tab bar — scrollable so labels never clip on narrow screens */}
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

      {/* ── TAB CONTENT ────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {activeTab === 'read' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {slotRead}
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {slotTeams}
          </div>
        )}

        {activeTab === 'pitching' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {slotPitching}
          </div>
        )}

        {activeTab === 'gmlab' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {isPro ? slotGmlab : (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
                  ⊕ GM Lab
                </div>
                <h2 className="font-serif font-light text-4xl text-stone-900 mb-3">
                  Coming soon<span className="text-orange-600">.</span>
                </h2>
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
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-8">
                  Launching in days, not weeks
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'fantasy' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {slotFantasy}
          </div>
        )}

      </div>
    </div>
  )
}
