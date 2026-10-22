'use client'

// src/components/stats/StatsExplorer.tsx
//
// Top-level state container for /stats.
//
// TABLE ARCHITECTURE NOTE: the main stats table is CSS Grid, not an HTML
// <table>. Every row (header + each data row) applies the exact same
// `gridTemplateColumns` string, generated once from cat.cols.length. This is
// deliberate — a previous <table>-based version kept drifting out of
// alignment every time sticky-column CSS got added to one row but not
// perfectly matched on the other, because <thead>/<tbody> are structurally
// two separate things trying to agree on column widths. Grid rows share one
// literal template string, so there's nothing left to drift: header and
// body are visually guaranteed to line up. Don't reintroduce <table> here
// without solving that problem first.
//
// Career mode is an HONEST PLACEHOLDER — it needs a player_career_events
// table + a transactions fetch script that don't exist yet (deferred to
// step 3 of the build). Do not fake it with generated data; say so in the UI.
//
// Trend mode is limited to the stats /api/lab/rolling already supports
// (era, fip, whip, k_per_9 / ops, slg, obp) — everything else in
// stats-columns.ts (Statcast, discipline, batted-ball) has no rolling-window
// endpoint yet.

import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent } from 'react'
import Link from 'next/link'
import {
  categoriesFor, POSITIONS, SIGNATURE_STAT,
  type StatColumn, type SubjectType,
} from '@/lib/stats-columns'
import { MLB_TEAMS, teamIdBySlug } from '@/lib/teams'
import type { StatsRow } from '@/lib/stats-data'
import { C, SANS, MONO, Card } from '@/components/team/ui'
import { Chip, CsvButton, Field, PngButton, ProLockBar, QUERY_CSS, Seg, labelStyle, selectStyle } from '@/components/stats/queryUi'

const ROLLING_COMPATIBLE: Record<string, string> = {
  era: 'era', whip: 'whip', fip: 'fip', k_per_9: 'k9',
  ops: 'ops', slg: 'slg', obp: 'obp',
}

const STAT_GLOSSARY: Record<string, string> = {
  ops: 'On-base % + Slugging % — quick overall offensive measure',
  iso: 'Isolated power — SLG minus AVG, raw extra-base-hit power',
  babip: 'Batting average on balls in play — luck/defense-adjusted contact quality',
  xwoba: 'Expected weighted on-base average — quality of contact, luck-stripped',
  xba: 'Expected batting average, from exit velocity + launch angle',
  xslg: 'Expected slugging, from exit velocity + launch angle',
  barrel_pct: '% of batted balls hit with ideal exit velo + launch angle combo',
  hard_hit_pct: '% of batted balls hit 95+ mph off the bat',
  sweet_spot_pct: '% of batted balls in the launch-angle range that produces hits',
  whip: 'Walks + hits per inning pitched — baserunners allowed',
  fip: 'Fielding-independent pitching — ERA estimate from K/BB/HR alone',
  xera: 'Expected ERA, from quality of contact allowed',
  xwoba_allowed: 'Expected wOBA allowed — quality of contact against, luck-stripped',
  swstr_pct: 'Swinging strike % — whiffs per pitch thrown',
  chase_rate: '% of pitches outside the zone that batters swing at',
  k_bb_ratio: 'Strikeouts per walk — command + stuff combined',
  quality_start_pct: '% of starts with 6+ IP and 3 or fewer earned runs',
  hr_per_fb: '% of fly balls allowed that leave the park',
  era_minus: 'ERA relative to league average, park-adjusted — 100 is average, lower is better',
  fip_minus: 'FIP relative to league average, park-adjusted — 100 is average, lower is better',
  xfip_minus: 'xFIP relative to league average, park-adjusted — 100 is average, lower is better',
  war: 'Wins Above Replacement — FanGraphs-sourced, likely blank for most players (see file note)',
}

type SortDir = 'asc' | 'desc'
type ChartMode = 'scatter' | 'trend' | 'career'

const TEAM_COLORS: Record<string, string> = Object.fromEntries(
  MLB_TEAMS.map(t => [t.abbrev, t.primary_color])
)

