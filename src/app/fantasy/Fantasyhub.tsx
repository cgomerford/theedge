'use client'

/**
 * Fantasy Desk — the floor.
 *
 * A weekly manager's tape: ADD / START / SELL / BUY, a signal-vs-ownership
 * scatter, two-start week, AAA heating + AA OPS leaders. Hover a name for
 * the 6-axis radar already used on this desk. Ownership null → em-dash,
 * never a fake market position.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FantasyPick, FantasyPicksByType } from '@/lib/fantasy'
import type { OwnershipChange } from '@/lib/fantasy-ownership'
import type { TickerPitcher } from '@/lib/fantasy-ticker'
import type { TwoStartPitcher } from '@/lib/fantasy-two-start'
import type { MilbOpsLeader } from '@/lib/fantasy-minors'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'
import FantasyTicker from '@/components/fantasy/FantasyTicker'
import ProGate from '@/components/fantasy/ProGate'

const WAIVER_OWN_MAX = 40
const WAIVER_SIG_MIN = 55
const HOVER_DELAY = 180
const FREE_ROWS = 3

type Props = {
  picks: FantasyPicksByType
  ownershipByPickId: Record<number, number | null>
  forDate: string
  isStale: boolean
  isPro: boolean
  ticker: TickerPitcher[]
  twoStarts: TwoStartPitcher[]
  ownRisers: OwnershipChange[]
  ownFallers: OwnershipChange[]
  aaaLeaders: MilbOpsLeader[]
  aaLeaders: MilbOpsLeader[]
}

type EnrichedPick = FantasyPick & {
  ownership: number | null
  valueGap: number | null
  category: string
  categoryLabel: string
  accent: string
}

const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  streamer: { label: 'Stream', accent: '#15803D' },
  sleeper:  { label: 'Sleeper',  accent: '#D97706' },
  mover:    { label: 'Up',    accent: '#2563EB' },
  faller:   { label: 'Down',   accent: '#DC2626' },
  cooler:   { label: 'Cold',  accent: '#DC2626' },
  riser:    { label: 'Hot',  accent: '#059669' },
  prospect: { label: 'Farm', accent: '#7C3AED' },
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function enrich(
  picks: FantasyPick[],
  category: string,
  ownershipByPickId: Record<number, number | null>,
): EnrichedPick[] {
  const meta = CATEGORY_META[category] ?? { label: category, accent: '#1A1A1A' }
  return picks.map(p => {
    const ownership = ownershipByPickId[p.id] ?? null
    const signal = p.signal_score
    const valueGap =
      ownership != null && signal != null ? Math.round(signal - ownership) : null
    return { ...p, ownership, valueGap, category, categoryLabel: meta.label, accent: meta.accent }
  })
}

function ownLabel(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`
}

function ValueGapBar({
  ownership, signal, color,
}: { ownership: number | null; signal: number | null; color: string }) {
  if (signal == null) return <div className="h-1.5 rounded-full bg-stone-100" />
  const s = Math.max(0, Math.min(100, signal))
  const o = ownership != null ? Math.max(0, Math.min(100, ownership)) : null
  return (
    <div className="relative h-1.5 rounded-full bg-stone-100 overflow-hidden">
      {o != null && (
        <div className="absolute inset-y-0 left-0 bg-stone-300" style={{ width: `${o}%` }} />
      )}
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s}%`, background: color }} />
    </div>
  )
}

function Sparkline({ trend, color }: { trend: number[]; color: string }) {
  if (!Array.isArray(trend) || trend.length < 2) return null
  const min = Math.min(...trend)
  const max = Math.max(...trend)
  const range = max - min || 1
  const pts = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * 100
    const y = 28 - ((v - min) / range) * 22
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width="56" height="22" viewBox="0 0 100 32" preserveAspectRatio="none" className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={4} fill={color} />
    </svg>
  )
}

function SpiderChart({
  stats, color = '#FF5722', size = 128,
}: { stats: { label: string; value: number }[]; color?: string; size?: number }) {
  const center = size / 2
  const radius = size * 0.36
  const n = stats.length || 6
  const pointOnAxis = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / n
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r }
  }
  const dataPolygon = stats.map((s, i) => {
    const p = pointOnAxis(i, (Math.max(0, Math.min(100, s.value)) / 100) * radius)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
  const rings = [0.25, 0.5, 0.75, 1].map(pct =>
    Array.from({ length: n }, (_, i) => {
      const p = pointOnAxis(i, radius * pct)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(' '),
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#E2DCCF" strokeWidth={0.5} />
      ))}
      {stats.map((_, i) => {
        const p = pointOnAxis(i, radius)
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#E2DCCF" strokeWidth={0.5} />
      })}
      <polygon points={dataPolygon} fill={color + '2E'} stroke={color} strokeWidth={1.5} />
      {stats.map((s, i) => {
        const p = pointOnAxis(i, (Math.max(0, Math.min(100, s.value)) / 100) * radius)
        return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      })}
      {stats.map((s, i) => {
        const p = pointOnAxis(i, radius * 1.28)
        return (
          <text key={i} x={p.x} y={p.y} fontSize={8} fill="#8A8275" textAnchor="middle" dominantBaseline="middle"
            fontFamily="JetBrains Mono, ui-monospace, monospace" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {s.label}
          </text>
        )
      })}
    </svg>
  )
}

function spiderStatsFor(pick: EnrichedPick): { label: string; value: number }[] {
  const s = pick.signal_score ?? 50
  const d = pick.details ?? {}
  const clamp = (n: unknown, fallback: number) =>
    typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, Math.min(100, n)) : fallback
  const isPitcher = pick.category === 'streamer' || pick.category === 'faller'
  if (isPitcher) {
    return [
      { label: 'Us',      value: clamp(s, 50) },
      { label: 'Ks',      value: clamp(d.k_percentile ?? s * 0.9, 55) },
      { label: 'Misses',  value: clamp(d.whiff_percentile ?? s * 0.85, 55) },
      { label: 'Matchup', value: clamp(d.matchup_score ?? s * 0.95, 55) },
      { label: 'Lately',  value: clamp(d.recent_form_pct ?? s * 0.88, 55) },
      { label: 'Walks',   value: clamp(d.control_percentile ?? s * 0.8, 55) },
    ]
  }
  return [
    { label: 'Us',      value: clamp(s, 50) },
    { label: 'Contact', value: clamp(d.contact_percentile ?? s * 0.9, 55) },
    { label: 'Power',   value: clamp(d.power_percentile ?? s * 0.85, 55) },
    { label: 'Eyes',    value: clamp(d.discipline_percentile ?? s * 0.8, 55) },
    { label: 'Lately',  value: clamp(d.recent_form_pct ?? s * 0.9, 55) },
    { label: 'Matchup', value: clamp(d.matchup_score ?? s * 0.85, 55) },
  ]
}

function HoverPlayerCard({ pick }: { pick: EnrichedPick }) {
  const stats = spiderStatsFor(pick)
  const trend: number[] = Array.isArray(pick.details?.trend) ? pick.details.trend : []
  return (
    <div className="w-[360px] bg-white/95 backdrop-blur border border-stone-200 rounded-2xl shadow-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
        {pick.player_id ? (
          <PlayerHeadshot playerId={pick.player_id} size={44} className="ring-2 ring-white shadow-sm" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-stone-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-[14px] truncate">{pick.player_name}</div>
          <div className="font-mono text-[10px] text-stone-500 truncate">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="font-mono text-[8.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: pick.accent + '18', color: pick.accent }}>
          {pick.categoryLabel}
        </span>
      </div>
      <div className="grid grid-cols-[128px_1fr] gap-2 px-3 py-2">
        <SpiderChart stats={stats} color={pick.accent} size={128} />
        <div className="flex flex-col justify-center gap-2 py-2">
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">Our take</div>
            <div className="font-mono text-2xl font-bold tabular-nums leading-none" style={{ color: pick.accent }}>
              {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">Rostered</div>
            <div className="font-mono text-xl font-bold tabular-nums leading-none">{ownLabel(pick.ownership)}</div>
          </div>
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">How cheap</div>
            <div className="font-mono text-xl font-bold tabular-nums leading-none"
              style={{ color: pick.valueGap == null ? '#B4B2A9' : pick.valueGap >= 0 ? '#15803D' : '#DC2626' }}>
              {pick.valueGap == null ? '—' : `${pick.valueGap > 0 ? '+' : ''}${pick.valueGap}`}
            </div>
          </div>
          {trend.length >= 2 && <Sparkline trend={trend} color={pick.accent} />}
          <ValueGapBar ownership={pick.ownership} signal={pick.signal_score} color={pick.accent} />
        </div>
      </div>
      <p className="px-4 pb-3 font-serif italic text-[12px] text-stone-600 leading-snug">{pick.one_liner}</p>
      {pick.player_id && (
        <div className="px-4 py-2 border-t border-stone-100 flex justify-end">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">More on him →</span>
        </div>
      )}
    </div>
  )
}

function TapeRow({
  pick, onEnter, onLeave,
}: { pick: EnrichedPick; onEnter: (e: MouseEvent) => void; onLeave: () => void }) {
  const trend: number[] = Array.isArray(pick.details?.trend) ? pick.details.trend : []
  const href = pick.player_id ? `/fantasy/player/${pick.player_id}` : undefined
  const inner = (
    <>
      {pick.player_id
        ? <PlayerHeadshot playerId={pick.player_id} size={36} className="ring-2 ring-white shadow-sm shrink-0" />
        : <div className="w-9 h-9 rounded-full bg-stone-100 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="font-serif font-bold text-[13px] truncate leading-tight">{pick.player_name}</div>
        <div className="font-mono text-[9.5px] text-stone-400 truncate">
          {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`].filter(Boolean).join(' · ')}
        </div>
      </div>
      {trend.length >= 2 && <Sparkline trend={trend} color={pick.accent} />}
      <div className="text-right shrink-0 w-14">
        <div className="font-mono text-[10px] text-stone-400 tabular-nums">{ownLabel(pick.ownership)}</div>
        <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color: pick.accent }}>
          {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
        </div>
      </div>
    </>
  )
  const cls = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/80 transition text-left'
  if (href) {
    return (
      <Link href={href} className={cls} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseMove={onEnter}>
        {inner}
      </Link>
    )
  }
  return (
    <div className={cls} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseMove={onEnter}>
      {inner}
    </div>
  )
}

function FarmHeatRow({
  pick, onPickEnter, onLeave,
}: {
  pick: EnrichedPick
  onPickEnter: (p: EnrichedPick, e: MouseEvent) => void
  onLeave: () => void
}) {
  const trend: number[] = Array.isArray(pick.details?.trend) ? pick.details.trend : []
  return (
    <div
      className="flex items-center gap-2.5 py-1.5"
      onMouseEnter={e => onPickEnter(pick, e)}
      onMouseLeave={onLeave}
      onMouseMove={e => onPickEnter(pick, e)}
    >
      {pick.player_id
        ? <PlayerHeadshot playerId={pick.player_id} size={36} className="ring-2 ring-white shadow-sm" />
        : <div className="w-9 h-9 rounded-full bg-stone-100" />}
      <div className="min-w-0 flex-1">
        <div className="font-serif font-bold text-[13px] truncate">{pick.player_name}</div>
        <div className="font-mono text-[10px] text-stone-400 truncate">{pick.team_name}</div>
      </div>
      {trend.length >= 2 && <Sparkline trend={trend} color="#7C3AED" />}
      <div className="font-mono text-[12px] font-bold tabular-nums text-violet-700">
        {typeof pick.details?.current_value === 'number' ? pick.details.current_value.toFixed(3) : '—'}
      </div>
    </div>
  )
}

function TapeColumn({
  title, kicker, accent, items, isPro, gateFeature, gateDesc, onEnter, onLeave,
}: {
  title: string
  kicker: string
  accent: string
  items: EnrichedPick[]
  isPro: boolean
  gateFeature: string
  gateDesc: string
  onEnter: (p: EnrichedPick, e: MouseEvent) => void
  onLeave: () => void
}) {
  const visible = isPro ? items : items.slice(0, FREE_ROWS)
  const rest = isPro ? [] : items.slice(FREE_ROWS)
  return (
    <div className="bg-white/70 border border-stone-200/80 rounded-2xl overflow-hidden flex flex-col min-h-[280px]">
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-stone-100">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: accent }}>{kicker}</div>
          <div className="font-serif font-bold text-[15px] leading-tight">{title}</div>
        </div>
        <span className="font-mono text-[16px] font-bold tabular-nums" style={{ color: accent }}>{items.length}</span>
      </div>
      <div className="flex-1">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center font-serif italic text-[12px] text-stone-400">Quiet today. Come back later.</p>
        ) : visible.map(p => (
          <TapeRow key={p.id} pick={p} onEnter={e => onEnter(p, e)} onLeave={onLeave} />
        ))}
        {rest.length > 0 && (
          <Link
            href="/pricing"
            className="m-2 mt-auto rounded-xl bg-[#1A1A1A] text-white text-center py-2.5 px-3 block"
            title={gateDesc}
          >
            <div className="font-mono text-[9px] uppercase tracking-widest font-bold text-[#FDE047]">{gateFeature}</div>
            <div className="font-mono text-[10px] text-white/70">+{rest.length} more · Pro</div>
          </Link>
        )}
      </div>
    </div>
  )
}

type ScatterPt = { x: number; y: number; name: string; gap: number | null; fill: string; category: string }

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPt }[] }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-white/95 backdrop-blur border border-stone-200 rounded-xl px-3 py-2 shadow-lg">
      <div className="font-serif font-bold text-[13px]">{d.name}</div>
      <div className="font-mono text-[10px] text-stone-500">
        {Math.round(d.x)}% rostered · we like him {Math.round(d.y)}
        {d.gap != null && ` · ${d.gap > 0 ? `${d.gap} cheaper than he should be` : `${Math.abs(d.gap)} too popular`}`}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-widest mt-0.5" style={{ color: d.fill }}>{d.category}</div>
    </div>
  )
}

export default function FantasyHub({
  picks, ownershipByPickId, forDate, isStale, isPro,
  ticker, twoStarts, ownRisers, ownFallers, aaaLeaders, aaLeaders,
}: Props) {
  const [hovered, setHovered] = useState<EnrichedPick | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEnter = useCallback((p: EnrichedPick, e: MouseEvent) => {
    const x = Math.min(e.clientX + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 380)
    const y = Math.min(e.clientY + 18, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300)
    setHoverPos({ x: Math.max(8, x), y: Math.max(8, y) })
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(p), HOVER_DELAY)
  }, [])
  const handleLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHovered(null)
  }, [])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  const allEnriched: EnrichedPick[] = useMemo(() => {
    const out: EnrichedPick[] = []
    for (const [key, list] of Object.entries(picks)) {
      out.push(...enrich(list as FantasyPick[], key, ownershipByPickId))
    }
    return out
  }, [picks, ownershipByPickId])

  const adds = useMemo(() => {
    const cats = new Set(['streamer', 'sleeper', 'riser', 'mover'])
    return allEnriched
      .filter(p => cats.has(p.category) && (p.signal_score ?? 0) >= WAIVER_SIG_MIN && (p.ownership == null || p.ownership < WAIVER_OWN_MAX))
      .sort((a, b) => (b.valueGap ?? -1) - (a.valueGap ?? -1))
  }, [allEnriched])

  const starts = useMemo(() =>
    allEnriched.filter(p => p.category === 'streamer').sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0)),
  [allEnriched])

  const sells = useMemo(() =>
    [...allEnriched.filter(p => p.category === 'cooler' || p.category === 'faller')]
      .sort((a, b) => (a.signal_score ?? 100) - (b.signal_score ?? 100)),
  [allEnriched])

  const buys = useMemo(() =>
    allEnriched.filter(p => p.category === 'riser').sort((a, b) => (b.valueGap ?? 0) - (a.valueGap ?? 0)),
  [allEnriched])

  const farm = useMemo(() => allEnriched.filter(p => p.category === 'prospect').slice(0, 8), [allEnriched])

  const scatterPts: ScatterPt[] = useMemo(() =>
    allEnriched
      .filter(p => p.ownership != null && p.signal_score != null)
      .map(p => ({
        x: p.ownership as number,
        y: p.signal_score as number,
        name: p.player_name,
        gap: p.valueGap,
        fill: p.accent,
        category: p.categoryLabel,
      })),
  [allEnriched])

  const byCat = useMemo(() => {
    const map = new Map<string, ScatterPt[]>()
    for (const pt of scatterPts) {
      const list = map.get(pt.fill) ?? []
      list.push(pt)
      map.set(pt.fill, list)
    }
    return [...map.entries()]
  }, [scatterPts])

  const stats = {
    adds: adds.length,
    starts: starts.length,
    sells: sells.length,
    buys: buys.length,
    farm: farm.length,
    gap: scatterPts.length
      ? Math.round(scatterPts.reduce((s, p) => s + (p.gap ?? 0), 0) / scatterPts.length)
      : null,
  }

  const hoverX = hoverPos.x
  const hoverY = hoverPos.y

  return (
    <div>
      {ticker.length > 0 && <FantasyTicker pitchers={ticker} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-widest font-bold mb-1">
              Fantasy
              {isPro && <span className="ml-2 text-emerald-700">· Pro</span>}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-none" style={{ fontFamily: 'Fraunces, serif' }}>
              Who you playing<span className="text-[#FF5722]">?</span>
            </h1>
            <p className="font-serif italic text-stone-500 text-[13px] mt-2 max-w-xl">
              {formatDate(forDate)}
              {isStale && <span className="ml-2 not-italic font-mono text-[10px] uppercase tracking-widest text-amber-600">still yesterday&apos;s list</span>}
              {' — '}hover a face. We&apos;ll tell you if we like him more than your league does.
            </p>
          </div>
          <Link
            href="/fantasy/league"
            className="rounded-full bg-[#1A1A1A] text-white font-mono text-[11px] uppercase tracking-widest px-5 py-2.5 hover:bg-stone-800"
          >
            How&apos;s my team? →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
          {[
            { label: 'Adds', value: stats.adds, color: '#D97706' },
            { label: 'Starts', value: stats.starts, color: '#15803D' },
            { label: 'Sells', value: stats.sells, color: '#DC2626' },
            { label: 'Buys', value: stats.buys, color: '#059669' },
            { label: 'Farm', value: stats.farm, color: '#7C3AED' },
            { label: 'Underrated', value: stats.gap != null ? `+${stats.gap}` : '—', color: '#FF5722' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-white border border-stone-200/80 px-3 py-2.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{s.label}</div>
              <div className="font-mono text-2xl font-bold tabular-nums leading-none mt-1" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* THE TAPE */}
        <div className="mb-2 flex items-baseline gap-3">
          <h2 className="font-serif font-bold text-[18px]">Do this today</h2>
          <p className="font-serif italic text-[12px] text-stone-500">Grab, start, dump, or buy. Hover a name.</p>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
          <TapeColumn title="Grab him" kicker="Sitting on waivers" accent="#D97706" items={adds} isPro={isPro}
            gateFeature="The rest of the wire" gateDesc="Everyone under 40% rostered that we actually like."
            onEnter={handleEnter} onLeave={handleLeave} />
          <TapeColumn title="Start him" kicker="Pitching tonight" accent="#15803D" items={starts} isPro={isPro}
            gateFeature="Every streamer tonight" gateDesc="The whole list of guys throwing tonight, not just the headline."
            onEnter={handleEnter} onLeave={handleLeave} />
          <TapeColumn title="Dump him" kicker="Going cold" accent="#DC2626" items={sells} isPro={isPro}
            gateFeature="Who to get off" gateDesc="Guys people still love who have gone quiet."
            onEnter={handleEnter} onLeave={handleLeave} />
          <TapeColumn title="Buy him" kicker="Getting hot" accent="#059669" items={buys} isPro={isPro}
            gateFeature="Who to buy" gateDesc="The ones who just woke up and nobody&apos;s noticed yet."
            onEnter={handleEnter} onLeave={handleLeave} />
        </div>

        {/* MARKET MAP */}
        {scatterPts.length >= 3 && (
          <section className="mb-8 rounded-2xl bg-white border border-stone-200/80 p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <div>
                <h2 className="font-serif font-bold text-[18px]">Who&apos;s cheap</h2>
                <p className="font-serif italic text-[12px] text-stone-500">
                  Left = nobody has him. Up = we like him. Top-left is your add. Bottom-right is the guy you&apos;re stuck with.
                </p>
              </div>
              <div className="flex gap-3 font-mono text-[9px] uppercase tracking-widest text-stone-400">
                <span>← free agent-ish</span>
                <span>everyone has him →</span>
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#EDE8DC" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" domain={[0, 100]} tick={{ fontSize: 10, fill: '#A8A29E' }}
                    tickLine={false} axisLine={{ stroke: '#E7E0D2' }} name="% rostered" />
                  <YAxis type="number" dataKey="y" domain={[0, 100]} tick={{ fontSize: 10, fill: '#A8A29E' }}
                    tickLine={false} axisLine={{ stroke: '#E7E0D2' }} name="We like him" width={36} />
                  <Tooltip content={<ScatterTip />} cursor={{ stroke: '#FF5722', strokeDasharray: '3 3' }} />
                  {byCat.map(([fill, pts]) => (
                    <Scatter key={fill} data={pts} fill={fill} isAnimationActive={false} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* TWO-START + OWNERSHIP MOVERS */}
        <div className="grid lg:grid-cols-2 gap-3 mb-8">
          <section className="rounded-2xl bg-white border border-stone-200/80 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-[#15803D] font-bold">This week</div>
                <h2 className="font-serif font-bold text-[18px]">Throwing twice</h2>
                <p className="font-serif italic text-[12px] text-stone-500">Only if they&apos;re actually listed. We&apos;re not guessing who starts Thursday.</p>
              </div>
              <Link href="/fantasy/two-start" className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">The whole week →</Link>
            </div>
            {twoStarts.length === 0 ? (
              <p className="font-serif italic text-[13px] text-stone-400 py-6 text-center">Nobody&apos;s locked in for two starts yet. Check tomorrow.</p>
            ) : (
              <>
                {twoStarts.slice(0, isPro ? 6 : 1).map(p => (
                  <Link key={p.playerId} href={`/fantasy/player/${p.playerId}`}
                    className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-[#FAF8F3]">
                    <PlayerHeadshot playerId={p.playerId} size={40} className="ring-2 ring-white shadow-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-serif font-bold text-[13px]">{p.playerName}</div>
                      <div className="font-mono text-[10px] text-stone-400">
                        {p.starts.map(s => `${s.isHome ? 'vs' : '@'} ${s.opponent}`).join(' · ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-stone-400">
                        {p.tier === 'strong' ? 'lock him' : p.tier === 'viable' ? 'yeah' : p.tier === 'mixed' ? 'meh' : 'nah'}
                      </div>
                      <div className="font-mono text-[14px] font-bold tabular-nums text-emerald-700">{p.combinedScore}</div>
                    </div>
                  </Link>
                ))}
                {!isPro && twoStarts.length > 1 && (
                  <ProGate isPro={false} feature="The other two-start guys"
                    description="The rest of the arms going twice this week. That&apos;s usually the difference in a tight matchup.">
                    <div className="space-y-1">
                      {twoStarts.slice(1, 4).map(p => (
                        <div key={p.playerId} className="flex items-center gap-3 px-1 py-2">
                          <PlayerHeadshot playerId={p.playerId} size={36} />
                          <div className="font-serif font-bold text-[13px]">{p.playerName}</div>
                        </div>
                      ))}
                    </div>
                  </ProGate>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl bg-white border border-stone-200/80 p-4">
            <div className="mb-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#2563EB] font-bold">Last 7 days</div>
              <h2 className="font-serif font-bold text-[18px]">Who people just grabbed</h2>
              <p className="font-serif italic text-[12px] text-stone-500">ESPN roster % vs last week. Blank if we haven&apos;t got a week of numbers yet.</p>
            </div>
            {ownRisers.length === 0 && ownFallers.length === 0 ? (
              <p className="font-serif italic text-[13px] text-stone-400 py-6 text-center">Need a week of ESPN numbers first. Nothing to show yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-700 font-bold mb-1">Added</div>
                  {(isPro ? ownRisers : ownRisers.slice(0, 3)).map(r => (
                    <div key={r.espn_player_id} className="flex items-center justify-between py-1.5">
                      <span className="font-serif text-[12px] truncate pr-2">{r.full_name}</span>
                      <span className="font-mono text-[11px] font-bold text-emerald-700 tabular-nums">+{r.delta.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-red-600 font-bold mb-1">Dropped</div>
                  {(isPro ? ownFallers : ownFallers.slice(0, 3)).map(r => (
                    <div key={r.espn_player_id} className="flex items-center justify-between py-1.5">
                      <span className="font-serif text-[12px] truncate pr-2">{r.full_name}</span>
                      <span className="font-mono text-[11px] font-bold text-red-600 tabular-nums">{r.delta.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                {!isPro && (ownRisers.length > 3 || ownFallers.length > 3) && (
                  <div className="col-span-2">
                    <ProGate isPro={false} feature="Everyone else who moved"
                      description="The rest of the adds and drops. See who your league is about to fight over.">
                      <div className="h-16" />
                    </ProGate>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* THE FARM */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#7C3AED] font-bold">Keepers & stashes</div>
              <h2 className="font-serif font-bold text-[18px]">The kids</h2>
              <p className="font-serif italic text-[12px] text-stone-500">
                AAA guys who&apos;ve been raking lately. AA is just who&apos;s hitting right now down there — not a scout report.
              </p>
            </div>
            <Link href="/fantasy/prospects" className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">See all the kids →</Link>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-stone-200/80 p-4">
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#7C3AED] font-bold mb-2">AAA · hot bats</div>
              {farm.length === 0 ? (
                <p className="font-serif italic text-[12px] text-stone-400">Nobody in AAA jumping off the page today.</p>
              ) : (isPro ? farm : farm.slice(0, 3)).map(p => (
                <FarmHeatRow key={p.id} pick={p} onPickEnter={handleEnter} onLeave={handleLeave} />
              ))}
              {!isPro && farm.length > 3 && (
                <ProGate isPro={false} feature="The rest of AAA" description="The other Triple-A bats who&apos;ve been raking.">
                  <div className="h-20" />
                </ProGate>
              )}
            </div>
            <div className="rounded-2xl bg-white border border-stone-200/80 p-4">
              <div className="font-mono text-[9px] uppercase tracking-widest text-[#7C3AED] font-bold mb-2">AA · who&apos;s hitting</div>
              {aaLeaders.length === 0 ? (
                <p className="font-serif italic text-[12px] text-stone-400">Couldn&apos;t pull the AA list. Try a refresh.</p>
              ) : (
                <>
                  {(isPro ? aaLeaders : aaLeaders.slice(0, 2)).map(p => (
                    <div key={p.playerId} className="flex items-center gap-2.5 py-1.5">
                      <PlayerHeadshot playerId={p.playerId} size={36} className="ring-2 ring-white shadow-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-serif font-bold text-[13px] truncate">{p.name}</div>
                        <div className="font-mono text-[10px] text-stone-400 truncate">{p.team}</div>
                      </div>
                      <div className="font-mono text-[13px] font-bold tabular-nums text-violet-700">
                        {p.ops.toFixed(3).replace(/^0/, '')}
                      </div>
                    </div>
                  ))}
                  {!isPro && aaLeaders.length > 2 && (
                    <ProGate isPro={false} feature="The rest of AA"
                      description="Who&apos;s mashing in Double-A. Handy if you stash kids.">
                      <div className="space-y-1 pt-1">
                        {aaLeaders.slice(2, 5).map(p => (
                          <div key={p.playerId} className="flex items-center gap-2">
                            <PlayerHeadshot playerId={p.playerId} size={32} />
                            <span className="font-serif text-[13px]">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </ProGate>
                  )}
                </>
              )}
              {aaaLeaders.length > 0 && isPro && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-bold mb-2">AAA · who&apos;s hitting</div>
                  {aaaLeaders.slice(0, 4).map(p => (
                    <div key={p.playerId} className="flex items-center justify-between py-1">
                      <span className="font-serif text-[12px] truncate pr-2">{p.name}</span>
                      <span className="font-mono text-[12px] font-bold tabular-nums">{p.ops.toFixed(3).replace(/^0/, '')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {!isPro && (
          <section className="rounded-2xl bg-[#1A1A1A] p-6 sm:p-8 mb-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#FDE047] font-bold mb-2">
              ⊕ Pro · £4/mo founding
            </div>
            <h2 className="font-serif text-2xl text-white mb-2">You&apos;re seeing the free three. The rest is £4.</h2>
            <p className="font-serif text-stone-400 text-[14px] max-w-2xl mb-5">
              Every grab, start, dump and buy. Who&apos;s throwing twice. Who your league just added. The AA kids. Plus dump your roster in and we&apos;ll tell you who to sit.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/pricing" className="rounded-full bg-[#FDE047] text-stone-900 font-mono text-[11px] uppercase tracking-widest font-bold px-5 py-2.5 hover:bg-yellow-200">
                Yeah, I&apos;ll pay →
              </Link>
              <Link href="/fantasy/league" className="rounded-full border border-white/20 text-white font-mono text-[11px] uppercase tracking-widest px-5 py-2.5 hover:border-white/50">
                Just look at my team →
              </Link>
            </div>
          </section>
        )}

        <p className="text-center font-mono text-[9.5px] uppercase tracking-widest text-stone-400 pt-4">
          Not betting advice. Roster % is ESPN public leagues.
        </p>
      </div>

      {hovered && (
        <div className="fixed z-50 pointer-events-none" style={{ left: hoverX, top: hoverY }}>
          <HoverPlayerCard pick={hovered} />
        </div>
      )}
    </div>
  )
}
