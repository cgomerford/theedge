'use client'

import { useState, useCallback } from 'react'
import PlayerCard from './PlayerCard'
import ComparePlayers from './ComparePlayers'
import CompareTeams from './CompareTeams'
import SeasonTrendChart from './SeasonTrendChart'
import PitcherTrendChart from '@/components/PitcherTrend'
import PlayerRadarChart from './PlayerRadarChart'
import PlayerBarCompareChart from '@/components/PlayerBarCompareChart'
import ScatterCompareChart from '@/components/ScatterCompareChart'
import TeamRadarChart from './TeamRadarChart'
import TeamBarCompareChart from '@/components/TeamBarCompareChart'
import TeamRollingTrendChart from './TeamRollingTrendChart'
import StandingsChart from './StandingsChart'
import { LEAGUE_BY_TEAM_ID, TEAM_NAMES } from '@/lib/lab'
import LabTeamCard from './LabTeamCard'
import PlayerTicker from './PlayerTicker'
import PlayerBrowserPanel from './PlayerBrowserPanel'

type Person = { id: number; fullName: string; primaryPosition: string }
type SubjectType = 'pitcher' | 'batter'
type SelectedPlayer = { id: number; fullName: string; primaryPosition: string; subjectType: SubjectType }
type PlayerChartType = 'trend' | 'radar' | 'bar' | 'scatter'
type TeamChartType = 'rolling' | 'standings' | 'radar' | 'bar'

const MAX_PLAYERS = 4
const MAX_TEAMS = 2
const ALL_TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number).sort((a, b) => (TEAM_NAMES[a]?.name ?? '').localeCompare(TEAM_NAMES[b]?.name ?? ''))

function inferSubjectType(primaryPosition: string): SubjectType {
  return primaryPosition === 'P' ? 'pitcher' : 'batter'
}

// Column count scales with how many tiles are actually in the grid — cards
// get real width when there's only one or two of them, and settle back to
// today's 4-up density once the row is full. Based on tile count (players +
// the open add-slot), not raw selected count, so the add-slot itself always
// gets sized consistently with its siblings.
function gridColsClass(tileCount: number): string {
  if (tileCount <= 1) return 'grid-cols-1'
  if (tileCount === 2) return 'grid-cols-1 sm:grid-cols-2'
  if (tileCount === 3) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
}

