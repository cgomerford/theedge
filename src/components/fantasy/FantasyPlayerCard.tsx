'use client'

/**
 * src/components/fantasy/FantasyPlayerCard.tsx
 *
 * Collapsible player card for the Fantasy Desk.
 * Collapsed: player info + Edge score + signal bars + movement pill
 * Expanded: component breakdown bars showing what drives the score
 *
 * Works for all pick types (streamer, faller, sleeper).
 * Movers use FantasyMoverAlert instead.
 */

import { useState } from 'react'
import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'

// ─── Signal bar config per tier ────────────────────────────────────────────
type TierKey = 'strong' | 'viable' | 'avoid' | 'sleeper'

const TIER_META: Record<TierKey, {
  label: string
  scoreColor: string
  labelColor: string
  bgColor: string
  borderColor: string
  barColors: string[]
}> = {
  strong: {
    label: 'Strong',
    scoreColor: 'text-emerald-600',
    labelColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-600',
    barColors: ['bg-emerald-200', 'bg-emerald-300', 'bg-emerald-400', 'bg-emerald-400', 'bg-emerald-600'],
  },
  viable: {
    label: 'Viable',
    scoreColor: 'text-amber-600',
    labelColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-600',
    barColors: ['bg-amber-200', 'bg-amber-300', 'bg-amber-400', 'bg-amber-500', 'bg-amber-500'],
  },
  avoid: {
    label: 'Avoid',
    scoreColor: 'text-red-600',
    labelColor: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-600',
    barColors: ['bg-red-600', 'bg-red-400', 'bg-red-300', 'bg-red-200', 'bg-red-100'],
  },
  sleeper: {
    label: 'Sleeper',
    scoreColor: 'text-blue-600',
    labelColor: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-600',
    barColors: ['bg-blue-200', 'bg-blue-300', 'bg-blue-400', 'bg-blue-500', 'bg-blue-600'],
  },
}

// ─── Derive tier from pick type + score ───────────────────────────────────
function getTier(pick: FantasyPick): TierKey {
  if (pick.pick_type === 'sleeper') return 'sleeper'
  if (pick.pick_type === 'faller') return 'avoid'
  // Streamers use the stored tier or derive from score
  const detailTier = pick.details?.tier
  if (detailTier === 'strong' || detailTier === 'viable' || detailTier === 'avoid') return detailTier
  const s = pick.signal_score ?? 50
  if (s >= 70) return 'strong'
  if (s >= 55) return 'viable'
  return 'avoid'
}

// ─── Signal bar heights based on score ────────────────────────────────────
function getSignalHeights(score: number, tier: TierKey): number[] {
  // Strong/viable/sleeper: ascending bars (building momentum)
  // Avoid: descending bars (declining)
  const norm = Math.max(0, Math.min(100, score)) / 100
  if (tier === 'avoid') {
    return [
      Math.round(18 + norm * 2),
      Math.round(14 + norm * 2),
      Math.round(10 + norm * 2),
      Math.round(6 + norm * 2),
      Math.round(4),
    ]
  }
  return [
    Math.round(4 + norm * 4),
    Math.round(6 + norm * 6),
    Math.round(10 + norm * 4),
    Math.round(12 + norm * 4),
    Math.round(14 + norm * 6),
  ]
}

// ─── Breakdown bars data per pick type ────────────────────────────────────
type BreakdownBar = {
  label: string
  value: number       // 0-100 for fill width
  display: string     // what to show as text
  color: 'green' | 'amber' | 'red' | 'blue' | 'gray'
}

