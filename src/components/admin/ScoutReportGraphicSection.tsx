'use client'

// src/components/admin/ScoutReportGraphicSection.tsx
//
// 2026-08-20 (later still): "highlighted batter" is now a manual
// dropdown per team (your call — not auto-picked). Roster options come
// from ScoutGraphicGame.awayRosterBatters/homeRosterBatters (fetched
// server-side in the admin page, since MLB's roster endpoint isn't
// reliably CORS-friendly from the browser). On selection, fetches that
// batter's batter_zone_arsenal via /api/admin/batter-zone-arsenal — a
// thin server route, since getBatterZoneArsenal needs the service-role
// Supabase client and can't run directly in this client component.
//
// Rolling numbers and richArsenal wired to real data (previous pass).
//
// STILL genuinely empty: lineup AVG, trending players.

import { useState, useEffect } from 'react'
import ScoutReportGraphicCard from '@/components/admin/ScoutReportGraphicCard'
import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'

export type RosterBatter = {
  id: number
  name: string
}

export type ScoutGraphicGame = {
  gamePk: number
  matchup: string
  awayAbbr: string
  homeAbbr: string
  awayTeamId: number | null
  homeTeamId: number | null
  awayColor: string
  homeColor: string
  awayPitcherId: number | null
  homePitcherId: number | null
  awayPitcherName: string
  homePitcherName: string
  awayPitcherHotZones: Record<string, any>
  homePitcherHotZones: Record<string, any>
  awayPitcherArsenalZones: Record<string, any>
  homePitcherArsenalZones: Record<string, any>
  awayPitcherRichArsenal: RichArsenalPitch[]
  homePitcherRichArsenal: RichArsenalPitch[]
  awayRolling: {
    sp_era: number | null
    bullpen_era: number | null
    ops_l30: number | null
    risp_avg: number | null
  } | null
  homeRolling: {
    sp_era: number | null
    bullpen_era: number | null
    ops_l30: number | null
    risp_avg: number | null
  } | null
  awayRosterBatters: RosterBatter[]
  homeRosterBatters: RosterBatter[]
  awayPitcherLast3: any[]
  homePitcherLast3: any[]
  awayLineup: { playerId: number; playerName: string; avg: number | null }[]
  homeLineup: { playerId: number; playerName: string; avg: number | null }[]
  awayLineupIsFallback?: boolean
  homeLineupIsFallback?: boolean
  awayTrending: { playerId: number; playerName: string; note: string }[]
  homeTrending: { playerId: number; playerName: string; note: string }[]
}

type Props = {
  games: ScoutGraphicGame[]
}

function useHighlightBatter(rosterBatters: RosterBatter[]) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [zoneArsenal, setZoneArsenal] = useState<Record<string, BatterZoneArsenal>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedId) {
      setZoneArsenal({})
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/batter-zone-arsenal?playerId=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setZoneArsenal(data.arsenal ?? {})
      })
      .catch(err => {
        console.error('Failed to fetch batter zone arsenal:', err)
        if (!cancelled) setZoneArsenal({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedId])

  const selectedName = rosterBatters.find(b => b.id === selectedId)?.name ?? 'Select a batter'

  return { selectedId, setSelectedId, selectedName, zoneArsenal, loading }
}

export default function ScoutReportGraphicSection({ games }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const game = games[Math.min(selectedIdx, Math.max(games.length - 1, 0))]

  const away = useHighlightBatter(game?.awayRosterBatters ?? [])
  const home = useHighlightBatter(game?.homeRosterBatters ?? [])

  if (games.length === 0) {
    return <div className="text-sm font-mono text-stone-400 italic">No games with report data for this slate yet.</div>
  }

  const missingTeamIds = game.awayTeamId == null || game.homeTeamId == null

  return (
    <div>
      <select
        value={selectedIdx}
        onChange={e => setSelectedIdx(Number(e.target.value))}
        className="font-mono text-xs border border-stone-300 rounded px-2 py-1.5 mb-3 bg-white"
      >
        {games.map((g, i) => (
          <option key={g.gamePk} value={i}>{g.matchup}</option>
        ))}
      </select>

      {missingTeamIds && (
        <p className="text-[11px] font-mono text-orange-600 mb-2">
          ⚠ Team ID lookup failed for this game — logos will fall back to text badges.
        </p>
      )}

      <div className="flex gap-3 mb-3">
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1">{game.awayAbbr} highlight batter</label>
          <select
            value={away.selectedId ?? ''}
            onChange={e => away.setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[180px]"
          >
            <option value="">— none —</option>
            {game.awayRosterBatters.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {away.loading && <span className="ml-2 text-[10px] font-mono text-stone-400">loading...</span>}
        </div>
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1">{game.homeAbbr} highlight batter</label>
          <select
            value={home.selectedId ?? ''}
            onChange={e => home.setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="font-mono text-xs border border-stone-300 rounded px-2 py-1.5 bg-white min-w-[180px]"
          >
            <option value="">— none —</option>
            {game.homeRosterBatters.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {home.loading && <span className="ml-2 text-[10px] font-mono text-stone-400">loading...</span>}
        </div>
      </div>

      <ScoutReportGraphicCard
        awayAbbr={game.awayAbbr}
        homeAbbr={game.homeAbbr}
        awayTeamId={game.awayTeamId ?? 0}
        homeTeamId={game.homeTeamId ?? 0}
        awayColor={game.awayColor}
        homeColor={game.homeColor}
        awayRolling={game.awayRolling}
        homeRolling={game.homeRolling}
        awayPitcherId={game.awayPitcherId ?? 0}
        awayPitcherName={game.awayPitcherName}
        awayPitcherHotZones={game.awayPitcherHotZones}
        awayPitcherArsenalZones={game.awayPitcherArsenalZones}
        awayPitcherRichArsenal={game.awayPitcherRichArsenal}
        awayPitcherLast3={game.awayPitcherLast3}
        homePitcherId={game.homePitcherId ?? 0}
        homePitcherName={game.homePitcherName}
        homePitcherHotZones={game.homePitcherHotZones}
        homePitcherArsenalZones={game.homePitcherArsenalZones}
        homePitcherRichArsenal={game.homePitcherRichArsenal}
        homePitcherLast3={game.homePitcherLast3}
        awayHighlightBatterName={away.selectedName}
        awayHighlightBatterZoneArsenal={away.zoneArsenal}
        homeHighlightBatterName={home.selectedName}
        homeHighlightBatterZoneArsenal={home.zoneArsenal}
        awayLineup={game.awayLineup}
        homeLineup={game.homeLineup}
        awayLineupIsFallback={game.awayLineupIsFallback}
        homeLineupIsFallback={game.homeLineupIsFallback}
       trendingBatters={(() => {
          // Interleave rather than concat-then-slice — a flat concat
          // meant the away team's entries always won all 3 slots
          // whenever they had 3+ trending batters, since slice(0,3)
          // never even looked at the home array.
          const a = game.awayTrending.slice(0, 2)
          const h = game.homeTrending.slice(0, 2)
          const interleaved: typeof a = []
          for (let i = 0; i < Math.max(a.length, h.length); i++) {
            if (a[i]) interleaved.push(a[i])
            if (h[i]) interleaved.push(h[i])
          }
          return interleaved.slice(0, 3)
        })()}
        fullReportUrl={`edgereportdaily.com/mlb/${game.gamePk}`}
      />
    </div>
  )
}