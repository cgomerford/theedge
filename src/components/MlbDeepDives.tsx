'use client'

// src/components/MlbDeepDives.tsx
//
// Real Statcast-backed replacement for DeepDiveCharts' old illustrative
// MLB panels. All data is fetched server-side in page.tsx (see
// src/lib/abs-challenges.ts, extra-bases.ts, pitcher-statcast-profile.ts,
// batter-bat-speed.ts — every field is a curl-verified real Savant
// column, nothing hardcoded) and handed down as props here. This file is
// pure presentation — no fetching, no client state.
//
// Color: run-value heat uses the diverging blue<->red pair (dataviz
// skill's validated default — blue = good for the pitcher, i.e. negative
// delta_run_exp; red = good for the hitter) with a neutral-gray midpoint.
// The two-bar charts (extra bases, miss-distance windows) use categorical
// identity color: blue for the first series, the site's brand orange for
// the second — validated together via scripts/validate_palette.js
// (light mode, all checks pass).

import type { ABSChallengeRecord } from '@/lib/abs-challenges'
import type { ExtraBasesRow } from '@/lib/extra-bases'
import type { PitcherStatcastProfile, PitchCountRunValue, MissWindow, ArsenalPitch } from '@/lib/pitcher-statcast-profile'
import { MIN_COUNT_SAMPLE } from '@/lib/pitcher-statcast-profile'
import type { BatterBatSpeedProfile } from '@/lib/batter-bat-speed'
import type { PitcherSeasonStats } from '@/lib/mlb'
import type { BatterSeasonStats } from '@/lib/batter-stats'
import { MIN_PLAYER_SAMPLE, type InningBreakdownRow, type DailyTeamTrendRow, type PlayerChallengeRow } from '@/lib/abs-challenge-log'
import { MLB_TEAMS as TEAM_DIRECTORY } from '@/lib/teams'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { InfoButton } from '@/components/InfoButton'
import { HelpLink } from '@/components/HelpLink'
import BatSpeedRadarSection, { BatSpeedScatter } from '@/components/BatSpeedRadarSection'
import { MLB_TEAMS, teamLogoUrl, headshotUrl as playerHeadshotUrl } from '@/lib/mlb-assets'

// Homepage sections are wrapped in a scroll-reveal animation that sets
// will-change: transform on an ancestor — which, per the CSS spec, turns
// that ancestor into the containing block for any `position: fixed`
// descendant (the same effect a `transform` would have). Without a
// portal, every "Expand" modal in this file would render clipped to that
// ancestor's box instead of the viewport, so its backdrop wouldn't cover
// the page and its centering would drift with scroll position. Portaling
// to document.body sidesteps the containing block entirely — same fix
// SiteHeader's MobileDrawer already uses for the same reason.
function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

const BLUE = '#2a78d6'
const RED = '#e34948'
const NEUTRAL = '#f0efec'
const ORANGE = '#FF5722'
const AQUA = '#1baf7a'

const TEAM_ID_BY_ABBR: Record<string, number> = Object.fromEntries(
  Object.entries(MLB_TEAMS).map(([id, t]) => [t.abbr, Number(id)])
)
function teamLogo(abbr: string): string | null {
  const id = TEAM_ID_BY_ABBR[abbr]
  return id ? teamLogoUrl(id) : null
}

export type PitcherOption = {
  id: number
  name: string
  teamAbbr: string
  opponentAbbr: string | null // null when this pitcher isn't tonight's featured starter — the selector's other entries come from the ERA leaderboard, which doesn't carry a "next opponent" without an extra schedule lookup
  seasonStats: PitcherSeasonStats | null
  profile: PitcherStatcastProfile
}

export type BatterMissOption = {
  id: number
  name: string
  teamAbbr: string
  seasonStats: BatterSeasonStats | null
  profile: BatterBatSpeedProfile
}

export type BatSpeedPlayerOption = {
  id: number
  name: string
  teamAbbr: string
  seasonStats: BatterSeasonStats | null
  profile: BatterBatSpeedProfile
  source: 'random' | 'hrLeader' // which pool this player came from — 'hrLeader' was selected FOR high power, so any bat-speed-vs-power correlation must exclude that half or it's circular
}

export type MlbDeepDivesData = {
  absLedger: ABSChallengeRecord[]
  absInningBreakdown: InningBreakdownRow[]
  absDailyTrendByTeam: DailyTeamTrendRow[]
  absPlayerEfficiency: PlayerChallengeRow[]
  extraBases: ExtraBasesRow[]
  featuredPitcher: { name: string; teamAbbr: string; opponentAbbr: string; profile: PitcherStatcastProfile } | null
  pitcherOptions: PitcherOption[] // selector pool for the pitch run-value card — featured starter + ERA leaders, deduped
  missDistanceBatters: BatterMissOption[] // selector pool for the miss-distance card — 10 batters randomly sampled each render from the top-30 HR pool
  batSpeedPlayers: BatSpeedPlayerOption[] // pool for the bat-speed radar/scatter — miss-distance's 10 random batters + the 5 HR leaders, deduped
}

const PITCH_NAMES: Record<string, string> = {
  FF: 'Four-seam', SI: 'Sinker', SL: 'Slider', ST: 'Sweeper', CH: 'Changeup',
  CU: 'Curveball', FC: 'Cutter', FS: 'Splitter', KC: 'Knuckle curve', KN: 'Knuckleball',
  SV: 'Slurve', FO: 'Forkball', SC: 'Screwball', EP: 'Eephus',
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  const r = Math.round(lerp(r1, r2, t)), g = Math.round(lerp(g1, g2, t)), b = Math.round(lerp(b1, b2, t))
  return `rgb(${r},${g},${b})`
}

// delta_run_exp sign convention: negative = good for the pitcher (blue),
// positive = good for the hitter (red). Clamp at +-0.12 — beyond that is
// rare small-sample noise, not a meaningfully "more extreme" color.
function runValueColor(v: number): string {
  const CLAMP = 0.12
  const t = Math.max(-1, Math.min(1, v / CLAMP))
  return t <= 0 ? mixHex(NEUTRAL, BLUE, -t) : mixHex(NEUTRAL, RED, t)
}

// All 12 ball-strike counts, in the standard "count ladder" reading order
// (each column is one more pitch into the at-bat than the last) — every
// count a batter can actually be in, not a curated subset. This is what
// makes the grid's own Total column reconcile with a pitcher's real
// season numbers (see heatCellStyle/pitchMetricTotal below): nothing is
// hidden anymore, so Total is just "every column added up."
const COUNT_COLUMNS: [number, number][] = [
  [0, 0],
  [1, 0], [0, 1],
  [2, 0], [1, 1], [0, 2],
  [3, 0], [2, 1], [1, 2],
  [3, 1], [2, 2],
  [3, 2],
]

// Sequential single-hue scale (neutral -> red) for stats where higher is
// simply worse for the pitcher (hard-hit rate, runs allowed, hits
// allowed) — unlike run value there's no "good for the pitcher" pole to
// diverge toward, so this follows the dataviz skill's sequential-magnitude
// rule (one hue, light to dark) instead of reusing the diverging pair.
function sequentialRedColor(t: number): string {
  return mixHex(NEUTRAL, RED, Math.max(0, Math.min(1, t)))
}


// ── ABS challenge deep dive — 2x2 sub-grid ──────────────────────────────
//
// Box A and D run off the season-aggregate team ledger — precomputed by
// scripts/fetch_abs_challenge_leaderboard.py into abs_challenge_team_leaderboard,
// see abs-challenges.ts. Box B and C run off the per-pitch abs_challenge_log
// table (real MLB live-feed data — see abs-challenge-log.ts /
// scripts/fetch_abs_challenge_log.py). All four render an honest empty/
// "backfilling" state rather than fabricating a chart when their table is
// still empty.

