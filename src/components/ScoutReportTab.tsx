'use client'

// src/components/ScoutReportTab.tsx

import { useState, useMemo, useRef } from 'react'
import type { ScoutReport, ScoutRow, PitchDetailPayload } from '@/lib/scout'
import type { UmpireSeasonProfile } from '@/lib/umpire-scouting'
import UmpireScoutingCard from './UmpireScoutingCard'
import { ScoutExpandChart, PitchDetailModal } from './ScoutExpandCharts'
import { playerHeadshotUrl } from '@/lib/mlb'
import PitchLocationCard from './PitchLocationCard'
import LineupSprayChart from './LineupSprayChart'
import type { BatterSpray } from '@/lib/batter-spray'
import TTOFatigueChart from './TTOFatigueChart'
import TeamHotZoneCard, { type LineupZoneEntry } from './TeamHotZoneCard'
import BatterStreakBoard, { type StreakWithZones } from './BatterStreakBoard'
import LiteralStreakNotes from './LiteralStreakNotes'
import BullpenUsageCard from './BullpenUsageCard'
import PitcherWorkloadCard from './PitcherWorkloadCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import ExpandableCard from '@/components/ExpandableCard'
import type { PitchVelocityRange } from '@/lib/pitch-velocity'
import type { BullpenReport } from '@/lib/bullpen-usage'
import type { Last7DaysWorkload } from '@/lib/pitcher-workload'

