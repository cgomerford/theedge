// src/app/fantasy/Fantasyhub.tsx
'use client'

/**
 * Fantasy Desk homepage — v2.
 *
 * The spine (VALUE GAP = signal − ownership) is unchanged from v1. What's new:
 *
 *   1. Editorial masthead — "The Desk." with a one-line italic subtitle,
 *      matching the Dashboard page's tone.
 *   2. Methodology strip — three plain-English boxes explaining Signal,
 *      Ownership, and Value Gap so a first-time visitor can read every
 *      section without having to figure the vocabulary out.
 *   3. Sub-page nav cards — big linked cards to each deep page with a
 *      live count and one-line description.
 *   4. Per-section "How this works" microcopy under every section header.
 *      Same transparency discipline as the game-page factor explanations.
 *   5. Hover popouts on player rows — 6-axis mini spider chart + signature
 *      stats + value gap. 220ms delay so it doesn't flash on pass-through.
 *   6. Sidebar restyled to the Dashboard leaderboard look — mono type,
 *      numbered rows, orange stat readouts.
 *
 * Data honesty preserved: null ownership renders as an em-dash and the
 * value-gap tick disappears entirely — we never fabricate a market position.
 *
 * Same props signature as v1, so page.tsx is unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { FantasyPick, FantasyPicksByType } from '@/lib/fantasy'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'

// ── Config ────────────────────────────────────────────────────────────────
const WAIVER_OWNERSHIP_MAX = 40   // strictly less than this % ownership
const WAIVER_SIGNAL_MIN     = 55  // must clear this signal floor
const HOVER_DELAY           = 220 // ms before hover popup appears

type Props = {
  picks: FantasyPicksByType
  ownershipByPickId: Record<number, number | null>
  forDate: string
  isStale: boolean
  isPro: boolean
}

type ApiPlayer = {
  id: number
  name: string
  team: string
  pos: string
  teamId?: number
  stats?: Record<string, number | null>
}

type EnrichedPick = FantasyPick & {
  ownership: number | null
  valueGap: number | null
  category: string
  categoryLabel: string
  accent: string
}

const CATEGORY_META: Record<string, { label: string; accent: string }> = {
  streamer: { label: 'Streamer', accent: '#15803D' },
  sleeper:  { label: 'Sleeper',  accent: '#D97706' },
  mover:    { label: 'Mover',    accent: '#2563EB' },
  faller:   { label: 'Faller',   accent: '#DC2626' },
  cooler:   { label: 'Cooling',  accent: '#DC2626' },
  riser:    { label: 'Heating',  accent: '#059669' },
  prospect: { label: 'Prospect', accent: '#7C3AED' },
}

// ── Utilities ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
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

// ═════════════════════════════════════════════════════════════════════════
// VISUAL PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════

/**
 * Value-gap bar. Grey fill up to ownership%, coloured fill up to signal,
 * black tick at the ownership boundary. Null ownership hides the tick and
 * the grey fill — signal-only, honest empty.
 */
function ValueGapBar({
  ownership,
  signal,
  color,
}: {
  ownership: number | null
  signal: number | null
  color: string
}) {
  if (signal == null) return <div className="h-1.5 bg-stone-100" />
  const s = Math.max(0, Math.min(100, signal))
  const o = ownership != null ? Math.max(0, Math.min(100, ownership)) : null
  return (
    <div className="relative h-1.5 bg-stone-100">
      {o != null && (
        <div className="absolute inset-y-0 left-0 bg-stone-400" style={{ width: `${o}%` }} />
      )}
      <div className="absolute inset-y-0 left-0" style={{ width: `${s}%`, background: color }} />
      {o != null && (
        <div className="absolute -top-1 w-px h-3.5 bg-stone-900" style={{ left: `${o}%` }} />
      )}
    </div>
  )
}

