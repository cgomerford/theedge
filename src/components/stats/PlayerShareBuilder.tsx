'use client'

// src/components/stats/PlayerShareBuilder.tsx
//
// Standalone page: pick a window ("Last X Games"), see it against the
// player's season baseline, generate a branded PNG share card, and get
// ready-to-post tweet text. Linked from a player's name in /stats.
//
// Rate stats (AVG/OBP/SLG/ERA/WHIP etc.) are computed by summing counting
// stats over each window and dividing once — see stats-gamelog.ts for why
// that matters (averaging per-game rate stats directly is mathematically
// wrong for small samples).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  aggregateBatting, aggregatePitching,
  type BatterGame, type PitcherGame,
} from '@/lib/stats-gamelog'
import { MLB_TEAMS } from '@/lib/teams'

type Subject = 'batter' | 'pitcher'

// ── Feature flag ──────────────────────────────────────────────────────────
const GATE_SEASON_PROGRESSION = false

const TEAM_COLORS: Record<string, string> = Object.fromEntries(
  MLB_TEAMS.map(t => [t.abbrev, t.primary_color])
)

function headshotUrl(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_300,q_100/v1/people/${id}/headshot/67/current`
}

type Row = { key: string; label: string; format: (v: number) => string; higherIsBetter: boolean }

const BATTER_ROWS: Row[] = [
  { key: 'avg', label: 'AVG', format: v => v.toFixed(3).replace(/^0/, ''), higherIsBetter: true },
  { key: 'obp', label: 'OBP', format: v => v.toFixed(3).replace(/^0/, ''), higherIsBetter: true },
  { key: 'slg', label: 'SLG', format: v => v.toFixed(3).replace(/^0/, ''), higherIsBetter: true },
  { key: 'ops', label: 'OPS', format: v => v.toFixed(3), higherIsBetter: true },
  { key: 'hrPerG', label: 'HR/G', format: v => v.toFixed(2), higherIsBetter: true },
  { key: 'rbiPerG', label: 'RBI/G', format: v => v.toFixed(2), higherIsBetter: true },
  { key: 'bbPerG', label: 'BB/G', format: v => v.toFixed(2), higherIsBetter: true },
  { key: 'soPerG', label: 'K/G', format: v => v.toFixed(2), higherIsBetter: false },
  { key: 'sbPerG', label: 'SB/G', format: v => v.toFixed(2), higherIsBetter: true },
]

const PITCHER_ROWS: Row[] = [
  { key: 'era', label: 'ERA', format: v => v.toFixed(2), higherIsBetter: false },
  { key: 'whip', label: 'WHIP', format: v => v.toFixed(2), higherIsBetter: false },
  { key: 'k9', label: 'K/9', format: v => v.toFixed(1), higherIsBetter: true },
  { key: 'bb9', label: 'BB/9', format: v => v.toFixed(1), higherIsBetter: false },
  { key: 'ipPerG', label: 'IP/G', format: v => v.toFixed(1), higherIsBetter: true },
]

function batterWindowStats(games: BatterGame[]) {
  const agg = aggregateBatting(games)
  const g = agg.g || 1
  return {
    avg: agg.avg, obp: agg.obp, slg: agg.slg, ops: agg.ops,
    hrPerG: agg.hr / g, rbiPerG: agg.rbi / g, bbPerG: agg.bb / g, soPerG: agg.so / g, sbPerG: agg.sb / g,
  } as Record<string, number | null>
}

function pitcherWindowStats(games: PitcherGame[]) {
  const agg = aggregatePitching(games)
  const g = agg.g || 1
  return {
    era: agg.era, whip: agg.whip, k9: agg.k9, bb9: agg.bb9, ipPerG: agg.ip / g,
  } as Record<string, number | null>
}

const COUNT_KEY: Record<string, string> = { hrPerG: 'hr', rbiPerG: 'rbi', bbPerG: 'bb', soPerG: 'so', sbPerG: 'sb', ipPerG: 'ip' }

function seriesFor(row: Row, games: (BatterGame | PitcherGame)[], subject: Subject): number[] {
  if (games.length === 0) return []
  const countKey = COUNT_KEY[row.key]
  if (countKey) {
    return games.map(g => (g as any)[countKey] ?? 0)
  }
  return games.map((_, i) => {
    const slice = games.slice(0, i + 1)
    const agg = subject === 'batter' ? batterWindowStats(slice as BatterGame[]) : pitcherWindowStats(slice as PitcherGame[])
    return agg[row.key] ?? 0
  })
}

function progressionSeriesFor(row: Row, games: (BatterGame | PitcherGame)[], subject: Subject): number[] {
  if (games.length === 0) return []
  const countKey = COUNT_KEY[row.key]
  if (countKey) {
    let running = 0
    return games.map(g => { running += (g as any)[countKey] ?? 0; return running })
  }
  return games.map((_, i) => {
    const slice = games.slice(0, i + 1)
    const agg = subject === 'batter' ? batterWindowStats(slice as BatterGame[]) : pitcherWindowStats(slice as PitcherGame[])
    return agg[row.key] ?? 0
  })
}

function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    d += ` Q ${x0},${y0} ${mx},${my}`
  }
  const [lx, ly] = points[points.length - 1]
  d += ` L ${lx},${ly}`
  return d
}

function Sparkline({ values, color, width = 40, height = 14 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const points: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2),
  ])
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle">
      <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      <circle cx={lastX} cy={lastY} r={1.5} fill={color} />
    </svg>
  )
}

// ── Hover popover: enlarged chart + numbers, shown on hovering a sparkline ─
//
// Positioned with `fixed` deliberately — the comparison table wrapper has
// `overflow-hidden` for its rounded corners, which would clip an
// `absolute`-positioned popover. `fixed` escapes that (no ancestor here
// uses a CSS transform, which is the one thing that traps fixed elements).
function StatDetailPopover({
  row, contextLabel, series, anchorRect, onClose, onMouseEnter, onMouseLeave,
}: {
  row: Row
  contextLabel: string
  series: number[]
  anchorRect: DOMRect
  onClose: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const min = Math.min(...series)
  const max = Math.max(...series)
  const latest = series[series.length - 1]
  const chartData = series.map((v, i) => ({ i: i + 1, v }))

  const width = 380
  const left = typeof window === 'undefined' ? 0 : Math.min(Math.max(8, anchorRect.left - width / 2), window.innerWidth - width - 8)
  const showAbove = anchorRect.top > 260
  const top = showAbove ? anchorRect.top - 236 : anchorRect.bottom + 10

  return (
    <div
      className="fixed z-50 bg-white border border-stone-300 shadow-xl rounded-xl p-4"
      style={{ left, top, width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-500">{row.label} — {contextLabel}</p>
        <button type="button" onClick={onClose} className="text-stone-300 hover:text-stone-600 text-xs leading-none">✕</button>
      </div>
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="i" tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#a8a29e' }} />
              <YAxis tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#a8a29e' }} width={34} tickFormatter={v => row.format(v)} domain={['auto', 'auto']} />
              <Tooltip
                formatter={(value: unknown) => (typeof value === 'number' ? row.format(value) : '—')}
                labelFormatter={l => `Game ${l}`}
              />
              <Line type="monotone" dataKey="v" stroke="#FF5722" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="w-20 shrink-0 space-y-2 font-mono text-[10px]">
          <div><div className="text-stone-400 uppercase">Games</div><div className="font-bold text-stone-900">{series.length}</div></div>
          <div><div className="text-stone-400 uppercase">Latest</div><div className="font-bold text-stone-900">{row.format(latest)}</div></div>
          <div><div className="text-stone-400 uppercase">High</div><div className="font-bold text-stone-900">{row.format(max)}</div></div>
          <div><div className="text-stone-400 uppercase">Low</div><div className="font-bold text-stone-900">{row.format(min)}</div></div>
        </div>
      </div>
    </div>
  )
}

// Wraps a Sparkline with hover-to-open (150ms delay, avoids flicker on
// quick mouse passes) and click-to-toggle (works without hover — trackpad
// taps, touch devices, keyboard-adjacent users). A short delay on close
// (not on the wrapper itself, but shared with the popover's own hover
// handlers) lets the cursor travel from the sparkline to the popover
// without it vanishing mid-move.
function HoverSparkline({
  row, contextLabel, series, color, width = 40, height = 14,
}: {
  row: Row
  contextLabel: string
  series: number[]
  color: string
  width?: number
  height?: number
}) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  function openNow(rect: DOMRect) {
    clearTimer()
    setAnchorRect(rect)
    setOpen(true)
  }
  function scheduleClose() {
    clearTimer()
    timer.current = setTimeout(() => setOpen(false), 150)
  }
  function handleEnter(e: React.MouseEvent<HTMLDivElement>) {
    if (series.length < 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimer()
    timer.current = setTimeout(() => openNow(rect), 150)
  }

  if (series.length < 2) return <Sparkline values={series} color={color} width={width} height={height} />

  return (
    <div
      className="inline-block cursor-help"
      onMouseEnter={handleEnter}
      onMouseLeave={scheduleClose}
      onClick={e => openNow(e.currentTarget.getBoundingClientRect())}
    >
      <Sparkline values={series} color={color} width={width} height={height} />
      {open && anchorRect && (
        <StatDetailPopover
          row={row}
          contextLabel={contextLabel}
          series={series}
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
          onMouseEnter={clearTimer}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  )
}

// ── Season progression card — dropdown of every real season + a stat picker
function SeasonProgressionCard({
  playerId, subject, color, currentSeasonGames,
}: {
  playerId: number
  subject: Subject
  color: string
  currentSeasonGames: (BatterGame | PitcherGame)[]
}) {
  const thisYear = new Date().getFullYear()
  const rows = subject === 'batter' ? BATTER_ROWS : PITCHER_ROWS
  const defaultMetric = subject === 'batter' ? 'ops' : 'era'

  const [metricKey, setMetricKey] = useState(defaultMetric)
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [seasonsError, setSeasonsError] = useState<string | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([thisYear])
  const [seasonGames, setSeasonGames] = useState<Record<number, (BatterGame | PitcherGame)[]>>({ [thisYear]: currentSeasonGames })
  const [loadingSeasons, setLoadingSeasons] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    setSeasonsLoading(true)
    setSeasonsError(null)
    fetch(`/api/stats/seasons?subject=${subject}&playerId=${playerId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        setAvailableSeasons(json.seasons ?? [])
        if (json.error) setSeasonsError(json.error) // surfaced rather than silently treated as "no seasons"
      })
      .catch(err => {
        if (cancelled) return
        setAvailableSeasons([])
        setSeasonsError(err instanceof Error ? err.message : 'Failed to reach /api/stats/seasons')
      })
      .finally(() => { if (!cancelled) setSeasonsLoading(false) })
    return () => { cancelled = true }
  }, [playerId, subject])

  useEffect(() => {
    setSeasonGames(prev => ({ ...prev, [thisYear]: currentSeasonGames }))
  }, [currentSeasonGames, thisYear])

  useEffect(() => {
    setMetricKey(defaultMetric)
    setSelectedSeasons([thisYear])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, playerId])

  const MUTED_PALETTE = ['#78716c', '#a89e8c', '#c9beac', '#2563EB', '#15803D', '#9333EA', '#B45309', '#DB2777']
  function colorForSeason(season: number): string {
    if (season === thisYear) return color
    const distance = thisYear - season
    return MUTED_PALETTE[(distance - 1) % MUTED_PALETTE.length]
  }

  async function addSeason(season: number) {
    if (selectedSeasons.includes(season)) return
    setSelectedSeasons(prev => [...prev, season])
    if (season !== thisYear && !seasonGames[season] && !loadingSeasons.has(season)) {
      setLoadingSeasons(prev => new Set(prev).add(season))
      try {
        const params = new URLSearchParams({ subject, playerId: String(playerId), season: String(season) })
        const res = await fetch(`/api/stats/gamelog?${params}`, { cache: 'no-store' })
        const json = await res.json()
        setSeasonGames(prev => ({ ...prev, [season]: json.games ?? [] }))
      } catch {
        setSeasonGames(prev => ({ ...prev, [season]: [] }))
      } finally {
        setLoadingSeasons(prev => { const next = new Set(prev); next.delete(season); return next })
      }
    }
  }

  function removeSeason(season: number) {
    if (season === thisYear) return
    setSelectedSeasons(prev => prev.filter(s => s !== season))
  }

  const metricRow = rows.find(r => r.key === metricKey) ?? rows[0]

  const seriesBySeason = useMemo(() => {
    const out: Record<number, number[]> = {}
    for (const season of selectedSeasons) {
      const g = seasonGames[season]
      if (g) out[season] = progressionSeriesFor(metricRow, g, subject)
    }
    return out
  }, [selectedSeasons, seasonGames, metricRow, subject])

  const maxGames = Math.max(0, ...Object.values(seriesBySeason).map(s => s.length))
  const chartData = Array.from({ length: maxGames }, (_, i) => {
    const point: Record<string, number | null> = { gameNumber: i + 1 }
    for (const season of selectedSeasons) {
      point[String(season)] = seriesBySeason[season]?.[i] ?? null
    }
    return point
  })

  const addableSeasons = availableSeasons.filter(s => !selectedSeasons.includes(s))

  return (
    <div className="border border-stone-200 bg-white rounded-xl shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">Season progression</p>
          <p className="text-xs font-serif text-stone-400 italic">By game number, cumulative. Pick a stat and add any season to compare.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-3">
        {selectedSeasons.map(season => (
          <span
            key={season}
            className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 text-white"
            style={{ background: colorForSeason(season) }}
          >
            {loadingSeasons.has(season) ? `${season}…` : season}
            {season !== thisYear && (
              <button type="button" onClick={() => removeSeason(season)} className="hover:opacity-70" aria-label={`Remove ${season}`}>✕</button>
            )}
          </span>
        ))}

        {seasonsLoading ? (
          <span className="text-[9px] font-mono text-stone-300">Loading seasons…</span>
        ) : seasonsError ? (
          <span className="text-[9px] font-mono text-red-500">Couldn't load prior seasons ({seasonsError})</span>
        ) : addableSeasons.length > 0 ? (
          <select
            value=""
            onChange={e => { const v = Number(e.target.value); if (v) addSeason(v) }}
            className="text-[9px] font-mono uppercase tracking-widest border border-stone-300 px-2 py-1 text-stone-500 hover:border-stone-900 bg-white"
          >
            <option value="">+ Add season</option>
            {addableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : availableSeasons.length <= 1 ? (
          <span className="text-[9px] font-mono text-stone-300">No prior MLB seasons on record.</span>
        ) : null}
      </div>

      <div className="flex gap-1 flex-wrap mt-3 mb-4">
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => setMetricKey(row.key)}
            className={`text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 border ${metricKey === row.key ? 'bg-[#1A1A1A] text-[#FAF8F3] border-[#1A1A1A]' : 'border-stone-300 text-stone-500 hover:border-stone-900'}`}
          >
            {row.label}
          </button>
        ))}
      </div>

      {maxGames === 0 ? (
        <p className="text-xs font-mono text-stone-400 py-8 text-center">
          {selectedSeasons.length === 0 ? 'Select at least one season above.' : 'No games logged for the selected season(s) yet.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <XAxis dataKey="gameNumber" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }}
              label={{ value: 'Game #', position: 'insideBottom', offset: -2, fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }} domain={['auto', 'auto']} width={48}
              tickFormatter={v => metricRow.format(v)} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                if (typeof value !== 'number') return ['—', name] as [string, string]
                return [metricRow.format(value), name] as [string, string]
              }}
              labelFormatter={l => `Game ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
            {selectedSeasons.map(season => (
              <Line
                key={season}
                type="monotone"
                dataKey={String(season)}
                name={String(season)}
                stroke={colorForSeason(season)}
                strokeWidth={season === thisYear ? 2 : 1.5}
                strokeDasharray={season === thisYear ? undefined : '4 3'}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function PlayerShareBuilder({
  playerId, subject, name, team, pos, isSignedIn,
}: { playerId: number; subject: Subject; name: string; team: string; pos: string; isSignedIn: boolean }) {
  const [games, setGames] = useState<(BatterGame | PitcherGame)[]>([])
  const [loading, setLoading] = useState(true)
  const [windowSize, setWindowSize] = useState(14)
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showReferralPrompt, setShowReferralPrompt] = useState(false)
  const color = TEAM_COLORS[team] ?? '#1A1A1A'
  const rows = subject === 'batter' ? BATTER_ROWS : PITCHER_ROWS

  function requireSignIn() {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/?error=signin_required&returnTo=${returnTo}`
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      const params = new URLSearchParams({ subject, playerId: String(playerId), season: String(new Date().getFullYear()) })
      try {
        const res = await fetch(`/api/stats/gamelog?${params}`)
        const json = await res.json()
        if (!cancelled) setGames(json.games ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [subject, playerId])

  const lastX = games.slice(Math.max(0, games.length - windowSize))
  const firstN = games.slice(0, Math.max(0, games.length - windowSize))

  const lastXStats = useMemo(
    () => subject === 'batter' ? batterWindowStats(lastX as BatterGame[]) : pitcherWindowStats(lastX as PitcherGame[]),
    [lastX, subject]
  )
  const firstNStats = useMemo(
    () => subject === 'batter' ? batterWindowStats(firstN as BatterGame[]) : pitcherWindowStats(firstN as PitcherGame[]),
    [firstN, subject]
  )
  const seasonStats = useMemo(
    () => subject === 'batter' ? batterWindowStats(games as BatterGame[]) : pitcherWindowStats(games as PitcherGame[]),
    [games, subject]
  )

  const headline = useMemo(() => {
    let best: { row: Row; delta: number } | null = null
    for (const row of rows) {
      const a = lastXStats[row.key], b = seasonStats[row.key]
      if (a === null || a === undefined || b === null || b === undefined || b === 0) continue
      const pctDelta = ((a - b) / Math.abs(b)) * (row.higherIsBetter ? 1 : -1)
      if (!best || pctDelta > best.delta) best = { row, delta: pctDelta }
    }
    return best
  }, [rows, lastXStats, seasonStats])

  const tweetText = useMemo(() => {
    if (!headline) return ''
    const val = lastXStats[headline.row.key]
    const seasonVal = seasonStats[headline.row.key]
    if (val === null || val === undefined) return ''
    const trending = headline.delta > 0 ? 'heating up 🔥' : 'cooling off ❄️'
    const seasonStr = seasonVal !== null && seasonVal !== undefined ? headline.row.format(seasonVal) : '—'
    return `${name} is ${trending} — ${headline.row.format(val)} ${headline.row.label} over his last ${windowSize} games (season: ${seasonStr}). ⊕ via @edgereportdaily`
  }, [headline, lastXStats, seasonStats, name, windowSize])

  async function downloadCard() {
    if (!isSignedIn) { requireSignIn(); return }
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `${name.replace(/\s+/g, '-').toLowerCase()}-last-${windowSize}-games.png`
      link.href = dataUrl
      link.click()
      setShowReferralPrompt(true)
    } catch (err) {
      console.error('[PlayerShareBuilder] card export failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  function copyTweet() {
    if (!isSignedIn) { requireSignIn(); return }
    navigator.clipboard.writeText(tweetText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-24">
      <Link href="/stats" className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition-colors">← Back to Stats</Link>

      <div className="flex items-center gap-4 mt-4 mb-8">
        <div className="rounded-full shrink-0 flex items-center justify-center" style={{ width: 64, height: 64, background: color, padding: 5 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={headshotUrl(playerId)} alt={name} className="object-cover rounded-full w-full h-full" style={{ background: '#FAF8F3' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-900">{name}</h1>
          <p className="font-mono text-xs text-stone-500">{team} · {pos}</p>
        </div>
      </div>

      {!isSignedIn && (
        <div className="border border-[#FF5722]/30 bg-[#FFF3E0] rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
          <p className="font-serif text-sm text-stone-800">
            You're viewing {name.split(' ')[0]}'s last {windowSize} games. <b>Sign in free</b> to pick any window, download the card, and build your own.
          </p>
          <button
            onClick={requireSignIn}
            className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-4 py-2 rounded-lg hover:bg-[#FF5722] transition whitespace-nowrap"
          >
            Sign in free →
          </button>
        </div>
      )}

      {loading && <p className="font-mono text-sm text-stone-400">Loading game log…</p>}

      {!loading && games.length === 0 && (
        <p className="font-mono text-sm text-stone-400">No game log found for this player this season.</p>
      )}

      {!loading && games.length > 0 && (
        <>
          <div className="border border-stone-200 bg-white rounded-xl shadow-sm p-5 mb-6 flex items-center justify-center gap-6" style={{ borderTop: `3px solid ${color}` }}>
            <button
              onClick={() => isSignedIn ? setWindowSize(w => Math.max(1, w - 1)) : requireSignIn()}
              className="w-9 h-9 flex items-center justify-center border border-stone-300 rounded-lg font-mono hover:border-stone-900"
            >‹</button>
            <div className="text-center">
              <div className="font-display text-4xl leading-none">{windowSize}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mt-1">Last Games{!isSignedIn && ' 🔒'}</div>
            </div>
            <button
              onClick={() => isSignedIn ? setWindowSize(w => Math.min(games.length, w + 1)) : requireSignIn()}
              className="w-9 h-9 flex items-center justify-center border border-stone-300 rounded-lg font-mono hover:border-stone-900"
            >›</button>
          </div>

          <div className="border border-stone-200 bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="grid grid-cols-4 bg-[#1A1A1A] text-[#FAF8F3] font-mono text-[11px] uppercase tracking-wide">
              <div className="px-3 py-2.5">Stat</div>
              <div className="px-3 py-2.5 text-right">First {firstN.length} Games</div>
              <div className="px-3 py-2.5 text-right">Season/G</div>
              <div className="px-3 py-2.5 text-right">Last {windowSize}</div>
            </div>
            {rows.map(row => {
              const a = firstNStats[row.key], b = seasonStats[row.key], c = lastXStats[row.key]
              const delta = (c !== null && c !== undefined && b !== null && b !== undefined) ? c - b : null
              const improving = delta !== null && (row.higherIsBetter ? delta > 0 : delta < 0)
              const firstNSeries = seriesFor(row, firstN, subject)
              const seasonSeries = seriesFor(row, games, subject)
              const lastXSeries = seriesFor(row, lastX, subject)
              return (
                <div key={row.key} className="grid grid-cols-4 border-t border-stone-200 font-mono text-[13px]">
                  <div className="px-3 py-2.5 font-serif italic text-stone-600 bg-stone-50">{row.label}</div>
                  <div className="px-3 py-2.5 text-right text-stone-500">
                    <div>{a !== null && a !== undefined ? row.format(a) : '—'}</div>
                    <div className="mt-1 flex justify-end"><HoverSparkline row={row} contextLabel={`First ${firstN.length} Games`} series={firstNSeries} color="#a89e8c" /></div>
                  </div>
                  <div className="px-3 py-2.5 text-right">
                    <div>{b !== null && b !== undefined ? row.format(b) : '—'}</div>
                    <div className="mt-1 flex justify-end"><HoverSparkline row={row} contextLabel="Full Season" series={seasonSeries} color="#5b5347" /></div>
                  </div>
                  <div className="px-3 py-2.5 text-right font-semibold">
                    <div>
                      {c !== null && c !== undefined ? row.format(c) : '—'}
                      {delta !== null && Math.abs(delta) > 0.001 && (
                        <span className={`ml-1.5 text-[10px] ${improving ? 'text-[#FF5722]' : 'text-stone-400'}`}>
                          {delta > 0 ? '▲' : '▼'} {row.format(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex justify-end"><HoverSparkline row={row} contextLabel={`Last ${windowSize} Games`} series={lastXSeries} color="#FF5722" /></div>
                  </div>
                </div>
              )
            })}
          </div>

          {GATE_SEASON_PROGRESSION ? (
            <div className="border border-stone-200 bg-white rounded-xl shadow-sm p-8 text-center mb-6">
              <div className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-2">⊕ Pro feature</div>
              <p className="font-serif text-stone-700 text-base mb-1">Season progression — overlay seasons, pick your stat</p>
              <p className="text-sm font-serif text-stone-400 italic">Every game, plotted — exactly when this player got hot, and how it compares to prior years.</p>
            </div>
          ) : (
            <SeasonProgressionCard playerId={playerId} subject={subject} color={color} currentSeasonGames={games} />
          )}

          <div className="mb-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Share card preview</p>
            <div
              ref={cardRef}
              className="w-full max-w-md mx-auto"
              style={{ background: '#FAF8F3', border: '1px solid #1A1A1A', padding: 28, fontFamily: 'Fraunces, serif' }}
            >
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: '#FF5722', textTransform: 'uppercase', marginBottom: 10 }}>
                ⊕ The Edge · Last {windowSize} Games
              </div>
              <div style={{ height: 3, background: color, width: 48, marginBottom: 14, borderRadius: 2 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={headshotUrl(playerId)} alt={name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: '#FAF8F3' }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#7d7364' }}>{team} · {pos}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(rows.length, 5)}, 1fr)`, gap: 10 }}>
                {rows.slice(0, 5).map(row => {
                  const v = lastXStats[row.key]
                  const series = seriesFor(row, lastX, subject)
                  return (
                    <div key={row.key} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700 }}>{v !== null && v !== undefined ? row.format(v) : '—'}</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#7d7364', textTransform: 'uppercase', marginBottom: 4 }}>{row.label}</div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}><Sparkline values={series} color={color} width={30} height={11} /></div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e7e2d8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#a89e8c', letterSpacing: '0.05em' }}>edgereportdaily.com/stats</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#a89e8c' }}>⊕</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center mb-4">
            <button
              onClick={downloadCard}
              disabled={downloading}
              className="font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-4 py-2.5 rounded-lg hover:bg-[#FF5722] transition disabled:opacity-50"
            >
              {downloading ? 'Generating…' : isSignedIn ? 'Download share card' : 'Download share card 🔒'}
            </button>
          </div>

          {showReferralPrompt && (
            <div className="border border-[#FF5722]/30 bg-[#FFF3E0] rounded-xl p-4 mb-8 text-center">
              <p className="font-serif text-sm text-stone-800 mb-2">Nice card. Invite 2 friends to The Edge and get a free month of Pro.</p>
              <Link href="/account/referrals" className="font-mono text-[10px] uppercase tracking-widest text-[#FF5722] hover:underline">
                Get your invite link →
              </Link>
            </div>
          )}

          {tweetText && (
            <div className="border border-stone-200 bg-white rounded-xl shadow-sm p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Suggested tweet</p>
              <p className="font-serif text-sm text-stone-800 mb-3">{tweetText}</p>
              <button
                onClick={copyTweet}
                className="font-mono text-[10px] uppercase tracking-widest bg-white border border-stone-300 px-3.5 py-2 rounded-lg hover:border-[#FF5722] hover:text-[#FF5722] transition"
              >
                {copied ? 'Copied ✓' : isSignedIn ? 'Copy tweet text' : 'Copy tweet text 🔒'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}