function AddPlayerSlot({ onAdd, disabled }: { onAdd: (p: Person) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])

  function search(q: string) {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    fetch(`/api/lab/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(json => setResults(json.people ?? []))
      .catch(() => setResults([]))
  }

  if (disabled) return null

  return (
    <div className="border border-dashed border-stone-300 min-h-[180px] flex flex-col items-center justify-center p-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-2 text-stone-400 hover:text-stone-600 transition">
          <span className="w-10 h-10 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center text-xl">+</span>
          <span className="text-[10px] font-mono uppercase tracking-widest">Add Player</span>
        </button>
      ) : (
        <div className="w-full relative">
          <input autoFocus value={query} onChange={e => search(e.target.value)} placeholder="Search players…" className="w-full border border-stone-300 px-3 py-2 font-mono text-sm" />
          {results.length > 0 && (
            <div className="absolute z-10 w-full bg-white border border-stone-300 mt-1 max-h-56 overflow-y-auto">
              {results.map(p => (
                <button key={p.id} type="button" onClick={() => { onAdd(p); setOpen(false); setQuery(''); setResults([]) }} className="block w-full text-left px-3 py-2 text-sm font-mono hover:bg-stone-50">
                  {p.fullName} <span className="text-stone-400">· {p.primaryPosition}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChartTypeTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex gap-1 flex-wrap mb-4">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 border ${value === o.key ? 'bg-[#FF5722] text-white border-[#FF5722]' : 'border-stone-300 text-stone-500 hover:border-stone-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function PlayersDashboard() {
  const [selected, setSelected] = useState<SelectedPlayer[]>([])
  const [selectedTeams, setSelectedTeams] = useState<number[]>([])
  const [teamPickerOpen, setTeamPickerOpen] = useState(false)
  const [comparePlayers, setComparePlayers] = useState(false)
  const [compareTeams, setCompareTeams] = useState(false)
  const [playerChartType, setPlayerChartType] = useState<PlayerChartType>('trend')
  const [teamChartType, setTeamChartType] = useState<TeamChartType>('rolling')

  const addPlayer = useCallback((p: Person) => {
    setSelected(prev => prev.some(s => s.id === p.id) ? prev : [...prev, { ...p, subjectType: inferSubjectType(p.primaryPosition) }])
  }, [])

  function removePlayer(id: number) {
    setSelected(prev => prev.filter(s => s.id !== id))
    setComparePlayers(false)
  }

  function addTeam(teamId: number) {
    setSelectedTeams(prev => prev.includes(teamId) || prev.length >= MAX_TEAMS ? prev : [...prev, teamId])
    setTeamPickerOpen(false)
  }

  function removeTeam(teamId: number) {
    setSelectedTeams(prev => prev.filter(id => id !== teamId))
    setCompareTeams(false)
  }

  const teamNames = Object.fromEntries(selectedTeams.map(id => [id, TEAM_NAMES[id]?.name ?? String(id)]))
  const hasAddSlot = selected.length < MAX_PLAYERS
  const tileCount = selected.length + (hasAddSlot ? 1 : 0)

  return (
    <div>
      <PlayerTicker onAdd={addPlayer} selectedIds={selected.map(p => p.id)} />

      <div className="flex gap-6 items-start mt-8">
        <div className="flex-1 min-w-0 space-y-10">

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Players ({selected.length}/{MAX_PLAYERS})</div>
              {selected.length === 2 && (
                <button type="button" onClick={() => setComparePlayers(o => !o)} className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline">
                  {comparePlayers ? '← Back to cards' : 'Compare these two →'}
                </button>
              )}
            </div>

            {comparePlayers && selected.length === 2 ? (
              <ComparePlayers a={selected[0]} b={selected[1]} onClose={() => setComparePlayers(false)} />
            ) : selected.length === 0 ? (
              <div className="max-w-xs">
                <AddPlayerSlot onAdd={addPlayer} disabled={false} />
              </div>
            ) : (
              <div className={`grid ${gridColsClass(tileCount)} gap-4 items-start`}>
                {selected.map(p => <PlayerCard key={p.id} player={p} onRemove={() => removePlayer(p.id)} />)}
                {hasAddSlot && <AddPlayerSlot onAdd={addPlayer} disabled={false} />}
              </div>
            )}

            {selected.length > 0 && (
              <div className="mt-8">
                <ChartTypeTabs
                  value={playerChartType}
                  onChange={setPlayerChartType}
                  options={[
                    { key: 'trend', label: 'Season Trend' },
                    { key: 'radar', label: 'Radar Profile' },
                    { key: 'bar', label: 'Bar Compare' },
                    { key: 'scatter', label: 'Scatter' },
                  ]}
                />
                {playerChartType === 'trend' && (
                  <>
                    <SeasonTrendChart players={selected} />
                    <PitcherTrendChart players={selected} />
                  </>
                )}
                {playerChartType === 'radar' && <PlayerRadarChart players={selected} />}
                {playerChartType === 'bar' && <PlayerBarCompareChart players={selected} />}
                {playerChartType === 'scatter' && <ScatterCompareChart players={selected} />}
              </div>
            )}
          </div>

          <div className="border-t border-stone-200 pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Team context ({selectedTeams.length}/{MAX_TEAMS}) — optional</div>
              <div className="flex items-center gap-3">
                {selectedTeams.length === 2 && (
                  <button type="button" onClick={() => setCompareTeams(o => !o)} className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline">
                    {compareTeams ? '← Back to cards' : 'Compare these two →'}
                  </button>
                )}
                {selectedTeams.length < MAX_TEAMS && (
                  <button type="button" onClick={() => setTeamPickerOpen(o => !o)} className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline">+ Add team</button>
                )}
              </div>
            </div>

            {teamPickerOpen && (
              <div className="border border-stone-200 bg-white p-3 mb-4 grid grid-cols-3 sm:grid-cols-5 gap-1 max-h-48 overflow-y-auto">
                {ALL_TEAM_IDS.map(id => (
                  <button key={id} type="button" onClick={() => addTeam(id)} disabled={selectedTeams.includes(id)} className="text-left px-2 py-1.5 text-xs font-mono hover:bg-stone-50 disabled:opacity-30">
                    {TEAM_NAMES[id]?.abbreviation ?? id}
                  </button>
                ))}
              </div>
            )}

            {compareTeams && selectedTeams.length === 2 ? (
              <CompareTeams
                teamAId={selectedTeams[0]} teamBId={selectedTeams[1]}
                teamAName={TEAM_NAMES[selectedTeams[0]]?.name ?? String(selectedTeams[0])}
                teamBName={TEAM_NAMES[selectedTeams[1]]?.name ?? String(selectedTeams[1])}
                onClose={() => setCompareTeams(false)}
              />
            ) : selectedTeams.length > 0 ? (
              <div className={`grid ${selectedTeams.length === 1 ? 'grid-cols-1 max-w-md' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
                {selectedTeams.map(id => <LabTeamCard key={id} teamId={id} teamName={TEAM_NAMES[id]?.name ?? String(id)} onRemove={() => removeTeam(id)} />)}
              </div>
            ) : null}

            <div className="mt-8">
              <ChartTypeTabs
                value={teamChartType}
                onChange={setTeamChartType}
                options={[
                  { key: 'rolling', label: 'Rolling Trend' },
                  { key: 'standings', label: 'Standings' },
                  { key: 'radar', label: 'Radar Profile' },
                  { key: 'bar', label: 'Bar Compare' },
                ]}
              />
              {teamChartType === 'rolling' && <TeamRollingTrendChart teamIds={selectedTeams} teamNames={teamNames} />}
              {teamChartType === 'standings' && <StandingsChart />}
              {teamChartType === 'radar' && <TeamRadarChart teamIds={selectedTeams} teamNames={teamNames} />}
              {teamChartType === 'bar' && <TeamBarCompareChart teamIds={selectedTeams} teamNames={teamNames} />}
            </div>
          </div>

        </div>

        <div className="hidden lg:block w-72 shrink-0">
          <PlayerBrowserPanel onAdd={addPlayer} selectedIds={selected.map(p => p.id)} />
        </div>
      </div>
    </div>
  )
}