// src/components/PostGameBoxScore.tsx
'use client'

// Traditional box score — linescore (R/H/E by inning) + batting lines +
// pitching lines, both teams. Distinct from PitcherBoxScoreCard (which is
// the interactive per-pitcher sequencing drill-down) — this is the
// summary table, reads BatterGameLine/PitcherGameLine/LinescoreRow
// straight from postgame-aggregate.ts's output, no new computation.

import { useState } from 'react'
import type { BatterGameLine, PitcherGameLine, LinescoreRow } from '@/types/postgame'

function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function Linescore({ rows, awayAbbr, homeAbbr }: { rows: LinescoreRow[]; awayAbbr: string; homeAbbr: string }) {
  if (rows.length === 0) return null
  const maxInnings = Math.max(...rows.map(r => r.runsByInning.length), 9)
  const innings = Array.from({ length: maxInnings }, (_, i) => i + 1)

  return (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100">
            <th className="text-left py-1.5 pr-2 font-mono text-[8px] uppercase text-stone-400"></th>
            {innings.map(i => (
              <th key={i} className="text-center py-1.5 px-1 font-mono text-[8px] text-stone-400 w-6">{i}</th>
            ))}
            <th className="text-center py-1.5 px-1.5 font-mono text-[8px] font-bold text-stone-500">R</th>
            <th className="text-center py-1.5 px-1.5 font-mono text-[8px] font-bold text-stone-500">H</th>
            <th className="text-center py-1.5 px-1.5 font-mono text-[8px] font-bold text-stone-500">E</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.teamId} className={ri === 0 ? 'border-b border-stone-50' : ''}>
              <td className="py-1.5 pr-2 font-mono text-[10px] font-bold text-stone-700">{row.abbreviation}</td>
              {innings.map(i => (
                <td key={i} className="text-center py-1.5 px-1 font-mono text-[10px] text-stone-600 tabular-nums">
                  {row.runsByInning[i - 1] ?? ''}
                </td>
              ))}
              <td className="text-center py-1.5 px-1.5 font-mono text-[11px] font-bold text-stone-900 tabular-nums">{row.runs}</td>
              <td className="text-center py-1.5 px-1.5 font-mono text-[11px] text-stone-700 tabular-nums">{row.hits}</td>
              <td className="text-center py-1.5 px-1.5 font-mono text-[11px] text-stone-700 tabular-nums">{row.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BattingTable({ batters }: { batters: BatterGameLine[] }) {
  const played = batters.filter(b => b.plateAppearances > 0)
  if (played.length === 0) return <p className="text-[11px] font-serif italic text-stone-400 py-3 text-center">No batting data.</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-stone-100">
          {['Batter', 'AB', 'R', 'H', 'RBI', 'BB', 'K'].map((h, i) => (
            <th key={h} className={`py-1.5 font-mono text-[8px] uppercase tracking-wider text-stone-400 ${i === 0 ? 'text-left' : 'text-right pr-1'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {played.map(b => (
          <tr key={b.batterId} className="border-b border-stone-50 last:border-0">
            <td className="py-1.5 font-serif text-stone-900 truncate max-w-[110px]">{b.batterName}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{b.atBats}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{b.runsScored}</td>
            <td className={`text-right pr-1 font-mono tabular-nums ${b.hits > 0 ? 'font-bold text-stone-900' : 'text-stone-700'}`}>{b.hits}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{b.rbi}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{b.walks}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{b.strikeouts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PitchingTable({ pitchers }: { pitchers: PitcherGameLine[] }) {
  if (pitchers.length === 0) return <p className="text-[11px] font-serif italic text-stone-400 py-3 text-center">No pitching data.</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-stone-100">
          {['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'K'].map((h, i) => (
            <th key={h} className={`py-1.5 font-mono text-[8px] uppercase tracking-wider text-stone-400 ${i === 0 ? 'text-left' : 'text-right pr-1'}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pitchers.map(p => (
          <tr key={p.pitcherId} className="border-b border-stone-50 last:border-0">
            <td className="py-1.5 font-serif text-stone-900 truncate max-w-[110px]">{p.pitcherName}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{outsToIP(p.outsRecorded)}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{p.hitsAllowed}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{p.runsAllowed}</td>
            <td className={`text-right pr-1 font-mono tabular-nums ${p.earnedRunsAllowed > 3 ? 'font-bold text-red-500' : 'text-stone-700'}`}>{p.earnedRunsAllowed}</td>
            <td className="text-right pr-1 font-mono text-stone-700 tabular-nums">{p.walks}</td>
            <td className={`text-right pr-1 font-mono tabular-nums ${p.strikeouts >= 6 ? 'font-bold text-green-600' : 'text-stone-700'}`}>{p.strikeouts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type Props = {
  linescore: LinescoreRow[]
  awayAbbr: string
  homeAbbr: string
  awayBatters: BatterGameLine[]
  homeBatters: BatterGameLine[]
  awayPitchers: PitcherGameLine[]
  homePitchers: PitcherGameLine[]
}

export default function PostGameBoxScore({
  linescore, awayAbbr, homeAbbr, awayBatters, homeBatters, awayPitchers, homePitchers,
}: Props) {
  const [team, setTeam] = useState<'away' | 'home'>('away')
  const [section, setSection] = useState<'batting' | 'pitching'>('batting')

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Box score</p>
      </div>

      <div className="p-4 pb-0">
        <Linescore rows={linescore} awayAbbr={awayAbbr} homeAbbr={homeAbbr} />
      </div>

      <div className="flex border-t border-stone-100 px-4">
        {(['away', 'home'] as const).map(side => (
          <button
            key={side}
            onClick={() => setTeam(side)}
            className={`px-3 py-2 text-[10px] font-mono uppercase tracking-widest font-bold border-b-2 transition ${
              team === side ? 'border-orange-500 text-orange-600' : 'border-transparent text-stone-400'
            }`}
          >
            {side === 'away' ? awayAbbr : homeAbbr}
          </button>
        ))}
        <div className="flex-1" />
        {(['batting', 'pitching'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-3 py-2 text-[9px] font-mono uppercase tracking-widest font-bold border-b-2 transition ${
              section === s ? 'border-orange-500 text-orange-600' : 'border-transparent text-stone-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-x-auto">
        {section === 'batting'
          ? <BattingTable batters={team === 'away' ? awayBatters : homeBatters} />
          : <PitchingTable pitchers={team === 'away' ? awayPitchers : homePitchers} />
        }
      </div>
    </div>
  )
}