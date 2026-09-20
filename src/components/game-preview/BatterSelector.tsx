// src/components/game-preview/BatterSelector.tsx
//
// "Select a Batter" box — replaces the old fixed-to-leadoff
// BatterRadarMiniCard. Every batter in the lineup is a real, clickable
// name; clicking one swaps which batter "Standard Stats" and "Batting
// Radar" point at. Hot zones for all 9 are pre-fetched server-side
// (cheap Supabase reads — see TeamBatterCard.tsx) so switching batters
// is instant; the heavier per-player lookups (park record, vs-pitcher,
// situational splits) are fetched on demand only for whichever batter's
// Standard Stats modal is actually open (BatterStandardStats.tsx).

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { LineupBatter } from '@/lib/lineups'
import type { BatterStreak } from '@/lib/streaks'
import type { BatterHotZones } from '@/lib/hot-zones'
import HotZone from '@/components/HotZone'
import DetailModal from './DetailModal'
import BatterStandardStats from './BatterStandardStats'
import LabFunnelLink from './LabFunnelLink'

export default function BatterSelector({
  slug, batters, lineupSource, hotZonesByBatter, streaksByBatter,
  venueName, opposingPitcherId, opposingPitcherName, season, isPro,
}: {
  slug: string
  batters: LineupBatter[]
  lineupSource: 'confirmed' | 'projected_from_previous_game' | 'unavailable'
  hotZonesByBatter: Record<number, Record<string, BatterHotZones>>
  streaksByBatter: Record<number, BatterStreak>
  venueName: string
  opposingPitcherId: number | null
  opposingPitcherName: string | null
  season: number
  isPro: boolean
}) {
  const [selectedId, setSelectedId] = useState<number | null>(batters[0]?.player_id ?? null)
  const [modal, setModal] = useState<'stats' | 'radar' | null>(null)

  const selected = batters.find(b => b.player_id === selectedId) ?? batters[0] ?? null
  const selectedZones = selected ? hotZonesByBatter[selected.player_id] : undefined
  const hasZones = selectedZones && Object.keys(selectedZones).length > 0

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Select a Batter</p>
        {lineupSource !== 'unavailable' && (
          <span className={`text-[8px] font-mono uppercase tracking-widest ${lineupSource === 'confirmed' ? 'text-green-600' : 'text-stone-400'}`}>
            {lineupSource === 'confirmed' ? 'Confirmed' : 'Projected'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
          {selected && (
            <img src={playerHeadshotUrl(selected.player_id, 64)} alt={selected.player_name} className="w-full h-full object-cover" />
          )}
        </div>
        <p className="text-[13px] font-sans font-semibold text-stone-900 truncate">{selected?.player_name ?? 'TBD'}</p>
      </div>

      <div className="space-y-0.5 mb-3">
        {batters.length === 0 ? (
          <p className="text-xs font-sans italic text-stone-400">Lineup not yet available.</p>
        ) : (
          batters.map(b => (
            <button
              key={b.player_id}
              onClick={() => setSelectedId(b.player_id)}
              className={`w-full flex items-center gap-2 text-[10.5px] px-1.5 py-1 -mx-1.5 rounded-md text-left transition ${
                b.player_id === selectedId ? 'bg-orange-50 text-orange-700' : 'hover:bg-stone-50 text-stone-800'
              }`}
            >
              <span className="font-mono text-stone-400 w-3 shrink-0">{b.batting_order}</span>
              <span className="font-medium truncate flex-1">{b.player_name}</span>
              <span className="font-mono text-stone-400 shrink-0">{b.position}</span>
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          disabled={!selected}
          onClick={() => setModal('stats')}
          className="rounded-lg border border-stone-200 bg-white p-2.5 text-left hover:border-orange-300 hover:bg-orange-50/40 transition disabled:opacity-40"
        >
          <p className="text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600">◎ Standard Stats</p>
          <p className="text-[10px] text-stone-500 mt-0.5">AVG, streaks, park &amp; matchup →</p>
        </button>
        <button
          type="button"
          disabled={!selected || !hasZones}
          onClick={() => setModal('radar')}
          className="rounded-lg border border-stone-200 bg-white p-2.5 text-left hover:border-orange-300 hover:bg-orange-50/40 transition disabled:opacity-40"
        >
          <p className="text-[9px] font-mono uppercase tracking-widest font-bold text-orange-600">◎ Batting Radar</p>
          <p className="text-[10px] text-stone-500 mt-0.5">{hasZones ? 'Hot zones →' : 'Unavailable yet'}</p>
        </button>
      </div>

      <Link href={`/mlb/${slug}/scout-report`} className="text-[10px] font-mono text-stone-400 hover:text-orange-600 transition">
        Full Scout Report →
      </Link>

      {modal === 'stats' && selected && (
        <DetailModal eyebrow="Standard Stats" title={selected.player_name} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <BatterStandardStats
              batter={selected}
              streak={streaksByBatter[selected.player_id] ?? null}
              venueName={venueName}
              opposingPitcherId={opposingPitcherId}
              opposingPitcherName={opposingPitcherName}
              season={season}
            />
            <div className="pt-3 border-t border-stone-100">
              <LabFunnelLink href={`/mlb/batting-lab/${selected.player_id}`} label={`See ${selected.player_name} in Batting Lab`} isPro={isPro} />
            </div>
          </div>
        </DetailModal>
      )}

      {modal === 'radar' && selected && (
        <DetailModal eyebrow="Batting Radar" title={selected.player_name} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {hasZones ? (
              <HotZone mode="batter" data={selectedZones!} isPro={isPro} playerName={selected.player_name} />
            ) : (
              <p className="text-xs font-sans italic text-stone-400 py-4">Hot-zone data unavailable for this batter yet.</p>
            )}
            <div className="pt-3 border-t border-stone-100">
              <LabFunnelLink href={`/mlb/batting-lab/${selected.player_id}`} label={`See ${selected.player_name} in Batting Lab`} isPro={isPro} />
            </div>
          </div>
        </DetailModal>
      )}
    </div>
  )
}