function getBreakdownBars(pick: FantasyPick): BreakdownBar[] {
  const d = pick.details ?? {}

  if (pick.pick_type === 'streamer') {
    return [
      barFromScore('Pitching', d.pitcher_quality ?? d.quality, 'green'),
      barFromScore('Opp. offence', d.opponent, 'green'),
      barFromScore('Stuff', d.stuff, 'green'),
      barFromScore('Park', d.park ?? 55, 'green'),
    ]
  }

  if (pick.pick_type === 'faller') {
    // Faller = elite pitcher who's a wall for opposing hitters
    // High values = stronger threat = red bars (danger for fantasy owners)
    return [
      barFromScoreInverted('Arm quality', d.pitcher_quality, 'red'),
      barFromScoreInverted('Stuff', d.stuff, 'red'),
      barFromScore('Opp. strength', d.opp_strength, 'amber'),
    ]
  }

  if (pick.pick_type === 'sleeper') {
    const bars: BreakdownBar[] = [
      barFromScore('Pitching', d.quality ?? d.pitcher_quality, 'blue'),
      barFromScore('Opp. offence', d.opponent ?? d.opp_weakness, 'blue'),
    ]
    if (d.era != null && d.fip != null) {
      const gap = Math.abs(parseFloat(d.era) - parseFloat(d.fip))
      const gapPct = Math.min(100, Math.round(gap * 30))
      bars.push({ label: 'ERA vs FIP', value: gapPct, display: `${gap.toFixed(2)} gap`, color: 'blue' })
    }
    if (d.park != null) {
      bars.push(barFromScore('Park', d.park, 'blue'))
    }
    return bars
  }

  return []
}

function barFromScore(label: string, score: number | undefined | null, defaultColor: 'green' | 'amber' | 'red' | 'blue' | 'gray'): BreakdownBar {
  const s = score ?? 50
  let color = defaultColor
  if (defaultColor === 'green' || defaultColor === 'blue') {
    if (s >= 65) color = defaultColor
    else if (s >= 45) color = 'amber'
    else color = 'red'
  }
  if (defaultColor === 'red') {
    if (s >= 65) color = 'green'
    else if (s >= 45) color = 'amber'
    else color = 'red'
  }
  return { label, value: s, display: String(s), color }
}

/** For fallers: higher score = MORE dangerous = red */
function barFromScoreInverted(label: string, score: number | undefined | null, _defaultColor: 'red'): BreakdownBar {
  const s = score ?? 50
  let color: BreakdownBar['color'] = 'amber'
  if (s >= 70) color = 'red'
  else if (s >= 55) color = 'amber'
  else color = 'gray'
  return { label, value: s, display: String(s), color }
}

const BAR_COLORS: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-red-500',
  blue:  'bg-blue-500',
  gray:  'bg-stone-400',
}

// ─── Movement pill ────────────────────────────────────────────────────────
function MovementPill({ pick }: { pick: FantasyPick }) {
  const d = pick.details ?? {}
  const prevScore = d.prev_score ?? d.previous_score
  const currScore = pick.signal_score

  if (prevScore != null && currScore != null) {
    const diff = currScore - prevScore
    if (diff > 0) return <span className="font-mono text-[10px] font-bold text-emerald-600">▲{diff}</span>
    if (diff < 0) return <span className="font-mono text-[10px] font-bold text-red-600">▼{Math.abs(diff)}</span>
  }

  return <span className="font-mono text-[10px] font-bold text-blue-600">New</span>
}