/** Same bar, dark background — for hero cards on #1A1A1A. */
function ValueGapBarDark({
  ownership,
  signal,
  color,
}: {
  ownership: number | null
  signal: number | null
  color: string
}) {
  if (signal == null) return <div className="h-1.5 bg-white/10" />
  const s = Math.max(0, Math.min(100, signal))
  const o = ownership != null ? Math.max(0, Math.min(100, ownership)) : null
  return (
    <div className="relative h-1.5 bg-white/10">
      {o != null && (
        <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${o}%` }} />
      )}
      <div className="absolute inset-y-0 left-0" style={{ width: `${s}%`, background: color }} />
      {o != null && (
        <div className="absolute -top-1 w-px h-3.5 bg-[#FDE047]" style={{ left: `${o}%` }} />
      )}
    </div>
  )
}

/**
 * Six-axis radar. Currently plotted with best-available fields from
 * pick.details, falling back to signal-derived proxies. When the per-player
 * Statcast pipeline is wired to the pick payload, swap the proxies in
 * spiderStatsFor() for real percentile ranks — component signature is fine.
 */
function SpiderChart({
  stats,
  color = '#FF5722',
  size = 132,
}: {
  stats: { label: string; value: number }[]
  color?: string
  size?: number
}) {
  const center = size / 2
  const radius = size * 0.36
  const n = stats.length || 6

  const pointOnAxis = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / n
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r }
  }

  const dataPolygon = stats
    .map((s, i) => {
      const p = pointOnAxis(i, (Math.max(0, Math.min(100, s.value)) / 100) * radius)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')

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
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="#E2DCCF"
            strokeWidth={0.5}
          />
        )
      })}
      <polygon points={dataPolygon} fill={color + '2E'} stroke={color} strokeWidth={1.5} />
      {stats.map((s, i) => {
        const p = pointOnAxis(i, (Math.max(0, Math.min(100, s.value)) / 100) * radius)
        return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      })}
      {stats.map((s, i) => {
        const p = pointOnAxis(i, radius * 1.28)
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            fontSize={8}
            fill="#8A8275"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {s.label}
          </text>
        )
      })}
    </svg>
  )
}

/**
 * Best-effort mapping from pick → 6 spider axes.
 * These are proxy derivations from signal + whatever's on details. When
 * a per-player Statcast profile lands in pick.details (or a sibling
 * lookup), swap these fallbacks for real percentile ranks.
 */
function spiderStatsFor(pick: EnrichedPick): { label: string; value: number }[] {
  const s = pick.signal_score ?? 50
  const d = pick.details ?? {}
  const clamp = (n: any, fallback: number) =>
    typeof n === 'number' && !isNaN(n) ? Math.max(0, Math.min(100, n)) : fallback

  const isPitcher = pick.category === 'streamer' || pick.category === 'faller'

  if (isPitcher) {
    return [
      { label: 'Signal',  value: clamp(s, 50) },
      { label: 'K rate',  value: clamp(d.k_percentile ?? s * 0.9, 55) },
      { label: 'Whiff',   value: clamp(d.whiff_percentile ?? s * 0.85, 55) },
      { label: 'Matchup', value: clamp(d.matchup_score ?? s * 0.95, 55) },
      { label: 'Form',    value: clamp(d.recent_form_pct ?? s * 0.88, 55) },
      { label: 'Ctrl',    value: clamp(d.control_percentile ?? s * 0.8, 55) },
    ]
  }

  return [
    { label: 'Signal',  value: clamp(s, 50) },
    { label: 'Contact', value: clamp(d.contact_percentile ?? s * 0.9, 55) },
    { label: 'Power',   value: clamp(d.power_percentile ?? s * 0.85, 55) },
    { label: 'Discip.', value: clamp(d.discipline_percentile ?? s * 0.8, 55) },
    { label: 'Form',    value: clamp(d.recent_form_pct ?? s * 0.9, 55) },
    { label: 'Matchup', value: clamp(d.matchup_score ?? s * 0.85, 55) },
  ]
}

// ═════════════════════════════════════════════════════════════════════════
// HOVER POPUP
// ═════════════════════════════════════════════════════════════════════════

function HoverPlayerCard({ pick }: { pick: EnrichedPick }) {
  const stats = spiderStatsFor(pick)
  const detailsEntries = Object.entries(pick.details ?? {})
    .filter(([k]) => !['trend', 'swing', 'direction'].includes(k))
    .slice(0, 4)

  return (
    <div className="w-[380px] bg-white border border-stone-900 shadow-lg">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3">
        {pick.player_id ? (
          <PlayerHeadshot playerId={pick.player_id} size={40} className="ring-1 ring-stone-100" />
        ) : (
          <div className="w-10 h-10 bg-stone-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-[14px] truncate">{pick.player_name}</div>
          <div className="font-mono text-[10px] text-stone-500 truncate">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <span
          className="font-mono text-[8.5px] font-bold uppercase tracking-widest px-1.5 py-0.5 shrink-0"
          style={{ background: pick.accent + '18', color: pick.accent }}
        >
          {pick.categoryLabel}
        </span>
      </div>

      <div className="grid grid-cols-[132px_1fr] gap-3 px-4 py-3 border-b border-stone-100">
        <div className="shrink-0">
          <SpiderChart stats={stats} color={pick.accent} size={132} />
        </div>
        <div className="flex flex-col justify-center gap-2">
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">
              Signal
            </div>
            <div
              className="font-mono text-2xl font-bold tabular-nums leading-none"
              style={{ color: pick.accent }}
            >
              {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">
              Ownership
            </div>
            <div className="font-mono text-xl font-bold tabular-nums leading-none">
              {pick.ownership != null ? `${Math.round(pick.ownership)}%` : '—'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[8.5px] uppercase tracking-widest text-stone-400">
              Value gap
            </div>
            <div
              className="font-mono text-xl font-bold tabular-nums leading-none"
              style={{
                color:
                  pick.valueGap == null
                    ? '#B4B2A9'
                    : pick.valueGap >= 0
                      ? '#15803D'
                      : '#DC2626',
              }}
            >
              {pick.valueGap == null
                ? '—'
                : `${pick.valueGap > 0 ? '+' : ''}${pick.valueGap}`}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-stone-100">
        <p className="font-serif italic text-[12px] text-stone-700 leading-snug">
          {pick.one_liner}
        </p>
      </div>

      {detailsEntries.length > 0 && (
        <div className="px-4 py-2 border-b border-stone-100 flex flex-wrap gap-1.5">
          {detailsEntries.map(([k, v]) => (
            <div
              key={k}
              className="font-mono text-[9px] px-2 py-0.5 bg-[#F5F1E8] text-stone-700"
            >
              <span className="text-stone-400 uppercase tracking-widest mr-1">
                {k.replace(/_/g, ' ')}
              </span>
              <span className="font-bold tabular-nums">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="font-serif italic text-[10px] text-stone-400">
          Radar uses proxy axes · full Statcast rolling out
        </span>
        {pick.player_id && (
          <Link
            href={`/mlb/players/${pick.player_id}`}
            className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] hover:text-orange-600 font-bold"
          >
            Full profile →
          </Link>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// HERO CARD
// ═════════════════════════════════════════════════════════════════════════

function HeroCard({
  pick,
  onEnter,
  onLeave,
}: {
  pick: EnrichedPick
  onEnter: () => void
  onLeave: () => void
}) {
  return (
    <div
      className="bg-[#1A1A1A] p-4 relative"
      style={{ border: `0.5px solid ${pick.accent}66` }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="font-mono text-[9px] font-bold uppercase tracking-widest mb-2"
        style={{ color: pick.accent }}
      >
        ▲ {pick.categoryLabel}
      </div>

      <div className="flex items-start gap-3 mb-3">
        {pick.player_id && (
          <PlayerHeadshot playerId={pick.player_id} size={44} className="ring-1 ring-white/10 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-white text-[15px] leading-tight truncate">
            {pick.player_name}
          </div>
          <div className="font-mono text-[10px] text-white/50 mt-0.5">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-white/55 w-7 text-right tabular-nums">
            {pick.ownership != null ? `${Math.round(pick.ownership)}%` : '—'}
          </span>
          <div className="flex-1">
            <ValueGapBarDark
              ownership={pick.ownership}
              signal={pick.signal_score}
              color={pick.accent}
            />
          </div>
          <span className="font-mono text-[12px] text-white font-bold w-6 tabular-nums">
            {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
          </span>
        </div>
        <div className="font-mono text-[8.5px] text-white/40 mt-1 tracking-wide">
          OWN ⟵ ⎯⎯ SIGNAL
          {pick.valueGap != null && (
            <span className="ml-2 text-white/70 font-bold">
              gap {pick.valueGap > 0 ? '+' : ''}
              {pick.valueGap}
            </span>
          )}
        </div>
      </div>

      <p className="font-serif italic text-[11.5px] text-white/75 leading-snug">
        {pick.one_liner}
      </p>

      {pick.game_slug && (
        <Link
          href={`/mlb/${pick.game_slug}`}
          className="mt-3 inline-flex font-mono text-[9px] uppercase tracking-widest text-[#FF5722] hover:text-orange-300"
        >
          Full preview →
        </Link>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// EDITORIAL PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════

function SectionLabel({ title, live }: { title: string; live?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 mb-2">
      <span className="font-serif font-black text-[#FF5722] text-[18px] leading-none">§</span>
      <h2 className="font-serif font-bold text-[19px] tracking-tight leading-none">{title}</h2>
      <div className="flex-1 h-px bg-stone-200 self-center" />
      {live && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-green-600">
            Live
          </span>
        </div>
      )}
    </div>
  )
}

function MethodologyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif italic text-[11.5px] text-stone-500 leading-snug mb-3 max-w-2xl">
      <span className="font-mono text-[9px] not-italic uppercase tracking-widest text-stone-400 mr-1.5">
        How this works
      </span>
      {children}
    </p>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// ROW COMPONENTS
// ═════════════════════════════════════════════════════════════════════════

function WaiverRow({
  pick,
  rank,
  onEnter,
  onLeave,
  onSelect,
}: {
  pick: EnrichedPick
  rank: number
  onEnter: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-full grid gap-2 px-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-orange-50/40 transition text-left items-center"
      style={{ gridTemplateColumns: '24px 1.8fr 1.5fr 44px 130px 40px' }}
    >
      <span className="font-mono text-[10px] text-stone-300 tabular-nums">{rank}</span>

      <div className="flex items-center gap-2.5 min-w-0">
        {pick.player_id && (
          <PlayerHeadshot playerId={pick.player_id} size={30} className="ring-1 ring-stone-100 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-serif font-bold text-[13px] text-stone-900 truncate">
            {pick.player_name}
          </div>
          <div className="font-mono text-[9.5px] text-stone-500 truncate">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      <div className="font-serif italic text-[11px] text-stone-600 leading-snug line-clamp-2">
        {pick.one_liner}
      </div>

      <div className="font-mono text-[11px] font-bold text-stone-600 text-right tabular-nums">
        {pick.ownership != null ? `${Math.round(pick.ownership)}%` : '—'}
      </div>

      <div>
        <ValueGapBar ownership={pick.ownership} signal={pick.signal_score} color="#15803D" />
        <div className="font-mono text-[8.5px] text-emerald-700 text-right mt-0.5 font-bold tabular-nums">
          {pick.valueGap != null ? `+${pick.valueGap}` : ''}
        </div>
      </div>

      <div className="font-mono text-[14px] font-bold text-emerald-700 text-right tabular-nums">
        {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
      </div>
    </button>
  )
}

function CoolOffRow({
  pick,
  onEnter,
  onLeave,
  onSelect,
}: {
  pick: EnrichedPick
  onEnter: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-full grid gap-2 px-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-red-50/40 transition text-left items-center"
      style={{ gridTemplateColumns: '1.8fr 1.5fr 44px 130px 40px' }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {pick.player_id && (
          <PlayerHeadshot playerId={pick.player_id} size={30} className="ring-1 ring-stone-100 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-serif font-bold text-[13px] text-stone-900 truncate">
            {pick.player_name}
          </div>
          <div className="font-mono text-[9.5px] text-stone-500 truncate">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      <div className="font-serif italic text-[11px] text-stone-600 leading-snug line-clamp-2">
        {pick.one_liner}
      </div>

      <div className="font-mono text-[11px] font-bold text-stone-600 text-right tabular-nums">
        {pick.ownership != null ? `${Math.round(pick.ownership)}%` : '—'}
      </div>

      <div>
        <ValueGapBar ownership={pick.ownership} signal={pick.signal_score} color="#DC2626" />
        <div className="font-mono text-[8.5px] text-red-600 text-right mt-0.5 font-bold tabular-nums">
          {pick.valueGap != null && pick.valueGap < 0 ? `${pick.valueGap}` : ''}
        </div>
      </div>

      <div className="font-mono text-[14px] font-bold text-red-600 text-right tabular-nums">
        {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
      </div>
    </button>
  )
}

function StreamerRow({
  pick,
  onEnter,
  onLeave,
  onSelect,
}: {
  pick: EnrichedPick
  onEnter: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  const d = pick.details ?? {}
  const ip = d.proj_ip ?? d.ip ?? null
  const k = d.proj_k ?? d.k ?? null
  const er = d.proj_er ?? d.er ?? null

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-full grid gap-2 px-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-emerald-50/40 transition text-left items-center"
      style={{ gridTemplateColumns: '1.7fr 1.1fr 34px 34px 34px 40px 44px' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {pick.player_id && (
          <PlayerHeadshot playerId={pick.player_id} size={28} className="ring-1 ring-stone-100 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="font-serif font-bold text-[12.5px] truncate">{pick.player_name}</div>
          <div className="font-mono text-[9px] text-stone-500 truncate">
            {[pick.team_name, pick.opponent_name && `vs ${pick.opponent_name}`, pick.game_time]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
      <div className="font-serif italic text-[10.5px] text-stone-600 leading-snug line-clamp-2">
        {pick.one_liner}
      </div>
      <div className="font-mono text-[11px] text-right tabular-nums">{ip ?? '—'}</div>
      <div className="font-mono text-[11px] text-right tabular-nums">{k ?? '—'}</div>
      <div className="font-mono text-[11px] text-right tabular-nums">{er ?? '—'}</div>
      <div className="font-mono text-[10px] text-right text-stone-500 tabular-nums">
        {pick.ownership != null ? `${Math.round(pick.ownership)}%` : '—'}
      </div>
      <div className="font-mono text-[13px] font-bold text-emerald-700 text-right tabular-nums">
        {pick.signal_score != null ? Math.round(pick.signal_score) : '—'}
      </div>
    </button>
  )
}

function FarmSparkline({ trend, color }: { trend: number[]; color: string }) {
  const min = Math.min(...trend)
  const max = Math.max(...trend)
  const range = max - min || 1
  const pts = trend
    .map((v, i) => {
      const x = (i / (trend.length - 1)) * 100
      const y = 26 - ((v - min) / range) * 22
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = pts.split(' ').slice(-1)[0].split(',')
  return (
    <svg width="52" height="20" viewBox="0 0 100 30" preserveAspectRatio="none" className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={4.5} fill={color} />
    </svg>
  )
}

function FarmCard({
  pick,
  onEnter,
  onLeave,
}: {
  pick: EnrichedPick
  onEnter: () => void
  onLeave: () => void
}) {
  const trend: number[] = Array.isArray(pick.details?.trend) ? pick.details.trend : []
  const level = pick.details?.level ?? 'AAA'
  const isAAA = String(level).toUpperCase() === 'AAA'
  const levelStyle = isAAA
    ? { bg: '#EEEDFE', color: '#3C3489', accent: '#7C3AED' }
    : { bg: '#FAEEDA', color: '#633806', accent: '#BA7517' }

  return (
    <div
      className="bg-white border border-stone-200 p-3 hover:border-stone-400 transition"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="font-serif font-bold text-[13px] truncate">{pick.player_name}</div>
          <div className="font-mono text-[9.5px] text-stone-500">
            {[pick.team_name, pick.details?.position].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span
          className="font-mono text-[8.5px] font-bold px-1.5 py-0.5 uppercase tracking-widest shrink-0"
          style={{ background: levelStyle.bg, color: levelStyle.color }}
        >
          {String(level).toUpperCase()}
        </span>
      </div>

      {trend.length >= 2 && (
        <div className="flex items-center gap-2 mb-2">
          <FarmSparkline trend={trend} color={levelStyle.accent} />
          <span
            className="font-mono text-[10px] font-bold tabular-nums"
            style={{ color: levelStyle.color }}
          >
            {pick.details?.recent_line ?? pick.headline}
          </span>
        </div>
      )}

      <p className="font-serif italic text-[11px] text-stone-600 leading-snug line-clamp-2">
        {pick.one_liner}
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════

export default function FantasyHub({
  picks,
  ownershipByPickId,
  forDate,
  isStale,
  isPro,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState<'batter' | 'pitcher'>('batter')
  const [apiPlayers, setApiPlayers] = useState<ApiPlayer[]>([])
  const [apiLoading, setApiLoading] = useState(false)
  const [usingApi, setUsingApi] = useState(false)

  const [waiverFilter, setWaiverFilter] = useState<'all' | 'batters' | 'pitchers'>('all')

  const handleEnter = useCallback((id: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoveredId(id), HOVER_DELAY)
  }, [])

  const handleLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHoveredId(null)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  const allEnriched: EnrichedPick[] = useMemo(() => {
    const out: EnrichedPick[] = []
    for (const [key, list] of Object.entries(picks)) {
      out.push(...enrich(list as FantasyPick[], key, ownershipByPickId))
    }
    return out
  }, [picks, ownershipByPickId])

  const enrichedByCat = useMemo(() => {
    const map: Record<string, EnrichedPick[]> = {
      streamer: [], sleeper: [], mover: [], faller: [],
      cooler: [], riser: [], prospect: [],
    }
    for (const p of allEnriched) if (map[p.category]) map[p.category].push(p)
    return map
  }, [allEnriched])

  const heroPicks = useMemo(() => {
    return allEnriched
      .filter(p => p.valueGap != null && p.valueGap > 0 && (p.signal_score ?? 0) >= 60)
      .sort((a, b) => (b.valueGap ?? 0) - (a.valueGap ?? 0))
      .slice(0, 3)
  }, [allEnriched])

  const waiverPicks = useMemo(() => {
    const eligibleCats = new Set(['streamer', 'sleeper', 'riser', 'mover'])
    const pool = allEnriched.filter(p => {
      if (!eligibleCats.has(p.category)) return false
      if ((p.signal_score ?? 0) < WAIVER_SIGNAL_MIN) return false
      if (p.ownership != null && p.ownership >= WAIVER_OWNERSHIP_MAX) return false
      return true
    })

    const filtered =
      waiverFilter === 'all'
        ? pool
        : pool.filter(p => {
            const isPitcher =
              p.category === 'streamer' || /SP|RP|P$/.test(p.details?.position ?? '')
            return waiverFilter === 'pitchers' ? isPitcher : !isPitcher
          })

    return filtered
      .sort((a, b) => (b.valueGap ?? -1) - (a.valueGap ?? -1))
      .slice(0, 10)
  }, [allEnriched, waiverFilter])

  const streamerRows = useMemo(
    () =>
      enrichedByCat.streamer
        .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))
        .slice(0, 8),
    [enrichedByCat],
  )

  const coolOffRows = useMemo(
    () =>
      [...enrichedByCat.faller, ...enrichedByCat.cooler]
        .sort((a, b) => (a.signal_score ?? 100) - (b.signal_score ?? 100))
        .slice(0, 6),
    [enrichedByCat],
  )

  const farmCards = useMemo(() => enrichedByCat.prospect.slice(0, 6), [enrichedByCat])

  const stats = useMemo(
    () => ({
      waiver: waiverPicks.length,
      streamers: enrichedByCat.streamer.length,
      callups: enrichedByCat.prospect.length,
      coolOff: enrichedByCat.faller.length + enrichedByCat.cooler.length,
      avgGap: heroPicks.length
        ? Math.round(heroPicks.reduce((s, p) => s + (p.valueGap ?? 0), 0) / heroPicks.length)
        : null,
    }),
    [waiverPicks, enrichedByCat, heroPicks],
  )

  const hoveredPick = hoveredId ? allEnriched.find(p => p.id === hoveredId) ?? null : null

  // Right-rail search
  const fetchPlayers = useCallback(async (q: string, sub: 'batter' | 'pitcher') => {
    if (!q.trim()) {
      setUsingApi(false)
      setApiPlayers([])
      return
    }
    setApiLoading(true)
    setUsingApi(true)
    try {
      const params = new URLSearchParams({
        subject: sub,
        season: String(new Date().getFullYear()),
        search: q.trim(),
      })
      const res = await fetch(`/api/stats/players?${params}`)
      const json = await res.json()
      setApiPlayers(json.rows ?? [])
    } catch {
      setApiPlayers([])
    } finally {
      setApiLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchPlayers(search, subject), 280)
    return () => clearTimeout(t)
  }, [search, subject, fetchPlayers])

  const browserList = useMemo(() => {
    if (usingApi) {
      return apiPlayers.map(p => {
        const slate = allEnriched.find(fp => fp.player_id === p.id)
        return {
          id: p.id,
          name: p.name,
          team: p.team,
          pos: p.pos,
          isSlate: !!slate,
          signal: slate?.signal_score ?? null,
          ownership: slate?.ownership ?? null,
          accent: slate?.accent ?? '#1A1A1A',
        }
      })
    }
    return allEnriched
      .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))
      .map(p => ({
        id: p.player_id ?? p.id,
        name: p.player_name,
        team: p.team_name ?? '',
        pos: p.categoryLabel,
        isSlate: true,
        signal: p.signal_score,
        ownership: p.ownership,
        accent: p.accent,
      }))
  }, [usingApi, apiPlayers, allEnriched])

  const subPages = [
    {
      kicker: '§ Waiver',
      title: 'Start / Sit',
      href: '/fantasy/start-sit',
      count: stats.waiver,
      desc: 'Under 40% owned, cleared the signal floor.',
    },
    {
      kicker: '§ Streamers',
      title: 'Streamer Board',
      href: '/fantasy/streamers',
      count: stats.streamers,
      desc: 'Tonight\u2019s probable pitchers, ranked.',
    },
    {
      kicker: '§ Two-Start',
      title: 'This Week',
      href: '/fantasy/two-start',
      count: null,
      desc: 'Pitchers going twice this week.',
    },
    {
      kicker: '§ Farm',
      title: 'Prospect Watch',
      href: '/fantasy/prospects',
      count: stats.callups,
      desc: 'AAA hitters heating up right now.',
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* ─── MASTHEAD ─── */}
      <div className="mb-6">
        <div className="text-[#FF5722] text-[10px] font-mono uppercase tracking-widest font-bold mb-1">
          ⊕ The Edge · Fantasy Desk
          {isPro && <span className="ml-2 text-emerald-700">· Pro</span>}
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1
            className="text-4xl sm:text-5xl font-black tracking-tight leading-none"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            The Desk<span className="text-[#FF5722]">.</span>
          </h1>
          <p className="font-serif italic text-stone-500 text-[13px] max-w-md">
            Where our model disagrees with the market. Every pick on the slate, sorted by value gap.
          </p>
        </div>
        <p className="font-mono text-[11px] text-stone-500 mt-2">
          {formatDate(forDate)}
          {isStale && (
            <span className="ml-2 text-amber-600 font-bold">· most recent slate</span>
          )}
        </p>
      </div>

      {/* ─── METHODOLOGY STRIP ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          {
            mark: '⊕',
            label: 'Signal',
            desc: 'Our 0\u2013100 score per player, built from 8 model factors and refreshed every 4 hours.',
          },
          {
            mark: '§',
            label: 'Ownership',
            desc: 'Live ESPN public-league ownership %. Updated hourly during the season.',
          },
          {
            mark: '▲',
            label: 'Value Gap',
            desc: 'Signal minus Ownership. Wider gap = the market hasn\u2019t caught up yet.',
          },
        ].map(item => (
          <div key={item.label} className="bg-white border border-stone-200 px-4 py-3">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-serif font-black text-[#FF5722] text-[15px] leading-none">
                {item.mark}
              </span>
              <div className="font-mono text-[10px] uppercase tracking-widest text-stone-900 font-bold">
                {item.label}
              </div>
            </div>
            <p className="font-serif text-[12px] text-stone-600 leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ─── SUB-PAGE NAV CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {subPages.map(sp => (
          <Link
            key={sp.href}
            href={sp.href}
            className="group bg-[#F5F1E8] hover:bg-white border border-stone-200 hover:border-stone-900 transition px-4 py-3 flex flex-col"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#FF5722] font-bold">
                {sp.kicker}
              </span>
              {sp.count != null && (
                <span className="font-mono text-[16px] font-bold tabular-nums text-stone-900 leading-none">
                  {sp.count}
                </span>
              )}
            </div>
            <div className="font-serif font-bold text-[15px] mb-1">{sp.title}</div>
            <p className="font-serif italic text-[11px] text-stone-500 leading-snug flex-1">
              {sp.desc}
            </p>
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 group-hover:text-[#FF5722] mt-2">
              Open →
            </div>
          </Link>
        ))}
      </div>

      {/* ─── TWO-COLUMN LAYOUT ─── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* ═══ LEFT (main) ═══ */}
        <div className="min-w-0">
          {/* ── SLATE STATS STRIP ── */}
          <div className="grid grid-cols-5 border border-stone-900 mb-6">
            {[
              { label: 'Waiver Gems', value: stats.waiver, color: '#FF5722' },
              { label: 'Streamers', value: stats.streamers, color: '#1A1A1A' },
              { label: 'Callups', value: stats.callups, color: '#7C3AED' },
              { label: 'Sell / Sit', value: stats.coolOff, color: '#DC2626' },
              {
                label: 'Avg Gap',
                value: stats.avgGap != null ? `+${stats.avgGap}` : '—',
                color: '#15803D',
              },
            ].map((s, i) => (
              <div key={s.label} className={`px-3 py-2.5 ${i < 4 ? 'border-r border-stone-200' : ''}`}>
                <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 font-medium">
                  {s.label}
                </div>
                <div
                  className="font-mono text-2xl font-bold tabular-nums leading-none mt-1.5"
                  style={{ color: s.color }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* ── FRONT PAGE HERO ── */}
          {heroPicks.length > 0 && (
            <section className="mb-8 relative">
              <SectionLabel title="Tonight's biggest edges" />
              <MethodologyNote>
                The top three picks where our signal most disagrees with public ownership. Sorted
                by absolute gap. Hover any card for the underlying profile.
              </MethodologyNote>
              <div className="grid sm:grid-cols-3 gap-3">
                {heroPicks.map(p => (
                  <HeroCard
                    key={p.id}
                    pick={p}
                    onEnter={() => handleEnter(p.id)}
                    onLeave={handleLeave}
                  />
                ))}
              </div>
              {hoveredPick && heroPicks.some(p => p.id === hoveredPick.id) && (
                <div className="absolute right-0 top-full mt-2 z-40 pointer-events-none">
                  <HoverPlayerCard pick={hoveredPick} />
                </div>
              )}
            </section>
          )}

          {/* ── WAIVER WIRE ── */}
          <section className="mb-8 relative">
            <SectionLabel title="The Waiver Wire" />
            <MethodologyNote>
              Under {WAIVER_OWNERSHIP_MAX}% owned in ESPN public leagues, signal &ge;{' '}
              {WAIVER_SIGNAL_MIN}, sorted by value gap. If ownership is unknown for a pick we
              still surface it, tagged with an em-dash.
            </MethodologyNote>

            <div className="flex gap-1.5 mb-3">
              {(['all', 'batters', 'pitchers'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setWaiverFilter(f)}
                  className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1 border transition ${
                    waiverFilter === f
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-700 border-stone-900 hover:bg-stone-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div
              className="grid gap-2 px-3 py-2 bg-[#F5F1E8] border border-stone-200 border-b-0"
              style={{ gridTemplateColumns: '24px 1.8fr 1.5fr 44px 130px 40px' }}
            >
              {['#', 'Player', 'Why now', 'Own', 'Value gap', 'Sig'].map((h, i) => (
                <div
                  key={h}
                  className={`font-mono text-[8.5px] uppercase tracking-widest text-stone-500 font-medium ${
                    i >= 3 ? 'text-right' : ''
                  } ${i === 4 ? 'text-center' : ''}`}
                >
                  {h}
                </div>
              ))}
            </div>

            <div className="bg-white border border-stone-200 border-t-0 relative">
              {waiverPicks.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="font-serif italic text-stone-400 text-sm">
                    No waiver-wire gems clearing the signal floor right now.
                  </p>
                </div>
              ) : (
                waiverPicks.map((p, i) => (
                  <WaiverRow
                    key={p.id}
                    pick={p}
                    rank={i + 1}
                    onEnter={() => handleEnter(p.id)}
                    onLeave={handleLeave}
                    onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  />
                ))
              )}

              {hoveredPick && waiverPicks.some(p => p.id === hoveredPick.id) && (
                <div className="absolute right-4 top-4 z-40 pointer-events-none">
                  <HoverPlayerCard pick={hoveredPick} />
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mt-2">
              <span className="font-mono text-[9px] text-stone-500">
                Ownership · ESPN public leagues · updated hourly
              </span>
              <Link
                href="/fantasy/start-sit"
                className="font-mono text-[9.5px] uppercase tracking-widest text-[#FF5722] hover:text-orange-600 font-bold"
              >
                Full waiver board →
              </Link>
            </div>
          </section>

          {/* ── FARM REPORT ── */}
          {farmCards.length > 0 && (
            <section className="mb-8 relative">
              <SectionLabel title="The Farm Report" />
              <MethodologyNote>
                AAA hitters flagged by rolling xwOBA and hard-hit% relative to their level.
                Recent form only — this is <span className="not-italic font-bold">not</span> a
                scouting grade.
              </MethodologyNote>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {farmCards.map(p => (
                  <FarmCard
                    key={p.id}
                    pick={p}
                    onEnter={() => handleEnter(p.id)}
                    onLeave={handleLeave}
                  />
                ))}
              </div>
              {hoveredPick && farmCards.some(p => p.id === hoveredPick.id) && (
                <div className="absolute right-0 top-full mt-2 z-40 pointer-events-none">
                  <HoverPlayerCard pick={hoveredPick} />
                </div>
              )}
              <div className="flex justify-end items-center mt-2">
                <Link
                  href="/fantasy/prospects"
                  className="font-mono text-[9.5px] uppercase tracking-widest text-[#FF5722] hover:text-orange-600 font-bold"
                >
                  Full farm →
                </Link>
              </div>
            </section>
          )}

          {/* ── STREAMER BOARD ── */}
          <section className="mb-8 relative">
            <SectionLabel title="The Streamer Board" live />
            <MethodologyNote>
              Confirmed probables tonight. IP / K / ER projected against the opposing lineup&rsquo;s
              performance vs handedness, adjusted for park.
            </MethodologyNote>

            <div
              className="grid gap-2 px-3 py-2 bg-[#F5F1E8] border border-stone-200 border-b-0"
              style={{ gridTemplateColumns: '1.7fr 1.1fr 34px 34px 34px 40px 44px' }}
            >
              {[
                ['Pitcher · Matchup', 'left'],
                ['Read', 'left'],
                ['IP', 'right'],
                ['K', 'right'],
                ['ER', 'right'],
                ['Own', 'right'],
                ['Sig', 'right'],
              ].map(([label, align]) => (
                <div
                  key={label}
                  className={`font-mono text-[8.5px] uppercase tracking-widest text-stone-500 font-medium text-${align}`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="bg-white border border-stone-200 border-t-0 relative">
              {streamerRows.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="font-serif italic text-stone-400 text-sm">
                    Streamers populate once probable pitchers confirm — usually 3–4 hours pre-game.
                  </p>
                </div>
              ) : (
                streamerRows.map(p => (
                  <StreamerRow
                    key={p.id}
                    pick={p}
                    onEnter={() => handleEnter(p.id)}
                    onLeave={handleLeave}
                    onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  />
                ))
              )}
              {hoveredPick && streamerRows.some(p => p.id === hoveredPick.id) && (
                <div className="absolute right-4 top-4 z-40 pointer-events-none">
                  <HoverPlayerCard pick={hoveredPick} />
                </div>
              )}
            </div>

            <div className="text-right mt-2">
              <Link
                href="/fantasy/streamers"
                className="font-mono text-[9.5px] uppercase tracking-widest text-[#FF5722] hover:text-orange-600 font-bold"
              >
                Full 7-day board →
              </Link>
            </div>
          </section>

          {/* ── COOL OFF ── */}
          {coolOffRows.length > 0 && (
            <section className="mb-8 relative">
              <SectionLabel title="Cool off" />
              <MethodologyNote>
                Owned players trending down on rolling xwOBA (batters) or xERA (pitchers). The
                market hasn&rsquo;t repriced yet — sell high or bench before the drop.
              </MethodologyNote>

              <div
                className="grid gap-2 px-3 py-2 bg-[#F5F1E8] border border-stone-200 border-b-0"
                style={{ gridTemplateColumns: '1.8fr 1.5fr 44px 130px 40px' }}
              >
                {[
                  ['Player', 'left'],
                  ['Reason', 'left'],
                  ['Own', 'right'],
                  ['Overvalue gap', 'center'],
                  ['Sig', 'right'],
                ].map(([label, align]) => (
                  <div
                    key={label}
                    className={`font-mono text-[8.5px] uppercase tracking-widest text-stone-500 font-medium text-${align}`}
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div className="bg-white border border-stone-200 border-t-0 relative">
                {coolOffRows.map(p => (
                  <CoolOffRow
                    key={p.id}
                    pick={p}
                    onEnter={() => handleEnter(p.id)}
                    onLeave={handleLeave}
                    onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                  />
                ))}
                {hoveredPick && coolOffRows.some(p => p.id === hoveredPick.id) && (
                  <div className="absolute right-4 top-4 z-40 pointer-events-none">
                    <HoverPlayerCard pick={hoveredPick} />
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="pt-8 mt-6 border-t border-stone-200 text-center">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-stone-400">
              Information only · not gambling advice · ownership from ESPN public leagues
            </p>
          </div>
        </div>

        {/* ═══ RIGHT (sticky player browser — matches Dashboard leaderboard) ═══ */}
        <div className="lg:sticky lg:top-[76px]">
          <div className="bg-white border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-600 mb-2.5">
                Player browser
              </div>

              <div className="flex gap-1 mb-2.5 bg-stone-100 p-0.5">
                {(['batter', 'pitcher'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setSubject(s)
                      setSearch('')
                    }}
                    className={`flex-1 font-mono text-[10px] uppercase tracking-wider py-1.5 transition ${
                      subject === s
                        ? 'bg-[#1A1A1A] text-white'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {s === 'batter' ? 'Batters' : 'Pitchers'}
                  </button>
                ))}
              </div>

              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search any player…"
                className="w-full border border-stone-200 px-3 py-2 font-mono text-sm focus:outline-none focus:border-stone-400"
              />
            </div>

            <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
              {apiLoading ? (
                <div className="px-4 py-12 text-center font-mono text-sm text-stone-400">
                  Loading…
                </div>
              ) : browserList.length === 0 ? (
                <div className="px-4 py-12 text-center font-mono text-sm text-stone-400">
                  {search ? 'No players found' : 'Type to search'}
                </div>
              ) : (
                browserList.slice(0, 30).map((p, idx) => {
                  const isActive = selectedId === p.id
                  return (
                    <button
                      key={`${p.id}-${idx}`}
                      onClick={() => setSelectedId(isActive ? null : p.id)}
                      onMouseEnter={() => handleEnter(p.id)}
                      onMouseLeave={handleLeave}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 text-left transition border-b border-stone-50 last:border-0 ${
                        isActive ? 'bg-orange-50' : 'hover:bg-stone-50'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-stone-300 w-5 tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-serif font-semibold text-[13px] text-stone-900 truncate">
                          {p.name}
                        </div>
                        <div className="font-mono text-[10px] text-stone-400 truncate">
                          {p.pos}
                          {p.team ? ` · ${p.team}` : ''}
                          {p.isSlate && <span className="ml-1.5 text-emerald-600">• slate</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {p.signal != null ? (
                          <div
                            className="font-mono text-[13px] font-bold tabular-nums"
                            style={{ color: '#FF5722' }}
                          >
                            {Math.round(p.signal)}
                          </div>
                        ) : (
                          <div className="font-mono text-[10px] text-stone-300">—</div>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}