'use client'

import { useState } from 'react'

export type GamePageTab = 'teams' | 'pitching' | 'fantasy' | 'dashboard'

type GamePageShellProps = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  gameTime?: string
  venue?: string
  isPro: boolean

  slotTeams: React.ReactNode
  slotPitching: React.ReactNode
  slotFantasy: React.ReactNode
  slotDashboard: React.ReactNode
}

type Tab = {
  key: GamePageTab
  label: string
  proOnly: boolean
}

const TABS: Tab[] = [
  { key: 'teams',     label: 'Teams',    proOnly: false },
  { key: 'pitching',  label: 'Pitching', proOnly: false },
  { key: 'fantasy',   label: 'Fantasy',  proOnly: false },
  { key: 'dashboard', label: 'Pro',      proOnly: true  },
]

export default function GamePageShell({
  homeTeam, awayTeam, homeAbbr, awayAbbr, gameTime, venue, isPro,
  slotTeams, slotPitching, slotFantasy, slotDashboard,
}: GamePageShellProps) {
  const [activeTab, setActiveTab] = useState<GamePageTab>('teams')
  const visibleTabs = isPro ? TABS : TABS.filter((t) => !t.proOnly)

  return (
    <div className="min-h-screen bg-stone-50">
      {/* ── UPDATED STICKY HEADER: Light background, removed abbreviations ── */}
      <div className="sticky top-0 z-40 bg-white border-b border-stone-200 shadow-sm">
        
      {/* Secondary Info Strip */}
        <div className="flex items-center justify-end px-4 py-2 max-w-4xl mx-auto gap-4">
         
          {isPro && (
            <span className="text-[9px] font-mono font-bold tracking-widest uppercase text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
              ⊕ Pro
            </span>
          )}
        </div>

        {/* Tab bar (Colors updated for light theme) */}
        <div className="flex max-w-4xl mx-auto px-2 sm:px-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'text-orange-600 border-orange-600'
                  : 'text-stone-500 border-transparent hover:text-stone-800'
              }`}
            >
              {tab.label}
              {tab.proOnly && <span className="ml-1 text-[8px] text-orange-600">⊕</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {activeTab === 'teams' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotTeams}</div>}
        {activeTab === 'pitching' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotPitching}</div>}
        {activeTab === 'fantasy' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotFantasy}</div>}
        {activeTab === 'dashboard' && isPro && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">{slotDashboard}</div>}
      </div>
    </div>
  )
}