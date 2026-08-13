'use client'

/**
 * src/app/nfl/NFLHomepage.tsx
 *
 * Restyled to mirror MLBHomepage.tsx's structure and visual language.
 * Key structural difference from MLB: NFL doesn't have games "today" in
 * the way baseball does (games only Thu/Sun/Mon, occasional Sat late
 * season), so the schedule renders grouped by upcoming game day rather
 * than as a single always-populated daily ticker. On off-days this
 * section shows the next game day's slate instead of an empty state.
 *
 * Data sources (all curl-verified — see the header comment in each file):
 *   - games:        src/lib/nfl-schedule.ts (existing — NOT yet moved into
 *                     src/lib/nfl/, the folder migration from earlier hasn't
 *                     been run. Update this import if/when it is.)
 *   - leaders:       src/lib/nfl/leaders.ts (new)
 *   - news:          src/lib/nfl/news.ts (new) — NOT the NFLNewsItem type
 *                     in src/lib/nfl.ts, which is unverified and should be
 *                     deprecated once nothing else depends on it
 *   - transactions:  src/lib/nfl/transactions.ts (new, read-side of the
 *                     now-live fetch_nfl_transactions.py sync)
 *   - teams/standings: src/lib/nfl.ts (existing — same migration note as games)
 */

import { useState } from 'react'
import Link from 'next/link'
import type { NFLGame } from '@/lib/nfl-schedule'
import type { NFLStatCategory } from '@/lib/nfl/leaders'
import type { NFLNewsItem } from '@/lib/nfl/news'
import type { NFLTransaction } from '@/lib/nfl/transactions'
import type { NFLDivision, NFLTeamCard } from '@/lib/nfl'

// ─── Types ────────────────────────────────────────────────

type Props = {
  upcomingGames: NFLGame[] | undefined | null
  leaders: Record<string, NFLStatCategory> | undefined | null
  news: NFLNewsItem[] | undefined | null
  transactions: NFLTransaction[] | undefined | null
  standings: NFLDivision[] | undefined | null
  teams: NFLTeamCard[]
  season: number
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

function formatGameDayLabel(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York',
    })
  } catch { return dateStr }
}

// Groups games by their calendar day (America/New_York) — NFL's slate
// naturally clusters into 1-3 distinct days per week, unlike MLB's
// every-day schedule, so a flat ticker doesn't fit; day headers do.
function groupGamesByDay(games: NFLGame[] | undefined | null): Array<{ dateKey: string; label: string; games: NFLGame[] }> {
  if (!Array.isArray(games) || games.length === 0) return []
  const groups = new Map<string, NFLGame[]>()
  for (const g of games) {
    const dateKey = new Date(g.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD, stable sort key
    if (!groups.has(dateKey)) groups.set(dateKey, [])
    groups.get(dateKey)!.push(g)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, gs]) => ({
      dateKey,
      label: formatGameDayLabel(gs[0].date),
      games: gs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    }))
}

// Confirmed via curl: ESPN's injury feed tags plenty of non-injury
// practice-report chatter (e.g. "Love said working with WRs has helped")
// with status "Active" — it's not actually an injury designation, it's
// the default when a story got swept into the injuries endpoint without
// a real injury attached. Giving "Active" its own green "Available"
// treatment (rather than lumping it in with a generic default) makes
// that distinction visible instead of implying everyone listed is hurt.
function statusBadgeInfo(status: string | null): { bg: string; color: string; label: string } {
  switch (status) {
    case 'Out':
      return { bg: 'rgba(220,38,38,0.10)', color: '#DC2626', label: 'Out' }
    case 'Injured Reserve':
      return { bg: 'rgba(220,38,38,0.10)', color: '#DC2626', label: 'IR' }
    case 'Doubtful':
      return { bg: 'rgba(217,119,6,0.10)', color: '#D97706', label: 'Doubtful' }
    case 'Questionable':
      return { bg: 'rgba(217,119,6,0.10)', color: '#D97706', label: 'Questionable' }
    case 'Active':
      return { bg: 'rgba(21,128,61,0.10)', color: '#15803D', label: 'Available' }
    default:
      return { bg: 'rgba(120,113,108,0.10)', color: '#78716C', label: status ?? 'Unknown' }
  }
}

