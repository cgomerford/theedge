'use client'

// src/components/scout/Leaderboard.tsx
//
// All-30-club ABS challenge leaderboard, sortable by any column. Tonight's two
// clubs are highlighted. Overturn rates for clubs with under MIN_RANK challenges
// are faded — too few to rank.

import { useMemo, useState } from 'react'
import type { LeaderRow } from '@/lib/scout/abs-desk'

type Col = { key: string; label: string; title: string; value: (r: LeaderRow) => number | null; fmt: (v: number | null) => string }
const per = (r: LeaderRow) => (r.games > 0 ? r.challenges / r.games : null)
const share = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)

const COLS: Col[] = [
  { key: 'per', label: 'Per game', title: 'Challenges per game played', value: per, fmt: (v) => (v == null ? '—' : v.toFixed(2)) },
  { key: 'n', label: 'Challenges', title: 'Total challenges', value: (r) => r.challenges, fmt: (v) => String(v ?? '—') },
  { key: 'ov', label: 'Overturned', title: 'Share of challenges overturned', value: (r) => share(r.overturns, r.challenges), fmt: (v) => (v == null ? '—' : `${v.toFixed(0)}%`) },
  { key: 'bat', label: 'Batter-started', title: 'Share started by the batter (vs catcher/pitcher)', value: (r) => share(r.batter, r.challenges), fmt: (v) => (v == null ? '—' : `${v.toFixed(0)}%`) },
  { key: 'late', label: '7th+', title: 'Share of challenges in the 7th inning or later', value: (r) => share(r.late, r.challenges), fmt: (v) => (v == null ? '—' : `${v.toFixed(0)}%`) },
]

export default function Leaderboard({ rows, highlight, minRank }: { rows: LeaderRow[]; highlight: number[]; minRank: number }) {
  const [sortKey, setSortKey] = useState('per')
  const [desc, setDesc] = useState(true)
  const col = COLS.find((c) => c.key === sortKey) ?? COLS[0]
  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) => (col.value(b) ?? -1) - (col.value(a) ?? -1))
    return desc ? out : out.reverse()
  }, [rows, col, desc])
  const league = useMemo(() => {
    const g = rows.reduce((a, r) => a + r.games, 0), n = rows.reduce((a, r) => a + r.challenges, 0), o = rows.reduce((a, r) => a + r.overturns, 0)
    return { per: g > 0 ? n / g : 0, ov: n > 0 ? (o / n) * 100 : 0 }
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] whitespace-nowrap">
        <thead>
          <tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
            <th className="text-left font-semibold py-1 pr-2">#</th><th className="text-left font-semibold pr-2">Club</th><th className="font-semibold px-2">G</th>
            {COLS.map((c) => (
              <th key={c.key} className="font-semibold px-2">
                <button type="button" title={c.title} aria-pressed={sortKey === c.key}
                  onClick={() => (sortKey === c.key ? setDesc(!desc) : (setSortKey(c.key), setDesc(true)))}
                  className={`uppercase tracking-wider hover:text-stone-800 ${sortKey === c.key ? 'text-stone-900 font-bold' : ''}`}>{c.label}{sortKey === c.key ? (desc ? ' ▼' : ' ▲') : ''}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-right text-stone-700">
          {sorted.map((r, i) => {
            const on = highlight.includes(r.teamId)
            return (
              <tr key={r.teamId} className={`border-b border-stone-100 last:border-0 ${on ? 'bg-orange-50/70' : ''}`}>
                <td className={`text-left py-1 pr-2 font-mono text-[10px] ${on ? 'border-l-2 border-orange-500 pl-1.5 text-orange-700' : 'text-stone-400'}`}>{i + 1}</td>
                <td className={`text-left pr-2 font-sans ${on ? 'font-bold text-stone-900' : 'font-semibold'}`}>{r.abbr}</td>
                <td className="px-2 font-mono text-stone-400">{r.games}</td>
                {COLS.map((c) => {
                  const thin = c.key !== 'per' && c.key !== 'n' && r.challenges < minRank
                  return <td key={c.key} className={`px-2 font-mono ${thin ? 'text-stone-300' : sortKey === c.key ? 'font-bold text-stone-900' : ''}`}>{c.fmt(c.value(r))}</td>
                })}
              </tr>
            )
          })}
          <tr className="text-stone-500 border-t border-stone-300">
            <td /><td className="text-left font-sans font-semibold py-1">League</td><td />
            <td className="px-2 font-mono">{league.per.toFixed(2)}</td><td className="px-2 font-mono">{rows.reduce((a, r) => a + r.challenges, 0)}</td><td className="px-2 font-mono">{league.ov.toFixed(0)}%</td><td /><td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
