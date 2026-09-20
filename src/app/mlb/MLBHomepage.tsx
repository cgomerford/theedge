'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { MLBDivisionStandings, MLBStatLeader, MLBNewsItem } from '@/lib/mlb-homepage'
import type { MLBGame } from '@/lib/mlb'
import { slugifyGame, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName, MLB_TEAMS, shareDisplayName } from '@/lib/teams'
import type { EdgePrediction } from '@/lib/edge-fetch'
import type { TeamTransaction } from '@/lib/team-transactions'
import StandingsChart from '@/components/StandingsChart'
import { TeamLeaderboardTable } from '@/components/LeagueStandardStatsSection'
import NewsFeedSidebar from '@/components/NewsFeedSidebar'
import type { LeagueTeamStatRow } from '@/lib/league-standard-stats'
import TeamRadarSlideshow from '@/components/TeamRadarSlideshow'
import type { TeamRadarRow } from '@/lib/team-radar'
import SeasonShapeRiver from '@/components/SeasonShapeRiver'
import LeverageBoard from '@/components/LeverageBoard'
import EngineRoom from '@/components/EngineRoom'
import DeserveToWinWaterfall from '@/components/DeserveToWinWaterfall'
import PlayerSearch from '@/components/PlayerSearch'

// Same sitewide flag as src/app/page.tsx and src/proxy.ts — flip all three
// on Sept 18. Duplicated per-file rather than threaded as a prop because
// that's the existing pattern this app already uses for it.
const MAINTENANCE_MODE = false

export type Prospect = {
  rank: number
  player_name: string
  position: string
  team_name: string
  parent_team_id?: number | null
  level: string
  eta?: string
  age?: string
  playerId?: number | null
  ops?: number
}

type Props = {
  standings: MLBDivisionStandings[]
  games: MLBGame[]
  predictions: Map<number, EdgePrediction>
  news: MLBNewsItem[]
  activeIL: TeamTransaction[]
  recentTransactions: TeamTransaction[]
  statLeaders?: Record<string, MLBStatLeader[]>
  prospects?: Prospect[]
  leagueStandardStats: LeagueTeamStatRow[]
  teamRadarRows: TeamRadarRow[]
  teamRadarFipConstant: number
  // Server component (async, fetches its own data) — can't be imported and
  // rendered directly from this 'use client' file, so page.tsx renders it
  // and passes the element down instead.
  articlesTeaser: React.ReactNode
}

/* ── helpers ───────────────────────────────────────────── */

function fmt(d: string) {
  try {
    return new Date(d).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    })
  } catch {
    return '—'
  }
}

function fCount(p: EdgePrediction) {
  if (!p?.components) return null
  const c = p.components as Record<string, number>
  return {
    count: Object.values(c).filter(v => (p.predicted_winner === 'home' ? v > 0 : v < 0)).length,
    total: Object.keys(c).length,
  }
}

/* ── styles ────────────────────────────────────────────── */

