// Head-to-head lineup comparison, paired by fielding position (C vs C,
// SS vs SS, ...) rather than batting order — a "how do these two stack up"
// question is a position question, not a lineup-slot question (2026-07-13).
//
// Percentile RINGS are position-relative per player individually (a 1B's
// ring is vs other 1B, an RF's ring is vs other RF) — decided 2026-07-13.
// The "leads N of M" bar per pair is computed off RAW values instead,
// since percentile from two different position pools isn't directly
// comparable to each other.
//
// Data: reuses the same bulk /api/stats/players batter endpoint /stats
// already calls — one fetch, no new backend route.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { playerHeadshotUrl } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import { categoriesFor, STAT_GLOSSARY, type StatColumn } from '@/lib/stats-columns'
import { computeGroupedPercentiles, type PercentileMap } from '@/lib/percentiles'
import type { StatsRow } from '@/lib/stats-data'
import type { LineupBatter } from '@/lib/lineups'
import PercentileRing, { PercentileTooltip, percentileTierColor, TOOLTIP_W, TOOLTIP_H, type HoverInfo } from '@/components/PercentileRing'

const TEAM_COLORS: Record<string, string> = Object.fromEntries(
  MLB_TEAMS.map(t => [t.abbrev, t.primary_color])
)

const POSITION_ORDER = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']

type Props = {
  awayBatters: LineupBatter[]
  homeBatters: LineupBatter[]
  awayAbbr: string
  homeAbbr: string
  isPro: boolean
}

