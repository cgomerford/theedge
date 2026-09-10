// src/app/nfl/NflHomeClient.tsx
//
// Full reset: no CSS classes, no <style> block. Every style is an
// inline style={{}} object. Two known tradeoffs of going fully inline
// (see message this was delivered in for detail):
//   1. The ticker's scrollbar is visible on Chrome/Safari (::-webkit-
//      scrollbar can't be set inline). scrollbarWidth:'none' below
//      still hides it on Firefox.
//   2. Scroll-arrow show/hide on ticker hover uses React state
//      (onMouseEnter/Leave) instead of a CSS :hover rule.

'use client'

import { useMemo, useState } from 'react'
import NflMoversRow from '@/components/nfl/NflMoversRow'

import type { RushEpaYoyMover, PassEpaYoyMover, RecEpaYoyMover, FantasyYoyMover, TeamEpaYoyMover } from '@/lib/nfl/queries'
import Link from 'next/link'
import { ScatterChart, Scatter, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts'
import NflTeamYardsLeaders from '@/components/nfl/NflTeamYardsLeaders'
import NflTrendLineChart, { type TrendSeries } from '@/components/nfl/NflTrendLineChart'
import type {
  TeamYardsLeaderRow, TeamDefenseLeaderRow, TeamFgLeaderRow,
  LeagueCoverageTrendPoint, LeagueRouteTrendPoint, LeagueRushPassTrendPoint, LeagueSchemeEvolutionPoint,
} from '@/lib/nfl/queries'
import type {
  LeaderRow, StandingsRow, TeamWithReport, FantasyProjectionRow, LeagueLeaderEntry,
  TeamStrengthPoint,
} from '@/lib/nfl/queries'
import { NflSubHeader } from '@/components/nfl/NFLSubHeader'
import { TeamsByConference } from '@/components/nfl/TeamsByConference'
import { NflLeaders } from '@/components/nfl/NFLLeaders'
import NflRadarCycler from '@/components/nfl/NflRadarCycler'
import type { QbRadarProfile, WrRadarProfile } from '@/lib/nfl/queries'
 

type ServerGame = {
  gameId: string; week?: number | null; gameStatus?: string; gametime?: string | null
  awayScore?: number | null; homeScore?: number | null; venue?: string | null; broadcast?: string | null
  awayTeam: { teamId: string; logoUrl?: string | null; record?: string | null }
  homeTeam: { teamId: string; logoUrl?: string | null; record?: string | null }
  edge?: { edgeTeam: string | null; factorsLeanCount: number | null; confidence: string | null } | null
}
type ScheduleGame = {
  id: string; href: string; awayId: string; homeId: string; awayLogo?: string; homeLogo?: string
  awayRecord?: string; homeRecord?: string
  awayScore: number | null; homeScore: number | null; status: string; when: string | null
  venue?: string; broadcast?: string; week?: number | null
  edgeTeam?: string | null; factorsLeanCount?: number | null
}

type Props = {
  statsSeason: number
  week: number | null
  games: ServerGame[]
  teams: TeamWithReport[]
  qbLeaders: LeaderRow[]
  rbLeaders: LeaderRow[]
  wrLeaders: LeaderRow[]
  teLeaders: LeaderRow[]
  advLeaders: LeaderRow[]
  standings: StandingsRow[]
  fantasyLeaders: LeaderRow[]
  fantasyProjections: FantasyProjectionRow[]
  intLeaders: LeaderRow[]
  tflLeaders: LeaderRow[]
  turnoverLeaders: LeaderRow[]
  fgLeaders: LeaderRow[]
  leagueLeaders: LeagueLeaderEntry[]
  teamStrength: TeamStrengthPoint[]
  isLastYear: boolean
  top5QbRadars: { profile: QbRadarProfile; name: string }[]
  top5WrRadars: { profile: WrRadarProfile; name: string; teamAbbr: string }[]
   teamYardsLeaders: TeamYardsLeaderRow[]
  teamDefenseLeaders: TeamDefenseLeaderRow[]
  teamFgLeaders: TeamFgLeaderRow[]
  leagueCoverageTrend: LeagueCoverageTrendPoint[]
  leagueRouteTrend: LeagueRouteTrendPoint[]
  leagueRushPassTrend: LeagueRushPassTrendPoint[]
 leagueSchemeTrend: LeagueSchemeEvolutionPoint[]
    biggestRushMover: RushEpaYoyMover | null
  biggestPassMover: PassEpaYoyMover | null
  biggestReceivingMover: RecEpaYoyMover | null
  biggestFantasyMover: FantasyYoyMover | null
  biggestTeamMover: TeamEpaYoyMover | null
}
type WeekOpt = { key: string; label: string; week: number; seasontype: number; group: string }
const WEEK_OPTIONS: WeekOpt[] = [
  { key: 'p-hof', label: 'HOF', week: 1, seasontype: 1, group: 'Pre' },
  { key: 'p-1', label: 'Pre 1', week: 2, seasontype: 1, group: 'Pre' },
  { key: 'p-2', label: 'Pre 2', week: 3, seasontype: 1, group: 'Pre' },
  { key: 'p-3', label: 'Pre 3', week: 4, seasontype: 1, group: 'Pre' },
  ...Array.from({ length: 18 }, (_, i) => ({ key: `r-${i + 1}`, label: `Wk ${i + 1}`, week: i + 1, seasontype: 2, group: 'Regular' })),
  { key: 'po-wc', label: 'Wild Card', week: 1, seasontype: 3, group: 'Post' },
  { key: 'po-div', label: 'Divisional', week: 2, seasontype: 3, group: 'Post' },
  { key: 'po-conf', label: 'Conf', week: 3, seasontype: 3, group: 'Post' },
  { key: 'po-sb', label: 'Super Bowl', week: 5, seasontype: 3, group: 'Post' },
]

function mapServerGames(games: ServerGame[]): ScheduleGame[] {
  return games.map((g) => ({
    id: g.gameId, href: `/nfl/${g.gameId}`, awayId: g.awayTeam.teamId, homeId: g.homeTeam.teamId,
    awayLogo: g.awayTeam.logoUrl ?? undefined, homeLogo: g.homeTeam.logoUrl ?? undefined,
    awayRecord: g.awayTeam.record ?? undefined, homeRecord: g.homeTeam.record ?? undefined,
    awayScore: g.awayScore ?? null, homeScore: g.homeScore ?? null,
    status: g.gameStatus === 'final' ? 'final' : g.gameStatus === 'in_progress' ? 'in_progress' : 'scheduled',
    when: g.gametime ?? null, venue: g.venue ?? undefined, broadcast: g.broadcast ?? undefined, week: g.week ?? null,
    edgeTeam: g.edge?.edgeTeam ?? null, factorsLeanCount: g.edge?.factorsLeanCount ?? null,
  }))
}

function formatWhen(iso: string | null) {
  if (!iso) return 'TBD'
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  } catch {
    return 'TBD'
  }
}
const TREND_COLORS = ['#FF5722', '#2563EB', '#16A34A', '#9333EA', '#DB2777', '#78716C']
function pivotCategoryTrend(
  rows: { season: number; pct: number }[],
  categoryOf: (r: any) => string,
  topN: number,
): { data: Record<string, number | null>[]; series: TrendSeries[] } {
  if (rows.length === 0) return { data: [], series: [] }
 
  const seasons = Array.from(new Set(rows.map((r) => r.season))).sort((a, b) => a - b)
  const latestSeason = seasons[seasons.length - 1]
  const latestRows = rows.filter((r) => r.season === latestSeason)
  const topCategories = [...latestRows]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, topN)
    .map(categoryOf)
 
  const data = seasons.map((season) => {
    const row: Record<string, number | null> = { season }
    for (const cat of topCategories) {
      const match = rows.find((r) => r.season === season && categoryOf(r) === cat)
      row[cat] = match ? match.pct : null
    }
    return row
  })
 
  const series: TrendSeries[] = topCategories.map((cat, i) => ({
    key: cat,
    label: cat,
    color: TREND_COLORS[i % TREND_COLORS.length],
    unit: '%',
  }))
 
  return { data, series }
}
 