const CSS = `
  /* .m/.s/.b used to switch between JetBrains Mono/Fraunces/Bebas Neue for
     labels/headlines/hero numbers — Outfit (the sitewide brand font, see
     layout.tsx/globals.css) is now the standard everywhere, so all three
     just point at it. Kept as named classes rather than deleted so the
     ~50 existing className="m"/"s"/"b" usages below don't all need
     touching individually — each still gets its own size/weight/spacing
     via inline styles, just on the one shared typeface now. */
  .mlb-page { background: #FAF8F3; min-height: 100vh; font-family: 'Outfit', sans-serif; }
  .m { font-family: 'Outfit', sans-serif; }
  .s { font-family: 'Outfit', sans-serif; }
  .b { font-family: 'Outfit', sans-serif; }

  /* Ticker — streamlined: individual rounded cards with real gaps instead
     of a hairline-divided strip, tighter per-card content (no team-color
     bottom bar, no secondary cross-sell line) so more games fit on screen
     at once and each one reads faster. */
  .ticker-outer { position: relative; background: #FAF8F3; border-bottom: 1px solid rgba(26,26,26,0.08); }
  .ticker-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 10px 16px 12px; }
  .ticker-wrap::-webkit-scrollbar { display: none; }
  .ticker-track { display: flex; gap: 8px; max-width: 1400px; margin: 0 auto; }
  .ticker-card { position: relative; overflow: hidden; min-width: 150px; padding: 10px 12px; background: #fff; border: 1px solid rgba(26,26,26,0.08); border-radius: 10px; display: block; flex-shrink: 0; transition: border-color 0.1s, box-shadow 0.1s; }
  .ticker-card:hover { border-color: rgba(26,26,26,0.2); box-shadow: 0 2px 8px rgba(26,26,26,0.06); }
  .ticker-card-overlay { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: stretch; justify-content: center; gap: 4px; padding: 8px; background: rgba(26,26,26,0.9); opacity: 0; pointer-events: none; transition: opacity 0.15s; }
  .ticker-card:hover .ticker-card-overlay { opacity: 1; pointer-events: auto; }
  .ticker-card-overlay-btn { font-family: 'Outfit', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-align: center; text-decoration: none; color: #1A1A1A; background: #fff; border-radius: 6px; padding: 6px 4px; transition: background 0.1s, color 0.1s; }
  .ticker-card-overlay-btn:hover { background: #FF5722; color: #fff; }
  .ticker-arrow { position: absolute; top: 32px; bottom: 0; width: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0)); z-index: 2; cursor: pointer; border: none; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
  .ticker-arrow.right { background: linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0)); right: 0; }
  .ticker-arrow.left { left: 0; }
  .ticker-outer:hover .ticker-arrow { opacity: 1; pointer-events: auto; }

  /* Main layout */
  /* Widened from 1400 — the comprehensive leaderboard's 11 columns (team +
     10 standard stats) need real room; 1400 forced it into a horizontal
     scroll even full-width. */
  .mlb-main { max-width: 1600px; margin: 0 auto; padding: 24px 16px 48px; }
  /* Content + sidebar — same lg:grid-cols-[1fr_320px] pattern the root
     homepage uses for its own leaderboards/articles/news sidebar. */
  .mlb-layout { display: grid; grid-template-columns: 1fr; gap: 24px; }
  @media (min-width: 1024px) { .mlb-layout { grid-template-columns: 1fr 320px; gap: 32px; } }
  .mlb-sidebar { min-width: 0; }
  /* Full-bleed section — breaks out of the sidebar column so wide content
     (the leaderboard table) gets the whole row's width instead of being
     squeezed into the ~1fr main column. */
  .mlb-full-bleed { grid-column: 1 / -1; }
  /* Single source of section spacing — replaces the old scattered mix of
     inline marginBottom:32 styles and per-component CSS margins, which
     would otherwise double up now that every section also gets wrapped
     in .mlb-section. */
  .mlb-section { margin-bottom: 32px; }
  .mlb-section:last-child { margin-bottom: 0; }
  .mlb-standings-row { display: grid; grid-template-columns: 1fr; gap: 24px; }
  @media (min-width: 768px) { .mlb-standings-row { grid-template-columns: 1fr 1.2fr; gap: 32px; } .mlb-main { padding: 24px 24px 48px; } }
  .mlb-leaders-row { display: grid; grid-template-columns: 1fr; gap: 24px; }
  @media (min-width: 900px) { .mlb-leaders-row { grid-template-columns: 1fr 1fr; gap: 32px; } }

  /* Pipeline */
  .pipeline-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  @media (min-width: 480px) { .pipeline-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 768px) { .pipeline-grid { grid-template-columns: 1fr 1fr 1fr; } }
  @media (min-width: 1100px) { .pipeline-grid { grid-template-columns: repeat(4, 1fr); } }

  /* News */
  .news-grid { display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(26,26,26,0.06); border: 1px solid rgba(26,26,26,0.08); border-radius: 12px; overflow: hidden; }
  @media (min-width: 640px) { .news-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .news-grid { grid-template-columns: 1fr 1fr 1fr; } }

  /* Team pill scroller */
  .team-pills { display: flex; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 4px; }
  .team-pills::-webkit-scrollbar { display: none; }

`

/* ── section label ─────────────────────────────────────── */

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        § {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.1)' }} />
    </div>
  )
}


/* ── ALL 30 TEAMS — quick nav ──────────────────────────── */
//
// Standings (further down) already links each row to its team page, but
// only for the currently-selected league and buried past the fold — this
// is a flat, always-visible way to jump straight to any of the 30 team
// pages from the top of the page, independent of tonight's schedule.

const ALL_TEAMS_SORTED = [...MLB_TEAMS].sort((a, b) => a.short.localeCompare(b.short))