function StackedChallengeSidesBox({ ledger }: { ledger: ABSChallengeRecord[] }) {
  // All 30 teams, not a top-N cut — the box scrolls internally so the
  // 2x2 grid's row height stays fixed while every team stays reachable.
  const all = [...ledger].filter(r => r.total_challenges > 0).sort((a, b) => b.total_challenges - a.total_challenges)
  const maxTotal = Math.max(1, ...all.map(r => r.total_challenges))

  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col items-center justify-center text-center">
        <div className="text-[11.5px] font-bold text-[#1A1A1A] self-start mb-1">Who&apos;s challenging</div>
        <div className="text-[10px] text-[#8A8577] flex-1 flex items-center">Team leaderboard temporarily unavailable — check back shortly.</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[11.5px] font-bold text-[#1A1A1A]">Who&apos;s challenging</div>
          <InfoButton title="Who's challenging" align="left">
            Which side calls for the ABS review — the catcher/pitcher on defense, or the batter himself. Useful for
            spotting which teams trust their catcher&apos;s eye vs. lean on hitters to call their own borderline pitches.
          </InfoButton>
        </div>
        <div className="flex items-center gap-2 text-[8.5px] text-[#8A8577]">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BLUE }} />Pitcher/catcher</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: ORANGE }} />Batter</span>
        </div>
      </div>
      <div className="text-[9px] text-[#8A8577] mb-2">All 30 teams, by side — season, scroll for more</div>
      <div className="flex-1 space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
        {all.map(row => {
          const logo = teamLogo(row.team_abbr)
          return (
            <div key={row.team_abbr} className="flex items-center gap-1.5" title={`${row.team_abbr}: ${row.pitching_challenges} pitcher/catcher, ${row.batting_challenges} batter`}>
              {logo ? (
                <img src={logo} alt="" className="w-4 h-4 object-contain shrink-0" />
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <span className="w-7 text-[10px] font-bold text-[#1A1A1A] shrink-0">{row.team_abbr}</span>
              <div className="flex-1 h-3 rounded-full bg-[#F0EFEC] overflow-hidden flex">
                <div className="h-full" style={{ width: `${(row.pitching_challenges / maxTotal) * 100}%`, background: BLUE }} />
                <div className="w-[2px] shrink-0" />
                <div className="h-full" style={{ width: `${(row.batting_challenges / maxTotal) * 100}%`, background: ORANGE }} />
              </div>
              <span className="w-7 text-right text-[9px] text-[#8A8577] shrink-0 tabular-nums">{row.total_challenges}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InningBreakdownBox({ rows, isBackfilling }: { rows: InningBreakdownRow[]; isBackfilling: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col items-center justify-center text-center">
        <div className="text-[11.5px] font-bold text-[#1A1A1A] self-start mb-1">Challenges by inning</div>
        <div className="text-[10px] text-[#8A8577] flex-1 flex items-center">Backfilling per-pitch data — check back once the season log finishes indexing.</div>
      </div>
    )
  }

  const BAR_H = 64
  const AXIS_W = 22
  const max = Math.max(...rows.map(r => r.challenges))
  const peak = rows.reduce((a, b) => (b.challenges > a.challenges ? b : a))

  // A single CSS grid (axis column + one column per inning, shared across
  // all three rows) guarantees the axis and the bars line up exactly — no
  // separate border/padding math to keep in sync between rows, which is
  // what caused the previous version's "0" to land mid-chart instead of
  // at the actual baseline.
  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col">
      <div className="flex items-center gap-1.5">
        <div className="text-[11.5px] font-bold text-[#1A1A1A]">Challenges by inning</div>
        <InfoButton title="Challenges by inning" align="left">
          When in the game teams actually use their challenges. Each team gets a limited number per game, so a late-inning
          spike usually means teams are saving them for high-leverage spots rather than burning one in the 1st.
        </InfoButton>
      </div>
      <div className="text-[9px] text-[#8A8577] mb-2">Most common: inning {peak.label}{isBackfilling ? ' · backfilling' : ''}</div>

      <div
        className="flex-1 grid items-center gap-x-1 gap-y-0.5 justify-items-center"
        style={{ gridTemplateColumns: `${AXIS_W}px repeat(${rows.length}, minmax(0,1fr))` }}
      >
        <div />
        {rows.map(r => (
          <span key={r.inning} className="text-[8px] font-bold text-[#1A1A1A] tabular-nums">{r.challenges}</span>
        ))}

        <div style={{ height: BAR_H }} className="w-full flex flex-col justify-between text-right text-[7.5px] text-[#8A8577] tabular-nums pr-1 border-r border-[#DEDACE]">
          <span>{max}</span>
          <span>0</span>
        </div>
        {rows.map(r => (
          <div key={r.inning} style={{ height: BAR_H }} className="w-full flex items-end justify-center" title={`Inning ${r.label}: ${r.challenges} challenges`}>
            <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max((r.challenges / max) * BAR_H, 3)}px`, background: r.inning === peak.inning ? ORANGE : '#DEDACE' }} />
          </div>
        ))}

        <div />
        {rows.map(r => (
          <span key={r.inning} className="text-[8.5px] text-[#8A8577]">{r.label}</span>
        ))}
      </div>
    </div>
  )
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// 'YYYY-MM-DD' -> 'Mar 25'
function dateShort(date: string): string {
  const [, m, d] = date.split('-')
  const month = MONTH_ABBR[Number(m) - 1]
  return month ? `${month} ${Number(d)}` : date
}

const TREND_SERIES: [keyof DailyInningTrendRow, string, string][] = [['early', BLUE, 'Inn 1-3'], ['mid', AQUA, 'Inn 4-6'], ['late', ORANGE, 'Inn 7-9+']]

type DailyInningTrendRow = { date: string; early: number; mid: number; late: number }
type TrendFilter = { scope: 'league' } | { scope: 'division'; league: 'AL' | 'NL'; division: 'East' | 'Central' | 'West' } | { scope: 'team'; teamAbbr: string }
type TrendMetric = 'volume' | 'rate'
type TrendGranularity = 'day' | 'week' | 'month'

// Buckets a real calendar date down to the key its granularity groups by —
// the Monday of its week for 'week', the 1st of its month for 'month' —
// so every granularity still produces a valid 'YYYY-MM-DD' row date that
// dateShort()/sorting/month-tick logic all keep working on unchanged.
function bucketDate(date: string, granularity: TrendGranularity): string {
  if (granularity === 'day') return date
  if (granularity === 'month') return `${date.slice(0, 7)}-01`
  const d = new Date(`${date}T00:00:00Z`)
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow)) // back up to Monday
  return d.toISOString().slice(0, 10)
}

// 'volume' = raw challenge counts (what the compact card always shows).
// 'rate' = overturn rate within each inning group — the cut Savant's own
// public dashboard leads with, but only as three anonymous Overall/
// Batters/Fielders lines. This is the same computation, once you have
// is_overturned per row (which getAbsDailyTrendByTeam already carries).
function aggregateTrend(byTeam: DailyTeamTrendRow[], filter: TrendFilter, metric: TrendMetric, granularity: TrendGranularity): DailyInningTrendRow[] {
  const matches = (teamAbbr: string): boolean => {
    if (filter.scope === 'league') return true
    if (filter.scope === 'team') return teamAbbr === filter.teamAbbr
    const team = TEAM_DIRECTORY.find(t => t.abbrev === teamAbbr)
    return team?.league === filter.league && team?.division === filter.division
  }

  const byDate = new Map<string, { early: number; mid: number; late: number; earlyOverturns: number; midOverturns: number; lateOverturns: number }>()
  for (const r of byTeam) {
    if (!matches(r.teamAbbr)) continue
    const key = bucketDate(r.date, granularity)
    const bucket = byDate.get(key) ?? { early: 0, mid: 0, late: 0, earlyOverturns: 0, midOverturns: 0, lateOverturns: 0 }
    bucket.early += r.early
    bucket.mid += r.mid
    bucket.late += r.late
    bucket.earlyOverturns += r.earlyOverturns
    bucket.midOverturns += r.midOverturns
    bucket.lateOverturns += r.lateOverturns
    byDate.set(key, bucket)
  }

  const rate = (overturns: number, total: number) => (total > 0 ? overturns / total : 0)

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, c]) => ({
      date,
      early: metric === 'rate' ? rate(c.earlyOverturns, c.early) : c.early,
      mid: metric === 'rate' ? rate(c.midOverturns, c.mid) : c.mid,
      late: metric === 'rate' ? rate(c.lateOverturns, c.late) : c.late,
    }))
}

type MonthComparison = {
  currentLabel: string; previousLabel: string
  isRate: boolean
  currentDisplay: string; previousDisplay: string
  change: number | null // volume: relative % change. rate: percentage-POINT change (not relative % of a %, which reads as noise on a rate).
}

// Raw (challenges, overturns) per real calendar month — kept as both
// numbers, unlike aggregateTrend's early/mid/late split, so this one
// function can answer either "volume up/down N%" or "success rate up/down
// N points" depending on which metric the chart is currently showing.
function monthlyOverallTotals(byTeam: DailyTeamTrendRow[], filter: TrendFilter): { month: string; challenges: number; overturns: number }[] {
  const matches = (teamAbbr: string): boolean => {
    if (filter.scope === 'league') return true
    if (filter.scope === 'team') return teamAbbr === filter.teamAbbr
    const team = TEAM_DIRECTORY.find(t => t.abbrev === teamAbbr)
    return team?.league === filter.league && team?.division === filter.division
  }

  const byMonth = new Map<string, { challenges: number; overturns: number }>()
  for (const r of byTeam) {
    if (!matches(r.teamAbbr)) continue
    const month = r.date.slice(0, 7)
    const bucket = byMonth.get(month) ?? { challenges: 0, overturns: 0 }
    bucket.challenges += r.early + r.mid + r.late
    bucket.overturns += r.earlyOverturns + r.midOverturns + r.lateOverturns
    byMonth.set(month, bucket)
  }
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, c]) => ({ month, ...c }))
}

// Month-over-month change, tracking whichever metric the chart is showing:
// challenge VOLUME (relative % change — "activity up/down N%") or OVERTURN
// RATE (percentage-point change — "success rate up/down N points"; a
// relative % of a rate reads as noise, e.g. 50%->55% isn't a useful "10%
// increase"). If the most recent month in the data is the real calendar
// month we're currently in, it's necessarily partial (we're mid-month), so
// the comparison shifts back one month — last FULL month vs the one
// before it — rather than comparing a half-finished month to a complete one.
function monthOverMonthChange(byTeam: DailyTeamTrendRow[], filter: TrendFilter, metric: TrendMetric): MonthComparison | null {
  const totals = monthlyOverallTotals(byTeam, filter)
  if (totals.length === 0) return null

  const now = new Date()
  const currentRealMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  let endIdx = totals.length - 1
  if (totals[endIdx].month === currentRealMonth) endIdx -= 1 // latest month is still in progress — step back
  if (endIdx < 1) return null // need at least two full months to compare

  const current = totals[endIdx]
  const previous = totals[endIdx - 1]

  if (metric === 'rate') {
    const currentRate = current.challenges > 0 ? current.overturns / current.challenges : null
    const previousRate = previous.challenges > 0 ? previous.overturns / previous.challenges : null
    const change = currentRate !== null && previousRate !== null ? Math.round((currentRate - previousRate) * 1000) / 10 : null
    return {
      currentLabel: monthShortName(current.month),
      previousLabel: monthShortName(previous.month),
      isRate: true,
      currentDisplay: currentRate !== null ? RATE_FMT(currentRate) : '—',
      previousDisplay: previousRate !== null ? RATE_FMT(previousRate) : '—',
      change,
    }
  }

  const change = previous.challenges > 0 ? Math.round(((current.challenges - previous.challenges) / previous.challenges) * 1000) / 10 : null
  return {
    currentLabel: monthShortName(current.month),
    previousLabel: monthShortName(previous.month),
    isRate: false,
    currentDisplay: String(current.challenges),
    previousDisplay: String(previous.challenges),
    change,
  }
}
function monthShortName(month: string): string {
  return MONTH_ABBR[Number(month.slice(5, 7)) - 1] ?? month
}

// Shared SVG renderer — same chart at card size (compact card, first/last
// date labels only) or modal size (expanded, one label per month boundary
// — labeling all ~170 days would be unreadable, so ticks land on the
// first day of each calendar month instead of every data point; the LINE
// still plots every single day, which is the actual "day by day" ask).
// Decollide a column of same-x label candidates by nudging apart any that
// are closer than minGap — shared by both the end-of-line labels and the
// per-point labels (week/month views), so converging/crossing lines never
// stack their numbers on top of each other.
function decollideLabels<T extends { naturalY: number }>(entries: T[], minGap: number): T[] {
  const sorted = [...entries].sort((a, b) => a.naturalY - b.naturalY)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].naturalY - sorted[i - 1].naturalY < minGap) {
      sorted[i] = { ...sorted[i], naturalY: sorted[i - 1].naturalY + minGap }
    }
  }
  return sorted
}

// Plain straight-line segments through every point — deliberately not
// smoothed. A spline was tried and reverted: it visually implied values
// between two real data points, which these lines don't have.
function straightPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ')
}

function TrendChartSvg({ rows, width, height, monthTicks, showAllPointLabels, formatValue }: { rows: DailyInningTrendRow[]; width: number; height: number; monthTicks?: boolean; showAllPointLabels?: boolean; formatValue?: (v: number) => string }) {
  const fmt = formatValue ?? ((v: number) => String(v))
  const PAD_L = 16, PAD_R = 22, PAD_T = showAllPointLabels ? 22 : 10, PAD_B = 14
  const maxV = Math.max(0.0001, ...rows.flatMap(r => [r.early, r.mid, r.late]))
  const sx = (i: number) => PAD_L + (i / Math.max(rows.length - 1, 1)) * (width - PAD_L - PAD_R)
  const sy = (v: number) => height - PAD_B - (v / maxV) * (height - PAD_T - PAD_B)
  const dotR = rows.length > 40 ? 1.4 : 2.5 // dense daily view needs much smaller marks than a sparse week/month view
  const baselineY = sy(0)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {/* y-axis: baseline + max/0 tick amounts */}
      <line x1={PAD_L} y1={baselineY} x2={width - PAD_R} y2={baselineY} stroke="rgba(26,26,26,0.15)" strokeWidth="1" />
      <text x={PAD_L - 3} y={baselineY + 3} fontSize="7" textAnchor="end" fill="rgba(26,26,26,0.4)">{fmt(0)}</text>
      <text x={PAD_L - 3} y={sy(maxV) + 3} fontSize="7" textAnchor="end" fill="rgba(26,26,26,0.4)">{fmt(maxV)}</text>

      {TREND_SERIES.map(([key, color]) => {
        const pts: [number, number][] = rows.map((r, i) => [sx(i), sy(r[key] as number)])
        const linePath = straightPath(pts)
        const areaPath = pts.length > 1
          ? `${linePath} L ${pts[pts.length - 1][0]},${baselineY} L ${pts[0][0]},${baselineY} Z`
          : ''
        return (
          <g key={key}>
            {areaPath && <path d={areaPath} fill={color} opacity={0.08} />}
            <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
            {rows.map((r, i) => (
              <circle key={i} cx={sx(i)} cy={sy(r[key] as number)} r={dotR} fill={color} stroke="#fff" strokeWidth="0.75">
                <title>{`${r.date}: ${fmt(r[key] as number)} (${key})`}</title>
              </circle>
            ))}
          </g>
        )
      })}

      {/* Per-point value labels — only for week/month (sparse enough to
          label every point without flooding the chart); each x-column is
          decollided independently so three crossing lines stay readable. */}
      {showAllPointLabels && rows.map((r, i) => {
        const labels = decollideLabels(
          TREND_SERIES.map(([key, color]) => ({ key, color, naturalY: sy(r[key] as number), value: r[key] as number })),
          7
        )
        return (
          <g key={r.date}>
            {labels.map(l => (
              <text key={l.key} x={sx(i)} y={l.naturalY - 4} fontSize="6.5" fontWeight="700" textAnchor="middle" fill={l.color}>
                {fmt(l.value)}
              </text>
            ))}
          </g>
        )
      })}

      {/* End-value labels — decollided so converging lines stay readable
          instead of stacking their numbers on top of each other. Skipped
          when per-point labels are already on (the last point already has
          one), so the end of the line doesn't get a duplicate number. */}
      {!showAllPointLabels && rows.length > 0 && (() => {
        const last = rows[rows.length - 1]
        const labels = decollideLabels(
          TREND_SERIES.map(([key, color]) => ({ key, color, naturalY: sy(last[key] as number), value: last[key] as number })),
          8
        )
        return labels.map(l => (
          <text key={l.key} x={sx(rows.length - 1) + 4} y={l.naturalY + 2.5} fontSize="7.5" fontWeight="700" fill={l.color}>
            {fmt(l.value)}
          </text>
        ))
      })()}

      {rows.map((r, i) => {
        if (monthTicks) {
          const isMonthStart = i === 0 || r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7)
          if (!isMonthStart) return null
          return (
            <g key={r.date}>
              <line x1={sx(i)} y1={PAD_T} x2={sx(i)} y2={baselineY} stroke="rgba(26,26,26,0.06)" strokeWidth="1" />
              <text x={sx(i)} y={height - 2} fontSize="7.5" textAnchor="start" fill="rgba(26,26,26,0.5)">{dateShort(r.date)}</text>
            </g>
          )
        }
        return i === 0 || i === rows.length - 1 ? (
          <text key={r.date} x={sx(i)} y={height - 2} fontSize="7.5" textAnchor={i === 0 ? 'start' : 'end'} fill="rgba(26,26,26,0.4)">
            {dateShort(r.date)}
          </text>
        ) : null
      })}
    </svg>
  )
}

function TrendLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[8px] text-[#8A8577]">
      {TREND_SERIES.map(([key, color, label]) => (
        <span key={key} className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />{label}</span>
      ))}
    </div>
  )
}

const DIVISIONS: { league: 'AL' | 'NL'; division: 'East' | 'Central' | 'West' }[] = [
  { league: 'AL', division: 'East' }, { league: 'AL', division: 'Central' }, { league: 'AL', division: 'West' },
  { league: 'NL', division: 'East' }, { league: 'NL', division: 'Central' }, { league: 'NL', division: 'West' },
]

function TrendFilterControls({ filter, onChange }: { filter: TrendFilter; onChange: (f: TrendFilter) => void }) {
  const selectValue = filter.scope === 'league' ? 'league' : filter.scope === 'division' ? `division:${filter.league} ${filter.division}` : `team:${filter.teamAbbr}`

  return (
    <select
      value={selectValue}
      onChange={e => {
        const v = e.target.value
        if (v === 'league') onChange({ scope: 'league' })
        else if (v.startsWith('division:')) {
          const [league, division] = v.slice('division:'.length).split(' ') as ['AL' | 'NL', 'East' | 'Central' | 'West']
          onChange({ scope: 'division', league, division })
        } else if (v.startsWith('team:')) {
          onChange({ scope: 'team', teamAbbr: v.slice('team:'.length) })
        }
      }}
      className="text-[11px] border border-[#DEDACE] rounded-md px-2 py-1 text-[#1A1A1A] bg-white"
    >
      <option value="league">All of MLB</option>
      {(['AL', 'NL'] as const).map(league => (
        <optgroup key={league} label={`${league === 'AL' ? 'American' : 'National'} League`}>
          {DIVISIONS.filter(d => d.league === league).map(d => (
            <option key={`${d.league} ${d.division}`} value={`division:${d.league} ${d.division}`}>{d.league} {d.division}</option>
          ))}
          {TEAM_DIRECTORY.filter(t => t.league === league).sort((a, b) => a.short.localeCompare(b.short)).map(t => (
            <option key={t.abbrev} value={`team:${t.abbrev}`}>{t.short}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

const RATE_FMT = (v: number) => `${Math.round(v * 100)}%`

const GRANULARITY_LABEL: Record<TrendGranularity, string> = { day: 'Day', week: 'Week', month: 'Month' }

function DailyTrendBox({ byTeam, isBackfilling }: { byTeam: DailyTeamTrendRow[]; isBackfilling: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState<TrendFilter>({ scope: 'league' })
  const [metric, setMetric] = useState<TrendMetric>('volume')
  const [granularity, setGranularity] = useState<TrendGranularity>('day')

  const leagueRows = useMemo(() => aggregateTrend(byTeam, { scope: 'league' }, 'volume', 'day'), [byTeam])
  const filteredRows = useMemo(() => aggregateTrend(byTeam, filter, metric, granularity), [byTeam, filter, metric, granularity])
  const momChange = useMemo(() => monthOverMonthChange(byTeam, filter, metric), [byTeam, filter, metric])

  if (leagueRows.length < 2) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col items-center justify-center text-center">
        <div className="text-[11.5px] font-bold text-[#1A1A1A] self-start mb-1">Trend by day</div>
        <div className="text-[10px] text-[#8A8577] flex-1 flex items-center">Backfilling per-pitch data — a daily trend needs at least two days on record.</div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[11.5px] font-bold text-[#1A1A1A]">Trend by day</div>
            <InfoButton title="Trend by day" align="left">
              Challenge volume over time, split by early/mid/late innings. Useful for spotting whether teams are
              challenging more as the season goes on (learning the system) — or whether one part of the game draws
              disproportionately more reviews.
            </InfoButton>
          </div>
          <button onClick={() => setExpanded(true)} className="text-[9px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
            Expand ⤢
          </button>
        </div>
        <div className="text-[9px] text-[#8A8577] mb-1">Challenges per day, by inning group — all of MLB{isBackfilling ? ' · backfilling' : ''}</div>
        {isBackfilling && (
          <div className="text-[8.5px] text-[#8A8577] mb-1">Recent days will still fill in as the season log catches up</div>
        )}
        <div className="flex-1 flex items-center">
          <TrendChartSvg rows={leagueRows} width={240} height={100} />
        </div>
      </div>

      {expanded && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpanded(false)}>
          <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">ABS challenges — trend by {granularity}</div>
                <div className="text-[11px] text-[#8A8577]">By inning group, filterable by league, division, or team</div>
              </div>
              <div className="flex items-center gap-3">
                {momChange && (
                  <div
                    className="text-right"
                    title={`${momChange.isRate ? 'Overturn rate' : 'Challenges'} — ${momChange.currentLabel}: ${momChange.currentDisplay} vs ${momChange.previousLabel}: ${momChange.previousDisplay}`}
                  >
                    <div className="text-[9px] uppercase tracking-wide text-[#8A8577]">
                      {momChange.isRate ? 'Success rate: ' : ''}{momChange.currentLabel} vs {momChange.previousLabel}
                    </div>
                    {momChange.change === null ? (
                      <div className="text-[13px] font-bold text-[#8A8577]">—</div>
                    ) : (
                      <div className={`text-[13px] font-bold ${momChange.change >= 0 ? 'text-[#0ca30c]' : 'text-[#d03b3b]'}`}>
                        {momChange.change >= 0 ? '▲' : '▼'} {Math.abs(momChange.change)}{momChange.isRate ? 'pts' : '%'}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => setExpanded(false)} className="text-[#8A8577] hover:text-[#1A1A1A] text-xl leading-none">&times;</button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 mb-1 flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <TrendFilterControls filter={filter} onChange={setFilter} />
                <div className="inline-flex gap-[2px] rounded-full border border-[#DEDACE] p-0.5">
                  {(['day', 'week', 'month'] as const).map(g => (
                    <button key={g} onClick={() => setGranularity(g)} className={`rounded-full text-[10px] font-bold uppercase px-3 py-1 transition-colors duration-200 ${granularity === g ? 'bg-[#1A1A1A] text-white' : 'text-[#8A8577]'}`}>{GRANULARITY_LABEL[g]}</button>
                  ))}
                </div>
                <div className="inline-flex gap-[2px] rounded-full border border-[#DEDACE] p-0.5">
                  <button onClick={() => setMetric('volume')} className={`rounded-full text-[10px] font-bold uppercase px-3 py-1 transition-colors duration-200 ${metric === 'volume' ? 'bg-[#FF5722] text-white' : 'text-[#8A8577]'}`}>Volume</button>
                  <button onClick={() => setMetric('rate')} className={`rounded-full text-[10px] font-bold uppercase px-3 py-1 transition-colors duration-200 ${metric === 'rate' ? 'bg-[#FF5722] text-white' : 'text-[#8A8577]'}`}>Overturn rate</button>
                </div>
              </div>
              <TrendLegend />
            </div>
            <div className="text-[10px] text-[#8A8577] mb-3">
              {metric === 'volume' ? `How many challenges were called, per ${granularity}` : `What share of challenges were overturned, per ${granularity}`}
              {granularity === 'week' && ' (weeks start Monday)'}
            </div>

            {filteredRows.length < 2 ? (
              <div className="text-[12px] text-[#8A8577] py-12 text-center">Not enough {granularity}s of data for this filter yet.</div>
            ) : (
              <TrendChartSvg rows={filteredRows} width={1000} height={360} monthTicks showAllPointLabels={granularity !== 'day'} formatValue={metric === 'rate' ? RATE_FMT : undefined} />
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

function AbsLeaderboardsBox({ ledger }: { ledger: ABSChallengeRecord[] }) {
  if (ledger.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col items-center justify-center text-center">
        <div className="text-[11.5px] font-bold text-[#1A1A1A] self-start mb-1">Leaderboards</div>
        <div className="text-[10px] text-[#8A8577] flex-1 flex items-center">Team leaderboard temporarily unavailable — check back shortly.</div>
      </div>
    )
  }

  const withChallenges = ledger.filter(r => r.total_challenges > 0)
  const withSample = ledger.filter(r => r.total_challenges >= 20)
  const mostChallenges = [...ledger].sort((a, b) => b.total_challenges - a.total_challenges)[0]
  const fewestChallenges = [...withChallenges].sort((a, b) => a.total_challenges - b.total_challenges)[0]
  const bestRate = [...withSample].sort((a, b) => (b.total_success_rate ?? 0) - (a.total_success_rate ?? 0))[0]
  const worstRate = [...withSample].sort((a, b) => (a.total_success_rate ?? 0) - (b.total_success_rate ?? 0))[0]
  const mostCatcher = [...ledger].sort((a, b) => b.pitching_challenges - a.pitching_challenges)[0]
  const mostBatter = [...ledger].sort((a, b) => b.batting_challenges - a.batting_challenges)[0]
  const mostConfirmed = [...ledger].sort((a, b) => (b.total_challenges - b.total_overturns) - (a.total_challenges - a.total_overturns))[0]

  const rows: { label: string; value: string; team: string }[] = [
    mostChallenges && { label: 'Most challenges', team: mostChallenges.team_abbr, value: String(mostChallenges.total_challenges) },
    fewestChallenges && { label: 'Fewest challenges', team: fewestChallenges.team_abbr, value: String(fewestChallenges.total_challenges) },
    bestRate && { label: 'Best overturn rate', team: bestRate.team_abbr, value: `${Math.round((bestRate.total_success_rate ?? 0) * 100)}%` },
    worstRate && { label: 'Worst overturn rate', team: worstRate.team_abbr, value: `${Math.round((worstRate.total_success_rate ?? 0) * 100)}%` },
    mostCatcher && { label: 'Most pitcher/catcher', team: mostCatcher.team_abbr, value: String(mostCatcher.pitching_challenges) },
    mostBatter && { label: 'Most batter', team: mostBatter.team_abbr, value: String(mostBatter.batting_challenges) },
    mostConfirmed && { label: 'Most confirmed (lost)', team: mostConfirmed.team_abbr, value: String(mostConfirmed.total_challenges - mostConfirmed.total_overturns) },
  ].filter((r): r is { label: string; value: string; team: string } => Boolean(r))

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 flex flex-col">
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="text-[11.5px] font-bold text-[#1A1A1A]">Leaderboards</div>
        <InfoButton title="Leaderboards" align="left">
          Season-long team splits: who challenges the most/least, who&apos;s most accurate, and who leans on pitcher/catcher
          calls vs. batter calls. The rate cutoffs (min. 20 challenges) exist so a team with 2-for-2 doesn&apos;t rank above
          a team with a real sample.
        </InfoButton>
      </div>
      <div className="text-[9px] text-[#8A8577] mb-2">Team splits, season (min. 20 challenges for rate)</div>
      <div className="flex-1 space-y-1.5">
        {rows.map(r => {
          const logo = teamLogo(r.team)
          return (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#8A8577]">{r.label}</span>
              <span className="flex items-center gap-1 text-[10.5px] font-bold text-[#1A1A1A] shrink-0">
                {logo && <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />}
                {r.team} <span className="font-normal text-[#8A8577]">({r.value})</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Player challenge efficiency — leaderboard + expandable scatter ──────
//
// Real per-player data from abs_challenge_log's reviewDetails.player (the
// actual person who called the challenge — catcher/pitcher on the
// fielding side, the batter himself on the batting side), not an
// inferred role. Min-sample filter (5 challenges) already applied
// server-side in getPlayerChallengeEfficiency, same "don't rank noise"
// rule as the team-level leaderboard's min-20 cutoff.

function PlayerRow({ p, highlight }: { p: PlayerChallengeRow; highlight: 'good' | 'bad' }) {
  const color = p.side === 'batting' ? ORANGE : BLUE
  return (
    <div className="flex items-center gap-1.5" title={`${p.playerName}: ${p.overturns} of ${p.challenges} challenges overturned`}>
      <img src={playerHeadshotUrl(p.playerId, 40)} alt="" className="w-5 h-5 rounded-full object-cover border shrink-0" style={{ borderColor: color }} />
      <span className="flex-1 text-[10.5px] text-[#1A1A1A] truncate">{p.playerName}</span>
      <span className={`text-[10.5px] font-bold tabular-nums ${highlight === 'good' ? 'text-[#1A1A1A]' : 'text-[#8A8577]'}`}>
        {Math.round(p.successRate * 100)}%
      </span>
      <span className="w-8 text-right text-[9px] text-[#8A8577] tabular-nums shrink-0">({p.challenges})</span>
    </div>
  )
}

type HoverCard = { player: PlayerChallengeRow; left: number; top: number }

function PlayerScatter({ players, benchmarkRate, benchmarkLabel, width, height, detailed }: { players: PlayerChallengeRow[]; benchmarkRate: number; benchmarkLabel: string; width: number; height: number; detailed?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverCard | null>(null)
  const PAD_L = 28, PAD_R = 16, PAD_T = detailed ? 20 : 14, PAD_B = detailed ? 36 : 24
  const maxChallenges = Math.max(1, ...players.map(p => p.challenges))
  const sx = (v: number) => PAD_L + (v / maxChallenges) * (width - PAD_L - PAD_R)
  const sy = (v: number) => height - PAD_B - v * (height - PAD_T - PAD_B) // v is 0..1 rate

  // Top/bottom-3 by rate get emphasized (bigger) avatars — recomputed from
  // whatever's actually on screen, so filtering to one team highlights
  // that team's own best/worst rather than league-wide names that might
  // not even be in the filtered set. With 300+ players, perfect/zero
  // small-sample records stack up in the same corner, and every layout
  // that tried to fit inline NAME labels in there collided (with the
  // axis, or with each other) — so identity now rides on the avatar
  // itself (real headshot, generic-silhouette fallback baked into the
  // Cloudinary URL) plus a card-style hover tooltip, not on text crammed
  // into a crowded corner or a plain unstyled native <title>.
  const sorted = [...players].sort((a, b) => b.successRate - a.successRate || b.challenges - a.challenges)
  const emphasized = new Set([...sorted.slice(0, 3), ...sorted.slice(-3)].map(p => p.playerId))

  const trackMouse = (player: PlayerChallengeRow) => (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ player, left: e.clientX - rect.left, top: e.clientY - rect.top })
  }

  // Clamp so the card never runs off the container's right/top edge —
  // container width/height are the rendered CSS pixels, not the SVG's
  // internal viewBox units, which is exactly what a CSS-positioned
  // overlay needs.
  const containerRect = containerRef.current?.getBoundingClientRect()
  const CARD_W = 190
  const cardLeft = hover ? Math.min(hover.left + 12, (containerRect?.width ?? width) - CARD_W - 4) : 0
  const cardTop = hover ? Math.max(hover.top - 60, 4) : 0

  return (
    <div ref={containerRef} className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* y-axis: 0% / 50% / 100% */}
        {[0, 0.5, 1].map(v => (
          <g key={v}>
            <line x1={PAD_L} y1={sy(v)} x2={width - PAD_R} y2={sy(v)} stroke="rgba(26,26,26,0.08)" strokeWidth="1" />
            <text x={PAD_L - 4} y={sy(v) + 3} fontSize="8" textAnchor="end" fill="rgba(26,26,26,0.4)">{Math.round(v * 100)}%</text>
          </g>
        ))}
        <text x={width - PAD_R} y={height - 6} fontSize="8" textAnchor="end" fill="rgba(26,26,26,0.4)">challenges →</text>

        {/* benchmark reference line — always league-wide, even when the
            dots are filtered to one team, so the line stays a constant
            "how does this compare to the league" yardstick rather than
            just re-drawing the mean of the same dots it sits behind. */}
        <line x1={PAD_L} y1={sy(benchmarkRate)} x2={width - PAD_R} y2={sy(benchmarkRate)} stroke="rgba(26,26,26,0.25)" strokeWidth="1" strokeDasharray="3,2" />
        <text x={width - PAD_R} y={sy(benchmarkRate) - 3} fontSize="7.5" textAnchor="end" fill="rgba(26,26,26,0.45)">{benchmarkLabel} {Math.round(benchmarkRate * 100)}%</text>

        {players.map(p => {
          const x = sx(p.challenges)
          const y = sy(p.successRate)
          const color = p.side === 'batting' ? ORANGE : BLUE
          const isEmphasized = emphasized.has(p.playerId)
          const isHovered = hover?.player.playerId === p.playerId
          // Detailed (single team selected, far fewer dots) gets noticeably
          // bigger avatars and a direct grey % value under each one — both
          // would just collide in the full 315-player view, so they're
          // gated behind the same "isn't crowded" signal as the team filter.
          const r = detailed ? (isEmphasized ? 11 : 8) : (isEmphasized ? 8 : 5.5)
          const clipId = `player-clip-${p.playerId}`
          return (
            <g
              key={p.playerId}
              onMouseEnter={trackMouse(p)}
              onMouseMove={trackMouse(p)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <clipPath id={clipId}>
                <circle cx={x} cy={y} r={r} />
              </clipPath>
              <circle cx={x} cy={y} r={r + 1} fill={color} opacity={isEmphasized ? 1 : 0.7} />
              <image
                href={playerHeadshotUrl(p.playerId, 80)}
                x={x - r} y={y - r} width={r * 2} height={r * 2}
                clipPath={`url(#${clipId})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <circle cx={x} cy={y} r={r} fill="none" stroke="#fff" strokeWidth={isEmphasized ? 1.5 : 1} />
              {isHovered && <circle cx={x} cy={y} r={r + 2.5} fill="none" stroke={color} strokeWidth="1.5" />}
              {detailed && (
                <text x={x} y={y + r + 9} textAnchor="middle" fontSize="8" fontWeight="700" fill="#8A8577">
                  {Math.round(p.successRate * 100)}%
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover && (
        <div
          className="absolute z-10 pointer-events-none bg-white rounded-lg border border-[#E8E4DC] shadow-lg overflow-hidden"
          style={{ left: cardLeft, top: cardTop, width: CARD_W }}
        >
          <div className="flex items-center gap-2 p-2 bg-[#FAF8F3]">
            <img
              src={playerHeadshotUrl(hover.player.playerId, 80)}
              alt=""
              className="w-9 h-9 rounded-full object-cover border-2 shrink-0"
              style={{ borderColor: hover.player.side === 'batting' ? ORANGE : BLUE }}
            />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#1A1A1A] truncate">{hover.player.playerName}</div>
              <div className="text-[9px] text-[#8A8577]">
                {hover.player.side === 'batting' ? 'Batter' : 'Pitcher/catcher'}{hover.player.teamAbbr ? ` · ${hover.player.teamAbbr}` : ''}
              </div>
            </div>
          </div>
          <div className="px-2 py-1.5 border-t border-[#E8E4DC] text-[10px] text-[#1A1A1A]">
            <span className="font-bold">{hover.player.overturns}</span> overturned, <span className="font-bold">{hover.player.challenges - hover.player.overturns}</span> confirmed
            <span className="text-[#8A8577]"> of {hover.player.challenges} total</span>
            <div className="mt-0.5">
              Success rate: <span className="font-bold" style={{ color: hover.player.side === 'batting' ? ORANGE : BLUE }}>{Math.round(hover.player.successRate * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerTeamFilterControls({ players, value, onChange }: { players: PlayerChallengeRow[]; value: string; onChange: (v: string) => void }) {
  const teamsPresent = new Set(players.map(p => p.teamAbbr).filter((t): t is string => Boolean(t)))
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-[11px] border border-[#DEDACE] rounded-md px-2 py-1 text-[#1A1A1A] bg-white"
    >
      <option value="all">All teams</option>
      {(['AL', 'NL'] as const).map(league => (
        <optgroup key={league} label={`${league === 'AL' ? 'American' : 'National'} League`}>
          {TEAM_DIRECTORY.filter(t => t.league === league && teamsPresent.has(t.abbrev)).sort((a, b) => a.short.localeCompare(b.short)).map(t => (
            <option key={t.abbrev} value={t.abbrev}>{t.short}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function PlayerEfficiencyBox({ players }: { players: PlayerChallengeRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const [teamFilter, setTeamFilter] = useState('all')

  if (players.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 sm:col-span-2 flex items-center justify-center text-center min-h-[100px]">
        <div className="text-[10px] text-[#8A8577]">Backfilling per-pitch data — player-level challenge stats land once the season log finishes indexing.</div>
      </div>
    )
  }

  // Server now returns every player with >=1 challenge (see
  // getPlayerChallengeEfficiency); the min-5 noise bar is applied here,
  // client-side, so it can be relaxed to 0 once a single team is selected
  // in the scatter below — a team's own roster is small enough that a
  // 2-for-3 shouldn't be hidden, but the league-wide leaderboard still
  // needs the cutoff or one-off perfect records would flood it.
  const qualifiedPlayers = players.filter(p => p.challenges >= MIN_PLAYER_SAMPLE)
  const sorted = [...qualifiedPlayers].sort((a, b) => b.successRate - a.successRate)
  const LEADERBOARD_SIZE = 5
  const best = sorted.slice(0, LEADERBOARD_SIZE)
  const worst = sorted.slice(-LEADERBOARD_SIZE).reverse()

  return (
    <>
      <div className="rounded-lg border border-[#E8E4DC] bg-white p-3 sm:col-span-2 flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[11.5px] font-bold text-[#1A1A1A]">Player challenge efficiency</div>
            <InfoButton title="Player challenge efficiency" align="left">
              Individual track record for whoever calls for the review — catcher/pitcher on defense, the batter on
              offense. A high success rate with real volume signals someone who reads borderline calls well, not just a
              lucky small sample.
            </InfoButton>
          </div>
          <button onClick={() => setExpanded(true)} className="text-[9px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
            Expand ⤢
          </button>
        </div>
        <div className="text-[9px] text-[#8A8577] mb-2">
          Who calls for a challenge, and how often they&apos;re right — min {MIN_PLAYER_SAMPLE} challenges
          <span className="inline-flex items-center gap-1 ml-2">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: BLUE }} />Pitcher/catcher
            <span className="w-1.5 h-1.5 rounded-full inline-block ml-1.5" style={{ background: ORANGE }} />Batter
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="text-[9px] uppercase tracking-wide font-bold text-[#8A8577] col-span-1">Most efficient</div>
          <div className="text-[9px] uppercase tracking-wide font-bold text-[#8A8577] col-span-1">Least efficient</div>
          {Array.from({ length: LEADERBOARD_SIZE }, (_, i) => i).flatMap(i => [
            <div key={`best-${i}`}>{best[i] && <PlayerRow p={best[i]} highlight="good" />}</div>,
            <div key={`worst-${i}`}>{worst[i] && <PlayerRow p={worst[i]} highlight="bad" />}</div>,
          ])}
        </div>
      </div>

      {expanded && (() => {
        const isTeamSelected = teamFilter !== 'all'
        // Benchmark line always uses the min-5 set regardless of the team
        // filter — a stable "meaningful sample" league average to compare
        // against, not one that shifts depending on which team you're
        // looking at (or gets skewed by 1-challenge outliers once the
        // team filter drops the bar to 0).
        const leagueAvgRate = qualifiedPlayers.reduce((sum, p) => sum + p.overturns, 0) / Math.max(1, qualifiedPlayers.reduce((sum, p) => sum + p.challenges, 0))
        const shownPlayers = isTeamSelected ? players.filter(p => p.teamAbbr === teamFilter) : qualifiedPlayers
        const teamName = isTeamSelected ? TEAM_DIRECTORY.find(t => t.abbrev === teamFilter)?.short : null

        return (
          <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpanded(false)}>
            <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-[15px] font-bold text-[#1A1A1A]">Player challenge efficiency</div>
                    <HelpLink stat="abs-success-rate" />
                  </div>
                  <div className="text-[11px] text-[#8A8577]">
                    Each dot is one player — challenge volume vs. success rate{isTeamSelected ? ', every challenge shown' : `, min ${MIN_PLAYER_SAMPLE} challenges`}
                  </div>
                </div>
                <button onClick={() => setExpanded(false)} className="text-[#8A8577] hover:text-[#1A1A1A] text-xl leading-none">&times;</button>
              </div>

              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <PlayerTeamFilterControls players={players} value={teamFilter} onChange={setTeamFilter} />
                <div className="flex items-center gap-3 text-[10px] text-[#8A8577]">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BLUE }} />Pitcher/catcher</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: ORANGE }} />Batter</span>
                </div>
              </div>
              <div className="text-[10px] text-[#8A8577] mb-2">
                {teamName ? `${teamName} — ${shownPlayers.length} players (no minimum)` : `All of MLB — ${shownPlayers.length} players qualify (min ${MIN_PLAYER_SAMPLE})`}
              </div>

              {shownPlayers.length === 0 ? (
                <div className="text-[12px] text-[#8A8577] py-12 text-center">
                  {isTeamSelected ? `No recorded ${teamName} challenges yet.` : `No players clear the min-${MIN_PLAYER_SAMPLE}-challenge bar yet.`}
                </div>
              ) : (
                <PlayerScatter players={shownPlayers} benchmarkRate={leagueAvgRate} benchmarkLabel="league avg" width={600} height={340} detailed={isTeamSelected} />
              )}
            </div>
          </div>
          </ModalPortal>
        )
      })()}
    </>
  )
}

export function AbsChallengeGrid({ ledger, inningBreakdown, dailyTrendByTeam, playerEfficiency }: { ledger: ABSChallengeRecord[]; inningBreakdown: InningBreakdownRow[]; dailyTrendByTeam: DailyTeamTrendRow[]; playerEfficiency: PlayerChallengeRow[] }) {
  const leader = [...ledger].filter(r => r.total_challenges > 0).sort((a, b) => b.total_challenges - a.total_challenges)[0]
  const readerLine = leader
    ? `${leader.team_abbr} is ${leader.total_overturns}-for-${leader.total_challenges} on ABS challenges this season (${Math.round((leader.total_success_rate ?? 0) * 100)}%).`
    : null

  // "Who's challenging" and "Leaderboards" run off Savant's own season-total
  // leaderboard (always complete). "Challenges by inning" and "Trend by
  // month" run off our own per-pitch backfill, which walks the season one
  // day at a time and takes a while to catch up — comparing the two real
  // totals tells us, honestly, how far along that backfill is, so the two
  // per-pitch boxes don't read as broken while they're still filling in.
  const expectedTotal = ledger.reduce((sum, r) => sum + r.total_challenges, 0)
  const indexedTotal = inningBreakdown.reduce((sum, r) => sum + r.challenges, 0)
  const coveragePct = expectedTotal > 0 ? indexedTotal / expectedTotal : 1
  const isBackfilling = inningBreakdown.length > 0 && coveragePct < 0.9

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
      <div className="text-[13px] font-bold text-[#1A1A1A]">ABS challenge deep dive</div>
      <div className="text-[10px] text-[#8A8577] mb-2">Who challenges, when, and how often it works</div>
      {readerLine && <div className="text-[11px] text-[#1A1A1A] mb-2 italic">&ldquo;{readerLine}&rdquo;</div>}
      {isBackfilling && (
        <div className="text-[10px] text-[#8A8577] mb-3 bg-[#F0EFEC] rounded-md px-2 py-1.5">
          <span className="font-bold text-[#1A1A1A]">Inning &amp; month breakdowns are still backfilling</span> — {indexedTotal.toLocaleString()} of ~{expectedTotal.toLocaleString()} season challenges indexed so far ({Math.round(coveragePct * 100)}%). Totals below will keep rising until it catches up.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <StackedChallengeSidesBox ledger={ledger} />
        <InningBreakdownBox rows={inningBreakdown} isBackfilling={isBackfilling} />
        <DailyTrendBox byTeam={dailyTrendByTeam} isBackfilling={isBackfilling} />
        <AbsLeaderboardsBox ledger={ledger} />
        <PlayerEfficiencyBox players={playerEfficiency} />
      </div>
    </div>
  )
}

type ExtraBasesGapRow = ExtraBasesRow & { gap: number }

function extraBasesStoryLine(row: ExtraBasesGapRow): string {
  return row.gap > 0
    ? `Run drunk, field sober — +${row.baserunningRuns} taking extra bases, ${row.outfieldRunsSaved >= 0 ? '+' : ''}${row.outfieldRunsSaved} in the outfield.`
    : `Field sharp, run cautious — ${row.outfieldRunsSaved >= 0 ? '+' : ''}${row.outfieldRunsSaved} outfield runs saved vs. ${row.baserunningRuns >= 0 ? '+' : ''}${row.baserunningRuns} on the bases.`
}

type EBHover = { row: ExtraBasesGapRow; left: number; top: number }

// Shared bar-pair renderer — used by both the compact 6-team card and the
// "show all 30" modal, so hover behavior and visual language stay in sync.
function ExtraBasesRowBars({ row, maxAbs, onHover, onLeave, isHovered }: {
  row: ExtraBasesGapRow
  maxAbs: number
  onHover: (e: React.MouseEvent) => void
  onLeave: () => void
  isHovered: boolean
}) {
  const logo = teamLogo(row.teamAbbr)
  return (
    <div
      className={`flex items-center gap-2 rounded-md -mx-1.5 px-1.5 py-0.5 transition-colors cursor-pointer ${isHovered ? 'bg-white' : ''}`}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onLeave}
    >
      <span className="w-8 flex items-center gap-1 text-[11px] font-bold text-[#1A1A1A] shrink-0">
        {logo && <img src={logo} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />}
        {row.teamAbbr}
      </span>
      <div className="flex-1 space-y-[3px]">
        {([['baserunningRuns', BLUE], ['outfieldRunsSaved', ORANGE]] as const).map(([key, color]) => {
          const v = row[key]
          const widthPct = (Math.abs(v) / maxAbs) * 50
          return (
            <div key={key} className="relative h-[10px]">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#DEDACE]" />
              <div
                className="absolute top-0 h-full rounded-full"
                style={{ background: color, width: `${widthPct}%`, left: v >= 0 ? '50%' : `${50 - widthPct}%` }}
              />
            </div>
          )
        })}
      </div>
      <span className="w-24 text-right text-[9.5px] text-[#8A8577] shrink-0 tabular-nums">
        {row.baserunningRuns >= 0 ? '+' : ''}{row.baserunningRuns} / {row.outfieldRunsSaved >= 0 ? '+' : ''}{row.outfieldRunsSaved}
      </span>
    </div>
  )
}

function ExtraBasesExplainer() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="text-[9px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
        {open ? 'Hide explainer ▴' : "New to this? What's this mean ▾"}
      </button>
      {open && (
        <div className="mt-1.5 text-[10.5px] text-[#57534E] bg-[#F0EFEC] rounded-md px-2.5 py-2 leading-relaxed space-y-1.5">
          <div>
            <span className="font-bold text-[#1A1A1A]">Baserunning runs</span> (blue) — how many extra runs a team&apos;s
            runners have added by taking extra bases more often than an average runner: first-to-third on a single,
            scoring from second on a hit, advancing on a wild pitch or passed ball. Positive means aggressive and
            successful; negative means passive, or getting thrown out trying.
          </div>
          <div>
            <span className="font-bold text-[#1A1A1A]">Outfield runs saved</span> (orange) — how many runs a team&apos;s
            outfielders have saved by catching balls an average fielder wouldn&apos;t reach (a stat called Outs Above
            Average). Positive means elite range and routes to the ball; negative means fly balls dropping in that
            should&apos;ve been caught.
          </div>
          <div>
            Bars point right of center for positive, left for negative — the further out, the bigger the number. A team
            can be great at one and bad at the other, which is exactly what this chart is built to surface.
          </div>
        </div>
      )}
    </div>
  )
}

function ExtraBasesCard({ rows }: { rows: ExtraBasesRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const [sortMode, setSortMode] = useState<'gap' | 'baserunning' | 'outfield'>('gap')
  const [hover, setHover] = useState<EBHover | null>(null)
  const [modalHover, setModalHover] = useState<EBHover | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const withGap: ExtraBasesGapRow[] = rows.map(r => ({ ...r, gap: r.baserunningRuns - r.outfieldRunsSaved }))
  const top = [...withGap].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 6)
  const maxAbsCompact = Math.max(1, ...top.flatMap(r => [Math.abs(r.baserunningRuns), Math.abs(r.outfieldRunsSaved)]))
  const maxAbsAll = Math.max(1, ...withGap.flatMap(r => [Math.abs(r.baserunningRuns), Math.abs(r.outfieldRunsSaved)]))

  const standout = top[0]
  const readerLine = standout ? `The ${standout.teamName} ${extraBasesStoryLine(standout).charAt(0).toLowerCase()}${extraBasesStoryLine(standout).slice(1)}` : null

  // Two separate hover states/refs — the compact card and the modal are
  // different positioning contexts (the modal is a fixed, viewport-centered
  // overlay), so a tooltip positioned off the wrong container's rect would
  // render in the wrong place, or behind the modal's own backdrop.
  const trackMouse = (row: ExtraBasesGapRow) => (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({ row, left: e.clientX - rect.left, top: e.clientY - rect.top })
  }
  const trackModalMouse = (row: ExtraBasesGapRow) => (e: React.MouseEvent) => {
    const rect = modalRef.current?.getBoundingClientRect()
    if (!rect) return
    setModalHover({ row, left: e.clientX - rect.left, top: e.clientY - rect.top })
  }

  const CARD_W = 220
  const containerRect = containerRef.current?.getBoundingClientRect()
  const cardLeft = hover ? Math.min(hover.left + 12, (containerRect?.width ?? 0) - CARD_W - 4) : 0
  const cardTop = hover ? Math.max(hover.top - 70, 4) : 0
  const modalRect = modalRef.current?.getBoundingClientRect()
  const modalCardLeft = modalHover ? Math.min(modalHover.left + 12, (modalRect?.width ?? 0) - CARD_W - 4) : 0
  const modalCardTop = modalHover ? Math.max(modalHover.top - 70, 4) : 0

  const sortedAll = [...withGap].sort((a, b) => {
    if (sortMode === 'baserunning') return b.baserunningRuns - a.baserunningRuns
    if (sortMode === 'outfield') return b.outfieldRunsSaved - a.outfieldRunsSaved
    return Math.abs(b.gap) - Math.abs(a.gap)
  })

  return (
    <div ref={containerRef} className="relative rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[13px] font-bold text-[#1A1A1A]">Extra bases taken vs. given</div>
          <div className="text-[10px] text-[#8A8577]">Baserunning runs vs. outfield runs saved — biggest gaps, season</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 text-[9px] text-[#8A8577]">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BLUE }} />Baserunning</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: ORANGE }} />Outfield</span>
          </div>
          <button onClick={() => setExpanded(true)} className="text-[9px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
            Expand ⤢
          </button>
        </div>
      </div>

      {readerLine && <div className="text-[11px] text-[#1A1A1A] mb-2 mt-1 italic">&ldquo;{readerLine}&rdquo;</div>}

      <div className="flex-1 space-y-2.5 mt-1">
        {top.map(row => (
          <ExtraBasesRowBars
            key={row.teamAbbr}
            row={row}
            maxAbs={maxAbsCompact}
            onHover={trackMouse(row)}
            onLeave={() => setHover(null)}
            isHovered={hover?.row.teamAbbr === row.teamAbbr}
          />
        ))}
      </div>

      <div className="mt-2">
        <ExtraBasesExplainer />
      </div>

      {hover && (
        <div
          className="absolute z-10 pointer-events-none bg-white rounded-lg border border-[#E8E4DC] shadow-lg overflow-hidden"
          style={{ left: cardLeft, top: cardTop, width: CARD_W }}
        >
          <div className="flex items-center gap-2 p-2 bg-white border-b border-[#E8E4DC]">
            {teamLogo(hover.row.teamAbbr) && <img src={teamLogo(hover.row.teamAbbr)!} alt="" className="w-6 h-6 object-contain shrink-0" />}
            <div className="text-[11px] font-bold text-[#1A1A1A] truncate">{hover.row.teamName}</div>
          </div>
          <div className="px-2.5 py-2 text-[10px] text-[#1A1A1A] leading-relaxed">
            <div><span className="font-bold" style={{ color: BLUE }}>{hover.row.baserunningRuns >= 0 ? '+' : ''}{hover.row.baserunningRuns}</span> baserunning runs</div>
            <div><span className="font-bold" style={{ color: ORANGE }}>{hover.row.outfieldRunsSaved >= 0 ? '+' : ''}{hover.row.outfieldRunsSaved}</span> outfield runs saved</div>
            <div className="mt-1 text-[#57534E]">{extraBasesStoryLine(hover.row)}</div>
          </div>
        </div>
      )}

      {expanded && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpanded(false)}>
          <div ref={modalRef} className="relative bg-white rounded-2xl border border-[#E8E4DC] p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[15px] font-bold text-[#1A1A1A]">Extra bases taken vs. given</div>
                <div className="text-[11px] text-[#8A8577]">All {withGap.length} teams — baserunning runs vs. outfield runs saved</div>
              </div>
              <button onClick={() => setExpanded(false)} className="text-[#8A8577] hover:text-[#1A1A1A] text-xl leading-none">&times;</button>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                {([['gap', 'Biggest gaps'], ['baserunning', 'Best baserunning'], ['outfield', 'Best outfield']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${sortMode === mode ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[#8A8577]">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: BLUE }} />Baserunning</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: ORANGE }} />Outfield</span>
              </div>
            </div>

            <div className="space-y-2">
              {sortedAll.map(row => (
                <ExtraBasesRowBars
                  key={row.teamAbbr}
                  row={row}
                  maxAbs={maxAbsAll}
                  onHover={trackModalMouse(row)}
                  onLeave={() => setModalHover(null)}
                  isHovered={modalHover?.row.teamAbbr === row.teamAbbr}
                />
              ))}
            </div>

            <div className="mt-4">
              <ExtraBasesExplainer />
            </div>

            {modalHover && (
              <div
                className="absolute z-10 pointer-events-none bg-white rounded-lg border border-[#E8E4DC] shadow-lg overflow-hidden"
                style={{ left: modalCardLeft, top: modalCardTop, width: CARD_W }}
              >
                <div className="flex items-center gap-2 p-2 bg-white border-b border-[#E8E4DC]">
                  {teamLogo(modalHover.row.teamAbbr) && <img src={teamLogo(modalHover.row.teamAbbr)!} alt="" className="w-6 h-6 object-contain shrink-0" />}
                  <div className="text-[11px] font-bold text-[#1A1A1A] truncate">{modalHover.row.teamName}</div>
                </div>
                <div className="px-2.5 py-2 text-[10px] text-[#1A1A1A] leading-relaxed">
                  <div><span className="font-bold" style={{ color: BLUE }}>{modalHover.row.baserunningRuns >= 0 ? '+' : ''}{modalHover.row.baserunningRuns}</span> baserunning runs</div>
                  <div><span className="font-bold" style={{ color: ORANGE }}>{modalHover.row.outfieldRunsSaved >= 0 ? '+' : ''}{modalHover.row.outfieldRunsSaved}</span> outfield runs saved</div>
                  <div className="mt-1 text-[#57534E]">{extraBasesStoryLine(modalHover.row)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}

type HeatMetric = 'runValue' | 'hardHit' | 'runsAllowed' | 'hitsAllowed'

const HEAT_METRICS: { key: HeatMetric; short: string }[] = [
  { key: 'runValue', short: 'Run value' },
  { key: 'hardHit', short: 'Hard-hit%' },
  { key: 'runsAllowed', short: 'Runs allowed' },
  { key: 'hitsAllowed', short: 'Hits allowed' },
]

const HEAT_METRIC_INFO: Record<HeatMetric, { title: string; body: string }> = {
  runValue: {
    title: 'Run value',
    body: 'The average change in run expectancy (delta_run_exp) each pitch produces. Negative = good for the pitcher (suppresses the batting team’s expected runs); positive = good for the hitter. This is the most complete single number for "how good was this pitch," since it folds in ball/strike calls, contact quality, and outcome all at once.',
  },
  hardHit: {
    title: 'Hard-hit rate',
    body: 'Share of batted balls hit 95+ mph off the bat — Statcast’s own definition of a "hard-hit" ball. High hard-hit rate in a pitch/count combo means hitters are squaring it up even when the result (out, hit, whatever) doesn’t show it yet — often an early warning sign before the damage shows up in the box score.',
  },
  runsAllowed: {
    title: 'Runs allowed',
    body: 'Total runs that scored on plays following this pitch/count, this season. Close to "RBI given up" but not identical — it also counts runs that score via a fielding error or wild pitch, which official RBI scoring excludes. Useful for spotting which counts have actually cost a pitcher runs, not just which ones look bad in the abstract.',
  },
  hitsAllowed: {
    title: 'Hits allowed',
    body: 'Total singles, doubles, triples, and home runs given up on this pitch/count this season — raw contact damage, independent of exit velocity or luck. Pairs well with hard-hit rate: a pitch can get hit hard without giving up hits (bad luck for the hitter) or vice versa.',
  },
}

// Sequential metrics (everything but run value) don't have a natural
// "good for pitcher" pole to diverge around, so their color intensity is
// normalized against the max value actually on screen — the same
// "relative to what's shown" convention used by every other bar chart in
// this file (maxAbs, maxChallenges, etc.) rather than a fixed global scale
// that would leave most seasons looking pale.
function heatCellStyle(cell: PitchCountRunValue | null, metric: HeatMetric, maxOnScreen: number): { display: string; bg: string; textColor: string; tooltip: string } {
  if (!cell) return { display: '—', bg: '#fff', textColor: '#C9C4B6', tooltip: 'Not enough pitches thrown in this count yet' }
  switch (metric) {
    // Averaged metrics still gate on MIN_COUNT_SAMPLE here (the source now
    // returns some cells below that threshold specifically so hits/runs
    // aren't lost — an average over 1-2 pitches is still too noisy to show
    // as if it meant something, even though the exact hit/run count on that
    // same cell is a certain fact, not an estimate).
    case 'runValue':
      if (cell.pitches < MIN_COUNT_SAMPLE) return { display: '—', bg: '#fff', textColor: '#C9C4B6', tooltip: `Not enough pitches thrown in this count yet (${cell.pitches})` }
      return { display: cell.avgRunValue.toFixed(2), bg: runValueColor(cell.avgRunValue), textColor: '#1A1A1A', tooltip: `${cell.avgRunValue.toFixed(3)} runs/pitch over ${cell.pitches} pitches` }
    case 'hardHit': {
      if (cell.pitches < MIN_COUNT_SAMPLE || cell.hardHitRate === null) {
        return { display: '—', bg: '#fff', textColor: '#C9C4B6', tooltip: cell.pitches < MIN_COUNT_SAMPLE ? 'Not enough pitches thrown in this count yet' : 'No batted balls in this count yet' }
      }
      const HARD_HIT_CLAMP = 0.6
      return { display: `${Math.round(cell.hardHitRate * 100)}%`, bg: sequentialRedColor(cell.hardHitRate / HARD_HIT_CLAMP), textColor: '#1A1A1A', tooltip: `${Math.round(cell.hardHitRate * 100)}% hard-hit over ${cell.battedBalls} batted balls` }
    }
    // Hits/runs are exact counts, not averages — shown at ANY sample size,
    // including a cell that exists purely because of the game-feed backfill
    // (pitches === 0: we know a hit happened here from MLB's own log, just
    // not the rest of that pitch's Statcast telemetry).
    case 'runsAllowed':
      if (cell.pitches === 0 && cell.runsAllowed === 0) return { display: '—', bg: '#fff', textColor: '#C9C4B6', tooltip: 'Not enough pitches thrown in this count yet' }
      return {
        display: cell.runsAllowed % 1 === 0 ? String(cell.runsAllowed) : cell.runsAllowed.toFixed(1),
        bg: sequentialRedColor(maxOnScreen > 0 ? cell.runsAllowed / maxOnScreen : 0),
        textColor: '#1A1A1A',
        tooltip: cell.pitches > 0 ? `${cell.runsAllowed} runs allowed over ${cell.pitches} pitches` : `${cell.runsAllowed} run${cell.runsAllowed === 1 ? '' : 's'} allowed here — recovered from MLB's official log, Savant has no per-pitch record of it`,
      }
    case 'hitsAllowed':
      if (cell.pitches === 0 && cell.hitsAllowed === 0) return { display: '—', bg: '#fff', textColor: '#C9C4B6', tooltip: 'Not enough pitches thrown in this count yet' }
      return {
        display: String(cell.hitsAllowed),
        bg: sequentialRedColor(maxOnScreen > 0 ? cell.hitsAllowed / maxOnScreen : 0),
        textColor: '#1A1A1A',
        tooltip: cell.pitches > 0 ? `${cell.hitsAllowed} hits allowed over ${cell.pitches} pitches` : `${cell.hitsAllowed} hit${cell.hitsAllowed === 1 ? '' : 's'} allowed here — recovered from MLB's official log, Savant has no per-pitch record of it`,
      }
  }
}

// The 5-column grid (COUNT_COLUMNS) is a deliberately curated slice — first
// pitch, two-strike counts, full count — not all 12 ball-strike counts, so
// the visible cells were never going to sum to a pitcher's real season
// total and a reader comparing against, say, Baseball Reference would see
// a mismatch. This computes the TRUE total across every count actually
// recorded for a pitch type (profile.runValueByCount already holds all of
// them — COUNT_COLUMNS only limits what's drawn, not what's fetched), so
// the "Total" column reconciles with the pitcher's real season number.
function pitchMetricTotal(buckets: PitchCountRunValue[], metric: HeatMetric, arsenalEntry?: ArsenalPitch): { display: string; pitches: number } {
  // runValue/hardHit stay bucket-based: their numerators (avgRunValue*pitches,
  // hardHitBalls) only ever sum over the filtered buckets, so the pitch-count
  // denominator has to match those same buckets or the weighted average gets
  // diluted by pitches the numerator never accounted for.
  const bucketPitches = buckets.reduce((s, b) => s + b.pitches, 0)
  // hitsAllowed/runsAllowed read off the ArsenalPitch entry instead — count
  // buckets are pre-filtered to (pitchType, balls, strikes) combos thrown
  // MIN_COUNT_SAMPLE+ times (so the grid doesn't show noisy single-pitch
  // cells), which would silently drop any hit/run that happened on a rare
  // count. The arsenal total is accumulated unconditionally in
  // pitcher-statcast-profile.ts, so it's the one that can actually
  // reconcile with the official season total the way the caption promises.
  const arsenalPitches = arsenalEntry?.pitches ?? bucketPitches
  if (metric === 'runValue' || metric === 'hardHit') {
    if (buckets.length === 0 || bucketPitches === 0) return { display: '—', pitches: 0 }
    if (metric === 'runValue') {
      const weighted = buckets.reduce((s, b) => s + b.avgRunValue * b.pitches, 0) / bucketPitches
      return { display: weighted.toFixed(2), pitches: bucketPitches }
    }
    const battedBalls = buckets.reduce((s, b) => s + b.battedBalls, 0)
    if (battedBalls === 0) return { display: '—', pitches: bucketPitches }
    const hardHitBalls = buckets.reduce((s, b) => s + (b.hardHitRate ?? 0) * b.battedBalls, 0)
    return { display: `${Math.round((hardHitBalls / battedBalls) * 100)}%`, pitches: bucketPitches }
  }

  if (!arsenalEntry || arsenalPitches === 0) return { display: '—', pitches: 0 }
  if (metric === 'runsAllowed') {
    const total = arsenalEntry.runsAllowed
    return { display: total % 1 === 0 ? String(total) : total.toFixed(1), pitches: arsenalPitches }
  }
  return { display: String(arsenalEntry.hitsAllowed), pitches: arsenalPitches }
}

const GENERAL_STAT_ROWS: [string, (s: PitcherSeasonStats) => string][] = [
  ['ERA', s => s.era],
  ['W-L', s => `${s.wins}-${s.losses}`],
  ['IP', s => s.innings],
  ['K', s => String(s.strikeouts)],
  ['BB', s => String(s.walks)],
  ['WHIP', s => s.whip],
  ['K/9', s => s.k_per_9],
]

function RunValueHeatCard({ pitchers }: { pitchers: PitcherOption[] }) {
  const [metric, setMetric] = useState<HeatMetric>('runValue')
  // Both selections are lazy-initialized once from the first pitcher in the
  // list (the night's featured starter, when there is one) — pitchers is a
  // server-fetched, fixed-for-the-component's-life array, same reasoning as
  // the old single-pitcher arsenal init. Switching pitchers via the
  // selector re-seeds selectedPitches explicitly (see handleSelectPitcher)
  // rather than via an effect, since a stale arsenal selection from the
  // previous pitcher wouldn't map onto the new one's actual pitch types.
  const [selectedId, setSelectedId] = useState<number | null>(() => pitchers[0]?.id ?? null)
  // Default to every pitch he's actually thrown this season, not a top-N
  // cut — arsenal is already "every pitch type this pitcher has actually
  // thrown" (see pitcher-statcast-profile.ts), so defaulting to only the
  // top 3 silently hid rarely-used pitches (and their hits/runs) unless a
  // reader happened to click the extra arsenal chips themselves.
  const [selectedPitches, setSelectedPitches] = useState<Set<string>>(
    () => new Set((pitchers[0]?.profile.arsenal ?? []).map(a => a.pitchType))
  )

  const pitcher = pitchers.find(p => p.id === selectedId) ?? pitchers[0] ?? null

  if (!pitcher) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 min-h-[240px] flex items-center justify-center text-[11px] text-[#8A8577]">
        No starting pitcher confirmed for tonight&apos;s featured game yet.
      </div>
    )
  }

  const { profile } = pitcher

  const handleSelectPitcher = (id: number) => {
    setSelectedId(id)
    const next = pitchers.find(p => p.id === id)
    setSelectedPitches(new Set((next?.profile.arsenal ?? []).map(a => a.pitchType)))
  }

  const togglePitch = (pt: string) => setSelectedPitches(prev => {
    const next = new Set(prev)
    if (next.has(pt)) { if (next.size > 1) next.delete(pt) } else next.add(pt) // always keep at least one pitch shown
    return next
  })

  const shownPitchTypes = profile.arsenal.filter(a => selectedPitches.has(a.pitchType)).map(a => a.pitchType)
  const cellFor = (pitchType: string, balls: number, strikes: number) =>
    profile.runValueByCount.find(b => b.pitchType === pitchType && b.balls === balls && b.strikes === strikes) ?? null

  const countKeys = new Set(COUNT_COLUMNS.map(([b, s]) => `${b}-${s}`))
  const onScreenCells = profile.runValueByCount.filter(b => shownPitchTypes.includes(b.pitchType) && countKeys.has(`${b.balls}-${b.strikes}`))
  const maxOnScreen = metric === 'runsAllowed'
    ? Math.max(0, ...onScreenCells.map(c => c.runsAllowed))
    : metric === 'hitsAllowed'
      ? Math.max(0, ...onScreenCells.map(c => c.hitsAllowed))
      : 0

  // Reader line: the single most notable cell for whichever metric is
  // selected, restricted to what's actually on screen so the sentence
  // never cites a cell the reader can't find in the grid.
  let readerLine: string | null = null
  if (metric === 'runValue') {
    const best = onScreenCells.filter(c => c.strikes === 2).sort((a, b) => a.avgRunValue - b.avgRunValue)[0]
    readerLine = best ? `${pitcher.name}'s ${PITCH_NAMES[best.pitchType] ?? best.pitchType} is a weapon at ${best.balls}-${best.strikes} (${best.avgRunValue.toFixed(2)} runs/pitch).` : null
  } else if (metric === 'hardHit') {
    const worst = [...onScreenCells].filter(c => c.hardHitRate !== null).sort((a, b) => (b.hardHitRate ?? 0) - (a.hardHitRate ?? 0))[0]
    readerLine = worst ? `${pitcher.name}'s ${PITCH_NAMES[worst.pitchType] ?? worst.pitchType} gets hit hard at ${worst.balls}-${worst.strikes} — ${Math.round((worst.hardHitRate ?? 0) * 100)}% hard-hit.` : null
  } else if (metric === 'runsAllowed') {
    const worst = [...onScreenCells].sort((a, b) => b.runsAllowed - a.runsAllowed)[0]
    readerLine = worst && worst.runsAllowed > 0 ? `${pitcher.name} has allowed ${worst.runsAllowed} run${worst.runsAllowed === 1 ? '' : 's'} on his ${PITCH_NAMES[worst.pitchType] ?? worst.pitchType} at ${worst.balls}-${worst.strikes} this season.` : null
  } else {
    const worst = [...onScreenCells].sort((a, b) => b.hitsAllowed - a.hitsAllowed)[0]
    readerLine = worst && worst.hitsAllowed > 0 ? `${pitcher.name} has allowed ${worst.hitsAllowed} hit${worst.hitsAllowed === 1 ? '' : 's'} on his ${PITCH_NAMES[worst.pitchType] ?? worst.pitchType} at ${worst.balls}-${worst.strikes} this season.` : null
  }

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 md:col-span-2 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-start gap-2.5">
          <img
            src={playerHeadshotUrl(pitcher.id, 100)}
            alt=""
            className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm shrink-0"
          />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="text-[13px] font-bold text-[#1A1A1A]">Pitch run-value by count</div>
              <HelpLink stat={metric === 'hardHit' ? 'hard-hit-rate' : metric === 'runsAllowed' ? 'runs-allowed' : metric === 'hitsAllowed' ? 'hits-allowed' : 'run-value'} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <select
                value={pitcher.id}
                onChange={e => handleSelectPitcher(Number(e.target.value))}
                className="text-[10.5px] font-bold border border-[#DEDACE] rounded-md pl-1.5 pr-1 py-0.5 text-[#1A1A1A] bg-white max-w-[170px]"
              >
                <optgroup label="Starting tonight">
                  {pitchers.filter(p => p.opponentAbbr !== null).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.teamAbbr})</option>
                  ))}
                </optgroup>
                <optgroup label="ERA leaders">
                  {pitchers.filter(p => p.opponentAbbr === null).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.teamAbbr})</option>
                  ))}
                </optgroup>
              </select>
              <span className="text-[9.5px] text-[#8A8577]">{pitcher.opponentAbbr ? `vs. ${pitcher.opponentAbbr} — season` : 'season'}</span>
            </div>
            {pitcher.seasonStats && (
              <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap mt-1.5">
                {GENERAL_STAT_ROWS.map(([label, get]) => (
                  <span key={label} className="text-[9.5px] whitespace-nowrap">
                    <span className="font-bold text-[#1A1A1A] tabular-nums">{get(pitcher.seasonStats as PitcherSeasonStats)}</span>{' '}
                    <span className="text-[#8A8577]">{label}</span>
                  </span>
                ))}
              </div>
            )}
            <Link href={`/mlb/players/${pitcher.id}?tab=lab`} className="inline-block text-[9.5px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline mt-1">
              View full pitching lab →
            </Link>
          </div>
        </div>
        {metric === 'runValue' ? (
          <div className="text-[9px] text-[#8A8577] shrink-0 text-right">
            <span style={{ color: BLUE }} className="font-bold">Blue</span> = good for pitcher<br />
            <span style={{ color: RED }} className="font-bold">Red</span> = good for hitter
          </div>
        ) : (
          <div className="text-[9px] text-[#8A8577] shrink-0 text-right">
            Darker <span style={{ color: RED }} className="font-bold">red</span> = more damage against the pitcher
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {HEAT_METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${metric === m.key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A]'}`}
          >
            {m.short}
          </button>
        ))}
        <InfoButton title={HEAT_METRIC_INFO[metric].title}>{HEAT_METRIC_INFO[metric].body}</InfoButton>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[9px] text-[#8A8577] mr-0.5">Arsenal:</span>
        {profile.arsenal.map(a => {
          const active = selectedPitches.has(a.pitchType)
          return (
            <button
              key={a.pitchType}
              onClick={() => togglePitch(a.pitchType)}
              title={`${a.pitchType} — ${a.pctUsage}% usage`}
              className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border transition whitespace-nowrap ${active ? 'bg-white text-[#1A1A1A] border-[#1A1A1A]' : 'text-[#B5B0A3] border-[#DEDACE] hover:border-[#1A1A1A] hover:text-[#8A8577]'}`}
            >
              {PITCH_NAMES[a.pitchType] ?? a.pitchType} <span className="font-normal opacity-70">{a.pctUsage}%</span>
            </button>
          )
        })}
      </div>

      {readerLine && <div className="text-[11px] text-[#1A1A1A] mb-2 italic">&ldquo;{readerLine}&rdquo;</div>}

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-center border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th className="text-left text-[9px] text-[#8A8577] font-normal pl-1">Pitch</th>
              {COUNT_COLUMNS.map(([b, s]) => (
                <th key={`${b}-${s}`} className="text-[9px] text-[#8A8577] font-normal">{b}-{s}</th>
              ))}
              <th className="text-[9px] text-[#8A8577] font-normal border-l-2 border-[#E8E4DC] pl-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {shownPitchTypes.map(pitchType => {
              const pitchBuckets = profile.runValueByCount.filter(b => b.pitchType === pitchType)
              const arsenalEntry = profile.arsenal.find(a => a.pitchType === pitchType)
              const total = pitchMetricTotal(pitchBuckets, metric, arsenalEntry)
              return (
                <tr key={pitchType}>
                  <td className="text-[10.5px] font-bold text-[#1A1A1A] text-left pl-1 whitespace-nowrap" title={pitchType}>{PITCH_NAMES[pitchType] ?? pitchType}</td>
                  {COUNT_COLUMNS.map(([b, s]) => {
                    const cell = cellFor(pitchType, b, s)
                    const styled = heatCellStyle(cell, metric, maxOnScreen)
                    return (
                      <td key={`${b}-${s}`} className="rounded-md" style={{ background: styled.bg, border: cell ? 'none' : '1px dashed #DEDACE' }}>
                        <div
                          className="h-9 w-full flex items-center justify-center text-[9.5px] font-bold"
                          style={{ color: styled.textColor }}
                          title={`${PITCH_NAMES[pitchType] ?? pitchType} at ${b}-${s}: ${styled.tooltip}`}
                        >
                          {styled.display}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border-l-2 border-[#E8E4DC] pl-2">
                    <div
                      className="h-9 w-full flex items-center justify-center text-[9.5px] font-bold text-[#1A1A1A]"
                      title={`${PITCH_NAMES[pitchType] ?? pitchType}, every recorded count this season: ${total.display}${metric === 'runsAllowed' || metric === 'hitsAllowed' ? ` over ${total.pitches} pitches` : ''}`}
                    >
                      {total.display}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {(metric === 'runsAllowed' || metric === 'hitsAllowed') && (() => {
            // Reads off the unfiltered per-pitch-type arsenal totals (see
            // pitchMetricTotal above) rather than summing runValueByCount's
            // buckets — those buckets drop any (pitchType, count) combo
            // thrown fewer than MIN_COUNT_SAMPLE times, which would silently
            // undercount hits/runs that happened on a rare count.
            const allPitchesShown = shownPitchTypes.length === profile.arsenal.length
            const shownArsenal = profile.arsenal.filter(a => shownPitchTypes.includes(a.pitchType))
            const shownTotal = metric === 'runsAllowed'
              ? Math.round(shownArsenal.reduce((s, a) => s + a.runsAllowed, 0) * 10) / 10
              : shownArsenal.reduce((s, a) => s + a.hitsAllowed, 0)
            const official = pitcher.seasonStats ? (metric === 'runsAllowed' ? pitcher.seasonStats.runs : pitcher.seasonStats.hits) : null
            // Hits should reconcile exactly once every arsenal pitch is on
            // screen (no scoring-rule gap like runsAllowed's bequeathed
            // runners). getPitcherStatcastProfile already cross-checks
            // Baseball Savant's per-pitch CSV against MLB's own official
            // game log (by game_pk) and backfills any hit from an outing
            // Savant's public log was missing entirely, straight from
            // MLB's official play-by-play — see hitsBackfill below. A gap
            // that survives THAT is a genuinely unresolved data hole, not
            // something we didn't try to fix.
            const backfill = profile.hitsBackfill
            const gap = metric === 'hitsAllowed' && official !== null ? official - shownTotal : 0
            const flagGap = allPitchesShown && gap !== 0

            return (
              <tfoot>
                <tr>
                  <td className="text-[9.5px] font-bold text-[#8A8577] text-left pl-1 pt-1">All shown pitches</td>
                  {COUNT_COLUMNS.map(([b, s]) => <td key={`${b}-${s}`} />)}
                  <td className="border-l-2 border-[#E8E4DC] pl-2 pt-1">
                    <div className="text-[10.5px] font-bold text-[#1A1A1A] text-center">{shownTotal}</div>
                  </td>
                </tr>
                {official !== null && (
                  <tr>
                    <td className="text-[9.5px] text-left pl-1 pt-0.5" style={{ color: flagGap ? '#B45309' : '#8A8577' }}>
                      Official season total{flagGap ? ' ⚠' : ''}
                    </td>
                    {COUNT_COLUMNS.map(([b, s]) => <td key={`${b}-${s}`} />)}
                    <td className="border-l-2 border-[#E8E4DC] pl-2 pt-0.5">
                      <div className="text-[10.5px] font-bold text-center" style={{ color: flagGap ? '#B45309' : '#8A8577' }}>{official}</div>
                    </td>
                  </tr>
                )}
                {metric === 'hitsAllowed' && backfill.games > 0 && (
                  <tr>
                    <td colSpan={COUNT_COLUMNS.length + 2} className="pl-1 pt-1 text-left">
                      <div className="text-[9px] text-[#5B7B4F] leading-relaxed">
                        Includes {backfill.hits} hit{backfill.hits === 1 ? '' : 's'} recovered from MLB&apos;s official play log across {backfill.games} outing
                        {backfill.games === 1 ? '' : 's'} not yet in Baseball Savant&apos;s own per-pitch log — most often his most recent start, since Savant
                        typically takes a few hours (sometimes until the next day) to publish a game after it ends.
                      </div>
                    </td>
                  </tr>
                )}
                {flagGap && (
                  <tr>
                    <td colSpan={COUNT_COLUMNS.length + 2} className="pl-1 pt-1 text-left">
                      <div className="text-[9px] text-[#B45309] leading-relaxed">
                        Every arsenal pitch is selected — and we&apos;ve already cross-checked MLB&apos;s official game log and backfilled any outing missing from
                        Baseball Savant&apos;s per-pitch CSV{backfill.games > 0 ? ` (${backfill.games} recovered above)` : ''} — but this is still {Math.abs(gap)} hit
                        {Math.abs(gap) === 1 ? '' : 's'} {gap > 0 ? 'short of' : 'over'} his official total. That residual gap is a genuine, unresolved hole in
                        the public data (not something we can backfill further from here), not a bug in how the total above is counted.
                      </div>
                    </td>
                  </tr>
                )}
              </tfoot>
            )
          })()}
        </table>
      </div>

      <div className="text-[9px] text-[#8A8577] mt-2 leading-relaxed">
        {metric === 'runValue' || metric === 'hardHit' ? (
          <>
            Every ball-strike count is shown above — a cell reads <span className="font-bold text-[#1A1A1A]">—</span> when fewer than {MIN_COUNT_SAMPLE} pitches
            were thrown in it (an average over that few pitches is too noisy to trust). The <span className="font-bold text-[#1A1A1A]">Total</span> column
            is the pitch-weighted figure across every count recorded this season, including the ones hidden here for low sample size.
          </>
        ) : metric === 'hitsAllowed' ? (
          <>
            Every ball-strike count is shown above — <span className="font-bold text-[#1A1A1A]">Total</span> sums every count recorded this season. Unlike run
            value and hard-hit%, a hit is an exact fact rather than an average, so a count cell shows its real hit total even at very low sample size — nothing
            is hidden here for noise. Hits are always credited on the pitch that was actually hit, so with every arsenal pitch selected this total should
            reconcile with his <span className="font-bold text-[#1A1A1A]">official season total</span>. Every outing missing from Baseball Savant&apos;s public
            per-pitch log gets automatically cross-checked and backfilled from MLB&apos;s own official play-by-play (noted above when it happens) — if a gap
            still shows up after that, it&apos;s flagged as a genuine, unresolved hole in the public data, not an attribution gap in how this total is built.
          </>
        ) : (
          <>
            Every ball-strike count is shown above — <span className="font-bold text-[#1A1A1A]">Total</span> sums every count recorded this season, across
            pitches he actually threw. It can still run a little under his <span className="font-bold text-[#1A1A1A]">official season total</span> even with
            every arsenal pitch selected: official &quot;runs allowed&quot; also charges a pitcher for <span className="font-bold text-[#1A1A1A]">bequeathed
            runners</span> — runners he left on base who later scored off a reliever&apos;s pitch after he exited the game. Those runs happen on a pitch someone
            else threw, so they can&apos;t show up in his own pitch-by-pitch log. That&apos;s a real scoring rule, not missing data — hits allowed (above) has
            no such gap.
          </>
        )}
      </div>
    </div>
  )
}

const BATTER_STAT_ROWS: [string, (s: BatterSeasonStats) => string][] = [
  ['AVG', s => s.avg],
  ['OBP', s => s.obp],
  ['SLG', s => s.slg],
  ['OPS', s => s.ops],
  ['HR', s => String(s.home_runs)],
  ['RBI', s => String(s.rbi)],
  ['SO', s => String(s.strikeouts)],
]

const MISS_WINDOWS: ['season' | 'last30', string][] = [['season', 'Season'], ['last30', 'Last 30 days']]

type MissTableRow = { label: string; whiffs: number; avgMiss: number | null; avgSwing: number | null }

function MissDistanceCard({ batters }: { batters: BatterMissOption[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(() => batters[0]?.id ?? null)
  const [winKey, setWinKey] = useState<'season' | 'last30'>('season')

  const batter = batters.find(b => b.id === selectedId) ?? batters[0] ?? null

  if (!batter) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex items-center justify-center text-[11px] text-[#8A8577]">
        No batter data yet.
      </div>
    )
  }

  // Per-pitch-type breakdown only exists for the season window (see
  // batter-bat-speed.ts) — Last 30 days always falls back to just the
  // aggregate row rather than a season-long split that wouldn't match the
  // shorter window.
  const toRow = (label: string, w: MissWindow): MissTableRow => ({ label, whiffs: w.whiffs, avgMiss: w.avgMissDistanceIn, avgSwing: w.avgSwingLengthIn })
  const allRow: MissTableRow = winKey === 'season'
    ? toRow('All pitches', batter.profile.missSeason)
    : toRow('All pitches', batter.profile.missLast30)
  const pitchRows: MissTableRow[] = winKey === 'season'
    ? batter.profile.missByPitchSeason
        .map(p => ({ label: PITCH_NAMES[p.pitchType] ?? p.pitchType, whiffs: p.whiffs, avgMiss: p.avgMissDistanceIn, avgSwing: p.avgSwingLengthIn }))
        .sort((a, b) => (b.avgMiss ?? 0) - (a.avgMiss ?? 0))
    : []
  const rows = [allRow, ...pitchRows]

  // Reader-line insight: which pitch he misses by the most, when there's
  // more than one pitch to compare.
  const worstPitch = pitchRows[0] ?? null
  const readerLine = worstPitch && worstPitch.avgMiss !== null
    ? `${batter.name} misses his ${worstPitch.label} by the most — ${worstPitch.avgMiss}″ on average.`
    : null

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
      <div className="flex items-start gap-2.5 mb-2">
        <img src={playerHeadshotUrl(batter.id, 100)} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-sm shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Miss distance</div>
            <HelpLink stat="miss-distance" />
            <InfoButton title="Miss distance" align="left">
              On swinging strikes, how far the bat&apos;s sweet spot was from the ball (inches) — a real Statcast
              bat-tracking metric, averaged across every swing-and-miss in the selected window, broken out by pitch
              type. A bigger number means a hitter isn&apos;t just missing, he&apos;s missing badly — a stronger signal of a
              real timing or recognition problem than whiff rate alone, which only counts that a swing missed, not by
              how much.
            </InfoButton>
          </div>
          <select
            value={batter.id}
            onChange={e => setSelectedId(Number(e.target.value))}
            className="text-[10.5px] font-bold border border-[#DEDACE] rounded-md pl-1.5 pr-1 py-0.5 text-[#1A1A1A] bg-white mt-0.5 max-w-[170px]"
          >
            {batters.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.teamAbbr})</option>
            ))}
          </select>
          {batter.seasonStats && (
            <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1.5">
              {BATTER_STAT_ROWS.map(([label, get]) => (
                <span key={label} className="text-[9px] whitespace-nowrap">
                  <span className="font-bold text-[#1A1A1A] tabular-nums">{get(batter.seasonStats as BatterSeasonStats)}</span>{' '}
                  <span className="text-[#8A8577]">{label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        {MISS_WINDOWS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setWinKey(key)}
            className={`text-[9.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition ${winKey === key ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {readerLine && <div className="text-[10.5px] text-[#1A1A1A] mb-2 italic">&ldquo;{readerLine}&rdquo;</div>}

      <div className="flex-1 rounded-lg bg-white border border-[#E8E4DC] p-2.5 overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC]">
              <th className="pb-1.5 font-bold pr-2">Pitch</th>
              <th className="pb-1.5 font-bold text-right pr-2">Whiffs</th>
              <th className="pb-1.5 font-bold text-right pr-2">Avg miss</th>
              <th className="pb-1.5 font-bold text-right">Avg swing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className={`border-b border-[#F0EFEC] ${r.label === 'All pitches' ? 'font-bold' : ''}`}>
                <td className="py-1.5 pr-2 text-[#1A1A1A] whitespace-nowrap">{r.label}</td>
                <td className="py-1.5 pr-2 text-right text-[#1A1A1A] tabular-nums">{r.whiffs}</td>
                <td className="py-1.5 pr-2 text-right text-[#1A1A1A] tabular-nums">{r.avgMiss !== null ? `${r.avgMiss}″` : '—'}</td>
                <td className="py-1.5 text-right text-[#1A1A1A] tabular-nums">{r.avgSwing !== null ? `${r.avgSwing}″` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
        <div className="text-[9px] text-[#8A8577]">
          {winKey === 'season' ? 'Season' : 'Last 30 days'}
        </div>
        <Link href={`/mlb/players/${batter.id}?tab=lab`} className="text-[9.5px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline">
          View full batting lab →
        </Link>
      </div>
    </div>
  )
}

function BatSpeedCard({ players }: { players: BatSpeedPlayerOption[] }) {
  const [expanded, setExpanded] = useState(false)
  const points = players.filter(b => b.profile.avgBatSpeed !== null && b.profile.xwobaMinusWoba !== null)

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex items-center justify-center text-[11px] text-[#8A8577]">
        No bat-tracking data yet.
      </div>
    )
  }

  const loud = points.reduce((a, b) => ((b.profile.xwobaMinusWoba ?? 0) < (a.profile.xwobaMinusWoba ?? 0) ? b : a))
  const readerLine = loud.profile.xwobaMinusWoba !== null && loud.profile.xwobaMinusWoba > 0.005
    ? null
    : `${loud.name} is swinging fast (${loud.profile.avgBatSpeed} mph) and dying on loud outs — xwOBA trails wOBA by ${Math.abs(loud.profile.xwobaMinusWoba ?? 0).toFixed(3)}.`

  return (
    <>
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 min-h-[240px] flex flex-col transition-colors duration-300 hover:border-[#C9C4B6]">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[13px] font-bold text-[#1A1A1A]">Bat speed vs. production</div>
            <HelpLink stat="bat-speed" />
            <InfoButton title="Bat speed vs. production" align="left">
              xwOBA (expected production, from exit velo/launch angle) minus actual wOBA. Negative means a hitter is
              swinging hard and still coming up empty relative to how well he&apos;s actually hitting the ball — a sign of
              bad luck or a swing that isn&apos;t translating, not necessarily bad process. Expand for the full radar
              breakdown and every qualified player.
            </InfoButton>
          </div>
          <button onClick={() => setExpanded(true)} className="text-[9px] font-bold text-[#FF5722] uppercase tracking-wide hover:underline shrink-0">
            Expand ⤢
          </button>
        </div>
        <div className="text-[10px] text-[#8A8577] mb-2">xwOBA minus wOBA, season</div>

        <div className="flex-1 flex items-center justify-center">
          <BatSpeedScatter players={points} width={260} height={160} />
        </div>
        {readerLine && <div className="text-[10px] text-[#1A1A1A] mt-1 italic">&ldquo;{readerLine}&rdquo;</div>}
      </div>

      {expanded && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpanded(false)}>
            <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-3">
                <div className="text-[15px] font-bold text-[#1A1A1A]">Bat speed vs. production</div>
                <button onClick={() => setExpanded(false)} className="text-[#8A8577] hover:text-[#1A1A1A] text-xl leading-none">&times;</button>
              </div>
              <BatSpeedRadarSection players={players} />
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}

export default function MlbDeepDivesGrid({ data }: { data: MlbDeepDivesData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <AbsChallengeGrid ledger={data.absLedger} inningBreakdown={data.absInningBreakdown} dailyTrendByTeam={data.absDailyTrendByTeam} playerEfficiency={data.absPlayerEfficiency} />
      <ExtraBasesCard rows={data.extraBases} />
      <RunValueHeatCard pitchers={data.pitcherOptions} />
      <MissDistanceCard batters={data.missDistanceBatters} />
      <BatSpeedCard players={data.batSpeedPlayers} />
    </div>
  )
}