function TeamStrengthScatter({ points, teams }: { points: TeamStrengthPoint[]; teams: TeamWithReport[] }) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.teamId, t])), [teams])
 
  // y is flipped (-defEpaPerPlay) so "up" on the chart reads as a better
  // defense -- defEpaPerPlay itself is EPA ALLOWED, where lower/negative
  // is good, which would otherwise put good defenses at the bottom.
  const data = points.map((p) => ({
    x: p.offEpaPerPlay,
    y: -p.defEpaPerPlay,
    teamId: p.teamId,
    team: teamById.get(p.teamId),
  }))
 
  if (data.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No team season reports synced yet.</div>
      </div>
    )
  }
 
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20, height: 460 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 24, bottom: 24, left: 12 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Offensive strength"
            tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#A3A3A3' }}
            label={{ value: 'Offensive strength →', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#78716C' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Defensive strength"
            tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#A3A3A3' }}
            label={{ value: 'Defensive strength →', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#78716C' }}
          />
          <ReferenceLine x={0} stroke="#E7E5E4" />
          <ReferenceLine y={0} stroke="#E7E5E4" />
          <Tooltip
            contentStyle={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", borderRadius: 4 }}
            formatter={(_value: unknown, _name: unknown, item: any) => {
              const p = item?.payload
              if (!p) return ['', '']
              return [`Off ${p.x.toFixed(2)} · Def ${(-p.y).toFixed(2)} EPA/play allowed`, p.teamId]
            }}
          />
          <Scatter data={data} shape={<TeamLogoDot />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
 
function TeamLogoDot(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  const team = payload?.team as TeamWithReport | undefined
  if (!team?.logoUrl) {
    return <circle cx={cx} cy={cy} r={5} fill={team?.teamColor ?? '#1A1A1A'} />
  }
  return <image href={team.logoUrl} x={cx - 11} y={cy - 11} width={22} height={22} />
} 
export default function NflHomeClient(props: Props) {
  const initialGames = useMemo(() => mapServerGames(props.games), [props.games])
  const [season, setSeason] = useState(props.statsSeason)
  const [weekKey, setWeekKey] = useState<string | 'current'>('current')
  const [games, setGames] = useState<ScheduleGame[]>(initialGames)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [weekLabel, setWeekLabel] = useState(props.week ? `Week ${props.week}` : 'This week')
  const [tickerHover, setTickerHover] = useState(false)

  const teamColorMap = useMemo(() => new Map(props.teams.map((t) => [t.teamId, t.teamColor])), [props.teams])

  function scrollTicker(dir: 'l' | 'r') {
    const el = document.getElementById('nfl-ticker-scroll')
    if (el) el.scrollBy({ left: dir === 'r' ? 400 : -400, behavior: 'smooth' })
  }

  async function loadWeek(opt: WeekOpt | 'current', nextSeason = season) {
    if (opt === 'current') {
      setWeekKey('current'); setSeason(props.statsSeason); setGames(initialGames)
      setWeekLabel(props.week ? `Week ${props.week}` : 'This week')
      return
    }
    setWeekKey(opt.key); setLoadingWeek(true)
    try {
      const res = await fetch(`/api/nfl/week-schedule?week=${opt.week}&season=${nextSeason}&seasontype=${opt.seasontype}`)
      const data = await res.json()
      const mapped: ScheduleGame[] = (data.games ?? []).map((g: any) => ({
        id: g.id ?? g.slug, href: `/nfl/${g.slug ?? g.id}`,
        awayId: g.awayTeam?.abbreviation ?? g.awayTeam?.teamId ?? 'AWAY', homeId: g.homeTeam?.abbreviation ?? g.homeTeam?.teamId ?? 'HOME',
        awayLogo: g.awayTeam?.logo, homeLogo: g.homeTeam?.logo, awayScore: g.awayScore ?? null, homeScore: g.homeScore ?? null,
        status: g.status ?? 'scheduled', when: g.date ?? null, venue: g.venue, broadcast: g.broadcast, week: g.week ?? opt.week,
      }))
      setGames(mapped); setWeekLabel(`${nextSeason} · ${opt.label}`)
    } catch {
      setGames([])
    } finally {
      setLoadingWeek(false)
    }
  }

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', background: '#F4F0E8', color: '#1A1A1A', fontFamily: 'Inter, system-ui, sans-serif', padding: '10px 0 10px', overflowX: 'hidden' }}>
      {/* SCHEDULE */}
      <section style={{ margin: 0, padding: 0 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <div>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF5722', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>
          § The Edge · NFL {props.statsSeason}
        </p>
              <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", margin: 0, fontSize: 30, color: '#1A1A1A' }}>{weekLabel}</h2>
            
            </div>
          
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 24px', background: '#F5F1E8', borderTop: '1px solid rgba(26,26,26,0.06)', borderBottom: '1px solid rgba(26,26,26,0.06)', marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'flex-end', flex: 1, minWidth: 0 }} role="tablist" aria-label="NFL weeks">
            <button
              onClick={() => loadWeek('current')}
              style={{ background: weekKey === 'current' ? '#1A1A1A' : 'transparent', color: weekKey === 'current' ? '#FAF8F3' : '#A3A3A3', border: 'none', padding: '4px 9px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', flexShrink: 0 }}
            >
              Now
            </button>
            {WEEK_OPTIONS.map((opt, i) => {
              const showGroup = i === 0 || WEEK_OPTIONS[i - 1].group !== opt.group
              const on = weekKey === opt.key
              return (
                <span key={opt.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                  {showGroup ? (
                    <span style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A3A3A3', paddingLeft: 8, fontFamily: "'JetBrains Mono', monospace" }}>{opt.group}</span>
                  ) : null}
                  <button
                    onClick={() => loadWeek(opt, season)}
                    style={{ background: on ? '#1A1A1A' : 'transparent', color: on ? '#FAF8F3' : '#A3A3A3', border: 'none', padding: '4px 9px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer' }}
                  >
                    {opt.label}
                  </button>
                </span>
              )
            })}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>Times in US/Eastern (EDT)</span>
        </div>

        <div
          style={{ position: 'relative', background: '#fff', borderBottom: '1px solid rgba(26,26,26,0.1)' }}
          onMouseEnter={() => setTickerHover(true)}
          onMouseLeave={() => setTickerHover(false)}
        >
          <button
            onClick={() => scrollTicker('l')}
            aria-label="Scroll left"
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))', zIndex: 2, cursor: 'pointer', border: 'none', opacity: tickerHover ? 1 : 0, pointerEvents: tickerHover ? 'auto' : 'none', transition: 'opacity 0.2s' }}
          >
            <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>‹</span>
          </button>
          <button
            onClick={() => scrollTicker('r')}
            aria-label="Scroll right"
            style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))', zIndex: 2, cursor: 'pointer', border: 'none', opacity: tickerHover ? 1 : 0, pointerEvents: tickerHover ? 'auto' : 'none', transition: 'opacity 0.2s' }}
          >
            <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>›</span>
          </button>

          <div id="nfl-ticker-scroll" style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <div style={{ display: 'flex', paddingLeft: 24 }}>
              {loadingWeek ? (
                <div style={{ padding: 16, fontSize: 10, color: '#A3A3A3', fontFamily: "'JetBrains Mono', monospace" }}>Loading games…</div>
              ) : games.length === 0 ? (
                <div style={{ padding: 16, fontSize: 10, color: '#A3A3A3', fontFamily: "'JetBrains Mono', monospace" }}>No games for that week yet — try another season or jump to Now.</div>
              ) : games.map((g, i) => <GameCard key={g.id} game={g} teamColorMap={teamColorMap} isFirst={i === 0} />)}
            </div>
          </div>
        </div>
      </section>

  {/* BELOW SCHEDULE: leaderboard / radars / every team */}
       <style>{`
        .nfl-dash-grid {
          display: grid;
          grid-template-columns: 1.3fr 1.5fr 1fr;
          grid-template-rows: auto auto;
          gap: 24px;
          align-items: start;
          margin-top: 16px;
        }
        .nfl-leaderboard-col { grid-column: 1; grid-row: 1; }
        .nfl-radar-col {
          grid-column: 2;
          grid-row: 1;
          border-left: 1px solid rgba(26,26,26,0.08);
          padding-left: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .nfl-every-team-col { grid-column: 3; grid-row: 1 / span 2; }
        .nfl-team-tiers-row { grid-column: 1 / span 2; grid-row: 2; }
        @media (max-width: 1024px) {
          .nfl-dash-grid {
            grid-template-columns: 1fr;
            grid-template-rows: auto;
          }
          .nfl-leaderboard-col, .nfl-radar-col, .nfl-every-team-col, .nfl-team-tiers-row {
            grid-column: 1;
            grid-row: auto;
          }
          .nfl-radar-col {
            border-left: none;
            padding-left: 0;
            border-top: 1px solid rgba(26,26,26,0.08);
            padding-top: 20px;
          }
        }
      `}</style>
 <div style={{ margin: '28px 24px 0' }}>
        <NflSubHeader />
        <div className="nfl-dash-grid">
          <div className="nfl-leaderboard-col">
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, margin: 0, color: '#1A1A1A', letterSpacing: '0.01em' }}>
                League Leaders
              </h3>
              <p style={{ fontSize: 12, color: '#78716C', margin: '4px 0 0', lineHeight: 1.5, maxWidth: 380 }}>
                Season totals across every category — tap a tab to switch stat, hover a player
                for their full radar profile next door.
              </p>
            </div>
            <NflLeaders
              qbLeaders={props.qbLeaders}
              rbLeaders={props.rbLeaders}
              wrLeaders={props.wrLeaders}
              intLeaders={props.intLeaders}
              tflLeaders={props.tflLeaders}
              fantasyLeaders={props.fantasyLeaders}
            />
            <div style={{ marginTop: 20 }}>
              <NflTeamYardsLeaders
                offense={props.teamYardsLeaders}
                defense={props.teamDefenseLeaders}
                fieldGoals={props.teamFgLeaders}
              />
            </div>
          </div>
 
          <div className="nfl-radar-col" style={{ gap: 12 }}>
            <div>
              <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, margin: 0, color: '#1A1A1A', letterSpacing: '0.01em' }}>
                Player Radars
              </h3>
              <p style={{ fontSize: 11, color: '#78716C', margin: '4px 0 0', lineHeight: 1.4, maxWidth: 320 }}>
                Percentile against this season's qualified field — not a raw number.
              </p>
            </div>
            <NflRadarCycler
              title="QB Room — Top 5"
              entries={props.top5QbRadars.map(r => ({
                name: r.name,
                volumeLabel: `${r.profile.attempts} att`,
                axes: r.profile.axes,
              }))}
            />
            <NflRadarCycler
              title="WR Room — Top 5"
              accentColor="#FDE047"
              entries={props.top5WrRadars.map(r => ({
                name: r.name,
                teamAbbr: r.teamAbbr,
                volumeLabel: `${r.profile.targets} tgt`,
                axes: r.profile.axes,
              }))}
            />
          </div>
 
          <div className="nfl-team-tiers-row">
            {/* SECTION DIVIDER */}
            <div style={{ height: 2, background: '#A3A3A3', margin: '8px 0 0' }} />
 
            <div style={{ marginTop: 28 }}>
              <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, margin: 0, color: '#1A1A1A', letterSpacing: '0.01em' }}>
                Team Tiers
              </h3>
              <p style={{ fontSize: 12, color: '#78716C', margin: '4px 0 16px', lineHeight: 1.5 }}>
                Every team plotted by offensive strength (right = better) against defensive
                strength (up = better) — same EPA/play numbers as each team's own page.
              </p>
              <TeamStrengthScatter points={props.teamStrength} teams={props.teams} />
            </div>
          </div>
 
  <div className="nfl-every-team-col">
            <TeamsByConference />
          </div>
        </div>
      </div>
 
      {/* SECTION DIVIDER */}
      <div style={{ height: 2, background: '#A3A3A3', margin: '32px 24px 0' }} />
 
      {/* LEAGUE TRENDS */}
      <div style={{ margin: '28px 24px 0' }}>
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, margin: 0, color: '#1A1A1A', letterSpacing: '0.01em' }}>
          League Trends
        </h3>
        <p style={{ fontSize: 12, color: '#78716C', margin: '4px 0 20px', lineHeight: 1.5, maxWidth: 560 }}>
         How the league has actually changed, year over year — coverage shells, target
          distribution, rush/pass tendency, and offensive scheme, each weighted by real play
          volume rather than a simple average across teams.
        </p>
 
        <div style={{ marginBottom: 24 }}>
          <NflMoversRow
            rush={props.biggestRushMover}
            pass={props.biggestPassMover}
            receiving={props.biggestReceivingMover}
            fantasy={props.biggestFantasyMover}
            team={props.biggestTeamMover}
          />
        </div>
 
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
 
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Coverage Shell — Share of Plays
            </div>
            {(() => {
              const { data, series } = pivotCategoryTrend(props.leagueCoverageTrend, (r) => r.coverageType, 5)
              return <NflTrendLineChart data={data} series={series} />
            })()}
          </div>
 
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Target Distribution — Share by Route
            </div>
            {(() => {
              const { data, series } = pivotCategoryTrend(props.leagueRouteTrend, (r) => r.route, 5)
              return <NflTrendLineChart data={data} series={series} />
            })()}
          </div>
 
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Rush Efficiency &amp; Pass Rate Over Expected
            </div>
            <NflTrendLineChart
              data={props.leagueRushPassTrend.map((p) => ({
                season: p.season,
                'Rush EPA/Carry': p.rushEpaPerCarry,
                'PROE': p.proe,
              }))}
              series={[
                { key: 'Rush EPA/Carry', label: 'Rush EPA/Carry', color: TREND_COLORS[0], unit: '' },
                { key: 'PROE', label: 'PROE', color: TREND_COLORS[1], unit: '%' },
              ]}
            />
          </div>
 
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Offensive Scheme Evolution
            </div>
            <NflTrendLineChart
              data={props.leagueSchemeTrend.map((p) => ({
                season: p.season,
                'Shotgun %': p.shotgunPct,
                'Play Action %': p.playActionRate,
                'Motion %': p.motionRate,
                'RPO %': p.rpoRate,
              }))}
              series={[
                { key: 'Shotgun %', label: 'Shotgun %', color: TREND_COLORS[0], unit: '%' },
                { key: 'Play Action %', label: 'Play Action %', color: TREND_COLORS[1], unit: '%' },
                { key: 'Motion %', label: 'Motion %', color: TREND_COLORS[2], unit: '%' },
                { key: 'RPO %', label: 'RPO %', color: TREND_COLORS[3], unit: '%' },
              ]}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
 