// ─── Component ────────────────────────────────────────────────────────────
export default function FantasyPlayerCard({ pick, isPro = true }: { pick: FantasyPick; isPro?: boolean }) {
  const [open, setOpen] = useState(false)
  const [showGate, setShowGate] = useState(false)

  const tier = getTier(pick)
  const meta = TIER_META[tier]
  const score = pick.signal_score ?? 0
  const scoreDisplay = pick.pick_type === 'sleeper' ? '+R' : String(score)
  const signalHeights = getSignalHeights(score, tier)
  const breakdownBars = getBreakdownBars(pick)

  const gameLink = pick.game_slug ? `/mlb/${pick.game_slug}` : null

  const handleToggle = () => {
    if (!isPro) {
      setShowGate(true)
      return
    }
    setOpen(!open)
  }

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border transition-colors ${
        open ? 'border-orange-500 shadow-md' : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* ── Collapsed view (always visible) ─────────────────────── */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left flex items-stretch"
        aria-expanded={open}
      >
        {/* Player info */}
        <div className="flex-1 px-4 sm:px-5 py-4 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif font-semibold text-base text-stone-900 leading-tight truncate">
              {pick.player_name}
            </span>
            <span className="font-mono text-[10px] text-stone-500 tracking-wide shrink-0">
              {pick.team_name} vs {pick.opponent_name}
              {pick.game_time ? ` · ${pick.game_time}` : ''}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1.5 leading-relaxed line-clamp-2">
            {pick.one_liner}
          </p>
        </div>

        {/* Score + signal bars */}
        <div className={`flex items-center gap-4 px-5 border-l-[3px] rounded-r-lg ${meta.borderColor} ${meta.bgColor}`}>
          {/* Score block */}
          <div className="text-center min-w-[52px] py-3">
            <div className={`font-['Bebas_Neue',sans-serif] text-[32px] leading-none ${meta.scoreColor}`}>
              {scoreDisplay}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className={`font-mono text-[8px] tracking-widest uppercase font-bold ${meta.labelColor}`}>
                {meta.label}
              </span>
            </div>
            <div className="mt-1">
              <MovementPill pick={pick} />
            </div>
          </div>

          {/* Signal strength bars */}
          <div className="flex items-end gap-[3px] h-6">
            {signalHeights.map((h, i) => (
              <div
                key={i}
                className={`w-[4px] rounded-t-sm ${meta.barColors[i]}`}
                style={{ height: `${h}px` }}
              />
            ))}
          </div>

          {/* Chevron */}
          <div className={`text-stone-400 transition-transform duration-200 ml-1 ${open ? 'rotate-180 text-orange-500' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </button>

      {/* ── Expanded breakdown (toggle) ─────────────────────────── */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? 'max-h-[300px]' : 'max-h-0'
        }`}
      >
        <div className="bg-stone-50 border-t border-stone-100 px-4 sm:px-5 py-3 rounded-b-lg">
          <div className="font-mono text-[8px] tracking-[0.15em] uppercase text-stone-400 mb-2">
            What&apos;s driving this edge
          </div>
          <div className="space-y-1.5">
            {breakdownBars.map((bar) => (
              <div key={bar.label} className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-stone-500 w-[72px] text-right shrink-0">
                  {bar.label}
                </span>
                <div className="flex-1 h-[5px] bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_COLORS[bar.color]}`}
                    style={{ width: `${bar.value}%` }}
                  />
                </div>
                <span className={`font-mono text-[9px] font-bold w-[28px] shrink-0 ${
                  bar.color === 'red' ? 'text-red-600' :
                  bar.color === 'green' ? 'text-emerald-600' :
                  bar.color === 'blue' ? 'text-blue-600' :
                  bar.color === 'amber' ? 'text-amber-600' : 'text-stone-500'
                }`}>
                  {bar.display}
                </span>
              </div>
            ))}
          </div>

          {/* Link to full game page */}
          {gameLink && (
            <Link
              href={gameLink}
              className="inline-flex items-center gap-1 mt-3 font-mono text-[9px] tracking-widest uppercase text-orange-600 hover:text-orange-700 transition"
            >
              Full game preview →
            </Link>
          )}
        </div>
      </div>

      {/* ── Pro gate (free users trying to expand) ──────────────── */}
      {showGate && !isPro && (
        <div className="border-t border-stone-100 bg-stone-50 rounded-b-lg px-4 sm:px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-700 font-serif">
                See why this scores <span className="font-semibold">{scoreDisplay}</span> — component breakdowns are Pro.
              </p>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 font-mono text-[10px] uppercase tracking-widest bg-stone-900 text-white px-4 py-2 hover:bg-stone-800 transition rounded"
            >
              Unlock →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}