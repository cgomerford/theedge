'use client'

// src/components/player/PlayerSnipCard.tsx
//
// A single self-contained card combining a player's real headshot, real
// name, and real percentile rankings on a real team-color background
// with a translucent real team logo watermark — same "meant to be
// screenshot-shareable on its own" design language already established
// for EdgePlusGameCard.tsx's hero tile (team-color gradient wash +
// corner logo watermark). Drop-in replacement for the plain
// PercentileRankingsCard in the Overview tab's Percentile | Season |
// Radar row — not a standalone hero block, so it doesn't dominate the
// page, just that one column. No export/download button by design —
// this is meant to be manually screenshotted ("snipped"), not
// downloaded, so it stays a plain on-page card sized to crop cleanly.

import { playerHeadshotUrl, teamLogoUrl } from '@/lib/mlb'
import { SavantBar } from '@/components/player/StatsPercentilesRail'

// A white halo, not an opaque box — invisible on the plain white/near-
// white background this text normally sits on, but keeps every label
// readable where the real team logo watermark happens to pass behind it
// (a dark logo stroke under light gray text would otherwise wash out).
const TEXT_HALO = {
  textShadow: '0 0 5px #fff, 0 0 5px #fff, 0 0 5px #fff, 0 0 3px #fff',
}

export default function PlayerSnipCard({
  playerId, name, teamAbbr, teamId, teamColor, percentileRows, season,
}: {
  playerId: number
  name: string
  teamAbbr: string
  teamId: number
  teamColor: string
  percentileRows: { key: string; label: string; percentile: number | null }[]
  season?: number
}) {
  const ranked = percentileRows.filter(
    (r): r is { key: string; label: string; percentile: number } => r.percentile != null
  ).sort((a, b) => b.percentile - a.percentile)

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-stone-200 bg-white w-full">
      <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(160deg, ${teamColor}20, ${teamColor}05)` }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogoUrl(teamId)} alt=""
        className="absolute -right-10 -bottom-10 w-64 h-64 pointer-events-none select-none"
        style={{ opacity: 0.5 }}
      />

      <div className="relative p-6">
        <div className="flex items-center gap-4 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={playerHeadshotUrl(playerId, 200)} alt=""
            className="w-20 h-20 shrink-0"
            style={{ borderRadius: '50%', objectFit: 'cover', border: `3px solid ${teamColor}`, background: '#F0EBE0' }}
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold" style={{ color: teamColor }}>{teamAbbr}</p>
            <p className="text-[24px] font-black text-stone-900 leading-tight">{name}</p>
          </div>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ ...TEXT_HALO, color: '#000' }}>{season ?? new Date().getFullYear()} Percentile Rankings</p>
        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-[8px] uppercase tracking-widest text-blue-500" style={TEXT_HALO}>Poor</span>
          <span className="font-mono text-[8px] uppercase tracking-widest" style={{ ...TEXT_HALO, color: '#000' }}>Average</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-red-600" style={TEXT_HALO}>Great</span>
        </div>

        {ranked.length === 0 ? (
          <p className="text-xs font-serif italic text-stone-400 py-6 text-center">Not enough sample to rank yet.</p>
        ) : (
          <div className="space-y-5">
            {ranked.map(r => <SavantBar key={r.key} label={r.label} percentile={r.percentile} textColor="#000" />)}
          </div>
        )}
      </div>
    </div>
  )
}
