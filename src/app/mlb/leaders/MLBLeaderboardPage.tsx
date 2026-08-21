'use client'

// src/app/mlb/leaders/MLBLeaderboardPage.tsx
//
// 3-column leaderboard grid (unchanged from previous version) + range
// leaderboards (buckets) at the bottom — NOW WIRED to /api/mlb/buckets.
// Each threshold pill is clickable; clicking fetches and renders a ranked
// mini-list under that bucket's card.

import { useState, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { LeaderRow, LeaderCategory, LeaderWindow, BucketDefinition, BucketRow } from '@/lib/mlb-leaders'
import { MLB_TEAMS } from '@/lib/teams'

const COLOR_BY_ABBR: Record<string, string> = Object.fromEntries(
  MLB_TEAMS.map(t => [t.abbrev, t.primary_color])
)
function teamColorForAbbr(abbr: string): string {
  return COLOR_BY_ABBR[abbr] ?? '#FF5722'
}

function niceDomainMax(max: number, format?: LeaderCategory['format']): number {
  if (max <= 0) return 1
  if (format === 'int') {
    const step = max > 100 ? 20 : max > 40 ? 10 : max > 15 ? 5 : 2
    return Math.ceil(max / step) * step
  }
  const step = format === 'era' ? 0.5 : 0.05
  return Math.ceil(max / step) * step
}

function formatAxisTick(v: number, format?: LeaderCategory['format']): string {
  if (format === 'era') return v.toFixed(1)
  if (format === 'int') return String(Math.round(v))
  return v.toFixed(3).replace(/^0\./, '.')
}

type ChartDatum = { name: string; value: number; headshot: string; color: string }

function makeYAxisTick(rowMap: Record<string, ChartDatum>) {
  return function YAxisTick({ x, y, payload }: any) {
    const row = rowMap[payload.value]
    if (!row) {
      return (
        <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fontFamily="monospace" fill="#78716c">
          {payload.value}
        </text>
      )
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <clipPath id={`clip-${row.name.replace(/[^a-zA-Z0-9]/g, '')}`}>
          <circle cx={-98} cy={0} r={11} />
        </clipPath>
        <image
          href={row.headshot}
          x={-109} y={-11} width={22} height={22}
          clipPath={`url(#clip-${row.name.replace(/[^a-zA-Z0-9]/g, '')})`}
        />
        <text x={-82} y={0} dy={4} textAnchor="start" fontSize={10} fontFamily="monospace" fill="#1c1917">
          {row.name}
        </text>
      </g>
    )
  }
}

type BoardState = {
  category: string
  window: LeaderWindow
  view: 'table' | 'chart'
  rows: LeaderRow[]
  loading: boolean
  unavailableReason: string | null
}

type BucketCardState = {
  activeThreshold: number | null
  rows: BucketRow[]
  loading: boolean
  unavailableReason: string | null
}

type Props = {
  initialBoards: { category: string; window: 'season'; rows: LeaderRow[] }[]
  categories: LeaderCategory[]
  windows: { key: LeaderWindow; label: string; available: boolean }[]
  buckets: BucketDefinition[]
}

async function fetchBoard(category: string, window: LeaderWindow): Promise<{ rows: LeaderRow[]; unavailableReason: string | null }> {
  try {
    const res = await fetch(`/api/mlb/leaders?category=${category}&window=${window}&limit=15`)
    const data = await res.json()
    if (!data.available) return { rows: [], unavailableReason: data.reason ?? 'Not available.' }
    return { rows: data.rows ?? [], unavailableReason: null }
  } catch {
    return { rows: [], unavailableReason: 'Request failed.' }
  }
}

async function fetchBucket(bucket: string, threshold: number): Promise<{ rows: BucketRow[]; unavailableReason: string | null }> {
  try {
    const res = await fetch(`/api/mlb/buckets?bucket=${bucket}&threshold=${threshold}&limit=10`)
    const data = await res.json()
    if (!data.available) return { rows: [], unavailableReason: data.reason ?? 'Not available.' }
    return { rows: data.rows ?? [], unavailableReason: null }
  } catch {
    return { rows: [], unavailableReason: 'Request failed.' }
  }
}

function LeaderChart({ rows, format }: { rows: LeaderRow[]; format?: LeaderCategory['format'] }) {
  const data: ChartDatum[] = useMemo(() => rows.slice(0, 10).map(r => ({
    name: r.name.split(' ').slice(-1)[0],
    value: Number(r.statValue) || 0,
    headshot: r.headshot,
    color: teamColorForAbbr(r.teamAbbr),
  })), [rows])

  const rowMap = useMemo(() => Object.fromEntries(data.map(d => [d.name, d])), [data])
  const maxVal = Math.max(...data.map(d => Math.abs(d.value)), 0)
  const domainMax = niceDomainMax(maxVal, format)

  return (
    <div className="p-3">
      <ResponsiveContainer width="100%" height={Math.max(240, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tickFormatter={v => formatAxisTick(v, format)}
            tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#78716c' }}
          />
          <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={makeYAxisTick(rowMap)} />
<Tooltip formatter={(v: ValueType | undefined) => formatAxisTick(Number(v ?? 0), format)} labelStyle={{ fontFamily: 'monospace', fontSize: 11 }} />        <Bar dataKey="value" barSize={16}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function BucketCard({ bucket }: { bucket: BucketDefinition }) {
  const [state, setState] = useState<BucketCardState>({
    activeThreshold: null, rows: [], loading: false, unavailableReason: null,
  })

  const selectThreshold = useCallback((t: number) => {
    setState(prev => ({ ...prev, activeThreshold: t, loading: true, unavailableReason: null }))
    fetchBucket(bucket.slug, t).then(({ rows, unavailableReason }) => {
      setState(prev => prev.activeThreshold === t ? { ...prev, rows, unavailableReason, loading: false } : prev)
    })
  }, [bucket.slug])

  return (
    <div className="bg-white border border-stone-200 p-4">
      <div className="text-xs font-mono font-bold uppercase tracking-widest text-stone-700 mb-2">{bucket.label}</div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {bucket.thresholds.map(t => {
          const isActive = state.activeThreshold === t
          return (
            <button
              key={t}
              onClick={() => selectThreshold(t)}
              className={
                isActive
                  ? 'text-[10px] font-mono px-2 py-1 bg-[#1A1A1A] text-white'
                  : 'text-[10px] font-mono px-2 py-1 bg-stone-100 text-stone-500 hover:bg-stone-200 transition'
              }
            >
              {t}{bucket.unit === 'ft' ? '+ft' : '+'}
            </button>
          )
        })}
      </div>

      {state.activeThreshold === null ? (
        <div className="text-xs font-mono text-stone-400 border-t border-stone-100 pt-3">
          Pick a threshold to see the leaderboard.
        </div>
      ) : state.loading ? (
        <div className="text-xs font-mono text-stone-400 border-t border-stone-100 pt-3 text-center py-4">
          Loading…
        </div>
      ) : state.unavailableReason ? (
        <div className="text-xs font-mono text-stone-400 border-t border-stone-100 pt-3">
          {state.unavailableReason}
        </div>
      ) : state.rows.length === 0 ? (
        <div className="text-xs font-mono text-stone-400 border-t border-stone-100 pt-3">
          No qualifying players at this threshold.
        </div>
      ) : (
        <div className="border-t border-stone-100 pt-2">
          {state.rows.map(r => (
            <div key={r.personId} className="flex items-center gap-2 py-1.5">
              <span className="text-stone-400 font-mono text-[10px] w-4 flex-shrink-0 text-center">{r.rank}</span>
              <img
                src={r.headshot}
                alt={r.name}
                className="w-6 h-6 rounded-full object-cover bg-stone-100 flex-shrink-0"
                onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-stone-900 truncate">{r.name}</div>
                <div className="text-[9px] font-mono uppercase text-stone-400">{r.teamAbbr}</div>
              </div>
              <div className="text-sm font-serif font-bold text-stone-900 flex-shrink-0">
                {r.value}
                {r.count != null && bucket.slug !== 'era_by_velo' && (
                  <span className="text-[9px] font-mono text-stone-400 ml-1">×{r.count}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MLBLeaderboardPage({ initialBoards, categories, windows, buckets }: Props) {
  const [boards, setBoards] = useState<BoardState[]>(
    initialBoards.map(b => ({
      category: b.category,
      window: b.window,
      view: 'table',
      rows: b.rows,
      loading: false,
      unavailableReason: null,
    }))
  )

  const updateBoard = useCallback((index: number, patch: Partial<Pick<BoardState, 'category' | 'window'>>) => {
    setBoards(prev => {
      const merged = prev.map((b, i) => i === index ? { ...b, ...patch, loading: true } : b)
      const target = merged[index]
      fetchBoard(target.category, target.window).then(({ rows, unavailableReason }) => {
        setBoards(current => current.map((b, i) => i === index ? { ...b, rows, unavailableReason, loading: false } : b))
      })
      return merged
    })
  }, [])

  const toggleView = (index: number, view: 'table' | 'chart') => {
    setBoards(prev => prev.map((b, i) => i === index ? { ...b, view } : b))
  }

  const battingCats = categories.filter(c => c.group === 'batting')
  const pitchingCats = categories.filter(c => c.group === 'pitching')

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">⊕ League leaders</div>
        <h1 className="text-3xl md:text-4xl font-serif font-light text-stone-900 leading-tight">
          Who&apos;s leading baseball<span className="text-orange-600">.</span>
        </h1>
        <p className="text-sm font-serif text-stone-500 mt-2">
          Three boards, side by side. Pick a stat and a window for each — season totals, since the break, since the deadline, or the last 15/30/45 games.
        </p>
      </div>

      {/* ── 3-column grid ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5 mb-14">
        {boards.map((board, i) => {
          const cat = categories.find(c => c.slug === board.category) ?? categories[0]

          return (
            <div key={i} className="bg-white border border-stone-200 flex flex-col">

              <div className="p-3 border-b border-stone-200 space-y-2 bg-stone-50">
                <select
                  value={board.category}
                  onChange={e => updateBoard(i, { category: e.target.value })}
                  className="w-full text-xs font-mono border border-stone-300 px-2 py-1.5 bg-white text-stone-800"
                >
                  <optgroup label="Batting">
                    {battingCats.map(c => <option key={c.slug} value={c.slug}>{c.label} — {c.fullLabel}</option>)}
                  </optgroup>
                  <optgroup label="Pitching">
                    {pitchingCats.map(c => <option key={c.slug} value={c.slug}>{c.label} — {c.fullLabel}</option>)}
                  </optgroup>
                </select>
                <div className="flex gap-2 items-center">
                  <select
                    value={board.window}
                    onChange={e => updateBoard(i, { window: e.target.value as LeaderWindow })}
                    className="flex-1 text-xs font-mono border border-stone-300 px-2 py-1.5 bg-white text-stone-800"
                  >
                    {windows.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
                  </select>
                  <div className="flex border border-stone-300 flex-shrink-0">
                    <button
                      onClick={() => toggleView(i, 'table')}
                      className={`px-2.5 py-1.5 text-[10px] font-mono uppercase ${board.view === 'table' ? 'bg-[#1A1A1A] text-white' : 'text-stone-500 hover:text-stone-800'}`}
                    >
                      Table
                    </button>
                    <button
                      onClick={() => toggleView(i, 'chart')}
                      className={`px-2.5 py-1.5 text-[10px] font-mono uppercase border-l border-stone-300 ${board.view === 'chart' ? 'bg-[#1A1A1A] text-white' : 'text-stone-500 hover:text-stone-800'}`}
                    >
                      Chart
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1">
                {board.loading ? (
                  <div className="px-4 py-10 text-center text-xs font-mono text-stone-400">Loading…</div>
                ) : board.unavailableReason ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs font-mono text-stone-500">{board.unavailableReason}</p>
                  </div>
                ) : board.rows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm font-mono text-stone-400">No qualified players in this window.</div>
                ) : board.view === 'table' ? (
                  <div>
                    {board.rows.map(r => (
                      <div key={r.personId} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-stone-50 transition">
                        <span className="text-stone-400 font-mono text-xs w-4 flex-shrink-0 text-center">{r.rank}</span>
                        <span className="w-1 self-stretch flex-shrink-0" style={{ backgroundColor: teamColorForAbbr(r.teamAbbr) }} />
                        <img
                          src={r.headshot}
                          alt={r.name}
                          className="w-7 h-7 rounded-full object-cover bg-stone-100 flex-shrink-0"
                          onError={(e) => { const img = e.target as HTMLImageElement; img.style.display = 'none' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-stone-900 truncate">{r.name}</div>
                          <div className="text-[9px] font-mono uppercase text-stone-400">{r.teamAbbr}</div>
                        </div>
                        <div className="text-sm font-serif font-bold text-stone-900 flex-shrink-0">{r.statValue}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <LeaderChart rows={board.rows} format={cat.format} />
                )}
              </div>

              <div className="px-3 py-2 border-t border-stone-100 bg-stone-50">
                <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{cat.fullLabel}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Range leaderboards (buckets) — NOW LIVE ─────────── */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 mb-2">§ Range leaderboards</div>
        <h2 className="text-2xl font-serif font-light text-stone-900 mb-1">Best at the extremes<span className="text-orange-600">.</span></h2>
        <p className="text-sm font-serif text-stone-500 mb-6">AVG allowed on high-velocity pitches, hardest-hit balls, home runs by distance.</p>

        <div className="grid sm:grid-cols-3 gap-4">
          {buckets.map(b => <BucketCard key={b.slug} bucket={b} />)}
        </div>
      </div>

    </div>
  )
}