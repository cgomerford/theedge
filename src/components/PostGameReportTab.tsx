// src/components/PostGameReportTab.tsx
'use client'

// RESTRUCTURED (2026-08-20): converted from a single long-scrolling page
// into a Savant-style tab bar. Header (score + team logos) and Win
// Probability chart stay always visible above the tabs — identity info,
// not something you'd want hidden behind a tab click. Everything else
// (Pitching, Box Score, Batters, Officiating) is now a tab panel.
//
// TopPerformersBoard wired in for the first time — was imported in the
// original untrimmed version, never rendered since. Lives in Overview.
//
// SP determination reuses deriveRoles() from PitcherBoxScoreCard.tsx.

import { useState } from 'react'
import type { PostGameReport } from '@/lib/postgame'
import type { PitcherGameLine, PitchRecord, BatterGameLine, LinescoreRow, BattedBallRecord } from '@/types/postgame'
import GameInfoStrip from './GameInfoStrip'
import WinProbabilityChart from './WinProbabilityChart'
import PostGameBoxScore from './PostGameBoxScore'
import UmpireReportCard from './UmpireReportCard'
import ManagerDecisionsCard from './ManagerDecisionsCard'
import PostGameABSChallengesCard from './PostGameABSChallengesCard'
import BatterBoxScoreSelector from './BatterBoxScoreSelector'
import PitcherStaffSelector from './PitcherStaffSelector'
import PitcherWorkloadCard from './PitcherWorkloadCard'
import TopPerformersBoard from './TopPerformersBoard'
import type { Last7DaysWorkload } from '@/lib/pitcher-workload'
import type { BullpenReport } from '@/lib/bullpen-usage'
import { deriveRoles } from './PitcherBoxScoreCard'

function TeamLogo({ teamId, abbr, color, size = 48 }: { teamId?: number | null; abbr: string; color: string; size?: number }) {
  return teamId ? (
    <img
      src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
      alt={abbr}
      style={{ width: size, height: size }}
      className="object-contain flex-shrink-0 drop-shadow-sm"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  ) : (
    <div
      style={{ width: size, height: size, background: color }}
      className="rounded-xl flex items-center justify-center font-mono text-sm font-bold text-white flex-shrink-0 shadow-sm"
    >
      {abbr}
    </div>
  )
}

type TabKey = 'overview' | 'pitching' | 'boxscore' | 'batters' | 'officiating'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'pitching', label: 'Pitching' },
  { key: 'boxscore', label: 'Box Score' },
  { key: 'batters', label: 'Batters' },
  { key: 'officiating', label: 'Officiating' },
]

type Props = {
  report: PostGameReport
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  awayWorkload?: Last7DaysWorkload | null
  homeWorkload?: Last7DaysWorkload | null
  awayBullpenReport?: BullpenReport | null
  homeBullpenReport?: BullpenReport | null
  homeColor?: string
  awayColor?: string
  homeTeamId?: number | null
  awayTeamId?: number | null
  finalScore: { away: number; home: number }
  boxScorePitchers?: PitcherGameLine[]
  boxScoreBatters?: { away: BatterGameLine[]; home: BatterGameLine[] }
  boxScoreLinescore?: LinescoreRow[]
  pitcherHands?: Map<number, 'L' | 'R'>
  boxScoreBattedBalls?: BattedBallRecord[]
  boxScorePitchLog?: PitchRecord[]
}

