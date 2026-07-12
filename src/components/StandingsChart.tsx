'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import CardExportToolbar from './CardExportToolbar'
import { teamColorById } from '@/lib/lab'

const DIVISION_KEYS = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']

function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

// Badges collide when teams finish close in wins — their end-of-line dots
// land at nearly the same pixel position. This ranks all series by final
// win total and hands each one a "stagger rank" among its close neighbors,
// so makeLogoDotRenderer can nudge colliding badges sideways into a
// staircase instead of letting them overlap directly.
function computeStaggerRanks(series: any[], closeWinsThreshold = 3): Record<number, number> {
  const finals = series
    .map(s => ({ teamId: s.teamId, wins: s.points?.[s.points.length - 1]?.wins ?? -1 }))
    .sort((a, b) => b.wins - a.wins)

  const ranks: Record<number, number> = {}
  let clusterStart = 0
  for (let i = 0; i < finals.length; i++) {
    ranks[finals[i].teamId] = i - clusterStart
    const next = finals[i + 1]
    // New cluster starts once the gap to the next team is too big to collide.
    if (!next || finals[i].wins - next.wins > closeWinsThreshold) clusterStart = i + 1
  }
  return ranks
}

function makeLogoDotRenderer(teamId: number, color: string, lastGameIndex: number, size: number, staggerRank: number) {
  const clipId = `standings-logo-clip-${teamId}-${size}`
  const xOffset = staggerRank * (size + 6) // staircase: each colliding badge sits further right than the last
  return (props: any) => {
    const { cx, cy, payload } = props
    if (payload.gameIndex !== lastGameIndex || cx == null || cy == null) {
      return <g key={`empty-${teamId}-${payload.gameIndex}`} />
    }
    const bx = cx + xOffset
    return (
      <g key={`logo-${teamId}`}>
        <defs>
          <clipPath id={clipId}>
            <circle cx={bx} cy={cy} r={size / 2 - 2} />
          </clipPath>
        </defs>
        {staggerRank > 0 && (
          // Thin connector line back to the real data point, so a staggered
          // badge doesn't look like it belongs to a different game count.
          <line x1={cx} y1={cy} x2={bx} y2={cy} stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.5} />
        )}
        <circle cx={bx} cy={cy} r={size / 2 + 2} fill={color} />
        <circle cx={bx} cy={cy} r={size / 2 - 2} fill="#FFFFFF" />
        <image
          x={bx - size / 2 + 3}
          y={cy - size / 2 + 3}
          width={size - 6}
          height={size - 6}
          href={teamLogoUrl(teamId)}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid meet"
        />
        <circle cx={bx} cy={cy} r={size / 2 + 2} fill="none" stroke="#FFFFFF" strokeWidth={2} />
      </g>
    )
  }
}

function StandingsLineChart({
  series, chartHeight, logoSize, chartRef,
}: { series: any[]; chartHeight: number; logoSize: number; chartRef?: React.RefObject<HTMLDivElement | null> }) {
  const maxGames = Math.max(0, ...series.map((s: any) => s.points.length))
  const chartData = Array.from({ length: maxGames }, (_, i) => {
    const row: Record<string, number | null> = { gameIndex: i + 1 }
    for (const s of series) row[String(s.teamId)] = s.points[i]?.wins ?? null
    return row
  })

  const staggerRanks = computeStaggerRanks(series)
  const maxStagger = Math.max(0, ...Object.values(staggerRanks))
  const rightMargin = logoSize + 8 + maxStagger * (logoSize + 6) // widen right margin so staggered badges don't clip off the chart edge

  return (
    <div ref={chartRef} className="border border-stone-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={chartData} margin={{ top: logoSize, right: rightMargin, bottom: 0, left: 0 }}>
          <XAxis dataKey="gameIndex" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} label={{ value: 'Games played', position: 'insideBottom', offset: -2, fontSize: 9, fontFamily: 'monospace' }} />
          <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} width={30} allowDecimals={false} />
          <Tooltip labelFormatter={l => `Game ${l}`} formatter={(v: any, name: any) => [v, series.find((s: any) => String(s.teamId) === name)?.abbreviation ?? name]} />
          <Legend formatter={(value: string) => series.find((s: any) => String(s.teamId) === value)?.abbreviation ?? value} wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
          {series.map((s: any) => {
            const color = teamColorById(s.teamId)
            return (
              <Line
                key={s.teamId}
                type="monotone"
                dataKey={String(s.teamId)}
                stroke={color}
                strokeWidth={2}
                dot={makeLogoDotRenderer(s.teamId, color, s.points?.length ?? 0, logoSize, staggerRanks[s.teamId] ?? 0)}
                connectNulls
                name={String(s.teamId)}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function StandingsChart({ defaultDivision = 'AL East' }: { defaultDivision?: string }) {
  const [division, setDivision] = useState(defaultDivision)
  const [series, setSeries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const expandedChartRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  setDivision(defaultDivision)
}, [defaultDivision])
  useEffect(() => {
    setLoading(true)
    fetch(`/api/lab/standings-trend?division=${encodeURIComponent(division)}`)
      .then(r => r.json())
      .then(j => setSeries(j.series ?? []))
      .finally(() => setLoading(false))
  }, [division])

  useEffect(() => {
    if (!expanded) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', fn)
      document.body.style.overflow = ''
    }
  }, [expanded])

  return (
    <div className="border-t border-stone-200 pt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400">Standings progression</div>
        <div className="flex items-center gap-2">
          <select value={division} onChange={e => setDivision(e.target.value)} className="text-[10px] font-mono border border-stone-300 px-2 py-1 uppercase">
            {DIVISION_KEYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[10px] font-mono border border-stone-300 px-2 py-1 uppercase hover:border-stone-900 transition"
            aria-label="Expand chart"
          >
            ⤢
          </button>
          <CardExportToolbar targetRef={chartRef} fileName={`standings-${division}-the-edge`.replace(/\s+/g, '-').toLowerCase()} />
        </div>
      </div>

      {loading ? (
        <p className="text-xs font-mono text-stone-400 py-6">Loading…</p>
      ) : (
        <StandingsLineChart series={series} chartHeight={220} logoSize={14} chartRef={chartRef} />
      )}

      {expanded && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setExpanded(false)}
        >
          <div
            style={{ background: '#FAF8F3', borderRadius: 16, maxWidth: 900, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] font-bold">
                {division} · Standings progression
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-stone-500 hover:text-stone-900 text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <StandingsLineChart series={series} chartHeight={480} logoSize={32} chartRef={expandedChartRef} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}