// src/components/BatterBoxScoreSelector.tsx
'use client'

// Batter equivalent of PitcherBoxScoreCard's expand-to-select pattern.
// Defaults to the best performer (pickBestBatter), lets the user switch
// via pills, and reuses PostGameSprayChart + BatterZoneHeatmap unchanged
// by feeding them single-player slices via postgame-batter-adapt.ts.
//
// "Advanced stats vs previous 7 games" and "predicted charts" from the
// wireframe are NOT built here — no data source defined for either yet,
// left as a labeled placeholder rather than fabricated. Flag when you
// know what "predicted" should mean.

import { useState, useMemo } from 'react'
import type { BatterGameLine, BattedBallRecord, PitchRecord } from '@/types/postgame'
import {
  pickBestBatter,
  buildSprayHitsForBatter,
  buildZonesForBatter,
  batterExitVeloAvg,
  batterExitVeloSummary,
  batterPlatoonSplit,
  batterPitchCountByInning,
  batterPitchTypeBreakdown,
} from '@/lib/postgame-batter-adapt'
import BatterPitchMap from './BatterPitchMap'
import BatterPitchCountChart from './BatterPitchCountChart'
import BatterPitchTypeChart from './BatterPitchTypeChart'
import BatterSeasonTrendPanel from './BatterSeasonTrendPanel'
import { playerHeadshotUrl } from '@/lib/mlb'

