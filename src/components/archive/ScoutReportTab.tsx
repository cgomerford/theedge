'use client'

// src/components/ScoutReportTab.tsx
//
// 2026-08-17: full layout rewrite to match the wireframe — 4-column
// team-grouped grid: [narrow away][narrow home][wide away][wide home],
// collapsing to 2 columns at tablet and a single vertical stack below
// 720px.
//
// 2026-08-17 (later same day): fixed header Avatar calls — they were
// missing the `playerId` prop, so the pitcher headshot never had a chance
// to load and always fell back to the colored-initials circle. Avatar's
// signature already accepted playerId; it just wasn't being passed at
// the call site. No component change needed, only the two call sites
// below.

import { useState, useMemo, useRef } from 'react'
import type { ScoutReport, ScoutRow, PitchDetailPayload } from '@/lib/scout'
import { PitchDetailModal } from './ScoutExpandCharts'
import { playerHeadshotUrl } from '@/lib/mlb'
import PitchLocationCard, { type RichArsenalPitch } from '@/components/PitchLocationCard'
import LineupSprayChart from '@/components/LineupSprayChart'
import type { BatterSpray } from '@/lib/batter-spray'
import TTOFatigueChart from '@/components/TTOFatigueChart'
import TeamHotZoneCard, { type LineupZoneEntry } from '@/components/TeamHotZoneCard'
import BatterStreakBoard, { type StreakWithZones } from '@/components/BatterStreakBoard'
import LiteralStreakNotes from '@/components/LiteralStreakNotes'
import BullpenUsageCard from '@/components/BullpenUsageCard'
import PitcherWorkloadCard from '@/components/PitcherWorkloadCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import ExpandableCard from '@/components/ExpandableCard'
import type { PitchVelocityRange } from '@/lib/pitch-velocity'
import type { BullpenReport } from '@/lib/bullpen-usage'
import type { Last7DaysWorkload } from '@/lib/pitcher-workload'
import FieldingAlignmentDiamond, { type FielderAlignmentEntry } from '@/components/FieldingAlignmentDiamond'
import ABSChallengeCard from '@/components/ABSChallengeCard'
import type { ABSChallengeRecord } from '@/lib/abs-challenges'
import SBTendencyCard from '@/components/SBTendencyCard'
import type { SBTendencyReport } from '@/lib/sb-tendency'
import type { VenueFieldDimensions } from '@/lib/venue-dimensions'
import BallparkWeatherCard from '@/components/BallparkWeatherCard'
import type { GameWeather, RainOutlook } from '@/lib/mlb'
import PitchSequencingSnippet from '@/components/PitchSequencingSnippet'
import type { PitcherCountTendency, PitcherPitchSequencing } from '@/lib/pitcher-sequencing'

type TTOData = {
  tto1_woba: number | null; tto2_woba: number | null; tto3_woba: number | null
  tto1_avg: number | null; tto2_avg: number | null; tto3_avg: number | null
  tto1_pa: number | null; tto2_pa: number | null; tto3_pa: number | null
}
type LiteralBatterStreak = {
  player_id: number
  player_name: string
  on_base_streak: number
  hit_streak: number
  is_hot: boolean
  is_cold: boolean
}

type LiteralPitcherTrend = {
  player_id: number
  player_name: string
  current_scoreless_innings: number
} | null

type TeamTrends = {
  sp_era: number | null
  sp_fip: number | null
  bullpen_era: number | null
  ops_l30: number | null
  risp_avg: number | null
  risp_ops: number | null
}

// L30/L3 genuinely rolling numbers — separate from TeamTrends above,
// which despite the wireframe's original "Rolling Numbers" label is
// mostly season-wide data (SP ERA/FIP, bullpen ERA, and RISP are all
// stats=season under the hood). Bullpen has no rolling QUALITY metric
// anywhere in this codebase — only rolling WORKLOAD (bullpen_ip_last_3,
// already surfaced separately via PitcherWorkloadCard/BullpenUsageCard),
// so it's deliberately not duplicated here as a fake rolling ERA.
type RollingTrends = {
  sp_l3_era: number | null
  runs_per_game_l30: number | null
  ops_l30: number | null
  k_pct_l30: number | null
  bb_pct_l30: number | null
}

