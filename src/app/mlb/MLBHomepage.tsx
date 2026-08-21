'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { MLBDivisionStandings, MLBStatLeader, MLBNewsItem } from '@/lib/mlb-homepage'
import type { MLBGame } from '@/lib/mlb'
import { slugifyGame, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName, MLB_TEAMS } from '@/lib/teams'
import type { EdgePrediction } from '@/lib/edge-fetch'
import type { FantasyPicksByType } from '@/lib/fantasy'
import type { TeamTransaction } from '@/lib/team-transactions'
import type { Top3Snapshot } from '@/lib/series-top3-snapshot'

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
  today: string
  isPro: boolean
  activeIL: TeamTransaction[]
  recentTransactions: TeamTransaction[]
  statLeaders?: Record<string, MLBStatLeader[]>
  fantasyPicks?: FantasyPicksByType
  fantasyIsStale?: boolean
  prospects?: Prospect[]
  top3Snapshots?: Map<number, Top3Snapshot>
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

function ago(iso: string) {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

function fCount(p: EdgePrediction) {
  if (!p?.components) return null
  const c = p.components as Record<string, number>
  return {
    count: Object.values(c).filter(v => (p.predicted_winner === 'home' ? v > 0 : v < 0)).length,
    total: Object.keys(c).length,
  }
}

function teamColors(teamId: number): { primary: string; secondary: string } {
  const t = MLB_TEAMS.find(t => {
    const idMap: Record<string, number> = {
      yankees: 147, 'red-sox': 111, 'blue-jays': 141, orioles: 110, rays: 139,
      guardians: 114, tigers: 116, royals: 118, twins: 142, 'white-sox': 145,
      astros: 117, angels: 108, athletics: 133, mariners: 136, rangers: 140,
      braves: 144, marlins: 146, mets: 121, phillies: 143, nationals: 120,
      cubs: 112, reds: 113, brewers: 158, pirates: 134, cardinals: 138,
      diamondbacks: 109, rockies: 115, dodgers: 119, padres: 135, giants: 137,
    }
    return idMap[t.slug] === teamId
  })
  return { primary: t?.primary_color ?? '#1A1A1A', secondary: t?.secondary_color ?? '#A3A3A3' }
}

/* ── styles ────────────────────────────────────────────── */

const CSS = `
  .mlb-page { background: #FAF8F3; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
  .m { font-family: 'JetBrains Mono', monospace; }
  .s { font-family: 'Fraunces', serif; }
  .b { font-family: 'Bebas Neue', sans-serif; }

  /* Ticker */
  .ticker-outer { position: relative; background: #fff; border-bottom: 1px solid rgba(26,26,26,0.1); }
  .ticker-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .ticker-wrap::-webkit-scrollbar { display: none; }
  .ticker-track { display: flex; max-width: 1400px; margin: 0 auto; }
  .ticker-card { min-width: 168px; padding: 12px 14px 0; border-left: 1px solid rgba(26,26,26,0.07); cursor: pointer; text-decoration: none; display: block; flex-shrink: 0; transition: background 0.1s; }
  .ticker-card:first-child { border-left: none; }
  .ticker-card:hover { background: #FAF8F3; }
  .ticker-arrow { position: absolute; top: 32px; bottom: 0; width: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0)); z-index: 2; cursor: pointer; border: none; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
  .ticker-arrow.right { background: linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0)); right: 0; }
  .ticker-arrow.left { left: 0; }
  .ticker-outer:hover .ticker-arrow { opacity: 1; pointer-events: auto; }

  /* Main layout */
  .mlb-main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
  .leaders-standings { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 32px; }
  @media (min-width: 768px) { .leaders-standings { grid-template-columns: 2fr 1fr; gap: 32px; } .mlb-main { padding: 24px 24px 48px; } }

  /* Pipeline */
  .pipeline-section { margin-bottom: 32px; }
  .pipeline-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  @media (min-width: 480px) { .pipeline-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 768px) { .pipeline-grid { grid-template-columns: 1fr 1fr 1fr; } }
  @media (min-width: 1100px) { .pipeline-grid { grid-template-columns: repeat(4, 1fr); } }

  /* News */
  .news-grid { display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(26,26,26,0.06); }
  @media (min-width: 640px) { .news-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .news-grid { grid-template-columns: 1fr 1fr 1fr; } }

  /* Team pill scroller */
  .team-pills { display: flex; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 4px; }
  .team-pills::-webkit-scrollbar { display: none; }

  /* Highlights */
  .highlights-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 640px) { .highlights-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1100px) { .highlights-grid { grid-template-columns: 2fr 1fr 1fr; } }
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

/* ── VIDEO PLAYER ──────────────────────────────────────── */

function HighlightPlayer({
  title,
  src,
  poster,
  duration,
}: {
  title: string
  src: string
  poster?: string
  duration?: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', background: '#000' }}>
        <video
          controls
          playsInline
          preload="metadata"
          poster={poster}
          style={{ width: '100%', display: 'block', aspectRatio: '16/9', background: '#000' }}
          src={src}
        />
      </div>
      <div style={{ padding: '12px 14px', flex: 1 }}>
        <div className="s" style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.3, marginBottom: 4 }}>
          {title}
        </div>
        {duration && (
          <div className="m" style={{ fontSize: 9, color: '#A3A3A3', letterSpacing: '0.06em' }}>
            {duration}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── HIGHLIGHTS SECTION (Dynamic Yesterday Highlights) ───── */

function GameHighlights() {
  const [clips, setClips] = useState<Array<{ title: string; src: string; poster?: string; duration?: string; gameSlug?: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchYesterdayHighlights() {
      try {
        // Calculate yesterday's date relative to Eastern Time
        const d = new Date()
        d.setDate(d.getDate() - 1)
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

        // Fetch yesterday's games
        const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&hydrate=team`)
        const schedData = await schedRes.json()
        const gamesList = schedData.dates?.[0]?.games || []

        const finalGames = gamesList.filter((g: any) => g.status?.abstractGameState === 'Final')
        if (!finalGames.length) {
          setLoading(false)
          return
        }

        // Parallel fetch for video highlights
        const contentPromises = finalGames.slice(0, 8).map((g: any) =>
          fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/content`)
            .then(r => r.json())
            .then(data => ({ game: g, data }))
            .catch(() => null)
        )

        const results = await Promise.all(contentPromises)
        const extractedClips: typeof clips = []

        for (const res of results) {
          if (!res?.data?.highlights?.highlights?.items) continue
          const items = res.data.highlights.highlights.items
          for (const item of items) {
            const mp4Playback = item.playbacks?.find((p: any) => p.name?.includes('mp4Avc') || p.url?.endsWith('.mp4'))
            const poster = item.image?.cuts?.find((c: any) => c.width >= 640)?.src || item.image?.cuts?.[0]?.src
            if (mp4Playback?.url) {
              extractedClips.push({
                title: item.blurb || item.headline || `${res.game.teams.away.team.abbreviation} @ ${res.game.teams.home.team.abbreviation} Highlight`,
                src: mp4Playback.url,
                poster,
                duration: item.duration,
                gameSlug: slugifyGame(res.game),
              })
            }
          }
        }

        // Shuffle & select 3 random highlights
        const shuffled = extractedClips.sort(() => 0.5 - Math.random()).slice(0, 3)
        setClips(shuffled)
      } catch (err) {
        console.error('Failed to fetch yesterday highlights:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchYesterdayHighlights()
  }, [])

  if (loading) {
    return (
      <div style={{ marginBottom: 32 }}>
        <Sec>Yesterday's Highlights</Sec>
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center' }}>
          <span className="m" style={{ fontSize: 10, color: '#A3A3A3' }}>Loading yesterday's highlights...</span>
        </div>
      </div>
    )
  }

  if (!clips.length) {
    return (
      <div style={{ marginBottom: 32 }}>
        <Sec>Yesterday's Highlights</Sec>
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center' }}>
          <span className="s" style={{ fontSize: 13, color: '#A3A3A3', fontStyle: 'italic' }}>No highlight videos available from yesterday's games.</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <Sec>Yesterday's Highlights</Sec>
      </div>

      <div className="highlights-grid">
        {clips.map((c, i) => (
          <HighlightPlayer key={i} title={c.title} src={c.src} poster={c.poster} duration={c.duration} />
        ))}
      </div>
    </div>
  )
}

/* ── TICKER (With Calendar & Timezone Navigation) ──────── */

function Ticker({ games: initialGames, predictions, top3Snapshots }: { games: MLBGame[]; predictions: Map<number, EdgePrediction>; top3Snapshots?: Map<number, Top3Snapshot> }) {
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
              const awayC = teamColors(away.team.id)
              const homeC = teamColors(home.team.id)
              const fc = pred ? fCount(pred) : null
              const leanAbbr = pred?.predicted_winner === 'home' ? home.team.abbreviation : away.team.abbreviation
              const tier = pred?.confidence_tier
              const awayScore = (game as any).teams?.away?.score
              const homeScore = (game as any).teams?.home?.score

              const awaySnap = selectedDate === 'today' ? top3Snapshots?.get(away.team.id) : undefined
              const homeSnap = selectedDate === 'today' ? top3Snapshots?.get(home.team.id) : undefined
              const top3EdgeCount = (awaySnap?.edge_count ?? 0) + (homeSnap?.edge_count ?? 0)

              return (
                <Link key={game.gamePk} href={`/mlb/${slugifyGame(game)}`} className="ticker-card">
                  <div className="m" style={{ fontSize: 9, fontWeight: 700, color: live ? '#FF5722' : '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {live ? '● LIVE' : final ? 'FINAL' : fmt(game.gameDate)}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <img src={teamLogoUrl(away.team.id)} alt="" width={20} height={20} style={{ flexShrink: 0 }} />
                    <span className="m" style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{away.team.abbreviation}</span>
                    {(live || final)
                      ? <span className="b" style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{awayScore ?? 0}</span>
                      : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{away.leagueRecord?.wins}-{away.leagueRecord?.losses}</span>
                    }
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <img src={teamLogoUrl(home.team.id)} alt="" width={20} height={20} style={{ flexShrink: 0 }} />
                    <span className="m" style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{home.team.abbreviation}</span>
                    {(live || final)
                      ? <span className="b" style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{homeScore ?? 0}</span>
                      : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{home.leagueRecord?.wins}-{home.leagueRecord?.losses}</span>
                    }
                  </div>

                  <div style={{ minHeight: 16, marginBottom: 8 }}>
                    {fc && tier && tier !== 'tossup' && (
                      <div className="m" style={{ fontSize: 8, fontWeight: 700, color: '#FF5722', letterSpacing: '0.04em' }}>
                        {fc.count}/{fc.total} factors lean {leanAbbr}
                      </div>
                    )}
                    {tier === 'tossup' && (
                      <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em' }}>Even match-up</div>
                    )}
                    {!pred && (
                      <div className="m" style={{ fontSize: 8, color: '#D4D0C8', letterSpacing: '0.04em' }}>Edge coming</div>
                    )}
                    {top3EdgeCount > 0 && (
                      <div className="m" style={{ fontSize: 8, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.04em', marginTop: 3 }}>
                        ⊕ {top3EdgeCount} to watch this series
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', height: 5 }}>
                    <div style={{ flex: 1, background: awayC.primary }} />
                    <div style={{ flex: 1, background: homeC.primary }} />
                  </div>
                </Link>
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

function LeaderPanel({
  title, tabs, activeTab, onTab, leaders, accent,
}: {
  title: string
  tabs: { key: string; label: string; short: string }[]
  activeTab: string
  onTab: (k: string) => void
  leaders: MLBStatLeader[]
  accent: string
}) {
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
          <Link key={l.rank} href={`/stats?player=${l.personId}`} style={{ textDecoration: 'none', display: 'block' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 20px' }}>
        <LeaderPanel title="Batting" tabs={BATTING_TABS} activeTab={batTab} onTab={setBatTab} leaders={batLeaders} accent="#FF5722" />
        <div style={{ background: 'rgba(26,26,26,0.08)', alignSelf: 'stretch' }} />
        <LeaderPanel title="Pitching" tabs={PITCHING_TABS} activeTab={pitTab} onTab={setPitTab} leaders={pitLeaders} accent="#185FA5" />
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

      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
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
                    {team.name.split(' ').slice(-1)[0]}
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
  const all = [...activeIL.slice(0, 4), ...recentTransactions.slice(0, 6)].slice(0, 8)
  if (!all.length) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <Sec>Transactions</Sec>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
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

const TEAM_LIST = MLB_TEAMS.map(t => {
  const idMap: Record<string, number> = {
    yankees: 147, 'red-sox': 111, 'blue-jays': 141, orioles: 110, rays: 139,
    guardians: 114, tigers: 116, royals: 118, twins: 142, 'white-sox': 145,
    astros: 117, angels: 108, athletics: 133, mariners: 136, rangers: 140,
    braves: 144, marlins: 146, mets: 121, phillies: 143, nationals: 120,
    cubs: 112, reds: 113, brewers: 158, pirates: 134, cardinals: 138,
    diamondbacks: 109, rockies: 115, dodgers: 119, padres: 135, giants: 137,
  }
  return { id: idMap[t.slug] ?? 0, abbr: t.abbrev, name: t.short, slug: t.slug }
})
  .filter(t => t.id > 0)
  .sort((a, b) => a.name.localeCompare(b.name))

function Pipeline({
  prospects = [],
  fantasyPicks,
}: {
  prospects?: Prospect[]
  fantasyPicks?: FantasyPicksByType
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
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: '28px', textAlign: 'center' }}>
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
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
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
  today,
  isPro,
  activeIL,
  recentTransactions,
  statLeaders,
  fantasyPicks,
  prospects = [],
  top3Snapshots,
}: Props) {
  const hasStats = statLeaders && Object.values(statLeaders).some(l => l.length > 0)

  return (
    <div className="mlb-page">
      <style>{CSS}</style>

      {/* 1. TICKER WITH DATE CONTROLS */}
      <Ticker games={games} predictions={predictions} top3Snapshots={top3Snapshots} />

      {/* 2. MAIN CONTAINER */}
      <div className="mlb-main">
        {/* HIGHLIGHTS SECTION */}
        <GameHighlights />

        {/* 3. LEADERS + STANDINGS */}
        <div className="leaders-standings">
          <div>{hasStats && <Leaders statLeaders={statLeaders!} />}</div>
          <div><Standings standings={standings} /></div>
        </div>

        {/* 4. TRANSACTIONS */}
        <Transactions activeIL={activeIL} recentTransactions={recentTransactions} />

        {/* 5. MILB PIPELINE */}
        <Pipeline prospects={prospects} fantasyPicks={fantasyPicks} />

        {/* 6. NEWS */}
        {news.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <Sec>Around the league</Sec>
            <div className="news-grid">
              {news.slice(0, 9).map((item, i) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, padding: '14px 16px', background: '#fff', textDecoration: 'none' }}>
                  {item.image && (
                    <div style={{ width: 56, height: 56, flexShrink: 0, background: '#F5F1E8', overflow: 'hidden' }}>
                      <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="s" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.4, marginBottom: 4 }}>
                      {item.headline}
                    </div>
                    <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {ago(item.published)}
                      {item.source ? ` · ${item.source}` : ''}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}