function AllTeamsStrip() {
  return (
    <div className="mlb-section">
      <Sec>All 30 teams</Sec>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ALL_TEAMS_SORTED.map(t => (
          <Link
            key={t.slug}
            href={`/mlb/teams/${t.slug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px 5px 6px',
              background: '#fff',
              border: '1px solid rgba(26,26,26,0.08)',
              borderRadius: 999,
              textDecoration: 'none',
              transition: 'border-color 0.1s',
            }}
          >
            <img src={teamLogoUrl(t.id)} alt="" width={16} height={16} style={{ flexShrink: 0 }} />
            <span className="m" style={{ fontSize: 10, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.03em' }}>{t.abbrev}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── TICKER (With Calendar & Timezone Navigation) ──────── */

function Ticker({ games: initialGames, predictions }: { games: MLBGame[]; predictions: Map<number, EdgePrediction> }) {
  const [selectedDate, setSelectedDate] = useState<'yesterday' | 'today' | 'tomorrow'>('today')
  const [tickerGames, setTickerGames] = useState<MLBGame[]>(initialGames)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedDate === 'today') {
      setTickerGames(initialGames)
      return
    }

    async function fetchDateGames() {
      setLoading(true)
      try {
        const now = new Date()
        const offset = selectedDate === 'yesterday' ? -1 : 1
        now.setDate(now.getDate() + offset)

        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=team,linescore`)
        const data = await res.json()
        const fetchedGames = data.dates?.[0]?.games || []
        setTickerGames(fetchedGames)
      } catch (e) {
        console.error('Failed to fetch schedule for date:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchDateGames()
  }, [selectedDate, initialGames])

  const sorted = [...tickerGames].sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())

  function scroll(dir: 'l' | 'r') {
    const el = document.getElementById('ticker-scroll')
    if (el) el.scrollBy({ left: dir === 'r' ? 400 : -400, behavior: 'smooth' })
  }

  return (
    <div className="ticker-outer">
      {/* Date Bar for UK / Late Night Support */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', background: '#F5F1E8', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['yesterday', 'today', 'tomorrow'] as const).map(d => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className="m"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '3px 10px',
                border: 'none',
                cursor: 'pointer',
                background: selectedDate === d ? '#1A1A1A' : 'transparent',
                color: selectedDate === d ? '#FAF8F3' : '#A3A3A3',
                transition: 'all 0.1s',
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em' }}>
          Times in US/Eastern (EDT)
        </span>
      </div>

      <button className="ticker-arrow left" onClick={() => scroll('l')} aria-label="Scroll left">
        <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>‹</span>
      </button>
      <button className="ticker-arrow right" onClick={() => scroll('r')} aria-label="Scroll right">
        <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>›</span>
      </button>

      <div className="ticker-wrap" id="ticker-scroll">
        <div className="ticker-track">
          {loading ? (
            <div className="m" style={{ padding: '16px', fontSize: 10, color: '#A3A3A3' }}>Loading games...</div>
          ) : sorted.length === 0 ? (
            <div className="m" style={{ padding: '16px', fontSize: 10, color: '#A3A3A3' }}>No games scheduled</div>
          ) : (
            sorted.map(game => {
              const live = game.status.abstractGameState === 'Live'
              const final = game.status.abstractGameState === 'Final'
              const pred = predictions.get(game.gamePk)
              const away = game.teams.away
              const home = game.teams.home
              const fc = pred ? fCount(pred) : null
              const leanAbbr = pred?.predicted_winner === 'home' ? home.team.abbreviation : away.team.abbreviation
              const tier = pred?.confidence_tier
              const awayScore = (game as any).teams?.away?.score
              const homeScore = (game as any).teams?.home?.score

              const gameSlug = slugifyGame(game)

              return (
                <div key={game.gamePk} className="ticker-card">
                  <div className="ticker-card-overlay">
                    {final ? (
                      <Link href={`/mlb/${gameSlug}/postgame`} className="ticker-card-overlay-btn">Postgame</Link>
                    ) : (
                      <>
                        <Link href={`/mlb/${gameSlug}/scout-report`} className="ticker-card-overlay-btn">Scout Report</Link>
                        <Link href={`/mlb/${gameSlug}`} className="ticker-card-overlay-btn">Game Preview</Link>
                      </>
                    )}
                  </div>

                  <div className="m" style={{ fontSize: 9, fontWeight: 700, color: live ? '#FF5722' : '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {live ? '● LIVE' : final ? 'FINAL' : fmt(game.gameDate)}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <img src={teamLogoUrl(away.team.id)} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
                    <span className="m" style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{away.team.abbreviation}</span>
                    {(live || final)
                      ? <span className="b" style={{ fontSize: 16, color: '#1A1A1A', lineHeight: 1 }}>{awayScore ?? 0}</span>
                      : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{away.leagueRecord?.wins}-{away.leagueRecord?.losses}</span>
                    }
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <img src={teamLogoUrl(home.team.id)} alt="" width={18} height={18} style={{ flexShrink: 0 }} />
                    <span className="m" style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{home.team.abbreviation}</span>
                    {(live || final)
                      ? <span className="b" style={{ fontSize: 16, color: '#1A1A1A', lineHeight: 1 }}>{homeScore ?? 0}</span>
                      : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{home.leagueRecord?.wins}-{home.leagueRecord?.losses}</span>
                    }
                  </div>

                  {fc && tier && tier !== 'tossup' && (
                    <div className="m" style={{ fontSize: 8, fontWeight: 700, color: '#FF5722', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>
                      {fc.count}/{fc.total} lean {leanAbbr}
                    </div>
                  )}
                  {tier === 'tossup' && (
                    <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>Even match-up</div>
                  )}
                  {!pred && (
                    <div className="m" style={{ fontSize: 8, color: '#D4D0C8', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>Edge coming</div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ── STAT LEADERS ──────────────────────────────────────── */

const BATTING_TABS = [
  { key: 'homeRuns', label: 'Home Runs', short: 'HR' },
  { key: 'battingAverage', label: 'Batting Average', short: 'AVG' },
  { key: 'rbi', label: 'RBI', short: 'RBI' },
  { key: 'stolenBases', label: 'Stolen Bases', short: 'SB' },
  { key: 'onBasePlusSlugging', label: 'OPS', short: 'OPS' },
]

const PITCHING_TABS = [
  { key: 'earnedRunAverage', label: 'ERA', short: 'ERA' },
  { key: 'wins', label: 'Wins', short: 'W' },
  { key: 'strikeOuts', label: 'Strikeouts', short: 'SO' },
  { key: 'walksAndHitsPerInningPitched', label: 'WHIP', short: 'WHIP' },
]

const SUB_STATS: Record<string, (l: MLBStatLeader) => string> = {
  battingAverage: l => `${l.statValue} AVG`,
  homeRuns: l => `${l.statValue} HR`,
  rbi: l => `${l.statValue} RBI`,
  stolenBases: l => `${l.statValue} SB`,
  onBasePlusSlugging: l => `${l.statValue} OPS`,
  earnedRunAverage: l => `${l.statValue} ERA`,
  wins: l => `${l.statValue} W`,
  strikeOuts: l => `${l.statValue} K`,
  walksAndHitsPerInningPitched: l => `${l.statValue} WHIP`,
}

// ── "Back of the baseball card" hover sheet ────────────────────────────
//
// Hovering a leaderboard row fetches that player's real full season line
// PLUS his real by-month splits (one combined MLB Stats API call —
// stats=season,byMonth in a single request, curl-verified — per person,
// cached per session so re-hovering the same player doesn't refetch) and
// shows both as a comprehensive card-back stat sheet with a small trend
// sparkline, instead of just the single stat the row itself is ranked on.

const CARD_SEASON = new Date().getFullYear()
type CardStat = Record<string, string | number> | null
type CardMonth = { month: number; value: number }
type CardData = { season: CardStat; months: CardMonth[] } | null

const BATTING_CARD_ROWS: [string, string][] = [
  ['AVG', 'avg'], ['OBP', 'obp'], ['SLG', 'slg'], ['OPS', 'ops'],
  ['HR', 'homeRuns'], ['RBI', 'rbi'], ['R', 'runs'], ['SB', 'stolenBases'],
  ['H', 'hits'], ['2B', 'doubles'], ['3B', 'triples'], ['BB', 'baseOnBalls'],
  ['SO', 'strikeOuts'], ['AB', 'atBats'], ['PA', 'plateAppearances'], ['HBP', 'hitByPitch'],
]
const PITCHING_CARD_ROWS: [string, string][] = [
  ['ERA', 'era'], ['WHIP', 'whip'], ['W-L', ''], ['SV', 'saves'],
  ['SO', 'strikeOuts'], ['IP', 'inningsPitched'], ['BB', 'baseOnBalls'], ['H', 'hits'],
  ['HR', 'homeRuns'], ['K/9', 'strikeoutsPer9Inn'], ['BB/9', 'walksPer9Inn'], ['HR/9', 'homeRunsPer9'],
  ['GS', 'gamesStarted'], ['QS', ''], ['HLD', 'holds'], ['BS', 'blownSaves'],
]
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function TrendSparkline({ months, higherIsBetter }: { months: CardMonth[]; higherIsBetter: boolean }) {
  if (months.length < 2) return null
  const values = months.map(m => m.value)
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const W = 100, H = 28, PAD = 3
  const x = (i: number) => (months.length === 1 ? W / 2 : PAD + (i / (months.length - 1)) * (W - PAD * 2))
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(m.value)}`).join(' ')
  const last = months[months.length - 1], first = months[0]
  const improving = higherIsBetter ? last.value >= first.value : last.value <= first.value
  const color = improving ? '#34D399' : '#F87171'

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>By month</span>
        <span className="m" style={{ fontSize: 8, color, fontWeight: 700 }}>{improving ? '▲ trending up' : '▼ trending down'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 32 }} preserveAspectRatio="none">
        <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        {months.map((m, i) => (
          <circle key={m.month} cx={x(i)} cy={y(m.value)} r={i === months.length - 1 ? 2.2 : 1.4} fill={color} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {months.map(m => (
          <span key={m.month} className="m" style={{ fontSize: 7, color: '#8A8577' }}>{MONTH_NAMES[m.month]}</span>
        ))}
      </div>
    </div>
  )
}

function PlayerCardBack({ leader, group, data, loading }: { leader: MLBStatLeader; group: 'hitting' | 'pitching'; data: CardData; loading: boolean }) {
  const rows = group === 'hitting' ? BATTING_CARD_ROWS : PITCHING_CARD_ROWS
  const stat = data?.season ?? null
  const trendKey = group === 'hitting' ? 'ops' : 'era'
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 30,
        top: '100%',
        left: 0,
        marginTop: 6,
        width: 260,
        maxWidth: '90vw',
        background: '#1A1A1A',
        color: '#FAF8F3',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.06)' }}>
        <img src={leader.headshot} alt="" width={34} height={34} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="s" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leader.name}</div>
          <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{leader.teamAbbr} · {CARD_SEASON} season</div>
        </div>
      </div>
      <div style={{ padding: '10px 12px' }}>
        {loading || !stat ? (
          <div className="m" style={{ fontSize: 9, color: '#A3A3A3', padding: '6px 0' }}>{loading ? 'Loading…' : 'Stats unavailable'}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
              {rows.map(([label, key]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                  <span className="m" style={{ fontSize: 10.5, fontWeight: 700, color: '#FAF8F3' }}>
                    {label === 'W-L' ? `${stat.wins ?? 0}-${stat.losses ?? 0}` : label === 'QS' ? '—' : (stat[key] ?? '—')}
                  </span>
                </div>
              ))}
            </div>
            {data?.months && data.months.length >= 2 && (
              <TrendSparkline
                months={data.months.map(m => ({ month: m.month, value: m.value }))}
                higherIsBetter={trendKey !== 'era'}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LeaderPanel({
  title, tabs, activeTab, onTab, leaders, accent, group,
}: {
  title: string
  tabs: { key: string; label: string; short: string }[]
  activeTab: string
  onTab: (k: string) => void
  leaders: MLBStatLeader[]
  accent: string
  group: 'hitting' | 'pitching'
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [cardCache, setCardCache] = useState<Record<number, CardData>>({})
  const [loadingId, setLoadingId] = useState<number | null>(null)

  function handleHover(personId: number) {
    setHoveredId(personId)
    if (cardCache[personId] !== undefined) return
    setLoadingId(personId)
    const trendKey = group === 'hitting' ? 'ops' : 'era'
    fetch(`https://statsapi.mlb.com/api/v1/people/${personId}/stats?stats=season,byMonth&group=${group}&season=${CARD_SEASON}`)
      .then(res => res.json())
      .then(json => {
        const statsByType: any[] = json.stats ?? []
        const season = statsByType.find(s => s.type?.displayName === 'season')?.splits?.[0]?.stat ?? null
        const monthSplits: any[] = statsByType.find(s => s.type?.displayName === 'byMonth')?.splits ?? []
        const months: CardMonth[] = monthSplits
          .map(s => ({ month: Number(s.month), value: parseFloat(s.stat?.[trendKey] ?? 'NaN') }))
          .filter(m => !Number.isNaN(m.value))
          .sort((a, b) => a.month - b.month)
        setCardCache(prev => ({ ...prev, [personId]: season ? { season, months } : null }))
      })
      .catch(() => setCardCache(prev => ({ ...prev, [personId]: null })))
      .finally(() => setLoadingId(null))
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <div className="m" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A1A1A', marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className="m"
              style={{
                fontSize: 10,
                fontWeight: activeTab === t.key ? 700 : 400,
                letterSpacing: '0.04em',
                padding: '6px 12px 8px',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: activeTab === t.key ? accent : '#A3A3A3',
                borderBottom: activeTab === t.key ? `2px solid ${accent}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'all 0.1s',
              }}
            >
              {t.short}
            </button>
          ))}
        </div>
      </div>

      <div>
        {leaders.slice(0, 5).map((l, i) => (
          <div key={l.personId} style={{ position: 'relative' }} onMouseEnter={() => handleHover(l.personId)} onMouseLeave={() => setHoveredId(null)}>
            <Link href={`/stats?player=${l.personId}`} style={{ textDecoration: 'none', display: 'block' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: i < 4 ? '1px solid rgba(26,26,26,0.06)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="m" style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? accent : '#D4D0C8', width: 18, flexShrink: 0, textAlign: 'right' }}>
                  {l.rank}
                </span>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: '#F0EBE0',
                    border: i === 0 ? `2px solid ${accent}` : '2px solid #F0EBE0',
                  }}
                >
                  <img
                    src={l.headshot}
                    alt={l.name}
                    width={42}
                    height={42}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="s" style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.name}
                  </div>
                  <div className="m" style={{ fontSize: 10, color: '#A3A3A3', marginTop: 1 }}>
                    {l.teamAbbr}
                    {SUB_STATS[activeTab] ? ` · ${SUB_STATS[activeTab](l)}` : ''}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
                  <div className="s" style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? accent : '#1A1A1A', lineHeight: 1 }}>
                    {l.statValue}
                  </div>
                  <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                    {BATTING_TABS.concat(PITCHING_TABS).find(t => t.key === activeTab)?.short}
                  </div>
                </div>
              </div>
            </Link>
            {hoveredId === l.personId && (
              <PlayerCardBack leader={l} group={group} data={cardCache[l.personId] ?? null} loading={loadingId === l.personId} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Leaders({ statLeaders }: { statLeaders: Record<string, MLBStatLeader[]> }) {
  const [batTab, setBatTab] = useState(BATTING_TABS[0].key)
  const [pitTab, setPitTab] = useState(PITCHING_TABS[0].key)

  const batLeaders = statLeaders[batTab] ?? []
  const pitLeaders = statLeaders[pitTab] ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <Sec>League leaders</Sec>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <LeaderPanel title="Batting" tabs={BATTING_TABS} activeTab={batTab} onTab={setBatTab} leaders={batLeaders} accent="#FF5722" group="hitting" />
        <div style={{ borderTop: '1px solid rgba(26,26,26,0.08)' }} />
        <LeaderPanel title="Pitching" tabs={PITCHING_TABS} activeTab={pitTab} onTab={setPitTab} leaders={pitLeaders} accent="#185FA5" group="pitching" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(26,26,26,0.08)', marginTop: 16 }}>
        <Link href="/stats" className="m" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none' }}>
          Full leaderboards →
        </Link>
        <Link href="/lab" className="m" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A3A3A3', textDecoration: 'none' }}>
          Compare players in dashboard →
        </Link>
      </div>
    </div>
  )
}

/* ── STANDINGS ─────────────────────────────────────────── */

function Standings({ standings }: { standings: MLBDivisionStandings[] }) {
  const [league, setLeague] = useState<'AL' | 'NL'>('AL')
  const divs = standings.filter(d => d.league === league)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Sec>Standings</Sec>
        <div style={{ display: 'flex', background: 'rgba(26,26,26,0.06)', padding: 2, flexShrink: 0, marginLeft: 12 }}>
          {(['AL', 'NL'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className="m"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 14px',
                border: 'none',
                cursor: 'pointer',
                background: league === l ? '#1A1A1A' : 'transparent',
                color: league === l ? '#FAF8F3' : '#A3A3A3',
                letterSpacing: '0.06em',
                transition: 'all 0.12s',
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        {divs.map((div, di) => (
          <div key={di}>
            <div style={{ padding: '5px 12px', background: '#F5F1E8', borderTop: di > 0 ? '2px solid rgba(26,26,26,0.08)' : 'none', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <span className="m" style={{ fontSize: 8, fontWeight: 700, color: '#A3A3A3', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {div.division.replace(/^(AL|NL)\s+/, '')}
              </span>
            </div>
            {div.teams.map((team, ti) => {
              const slug = findTeamByName(team.name)?.slug ?? team.abbreviation?.toLowerCase()
              const first = ti === 0
              return (
                <Link
                  key={ti}
                  href={`/mlb/teams/${slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    textDecoration: 'none',
                    borderBottom: '1px solid rgba(26,26,26,0.04)',
                    background: first ? 'rgba(255,87,34,0.03)' : '#fff',
                  }}
                >
                  <span className="m" style={{ fontSize: 9, width: 14, flexShrink: 0, color: first ? '#FF5722' : '#A3A3A3', fontWeight: first ? 700 : 400 }}>
                    {ti + 1}
                  </span>
                  <img src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`} alt="" width={16} height={16} style={{ flexShrink: 0 }} />
                  <span className="s" style={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: first ? 600 : 400 }}>
                    {shareDisplayName(team.name)}
                  </span>
                  <span className="m" style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', width: 22, textAlign: 'center' }}>
                    {team.wins}
                  </span>
                  <span className="m" style={{ fontSize: 11, color: '#A3A3A3', width: 22, textAlign: 'center' }}>
                    {team.losses}
                  </span>
                  <span className="m" style={{ fontSize: 10, color: '#A3A3A3', width: 26, textAlign: 'right' }}>
                    {team.gb}
                  </span>
                  <span
                    className="m"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      width: 26,
                      textAlign: 'right',
                      color: team.streak.startsWith('W') ? '#059669' : team.streak.startsWith('L') ? '#DC2626' : '#A3A3A3',
                    }}
                  >
                    {team.streak}
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── TRANSACTIONS ──────────────────────────────────────── */

function TxBadge({ cat }: { cat: string }) {
  const m: Record<string, { c: string; b: string }> = {
    IL: { c: '#b45309', b: '#fffbeb' },
    TRADE: { c: '#1d4ed8', b: '#eff6ff' },
    SIGNING: { c: '#15803d', b: '#f0fdf4' },
    CALLUP: { c: '#7c3aed', b: '#faf5ff' },
    ACTIVATION: { c: '#0369a1', b: '#f0f9ff' },
    DFA: { c: '#dc2626', b: '#fef2f2' },
  }
  const s = m[cat] ?? { c: '#6b7280', b: '#f9fafb' }
  return (
    <span className="m" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: s.c, background: s.b, padding: '2px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {cat}
    </span>
  )
}

function Transactions({ activeIL, recentTransactions }: { activeIL: TeamTransaction[]; recentTransactions: TeamTransaction[] }) {
  // recentTransactions is a general feed of recent moves, so a player just
  // placed on IL shows up there AND in activeIL (his current active IL
  // stint) — same transaction_id in both lists. Dedupe before slicing, or
  // that one move eats two of the panel's 8 slots and renders as a
  // same-key React warning (and a real user-facing duplicate row).
  const seenTx = new Set<number>()
  const all = [...activeIL.slice(0, 4), ...recentTransactions.slice(0, 6)]
    .filter(tx => (seenTx.has(tx.transaction_id) ? false : (seenTx.add(tx.transaction_id), true)))
    .slice(0, 8)
  if (!all.length) return null
  return (
    <div>
      <Sec>Transactions</Sec>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        {all.map((tx, i) => (
          <div key={tx.transaction_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < all.length - 1 ? '1px solid rgba(26,26,26,0.05)' : 'none' }}>
            {(tx.team_id ?? tx.to_team_id) && <img src={`https://www.mlbstatic.com/team-logos/${tx.team_id ?? tx.to_team_id}.svg`} alt="" width={18} height={18} style={{ flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.player_name}
              </div>
              {tx.injury_reason && <div className="m" style={{ fontSize: 9, color: '#A3A3A3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.injury_reason}</div>}
            </div>
            <TxBadge cat={tx.category} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── MILB PIPELINE ─────────────────────────────────────── */

const TEAM_LIST = MLB_TEAMS.map(t => ({ id: t.id, abbr: t.abbrev, name: t.short, slug: t.slug }))
  .sort((a, b) => a.name.localeCompare(b.name))

function Pipeline({
  prospects = [],
}: {
  prospects?: Prospect[]
}) {
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const SHOW_PER_TEAM = 5
  const SHOW_DEFAULT = 10

  const selectedTeamObj = TEAM_LIST.find(t => t.id === selectedTeam)

  const filtered: Prospect[] = selectedTeam
    ? prospects.filter(p => {
        if (p.parent_team_id != null) return p.parent_team_id === selectedTeam
        const hint = (selectedTeamObj?.name ?? '').toLowerCase().split(' ').pop() ?? ''
        return hint && p.team_name?.toLowerCase().includes(hint)
      })
    : prospects

  const displayed: Prospect[] = selectedTeam
    ? (() => {
        const aaa = filtered.filter(p => p.level === 'AAA').slice(0, SHOW_PER_TEAM)
        const aa = filtered.filter(p => p.level === 'AA').slice(0, SHOW_PER_TEAM)
        return [...aaa, ...aa]
      })()
    : expanded
    ? filtered
    : filtered.slice(0, SHOW_DEFAULT)

  const hasMore = !selectedTeam && filtered.length > SHOW_DEFAULT

  function opsColor(ops: number | undefined) {
    if (!ops) return '#A3A3A3'
    if (ops >= 0.9) return '#FF5722'
    if (ops >= 0.8) return '#059669'
    return '#185FA5'
  }

  function opsBarWidth(ops: number | undefined) {
    if (!ops) return 0
    return Math.min(100, Math.round((ops / 1.1) * 100))
  }

  return (
    <div className="pipeline-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          § {selectedTeam ? `${selectedTeamObj?.name ?? ''} Farm System` : 'MiLB Pipeline — AAA & AA'}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.1)' }} />
        <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          {selectedTeam ? 'Top 5 per level by OPS' : 'Sorted by OPS · AAA + AA'}
        </span>
      </div>

      <div className="team-pills" style={{ marginBottom: 14 }}>
        <button
          onClick={() => {
            setSelectedTeam(null)
            setExpanded(false)
          }}
          className="m"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '5px 12px',
            cursor: 'pointer',
            border: 'none',
            flexShrink: 0,
            background: selectedTeam === null ? '#1A1A1A' : 'rgba(26,26,26,0.06)',
            color: selectedTeam === null ? '#FAF8F3' : '#A3A3A3',
            transition: 'all 0.1s',
          }}
        >
          All
        </button>
        {TEAM_LIST.map(t => (
          <button
            key={t.id}
            onClick={() => {
              setSelectedTeam(selectedTeam === t.id ? null : t.id)
              setExpanded(false)
            }}
            className="m"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '4px 8px',
              cursor: 'pointer',
              border: 'none',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.1s',
              background: selectedTeam === t.id ? '#FF5722' : 'rgba(26,26,26,0.06)',
              color: selectedTeam === t.id ? '#FAF8F3' : '#A3A3A3',
            }}
          >
            <img src={`https://www.mlbstatic.com/team-logos/${t.id}.svg`} alt="" width={13} height={13} />
            {t.abbr}
          </button>
        ))}
      </div>

      {displayed.length > 0 ? (
        <>
          {selectedTeam ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {['AAA', 'AA'].map(level => {
                const levelPlayers = displayed.filter(p => p.level === level)
                if (levelPlayers.length === 0) return null
                return (
                  <div key={level}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="m" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: level === 'AAA' ? '#185FA5' : '#7c3aed' }}>
                        {level}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.08)' }} />
                      <span className="m" style={{ fontSize: 8, color: '#A3A3A3' }}>Top {levelPlayers.length} by OPS</span>
                    </div>
                    <div className="pipeline-grid">
                      {levelPlayers.map((p, i) => (
                        <ProspectCard key={i} p={p} opsColor={opsColor} opsBarWidth={opsBarWidth} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="pipeline-grid">
              {displayed.map((p, i) => (
                <ProspectCard key={i} p={p} opsColor={opsColor} opsBarWidth={opsBarWidth} />
              ))}
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                onClick={() => setExpanded(e => !e)}
                className="m"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '10px 28px',
                  cursor: 'pointer',
                  border: '1px solid rgba(26,26,26,0.15)',
                  background: '#FAF8F3',
                  color: '#1A1A1A',
                  transition: 'all 0.1s',
                }}
              >
                {expanded ? 'Show less' : `Show all ${filtered.length} players →`}
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, padding: '28px', textAlign: 'center' }}>
          <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>
            {selectedTeam ? `No MiLB players found for ${selectedTeamObj?.name ?? 'this organisation'}.` : 'No MiLB data available.'}
          </div>
          <div className="m" style={{ fontSize: 9, color: '#D4D0C8', marginTop: 6 }}>
            OPS leaders from MLB Stats API — AAA (sportId 11) + AA (sportId 12)
          </div>
        </div>
      )}
    </div>
  )
}

function ProspectCard({
  p,
  opsColor,
  opsBarWidth,
}: {
  p: Prospect
  opsColor: (ops: number | undefined) => string
  opsBarWidth: (ops: number | undefined) => number
}) {
  const rankColor = p.rank <= 10 ? '#FF5722' : p.rank <= 30 ? '#185FA5' : '#A3A3A3'
  const headshotUrl = p.playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.playerId}/headshot/67/current`
    : null
  const levelColor = p.level === 'AAA' ? '#185FA5' : p.level === 'AA' ? '#7c3aed' : '#6b7280'

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            background: '#F0EBE0',
            border: `1.5px solid ${p.ops && p.ops >= 0.9 ? '#FF5722' : '#E5E2D9'}`,
          }}
        >
          {headshotUrl ? (
            <img
              src={headshotUrl}
              alt={p.player_name}
              width={44}
              height={44}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => {
                const el = e.target as HTMLImageElement
                el.style.display = 'none'
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="s" style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.player_name}
          </div>
          <div className="m" style={{ fontSize: 9, color: '#A3A3A3', marginTop: 2 }}>
            {[p.position, p.team_name].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div className="m" style={{ fontSize: 11, fontWeight: 700, color: rankColor, lineHeight: 1 }}>
            #{p.rank}
          </div>
          <div className="m" style={{ fontSize: 8, color: levelColor, fontWeight: 700, marginTop: 2 }}>
            {p.level}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <span className="m" style={{ fontSize: 8, fontWeight: 700, color: levelColor, background: `${levelColor}12`, padding: '2px 7px' }}>
          {p.level}
        </span>
        {p.age && <span className="m" style={{ fontSize: 8, color: '#A3A3A3', padding: '2px 0' }}>Age {p.age}</span>}
        {p.eta && <span className="m" style={{ fontSize: 8, color: '#059669', padding: '2px 0' }}>ETA {p.eta}</span>}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Season OPS
          </span>
          <span className="s" style={{ fontSize: 18, fontWeight: 700, color: opsColor(p.ops), lineHeight: 1 }}>
            {p.ops != null ? p.ops.toFixed(3) : '—'}
          </span>
        </div>
        <div style={{ height: 4, background: '#F0EBE0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${opsBarWidth(p.ops)}%`, background: opsColor(p.ops), transition: 'width 0.3s' }} />
        </div>
        {p.ops != null && (
          <div className="m" style={{ fontSize: 8, color: '#A3A3A3', marginTop: 4, textAlign: 'right' }}>
            {p.ops >= 0.9 ? 'Elite' : p.ops >= 0.8 ? 'Strong' : p.ops >= 0.7 ? 'Average' : 'Below avg'} · OPS
          </div>
        )}
      </div>
    </div>
  )
}

/* ── MAIN ──────────────────────────────────────────────── */

export default function MLBHomepage({
  standings,
  games,
  predictions,
  news,
  activeIL,
  recentTransactions,
  statLeaders,
  prospects = [],
  leagueStandardStats,
  teamRadarRows,
  teamRadarFipConstant,
  articlesTeaser,
}: Props) {
  const hasStats = statLeaders && Object.values(statLeaders).some(l => l.length > 0)

  return (
    <div className="mlb-page">
      <style>{CSS}</style>

      {/* PLAYER SEARCH — top right, real typeahead (src/lib/lab.ts's real
          MLB /people/search, same one the root homepage uses), clicking a
          result navigates straight to that player's /mlb/players/[id]
          page. */}
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '12px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <PlayerSearch maintenance={MAINTENANCE_MODE} sport="MLB" rounded />
        </div>
      </div>

      {/* 1. TICKER WITH DATE CONTROLS — tonight's action first */}
      <Ticker games={games} predictions={predictions} />

      {/* 2. MAIN CONTAINER — main column + sidebar. "Around the league"
          news is pulled for now; the sidebar just carries The Edge's own
          articles. */}
      <div className="mlb-main">
        <div className="mlb-layout">
          <div>
            {/* ALL 30 TEAMS — quick nav, always visible regardless of
                tonight's slate */}
            <AllTeamsStrip />

            {/* PLAYER LEADERBOARDS + COMPREHENSIVE LEADERBOARD — leaders in
                their own single column on the left, the full sortable
                all-30-teams table on the right (same row, filling the
                space that used to sit empty next to a half-width Leaders
                panel). */}
            <div className="mlb-section mlb-leaders-row">
              {hasStats && <Leaders statLeaders={statLeaders!} />}
              <div>
                <div className="text-[13px] font-serif font-bold text-[#1A1A1A]">Comprehensive leaderboard</div>
                <div className="m" style={{ fontSize: 10.5, color: '#8A8577', marginTop: 2, marginBottom: 4 }}>
                  Every team, every standard stat — click a column to sort. Click a team to open its page.
                </div>
                <TeamLeaderboardTable rows={leagueStandardStats} />
              </div>
            </div>

            {/* STANDINGS + STANDINGS PROGRESSION — division rank/streak on
                the left; on the right, the SAME per-game win-progression
                chart used on a team's own page, scoped by division (AL
                East, NL West, etc. — pick any of the 6), not a whole-league
                view. */}
            <div className="mlb-section mlb-standings-row">
              <div><Standings standings={standings} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, padding: 16 }}>
                  <StandingsChart defaultDivision="AL East" />
                </div>
                {/* MOST ROUNDED TEAM — 20-axis radar (10 pitching, 10
                    batting), auto-advancing through all 30 teams, pausing
                    on hover; hovering a vertex shows the full roster line
                    behind that number. Stacked under the progression
                    chart, in the same right-hand column. */}
                <TeamRadarSlideshow rows={teamRadarRows} cFIP={teamRadarFipConstant} />
              </div>
            </div>

            {/* SEASON SHAPE RIVER — the first of the new "cockpit" charts:
                a rolling real run-differential stream for one team's real
                season, with a real opponent-quality band and real
                trade/call-up/signing/IL ticks. Own team + rival selectors,
                lazy-fetched client-side. */}
            <div className="mlb-section">
              <SeasonShapeRiver standings={standings} />
            </div>

            {/* LEVERAGE BOARD — real biggest win-probability swings of the
                season, off MLB's own per-at-bat odds feed (already used on
                game pages), not a modeled "clutch" score. */}
            <div className="mlb-section">
              <LeverageBoard />
            </div>

            {/* ENGINE ROOM — real runs-above-average value per player (not
                WAR — see src/lib/engine-room.ts), tagged by how they
                actually joined the roster this season via real
                transactions. */}
            <div className="mlb-section">
              <EngineRoom />
            </div>

            {/* DESERVE-TO-WIN WATERFALL — real Pythagorean-expected wins
                walked to the real record through real close-game luck,
                plus a real league-wide "who's owed / who's banked" sort. */}
            <div className="mlb-section">
              <DeserveToWinWaterfall standings={standings} />
            </div>
          </div>

          {/* SIDEBAR — real news scraped from around the league, plus The
              Edge's own articles, same components/shape the root homepage
              already uses in its own sidebar. Transactions and the MiLB
              pipeline are pulled for now. */}
          <div className="mlb-sidebar">
            <NewsFeedSidebar items={news.slice(0, 9).map(n => ({ id: n.id, headline: n.headline, link: n.link, published: n.published }))} />
            {articlesTeaser}
          </div>
        </div>
      </div>
    </div>
  )
}