type WeatherInfo = {
  temp_f: number | null
  wind_mph: number | null
  wind_dir: string | null
  is_dome: boolean
}

type Props = {
  report: ScoutReport
  isPro: boolean
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  bullpenReport?: BullpenReport | null // deprecated, unused — kept so callers mid-migration don't break; use awayBullpenReport/homeBullpenReport
  awayBullpenReport?: BullpenReport | null
  homeBullpenReport?: BullpenReport | null
  awayWorkload?: Last7DaysWorkload | null
  homeWorkload?: Last7DaysWorkload | null
  homeColor?: string
  awayColor?: string
  homeTeamId?: number | null
  awayTeamId?: number | null

  awayPitcherName?: string
  homePitcherName?: string
  awayPitcherId?: number | null
  homePitcherId?: number | null
  awayPitcherVelocityRanges?: Record<string, PitchVelocityRange>
  homePitcherVelocityRanges?: Record<string, PitchVelocityRange>
  awayPitcherHotZones?: Record<string, PitcherHotZones>
  homePitcherHotZones?: Record<string, PitcherHotZones>
  awayPitcherArsenalZones?: Record<string, PitcherZoneArsenal>
  homePitcherArsenalZones?: Record<string, PitcherZoneArsenal>
  awayPitcherRichArsenal?: RichArsenalPitch[]
  homePitcherRichArsenal?: RichArsenalPitch[]
  awayPitcherTTO?: TTOData | null
  homePitcherTTO?: TTOData | null

  awayTeamTrends?: TeamTrends | null
  homeTeamTrends?: TeamTrends | null
  awayRollingTrends?: RollingTrends | null
  homeRollingTrends?: RollingTrends | null

  awayBatterStreaks?: StreakWithZones[]
  homeBatterStreaks?: StreakWithZones[]

  awayLiteralBatters?: LiteralBatterStreak[]
  homeLiteralBatters?: LiteralBatterStreak[]
  awayPitcherTrend?: LiteralPitcherTrend
  homePitcherTrend?: LiteralPitcherTrend

  awayLineupZones?: LineupZoneEntry[]
  homeLineupZones?: LineupZoneEntry[]
  awayPitcherThrows?: 'L' | 'R'
  homePitcherThrows?: 'L' | 'R'

  awayLineupSpray?: BatterSpray[]
  homeLineupSpray?: BatterSpray[]
  awayLineupSize?: number
  homeLineupSize?: number

  awayFieldingAlignment?: FielderAlignmentEntry[]
  homeFieldingAlignment?: FielderAlignmentEntry[]

  awayABSRecord?: ABSChallengeRecord | null
  homeABSRecord?: ABSChallengeRecord | null
  awaySBTendency?: SBTendencyReport | null
  homeSBTendency?: SBTendencyReport | null
venueDimensions?: VenueFieldDimensions | null
  ballparkWeather?: GameWeather | null
  windImpact?: string | null
  rainOutlook?: RainOutlook | null
  isIndoorVenue?: boolean
  awayCountTendency?: Record<string, PitcherCountTendency>
  homeCountTendency?: Record<string, PitcherCountTendency>
  awaySequencing?: Record<string, PitcherPitchSequencing>
  homeSequencing?: Record<string, PitcherPitchSequencing>

  weather?: WeatherInfo | null
  venueName?: string | null
}

function HighlightedLine({ line, highlight }: { line: string; highlight?: string }) {
  if (!highlight) return <>{line}</>
  const idx = line.toLowerCase().indexOf(highlight.toLowerCase())
  if (idx === -1) return <>{line}</>
  return (
    <>
      {line.slice(0, idx)}
      <strong className="font-bold text-stone-900 bg-amber-100/80 px-1">
        {line.slice(idx, idx + highlight.length)}
      </strong>
      {line.slice(idx + highlight.length)}
    </>
  )
}

