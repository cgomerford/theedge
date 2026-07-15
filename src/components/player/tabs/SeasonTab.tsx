'use client'

import { useState } from 'react'
import type { PlayerPageData, YearByYearRow } from '@/lib/player-page'

const BATTER_COLS: { key: string; label: string }[] = [
  { key: 'season', label: 'Season' },
  { key: 'team', label: 'Team' },
  { key: 'gamesPlayed', label: 'G' },
  { key: 'plateAppearances', label: 'PA' },
  { key: 'atBats', label: 'AB' },
  { key: 'hits', label: 'H' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'homeRuns', label: 'HR' },
  { key: 'runs', label: 'R' },
  { key: 'rbi', label: 'RBI' },
  { key: 'baseOnBalls', label: 'BB' },
  { key: 'strikeOuts', label: 'K' },
  { key: 'stolenBases', label: 'SB' },
  { key: 'avg', label: 'AVG' },
  { key: 'obp', label: 'OBP' },
  { key: 'slg', label: 'SLG' },
  { key: 'ops', label: 'OPS' },
]

const PITCHER_COLS: { key: string; label: string }[] = [
  { key: 'season', label: 'Season' },
  { key: 'team', label: 'Team' },
  { key: 'gamesPlayed', label: 'G' },
  { key: 'gamesStarted', label: 'GS' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'saves', label: 'SV' },
  { key: 'holds', label: 'HLD' },
  { key: 'inningsPitched', label: 'IP' },
  { key: 'hits', label: 'H' },
  { key: 'earnedRuns', label: 'ER' },
  { key: 'homeRuns', label: 'HR' },
  { key: 'baseOnBalls', label: 'BB' },
  { key: 'strikeOuts', label: 'K' },
  { key: 'era', label: 'ERA' },
  { key: 'whip', label: 'WHIP' },
  { key: 'strikeoutsPer9Inn', label: 'K/9' },
  { key: 'walksPer9Inn', label: 'BB/9' },
]

