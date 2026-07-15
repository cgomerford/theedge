'use client'
import Link from 'next/link'
import { teamLogoUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { DivisionStandings } from '@/lib/standings'
import StandingsChart from '@/components/StandingsChart'
function StandingsTable({
  standings, highlightTeamIds,
}: {
  standings: DivisionStandings
  highlightTeamIds: Set<number>
}) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">{standings.divisionName}</p>
      <div className="divide-y divide-stone-50">
        {standings.teams.map(t => {
          const isHighlighted = highlightTeamIds.has(t.teamId)
          const slug = findTeamByName(t.name)?.slug
          const row = (
            <div
              className="flex items-center gap-2 py-1.5"
              style={isHighlighted ? { borderLeft: '3px solid #FF5722', paddingLeft: 6, marginLeft: -6, background: 'rgba(255,87,34,0.04)' } : undefined}
            >
              <span className={`text-[10px] font-mono font-bold w-4 shrink-0 ${t.divisionRank === 1 ? 'text-orange-600' : 'text-stone-400'}`}>{t.divisionRank}</span>
              <img src={teamLogoUrl(t.teamId)} alt="" className="w-4 h-4 shrink-0" />
              <span className={`flex-1 text-[11px] truncate ${isHighlighted ? 'font-bold text-stone-900' : 'text-stone-600'}`}>{t.name.split(' ').slice(-1)[0]}</span>
              <span className="text-[10px] font-mono text-stone-500 w-10 text-right">{t.wins}-{t.losses}</span>
              <span className="text-[10px] font-mono text-stone-400 w-8 text-right">{t.gamesBack === '-' ? '—' : t.gamesBack}</span>
            </div>
          )
          return slug ? <Link key={t.teamId} href={`/mlb/teams/${slug}`}>{row}</Link> : <div key={t.teamId}>{row}</div>
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
export default function StandingsCard({
  awayTeamId, homeTeamId, awayStandings, homeStandings,
}: {
  awayTeamId: number
  homeTeamId: number
  awayStandings: DivisionStandings | null
  homeStandings: DivisionStandings | null
}) {
  const [view, setView] = useState<'table' | 'chart'>('table')

  if (!awayStandings && !homeStandings) return null

  const sameDivision = awayStandings && homeStandings && awayStandings.divisionName === homeStandings.divisionName

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-mono uppercase tracking-widest text-orange-600 font-bold">Standings</p>
        <div className="flex gap-1 bg-stone-100 p-0.5 rounded-full">
          {(['table', 'chart'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest rounded-full transition ${view === v ? 'bg-[#1A1A1A] text-white' : 'text-stone-400'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
  {view === 'chart' ? (
        (() => {
          // Guard against '—' (or anything else) reaching StandingsChart,
          // which 400s on any division string outside its own fixed list —
          // that's what broke this the first time (2026-07-13): divisionName
          // silently fell back to the '—' placeholder and got passed straight
          // through as a URL param.
          const VALID_DIVISIONS = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']
          const candidate = (awayStandings ?? homeStandings)?.divisionName
          const safeDivision = candidate && VALID_DIVISIONS.includes(candidate) ? candidate : 'AL East'
          return <StandingsChart defaultDivision={safeDivision} />
        })()
      ) : sameDivision ? (
        <StandingsTable standings={awayStandings!} highlightTeamIds={new Set([awayTeamId, homeTeamId])} />
      ) : (
        <div className="space-y-4">
          {awayStandings && <StandingsTable standings={awayStandings} highlightTeamIds={new Set([awayTeamId])} />}
          {homeStandings && <StandingsTable standings={homeStandings} highlightTeamIds={new Set([homeTeamId])} />}
        </div>
      )}
    </div>
  )
}