// ESPN headshot CDN pattern — confirmed via the og:image meta tag on a
// real player profile page (Jahmyr Gibbs, athlete id 4429795):
//   a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/{id}.png
// Not independently curl-verified as a standalone endpoint (it's a CDN
// image URL, not a JSON API), but the pattern is consistent and this is
// exactly the kind of thing to double check visually once wired up —
// if headshots come back broken/missing, this URL template is the
// first place to look, not something to have blind faith in.
function headshotUrl(athleteId: string): string {
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athleteId}.png&w=100&h=100`
}

// ─── Styles (mirrors MLBHomepage.tsx's CSS block) ────────────────────

const CSS = `
  .nfl-page { background: #FAF8F3; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
  .m { font-family: 'JetBrains Mono', monospace; }
  .s { font-family: 'Fraunces', serif; }
  .b { font-family: 'Bebas Neue', sans-serif; }

  .nfl-main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
  .leaders-standings { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 32px; }
  @media (min-width: 768px) { .leaders-standings { grid-template-columns: 2fr 1fr; gap: 32px; } .nfl-main { padding: 24px 24px 48px; } }

  .schedule-day-scroll { display: flex; gap: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 4px; }
  .schedule-day-scroll::-webkit-scrollbar { display: none; }
  .game-card { min-width: 200px; background: #fff; border: 1px solid rgba(26,26,26,0.08); padding: 14px; flex-shrink: 0; text-decoration: none; display: block; transition: border-color 0.1s; }
  .game-card:hover { border-color: rgba(26,26,26,0.2); }

  .news-grid { display: grid; grid-template-columns: 1fr; gap: 1px; background: rgba(26,26,26,0.06); }
  @media (min-width: 640px) { .news-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1000px) { .news-grid { grid-template-columns: 1fr 1fr 1fr; } }
`

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>§ {children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.1)' }} />
    </div>
  )
}

// ─── SCHEDULE (day-grouped, NFL-specific) ────────────────────────────

function GameCard({ game }: { game: NFLGame }) {
  const isFinal = game.status === 'final'
  const isLive = game.status === 'in_progress'
  return (
    <Link href={`/nfl/${game.slug}`} className="game-card">
      <div className="m" style={{ fontSize: 9, fontWeight: 700, color: isLive ? '#FF5722' : '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
        {isLive ? '● LIVE' : isFinal ? 'FINAL' : formatGameTime(game.date)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <img src={game.awayTeam.logo} alt={game.awayTeam.abbreviation} width={22} height={22} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        <span className="s" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', flex: 1 }}>{game.awayTeam.shortName}</span>
        {(isLive || isFinal) && <span className="b" style={{ fontSize: 16 }}>{game.awayScore ?? 0}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={game.homeTeam.logo} alt={game.homeTeam.abbreviation} width={22} height={22} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        <span className="s" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', flex: 1 }}>{game.homeTeam.shortName}</span>
        {(isLive || isFinal) && <span className="b" style={{ fontSize: 16 }}>{game.homeScore ?? 0}</span>}
      </div>
      {game.broadcast && !isFinal && (
        <div className="m" style={{ fontSize: 8, color: '#D4D0C8', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{game.broadcast}</div>
      )}
    </Link>
  )
}

function ScheduleSection({ games }: { games: NFLGame[] }) {
  const dayGroups = groupGamesByDay(games)

  if (dayGroups.length === 0) {
    return (
      <section style={{ marginBottom: 32 }}>
        <Sec>Upcoming</Sec>
        <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
          <div className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No games scheduled in this window.</div>
        </div>
      </section>
    )
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <Sec>This Week</Sec>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {dayGroups.map(day => (
          <div key={day.dateKey}>
            <div className="m" style={{ fontSize: 10, fontWeight: 700, color: '#78716C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {day.label}
            </div>
            <div className="schedule-day-scroll">
              {day.games.map(g => <GameCard key={g.id} game={g} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── LEADERS ──────────────────────────────────────────────────────────

const LEADER_TABS: Array<{ key: string; label: string; short: string }> = [
  { key: 'passingYards', label: 'Passing Yards', short: 'YDS' },
  { key: 'passingTouchdowns', label: 'Passing TDs', short: 'TD' },
  { key: 'quarterbackRating', label: 'QB Rating', short: 'RTG' },
  { key: 'rushingYards', label: 'Rushing Yards', short: 'YDS' },
  { key: 'receivingYards', label: 'Receiving Yards', short: 'YDS' },
  { key: 'receptions', label: 'Receptions', short: 'REC' },
  { key: 'sacks', label: 'Sacks', short: 'SACK' },
  { key: 'interceptions', label: 'Interceptions', short: 'INT' },
]

function LeadersPanel({ leaders }: { leaders: Record<string, NFLStatCategory> }) {
  const [activeTab, setActiveTab] = useState(LEADER_TABS[0].key)
  const current = leaders[activeTab]

  return (
    <div>
      <Sec>League leaders</Sec>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 14 }}>
        {LEADER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="m"
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
          {current.leaders.slice(0, 8).map((l, i) => (
            <div key={l.athleteId} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: i < 7 ? '1px solid rgba(26,26,26,0.06)' : 'none',
            }}>
              <span className="m" style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? '#FF5722' : '#D4D0C8', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.playerName}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div className="s" style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? '#FF5722' : '#1A1A1A', lineHeight: 1 }}>{l.displayValue}</div>
                <div className="m" style={{ fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                  {LEADER_TABS.find(t => t.key === activeTab)?.short}
                </div>
              </div>
            </div>
          ))}
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
<span className="s" style={{ flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: ti === 0 ? 600 : 400 }}>{team.name}</span>                <span className="m" style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', width: 22, textAlign: 'center' }}>{team.wins}</span>
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

function PlayerHeadshot({ athleteId, playerName }: { athleteId: string; playerName: string }) {
  return (
    <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0EBE0', border: '1.5px solid #E5E2D9' }}>
      <img
        src={headshotUrl(athleteId)}
        alt={playerName}
        width={40} height={40}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={e => {
          const el = e.target as HTMLImageElement
          el.style.display = 'none'
          if (el.parentElement) el.parentElement.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px">🏈</div>'
        }}
      />
    </div>
  )
}

function TransactionsSection({ transactions }: { transactions: NFLTransaction[] }) {
  if (transactions.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <Sec>Injury Report</Sec>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
        {transactions.slice(0, 10).map((tx, i) => {
          const badge = statusBadgeInfo(tx.status)
          const nameUnknown = !tx.player_name || tx.player_name === 'Unknown'
          return (
            <div key={tx.espn_injury_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < 9 ? '1px solid rgba(26,26,26,0.05)' : 'none' }}>
              <PlayerHeadshot athleteId={tx.athlete_id} playerName={tx.player_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="s" style={{ fontSize: 13, fontWeight: 600, color: nameUnknown ? '#A3A3A3' : '#1A1A1A', fontStyle: nameUnknown ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nameUnknown ? 'Name unavailable' : tx.player_name}
                  <span className="m" style={{ fontSize: 9, color: '#A3A3A3', fontWeight: 400, fontStyle: 'normal' }}> · {tx.team_abbr}{tx.position ? ` · ${tx.position}` : ''}</span>
                </div>
                {tx.short_comment && (
                  <div className="m" style={{ fontSize: 9, color: '#A3A3A3', marginTop: 2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {tx.short_comment}
                  </div>
                )}
              </div>
              <span
                className="m"
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: badge.color, background: badge.bg,
                  padding: '4px 10px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase',
                }}
              >
                {badge.label}
              </span>
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
  leaders,
  news,
  transactions,
  standings,
  season,
}: Props) {
  // Defensive defaults — page.tsx's data fetching isn't fully wired yet,
  // so any of these can legitimately arrive as undefined mid-build.
  // Empty state beats a crash, same as every fetcher in this pipeline
  // returning [] on failure rather than throwing.
  const safeGames = upcomingGames ?? []
  const safeLeaders = leaders ?? {}
  const safeNews = news ?? []
  const safeTransactions = transactions ?? []
  const safeStandings = standings ?? []

  return (
    <div className="nfl-page">
      <style>{CSS}</style>
      <div className="nfl-main">
        <div style={{ paddingTop: 8, marginBottom: 8 }}>
          <div className="m" style={{ fontSize: 9, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>§ The Edge · NFL</div>
          <h1 className="s" style={{ fontSize: 34, fontWeight: 700, color: '#1A1A1A', lineHeight: 1, marginBottom: 24 }}>
            The GM Brief<span style={{ color: '#FF5722' }}>.</span>
          </h1>
        </div>

        <ScheduleSection games={safeGames} />

        <div className="leaders-standings">
          <LeadersPanel leaders={safeLeaders} />
          <Standings standings={safeStandings} />
        </div>

        <TransactionsSection transactions={safeTransactions} />
        <NewsSection news={safeNews} />
      </div>
    </div>
  )
}