export default function PostGameReportTab({
  report,
  homeAbbr, awayAbbr, homeName, awayName,
  homeColor = '#1A1A1A', awayColor = '#FF5722',
  homeTeamId, awayTeamId,
  finalScore,
  boxScorePitchers = [],
  boxScorePitchLog = [],
  awayWorkload = null,
  homeWorkload = null,
  awayBullpenReport = null,
  homeBullpenReport = null,
  boxScoreBatters,
  boxScoreLinescore = [],
  pitcherHands = new Map(),
  boxScoreBattedBalls = [],
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const awayStaff = awayTeamId != null ? deriveRoles(boxScorePitchers, boxScorePitchLog, awayTeamId) : []
  const homeStaff = homeTeamId != null ? deriveRoles(boxScorePitchers, boxScorePitchLog, homeTeamId) : []

  return (
    <div className="flex flex-col gap-5 w-full pb-12 px-4 sm:px-8" style={{ maxWidth: 1920, marginInline: 'auto' }}>

      {/* ── Final score header — always visible ── */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
        <div className="px-4 pt-3 pb-1 text-center">
          <h2 className="text-stone-400 font-mono text-[10px] uppercase tracking-widest">Post-Game Report · Final</h2>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-5 pt-2">
          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamLogo teamId={awayTeamId} abbr={awayAbbr} color={awayColor} size={52} />
            <div className="text-center min-w-0">
              <div className="leading-none text-stone-900 truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem', letterSpacing: '0.02em' }}>
                {awayName}
              </div>
              <div className="font-mono text-2xl font-bold text-stone-900 mt-1">{finalScore.away}</div>
            </div>
          </div>
          <div className="flex flex-col items-center shrink-0 px-2">
            <span className="text-stone-300 leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem' }}>FINAL</span>
          </div>
          <div className="flex flex-col items-center gap-2 min-w-0">
            <TeamLogo teamId={homeTeamId} abbr={homeAbbr} color={homeColor} size={52} />
            <div className="text-center min-w-0">
              <div className="leading-none text-stone-900 truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.35rem', letterSpacing: '0.02em' }}>
                {homeName}
              </div>
              <div className="font-mono text-2xl font-bold text-stone-900 mt-1">{finalScore.home}</div>
            </div>
          </div>
        </div>
      </div>

      <GameInfoStrip info={report.gameInfo} />

      <WinProbabilityChart
        data={report.winProbability}
        awayAbbr={awayAbbr} homeAbbr={homeAbbr}
        awayTeamId={awayTeamId} homeTeamId={homeTeamId}
        awayColor={awayColor} homeColor={homeColor}
      />

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-stone-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-widest font-bold border-b-2 shrink-0 transition ${
              activeTab === t.key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-stone-400 hover:text-stone-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <TopPerformersBoard
          data={report.topPerformers}
          awayAbbr={awayAbbr} homeAbbr={homeAbbr}
          awayColor={awayColor} homeColor={homeColor}
        />
      )}

      {/* ── PITCHING ── */}
      {activeTab === 'pitching' && (
        <div className="grid grid-cols-1 gap-5 items-start md:[grid-template-columns:1fr_1fr]">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1 mb-2">{awayAbbr} starter</p>
            {awayStaff.length > 0 ? (
              <PitcherStaffSelector pitchers={awayStaff} pitchLog={boxScorePitchLog} teamColor={awayColor} />
            ) : (
              <p className="text-xs font-serif italic text-stone-400 p-4">No pitching data available.</p>
            )}
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1 mb-2 mt-5">{awayAbbr} bullpen usage</p>
            <PitcherWorkloadCard workload={awayWorkload} bullpenReport={awayBullpenReport} teamColor={awayColor} teamAbbr={awayAbbr} />
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1 mb-2">{homeAbbr} starter</p>
            {homeStaff.length > 0 ? (
              <PitcherStaffSelector pitchers={homeStaff} pitchLog={boxScorePitchLog} teamColor={homeColor} />
            ) : (
              <p className="text-xs font-serif italic text-stone-400 p-4">No pitching data available.</p>
            )}
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1 mb-2 mt-5">{homeAbbr} bullpen usage</p>
            <PitcherWorkloadCard workload={homeWorkload} bullpenReport={homeBullpenReport} teamColor={homeColor} teamAbbr={homeAbbr} />
          </div>
        </div>
      )}

      {/* ── BOX SCORE ── */}
      {activeTab === 'boxscore' && (
        boxScoreBatters ? (
          <PostGameBoxScore
            linescore={boxScoreLinescore}
            awayAbbr={awayAbbr}
            homeAbbr={homeAbbr}
            awayBatters={boxScoreBatters.away}
            homeBatters={boxScoreBatters.home}
            awayPitchers={boxScorePitchers.filter(p => p.teamId === awayTeamId)}
            homePitchers={boxScorePitchers.filter(p => p.teamId === homeTeamId)}
          />
        ) : (
          <p className="text-xs font-serif italic text-stone-400 p-4">Box score not available.</p>
        )
      )}

      {/* ── BATTERS ── */}
      {activeTab === 'batters' && boxScoreBatters && (
        <BatterBoxScoreSelector
          awayBatters={boxScoreBatters.away}
          homeBatters={boxScoreBatters.home}
          battedBalls={boxScoreBattedBalls}
          pitchLog={boxScorePitchLog}
          awayAbbr={awayAbbr}
          homeAbbr={homeAbbr}
          awayTeamName={awayName}
          homeTeamName={homeName}
          awayColor={awayColor}
          homeColor={homeColor}
          pitcherHands={pitcherHands}
        />
      )}

      {/* ── OFFICIATING ── */}
      {activeTab === 'officiating' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ManagerDecisionsCard decisions={report.managerDecisions} />
          <PostGameABSChallengesCard challenges={report.umpireReport.challengeEvents} />
          <UmpireReportCard report={report.umpireReport} />
        </div>
      )}

    </div>
  )
}