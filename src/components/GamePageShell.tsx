'use client'

import { useState } from 'react'

// ── The 5 tabs for the game page ──────────────────────────────────────────────
// 'read' is the default (the 5-minute read with MatchupTilt)
// 'pitching', 'gmlab', 'fantasy' are Pro-only
export type GamePageTab = 'read' | 'teams' | 'pitching' | 'gmlab' | 'fantasy'

type GamePageShellProps = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  gameTime?: string
  venue?: string
  isPro: boolean

  // Each tab gets its own slot for content
  slotRead: React.ReactNode
  slotTeams: React.ReactNode
  slotPitching: React.ReactNode
  slotGmlab: React.ReactNode
  slotFantasy: React.ReactNode
}

type Tab = {
  key: GamePageTab
  label: string
  proOnly: boolean
}

// All 5 tabs — always shown to everyone.
// Pro-only tabs show a 🔒 for free users instead of hiding them entirely.
// This is better for upgrade pressure — users see what they're missing.
const TABS: Tab[] = [
  { key: 'read',     label: 'The Read',  proOnly: false },
  { key: 'teams',    label: 'Teams',     proOnly: false },
  { key: 'pitching', label: 'Pitching',  proOnly: true  },
  { key: 'gmlab',    label: 'GM Lab',    proOnly: true  },
  { key: 'fantasy',  label: 'Fantasy',   proOnly: true  },
]

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr, gameTime, venue, isPro,
  slotRead, slotTeams, slotPitching, slotGmlab, slotFantasy,
}: GamePageShellProps) {
  // Default to 'read' — the 5-minute read is the hero tab
  const [activeTab, setActiveTab] = useState<GamePageTab>('read')

  return (
    <div className="min-h-screen bg-stone-50">
      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-stone-200 shadow-sm">

        {/* Pro badge strip */}
        <div className="flex items-center justify-end px-4 py-2 max-w-4xl mx-auto gap-4">
          {isPro && (
            <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
              ⊕ Pro
            </span>
          )}
        </div>

        {/* Tab bar — ALL tabs visible to ALL users */}
        <div className="flex max-w-4xl mx-auto px-2 sm:px-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const isLocked = tab.proOnly && !isPro

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors border-b-2 ${
                  isActive
                    ? 'text-orange-600 border-orange-600'
                    : isLocked
                      ? 'text-stone-300 border-transparent hover:text-stone-400'
                      : 'text-stone-500 border-transparent hover:text-stone-800'
                }`}
              >
                {tab.label}
                {tab.proOnly && (
                  <span className="ml-1 text-[8px]">
                    {isLocked ? '🔒' : '⊕'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="max-w-4xl mx-auto px-4 py-8">
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
       {activeTab === 'gmlab' && isPro && (
  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
        ⊕ GM Lab
      </div>
      <h2 className="font-serif font-light text-4xl text-stone-900 mb-3">
        Coming soon<span className="text-orange-600">.</span>
      </h2>
      <p className="text-stone-500 font-serif italic text-base max-w-sm leading-relaxed mb-8">
        We're rebuilding the GM Lab from the ground up — deeper analysis, player-level intelligence, built for decisions not just data.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {[
          'Player-level fantasy ratings',
          'Regression alarms & FIP vs ERA flags',
          'Bullpen availability matrix',
          'Front Office Memo',
        ].map((item) => (
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