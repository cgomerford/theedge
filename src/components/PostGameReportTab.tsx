'use client'

// src/components/PostGameReportTab.tsx
//
// Post-Game Report — the after-the-fact sibling of ScoutReportTab. Same
// header treatment (team logos, matchup card), same mono-label / rounded
// white card visual language, 4-column responsive grid (collapses to 2
// at <1400px, 1 at <720px) with align-items:start so columns of
// different content lengths don't stretch into empty trailing space.
//
// Data comes from a single PostGameReport object (src/lib/postgame.ts),
// fetched server-side in the page and passed down — same pattern as
// `report: ScoutReport` in ScoutReportTab.
//
// Layout:
//   Col 1 — Top performer leaderboards (EV, spin, launch angle, velo, hardest hit)
//   Col 2 — Spray charts + batter zone heatmaps (both teams)
//   Col 3 — Pitch count by inning, most impactful AB, pitcher usage, umpire report
//   Col 4 — Manager decisions (pinch hitters, lead protection)

import type { PostGameReport } from '@/lib/postgame'
import TopPerformersBoard from './TopPerformersBoard'
import InningPitchCountHeatmap from './InningPitchCountHeatmap'
import MostImpactfulAB from './MostImpactfulAB'
import PitcherUsageBoard from './PitcherUsageBoard'
import BatterZoneHeatmap from './BatterZoneHeatmap'
import PostGameSprayChart from './PostGameSprayChart'
import GameInfoStrip from './GameInfoStrip'
import WinProbabilityChart from './WinProbabilityChart'
import UmpireReportCard from './UmpireReportCard'
import ManagerDecisionsCard from './ManagerDecisionsCard'
import { PatientBattersBoard, LongestAtBatCard } from './PlateDisciplineBoard'
import ExpandableCard from '@/components/ExpandableCard'
import { playerHeadshotUrl } from '@/lib/mlb'

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


type Props = {
  report: PostGameReport
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  homeColor?: string
  awayColor?: string
  homeTeamId?: number | null
  awayTeamId?: number | null
  finalScore: { away: number; home: number }
}

export default function PostGameReportTab({
  report,
  homeAbbr, awayAbbr, homeName, awayName,
  homeColor = '#1A1A1A', awayColor = '#FF5722',
  homeTeamId, awayTeamId,
  finalScore,
}: Props) {
  const awaySpray = report.sprayHits.filter(h => h.teamAbbr === awayAbbr)
  const homeSpray = report.sprayHits.filter(h => h.teamAbbr === homeAbbr)
  const awayZones = report.batterZones.filter(b => b.teamAbbr === awayAbbr)
  const homeZones = report.batterZones.filter(b => b.teamAbbr === homeAbbr)

  return (
    <>
      <style>{`
        .postgame-grid { display: grid; gap: 20px; grid-template-columns: repeat(4, minmax(0,1fr)); align-items: start; }
        @media (max-width: 1400px) { .postgame-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 720px) { .postgame-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="flex flex-col gap-5 w-full pb-12 px-3 sm:px-6" style={{ maxWidth: 1680, marginInline: 'auto' }}>

        {/* ── Final score header ── */}
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

        <GameInfoStrip info={report.gameInfo}

        />

        <WinProbabilityChart
          data={report.winProbability}
          awayAbbr={awayAbbr} homeAbbr={homeAbbr}
          awayTeamId={awayTeamId} homeTeamId={homeTeamId}
          awayColor={awayColor} homeColor={homeColor}
        />

        {/* ── 4-COLUMN LAYOUT ── */}
        <div className="postgame-grid">

          {/* ── COL 1: Top performers ── */}
          <div className="flex flex-col gap-4">
            <TopPerformersBoard
              data={report.topPerformers}
              awayAbbr={awayAbbr} homeAbbr={homeAbbr}
              awayColor={awayColor} homeColor={homeColor}
            />
            <PatientBattersBoard batters={report.plateDiscipline.mostPatientBatters} />
            <LongestAtBatCard ab={report.plateDiscipline.longestAtBat} />
          </div>

          {/* ── COL 2: Spray + batter heatmaps ── */}
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Batted balls</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <ExpandableCard label={`${awayAbbr} spray chart`}>
                <PostGameSprayChart teamAbbr={awayAbbr} teamName={awayName} color={awayColor} hits={awaySpray} />
              </ExpandableCard>
              <ExpandableCard label={`${homeAbbr} spray chart`}>
                <PostGameSprayChart teamAbbr={homeAbbr} teamName={homeName} color={homeColor} hits={homeSpray} />
              </ExpandableCard>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1 mt-1">Batter heatmaps</p>
            <ExpandableCard label={`${awayAbbr} batter heatmaps`}>
              <BatterZoneHeatmap teamAbbr={awayAbbr} teamColor={awayColor} batters={awayZones} />
            </ExpandableCard>
            <ExpandableCard label={`${homeAbbr} batter heatmaps`}>
              <BatterZoneHeatmap teamAbbr={homeAbbr} teamColor={homeColor} batters={homeZones} />
            </ExpandableCard>
          </div>

          {/* ── COL 3: Pitching & leverage ── */}
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Pitching &amp; leverage</p>
            <InningPitchCountHeatmap
              data={report.inningPitchCounts}
              awayAbbr={awayAbbr} homeAbbr={homeAbbr}
              awayColor={awayColor} homeColor={homeColor}
            />
            <MostImpactfulAB
              ab={report.mostImpactfulAB}
              awayAbbr={awayAbbr} homeAbbr={homeAbbr}
              awayColor={awayColor} homeColor={homeColor}
            />
            <PitcherUsageBoard
              usage={report.pitcherUsage}
              awayAbbr={awayAbbr} homeAbbr={homeAbbr}
              awayColor={awayColor} homeColor={homeColor}
            />
            
          </div>

          {/* ── COL 4: Manager decisions ── */}
          
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Umpire Report</p>
            <ExpandableCard label="Umpire report">
              <UmpireReportCard report={report.umpireReport} />
            </ExpandableCard>
            <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 px-1">Manager decisions</p>
            <ManagerDecisionsCard decisions={report.managerDecisions} />
          </div>

        </div>
      </div>
    </>
  )
}