function TeamLogo({ teamId, abbr, color, size = 48 }: {
  teamId?: number | null
  abbr: string
  color: string
  size?: number
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const px = `${size}px`
  if (teamId && !imgFailed) {
    return (
      <img
        src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
        alt={abbr}
        onError={() => setImgFailed(true)}
        style={{ width: px, height: px }}
        className="object-contain flex-shrink-0 drop-shadow-sm"
      />
    )
  }
  return (
    <div
      style={{ width: px, height: px, background: color }}
      className="rounded-xl flex items-center justify-center font-mono text-sm font-bold text-white flex-shrink-0 shadow-sm"
    >
      {abbr}
    </div>
  )
}

function Avatar({ playerId, initials, bgColor, textColor, size = 32 }: {
  playerId?: number | null
  initials: string
  bgColor: string
  textColor: string
  size?: number
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const px = `${size}px`
  if (playerId && !imgFailed) {
    return (
      <img
        src={playerHeadshotUrl(playerId, 60)}
        alt={initials}
        onError={() => setImgFailed(true)}
        style={{ width: px, height: px }}
        className="rounded-full object-cover border border-stone-200 flex-shrink-0 bg-white"
      />
    )
  }
  return (
    <div
      style={{ width: px, height: px, background: bgColor, color: textColor }}
      className="rounded-full flex items-center justify-center font-mono text-[10px] font-bold flex-shrink-0 border border-stone-200"
    >
      {initials}
    </div>
  )
}

function NotesCard({ title, teamAbbr, teamColor, teamId, rows, emptyLabel }: {
  title: string
  teamAbbr: string
  teamColor: string
  teamId?: number | null
  rows: ScoutRow[]
  emptyLabel: string
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col w-full" style={{ borderLeft: `3px solid ${teamColor}` }}>
      <div
        className="px-3 py-2 border-b border-stone-100 flex items-center gap-2"
        style={{ background: `linear-gradient(135deg, ${teamColor}12, transparent 70%)` }}
      >
        <TeamLogo teamId={teamId} abbr={teamAbbr} color={teamColor} size={18} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500 truncate">{title}</span>
      </div>
      <div className="flex-1">
        {rows.length > 0 ? (
          rows.map((r) => (
            <div key={r.id} className="px-3 py-2 flex items-start gap-2 border-b border-stone-50 last:border-0">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: teamColor }} />
              <p className="text-[11.5px] text-stone-700 leading-snug">
                <HighlightedLine line={r.line} highlight={r.highlight} />
              </p>
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">{emptyLabel}</div>
        )}
      </div>
    </div>
  )
}

// ── Team Rolling Numbers card ─────────────────────────────────────────────
function TeamTrendsCard({ teamAbbr, teamName, teamId, color, trends }: {
  teamAbbr: string; teamName: string; teamId?: number | null; color: string; trends?: TeamTrends | null
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'SP ERA', value: trends?.sp_era != null ? trends.sp_era.toFixed(2) : '—' },
    { label: 'SP FIP', value: trends?.sp_fip != null ? trends.sp_fip.toFixed(2) : '—' },
    { label: 'Bullpen ERA', value: trends?.bullpen_era != null ? trends.bullpen_era.toFixed(2) : '—' },
    { label: 'OPS (L30)', value: trends?.ops_l30 != null ? trends.ops_l30.toFixed(3) : '—' },
  ]
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}>
        <TeamLogo teamId={teamId} abbr={teamAbbr} color={color} size={18} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamName} · Season numbers</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {rows.map(r => (
          <div key={r.label} className="bg-stone-50 rounded-lg px-2.5 py-2">
            <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">{r.label}</p>
            <p className="font-mono text-sm font-bold text-stone-900">{r.value}</p>
          </div>
        ))}
        <div className="bg-stone-50 rounded-lg px-2.5 py-2 col-span-2">
          <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">RISP (AVG / OPS)</p>
          {trends?.risp_avg != null || trends?.risp_ops != null ? (
            <p className="font-mono text-sm font-bold text-stone-900">
              {trends?.risp_avg != null ? trends.risp_avg.toFixed(3) : '—'}
              {' / '}
              {trends?.risp_ops != null ? trends.risp_ops.toFixed(3) : '—'}
            </p>
          ) : (
            <p className="font-serif italic text-xs text-stone-400 mt-0.5">Not yet available</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Team Rolling Numbers card — L30/L3, genuinely rolling ────────────────
function TeamRollingCard({ teamAbbr, teamName, teamId, color, trends }: {
  teamAbbr: string; teamName: string; teamId?: number | null; color: string; trends?: RollingTrends | null
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'SP ERA (L3)', value: trends?.sp_l3_era != null ? trends.sp_l3_era.toFixed(2) : '—' },
    { label: 'Runs/G (L30)', value: trends?.runs_per_game_l30 != null ? trends.runs_per_game_l30.toFixed(2) : '—' },
    { label: 'OPS (L30)', value: trends?.ops_l30 != null ? trends.ops_l30.toFixed(3) : '—' },
    { label: 'K% (L30)', value: trends?.k_pct_l30 != null ? `${(trends.k_pct_l30 * 100).toFixed(1)}%` : '—' },
    { label: 'BB% (L30)', value: trends?.bb_pct_l30 != null ? `${(trends.bb_pct_l30 * 100).toFixed(1)}%` : '—' },
  ]
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}>
        <TeamLogo teamId={teamId} abbr={teamAbbr} color={color} size={18} />
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{teamName} · Rolling (L30 / L3)</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {rows.map(r => (
          <div key={r.label} className="bg-stone-50 rounded-lg px-2.5 py-2">
            <p className="font-mono text-[8px] uppercase tracking-wider text-stone-400">{r.label}</p>
            <p className="font-mono text-sm font-bold text-stone-900">{r.value}</p>
          </div>
        ))}
      </div>
      <p className="px-3 pb-2.5 text-[8px] font-mono text-stone-400">
        Bullpen has no rolling quality metric yet — see workload cards below for recent usage.
      </p>
    </div>
  )
}