function GameCard({ game, teamColorMap, isFirst }: { game: ScheduleGame; teamColorMap: Map<string, string | undefined>; isFirst: boolean }) {
  const live = game.status === 'in_progress'
  const final = game.status === 'final'
  const awayColor = teamColorMap.get(game.awayId) ?? '#1A1A1A'
  const homeColor = teamColorMap.get(game.homeId) ?? '#1A1A1A'
  const hasEdge = game.edgeTeam != null && game.factorsLeanCount != null && game.factorsLeanCount > 0

  return (
    <Link
      href={game.href}
      style={{ minWidth: 168, height: 150, padding: '12px 14px 0', borderLeft: isFirst ? 'none' : '1px solid rgba(26,26,26,0.07)', cursor: 'pointer', textDecoration: 'none', display: 'block', flexShrink: 0, color: 'inherit', boxSizing: 'border-box' }}
    >
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, color: live ? '#FF5722' : '#A3A3A3' }}>
        {live ? '● LIVE' : final ? 'FINAL' : formatWhen(game.when)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {game.awayLogo ? <img src={game.awayLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} /> : <span style={{ width: 20, height: 20, background: '#EEE', borderRadius: '50%', flexShrink: 0 }} />}
        <b style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{game.awayId}</b>
        {(live || final) ? (
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{game.awayScore ?? 0}</span>
        ) : (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3' }}>{game.awayRecord ?? '—'}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {game.homeLogo ? <img src={game.homeLogo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} /> : <span style={{ width: 20, height: 20, background: '#EEE', borderRadius: '50%', flexShrink: 0 }} />}
        <b style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{game.homeId}</b>
        {(live || final) ? (
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{game.homeScore ?? 0}</span>
        ) : (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3' }}>{game.homeRecord ?? '—'}</span>
        )}
      </div>

      <div style={{ minHeight: 14, margin: '4px 0 8px', fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: '0.04em', fontWeight: hasEdge ? 700 : 400, color: hasEdge ? '#FF5722' : '#D4D0C8' }}>
        {hasEdge ? `${game.factorsLeanCount} factors lean ${game.edgeTeam}` : 'Edge coming'}
      </div>

      <div style={{ display: 'flex', height: 5 }}>
        <div style={{ flex: 1, background: awayColor }} />
        <div style={{ flex: 1, background: homeColor }} />
      </div>
    </Link>
  )
}