'use client'

// src/components/pitching-lab/VenueRecordTable.tsx
//
// Real decision (W/L/no-decision) per start, grouped by real ballpark —
// src/lib/pitcher-venue-record.ts, same real gameLog source as
// TeamRecordTable.tsx, joined against the real venue for each real game.

import { useEffect, useState } from 'react'
import type { PitcherVenueRecordRow } from '@/lib/pitcher-venue-record'

const SEASON = new Date().getFullYear()

export default function VenueRecordTable({ pitcherId }: { pitcherId: number }) {
  const [range, setRange] = useState<'season' | 'career'>('season')
  const [rowsState, setRowsState] = useState<{ range: 'season' | 'career'; rows: PitcherVenueRecordRow[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitcher-venue-record?playerId=${pitcherId}&season=${SEASON}&range=${range}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setRowsState({ range, rows: json.rows ?? [] }) })
      .catch(() => { if (!cancelled) setRowsState({ range, rows: [] }) })
    return () => { cancelled = true }
  }, [pitcherId, range])

  // Derived instead of reset-in-effect: stale rows from the other range
  // never leak through while the new range's fetch is in flight.
  const rows = rowsState?.range === range ? rowsState.rows : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold">Record by ballpark</p>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          {(['season', 'career'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`font-mono uppercase tracking-wider rounded-md px-2.5 py-1 text-[10px] transition ${range === r ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>
              {r === 'season' ? 'This season' : 'Career'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] font-mono text-stone-400 mb-4">Real per-start decisions, {range === 'season' ? 'this season' : 'his real career'}, by real venue.</p>
      {rows === null ? (
        <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-[12px] font-serif italic text-stone-400 py-6">No real starts on record yet.</p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-stone-400 uppercase text-[9px] tracking-wider">
              <th className="text-left px-2 py-1.5">Ballpark</th>
              <th className="text-right px-2 py-1.5">Starts</th>
              <th className="text-right px-2 py-1.5">W</th>
              <th className="text-right px-2 py-1.5">L</th>
              <th className="text-right px-2 py-1.5">ND</th>
              <th className="text-right px-2 py-1.5">ERA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.venueId ?? r.venue} className="border-t border-stone-50">
                <td className="px-2 py-1.5 text-stone-800 font-semibold whitespace-nowrap">{r.venue}</td>
                <td className="px-2 py-1.5 text-right text-stone-600">{r.starts}</td>
                <td className="px-2 py-1.5 text-right text-green-700 font-bold">{r.wins}</td>
                <td className="px-2 py-1.5 text-right text-red-600 font-bold">{r.losses}</td>
                <td className="px-2 py-1.5 text-right text-stone-400">{r.noDecisions}</td>
                <td className="px-2 py-1.5 text-right text-stone-900 font-bold">{r.era != null ? r.era.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