// ── Shared empty-state card for not-yet-built pipelines ───────────────────
function ComingSoonCard({ label, note, color }: { label: string; note: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-stone-300 overflow-hidden" style={{ borderTop: `3px solid ${color}66` }}>
      <div className="px-3 py-2 border-b border-dashed border-stone-200">
        <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{label}</span>
      </div>
      <div className="px-3 py-5 text-center">
        <p className="font-serif italic text-xs text-stone-400">{note}</p>
      </div>
    </div>
  )
}

// ── Topic-section wrapper + pro-gating ────────────────────────────────────
// Same locked-teaser language already established in EdgeIndicator.tsx's
// FactorBar ("⊕ Pro — full drill-down" + one-line teaser + Unlock → to
// /pricing) — reused here instead of inventing a second pattern.
function ReportSection({ title, locked, teaser, children }: {
  title: string; locked?: boolean; teaser?: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">§ {title}</p>
        {locked && <span className="font-mono text-[8px] uppercase tracking-widest text-stone-300">⊕ Pro</span>}
      </div>
      {locked ? <ProLockedCard label={title} teaser={teaser ?? 'More detail with Pro.'} /> : children}
    </div>
  )
}

function ProLockedCard({ label, teaser }: { label: string; teaser: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 font-bold mb-1">⊕ Pro — {label.toLowerCase()}</div>
          <p className="text-[11px] text-stone-500">{teaser}</p>
        </div>
        <a href="/pricing" className="shrink-0 text-[10px] font-mono font-bold px-3 py-1.5 bg-[#1A1A1A] text-[#FDE047] rounded-md hover:bg-stone-800 transition">
          Unlock →
        </a>
      </div>
    </div>
  )
}

// ── Funnel link to the full Pitching/Batting Lab ──────────────────────────
function LabFunnelLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-orange-600 hover:text-orange-700 transition">
      {label} →
    </a>
  )
}



