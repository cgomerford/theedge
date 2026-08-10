// src/components/player/MonthlyGradeStrip.tsx
//
// Horizontal strip of calendar-month grade tiles, sitting in the right
// column near Season Progression. Companion to that chart, not a
// replacement — Season Progression is cumulative across the year, this is
// month-ISOLATED, so it shows whether form is trending up or down in
// grade terms rather than just raw stat drift.
//
// EXTENDED 2026-08: added an "Expand table" toggle — the default tile
// strip shows one month's breakdown at a time on click; expanded mode
// shows every month's raw stat values (AVG/OBP/SLG/OPS or ERA/WHIP/K9)
// side by side in a table, plus the composite grade per month, for
// comparing the whole season's month-by-month shape at once.
//
// Months with <3 games render as a greyed '—' tile/row rather than a
// swingy number — see the qualified check in computeMonthlyGrades.

'use client'

import { useState } from 'react'
import type { MonthGrade } from '@/lib/player-grade'

function tileColor(score: number, qualified: boolean): string {
  if (!qualified) return '#e7e5e4'
  if (score >= 90) return '#059669'
  if (score >= 75) return '#16a34a'
  if (score >= 45) return '#f59e0b'
  if (score >= 25) return '#f97316'
  return '#dc2626'
}

export default function MonthlyGradeStrip({ months }: { months: MonthGrade[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  if (months.length === 0) {
    return null
  }

  const active = months.find(m => m.monthKey === selected) ?? null
  const statCols = months.find(m => m.rawStats.length > 0)?.rawStats.map(r => ({ key: r.key, label: r.label })) ?? []

  return (
    <div className="border border-stone-200 bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Month by month</p>
        <button
          onClick={() => setExpanded(e => !e)}
          className="font-mono text-[9px] uppercase tracking-widest text-orange-600 hover:text-orange-700 transition"
        >
          {expanded ? 'Collapse ▲' : 'Expand table ▼'}
        </button>
      </div>
      <p className="text-xs font-serif text-stone-400 italic mb-4">
        Each month graded on its own — isolated, not cumulative.
      </p>

      {!expanded ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {months.map(m => {
              const qualified = m.grade?.qualified ?? false
              const color = tileColor(m.grade?.score ?? 0, qualified)
              const isSelected = selected === m.monthKey
              return (
                <button
                  key={m.monthKey}
                  onClick={() => setSelected(s => s === m.monthKey ? null : m.monthKey)}
                  className="shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition"
                  style={{
                    borderColor: isSelected ? color : '#e7e5e4',
                    background: isSelected ? `${color}12` : 'transparent',
                    minWidth: 58,
                  }}
                >
                  <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{m.month}</span>
                  <span className="font-mono font-bold tabular-nums text-lg leading-none" style={{ color }}>
                    {qualified ? m.grade!.score : '—'}
                  </span>
                  <span className="font-mono text-[8px] text-stone-400">{m.games}G</span>
                </button>
              )
            })}
          </div>

          {active && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between mb-2">
                <span className="font-serif text-sm font-semibold text-stone-800">
                  {active.month} — {active.grade?.qualified ? active.grade.grade : 'Small sample'}
                </span>
                <span className="font-mono text-xs text-stone-500">
                  {active.headlineStat.label} {active.headlineStat.value}
                </span>
              </div>
              {active.grade && active.grade.components.length > 0 && (
                <div className="space-y-1.5">
                  {active.grade.components.map(c => (
                    <div key={c.key} className="flex items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400 w-14 shrink-0">
                        {c.label}
                      </span>
                      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.percentile}%`, background: tileColor(c.percentile, true) }}
                        />
                      </div>
                      <span className="font-mono text-[9px] font-bold tabular-nums text-stone-600 w-7 text-right">
                        {c.percentile}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="text-left pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Month</th>
                {statCols.map(s => (
                  <th key={s.key} className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">{s.label}</th>
                ))}
                <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Grade</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const qualified = m.grade?.qualified ?? false
                const color = tileColor(m.grade?.score ?? 0, qualified)
                return (
                  <tr key={m.monthKey} className="border-b border-stone-50 last:border-0">
                    <td className="py-2 font-mono font-bold text-stone-900">
                      {m.month} <span className="text-stone-400 font-normal">({m.games}G)</span>
                    </td>
                    {statCols.map(s => {
                      const stat = m.rawStats.find(r => r.key === s.key)
                      return (
                        <td key={s.key} className="py-2 text-right font-mono text-stone-700">
                          {stat?.value ?? '—'}
                        </td>
                      )
                    })}
                    <td className="py-2 text-right font-mono font-bold tabular-nums" style={{ color }}>
                      {qualified ? m.grade!.score : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}