export default function LineupCompare({ awayBatters, homeBatters, awayAbbr, homeAbbr, isPro }: Props) {
  const [rows, setRows] = useState<StatsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('overview')
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const cats = categoriesFor('batter')
  const cat = cats.find(c => c.key === category) ?? cats[0]

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/stats/players?subject=batter&season=${new Date().getFullYear()}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setRows(json.rows ?? []) })
      .catch(() => { if (!cancelled) setError("Couldn't load comparison data — try again.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const percentiles: PercentileMap = useMemo(
    () => computeGroupedPercentiles(rows, cat.cols, r => r.pos),
    [rows, cat]
  )

  const rowById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  // Paired by fielding position instead of batting order.
  const pairs = useMemo(() => {
    const positions = new Set<string>()
    awayBatters.forEach(b => positions.add(b.position))
    homeBatters.forEach(b => positions.add(b.position))
    const sorted = [...positions].sort((a, b) => {
      const ai = POSITION_ORDER.indexOf(a), bi = POSITION_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    return sorted.map(position => ({
      position,
      away: awayBatters.find(b => b.position === position) ?? null,
      home: homeBatters.find(b => b.position === position) ?? null,
    }))
  }, [awayBatters, homeBatters])

  function showTooltip(e: React.MouseEvent<HTMLElement>, pct: number, c: StatColumn) {
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
      glossary: STAT_GLOSSARY[c.key] ?? `Better than ${pct}% of qualified players at the same position.`,
      higherIsBetter: c.higherIsBetter,
    })
  }

  if (loading) return <p className="text-sm font-mono text-stone-400 py-10 text-center">Loading comparison…</p>
  if (error) return <p className="text-sm font-mono text-red-600 py-10 text-center">{error}</p>

  return (
    <div className="space-y-4">
      {hover && <PercentileTooltip hover={hover} />}

      <div className="flex flex-wrap gap-1.5">
        {cats.map(c => {
          const locked = !isPro && c.key !== 'overview'
          return (
            <button
              key={c.key}
              onClick={() => locked ? setUpgradeReason(`${c.label} stats`) : setCategory(c.key)}
              className={`font-mono text-[10.5px] uppercase tracking-widest px-3.5 py-2 rounded-full border transition ${
                category === c.key ? 'bg-[#1A1A1A] text-yellow-300 border-[#1A1A1A]' : 'bg-white text-stone-500 border-stone-300 hover:border-stone-900'
              }`}
            >
              {c.label}{locked && ' 🔒'}
            </button>
          )
        })}
      </div>

      <p className="text-[10px] font-mono text-stone-400">
        Rings are ranked against other qualified players at the same position, league-wide — not against this lineup alone.
      </p>

    <div className="space-y-3">
        {pairs.map(({ position, away, home }) => (
          <LineupPairCard
            key={position}
            position={position}
            away={away}
            home={home}
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
            awayRow={away ? rowById.get(away.player_id) ?? null : null}
            homeRow={home ? rowById.get(home.player_id) ?? null : null}
            percentiles={percentiles}
            cols={cat.cols}
            onHover={showTooltip}
            onHoverEnd={() => setHover(null)}
            defaultOpen={false}
          />
        ))}
      </div>
      {upgradeReason && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center pt-24 px-4" onClick={() => setUpgradeReason(null)}>
          <div className="bg-[#FAF8F3] border border-[#1A1A1A] rounded-2xl max-w-sm w-full p-7 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">⊕ Pro feature</div>
            <h3 className="text-2xl font-serif font-bold mb-3">{upgradeReason} is Pro</h3>
            <p className="font-serif text-sm text-stone-600 mb-6">Free gets Overview. Pro unlocks Statcast, Plate discipline, and Baserunning comparisons for every batter in the lineup.</p>
            <a href="/pricing" className="block font-mono text-[10px] uppercase tracking-widest bg-[#1A1A1A] text-[#FAF8F3] px-4 py-3 rounded-lg hover:bg-[#FF5722] transition mb-3">See Pro →</a>
            <button onClick={() => setUpgradeReason(null)} className="font-mono text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-700">Not now</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerHeader({ batter, abbr, align }: { batter: LineupBatter | null; abbr: string; align: 'left' | 'right' }) {
  const color = TEAM_COLORS[abbr] ?? '#555'
  if (!batter) {
    return (
      <div className={`flex items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <div className="w-10 h-10 rounded-full bg-stone-100 shrink-0" />
        <div className="text-xs font-serif italic text-stone-400">Not in lineup</div>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <img
        src={playerHeadshotUrl(batter.player_id)}
        alt={batter.player_name}
        className="w-10 h-10 rounded-full object-cover shrink-0 border-2"
        style={{ borderColor: color }}
        onError={(e) => {
          e.currentTarget.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_80,h_80/v1/people/${batter.player_id}/headshot/milb/current`
          e.currentTarget.onerror = null
        }}
      />
      <div className="min-w-0">
        <div className="font-serif font-semibold text-sm text-stone-900 truncate">{batter.player_name}</div>
        <div className="text-[10px] font-mono text-stone-400">{abbr} · #{batter.batting_order}</div>
      </div>
    </div>
  )
}

function LineupPairCard({
  position, away, home, awayAbbr, homeAbbr, awayRow, homeRow, percentiles, cols, onHover, onHoverEnd, defaultOpen,
}: {
  position: string
  away: LineupBatter | null
  home: LineupBatter | null
  awayAbbr: string
  homeAbbr: string
  awayRow: StatsRow | null
  homeRow: StatsRow | null
  percentiles: PercentileMap
  cols: StatColumn[]
  onHover: (e: React.MouseEvent<HTMLElement>, pct: number, c: StatColumn) => void
  onHoverEnd: () => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  let awayLeads = 0, homeLeads = 0
  for (const c of cols) {
    const av = awayRow?.stats[c.key]
    const hv = homeRow?.stats[c.key]
    if (av == null || hv == null || av === hv) continue
    const awayBetter = c.higherIsBetter === false ? av < hv : av > hv
    if (awayBetter) awayLeads++
    else homeLeads++
  }
  const total = awayLeads + homeLeads

return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-100 text-left"
      >
        <PlayerHeader batter={away} abbr={awayAbbr} align="left" />
        <div className="flex items-center gap-2 shrink-0 px-3">
          <span className="text-[10px] font-mono font-bold text-stone-500">{position}</span>
          <span className={`text-stone-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
        <PlayerHeader batter={home} abbr={homeAbbr} align="right" />
      </button>

      {!open && total > 0 && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
            <span className={awayLeads > homeLeads ? 'text-[#FF5722] font-bold' : 'text-stone-400'}>{awayAbbr} {awayLeads}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-stone-100 flex">
              <div className="h-full bg-[#FF5722]" style={{ width: `${(awayLeads / total) * 100}%` }} />
              <div className="h-full bg-stone-800" style={{ width: `${(homeLeads / total) * 100}%` }} />
            </div>
            <span className={homeLeads > awayLeads ? 'text-stone-900 font-bold' : 'text-stone-400'}>{homeLeads} {homeAbbr}</span>
          </div>
        </div>
      )}

      {open && total > 0 && (
        <div className="px-4 py-2 border-b border-stone-100">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
            <span className={awayLeads > homeLeads ? 'text-[#FF5722] font-bold' : 'text-stone-400'}>{awayAbbr} {awayLeads}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-stone-100 flex">
              <div className="h-full bg-[#FF5722]" style={{ width: `${(awayLeads / total) * 100}%` }} />
              <div className="h-full bg-stone-800" style={{ width: `${(homeLeads / total) * 100}%` }} />
            </div>
            <span className={homeLeads > awayLeads ? 'text-stone-900 font-bold' : 'text-stone-400'}>{homeLeads} {homeAbbr}</span>
          </div>
        </div>
      )}

     {open && (!awayRow || !homeRow) && (
        <p className="px-4 py-3 text-[10px] font-mono text-stone-400 italic">
          {!awayRow && !homeRow ? 'Stats unavailable for both batters this category.' : `Stats unavailable for ${!awayRow ? awayAbbr : homeAbbr}'s batter.`}
        </p>
      )}

      {open && (
      <div className="divide-y divide-stone-50">
        {cols.map(c => {
          const av = awayRow?.stats[c.key]
          const hv = homeRow?.stats[c.key]
          const aPct = away ? percentiles.get(away.player_id)?.get(c.key) : undefined
          const hPct = home ? percentiles.get(home.player_id)?.get(c.key) : undefined
          const awayBetter = av != null && hv != null && av !== hv && (c.higherIsBetter === false ? av < hv : av > hv)
          const homeBetter = av != null && hv != null && av !== hv && (c.higherIsBetter === false ? hv < av : hv > av)
          return (
            <div key={c.key} className="grid grid-cols-[1fr_auto_100px_auto_1fr] items-center gap-2 px-4 py-2.5">
              <div className={`text-right font-mono text-sm ${awayBetter ? 'font-bold text-[#FF5722]' : 'text-stone-700'}`}>
                {av != null ? (c.format ? c.format(av) : av) : '—'}
              </div>
              {aPct !== undefined ? (
                <div onMouseEnter={e => onHover(e, aPct, c)} onMouseLeave={onHoverEnd} className="cursor-help">
                  <PercentileRing percentile={aPct} color={percentileTierColor(aPct)} size={32} strokeWidth={3} />
                </div>
              ) : <div className="w-8" />}
              <div className="text-center text-[10px] font-mono uppercase tracking-widest text-stone-400">{c.label}</div>
              {hPct !== undefined ? (
                <div onMouseEnter={e => onHover(e, hPct, c)} onMouseLeave={onHoverEnd} className="cursor-help">
                  <PercentileRing percentile={hPct} color={percentileTierColor(hPct)} size={32} strokeWidth={3} />
                </div>
              ) : <div className="w-8" />}
              <div className={`text-left font-mono text-sm ${homeBetter ? 'font-bold text-stone-900' : 'text-stone-700'}`}>
                {hv != null ? (c.format ? c.format(hv) : hv) : '—'}
              </div>
            </div>
    )
        })}
      </div>
      )}
    </div>
  )
}