function headshotUrl(id: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_100/v1/people/${id}/headshot/67/current`
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Headshot({ id, name, color, size = 26 }: { id: number; name: string; color: string; size?: number }) {
  const [errored, setErrored] = useState(false)
  const ringPad = Math.max(2, Math.round(size * 0.08))
  if (errored || !id) {
    return (
      <div
        className="flex items-center justify-center text-white font-display rounded-full shrink-0"
        style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
      >
        {initials(name)}
      </div>
    )
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: color, padding: ringPad }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, size varies by context */}
      <img
        src={headshotUrl(id)}
        alt={name}
        onError={() => setErrored(true)}
        className="object-cover rounded-full w-full h-full transition-transform duration-200"
        style={{ background: '#FAF8F3' }}
      />
    </div>
  )
}

const HOVER_STYLES = `
  .stats-row { position: relative; }
  .stats-row::before {
    content: ''; position: absolute; inset: 0; left: -60%; width: 40%;
    background: linear-gradient(120deg, transparent, rgba(255,87,34,0.10), transparent);
    transition: left .45s ease; pointer-events: none; z-index: 0;
  }
  .stats-row:hover::before { left: 130%; }
  .stats-row:hover .stats-headshot { transform: scale(1.12); }
  @media (prefers-reduced-motion: reduce) {
    .stats-row::before { transition: none; display: none; }
    .stats-row:hover .stats-headshot { transform: none; }
  }
`

function PercentileRing({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const strokeWidth = 6
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3a3a3a" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight={700} fill="#FAF8F3">
        {pct}
      </text>
    </svg>
  )
}

const TOOLTIP_W = 224
const TOOLTIP_H = 176

type HoverInfo = {
  top: number
  left: number
  anchorX: number
  showBelow: boolean
  pct: number
  label: string
  glossary: string
  higherIsBetter?: boolean
}

function PercentileTooltip({ hover }: { hover: HoverInfo }) {
  const arrowLeft = Math.max(12, Math.min(hover.anchorX - hover.left, TOOLTIP_W - 12))
  return (
    <div
      className="fixed z-[999] flex flex-col items-center gap-2 bg-[#1A1A1A] text-[#FAF8F3] rounded-xl p-4 shadow-2xl pointer-events-none text-center"
      style={{ top: hover.top, left: hover.left, width: TOOLTIP_W }}
    >
      <div
        className="absolute w-2.5 h-2.5 bg-[#1A1A1A] rotate-45"
        style={
          hover.showBelow
            ? { bottom: '100%', left: arrowLeft, marginBottom: -6 }
            : { top: '100%', left: arrowLeft, marginTop: -6 }
        }
      />
      <PercentileRing pct={hover.pct} color={percentileTierColor(hover.pct)} />
      <div className="font-semibold text-sm">{hover.label}</div>
      <div className="text-[10px] text-stone-300">
        {hover.pct}th percentile{hover.higherIsBetter === false ? ' · lower raw values rank higher here' : ''}
      </div>
      <p className="italic text-[11px] text-stone-300 leading-snug">{hover.glossary}</p>
    </div>
  )
}

// Standalone copy of the percentile→color scale so the tooltip doesn't need
// the color threading through every mouse event — same thresholds as
// percentileColor in StatsExplorer, kept in sync manually since it's a pure
// function of pct alone.
function percentileTierColor(pct: number): string {
  if (pct >= 90) return '#FF5722'
  if (pct >= 70) return '#C2622A'
  if (pct >= 40) return '#a89e8c'
  return '#c4907e'
}

// ── the grid table ─────────────────────────────────────────────────────
// One template string, applied to the header and to every single body row.
// This is the entire fix for the alignment bug: there is no second place
// for column widths to be defined, so there's nothing to go out of sync.
function gridTemplate(colCount: number) {
  return `48px minmax(190px,240px) repeat(${colCount}, minmax(76px, 1fr))`
}

function StatsGrid({
  cols, rows, compare, toggleCompare, sortKey, sortDir, toggleSort, percentiles, percentileColor, compareLimit, subject,
}: {
  cols: StatColumn[]
  rows: StatsRow[]
  compare: Set<number>
  toggleCompare: (id: number) => void
  sortKey: string
  sortDir: SortDir
  toggleSort: (col: StatColumn) => void
  percentiles: Map<number, Map<string, number>>
  percentileColor: (pct: number) => string
  compareLimit: number
  subject: SubjectType
}) {
  const template = gridTemplate(cols.length)
  const minWidth = 48 + 220 + cols.length * 90
  const [hover, setHover] = useState<HoverInfo | null>(null)

  function showTooltip(e: MouseEvent<HTMLElement>, pct: number, c: StatColumn) {
    const rect = e.currentTarget.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const showBelow = spaceBelow > TOOLTIP_H + 12
    const top = showBelow ? rect.bottom + 8 : rect.top - TOOLTIP_H - 8
    const anchorX = rect.left + rect.width / 2
    let left = anchorX - TOOLTIP_W / 2
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8))
    setHover({
      top, left, anchorX, showBelow, pct,
      label: c.label,
      glossary: STAT_GLOSSARY[c.key] ?? `Better than ${pct}% of the players currently shown.`,
      higherIsBetter: c.higherIsBetter,
    })
  }

  return (
    <div className="overflow-x-auto relative" style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: '#fff' }}>
      {hover && <PercentileTooltip hover={hover} />}
      <div style={{ minWidth }}>
        {/* header */}
        <div className="grid" style={{ gridTemplateColumns: template, background: '#fff', borderBottom: `1px solid ${C.line}`, color: C.faint }}>
          <div />
          <div className="text-left px-3 py-2.5 text-[11px]">Player</div>
          {cols.map(c => (
            <button
              key={c.key}
              onClick={() => toggleSort(c)}
              title={STAT_GLOSSARY[c.key] ?? c.label}
              className={`text-right px-3 py-2.5 text-[11px] cursor-pointer whitespace-nowrap hover:text-[#FF5722] transition-colors ${sortKey === c.key ? 'text-[#FF5722] font-bold' : ''}`}
            >
              {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          ))}
        </div>

        {/* body */}
        {rows.map(p => {
          const selected = compare.has(p.id)
          const color = TEAM_COLORS[p.team] ?? '#555'
          return (
            <div
              key={p.id}
              className={`stats-row grid border-b border-stone-200 hover:bg-orange-50 transition-colors ${selected ? 'bg-orange-50' : 'bg-white'}`}
              style={{ gridTemplateColumns: template }}
            >
              <div className="flex items-center justify-center py-2">
                <button
                  onClick={() => toggleCompare(p.id)}
                  disabled={!selected && compare.size >= compareLimit}
                  title={!selected && compare.size >= compareLimit ? (compareLimit === 2 ? 'Free compares up to 2 — upgrade to Pro for 6' : `Compare is capped at ${compareLimit} — remove one first`) : undefined}
                  className={`w-6 h-6 rounded-full border text-xs transition-colors ${
                    selected
                      ? 'bg-[#FF5722] border-[#FF5722] text-white'
                      : compare.size >= compareLimit
                      ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                      : 'bg-white border-stone-300 text-stone-500 hover:border-[#FF5722]'
                  }`}
                >
                  {selected ? '✓' : '+'}
                </button>
              </div>

              <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
                <div className="stats-headshot transition-transform">
                  <Headshot id={p.id} name={p.name} color={color} size={30} />
                </div>
                <div className="min-w-0">
                 <Link
  href={`/mlb/players/${p.id}`}
  className="font-semibold text-[13px] text-stone-900 truncate hover:text-[#FF5722] transition-colors block"
>
  {p.name}
</Link>
                  <div className="text-[10px] text-stone-500 ">{p.team} · {p.pos}{p.age ? ` · ${p.age}y` : ''}</div>
                </div>
              </div>

              {cols.map(c => {
                const v = p.stats[c.key]
                const display = v === null || v === undefined ? '—' : (c.format ? c.format(v) : v)
                const pct = percentiles.get(p.id)?.get(c.key)
                return (
                  <div key={c.key} className="text-right px-3 py-2 text-[12.5px]">
                    <div className="font-semibold text-stone-900">{display}</div>
                    {pct !== undefined && (
                      <div
                        className="text-[9.5px] font-bold cursor-help inline-block"
                        style={{ color: percentileColor(pct) }}
                        onMouseEnter={e => showTooltip(e, pct, c)}
                        onMouseLeave={() => setHover(null)}
                      >
                        {pct}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
// Pro gating removed from this page entirely (2026-07-14) — every category,
// full compare limit, and every chart mode are open regardless of isPro.
// isPro kept in the prop signature (unused below) rather than touching
// every call site that passes it in from page.tsx.
export default function StatsExplorer({ isPro: viewerIsPro, isSignedIn }: { isPro: boolean; isSignedIn: boolean }) {
  // TEMP: Pro gates disabled site-wide until Stripe activation goes live.
  // Revert: delete this line, rename `_isPro` back to `isPro` in the params above.
  const isPro = true // legacy: compare limit / chart modes stay open. Export (PNG/CSV) below uses the real flag `viewerIsPro`.
  const tableRef = useRef<HTMLDivElement>(null)
  const [subject, setSubject] = useState<SubjectType>('batter')
  const [season, setSeason] = useState(new Date().getFullYear())
  const [teamSlug, setTeamSlug] = useState<string>('')
  const [positions, setPositions] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState('overview')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('ops')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [rows, setRows] = useState<StatsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [compare, setCompare] = useState<Set<number>>(new Set())
  const [trayOpen, setTrayOpen] = useState(false)
  const [chartMode, setChartMode] = useState<ChartMode>('scatter')
  const [xStat, setXStat] = useState('')
  const [yStat, setYStat] = useState('')
  const [trendStat, setTrendStat] = useState('')
  const [trendData, setTrendData] = useState<Record<number, { date: string; value: number | null }[]>>({})
  const [trendLoading, setTrendLoading] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const teamId = teamSlug ? teamIdBySlug(teamSlug) ?? undefined : undefined
  const cats = categoriesFor(subject)
  const cat = cats.find(c => c.key === category) ?? cats[0]

  function switchSubject(s: SubjectType) {
    setSubject(s)
    setTeamSlug(''); setPositions(new Set()); setCategory('overview')
    setSearch(''); setCompare(new Set()); setXStat(''); setYStat(''); setTrendStat('')
    setSortKey(SIGNATURE_STAT[s]); setSortDir(s === 'batter' ? 'desc' : 'asc')
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(null)

      if (subject === 'batter' && search.trim().length >= 2) {
        setLoading(true)
        const params = new URLSearchParams({ subject: 'batter', search: search.trim() })
        try {
          const res = await fetch(`/api/stats/players?${params}`)
          const json = await res.json()
          if (!cancelled) setRows(json.rows ?? [])
        } catch {
          if (!cancelled) setError("Couldn't search players — try again.")
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

     setLoading(true)
      // teamId is deliberately NOT sent here. Percentiles need the full
      // league pool in memory at all times — filtering server-side by team
      // silently turned "90th percentile" into "best of the ~13 players
      // left after filtering" (confirmed 2026-07-12: Bryce Harper showing
      // 100 percentile on a 3-player filtered Phillies view). Team and
      // position are both client-side filters over the same full pool now
      // — see visibleRows/percentiles below.
      const params = new URLSearchParams({ subject, season: String(season) })
      try {
        const res = await fetch(`/api/stats/players?${params}`)
        const json = await res.json()
        if (!cancelled) setRows(json.rows ?? [])
      } catch {
        if (!cancelled) setError(`Couldn't load ${subject} stats — try again.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const t = setTimeout(run, subject === 'batter' && search ? 300 : 0)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, season, search])
 const visibleRows = useMemo(() => {
    let r = rows
    if (teamId) r = r.filter(p => p.teamId === teamId)
    if (positions.size > 0) r = r.filter(p => positions.has(p.pos))
    r = [...r].sort((a, b) => {
      const av = a.stats[sortKey], bv = b.stats[sortKey]
      const an = av === null || av === undefined ? -Infinity : av
      const bn = bv === null || bv === undefined ? -Infinity : bv
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return r
  }, [rows, teamId, positions, sortKey, sortDir])
  function toggleSort(col: StatColumn) {
    if (sortKey === col.key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(col.key)
      setSortDir(col.higherIsBetter === false ? 'asc' : 'desc')
    }
  }

  function togglePos(p: string) {
    setPositions(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  function toggleCompare(id: number) {
    setCompare(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= COMPARE_LIMIT) return prev // silently ignore past the cap — button stays disabled-looking via the check below
        next.add(id)
      }
      return next
    })
  }

  const comparePlayers = useMemo(
    () => [...compare].map(id => rows.find(r => r.id === id)).filter(Boolean) as StatsRow[],
    [compare, rows]
  )

  const loadTrend = useCallback(async () => {
    if (chartMode !== 'trend' || !trendStat || comparePlayers.length === 0) return
    const metric = ROLLING_COMPATIBLE[trendStat]
    if (!metric) return
    setTrendLoading(true)
    try {
      const entries = await Promise.all(comparePlayers.map(async p => {
        const params = new URLSearchParams({ subjectType: subject, id: String(p.id), metric, window: '10' })
        const res = await fetch(`/api/lab/rolling?${params}`)
        const json = await res.json()
        return [p.id, json.points ?? []] as const
      }))
      setTrendData(Object.fromEntries(entries))
    } catch {
      // leave trendData as-is
    } finally {
      setTrendLoading(false)
    }
  }, [chartMode, trendStat, comparePlayers, subject])

  useEffect(() => { loadTrend() }, [loadTrend])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (document.activeElement as HTMLElement)?.blur()
        return
      }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      else if (e.key === '?') { setHelpOpen(true) }
      else if (e.key === 'Escape') { setHelpOpen(false) }
      else if (e.key === 'c') { setTrayOpen(o => !o) }
      else if (e.key === '1') { switchSubject('batter') }
      else if (e.key === '2') { switchSubject('pitcher') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rollableCols = cat.cols.filter(c => ROLLING_COMPATIBLE[c.key])

 // Always computed against the FULL fetched pool (`rows`), never against
  // the filtered/displayed set (`visibleRows`). Team/position filters
  // change what's on screen, not what "90th percentile" means — same
  // convention Savant uses (percentile is always vs. the whole qualified
  // league, regardless of which leaderboard view you're filtering to).
  // Known remaining narrow-pool case: batter name search only returns a
  // handful of matches, so percentile there is still low-sample — pre-
  // existing limitation of search mode, not something this change touches.
  const percentiles = useMemo(() => {
    const map = new Map<number, Map<string, number>>()
    if (rows.length < 2) return map
    for (const col of cat.cols) {
      const vals = rows.map(r => r.stats[col.key]).filter((v): v is number => v !== null && v !== undefined)
      if (vals.length < 2) continue
      const sorted = [...vals].sort((a, b) => a - b)
      for (const row of rows) {
        const v = row.stats[col.key]
        if (v === null || v === undefined) continue
        let rank = sorted.filter(x => x <= v).length / sorted.length
        if (col.higherIsBetter === false) rank = 1 - rank
        const pct = Math.round(rank * 100)
        if (!map.has(row.id)) map.set(row.id, new Map())
        map.get(row.id)!.set(col.key, pct)
      }
    }
    return map
  }, [rows, cat])

 const ROW_LIMIT = 25
  const COMPARE_LIMIT = 6
  const displayRows = visibleRows.slice(0, ROW_LIMIT)
  function percentileColor(pct: number): string {
    if (pct >= 90) return '#FF5722'
    if (pct >= 70) return '#C2622A'
    if (pct >= 40) return '#a89e8c'
    return '#c4907e'
  }

  return (
    <div className="tp-root" style={{ maxWidth: 1560, margin: '0 auto', padding: '16px 24px 170px', fontFamily: SANS, color: C.ink }}>
      <style>{HOVER_STYLES}</style>
      <style>{QUERY_CSS}</style>
      <style>{`.tp-root b,.tp-root strong,.tp-root h1,.tp-root h2,.tp-root h3{font-variant-numeric:tabular-nums}`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 2 }}>⊕ Player explorer</div>
          <div style={{ fontFamily: SANS, fontSize: 14, color: '#5b5347' }}>Every player, every number, side by side — sort, filter, compare.</div>
        </div>
        <button type="button" onClick={() => setHelpOpen(true)}
          style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>
          How to use
        </button>
      </div>

      <Card title="Filters" note={`${new Date().getFullYear() === season ? 'Current season' : season} · ${subject === 'batter' ? 'Batters' : 'Pitchers'}${teamSlug ? ` · ${MLB_TEAMS.find(t => t.slug === teamSlug)?.short ?? ''}` : ''}`}>
        <div className="ql-grid">
          <Field label="Players">
            <Seg<SubjectType> value={subject} onChange={switchSubject} options={[{ key: 'batter', label: 'Batters' }, { key: 'pitcher', label: 'Pitchers' }]} />
          </Field>
          <Field label="Season">
            <select style={selectStyle} value={season} onChange={e => setSeason(Number(e.target.value))}>
              {Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Team">
            <select style={selectStyle} value={teamSlug} onChange={e => setTeamSlug(e.target.value)}>
              <option value="">All teams</option>
              {MLB_TEAMS.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </Field>
          <Field label={subject === 'batter' ? 'Search (any team)  ·  press /' : 'Search  ·  press /'}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" style={selectStyle} />
          </Field>
        </div>
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.soft}`, paddingTop: 12 }}>
          <div style={labelStyle}>⊕ {subject === 'batter' ? 'Position' : 'Role'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {POSITIONS[subject].map(p => <Chip key={p} on={positions.has(p)} onClick={() => togglePos(p)}>{p}</Chip>)}
            {positions.size > 0 && <button type="button" onClick={() => setPositions(new Set())} style={{ fontFamily: SANS, fontSize: 12, border: 'none', background: 'transparent', color: C.orange, cursor: 'pointer', fontWeight: 700 }}>Clear</button>}
          </div>
        </div>
      </Card>

      <div style={{ ...labelStyle, margin: '18px 0 6px' }}>§ Stat group</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {cats.map(c => (
          <button key={c.key} type="button" onClick={() => setCategory(c.key)}
            style={{
              fontFamily: SANS, fontWeight: 800, fontSize: 13, padding: '7px 13px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${category === c.key ? C.ink : C.line}`, background: category === c.key ? C.ink : '#fff', color: category === c.key ? '#fff' : C.mute,
            }}>{c.label}</button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      {loading && <p className="text-sm text-stone-400 mt-4">Loading…</p>}

      {!loading && visibleRows.length === 0 && !error && (
        <p className="text-sm text-stone-400 mt-6">No players match those filters.</p>
      )}

      {visibleRows.length > 0 && (
        <>
          {viewerIsPro ? (
            <div data-noexport="1" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
              <CsvButton isPro={viewerIsPro} filename={`edge-players-${subject}-${season}.csv`} headers={['Player', 'Team', 'Pos', ...cat.cols.map(c => c.label)]}
                rows={displayRows.map(p => [p.name, p.team, p.pos, ...cat.cols.map(c => { const v = p.stats[c.key]; return v === null || v === undefined ? '' : (c.format ? c.format(v) : v) })])} />
              <PngButton isPro={viewerIsPro} target={tableRef} filename={`edge-players-${subject}-${season}.png`} />
            </div>
          ) : (
            <div style={{ marginBottom: 10 }}><ProLockBar features={['PNG export', 'CSV download']} /></div>
          )}
          <div ref={tableRef} style={{ background: C.cream, padding: 4 }}>
          <StatsGrid
            cols={cat.cols}
            rows={displayRows}
            compare={compare}
            toggleCompare={toggleCompare}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            percentiles={percentiles}
            percentileColor={percentileColor}
            compareLimit={COMPARE_LIMIT}
            subject={subject}
          />
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 10 }}>The Edge · edgereportdaily.com — {season} {subject === 'batter' ? 'batters' : 'pitchers'}, {cat.label}. Percentiles are against the full league pool.</div>
          </div>
          {visibleRows.length > ROW_LIMIT && (
            <p className="text-[10px] text-stone-400 mt-2">
              Showing top {ROW_LIMIT} of {visibleRows.length}, sorted by {cat.cols.find(c => c.key === sortKey)?.label ?? sortKey}. Narrow with team/position/search or sort by a different stat to see others.
            </p>
          )}
        </>
      )}

      {compare.size > 0 && (
        <div className="fixed left-0 right-0 bottom-0 bg-[#1A1A1A] text-[#FAF8F3] z-40 rounded-t-2xl shadow-2xl">
          <div
            onClick={() => setTrayOpen(o => !o)}
            className="flex items-center justify-between px-6 h-11 cursor-pointer max-w-6xl mx-auto"
          >
            <span className="text-[11px] uppercase tracking-widest">
              Compare <span className="bg-[#FF5722] text-white px-1.5 py-0.5 ml-1.5 rounded-full">{compare.size}</span>
              <span className="text-stone-500 normal-case ml-1">/ {COMPARE_LIMIT}</span>
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={e => { e.stopPropagation(); setCompare(new Set()) }}
                className="text-[10px] uppercase tracking-widest text-stone-400 hover:text-[#FF5722] transition-colors"
              >
                Clear all
              </button>
              <span className="text-[11px] uppercase tracking-widest">{trayOpen ? '▼ hide' : '▲ show'}</span>
            </div>
          </div>
          {trayOpen && (
            <div className="flex flex-wrap gap-2 px-6 pb-4 max-w-6xl mx-auto">
              {comparePlayers.map(p => (
                <span key={p.id} className="flex items-center gap-1.5 bg-[#2a2a2a] pl-2.5 pr-1.5 py-1.5 rounded-full text-[11px] hover:bg-[#3a3a3a] transition-colors">
                  {p.name}
                  <button onClick={() => toggleCompare(p.id)} className="text-stone-400 hover:text-[#FF5722] transition-colors">✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {comparePlayers.length > 0 && (
        <div className="mt-10">
          <h2 className="text-2xl font-bold text-stone-900 mb-1">Compare</h2>
          <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-4">
            {comparePlayers.length} player{comparePlayers.length === 1 ? '' : 's'} selected
          </p>

          <div className="border border-stone-200 bg-white p-4 rounded-xl shadow-sm flex flex-wrap items-end gap-4 mb-4">
        <div className="flex bg-stone-100 p-1 rounded-full">
              {(['scatter', 'trend', 'career'] as ChartMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`text-[10.5px] uppercase px-3.5 py-2 rounded-full transition ${
                    chartMode === m ? 'bg-[#1A1A1A] text-yellow-300' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {m === 'scatter' ? 'Scatter' : m === 'trend' ? 'Trend (10gm)' : 'Career'}
                </button>
              ))}
            </div>

            {chartMode === 'scatter' && (
              <>
                <StatSelect label="X axis" cols={cat.cols} value={xStat} onChange={setXStat} />
                <StatSelect label="Y axis" cols={cat.cols} value={yStat} onChange={setYStat} />
              </>
            )}
            {chartMode === 'trend' && (
              <StatSelect label="Stat" cols={rollableCols} value={trendStat} onChange={setTrendStat} />
            )}
          </div>

          <div className="border border-stone-200 bg-white p-5 rounded-xl shadow-sm mb-6">
            {chartMode === 'scatter' && (
              xStat && yStat
                ? <ScatterChart rows={visibleRows} compare={compare} xKey={xStat} yKey={yStat} cols={cat.cols} colorFor={id => TEAM_COLORS[rows.find(r => r.id === id)?.team ?? ''] ?? '#999'} />
                : <EmptyChart text="Choose an X and a Y stat to plot the currently visible players. Selected players are highlighted." />
            )}
            {chartMode === 'trend' && (
              rollableCols.length === 0
                ? <EmptyChart text="None of this category's stats have a rolling-window endpoint yet — only ERA/WHIP/FIP/K-9 (pitchers) or OPS/SLG/OBP (batters) support Trend." />
                : !trendStat
                ? <EmptyChart text="Choose a stat above to see each selected player's last 10-game rolling window." />
                : trendLoading
                ? <EmptyChart text="Loading…" />
                : <TrendChart players={comparePlayers} data={trendData} statLabel={cat.cols.find(c => c.key === trendStat)?.label ?? trendStat} colorFor={id => TEAM_COLORS[rows.find(r => r.id === id)?.team ?? ''] ?? '#999'} />
            )}
            {chartMode === 'career' && (
              <div className="text-center py-16 px-6">
                <p className="text-xs text-stone-500 mb-2">Career mode isn't wired up yet.</p>
                <p className="italic text-sm text-stone-400 max-w-md mx-auto">
                  It needs a transactions/IL-stint data source we haven't built (trades + injury dates aren't in any table yet) —
                  deliberately not faking it with generated data here.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 shadow-sm overflow-x-auto">
            <div className="grid" style={{ gridTemplateColumns: `180px repeat(${comparePlayers.length}, minmax(140px, 1fr))` }}>
              <div className="bg-stone-100 px-3.5 py-2.5 text-[12.5px] font-medium">Stat</div>
              {comparePlayers.map(p => (
                <div key={p.id} className="bg-stone-100 px-3.5 py-2.5" style={{ color: TEAM_COLORS[p.team] ?? '#555' }}>
                  <div className="flex items-center gap-2 mb-1 text-[12.5px] whitespace-nowrap">
                    <Headshot id={p.id} name={p.name} color={TEAM_COLORS[p.team] ?? '#555'} size={22} />
                    {p.name}
                  </div>
                  <span className="text-stone-400 text-[11px]">{p.team} · {p.pos}</span>
                </div>
              ))}

              {cat.cols.map(c => {
                const vals = comparePlayers.map(p => p.stats[c.key])
                const numeric = vals.filter((v): v is number => v !== null && v !== undefined)
                const best = numeric.length ? (c.higherIsBetter === false ? Math.min(...numeric) : Math.max(...numeric)) : null
                return (
                  <div key={c.key} className="contents">
                    <div className="px-3.5 py-2 italic text-stone-600 bg-stone-50 border-t border-stone-200 text-[12.5px]">{c.label}</div>
                    {comparePlayers.map(p => {
                      const v = p.stats[c.key]
                      const display = v === null || v === undefined ? '—' : (c.format ? c.format(v) : v)
                      return (
                        <div key={p.id} className={`px-3.5 py-2 border-t border-stone-200 text-[12.5px] ${v === best ? 'text-[#FF5722] font-bold' : ''}`}>
                          {display}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    

      {helpOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center pt-24 px-4" onClick={() => setHelpOpen(false)}>
          <div className="bg-[#FAF8F3] border border-[#1A1A1A] rounded-2xl max-w-lg w-full p-7 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-2xl font-bold mb-1">How to use The Stats</h3>
            <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-4">⊕ Quick guide</p>
            <div className="space-y-2 text-xs mb-5">
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <span className="text-sm">Focus search</span>
                <kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">/</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <span className="text-sm">Switch Batters / Pitchers</span>
                <span><kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">1</kbd> / <kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">2</kbd></span>
              </div>
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <span className="text-sm">Open / close the compare tray</span>
                <kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">c</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <span className="text-sm">Open / close this panel</span>
                <span><kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">?</kbd> / <kbd className="bg-[#1A1A1A] text-yellow-300 px-2 py-0.5 rounded">Esc</kbd></span>
              </div>
            </div>
            <ul className="space-y-2.5 text-sm text-stone-700">
              <li>Click any column header to sort by it — hover a header for what it means.</li>
              <li>Click <b>+</b> next to a player to send them to Compare, down at the bottom.</li>
              <li>In Compare, choose two stats to plot everyone on the table as a scatter chart.</li>
              <li>Trend shows the last 10 games — works for ERA/WHIP/FIP/K-9 and OPS/SLG/OBP only, for now.</li>
            </ul>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-6 text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-4 py-2.5 rounded-lg hover:bg-[#FF5722] transition"
            >
              Got it →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatSelect({ label, cols, value, onChange }: { label: string; cols: StatColumn[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-stone-400">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="border border-stone-300 px-3 py-2 rounded-lg text-xs bg-white min-w-[150px]">
        <option value="">— choose —</option>
        {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
    </div>
  )
}

function EmptyChart({ text }: { text: string }) {
  return <div className="text-center text-xs text-stone-500 py-20 px-6 max-w-md mx-auto">{text}</div>
}

function ScatterChart({
  rows, compare, xKey, yKey, cols, colorFor,
}: {
  rows: StatsRow[]; compare: Set<number>; xKey: string; yKey: string; cols: StatColumn[]; colorFor: (id: number) => string
}) {
  const xCol = cols.find(c => c.key === xKey), yCol = cols.find(c => c.key === yKey)
  const pts = rows
    .map(r => ({ r, x: r.stats[xKey], y: r.stats[yKey] }))
    .filter((p): p is { r: StatsRow; x: number; y: number } => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined)

  if (pts.length === 0) return <EmptyChart text="No players have both stats populated yet." />

  const W = 1000, H = 420, PAD = 60
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys)
  const sx = (v: number) => PAD + (v - xMin) / ((xMax - xMin) || 1) * (W - PAD * 1.5)
  const sy = (v: number) => H - PAD - (v - yMin) / ((yMax - yMin) || 1) * (H - PAD * 1.6)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 420 }}>
      <line x1={PAD} y1={H - PAD} x2={W - 20} y2={H - PAD} stroke="#a89e8c" />
      <line x1={PAD} y1={20} x2={PAD} y2={H - PAD} stroke="#a89e8c" />
      <text x={W / 2} y={H - 14} textAnchor="middle" fontSize="11" fill="#5b5347">{xCol?.label} →</text>
      <text x={18} y={H / 2} textAnchor="middle" fontSize="11" fill="#5b5347" transform={`rotate(-90 18 ${H / 2})`}>{yCol?.label} →</text>
      {pts.map(p => {
        const sel = compare.has(p.r.id)
        const color = colorFor(p.r.id)
        return (
          <g key={p.r.id}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={sel ? 8 : 4.5} fill={sel ? color : '#d9d2c4'} opacity={sel ? 1 : 0.5} stroke={sel ? '#1A1A1A' : 'none'} strokeWidth={sel ? 1.5 : 0} />
            {sel && <text x={sx(p.x) + 11} y={sy(p.y) + 4} fontSize="11" fill="#1A1A1A">{p.r.name}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function TrendChart({
  players, data, statLabel, colorFor,
}: {
  players: StatsRow[]; data: Record<number, { date: string; value: number | null }[]>; statLabel: string; colorFor: (id: number) => string
}) {
  const series = players.map(p => ({ p, pts: (data[p.id] ?? []).filter(pt => pt.value !== null) }))
  const hasAny = series.some(s => s.pts.length > 0)
  if (!hasAny) return <EmptyChart text="No rolling data came back for these players yet." />

  const W = 1000, H = 420, PAD = 60
  const allVals = series.flatMap(s => s.pts.map(pt => pt.value as number))
  const yMin = Math.min(...allVals), yMax = Math.max(...allVals)
  const maxLen = Math.max(...series.map(s => s.pts.length), 1)
  const sx = (i: number) => PAD + i / (maxLen - 1 || 1) * (W - PAD - 20)
  const sy = (v: number) => H - PAD - (v - yMin) / ((yMax - yMin) || 1) * (H - PAD * 1.6)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 420 }}>
      <line x1={PAD} y1={H - PAD} x2={W - 20} y2={H - PAD} stroke="#a89e8c" />
      <line x1={PAD} y1={20} x2={PAD} y2={H - PAD} stroke="#a89e8c" />
      <text x={W / 2} y={H - 14} textAnchor="middle" fontSize="11" fill="#5b5347">last 10-game window, most recent games →</text>
      <text x={18} y={H / 2} textAnchor="middle" fontSize="11" fill="#5b5347" transform={`rotate(-90 18 ${H / 2})`}>{statLabel} →</text>
      {series.map(({ p, pts }) => {
        if (pts.length === 0) return null
        const color = colorFor(p.id)
        const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(pt.value as number)}`).join(' ')
        const last = pts[pts.length - 1]
        return (
          <g key={p.id}>
            <path d={d} fill="none" stroke={color} strokeWidth={2.5} />
            <text x={sx(pts.length - 1) + 8} y={sy(last.value as number) + 4} fontSize="11" fontWeight={700} fill={color}>{p.name}</text>
          </g>
        )
      })}
    </svg>
  )
}