'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PlayerPageData } from '@/lib/player-page'
import IdentityStrip from '@/components/player/IdentityStrip'
import SignatureSummary from '@/components/player/SignatureSummary'
import ChartLabRail from '@/components/player/ChartLabRail'
import BioTab from '@/components/player/tabs/BioTab'
import SeasonTab from '@/components/player/tabs/SeasonTab'
import StatcastBatterTab from '@/components/player/tabs/StatcastBatterTab'
import StatcastPitcherTab from '@/components/player/tabs/StatcastPitcherTab'
import SplitsTab from '@/components/player/tabs/SplitsTab'
import TrendsTab from '@/components/player/tabs/TrendsTab'
import GameLogTab from '@/components/player/tabs/GameLogTab'

type TabKey = 'bio' | 'season' | 'statcast' | 'splits' | 'trends' | 'gamelog' | 'fantasy' | 'matchup'

const TABS: { key: TabKey; label: string; comingSoon?: boolean }[] = [
  { key: 'season', label: 'Season' },
  { key: 'statcast', label: 'Statcast' },
  { key: 'splits', label: 'Splits' },
  { key: 'trends', label: 'Trends' },
  { key: 'gamelog', label: 'Game log' },
  { key: 'bio', label: 'Bio' },
  { key: 'fantasy', label: 'Fantasy', comingSoon: true },
  { key: 'matchup', label: 'Matchup', comingSoon: true },
]

export default function PlayerPageClient({ data }: { data: PlayerPageData }) {
  const [active, setActive] = useState<TabKey>('season')
  const { identity } = data

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/stats"
        className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition-colors"
      >
        ← All players
      </Link>

      <div className="mt-4">
        <IdentityStrip identity={identity} />
      </div>

      <div className="mt-6">
        <SignatureSummary playerId={identity.id} identity={identity} />
      </div>

      {/* Tab strip — pill buttons, not underlines */}
      <div className="mt-8 flex flex-wrap gap-1.5">
        {TABS.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => !t.comingSoon && setActive(t.key)}
              disabled={t.comingSoon}
              className={`
                font-mono text-[10.5px] uppercase tracking-widest px-4 py-2.5 rounded-full border transition
                ${isActive
                  ? 'bg-[#1A1A1A] text-yellow-300 border-[#1A1A1A]'
                  : t.comingSoon
                  ? 'bg-white text-stone-300 border-stone-200 cursor-not-allowed'
                  : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'}
              `}
            >
              {t.label}
              {t.comingSoon && <span className="ml-1 text-[8px] text-stone-300 lowercase">(soon)</span>}
            </button>
          )
        })}
      </div>

      {/* Content + persistent chart rail */}
      <div className="mt-6 grid lg:grid-cols-[2fr_1fr] gap-5 items-start">
        <div>
          {active === 'bio' && <BioTab data={data} />}
          {active === 'season' && <SeasonTab data={data} />}
          {active === 'statcast' && (
            identity.isPitcher
              ? <StatcastPitcherTab playerId={identity.id} />
              : <StatcastBatterTab playerId={identity.id} positionAbbr={identity.primaryPosition.abbreviation} />
          )}
          {active === 'splits' && <SplitsTab playerId={identity.id} isPitcher={identity.isPitcher} />}
          {active === 'trends' && <TrendsTab playerId={identity.id} isPitcher={identity.isPitcher} />}
          {active === 'gamelog' && <GameLogTab playerId={identity.id} isPitcher={identity.isPitcher} />}
        </div>

<ChartLabRail playerId={identity.id} isPitcher={identity.isPitcher} />

      </div>
    </div>
  )
}