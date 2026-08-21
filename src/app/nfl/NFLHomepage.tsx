'use client'

/**
 * src/app/nfl/NFLHomepage.tsx
 *
 * Restructured to match MLBHomepage.tsx's layout shape:
 *   - Full-width ticker bar OUTSIDE the content container (was: two
 *     separate boxed ticker sections inside it). Uses a This Week /
 *     Recent Results toggle in place of MLB's Yesterday/Today/Tomorrow —
 *     copying MLB's daily toggle verbatim would be wrong for NFL's
 *     weekly rhythm, so the mechanism matches but the labels reflect
 *     what NFL data actually is (a week schedule + a completed-games
 *     log, not three adjacent days).
 *   - Content order now: Leaders+Standings -> Transactions -> News,
 *     mirroring MLB's Leaders+Standings -> Transactions -> Pipeline ->
 *     News with the two NFL-inapplicable sections (Highlights, MiLB
 *     Pipeline) omitted rather than faked.
 *
 * Data sources (all curl-verified — see the header comment in each file):
 *   - week schedule:      src/lib/nfl-schedule.ts (live ESPN scoreboard)
 *   - recent results:     src/lib/nfl/games-adapter.ts (Supabase-backed, post-game only)
 *   - leaders:            src/lib/nfl/leaders.ts (per-game "best performances," not cumulative — see file header)
 *   - news:               src/lib/nfl/news.ts
 *   - roster transactions: src/lib/nfl/roster-transactions.ts
 *   - teams/standings:    src/lib/nfl.ts
 *
 * Injury report intentionally dropped from this page per product
 * decision — src/lib/nfl/transactions.ts (the injury feed, misleadingly
 * named) and its fetch are untouched elsewhere, just not pulled in here.
 */

import { useState } from 'react'
import Link from 'next/link'
import type { NFLGame, NFLWeek } from '@/lib/nfl-schedule'
import type { NFLStatCategory } from '@/lib/nfl/leaders'
import type { NFLNewsItem } from '@/lib/nfl/news'
import type { NFLRosterTransaction } from '@/lib/nfl/roster-transactions'
import type { NFLDivision, NFLTeamCard } from '@/lib/nfl'
import FantasyOwnershipPreview from '@/components/nfl/FantasyOwnershipPreview'
import RosterConstructionPreview from '@/components/nfl/RosterConstructionPreview'
import type { FantasyOwnershipEntry, FantasyProTeam } from '@/lib/nfl/fantasy-ownership'
import type { TeamDepthChart } from '@/lib/nfl/depth-charts'

// ─── Types ────────────────────────────────────────────────

type Props = {
  upcomingGames: NFLGame[] | undefined | null   // "recent results" — completed games, Supabase-backed
  weekSchedule: NFLWeek | null                   // this week's schedule — live ESPN scoreboard
  leaders: Record<string, NFLStatCategory> | undefined | null
  news: NFLNewsItem[] | undefined | null
  transactions: NFLRosterTransaction[] | undefined | null
  standings: NFLDivision[] | undefined | null
  teams: NFLTeamCard[]
  season: number
  fantasyOwnership: FantasyOwnershipEntry[] | undefined | null
  fantasyProTeams: FantasyProTeam[] | undefined | null
  depthCharts: TeamDepthChart[] | undefined | null
}

// ─── Helpers ──────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    })
  } catch { return '—' }
}

function formatGameDay(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
    })
  } catch { return '—' }
}

// Transaction primary-action badge colors — grouped by what the move
// means for the player (good news / bad news / neutral roster churn).
function transactionBadgeInfo(action: string): { bg: string; color: string } {
  const GOOD = ['Signed', 'Re-signed', 'Activated', 'Reinstated', 'Promoted', 'Elevated', 'Waiver Claim']
  const BAD = ['Injured Reserve', 'Waived', 'Released', 'PS Release', 'Suspended', 'PUP List']
  if (GOOD.includes(action)) return { bg: 'rgba(21,128,61,0.10)', color: '#15803D' }
  if (BAD.includes(action)) return { bg: 'rgba(220,38,38,0.10)', color: '#DC2626' }
  return { bg: 'rgba(120,113,108,0.10)', color: '#78716C' }
}