function mlbHeadshotLarge(playerId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${playerId}/headshot/silo/current`
}

type Props = {
  awayBatters: BatterGameLine[]
  homeBatters: BatterGameLine[]
  battedBalls: BattedBallRecord[]
  pitchLog: PitchRecord[]
  awayAbbr: string
  homeAbbr: string
  awayTeamName: string
  homeTeamName: string
  awayColor: string
  homeColor: string
  pitcherHands: Map<number, 'L' | 'R'>
}

export default function BatterBoxScoreSelector({
  awayBatters, homeBatters, battedBalls, pitchLog,
  awayAbbr, homeAbbr, awayTeamName, homeTeamName, awayColor, homeColor,
  pitcherHands,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Batter box score</p>
        <p className="font-serif font-semibold text-stone-900 text-sm mt-0.5">Tap a batter for tonight's breakdown</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-100">
        <TeamBatterSelector
          batters={awayBatters} battedBalls={battedBalls} pitchLog={pitchLog}
          abbr={awayAbbr} teamName={awayTeamName} color={awayColor} pitcherHands={pitcherHands}
        />
        <TeamBatterSelector
          batters={homeBatters} battedBalls={battedBalls} pitchLog={pitchLog}
          abbr={homeAbbr} teamName={homeTeamName} color={homeColor} pitcherHands={pitcherHands}
        />
      </div>
    </div>
  )
}
function TeamBatterSelector({
  batters, battedBalls, pitchLog, abbr, teamName, color, pitcherHands,
}: {
  batters: BatterGameLine[]
  battedBalls: BattedBallRecord[]
  pitchLog: PitchRecord[]
  abbr: string
  teamName: string
  color: string
  pitcherHands: Map<number, 'L' | 'R'>
}) {
  const played = useMemo(() => batters.filter(b => b.plateAppearances > 0), [batters])
  const defaultId = useMemo(() => pickBestBatter(played), [played])
  const [selectedId, setSelectedId] = useState<number | null>(defaultId)

  const selected = played.find(b => b.batterId === selectedId) ?? played[0] ?? null

  if (played.length === 0) {
    return (
      <div className="p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">{abbr}</p>
        <p className="text-xs font-serif italic text-stone-400">No batter data available.</p>
      </div>
    )
  }
  const zones = selected ? buildZonesForBatter(pitchLog, battedBalls, selected.batterId, selected.batterName, abbr) : null
  const pitchCountRows = selected ? batterPitchCountByInning(pitchLog, selected.batterId) : []
  const pitchTypeRows = selected ? batterPitchTypeBreakdown(pitchLog, selected.batterId) : []
  const [activeChart, setActiveChart] = useState<'pitchmap' | 'pitchcount' | 'pitchtype' | null>(null)

  // Savant-style tab strip — spray chart paused per request, not deleted
  // (PostGameSprayChart.tsx still exists, just unused here).
  const CHART_OPTIONS: { key: 'pitchmap' | 'pitchcount' | 'pitchtype'; label: string }[] = [
    { key: 'pitchmap', label: 'Pitch Map' },
    { key: 'pitchcount', label: 'Pitch Count' },
    { key: 'pitchtype', label: 'Pitch Type' },
  ]
  const gameEV = selected ? batterExitVeloAvg(battedBalls, selected.batterId) : null
  const evSummary = selected ? batterExitVeloSummary(battedBalls, selected.batterId) : { min: null, max: null, avg: null }
  const platoon = selected ? batterPlatoonSplit(battedBalls, pitchLog, selected.batterId, pitcherHands) : null
  return (
    <div className="bg-white">
      {/* Header banner — mirrors PostGamePitcherArsenalCard's colored header */}
      {selected && (
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}>
          <img
            src={mlbHeadshotLarge(selected.batterId)}
            alt=""
            className="w-12 h-12 rounded-full object-cover border-2 border-white/40"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
          />
          <div>
            <h3 className="font-serif font-bold text-white text-base leading-tight">{selected.batterName}</h3>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/70 mt-0.5">{abbr}</p>
          </div>
        </div>
      )}

      <div className="p-3 sm:p-4">
      {/* Player pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
        {played.map(b => (
          <button
            key={b.batterId}
            onClick={() => setSelectedId(b.batterId)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shrink-0 transition ${
              selected?.batterId === b.batterId
                ? 'text-white border-transparent'
                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
            }`}
            style={selected?.batterId === b.batterId ? { background: color } : undefined}
          >
            <img
              src={playerHeadshotUrl(b.batterId, 60)}
              alt=""
              className="w-5 h-5 rounded-full object-cover bg-white"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
            />
            <span className="text-[11px] font-serif whitespace-nowrap">{b.batterName.split(' ').slice(-1)[0]}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3">
          {/* Line — AB R H RBI HR BB K */}
          <div className="grid grid-cols-7 gap-1 bg-stone-50 rounded-lg p-2">
            {[
              ['AB', selected.atBats], ['R', selected.runsScored], ['H', selected.hits],
              ['RBI', selected.rbi], ['HR', selected.homeRuns], ['BB', selected.walks], ['K', selected.strikeouts],
            ].map(([label, val]) => (
              <div key={label as string} className="text-center">
                <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">{val}</div>
                <div className="font-mono text-[8px] uppercase text-stone-400">{label}</div>
              </div>
            ))}
          </div>

                   {/* Exit velo min/max/avg + pitches seen */}
          <div className="grid grid-cols-4 gap-1 bg-stone-50 rounded-lg p-2">
            {[
              ['Min EV', evSummary.min != null ? evSummary.min.toFixed(1) : '–'],
              ['Max EV', evSummary.max != null ? evSummary.max.toFixed(1) : '–'],
              ['Avg EV', evSummary.avg != null ? evSummary.avg.toFixed(1) : '–'],
              ['Pitches', selected.pitchesSeen],
            ].map(([label, val]) => (
              <div key={label as string} className="text-center">
                <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">{val}</div>
                <div className="font-mono text-[8px] uppercase text-stone-400">{label}</div>
              </div>
            ))}
          </div>

          {/* vs LHP / RHP split — only shown when at least one side has an AB */}
          {platoon && (platoon.vsLHP.ab > 0 || platoon.vsRHP.ab > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-stone-50 rounded-lg p-2 text-center">
                <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                  {platoon.vsLHP.hits}-{platoon.vsLHP.ab}
                </div>
                <div className="font-mono text-[8px] uppercase text-stone-400">vs LHP</div>
              </div>
              <div className="bg-stone-50 rounded-lg p-2 text-center">
                <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                  {platoon.vsRHP.hits}-{platoon.vsRHP.ab}
                </div>
                <div className="font-mono text-[8px] uppercase text-stone-400">vs RHP</div>
              </div>
            </div>
          )}

           <BatterSeasonTrendPanel playerId={selected.batterId} gameExitVeloAvg={gameEV} />

          {/* Chart tab strip — Savant-style buttons, click to show/hide */}
          <div className="flex gap-1.5 flex-wrap">
            {CHART_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setActiveChart(cur => cur === opt.key ? null : opt.key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest font-bold border transition ${
                  activeChart === opt.key
                    ? 'text-white border-transparent'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                }`}
                style={activeChart === opt.key ? { background: color } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {activeChart === 'pitchmap' && zones && zones.pitches.length > 0 && (
            <BatterPitchMap zones={zones} teamColor={color} />
          )}
          {activeChart === 'pitchcount' && (
            <BatterPitchCountChart rows={pitchCountRows} teamColor={color} />
          )}
          {activeChart === 'pitchtype' && (
            <BatterPitchTypeChart rows={pitchTypeRows} />
          )}

          {/* Wireframe items with no data source yet — placeholder, not fabricated */}
          <div className="bg-stone-50/60 border border-dashed border-stone-200 rounded-lg p-3 text-center">
            <p className="font-mono text-[9px] text-stone-400 uppercase tracking-widest">
              Advanced stats vs previous 7 games · Predicted charts
            </p>
            <p className="font-serif italic text-[11px] text-stone-400 mt-1">Not yet wired — no data source defined</p>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}