export default function ScoutReportTab({
  report,
  isPro,
  homeAbbr, awayAbbr, homeName, awayName,
  awayBullpenReport = null, homeBullpenReport = null,
  awayWorkload = null, homeWorkload = null,
  homeColor = '#1A1A1A', awayColor = '#FF5722',
  homeTeamId, awayTeamId,
  awayPitcherName = 'TBD', homePitcherName = 'TBD',
  awayPitcherId = null, homePitcherId = null,
  awayPitcherHotZones = {}, homePitcherHotZones = {},
  awayPitcherArsenalZones = {}, homePitcherArsenalZones = {},
  awayPitcherRichArsenal = [], homePitcherRichArsenal = [],
  awayPitcherTTO = null, homePitcherTTO = null,
  awayTeamTrends = null, homeTeamTrends = null,
  awayRollingTrends = null, homeRollingTrends = null,
  awayBatterStreaks = [], homeBatterStreaks = [],
  awayLiteralBatters = [], homeLiteralBatters = [],
  awayPitcherTrend = null, homePitcherTrend = null,
  awayLineupZones = [], homeLineupZones = [],
  awayPitcherThrows = 'R', homePitcherThrows = 'R',
  awayLineupSpray = [], homeLineupSpray = [],
  awayLineupSize = 0, homeLineupSize = 0,
  awayFieldingAlignment = [], homeFieldingAlignment = [],
  awayABSRecord = null, homeABSRecord = null,
  awaySBTendency = null, homeSBTendency = null,
venueDimensions = null,
  ballparkWeather = null, windImpact = null, rainOutlook = null, isIndoorVenue = false,
  awayCountTendency = {}, homeCountTendency = {}, awaySequencing = {}, homeSequencing = {},
  weather = null, venueName = null,
}: Props) {
  const [isExporting, setIsExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const handleDownloadPng = async () => {
    if (!reportRef.current || isExporting) return
    setIsExporting(true)
    try {
      let dataUrl = ''
      try {
        const { toPng } = await import('html-to-image')
        dataUrl = await toPng(reportRef.current, { cacheBust: true, backgroundColor: '#ffffff', pixelRatio: 2 })
      } catch {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(reportRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
        dataUrl = canvas.toDataURL('image/png')
      }
      const link = document.createElement('a')
      link.download = `scout-report-${awayAbbr}-vs-${homeAbbr}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Failed to export scout report as PNG:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const isAwayRow = (r: ScoutRow) =>
    r.leanLabel.startsWith(awayAbbr) || r.leanLabel.includes(`${awayAbbr} —`) || r.leanLabel.includes(`${awayAbbr} +`)
  const isHomeRow = (r: ScoutRow) =>
    r.leanLabel.startsWith(homeAbbr) || r.leanLabel.includes(`${homeAbbr} —`) || r.leanLabel.includes(`${homeAbbr} +`)

  const awayKeyNotes = useMemo(
    () => [...report.rows].filter(r => r.section !== 'situation' && r.section !== 'moves' && isAwayRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, awayAbbr],
  )
  const homeKeyNotes = useMemo(
    () => [...report.rows].filter(r => r.section !== 'situation' && r.section !== 'moves' && isHomeRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, homeAbbr],
  )
 const contextNotes = useMemo(
    () => [...report.rows].filter(r => r.section === 'moves').sort((a, b) => b.weight - a.weight),
    [report.rows],
  )

  if (report.actualCount === 0) {
    return (
      <div className="p-8 text-center text-stone-500 text-sm">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Scouting report</p>
        Scouting data not yet available for this matchup.
      </div>
    )
  }

  return (
    <>
      <style>{`
        /* Topic-section 2-column away/home comparison — replaces the old
           4-column team-grouped grid (scout-top-grid) now that content is
           organized by topic (pitching/batting/bullpen/defense/situational)
           instead of by team column. */
        .scout-section-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: start;
        }
        .scout-section-grid > div { min-width: 0; }
        @media (max-width: 900px) {
          .scout-section-grid { grid-template-columns: 1fr; }
        }
        .scout-stack { display: flex; flex-direction: column; gap: 16px; }
      `}</style>

      <div ref={reportRef} className="flex flex-col gap-6 w-full max-w-full pb-12 px-3 sm:px-0 bg-stone-50/50 p-2 rounded-xl overflow-hidden" style={{ maxWidth: 1800, marginInline: 'auto' }}>

        {/* Header */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-stone-100">
            <div className="w-24" />
            <h2 className="text-stone-400 font-mono text-[10px] uppercase tracking-widest text-center">
              Scouting Report
            </h2>
            {isPro ? (
              <button
                onClick={handleDownloadPng}
                disabled={isExporting}
                className="px-2.5 py-1 text-xs font-mono rounded bg-stone-100 hover:bg-stone-200 text-stone-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExporting ? 'Generating...' : 'Share image'}
              </button>
            ) : (
              <a
                href="/pricing"
                className="px-2.5 py-1 text-xs font-mono rounded bg-[#1A1A1A] text-[#FDE047] hover:bg-stone-800 transition flex items-center gap-1.5"
              >
                ⊕ Share image
              </a>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-5 pt-3">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamLogo teamId={awayTeamId} abbr={awayAbbr} color={awayColor} size={52} />
              <div className="text-center min-w-0">
                <div className="leading-none text-stone-900 truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem' }}>
                  {awayName}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Avatar playerId={awayPitcherId} initials={awayAbbr} bgColor={`${awayColor}18`} textColor={awayColor} size={40} />
                  <div className="text-left min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400">SP</p>
                    <p className="font-serif text-sm font-semibold text-stone-800 truncate leading-tight">{awayPitcherName}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center shrink-0 px-2">
              <span className="text-stone-300 leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}>VS</span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamLogo teamId={homeTeamId} abbr={homeAbbr} color={homeColor} size={52} />
              <div className="text-center min-w-0">
                <div className="leading-none text-stone-900 truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem' }}>
                  {homeName}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Avatar playerId={homePitcherId} initials={homeAbbr} bgColor={`${homeColor}18`} textColor={homeColor} size={40} />
                  <div className="text-left min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400">SP</p>
                    <p className="font-serif text-sm font-semibold text-stone-800 truncate leading-tight">{homePitcherName}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* § Team Snapshot — free: season-standard numbers (ERA/FIP/OPS/RISP) */}
        <ReportSection title="Team Snapshot">
          <div className="scout-section-grid">
            <TeamTrendsCard teamAbbr={awayAbbr} teamName={awayName} teamId={awayTeamId} color={awayColor} trends={awayTeamTrends} />
            <TeamTrendsCard teamAbbr={homeAbbr} teamName={homeName} teamId={homeTeamId} color={homeColor} trends={homeTeamTrends} />
          </div>
        </ReportSection>

        {/* § Recent Form — pro: rolling L30/L3 */}
        <ReportSection title="Recent Form" locked={!isPro} teaser="Rolling L30/L3 form — SP L3 ERA, Runs/G, OPS, K%/BB% trending now, not just the season line.">
          <div className="scout-section-grid">
            <TeamRollingCard teamAbbr={awayAbbr} teamName={awayName} teamId={awayTeamId} color={awayColor} trends={awayRollingTrends} />
            <TeamRollingCard teamAbbr={homeAbbr} teamName={homeName} teamId={homeTeamId} color={homeColor} trends={homeRollingTrends} />
          </div>
        </ReportSection>

        {/* § Starting Pitching — pro: arsenal, locations, TTO fatigue, sequencing */}
        <ReportSection title="Starting Pitching" locked={!isPro} teaser="Full pitch arsenal + locations, times-through-the-order fatigue, and count-by-count sequencing for both starters.">
          <div className="mb-2">
            <LabFunnelLink href={awayPitcherId ? `/mlb/pitching-lab/${awayPitcherId}` : '/mlb/pitching-lab'} label={`See ${awayPitcherName} in Pitching Lab`} />
            <span className="text-stone-300 mx-2">·</span>
            <LabFunnelLink href={homePitcherId ? `/mlb/pitching-lab/${homePitcherId}` : '/mlb/pitching-lab'} label={`See ${homePitcherName} in Pitching Lab`} />
          </div>
          <div className="scout-section-grid">
            <div className="scout-stack">
              <ExpandableCard label={`${awayPitcherName} pitch arsenal & locations`}>
                <PitchLocationCard
                  pitcherName={awayPitcherName} abbr={awayAbbr} color={awayColor}
                  hotZones={awayPitcherHotZones} arsenal={awayPitcherArsenalZones}
                  richArsenal={awayPitcherRichArsenal}
                />
              </ExpandableCard>
              <ExpandableCard label={`${awayPitcherName} times through order`}>
                <TTOFatigueChart pitcherName={awayPitcherName} abbr={awayAbbr} tto={awayPitcherTTO} />
              </ExpandableCard>
              <PitchSequencingSnippet
                pitcherName={awayPitcherName} abbr={awayAbbr} color={awayColor} side="away"
                countTendency={awayCountTendency} sequencing={awaySequencing}
              />
            </div>
            <div className="scout-stack">
              <ExpandableCard label={`${homePitcherName} pitch arsenal & locations`}>
                <PitchLocationCard
                  pitcherName={homePitcherName} abbr={homeAbbr} color={homeColor}
                  hotZones={homePitcherHotZones} arsenal={homePitcherArsenalZones}
                  richArsenal={homePitcherRichArsenal}
                />
              </ExpandableCard>
              <ExpandableCard label={`${homePitcherName} times through order`}>
                <TTOFatigueChart pitcherName={homePitcherName} abbr={homeAbbr} tto={homePitcherTTO} />
              </ExpandableCard>
              <PitchSequencingSnippet
                pitcherName={homePitcherName} abbr={homeAbbr} color={homeColor} side="home"
                countTendency={homeCountTendency} sequencing={homeSequencing}
              />
            </div>
          </div>
        </ReportSection>

        {/* § Batting & Lineups — pro: hot zones, spray, streaks */}
        <ReportSection title="Batting & Lineups" locked={!isPro} teaser="Lineup hot zones vs tonight's starter, spray charts, and who's hot/cold right now.">
          <div className="mb-2">
            <LabFunnelLink href="/mlb/batting-lab" label={`${awayAbbr} lineup in Batting Lab`} />
            <span className="text-stone-300 mx-2">·</span>
            <LabFunnelLink href="/mlb/batting-lab" label={`${homeAbbr} lineup in Batting Lab`} />
          </div>
          <div className="scout-section-grid">
            <div className="scout-stack">
              <ExpandableCard label={`${awayAbbr} lineup hot zones vs ${homePitcherThrows}HP`}>
                <TeamHotZoneCard teamAbbr={awayAbbr} teamName={awayName} color={awayColor} entries={awayLineupZones} opposingThrows={homePitcherThrows} />
              </ExpandableCard>
              <LineupSprayChart teamAbbr={awayAbbr} teamName={awayName} color={awayColor} batters={awayLineupSpray} lineupSize={awayLineupSize} venueDimensions={venueDimensions} playerNames={Object.fromEntries(awayLineupZones.map(e => [e.playerId, e.playerName]))} />
              <BatterStreakBoard teamAbbr={awayAbbr} teamName={awayName} color={awayColor} streaks={awayBatterStreaks} />
              <LiteralStreakNotes teamAbbr={awayAbbr} color={awayColor} batters={awayLiteralBatters} pitcher={awayPitcherTrend} />
            </div>
            <div className="scout-stack">
              <ExpandableCard label={`${homeAbbr} lineup hot zones vs ${awayPitcherThrows}HP`}>
                <TeamHotZoneCard teamAbbr={homeAbbr} teamName={homeName} color={homeColor} entries={homeLineupZones} opposingThrows={awayPitcherThrows} />
              </ExpandableCard>
              <LineupSprayChart teamAbbr={homeAbbr} teamName={homeName} color={homeColor} batters={homeLineupSpray} lineupSize={homeLineupSize} venueDimensions={venueDimensions} playerNames={Object.fromEntries(homeLineupZones.map(e => [e.playerId, e.playerName]))} />
              <BatterStreakBoard teamAbbr={homeAbbr} teamName={homeName} color={homeColor} streaks={homeBatterStreaks} />
              <LiteralStreakNotes teamAbbr={homeAbbr} color={homeColor} batters={homeLiteralBatters} pitcher={homePitcherTrend} />
            </div>
          </div>
        </ReportSection>

        {/* § Bullpen — free: workload + arm-by-arm usage */}
        <ReportSection title="Bullpen">
          <div className="scout-section-grid">
            <div className="scout-stack">
              {awayWorkload && <PitcherWorkloadCard workload={awayWorkload} bullpenReport={awayBullpenReport} teamColor={awayColor} teamAbbr={awayAbbr} />}
              {awayBullpenReport && (
                <BullpenUsageCard relievers={awayBullpenReport.relievers} teamColor={awayColor} gamesSampled={awayBullpenReport.gamesSampled} awayColor={awayColor} homeColor={homeColor} />
              )}
            </div>
            <div className="scout-stack">
              {homeWorkload && <PitcherWorkloadCard workload={homeWorkload} bullpenReport={homeBullpenReport} teamColor={homeColor} teamAbbr={homeAbbr} />}
              {homeBullpenReport && (
                <BullpenUsageCard relievers={homeBullpenReport.relievers} teamColor={homeColor} gamesSampled={homeBullpenReport.gamesSampled} awayColor={awayColor} homeColor={homeColor} />
              )}
            </div>
          </div>
        </ReportSection>

        {/* § Defense — pro: fielding alignment */}
        <ReportSection title="Defense" locked={!isPro} teaser="Real projected fielding alignment for both defenses tonight.">
          <div className="scout-section-grid">
            <ExpandableCard label={`${awayAbbr} fielding alignment`}>
              <FieldingAlignmentDiamond teamAbbr={awayAbbr} teamName={awayName} teamColor={awayColor} fielders={awayFieldingAlignment} />
            </ExpandableCard>
            <ExpandableCard label={`${homeAbbr} fielding alignment`}>
              <FieldingAlignmentDiamond teamAbbr={homeAbbr} teamName={homeName} teamColor={homeColor} fielders={homeFieldingAlignment} />
            </ExpandableCard>
          </div>
        </ReportSection>

        {/* § Situational — pro: ABS challenges, SB tendency */}
        <ReportSection title="Situational" locked={!isPro} teaser="ABS challenge record and stolen-base tendency for both teams.">
          <div className="scout-section-grid">
            <div className="scout-stack">
              <ABSChallengeCard teamAbbr={awayAbbr} color={awayColor} record={awayABSRecord} />
              <SBTendencyCard teamAbbr={awayAbbr} color={awayColor} report={awaySBTendency} />
            </div>
            <div className="scout-stack">
              <ABSChallengeCard teamAbbr={homeAbbr} color={homeColor} record={homeABSRecord} />
              <SBTendencyCard teamAbbr={homeAbbr} color={homeColor} report={homeSBTendency} />
            </div>
          </div>
        </ReportSection>

        {/* § Ballpark & Weather — free */}
        <ReportSection title="Ballpark & Weather">
          <div className="max-w-md">
            <BallparkWeatherCard venueName={venueName} isIndoor={isIndoorVenue} weather={ballparkWeather} windImpact={windImpact} rainOutlook={rainOutlook} />
          </div>
        </ReportSection>

        {/* § Key Notes — free */}
        <ReportSection title="Key Notes">
          <div className="scout-section-grid">
            <NotesCard title={`${awayAbbr} · key notes`} teamAbbr={awayAbbr} teamColor={awayColor} teamId={awayTeamId} rows={awayKeyNotes} emptyLabel="No notable edges" />
            <NotesCard title={`${homeAbbr} · key notes`} teamAbbr={homeAbbr} teamColor={homeColor} teamId={homeTeamId} rows={homeKeyNotes} emptyLabel="No notable edges" />
          </div>
        </ReportSection>

        {/* Roster moves */}
        <div>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: '3px solid #FF5722' }}>
            <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
<span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Roster moves</span>            </div>
            <div>
              {contextNotes.length > 0 ? (
                contextNotes.map(r => (
                  <div key={r.id} className="px-3 py-2.5 border-b border-stone-50 last:border-0">
                    <p className="text-[11.5px] text-stone-700 leading-snug">
                      <HighlightedLine line={r.line} highlight={r.highlight} />
                    </p>
                  </div>
                ))
              ) : (
<div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">No roster moves affecting tonight's game</div>              )}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}