// ─── Styles — ticker CSS restructured to be full-bleed (MLB's pattern:
// outer bar has no side borders and sits outside the max-width content
// column; ticker-track carries its own max-width + margin auto so the
// cards line up with the content below it) ───────────────────────────

const CSS = `
  .nfl-page { background: #FAF8F3; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
  .m { font-family: 'JetBrains Mono', monospace; }
  .s { font-family: 'Fraunces', serif; }
  .b { font-family: 'Bebas Neue', sans-serif; }

  /* Ticker — full-bleed bar at the top of the page, mirrors MLBHomepage.tsx */
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

  .nfl-main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
  .leaders-standings { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 32px; }
  @media (min-width: 768px) { .leaders-standings { grid-template-columns: 2fr 1fr; gap: 32px; } .nfl-main { padding: 24px 24px 48px; } }

  .news-grid { display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(26,26,26,0.06); }
  @media (min-width: 640px) { .news-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .news-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .transactions-sidebar { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 32px; }
  @media (min-width: 900px) { .transactions-sidebar { grid-template-columns: 2fr 1fr; gap: 32px; } }
  .preview-stack { display: flex; flex-direction: column; gap: 20px; }
`

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>§ {children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.1)' }} />
    </div>
  )
}

// ─── AVATAR (generic small headshot, used in Leaders) ──────────────────