type TTOData = {
  tto1_woba: number | null; tto2_woba: number | null; tto3_woba: number | null
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

type Props = {
  report: ScoutReport
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  bullpenReport?: BullpenReport | null
  awayWorkload?: Last7DaysWorkload | null
  homeWorkload?: Last7DaysWorkload | null
  umpireName?: string | null
  umpireProfile?: UmpireSeasonProfile | null
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
  awayPitcherTTO?: TTOData | null
  homePitcherTTO?: TTOData | null

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

export default function ScoutReportTab({
  report,
  homeAbbr, awayAbbr, homeName, awayName,
  bullpenReport = null,
  awayWorkload = null,
  homeWorkload = null,
  umpireName = null, umpireProfile = null,
  homeColor = '#1A1A1A', awayColor = '#FF5722',
  homeTeamId, awayTeamId,
  awayPitcherName = 'TBD', homePitcherName = 'TBD',
  awayPitcherId = null, homePitcherId = null,
  awayPitcherVelocityRanges = {}, homePitcherVelocityRanges = {},
  awayPitcherHotZones = {}, homePitcherHotZones = {},
  awayPitcherArsenalZones = {}, homePitcherArsenalZones = {},
  awayPitcherTTO = null, homePitcherTTO = null,
  awayBatterStreaks = [], homeBatterStreaks = [],
  awayLiteralBatters = [], homeLiteralBatters = [],
  awayPitcherTrend = null, homePitcherTrend = null,
  awayLineupZones = [], homeLineupZones = [],
  awayPitcherThrows = 'R', homePitcherThrows = 'R',
  awayLineupSpray = [], homeLineupSpray = [],
  awayLineupSize = 0, homeLineupSize = 0,
}: Props) {
  const [pitchModal, setPitchModal] = useState<PitchDetailPayload | null>(null)
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

  const awayPitchingNotes = useMemo(
    () => [...report.rows].filter(r => r.section === 'pitching' && isAwayRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, awayAbbr],
  )
  const homePitchingNotes = useMemo(
    () => [...report.rows].filter(r => r.section === 'pitching' && isHomeRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, homeAbbr],
  )

  const awayKeyNotes = useMemo(
    () => [...report.rows].filter(r => r.section !== 'situation' && r.section !== 'moves' && isAwayRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, awayAbbr],
  )
  const homeKeyNotes = useMemo(
    () => [...report.rows].filter(r => r.section !== 'situation' && r.section !== 'moves' && isHomeRow(r)).sort((a, b) => b.weight - a.weight).slice(0, 4),
    [report.rows, homeAbbr],
  )
  const contextNotes = useMemo(
    () => [...report.rows].filter(r => r.section === 'situation' || r.section === 'moves').sort((a, b) => b.weight - a.weight),
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
        .scout-grid { display: grid; gap: 20px; grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,320px); }
        .scout-grid > div { min-width: 0; }
        @media (max-width: 1200px) { .scout-grid { grid-template-columns: 1fr 1fr; } .scout-grid > .scout-col-notes { grid-column: 1 / -1; } }
        @media (max-width: 720px) { .scout-grid { grid-template-columns: 1fr; } .scout-grid > div { grid-column: 1 / -1 !important; } }
      `}</style>

      <div ref={reportRef} className="flex flex-col gap-5 w-full max-w-full pb-12 px-3 sm:px-0 bg-stone-50/50 p-2 rounded-xl overflow-hidden" style={{ maxWidth: 1320, marginInline: 'auto' }}>

        {/* Header */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-stone-100">
            <div className="w-24" />
            <h2 className="text-stone-400 font-mono text-[10px] uppercase tracking-widest text-center">
              Scouting Report
            </h2>
            <button
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="px-2.5 py-1 text-xs font-mono rounded bg-stone-100 hover:bg-stone-200 text-stone-700 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isExporting ? 'Generating...' : 'Export PNG'}
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-5 pt-3">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <TeamLogo teamId={awayTeamId} abbr={awayAbbr} color={awayColor} size={52} />
              <div className="text-center min-w-0">
                <div className="leading-none text-stone-900 truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem' }}>
                  {awayName}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Avatar initials={awayAbbr} bgColor={`${awayColor}18`} textColor={awayColor} size={40} />
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
                  <Avatar initials={homeAbbr} bgColor={`${homeColor}18`} textColor={homeColor} size={40} />
                  <div className="text-left min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-stone-400">SP</p>
                    <p className="font-serif text-sm font-semibold text-stone-800 truncate leading-tight">{homePitcherName}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Columns */}
        <div className="scout-grid">

          {/* LEFT: Pitchers */}
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Pitchers</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ExpandableCard label={`${awayPitcherName} pitch locations`}>
               <PitchLocationCard pitcherName={awayPitcherName} abbr={awayAbbr} color={awayColor} hotZones={awayPitcherHotZones} arsenal={awayPitcherArsenalZones} />
              </ExpandableCard>
              <ExpandableCard label={`${homePitcherName} pitch locations`}>
                <PitchLocationCard pitcherName={homePitcherName} abbr={homeAbbr} color={homeColor} hotZones={homePitcherHotZones} arsenal={homePitcherArsenalZones} />
              </ExpandableCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ExpandableCard label={`${awayPitcherName} times through order`}>
                <TTOFatigueChart pitcherName={awayPitcherName} abbr={awayAbbr} tto={awayPitcherTTO} />
              </ExpandableCard>
              <ExpandableCard label={`${homePitcherName} times through order`}>
                <TTOFatigueChart pitcherName={homePitcherName} abbr={homeAbbr} tto={homePitcherTTO} />
              </ExpandableCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NotesCard title={`${awayAbbr} pitching`} teamAbbr={awayAbbr} teamColor={awayColor} teamId={awayTeamId} rows={awayPitchingNotes} emptyLabel="No notes" />
              <NotesCard title={`${homeAbbr} pitching`} teamAbbr={homeAbbr} teamColor={homeColor} teamId={homeTeamId} rows={homePitchingNotes} emptyLabel="No notes" />
            </div>
          </div>

          {/* MIDDLE: Batting */}
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Batting</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ExpandableCard label={`${awayAbbr} spray chart`}>
                <LineupSprayChart teamAbbr={awayAbbr} teamName={awayName} color={awayColor} batters={awayLineupSpray} lineupSize={awayLineupSize} />
              </ExpandableCard>
              <ExpandableCard label={`${homeAbbr} spray chart`}>
                <LineupSprayChart teamAbbr={homeAbbr} teamName={homeName} color={homeColor} batters={homeLineupSpray} lineupSize={homeLineupSize} />
              </ExpandableCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ExpandableCard label={`${awayAbbr} lineup hot zones`}>
                <TeamHotZoneCard teamAbbr={awayAbbr} teamName={awayName} color={awayColor} entries={awayLineupZones} opposingThrows={homePitcherThrows} />
              </ExpandableCard>
              <ExpandableCard label={`${homeAbbr} lineup hot zones`}>
                <TeamHotZoneCard teamAbbr={homeAbbr} teamName={homeName} color={homeColor} entries={homeLineupZones} opposingThrows={awayPitcherThrows} />
              </ExpandableCard>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <BatterStreakBoard teamAbbr={awayAbbr} teamName={awayName} color={awayColor} streaks={awayBatterStreaks} />
              <BatterStreakBoard teamAbbr={homeAbbr} teamName={homeName} color={homeColor} streaks={homeBatterStreaks} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <LiteralStreakNotes teamAbbr={awayAbbr} color={awayColor} batters={awayLiteralBatters} pitcher={awayPitcherTrend} />
              <LiteralStreakNotes teamAbbr={homeAbbr} color={homeColor} batters={homeLiteralBatters} pitcher={homePitcherTrend} />
            </div>
          </div>

          {/* RIGHT: Bullpen Workload & Notes */}
          <div className="flex flex-col gap-4 scout-col-notes">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Bullpen Workload & Notes</p>

            {/* Render 7-day workload for away team */}
            {awayWorkload && (
              <PitcherWorkloadCard workload={awayWorkload} teamColor={awayColor} teamAbbr={awayAbbr} />
            )}

            {/* Render 7-day workload for home team */}
            {homeWorkload && (
              <PitcherWorkloadCard workload={homeWorkload} teamColor={homeColor} teamAbbr={homeAbbr} />
            )}

            {/* Season leverage bullpen report card */}
            {bullpenReport && (
              <BullpenUsageCard report={bullpenReport} homeAbbr={homeAbbr} awayAbbr={awayAbbr} homeColor={homeColor} awayColor={awayColor} />
            )}

            <NotesCard title={`${awayAbbr} · key notes`} teamAbbr={awayAbbr} teamColor={awayColor} teamId={awayTeamId} rows={awayKeyNotes} emptyLabel="No notable edges" />
            <NotesCard title={`${homeAbbr} · key notes`} teamAbbr={homeAbbr} teamColor={homeColor} teamId={homeTeamId} rows={homeKeyNotes} emptyLabel="No notable edges" />

            <UmpireScoutingCard umpireName={umpireName} profile={umpireProfile} />

            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden" style={{ borderLeft: '3px solid #FF5722' }}>
              <div className="px-3 py-2 bg-stone-50 border-b border-stone-100">
                <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Further notes · park, weather, moves</span>
              </div>
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
                  <div className="px-3 py-4 text-center font-mono text-[10px] text-stone-400">Nothing notable tonight</div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {pitchModal && <PitchDetailModal payload={pitchModal} onClose={() => setPitchModal(null)} />}
    </>
  )
}