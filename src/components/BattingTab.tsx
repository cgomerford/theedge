'use client'

// src/components/BattingTab.tsx
//
// Batting Lab — mirrors PitchingTab.tsx's away/home toggle pattern.
// Shows the confirmed/projected lineup for each team, select a batter to
// drill into their full zone-by-pitch-type breakdown (BatterZoneArsenalGrid)
// and what they're likely to see from tonight's OPPOSING pitcher, count by
// count (BatterCountPreview) — away batters cross-referenced against the
// home pitcher's tendency and vice versa, since that's who they're
// actually facing tonight.
//
// Still open, not wired here: stance/bat-speed metrics (data confirmed
// real via pybaseball's bat_speed/swing_length/attack_angle columns,
// ~37% non-null which is expected — only populates on real swings), and
// the animated hit chart. Both intentionally scoped as separate next
// steps once this shell is confirmed working.

import { useState } from 'react'
import BatterZoneArsenalGrid from '@/components/BatterZoneArsenalGrid'
import BatterCountPreview from '@/components/BatterCountPreview'
import type { BatterZoneArsenal } from '@/lib/batter-zone-arsenal'
import type { PitcherCountTendency } from '@/lib/pitcher-sequencing'
import type { BatterPitchSplitForScout } from '@/lib/scout'
import { playerHeadshotUrl } from '@/lib/mlb'

export type LineupBatterForLab = {
  player_id: number
  player_name: string
  batting_order: number
  splits: BatterPitchSplitForScout[]
}

type TeamLabData = {
  abbr: string
  name: string
  color: string
  lineup: LineupBatterForLab[]
  // Record, not Map — Maps do not survive the server → client JSON boundary.
  zoneArsenalByPlayer: Record<number, Record<string, BatterZoneArsenal>>
  opposingPitcherCountTendency: Record<string, PitcherCountTendency>
  opposingPitcherName: string
}

export default function BattingTab({
  away, home,
}: {
  away: TeamLabData | null
  home: TeamLabData | null
}) {
  const teams = [away, home].filter((t): t is TeamLabData => t !== null)
  const [selectedTeam, setSelectedTeam] = useState(0)
  const [selectedBatterId, setSelectedBatterId] = useState<number | null>(null)

  if (teams.length === 0) {
    return <p className="text-sm font-serif italic text-stone-400 py-10 text-center">Lineups not confirmed yet.</p>
  }

  const team = teams[Math.min(selectedTeam, teams.length - 1)]
  const sortedLineup = [...team.lineup].sort((a, b) => a.batting_order - b.batting_order)
  const activeBatterId = selectedBatterId ?? sortedLineup[0]?.player_id ?? null
  const activeBatter = sortedLineup.find(b => b.player_id === activeBatterId)

  return (
    <div className="space-y-6">
      {teams.length > 1 && (
        <div className="flex gap-1 bg-stone-100 p-1 rounded-full w-fit">
          {teams.map((t, i) => (
            <button
              key={t.abbr}
              onClick={() => { setSelectedTeam(i); setSelectedBatterId(null) }}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-widest rounded-full transition ${
                selectedTeam === i ? 'bg-[#1A1A1A] text-[#FAF8F3]' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-stone-100" style={{ background: `linear-gradient(135deg, ${team.color}14, transparent 70%)` }}>
          <p className="font-mono text-[9px] uppercase tracking-widest text-stone-500">
            {team.abbr} · Lineup vs {team.opposingPitcherName}
          </p>
        </div>
        {sortedLineup.length === 0 ? (
          <p className="text-sm font-serif italic text-stone-400 py-8 text-center">Lineup not confirmed yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-3">
            {sortedLineup.map(b => {
              const isActive = b.player_id === activeBatterId
              return (
                <button
                  key={b.player_id}
                  onClick={() => setSelectedBatterId(b.player_id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition ${
                    isActive ? 'border-transparent' : 'border-stone-200 hover:border-stone-400'
                  }`}
                  style={isActive ? { background: `${team.color}14`, borderColor: team.color } : undefined}
                >
                  <img
                    src={playerHeadshotUrl(b.player_id, 60)}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-stone-200"
                  />
                  <span className="text-[9px] font-mono text-stone-400">{b.batting_order}</span>
                  <span className="text-[10px] font-serif font-semibold text-stone-800 text-center leading-tight truncate w-full">
                    {b.player_name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {activeBatter && (
        <>
          <BatterZoneArsenalGrid
            batterName={activeBatter.player_name}
            color={team.color}
            zoneArsenal={team.zoneArsenalByPlayer[activeBatter.player_id] ?? {}}
          />
          <BatterCountPreview
            batterName={activeBatter.player_name}
            color={team.color}
            pitcherCountTendency={team.opposingPitcherCountTendency}
            batterSplits={activeBatter.splits}
          />
        </>
      )}
    </div>
  )
}