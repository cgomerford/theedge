// src/components/postgame/PostgameReport.tsx
//
// Renders a PostgameReport (src/types/postgame.ts) once a game is Final.
// No LLM narrative — entirely data-driven off the aggregated feed.
// Organized in the "recap the game from just the data" order: General
// (what happened) → Specific/Pitchers (why, from the mound) → Specific/
// Batting (why, from the box). Styling follows brand tokens: Fraunces /
// Bebas Neue / JetBrains Mono, cream/ink/orange/yellow, zero border-radius,
// § section markers, matching MatchupTilt.tsx's Tailwind pattern.

import type {
  PostgameReport as PostgameReportData,
  PitcherGameLine,
  BatterGameLine,
  PitchRecord,
} from '@/types/postgame'
import { PitchLocationChart, SprayChart } from './PitchChart'
import { ZoneHeatmap } from './ZoneHeatmap'
import { WinProbabilityChart } from './WinProbabilityChart'      // ADD
import { AtBatIllustratorGrid } from './AtBatIllustrator'         // ADD
const ORANGE = '#FF5722'
const INK = '#1A1A1A'
const CREAM = '#FAF8F3'

function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

export function PostgameReport({ report }: { report: PostgameReportData }) {
  const {
    away,
    home,
    finalAwayScore,
    finalHomeScore,
    pitchers,
    batters,
    keyPlays,
    superlatives,
    pitchLog,
    mostImpactfulAtBat,
    battingZoneMix,
  } = report

  const homeWon = finalHomeScore > finalAwayScore
  const awayWon = finalAwayScore > finalHomeScore

  const startersFirst = (list: PitcherGameLine[]) =>
    [...list].sort((a, b) => b.outsRecorded - a.outsRecorded)

  return (
    <div className="max-w-[900px] mx-auto font-sans text-[#1A1A1A] pb-16">

      {/* ════════════════════════════════════════════════════════════
          GENERAL — What happened
          ════════════════════════════════════════════════════════════ */}

      {/* ── Score Header ── */}
      <div className="border-2 border-[#1A1A1A] bg-white mb-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-6">
          <div
            className={`font-serif font-extrabold text-2xl tracking-tight ${
              awayWon ? 'text-[#FF5722]' : 'text-[#1A1A1A]'
            }`}
          >
            {away.abbreviation}
          </div>

          <div
            className="font-mono text-center"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            <span
              className="text-6xl leading-none"
              style={{ color: awayWon ? ORANGE : INK }}
            >
              {finalAwayScore}
            </span>
            <span className="text-3xl text-stone-400 px-3">–</span>
            <span
              className="text-6xl leading-none"
              style={{ color: homeWon ? ORANGE : INK }}
            >
              {finalHomeScore}
            </span>
          </div>

          <div
            className={`text-right font-serif font-extrabold text-2xl tracking-tight ${
              homeWon ? 'text-[#FF5722]' : 'text-[#1A1A1A]'
            }`}
          >
            {home.abbreviation}
          </div>
        </div>

        <div className="border-t-2 border-[#1A1A1A] bg-[#FAF8F3] px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 flex justify-between items-center">
          <span>
            {report.gameDate}
            {report.gameNumber > 1 ? ` · Game ${report.gameNumber}` : ''}
          </span>
          <span className="font-bold tracking-[0.25em]">Final</span>
        </div>
      </div>
 {/* ── Win Probability ── */}
      {report.winProbability.length > 0 && (
        <Section glyph="⊕" title="Win Probability" tag="MLB Stats API · per plate appearance">
          <div className="bg-white border-2 border-stone-200 p-5">
            <WinProbabilityChart points={report.winProbability} away={away} home={home} />
          </div>
        </Section>
      )}
      {/* ── Most Impactful At-Bat ── */}
      {mostImpactfulAtBat && (
        <div className="border-2 border-[#1A1A1A] bg-[#1A1A1A] text-white p-6 mb-8">
          <div
            className="font-mono text-[9px] uppercase tracking-[0.22em] mb-3"
            style={{ color: '#FDE047' }}
          >
            § Most Impactful At-Bat
          </div>
          <div className="font-serif text-[17px] italic leading-snug">
            {mostImpactfulAtBat.description}
          </div>
          <div className="font-mono text-[11px] text-stone-400 mt-3 tracking-wide">
            Inning {mostImpactfulAtBat.inning} · {mostImpactfulAtBat.awayScore}–
            {mostImpactfulAtBat.homeScore}
          </div>
        </div>
      )}

      {/* ── Key Plays ── */}
      <Section glyph="§" title="Key Plays" tag={`${keyPlays.length} shown`}>
        <div className="space-y-1.5">
          {keyPlays.map((kp, i) => (
            <div
              key={`${kp.atBatIndex}-${i}`}
              className={`flex items-start gap-4 px-4 py-3.5 border-2 ${
                kp.isScoringPlay
                  ? 'border-[#FF5722] bg-white'
                  : 'border-stone-200 bg-white'
              }`}
            >
              <span className="font-mono text-[11px] text-stone-400 whitespace-nowrap pt-0.5 w-12">
                {kp.halfInning === 'top' ? '▲' : '▼'} {kp.inning}
              </span>
              <span className="font-serif text-[15px] flex-1 text-stone-800 leading-snug">
                {kp.description}
              </span>
              <span className="font-mono text-[13px] font-bold whitespace-nowrap tracking-tight">
                {kp.awayScore}–{kp.homeScore}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Superlatives ── */}
      <div className="mb-12">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 mb-3 pb-1 border-b border-stone-200">
          Game Superlatives
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Superlative
            label="Fastest Pitch"
            value={
              superlatives.fastestPitch
                ? `${superlatives.fastestPitch.speed} mph`
                : '—'
            }
            sub={
              superlatives.fastestPitch
                ? `${superlatives.fastestPitch.pitcherName} · ${superlatives.fastestPitch.typeDescription}`
                : 'no data'
            }
          />
          <Superlative
            label="Slowest Pitch"
            value={
              superlatives.slowestPitch
                ? `${superlatives.slowestPitch.speed} mph`
                : '—'
            }
            sub={
              superlatives.slowestPitch
                ? `${superlatives.slowestPitch.pitcherName} · ${superlatives.slowestPitch.typeDescription}`
                : 'no data'
            }
          />
          <Superlative
            label="Most Break"
            value={
              superlatives.mostBreak
                ? `${superlatives.mostBreak.breakLength}"`
                : '—'
            }
            sub={
              superlatives.mostBreak
                ? `${superlatives.mostBreak.pitcherName} · ${superlatives.mostBreak.typeDescription}`
                : 'no data'
            }
          />
          <Superlative
            label="Highest Spin"
            value={
              superlatives.highestSpin
                ? `${superlatives.highestSpin.spinRate} rpm`
                : '—'
            }
            sub={
              superlatives.highestSpin
                ? superlatives.highestSpin.pitcherName
                : 'no data'
            }
          />
          <Superlative
            label="Hardest Hit"
            value={
              superlatives.hardestHit
                ? `${superlatives.hardestHit.exitVelo} mph`
                : '—'
            }
            sub={
              superlatives.hardestHit
                ? superlatives.hardestHit.batterName
                : 'no data'
            }
            accent
          />
          <Superlative
            label="Longest Hit"
            value={
              superlatives.longestHit
                ? `${superlatives.longestHit.distance} ft`
                : '—'
            }
            sub={
              superlatives.longestHit
                ? superlatives.longestHit.batterName
                : 'no data'
            }
            accent
          />
          <Superlative
            label="Most Patient"
            value={
              superlatives.mostPatientBatter
                ? `${superlatives.mostPatientBatter.pitchesSeen} pitches`
                : '—'
            }
            sub={
              superlatives.mostPatientBatter
                ? `${superlatives.mostPatientBatter.batterName} · ${superlatives.mostPatientBatter.plateAppearances} PA`
                : 'no data'
            }
            accent
          />
          <Superlative
            label="Longest At-Bat"
            value={
              superlatives.longestAtBat
                ? `${superlatives.longestAtBat.pitches} pitches`
                : '—'
            }
            sub={
              superlatives.longestAtBat
                ? `${superlatives.longestAtBat.batterName} vs ${superlatives.longestAtBat.pitcherName}`
                : 'no data'
            }
            accent
          />
          <Superlative
            label="Biggest Inning"
            value={
              superlatives.biggestInning
                ? `${superlatives.biggestInning.runs} runs`
                : '—'
            }
            sub={
              superlatives.biggestInning
                ? `${superlatives.biggestInning.teamAbbreviation}, Inning ${superlatives.biggestInning.inning}`
                : 'no data'
            }
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          SPECIFIC — Pitchers
          ════════════════════════════════════════════════════════════ */}

      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400 mb-5 pb-1.5 border-b-2 border-stone-300">
        Specific — Pitchers
      </div>

      <Section glyph="§" title="Pitching Lines" tag={`${pitchers.length} pitchers`}>
        {[away, home].map((team) => {
          const teamPitchers = startersFirst(
            pitchers.filter((p) => p.teamId === team.teamId)
          )
          if (teamPitchers.length === 0) return null
          return (
            <div key={team.teamId} className="mb-7 last:mb-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2.5">
                {team.name}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-2 border-stone-200 bg-white text-[12.5px] font-mono">
                  <thead>
                    <tr className="border-b-2 border-[#1A1A1A] text-[9.5px] uppercase tracking-wide text-stone-500">
                      <th className="text-left px-3 py-2.5">Pitcher</th>
                      <th className="text-right px-3 py-2.5">IP</th>
                      <th className="text-right px-3 py-2.5">P</th>
                      <th className="text-right px-3 py-2.5">K</th>
                      <th className="text-right px-3 py-2.5">BB</th>
                      <th className="text-right px-3 py-2.5">H</th>
                      <th className="text-right px-3 py-2.5">R</th>
                      <th className="text-right px-3 py-2.5">ER</th>
                      <th className="text-right px-3 py-2.5">SwStr%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPitchers.map((p) => (
                      <tr
                        key={p.pitcherId}
                        className="border-b border-stone-100 last:border-0 hover:bg-[#FAF8F3] transition-colors"
                      >
                      <td className="px-3 py-2.5 font-sans font-semibold not-italic">
                          {p.pitcherName}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {outsToIP(p.outsRecorded)}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {p.pitchesThrown}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {p.strikeouts}
                        </td>
                        <td className="text-right px-3 py-2.5">{p.walks}</td>
                        <td className="text-right px-3 py-2.5">
                          {p.hitsAllowed}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {p.runsAllowed}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {p.earnedRunsAllowed}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          {p.swingMiss.swStrPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </Section>

      <Section
        glyph="§"
        title="Arsenal, Swing & Miss, Hot Zones"
        tag="starters"
      >
        <div className="grid md:grid-cols-2 gap-5">
          {startersFirst(pitchers)
            .slice(0, 2)
            .map((p) => (
              <PitcherDeepDive
                key={p.pitcherId}
                pitcher={p}
                pitches={pitchLog.filter((pl) => pl.pitcherId === p.pitcherId)}
              />
            ))}
        </div>
      </Section>

      {/* ════════════════════════════════════════════════════════════
          SPECIFIC — Batting
          ════════════════════════════════════════════════════════════ */}
<Section
        glyph="§"
        title="The Illustrator"
        tag="pitch sequence, every at-bat"
      >
        {startersFirst(pitchers).map((p) => (
          <div key={p.pitcherId} className="mb-8 last:mb-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2.5">
              {p.pitcherName}
            </div>
            <AtBatIllustratorGrid
              pitcherName={p.pitcherName}
              atBats={report.atBats.filter((ab) => ab.pitcherId === p.pitcherId)}
              pitchLog={report.pitchLog.filter((pl) => pl.pitcherId === p.pitcherId)}
            />
          </div>
        ))}
      </Section>

      {/* ════════════════════════════════════════════════════════════
          SPECIFIC — Batting
          ════════════════════════════════════════════════════════════ */}
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400 mb-5 pb-1.5 border-b-2 border-stone-300 mt-2">
        Specific — Batting
      </div>

      <Section glyph="§" title="Batting Lines" tag="both lineups">
        {[away, home].map((team) => (
          <BattingTable
            key={team.teamId}
            teamName={team.name}
            lines={team.teamId === away.teamId ? batters.away : batters.home}
          />
        ))}
      </Section>

      <Section
        glyph="§"
        title="Contact By Zone"
        tag="both teams · this game only"
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white border-2 border-stone-200 p-5">
            <ZoneHeatmap
              cells={battingZoneMix.away}
              metric="hit"
              label={away.name}
            />
          </div>
          <div className="bg-white border-2 border-stone-200 p-5">
            <ZoneHeatmap
              cells={battingZoneMix.home}
              metric="hit"
              label={home.name}
            />
          </div>
        </div>
      </Section>

      <Section glyph="§" title="Where The Ball Went" tag="all balls in play">
        <div className="bg-white border-2 border-stone-200 p-5">
          <SprayChart battedBalls={report.battedBalls} />
        </div>
      </Section>

      {/* ── Footer ── */}
     <div className="border-t-2 border-stone-200 pt-5 mt-4 font-mono text-[10px] text-stone-500 leading-relaxed tracking-wide">
        ⊕ Data — MLB Stats API live game feed, pitch-by-pitch, plus per-play
        win probability. Hot zones and contact maps are this game only, not
        season profiles. No Edge Score or pregame-grade comparison appears
        on this page — that stays in /admin.
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Shared UI atoms
   ────────────────────────────────────────────────────────────── */

function Section({
  glyph,
  title,
  tag,
  children,
}: {
  glyph: string
  title: string
  tag?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-11">
      <div className="flex items-baseline gap-2.5 border-b-2 border-stone-200 pb-2.5 mb-5">
        <span style={{ color: ORANGE }} className="text-xl leading-none">
          {glyph}
        </span>
        <h2 className="font-serif font-semibold text-[20px] -tracking-[0.3px] m-0">
          {title}
        </h2>
        {tag && (
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone-500">
            {tag}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function Superlative({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="bg-white border-2 border-stone-200 p-3.5 hover:border-[#1A1A1A] transition-colors">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">
        {label}
      </div>
      <div
        className="font-mono text-[26px] leading-none tracking-tight"
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          color: accent ? ORANGE : INK,
        }}
      >
        {value}
      </div>
      <div className="font-mono text-[10px] text-stone-500 mt-1.5 truncate">
        {sub}
      </div>
    </div>
  )
}

function PitcherDeepDive({
  pitcher,
  pitches,
}: {
  pitcher: PitcherGameLine
  pitches: PitchRecord[]
}) {
  const sm = pitcher.swingMiss
  return (
    <div className="bg-white border-2 border-stone-200 p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 mb-4">
        {pitcher.pitcherName}
      </div>

      <table className="w-full font-mono text-[12px] mb-5">
        <thead>
          <tr className="border-b-2 border-[#1A1A1A] text-[9px] uppercase tracking-wide text-stone-500">
            <th className="text-left py-2">Pitch</th>
            <th className="text-right py-2">Usage</th>
            <th className="text-right py-2">Velo</th>
            <th className="text-right py-2">Whiff%</th>
            <th className="text-right py-2">Zone%</th>
          </tr>
        </thead>
        <tbody>
          {pitcher.arsenal.map((a) => (
            <tr
              key={a.typeCode}
              className="border-b border-stone-100 last:border-0"
            >
              <td className="py-1.5 font-sans font-semibold not-italic">
                {a.typeDescription}
              </td>
              <td className="text-right py-1.5">{a.usagePct}%</td>
              <td className="text-right py-1.5">{a.avgVelo ?? '—'}</td>
              <td className="text-right py-1.5">{a.whiffPct ?? '—'}</td>
              <td className="text-right py-1.5">{a.zonePct ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <MiniStat label="SwStr%" value={`${sm.swStrPct}%`} />
        <MiniStat
          label="Chase%"
          value={
            sm.chaseRatePct != null ? `${sm.chaseRatePct}%` : '—'
          }
        />
        <MiniStat
          label="Best Whiff"
          value={
            sm.bestWhiffPitch
              ? `${sm.bestWhiffPitch.typeDescription} (${sm.bestWhiffPitch.whiffPct}%)`
              : '—'
          }
          small
        />
      </div>

      <ZoneHeatmap cells={pitcher.hotZones} metric="whiff" size={120} />

      <div className="mt-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500 mb-2">
          Pitch Location
        </div>
        <PitchLocationChart pitches={pitches} />
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  small,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="border-2 border-stone-200 px-2.5 py-2">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-stone-500">
        {label}
      </div>
      <div
        className={`font-mono font-bold mt-1 ${
          small ? 'text-[10.5px] leading-tight' : 'text-[14px]'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function BattingTable({
  teamName,
  lines,
}: {
  teamName: string
  lines: BatterGameLine[]
}) {
  if (lines.length === 0) return null
  return (
    <div className="mb-7 last:mb-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2.5">
        {teamName}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-2 border-stone-200 bg-white text-[12.5px] font-mono">
          <thead>
            <tr className="border-b-2 border-[#1A1A1A] text-[9.5px] uppercase tracking-wide text-stone-500">
              <th className="text-left px-3 py-2.5">Batter</th>
              <th className="text-right px-3 py-2.5">AB</th>
              <th className="text-right px-3 py-2.5">H</th>
              <th className="text-right px-3 py-2.5">2B</th>
              <th className="text-right px-3 py-2.5">3B</th>
              <th className="text-right px-3 py-2.5">HR</th>
              <th className="text-right px-3 py-2.5">BB</th>
              <th className="text-right px-3 py-2.5">K</th>
              <th className="text-right px-3 py-2.5">R</th>
              <th className="text-right px-3 py-2.5">RBI</th>
              <th className="text-right px-3 py-2.5">SB</th>
              <th className="text-right px-3 py-2.5">Pitches</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((b) => (
              <tr
                key={b.batterId}
                className="border-b border-stone-100 last:border-0 hover:bg-[#FAF8F3]"
              >
                <td className="px-3 py-2.5 font-sans font-semibold not-italic">
                  {b.batterName}
                </td>
                <td className="text-right px-3 py-2.5">{b.atBats}</td>
                <td className="text-right px-3 py-2.5">{b.hits}</td>
                <td className="text-right px-3 py-2.5">{b.doubles}</td>
                <td className="text-right px-3 py-2.5">{b.triples}</td>
                <td className="text-right px-3 py-2.5">{b.homeRuns}</td>
                <td className="text-right px-3 py-2.5">{b.walks}</td>
                <td className="text-right px-3 py-2.5">{b.strikeouts}</td>
                <td className="text-right px-3 py-2.5">{b.runsScored}</td>
                <td className="text-right px-3 py-2.5">{b.rbi}</td>
                <td className="text-right px-3 py-2.5">{b.stolenBases}</td>
                <td className="text-right px-3 py-2.5">{b.pitchesSeen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}