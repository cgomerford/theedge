'use client'

// Shows neighbors within 5 games in either direction — chasers behind,
// the leader/cutoff ahead. Outside that window, renders nothing per
// 2026-07-13 feedback (a 15-back team's "race" isn't a real race).
// Still no magic number / elimination number / win-projection math —
// same reasoning as before, that needs games-remaining data this
// doesn't have. "Who they play next" deliberately not included yet —
// scope question outstanding (just these two teams, or every neighbor
// shown here — each additional team is a real extra fetch).

import { teamLogoUrl } from '@/lib/mlb'
import type { DivisionStandingRow } from '@/lib/standings'

const THRESHOLD = 5

function gamesBackNum(gb: string): number {
  if (gb === '-' || gb === '') return 0
  return parseFloat(gb)
}

function NeighborRow({ team, isTarget }: { team: DivisionStandingRow; isTarget: boolean }) {
  return (
    <div
      className="flex items-center gap-2 py-1.5"
      style={isTarget ? { borderLeft: '3px solid #FF5722', paddingLeft: 6, marginLeft: -6, background: 'rgba(255,87,34,0.04)' } : undefined}
    >
      <img src={teamLogoUrl(team.teamId)} alt="" className="w-4 h-4 shrink-0" />
      <span className={`flex-1 text-[11px] truncate ${isTarget ? 'font-bold text-stone-900' : 'text-stone-600'}`}>{team.name.split(' ').slice(-1)[0]}</span>
      <span className="text-[10px] font-mono text-stone-500 w-10 text-right">{team.wins}-{team.losses}</span>
      <span className="text-[10px] font-mono text-stone-400 w-8 text-right">{team.divisionRank === 1 ? '—' : `${team.gamesBack}`}</span>
    </div>
  )
}

export default function RaceForOctober({
  team, divisionTeams, wildCardTeams, abbr,
}: {
  team: DivisionStandingRow
  divisionTeams: DivisionStandingRow[]
  wildCardTeams: DivisionStandingRow[]
  abbr: string
}) {
  const gb = gamesBackNum(team.gamesBack)

  // Division race: only show if within 5 of the leader.
  const inDivisionRace = team.divisionRank === 1 || gb <= THRESHOLD
  const divisionNeighbors = inDivisionRace
    ? divisionTeams.filter(t => Math.abs(gamesBackNum(t.gamesBack) - gb) <= THRESHOLD)
    : []

  // Wildcard race: only if within 5 of a cutoff spot (rank 3/4 boundary).
  const wcGb = team.wildCardGamesBack ? gamesBackNum(team.wildCardGamesBack) : null
  const inWildCardRace = team.wildCardRank !== null && wcGb !== null && wcGb <= THRESHOLD
  const wildCardNeighbors = inWildCardRace
    ? wildCardTeams.filter(t => t.wildCardGamesBack !== null && Math.abs(gamesBackNum(t.wildCardGamesBack) - (wcGb ?? 0)) <= THRESHOLD)
    : []

  if (!inDivisionRace && !inWildCardRace) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">Race for October — {abbr}</p>

      {inDivisionRace && divisionNeighbors.length > 0 && (
        <div className="mb-3">
          <p className="text-[8px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">Division</p>
          {divisionNeighbors.map(t => <NeighborRow key={t.teamId} team={t} isTarget={t.teamId === team.teamId} />)}
        </div>
      )}

      {inWildCardRace && wildCardNeighbors.length > 0 && (
        <div>
          <p className="text-[8px] font-mono uppercase tracking-widest text-stone-400 mb-1.5">Wild card</p>
          {wildCardNeighbors.map(t => <NeighborRow key={t.teamId} team={t} isTarget={t.teamId === team.teamId} />)}
        </div>
      )}
    </div>
  )
}