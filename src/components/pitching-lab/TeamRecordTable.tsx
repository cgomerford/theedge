'use client'

// src/components/pitching-lab/TeamRecordTable.tsx
//
// Real decision (W/L/no-decision) per start, grouped by real opponent
// team — src/lib/pitcher-start-trends.ts's getPitcherTeamRecord, off the
// same MLB gameLog endpoint already used elsewhere in this app.

import { useEffect, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import type { TeamRecordRow } from '@/lib/pitcher-start-trends'

const SEASON = new Date().getFullYear()

function mlbTeamLogo(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

export default function TeamRecordTable({ pitcherId }: { pitcherId: number }) {
  const [range, setRange] = useState<'season' | 'career'>('season')
  const [rowsState, setRowsState] = useState<{ range: 'season' | 'career'; rows: TeamRecordRow[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/team-record?playerId=${pitcherId}&season=${SEASON}&range=${range}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setRowsState({ range, rows: json.rows ?? [] }) })
      .catch(() => { if (!cancelled) setRowsState({ range, rows: [] }) })
    return () => { cancelled = true }
  }, [pitcherId, range])

  // Derived instead of reset-in-effect: stale rows from the other range
  // never leak through while the new range's fetch is in flight.
  const rows = rowsState?.range === range ? rowsState.rows : null

  if (rows === null) return <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-[12px] text-stone-400">Loading record vs each team…</div>
  if (rows.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Record vs each team</p>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {(['season', 'career'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${range === r ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {r === 'season' ? 'This season' : 'Career'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] font-mono text-stone-400 mb-4">Real per-start decisions, {range === 'season' ? 'this season' : 'his real career'}.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
              <th className="text-left px-2 py-1.5">Opponent</th>
              <th className="text-right px-2 py-1.5">Starts</th>
              <th className="text-right px-2 py-1.5">W</th>
              <th className="text-right px-2 py-1.5">L</th>
              <th className="text-right px-2 py-1.5">ND</th>
              <th className="text-right px-2 py-1.5">ERA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const team = MLB_TEAMS.find(t => t.id === r.opponentId)
              return (
                <tr key={r.opponentId ?? r.opponent} className="border-t border-stone-50">
                  <td className="px-2 py-1.5 text-stone-800 font-semibold whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      {r.opponentId != null && <img src={mlbTeamLogo(r.opponentId)} alt="" className="w-4 h-4 object-contain shrink-0" />}
                      {team ? `${team.abbrev} · ${team.name}` : r.opponent}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-stone-600">{r.starts}</td>
                  <td className="px-2 py-1.5 text-right text-green-700 font-bold">{r.wins}</td>
                  <td className="px-2 py-1.5 text-right text-red-600 font-bold">{r.losses}</td>
                  <td className="px-2 py-1.5 text-right text-stone-400">{r.noDecisions}</td>
                  <td className="px-2 py-1.5 text-right text-stone-900 font-bold">{r.era != null ? r.era.toFixed(2) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
