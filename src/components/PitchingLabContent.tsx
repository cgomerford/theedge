'use client'

// src/components/PitchingLabContent.tsx
// Pitching Lab — Pro tier
//
// Structure (top to bottom):
//   0. Headline read — one sentence synthesizing BOTH pitchers, sits above everything
//   1. Arsenal deep-dive (with grades), per pitcher
//   2. Two-Strike Profile, per pitcher
//   3. Times Through the Order, per pitcher
//   4. First-Pitch Tendencies, per pitcher
// Plus Hot Zones at the bottom.
//
// Free-tier callers should NOT render this component at all — show the
// headline read text alone (see `buildHeadlineRead` export) behind a
// ProLockOverlay-style teaser, then lock everything below it.

import { pitchColor } from '@/lib/mlb'
import React from 'react'

type PitchEntry = {
  pitch_type: string
  pitch_name: string
  percentage: number
  avg_velocity: number | null
  whiff_percent: number | null
  ba_against: number | null
  est_woba: number | null
  hard_hit_percent: number | null
  put_away_percent: number | null
  k_percent: number | null
}

type PitcherStats = {
  player_id?: number | null
  player_name?: string | null
  era?: number | null
  fip?: number | null
  k_per_9?: number | null
  bb_per_9?: number | null
  l3_era?: number | null
  vs_lhb_baa?: number | null
  vs_rhb_baa?: number | null
  tto1_era?: number | null
  tto2_era?: number | null
  tto3_era?: number | null
  tto1_pa?: number | null
  tto2_pa?: number | null
  tto3_pa?: number | null
  two_strike_mix?: Record<string, {
    name: string
    all_pct: number
    two_strike_pct: number
    delta: number
  }> | null
  first_pitch_strike_pct?: number | null
  first_pitch_mix?: Record<string, { name: string; pct: number }> | null
}
type PitchingLabContentProps = {
  awayPitcherName: string | null
  homePitcherName: string | null
  awayPitcherId: number | null
  homePitcherId: number | null
  awayPitchMix: PitchEntry[]
  homePitchMix: PitchEntry[]
  awayPitcherStats: PitcherStats | null
  homePitcherStats: PitcherStats | null
  awayAbbr: string
  homeAbbr: string
  // Hot zone slot passed through as ReactNode
  hotZoneSlot?: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradePitch(p: PitchEntry): { grade: string; color: string; bg: string } {
  let score = 0
  let factors = 0

  if (p.whiff_percent != null) {
    score += p.whiff_percent >= 35 ? 2 : p.whiff_percent >= 28 ? 1 : p.whiff_percent >= 20 ? 0 : -1
    factors++
  }
  if (p.est_woba != null) {
    score += p.est_woba <= 0.270 ? 2 : p.est_woba <= 0.300 ? 1 : p.est_woba <= 0.330 ? 0 : -1
    factors++
  }
  if (p.hard_hit_percent != null) {
    score += p.hard_hit_percent <= 28 ? 2 : p.hard_hit_percent <= 34 ? 1 : p.hard_hit_percent <= 40 ? 0 : -1
    factors++
  }
  if (p.put_away_percent != null) {
    score += p.put_away_percent >= 35 ? 2 : p.put_away_percent >= 28 ? 1 : p.put_away_percent >= 20 ? 0 : -1
    factors++
  }

  if (factors === 0) return { grade: '–', color: '#78716C', bg: 'rgba(120,113,108,0.08)' }

  const avg = score / factors
  if (avg >= 1.5)  return { grade: 'A+', color: '#15803D', bg: 'rgba(21,128,61,0.10)' }
  if (avg >= 0.8)  return { grade: 'A',  color: '#16A34A', bg: 'rgba(22,163,74,0.10)' }
  if (avg >= 0.2)  return { grade: 'B',  color: '#2563EB', bg: 'rgba(37,99,235,0.10)' }
  if (avg >= -0.3) return { grade: 'C',  color: '#D97706', bg: 'rgba(217,119,6,0.10)' }
  return { grade: 'D', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' }
}

function xwobaDisplay(v: number | null): string {
  if (v == null) return '–'
  return v.toFixed(3)
}

function pctDisplay(v: number | null, dec = 1): string {
  if (v == null) return '–'
  return `${Number(v).toFixed(dec)}%`
}

function baaDisplay(v: number | null): string {
  if (v == null) return '–'
  return `.${Math.round(v * 1000).toString().padStart(3, '0')}`
}

// ── Headline read — synthesizes BOTH pitchers into one top-of-tab sentence ────
//
// This is the free-tier-visible line. Everything else in this file is Pro-only.
// Picks the single most game-relevant fact across both starters rather than
// repeating each pitcher's individual read. Exported so the game page can
// render it standalone (free teaser) without mounting the full Pro component.

export function buildHeadlineRead({
  awayPitcherName,
  homePitcherName,
  awayPitchMix,
  homePitchMix,
  awayPitcherStats,
  homePitcherStats,
  awayAbbr,
  homeAbbr,
}: {
  awayPitcherName: string | null
  homePitcherName: string | null
  awayPitchMix: PitchEntry[]
  homePitchMix: PitchEntry[]
  awayPitcherStats: PitcherStats | null
  homePitcherStats: PitcherStats | null
  awayAbbr: string
  homeAbbr: string
}): string | null {
  if (!awayPitcherName && !homePitcherName) return null

  // Helper: does this pitcher have a clear "trap" zone — a high-volume pitch
  // that also grades well (low xwOBA)? That's the most tweetable single fact.
  function findTrap(mix: PitchEntry[]): PitchEntry | null {
    const candidates = mix.filter(p => p.percentage >= 15 && p.est_woba != null)
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => (a.est_woba ?? 1) - (b.est_woba ?? 1))[0]
  }

  // Helper: is this pitcher fading hard by the third time through the order?
  function ttoFade(stats: PitcherStats | null): number | null {
    if (stats?.tto1_era == null || stats?.tto3_era == null) return null
    const gap = stats.tto3_era - stats.tto1_era
    return gap > 0.040 ? gap : null
  }

  const awayTrap = awayPitchMix.length > 0 ? findTrap(awayPitchMix) : null
  const homeTrap = homePitchMix.length > 0 ? findTrap(homePitchMix) : null
  const awayFade = ttoFade(awayPitcherStats)
  const homeFade = ttoFade(homePitcherStats)

  // Priority 1: both starters have a real trap pitch — frame as a duel.
  if (awayTrap && homeTrap && awayPitcherName && homePitcherName) {
    return `Both starters live on the edges — ${awayAbbr}'s exploitable trap is the ${awayTrap.pitch_name.toLowerCase()}, ${homeAbbr}'s is the ${homeTrap.pitch_name.toLowerCase()}. Whoever finds it first controls the game.`
  }

  // Priority 2: one starter fades hard by the third trip — that's the night's storyline.
  if (awayFade && awayPitcherName) {
    return `${awayPitcherName} starts strong but the wheels come off the third time through the order — the late innings are where this game turns.`
  }
  if (homeFade && homePitcherName) {
    return `${homePitcherName} starts strong but the wheels come off the third time through the order — the late innings are where this game turns.`
  }

  // Priority 3: one starter has a clear trap, the other doesn't — frame the asymmetry.
  if (awayTrap && awayPitcherName) {
    return `${awayPitcherName}'s ${awayTrap.pitch_name.toLowerCase()} is the pitch to watch tonight — it's his most-used weapon and hitters can't do much with it.`
  }
  if (homeTrap && homePitcherName) {
    return `${homePitcherName}'s ${homeTrap.pitch_name.toLowerCase()} is the pitch to watch tonight — it's his most-used weapon and hitters can't do much with it.`
  }

  // Fallback: at least name both starters so the read isn't empty.
  if (awayPitcherName && homePitcherName) {
    return `${awayPitcherName} and ${homePitcherName} face off tonight — full arsenal breakdown and matchup detail below.`
  }

  return null
}

// ── Arsenal Table ─────────────────────────────────────────────────────────────

function ArsenalTable({
  pitchMix,
  pitcherName,
}: {
  pitchMix: PitchEntry[]
  pitcherName: string
}) {
  const pitches = pitchMix.filter(p => p.percentage >= 3).sort((a, b) => b.percentage - a.percentage)

  if (pitches.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400 font-serif italic text-sm">
        No arsenal data available
      </div>
    )
  }

  // Smart-friend read
  const primary = pitches[0]
  const swingMiss = [...pitches].sort((a, b) => (b.whiff_percent ?? 0) - (a.whiff_percent ?? 0))[0]
  const weakest = [...pitches].sort((a, b) => (b.est_woba ?? 0) - (a.est_woba ?? 0))[0]

  const readLine = [
    `${primary.pitch_name} is the primary weapon at ${primary.percentage.toFixed(0)}% usage.`,
    swingMiss.whiff_percent != null && swingMiss.whiff_percent >= 25
      ? `The ${swingMiss.pitch_name} generates the most swing-and-miss (${swingMiss.whiff_percent.toFixed(1)}% whiff).`
      : null,
    weakest.est_woba != null && weakest.est_woba > 0.340
      ? `The ${weakest.pitch_name} is the vulnerability — hitters square it up (.${Math.round(weakest.est_woba * 1000)} xwOBA).`
      : null,
  ].filter(Boolean).join(' ')

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Smart-friend read */}
      <div className="mx-4 mt-4 mb-0 px-4 py-3 rounded-lg border-l-[3px] border-yellow-400"
        style={{ background: 'rgba(253,224,71,0.08)' }}>
        <p className="font-serif italic text-stone-700 text-sm leading-relaxed">{readLine}</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="text-left pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Pitch</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Usage</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Velo</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Whiff%</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">xwOBA</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Hard%</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Put-Away</th>
              <th className="text-right pb-2 text-[9px] font-mono uppercase tracking-wider text-stone-400">Grade</th>
            </tr>
          </thead>
          <tbody>
            {pitches.map((p, i) => {
              const g = gradePitch(p)
              const color = pitchColor(p.pitch_type)
              return (
                <tr key={i} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50 transition-colors">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="font-serif font-semibold text-stone-900 text-sm">{p.pitch_name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-10 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(p.percentage / 50 * 100, 100)}%`, background: color }} />
                      </div>
                      <span className="font-mono text-xs text-stone-700 w-8 text-right">{p.percentage.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-2 font-mono text-xs text-stone-700">
                    {p.avg_velocity?.toFixed(1) ?? '–'}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-mono text-xs font-bold ${(p.whiff_percent ?? 0) >= 30 ? 'text-orange-600' : 'text-stone-700'}`}>
                    {pctDisplay(p.whiff_percent)}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-mono text-xs font-bold ${(p.est_woba ?? 1) <= 0.280 ? 'text-green-600' : (p.est_woba ?? 0) >= 0.340 ? 'text-red-500' : 'text-stone-700'}`}>
                    {xwobaDisplay(p.est_woba)}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-mono text-xs ${(p.hard_hit_percent ?? 0) > 40 ? 'text-red-500 font-bold' : 'text-stone-700'}`}>
                    {pctDisplay(p.hard_hit_percent)}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-mono text-xs ${(p.put_away_percent ?? 0) >= 30 ? 'text-green-600 font-bold' : 'text-stone-700'}`}>
                    {pctDisplay(p.put_away_percent)}
                  </td>
                  <td className="text-right py-2.5 pl-2">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ background: g.bg, color: g.color }}>
                      {g.grade}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Two-Strike Profile ────────────────────────────────────────────────────────

function TwoStrikeProfile({ stats, pitchMix }: { stats: PitcherStats | null, pitchMix: PitchEntry[] }) {
  const mix = stats?.two_strike_mix
  if (!mix || Object.keys(mix).length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 font-serif italic text-sm">
        Two-strike data not yet available — runs weekly
      </div>
    )
  }

  const entries = Object.entries(mix)
    .filter(([, v]) => v.all_pct >= 5)
    .sort((a, b) => b[1].all_pct - a[1].all_pct)

  // Find the biggest lean (most increased in 2-strike counts)
  const biggestLean = [...entries].sort((a, b) => b[1].delta - a[1].delta)[0]

  const readLine = biggestLean
    ? `${biggestLean[1].name} usage jumps ${biggestLean[1].delta > 0 ? '+' : ''}${biggestLean[1].delta.toFixed(0)}% in two-strike counts (${biggestLean[1].all_pct}% overall → ${biggestLean[1].two_strike_pct}%). Hitters know it's coming.`
    : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {readLine && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-lg border-l-[3px] border-yellow-400"
          style={{ background: 'rgba(253,224,71,0.08)' }}>
          <p className="font-serif italic text-stone-700 text-sm leading-relaxed">{readLine}</p>
        </div>
      )}

      <div className="p-4">
        <div className="grid grid-cols-2 gap-px bg-stone-100 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="bg-stone-50 px-4 py-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400 font-bold">All Counts</span>
          </div>
          <div className="bg-stone-50 px-4 py-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400 font-bold">Two-Strike</span>
          </div>

        {entries.map(([pt, v]) => {
            const color = pitchColor(pt)
            const maxPct = 60
            return (
              <React.Fragment key={pt}>
                {/* All counts bar */}
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="font-serif text-sm font-semibold text-stone-800 w-20 shrink-0">{v.name}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(v.all_pct / maxPct) * 100}%`, background: color, opacity: 0.6 }} />
                  </div>
                  <span className="font-mono text-xs text-stone-600 w-10 text-right">{v.all_pct}%</span>
                </div>

                {/* Two-strike bar */}
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(v.two_strike_pct / maxPct) * 100}%`, background: color }} />
                  </div>
                  <span className="font-mono text-xs font-bold text-stone-700 w-10 text-right">{v.two_strike_pct}%</span>
                  <span className={`font-mono text-[10px] font-bold w-10 text-right ${v.delta > 3 ? 'text-green-600' : v.delta < -3 ? 'text-red-500' : 'text-stone-400'}`}>
                    {v.delta > 0 ? '+' : ''}{v.delta}
                  </span>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Times Through the Order ───────────────────────────────────────────────────
//
// BUG FIX (was: "Weakening" label could appear on all three buckets even when
// the pitcher was IMPROVING trip to trip): the old qualityLabel() judged each
// bucket only against a fixed absolute scale, with no awareness of the other
// two buckets. A trend word ("Weakening") was being assigned by an absolute
// threshold — that's the category error. Fix: the per-bucket badge now only
// ever makes an ABSOLUTE claim (Dominant / Strong / Average / Below Average /
// Pull Zone). Trend claims ("falls off", "improves") live ONLY in the
// readLine sentence below, which already correctly compares tto3 vs tto1.

function TimesThrough({ stats }: { stats: PitcherStats | null }) {
  const tto1 = stats?.tto1_era
  const tto2 = stats?.tto2_era
  const tto3 = stats?.tto3_era
  const pa1 = stats?.tto1_pa
  const pa2 = stats?.tto2_pa
  const pa3 = stats?.tto3_pa

  if (tto1 == null && tto2 == null && tto3 == null) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 font-serif italic text-sm">
        TTO data not yet available — runs weekly
      </div>
    )
  }

  // tto values here are xwOBA proxies (0.000 – 0.500 range)
  // Display them as quality indicators
  const buckets = [
    { label: '1st Time', sub: 'Batters 1–9', val: tto1 ?? null, pa: pa1 ?? null, ordinal: 1 },
    { label: '2nd Time', sub: 'Batters 10–18', val: tto2 ?? null, pa: pa2 ?? null, ordinal: 2 },
    { label: '3rd Time', sub: 'Batters 19+', val: tto3 ?? null, pa: pa3 ?? null, ordinal: 3 },
  ]

  // Absolute quality label based on xwOBA alone — NEVER a trend word here.
  // "Below Average" replaces the old "Weakening" so this badge can't imply
  // direction; direction is the readLine's job, computed from all 3 buckets.
  function qualityLabel(v: number | null): { label: string; color: string; bg: string } {
    if (v == null) return { label: '–', color: '#78716C', bg: '#F9F7F3' }
    if (v <= 0.270) return { label: 'Dominant', color: '#15803D', bg: 'rgba(21,128,61,0.08)' }
    if (v <= 0.300) return { label: 'Strong', color: '#2563EB', bg: 'rgba(37,99,235,0.08)' }
    if (v <= 0.330) return { label: 'Average', color: '#78716C', bg: '#F9F7F3' }
    if (v <= 0.360) return { label: 'Below Average', color: '#D97706', bg: 'rgba(217,119,6,0.08)' }
    return { label: 'Pull Zone', color: '#DC2626', bg: 'rgba(220,38,38,0.08)' }
  }

  // Read line — the ONLY place a trend claim is made, and only when the
  // comparison across buckets actually supports it.
  const degrading = tto1 != null && tto3 != null && tto3 > tto1 + 0.040
  const improving = tto1 != null && tto3 != null && tto3 < tto1 - 0.040
  const sharp1st = tto1 != null && tto1 <= 0.290

  const readLine = degrading && sharp1st
    ? `Sharp first time through (.${Math.round((tto1 ?? 0) * 1000)} xwOBA) but falls off significantly the third time around (.${Math.round((tto3 ?? 0) * 1000)}). Watch the lineup clock.`
    : degrading
      ? `Quality drops noticeably the third time through the order. Managers should track the lineup clock.`
      : improving
        ? `Settles in as the game goes on — actually tougher the third time through than the first.`
        : tto3 != null && tto3 <= 0.310
          ? `Maintains quality deep into games — effective through all three trips through the lineup.`
          : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {readLine && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-lg border-l-[3px] border-yellow-400"
          style={{ background: 'rgba(253,224,71,0.08)' }}>
          <p className="font-serif italic text-stone-700 text-sm leading-relaxed">{readLine}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-px bg-stone-100 mx-4 my-4 rounded-xl overflow-hidden">
        {buckets.map(b => {
          const q = qualityLabel(b.val)
          return (
            <div key={b.ordinal} className="bg-white px-4 py-5 text-center"
              style={{ background: q.bg }}>
              <div className="font-bold leading-none mb-1"
                style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '36px', color: q.color }}>
                {b.val != null ? b.val.toFixed(3) : '–'}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-1">xwOBA</div>
              <div className="font-serif text-xs font-semibold text-stone-700 mt-2">{b.label}</div>
              <div className="font-mono text-[9px] text-stone-400 mt-0.5">{b.sub}</div>
              {b.pa != null && (
                <div className="font-mono text-[9px] text-stone-300 mt-1">{b.pa} PA</div>
              )}
              <div className="mt-2">
                <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded"
                  style={{ background: q.bg, color: q.color, border: `1px solid ${q.color}20` }}>
                  {q.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── First-Pitch Tendencies ────────────────────────────────────────────────────

function FirstPitch({ stats }: { stats: PitcherStats | null }) {
  const strikeRate = stats?.first_pitch_strike_pct
  const mix = stats?.first_pitch_mix

  if (strikeRate == null && (!mix || Object.keys(mix).length === 0)) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-6 text-center text-stone-400 font-serif italic text-sm">
        First-pitch data not yet available — runs weekly
      </div>
    )
  }

  const mixEntries = mix
    ? Object.entries(mix).sort((a, b) => b[1].pct - a[1].pct)
    : []

  const topPitch = mixEntries[0]
  const isAggressive = (strikeRate ?? 0) >= 65
  const isPitcher = (strikeRate ?? 0) >= 60

  const readLine = strikeRate != null
    ? `${strikeRate}% first-pitch strike rate — ${isAggressive ? 'attacks early, gets ahead in counts' : isPitcher ? 'above-average at setting up at-bats' : 'hitters can take and look for pitches to drive'}.${topPitch ? ` Leads with the ${topPitch[1].name} ${topPitch[1].pct}% of the time.` : ''}`
    : null

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {readLine && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-lg border-l-[3px] border-yellow-400"
          style={{ background: 'rgba(253,224,71,0.08)' }}>
          <p className="font-serif italic text-stone-700 text-sm leading-relaxed">{readLine}</p>
        </div>
      )}

      <div className="p-4 flex gap-6 items-start">
        {/* Big strike rate number */}
        {strikeRate != null && (
          <div className="text-center shrink-0">
            <div className="font-bold leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '52px',
                color: isAggressive ? '#15803D' : isPitcher ? '#2563EB' : '#D97706' }}>
              {strikeRate.toFixed(0)}<span style={{ fontSize: '24px' }}>%</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mt-1">
              1st-Pitch Strike
            </div>
            <div className="font-mono text-[9px] font-bold mt-1 uppercase"
              style={{ color: isAggressive ? '#15803D' : isPitcher ? '#2563EB' : '#D97706' }}>
              {isAggressive ? 'Elite' : isPitcher ? 'Above Avg' : 'Below Avg'}
            </div>
          </div>
        )}

        {/* Pitch mix breakdown */}
        {mixEntries.length > 0 && (
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400 mb-3 font-bold">
              First-Pitch Mix
            </div>
            <div className="space-y-2">
              {mixEntries.slice(0, 5).map(([pt, v]) => {
                const color = pitchColor(pt)
                return (
                  <div key={pt} className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="font-serif text-sm text-stone-700 w-24 shrink-0">{v.name}</span>
                    <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v.pct / 55) * 100}%`, background: color }} />
                    </div>
                    <span className="font-mono text-xs font-bold text-stone-700 w-10 text-right">{v.pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Per-pitcher block ─────────────────────────────────────────────────────────
//
// Each sub-section is now collapsible (open by default for the primary
// Arsenal table; collapsed by default for the deeper sections) so a Pro user
// who just wants tonight's edge can read the headline + Arsenal and stop,
// while a user who wants the full scouting report can expand the rest.

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="text-[10px] font-mono uppercase tracking-widest text-orange-600 font-bold mb-3 cursor-pointer list-none flex items-center gap-2">
        <span className="inline-block transition-transform group-open:rotate-90 text-stone-400">›</span>
        ⊕ {title}
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  )
}

function PitcherBlock({
  pitcherName,
  pitcherId,
  pitchMix,
  stats,
  abbr,
  label,
}: {
  pitcherName: string
  pitcherId: number | null
  pitchMix: PitchEntry[]
  stats: PitcherStats | null
  abbr: string
  label: string
}) {
  return (
    <div className="space-y-6">
      {/* Pitcher header */}
      <div className="flex items-center gap-3 pb-4 border-b border-stone-200">
        {pitcherId && (
          <img
            src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${pitcherId}/headshot/67/current`}
            alt=""
            className="w-14 h-14 rounded-full object-cover border-2 border-stone-200 shrink-0"
          />
        )}
        <div>
          <div className="font-serif font-semibold text-stone-900 text-lg leading-tight">{pitcherName}</div>
          <div className="font-mono text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">
            {abbr} · {label}
            {stats?.era != null && ` · ${stats.era.toFixed(2)} ERA`}
            {stats?.fip != null && ` · ${stats.fip.toFixed(2)} FIP`}
          </div>
        </div>
      </div>

      {/* Arsenal — open by default, this is the primary scouting fact */}
      <CollapsibleSection title="Arsenal Breakdown" defaultOpen>
        <ArsenalTable pitchMix={pitchMix} pitcherName={pitcherName} />
      </CollapsibleSection>

      {/* Two-strike — collapsed by default */}
      <CollapsibleSection title="Two-Strike Profile — What He Goes To With Two Strikes">
        <TwoStrikeProfile stats={stats} pitchMix={pitchMix} />
      </CollapsibleSection>

      {/* TTO — collapsed by default */}
      <CollapsibleSection title="Times Through the Order — When to Get Him">
        <TimesThrough stats={stats} />
      </CollapsibleSection>

      {/* First pitch — collapsed by default */}
      <CollapsibleSection title="First-Pitch Tendencies">
        <FirstPitch stats={stats} />
      </CollapsibleSection>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PitchingLabContent({
  awayPitcherName,
  homePitcherName,
  awayPitcherId,
  homePitcherId,
  awayPitchMix,
  homePitchMix,
  awayPitcherStats,
  homePitcherStats,
  awayAbbr,
  homeAbbr,
  hotZoneSlot,
}: PitchingLabContentProps) {
  const hasAway = awayPitcherName && awayPitchMix.length > 0
  const hasHome = homePitcherName && homePitchMix.length > 0

  if (!hasAway && !hasHome) {
    return (
      <div className="py-16 text-center text-stone-400 font-serif italic">
        Probable pitchers not yet announced
      </div>
    )
  }

  const headline = buildHeadlineRead({
    awayPitcherName, homePitcherName, awayPitchMix, homePitchMix,
    awayPitcherStats, homePitcherStats, awayAbbr, homeAbbr,
  })

  return (
    <div className="space-y-10">

      {/* Headline read — frames the whole tab before any tables */}
      {headline && (
        <div className="px-5 py-4 rounded-xl border-l-[3px] border-orange-500 bg-orange-500/[0.04]">
          <p className="font-serif italic text-stone-900 text-base md:text-lg leading-relaxed">
            {headline}
          </p>
        </div>
      )}

      <div className="space-y-16">
        {/* Away pitcher */}
        {hasAway && (
          <section>
            <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-6">
              § {awayPitcherName} — {awayAbbr} Starter
            </h3>
            <PitcherBlock
              pitcherName={awayPitcherName!}
              pitcherId={awayPitcherId}
              pitchMix={awayPitchMix}
              stats={awayPitcherStats}
              abbr={awayAbbr}
              label="Away Starter"
            />
          </section>
        )}

        {/* Divider between pitchers */}
        {hasAway && hasHome && (
          <div className="border-t-2 border-stone-200" />
        )}

        {/* Home pitcher */}
        {hasHome && (
          <section>
            <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-6">
              § {homePitcherName} — {homeAbbr} Starter
            </h3>
            <PitcherBlock
              pitcherName={homePitcherName!}
              pitcherId={homePitcherId}
              pitchMix={homePitchMix}
              stats={homePitcherStats}
              abbr={homeAbbr}
              label="Home Starter"
            />
          </section>
        )}

        {/* Hot Zones — passed through from page.tsx */}
        {hotZoneSlot && (
          <section>
            <h3 className="text-xs font-mono uppercase tracking-widest text-orange-600 font-bold mb-4">
              § Hot Zones
            </h3>
            {hotZoneSlot}
          </section>
        )}
      </div>

    </div>
  )
}