export function Avatar({ url, size = 32 }: { url: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0EBE0', border: '1.5px solid #E5E2D9' }}>
      {url ? (
        <img
          src={url}
          alt=""
          width={size} height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => {
            const el = e.target as HTMLImageElement
            el.style.display = 'none'
            if (el.parentElement) el.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14px">🏈</div>'
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏈</div>
      )}
    </div>
  )
}

// ─── TICKER (top-of-page, full-bleed, with This Week / Recent Results toggle) ─

function TickerGameCard({ game }: { game: NFLGame }) {
  const isFinal = game.status === 'final'
  const isLive = game.status === 'in_progress'

  return (
    <Link href={`/nfl/${game.slug}`} className="ticker-card">
      <div className="m" style={{ fontSize: 9, fontWeight: 700, color: isLive ? '#FF5722' : '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        {isLive ? '● LIVE' : isFinal ? 'FINAL' : formatGameDay(game.date)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <img src={game.awayTeam.logo} alt="" width={20} height={20} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        <span className="m" style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{game.awayTeam.abbreviation}</span>
        {(isLive || isFinal)
          ? <span className="b" style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{game.awayScore ?? 0}</span>
          : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{game.awayTeam.record}</span>
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <img src={game.homeTeam.logo} alt="" width={20} height={20} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        <span className="m" style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{game.homeTeam.abbreviation}</span>
        {(isLive || isFinal)
          ? <span className="b" style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>{game.homeScore ?? 0}</span>
          : <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{game.homeTeam.record}</span>
        }
      </div>

      {!isLive && !isFinal && (
        <div className="m" style={{ fontSize: 9, color: '#A3A3A3', marginBottom: 8 }}>{formatGameTime(game.date)} ET</div>
      )}
      {(isLive || isFinal) && <div style={{ marginBottom: 8 }} />}

      <div style={{ display: 'flex', height: 5 }}>
        <div style={{ flex: 1, background: '#1A1A1A' }} />
        <div style={{ flex: 1, background: '#FF5722' }} />
      </div>
    </Link>
  )
}

// Preseason week options — ESPN numbering is offset by 1 from the
// "Preseason Week N" label (week=1 is the Hall of Fame Game, week=2 is
// Preseason Week 1). This offset was already curl-confirmed in an
// earlier pass, not re-guessed here. Regular-season weeks aren't in
// this list yet — add weeks 1-18 (seasontype=2) once the season starts.
const WEEK_OPTIONS: Array<{ espnWeek: number; seasontype: number; label: string }> = [
  { espnWeek: 1, seasontype: 1, label: 'HOF Game' },
  { espnWeek: 2, seasontype: 1, label: 'Preseason Wk 1' },
  { espnWeek: 3, seasontype: 1, label: 'Preseason Wk 2' },
  { espnWeek: 4, seasontype: 1, label: 'Preseason Wk 3' },
]

function Ticker({ recentGames, initialWeekGames, initialWeekLabel, season }: {
  recentGames: NFLGame[]
  initialWeekGames: NFLGame[]
  initialWeekLabel: string
  season: number
}) {
  const [view, setView] = useState<'week' | 'recent'>('week')
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null) // null = "current week" (server-fetched, no extra call)
  const [weekGames, setWeekGames] = useState<NFLGame[]>(initialWeekGames)
  const [weekLabel, setWeekLabel] = useState(initialWeekLabel)
  const [loading, setLoading] = useState(false)

  async function selectWeek(idx: number) {
    setSelectedWeekIdx(idx)
    setLoading(true)
    const opt = WEEK_OPTIONS[idx]
    try {
      const res = await fetch(`/api/nfl/week-schedule?week=${opt.espnWeek}&season=${season}&seasontype=${opt.seasontype}`)
      const data = await res.json()
      setWeekGames(data.games ?? [])
      setWeekLabel(opt.label)
    } catch (e) {
      console.error('week schedule fetch error:', e)
      setWeekGames([])
    } finally {
      setLoading(false)
    }
  }

  const active = view === 'week' ? weekGames : recentGames
  const sorted = [...active].sort((a, b) =>
    view === 'week'
      ? new Date(a.date).getTime() - new Date(b.date).getTime()
      : new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  function scroll(dir: 'l' | 'r') {
    const el = document.getElementById('nfl-ticker-scroll')
    if (el) el.scrollBy({ left: dir === 'r' ? 400 : -400, behavior: 'smooth' })
  }

  return (
    <div className="ticker-outer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', background: '#F5F1E8', borderBottom: '1px solid rgba(26,26,26,0.06)', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setView('recent')}
            className="m"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '3px 10px', border: 'none', cursor: 'pointer',
              background: view === 'recent' ? '#1A1A1A' : 'transparent',
              color: view === 'recent' ? '#FAF8F3' : '#A3A3A3', transition: 'all 0.1s',
            }}
          >
            Recent Results
          </button>

          {/* Divider between the results toggle and the week selector */}
          <div style={{ width: 1, background: 'rgba(26,26,26,0.12)', margin: '2px 4px' }} />

          {WEEK_OPTIONS.map((opt, i) => {
            const isActive = view === 'week' && selectedWeekIdx === i
            return (
              <button
                key={opt.label}
                onClick={() => { setView('week'); selectWeek(i) }}
                className="m"
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '3px 10px', border: 'none', cursor: 'pointer',
                  background: isActive ? '#1A1A1A' : 'transparent',
                  color: isActive ? '#FAF8F3' : '#A3A3A3', transition: 'all 0.1s',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sorted.length > 3 && (
            <span className="m" style={{ fontSize: 8, color: '#FF5722', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 3 }}>
              Scroll for more <span style={{ fontSize: 10 }}>→</span>
            </span>
          )}
          <span className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em' }}>Times in US/Eastern</span>
        </div>
      </div>

      <button className="ticker-arrow left" onClick={() => scroll('l')} aria-label="Scroll left">
        <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>‹</span>
      </button>
      <button className="ticker-arrow right" onClick={() => scroll('r')} aria-label="Scroll right">
        <span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>›</span>
      </button>

      <div className="ticker-wrap" id="nfl-ticker-scroll">
        <div className="ticker-track">
          {loading ? (
            <div className="m" style={{ padding: '16px', fontSize: 10, color: '#A3A3A3' }}>Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="m" style={{ padding: '16px', fontSize: 10, color: '#A3A3A3' }}>
              {view === 'week' ? 'No games scheduled this week.' : 'No completed games yet.'}
            </div>
          ) : (
            sorted.map(game => <TickerGameCard key={game.id} game={game} />)
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LEADERS ──────────────────────────────────────────────────────────

// Only 3 categories have real preseason data (see leaders.ts header for
// why passingTouchdowns/quarterbackRating/receptions/sacks/interceptions
// aren't here yet — needs box-score aggregation, not built).
const LEADER_TABS: Array<{ key: string; label: string; short: string; statTag: string }> = [
  { key: 'passingYards', label: 'Passing Yards', short: 'PASS', statTag: 'PASS YDS' },
  { key: 'rushingYards', label: 'Rushing Yards', short: 'RUSH', statTag: 'RUSH YDS' },
  { key: 'receivingYards', label: 'Receiving Yards', short: 'REC', statTag: 'REC YDS' },
]

function LeadersPanel({ leaders, teams }: { leaders: Record<string, NFLStatCategory>; teams: NFLTeamCard[] }) {
  const [activeTab, setActiveTab] = useState(LEADER_TABS[0].key)
  const current = leaders[activeTab]
  const activeMeta = LEADER_TABS.find(t => t.key === activeTab)!
  const teamById = new Map(teams.map(t => [t.id, t]))

  return (
    <div>
      <Sec>Best Performances — Preseason</Sec>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 14 }}>
        {LEADER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="m"
            title={t.label}
            style={{
              fontSize: 10, fontWeight: activeTab === t.key ? 700 : 400, letterSpacing: '0.04em',
              padding: '6px 12px 8px', cursor: 'pointer', border: 'none', background: 'transparent',
              color: activeTab === t.key ? '#FF5722' : '#A3A3A3',
              borderBottom: activeTab === t.key ? '2px solid #FF5722' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.1s',
            }}
          >
            {t.short}
          </button>
        ))}
      </div>

      {!current || current.leaders.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: '28px', textAlign: 'center' }}>
          <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet for this category.</div>
        </div>
      ) : (
        <div>
          {current.leaders.slice(0, 8).map((l, i) => {
            const team = teamById.get(l.teamId)
            return (
              <div
                key={l.athleteId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 10px 10px',
                  borderBottom: i < 7 ? '1px solid rgba(26,26,26,0.06)' : 'none',
                  borderLeft: `3px solid ${team?.color ?? 'transparent'}`,
                }}
              >
                <span className="m" style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#FF5722' : '#D4D0C8', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <Avatar url={l.headshotUrl} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="s" style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.playerName}</div>
                  {team && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      {team.logo && <img src={team.logo} alt="" width={11} height={11} />}
                      <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{team.abbreviation}</span>
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div className="s" style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? '#FF5722' : '#1A1A1A', lineHeight: 1 }}>{l.displayValue}</div>
                  <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                    {activeMeta.statTag}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── STANDINGS ────────────────────────────────────────────────────────

function Standings({ standings }: { standings: NFLDivision[] }) {
  const [conf, setConf] = useState<'AFC' | 'NFC'>('AFC')
  const divs = standings.filter(d => d.name.startsWith(conf))

  if (standings.length === 0) {
    return (
      <div>
        <Sec>Standings</Sec>
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
          <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>Standings available once the season begins.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Sec>Standings</Sec>
        <div style={{ display: 'flex', background: 'rgba(26,26,26,0.06)', padding: 2, flexShrink: 0, marginLeft: 12 }}>
          {(['AFC', 'NFC'] as const).map(c => (
            <button key={c} onClick={() => setConf(c)} className="m" style={{
              fontSize: 10, fontWeight: 700, padding: '4px 14px', border: 'none', cursor: 'pointer',
              background: conf === c ? '#1A1A1A' : 'transparent', color: conf === c ? '#FAF8F3' : '#A3A3A3',
              letterSpacing: '0.06em', transition: 'all 0.12s',
            }}>{c}</button>
          ))}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
        {divs.map((div, di) => (
          <div key={div.name}>
            <div style={{ padding: '5px 12px', background: '#F5F1E8', borderTop: di > 0 ? '2px solid rgba(26,26,26,0.08)' : 'none', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <span className="m" style={{ fontSize: 8, fontWeight: 700, color: '#A3A3A3', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{div.name}</span>
            </div>
            {div.teams.map((team, ti) => (
              <Link key={team.id} href={`/nfl/teams/${team.abbreviation.toLowerCase()}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', textDecoration: 'none', borderBottom: '1px solid rgba(26,26,26,0.04)', background: ti === 0 ? 'rgba(255,87,34,0.03)' : '#fff' }}>
                <span className="m" style={{ fontSize: 9, width: 14, flexShrink: 0, color: ti === 0 ? '#FF5722' : '#A3A3A3', fontWeight: ti === 0 ? 700 : 400 }}>{ti + 1}</span>
                {team.logo && <img src={team.logo} alt="" width={16} height={16} style={{ flexShrink: 0 }} />}
                <span className="s" style={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: ti === 0 ? 600 : 400 }}>{team.name}</span>
                <span className="m" style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', width: 22, textAlign: 'center' }}>{team.wins}</span>
                <span className="m" style={{ fontSize: 11, color: '#A3A3A3', width: 22, textAlign: 'center' }}>{team.losses}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────

function RosterTransactionsSection({ transactions }: { transactions: NFLRosterTransaction[] }) {
  if (transactions.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <Sec>Transactions</Sec>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
        {transactions.slice(0, 12).map((tx, i) => {
          const badge = transactionBadgeInfo(tx.primaryAction)
          return (
            <div key={tx.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderBottom: i < 11 ? '1px solid rgba(26,26,26,0.05)' : 'none' }}>
              <img
                src={tx.team.logo ?? ''}
                alt=""
                width={28} height={28}
                style={{ flexShrink: 0, marginTop: 2 }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em' }}>{tx.team.abbreviation}</span>
                  <span
                    className="m"
                    style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}
                  >
                    {tx.primaryAction}
                  </span>
                  <span className="m" style={{ fontSize: 8, color: '#A3A3A3' }}>{timeAgo(tx.date)}</span>
                </div>
                <div className="s" style={{ fontSize: 12.5, color: '#3D3D3D', lineHeight: 1.4 }}>{tx.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── NEWS ─────────────────────────────────────────────────────────────

function NewsSection({ news }: { news: NFLNewsItem[] }) {
  if (news.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <Sec>Around the League</Sec>
      <div className="news-grid">
        {news.slice(0, 9).map(item => (
          <a key={item.id} href={item.articleUrl ?? '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, padding: '14px 16px', background: '#fff', textDecoration: 'none' }}>
            {item.imageUrl && <div style={{ width: 56, height: 56, flexShrink: 0, background: '#F5F1E8', overflow: 'hidden' }}><img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.4, marginBottom: 4 }}>{item.headline}</div>
              <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{timeAgo(item.published)}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────

export default function NFLHomepage({
  upcomingGames,
  weekSchedule,
  leaders,
  news,
  transactions,
  standings,
  teams,
  season,
  fantasyOwnership,
  fantasyProTeams,
  depthCharts,
}: Props) {
  const safeRecentGames = upcomingGames ?? []
  const safeWeekGames = weekSchedule?.games ?? []
  const safeLeaders = leaders ?? {}
  const safeNews = news ?? []
  const safeTransactions = transactions ?? []
  const safeStandings = standings ?? []
  const safeFantasyOwnership = fantasyOwnership ?? []
  const safeFantasyProTeams = fantasyProTeams ?? []
  const safeDepthCharts = depthCharts ?? []
  const weekLabel = weekSchedule ? weekSchedule.label : 'This Week'

  return (
    <div className="nfl-page">
      <style>{CSS}</style>

      <Ticker
        recentGames={safeRecentGames}
        initialWeekGames={safeWeekGames}
        initialWeekLabel={weekLabel}
        season={season}
      />

      <div className="nfl-main">
        <div style={{ paddingTop: 8, marginBottom: 24 }}>
          <div className="m" style={{ fontSize: 9, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>§ The Edge · NFL</div>
          <h1 className="s" style={{ fontSize: 34, fontWeight: 700, color: '#1A1A1A', lineHeight: 1 }}>
            NFL<span style={{ color: '#FF5722' }}>.</span>
          </h1>
        </div>

        <div className="leaders-standings">
          <LeadersPanel leaders={safeLeaders} teams={teams} />
          <Standings standings={safeStandings} />
        </div>

        {/* Transactions (left) + Fantasy Numbers / Roster Construction previews (right) */}
        <div className="transactions-sidebar">
          <RosterTransactionsSection transactions={safeTransactions} />
          <div className="preview-stack">
            <div>
              <Sec>Fantasy Numbers</Sec>
              <FantasyOwnershipPreview players={safeFantasyOwnership} proTeams={safeFantasyProTeams} />
            </div>
            <div>
              <Sec>Roster Construction</Sec>
              <RosterConstructionPreview charts={safeDepthCharts} teams={teams} />
            </div>
          </div>
        </div>

        <NewsSection news={safeNews} />
      </div>
    </div>
  )
} 