export default function SeasonTab({ data }: { data: PlayerPageData }) {
  const isPitcher = data.identity.isPitcher
  const rows = isPitcher ? data.yearByYearPitching : data.yearByYearHitting
  const cols = isPitcher ? PITCHER_COLS : BATTER_COLS

  const [sortKey, setSortKey] = useState<string>('season')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
        <p className="font-serif italic text-stone-400">No season data on record.</p>
      </div>
    )
  }

  // Current-season line (latest season only)
  const currentSeason = rows[rows.length - 1]
  const careerRow = computeCareer(rows, cols)

  const sorted = [...rows].sort((a, b) => {
    const av: any = sortKey === 'season' ? Number(a.season) : sortKey === 'team' ? (a.team ?? '') : parseFloat(String(a.stat[sortKey] ?? 0))
    const bv: any = sortKey === 'season' ? Number(b.season) : sortKey === 'team' ? (b.team ?? '') : parseFloat(String(b.stat[sortKey] ?? 0))
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'desc' ? bv - av : av - bv
    return sortDir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="space-y-5">
      {/* Current season highlight */}
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3">
          ⊕ {currentSeason.season} — current season
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {cols.filter(c => c.key !== 'season' && c.key !== 'team').slice(0, 8).map(c => (
            <div key={c.key}>
              <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400">
                {c.label}
              </div>
              <div className="text-lg font-mono font-bold text-stone-900 tabular-nums">
                {formatStat(currentSeason.stat[c.key], c.key)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Year-by-year table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold">
            ⊕ Year by year
          </div>
          <div className="text-[9px] font-mono text-stone-400">
            {rows.length} seasons · click column to sort
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                {cols.map(c => (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key)}
                    className={`px-3 py-2.5 text-[9px] font-mono uppercase tracking-widest text-stone-500 cursor-pointer hover:text-stone-900 select-none whitespace-nowrap ${c.key === 'season' || c.key === 'team' ? 'text-left' : 'text-right'}`}
                  >
                    {c.label}{sortKey === c.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={`${r.season}-${i}`} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50">
                  {cols.map(c => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 font-mono whitespace-nowrap ${c.key === 'season' ? 'font-bold text-stone-900' : c.key === 'team' ? 'text-stone-600' : 'text-right text-stone-700 tabular-nums'}`}
                    >
                      {c.key === 'season' ? r.season
                        : c.key === 'team' ? (r.team ?? '—')
                        : formatStat(r.stat[c.key], c.key)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 bg-stone-100 font-bold">
                {cols.map(c => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 font-mono text-[11px] whitespace-nowrap ${c.key === 'season' ? 'text-stone-900' : c.key === 'team' ? 'text-stone-600' : 'text-right text-stone-900 tabular-nums'}`}
                  >
                    {c.key === 'season' ? 'Career'
                      : c.key === 'team' ? `${rows.length}y`
                      : formatStat(careerRow[c.key], c.key)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatStat(value: any, key: string): string {
  if (value == null) return '—'
  if (['avg', 'obp', 'slg', 'ops'].includes(key)) return String(value)
  if (['era', 'whip', 'strikeoutsPer9Inn', 'walksPer9Inn'].includes(key)) return String(value)
  if (key === 'inningsPitched') return String(value)
  const n = parseFloat(String(value))
  if (isNaN(n)) return String(value)
  return String(Math.round(n))
}

function computeCareer(rows: YearByYearRow[], cols: { key: string; label: string }[]): Record<string, any> {
  const totals: Record<string, number> = {}
  const rateBase: Record<string, { num: number; den: number }> = {}
  const summable = ['gamesPlayed', 'gamesStarted', 'plateAppearances', 'atBats', 'hits', 'doubles', 'triples',
    'homeRuns', 'runs', 'rbi', 'baseOnBalls', 'strikeOuts', 'stolenBases', 'wins', 'losses', 'saves', 'holds',
    'earnedRuns']

  for (const r of rows) {
    for (const k of summable) {
      const v = parseFloat(String(r.stat[k] ?? '0'))
      if (!isNaN(v)) totals[k] = (totals[k] ?? 0) + v
    }
  }

  // Rate stats — recompute from totals, not average of seasons
  const out: Record<string, any> = { ...totals }
  const ab = totals.atBats ?? 0
  const h = totals.hits ?? 0
  const bb = totals.baseOnBalls ?? 0
  const hr = totals.homeRuns ?? 0
  const so = totals.strikeOuts ?? 0
  const doubles = totals.doubles ?? 0
  const triples = totals.triples ?? 0
  const er = totals.earnedRuns ?? 0

  if (ab > 0) out.avg = (h / ab).toFixed(3).replace(/^0/, '')
  const pa = totals.plateAppearances ?? (ab + bb)
  if (pa > 0) {
    out.obp = ((h + bb) / pa).toFixed(3).replace(/^0/, '')
    const tb = h + doubles + 2 * triples + 3 * hr
    if (ab > 0) out.slg = (tb / ab).toFixed(3).replace(/^0/, '')
    if (out.obp && out.slg) out.ops = (parseFloat('0' + out.obp) + parseFloat('0' + out.slg)).toFixed(3)
  }

  // Pitcher rate stats — recompute from IP + ER
  const ipStr = rows.reduce((sum, r) => {
    const ip = String(r.stat.inningsPitched ?? '0.0')
    return sum + ipToDecimal(ip)
  }, 0)
  if (ipStr > 0) {
    out.inningsPitched = ipStr.toFixed(1)
    out.era = ((er / ipStr) * 9).toFixed(2)
    const hitsAllowed = totals.hits ?? 0
    out.whip = ((hitsAllowed + bb) / ipStr).toFixed(2)
    out.strikeoutsPer9Inn = ((so / ipStr) * 9).toFixed(1)
    out.walksPer9Inn = ((bb / ipStr) * 9).toFixed(1)
  }

  return out
}

function ipToDecimal(ip: string): number {
  if (!ip.includes('.')) return parseFloat(ip)
  const [whole, thirds] = ip.split('.')
  return parseInt(whole) + parseInt(thirds) / 3
}