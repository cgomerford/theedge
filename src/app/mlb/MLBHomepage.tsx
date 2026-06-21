'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MLBDivisionStandings, MLBStatLeader, MLBNewsItem } from '@/lib/mlb-homepage'
import { MLB_STAT_CATEGORIES } from '@/lib/mlb-homepage'
import type { MLBGame } from '@/lib/mlb'
import { slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { EdgePrediction } from '@/lib/edge-fetch'
import MLBFantasySection from '@/components/MLBFantasySection'
import type { FantasyPicksByType } from '@/lib/fantasy'
import type { TeamTransaction } from '@/lib/team-transactions'

// ─── Types ────────────────────────────────────────────────
type Props = {
  standings: MLBDivisionStandings[]
  statLeaders: Record<string, MLBStatLeader[]>
  games: MLBGame[]
  predictions: Map<number, EdgePrediction>
  news: MLBNewsItem[]
  today: string
  fantasyPicks: FantasyPicksByType
  fantasyIsStale: boolean
  isPro: boolean
  activeIL: TeamTransaction[]
  recentTransactions: TeamTransaction[]
}

// ─── Helpers ──────────────────────────────────────────────
function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatGameTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York',
    })
  } catch { return '—' }
}

function parseStreak(code: string): { type: 'W' | 'L' | null; count: number } {
  const m = (code ?? '').match(/^([WL])(\d+)$/)
  if (!m) return { type: null, count: 0 }
  return { type: m[1] as 'W' | 'L', count: parseInt(m[2]) }
}

function streakLabel(code: string): string {
  const { type, count } = parseStreak(code)
  if (!type) return code || '—'
  return `${count}-game ${type === 'W' ? 'win' : 'loss'} streak`
}

// ─── Circular Headshot ────────────────────────────────────
function CircularHeadshot({ src, size = 28, alt = '' }: { src: string; size?: number; alt?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      flexShrink: 0, background: '#f4f4f5', border: '1px solid #e4e4e7'
    }}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
    </div>
  )
}

// ─── Transaction badge ────────────────────────────────────
function TxBadge({ category }: { category: string }) {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    IL:         { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    TRADE:      { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    SIGNING:    { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    CALLUP:     { color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
    ACTIVATION: { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    OPTION:     { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
    DFA:        { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  }
  const s = map[category] ?? { color: '#374151', bg: '#f9fafb', border: '#e5e7eb' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: s.color,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0
    }}>
      {category}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────
export default function MLBHomepage({
  standings, statLeaders, games, predictions, news, today,
  fantasyPicks, fantasyIsStale, isPro, activeIL, recentTransactions
}: Props) {
  const [activeLeague, setActiveLeague] = useState<'AL' | 'NL'>('AL')

  const activeDivisions = standings.filter(d => d.league === activeLeague)

  const sortedGames = [...games].sort((a, b) =>
    new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()
  )

  const allTeams = standings.flatMap(d => d.teams.map(t => ({ ...t, division: d.division, league: d.league })))
  const hotTeams = allTeams
    .map(t => ({ ...t, parsed: parseStreak(t.streak) }))
    .filter(t => t.parsed.type === 'W' && t.parsed.count >= 3)
    .sort((a, b) => b.parsed.count - a.parsed.count)
    .slice(0, 5)
  const coldTeams = allTeams
    .map(t => ({ ...t, parsed: parseStreak(t.streak) }))
    .filter(t => t.parsed.type === 'L' && t.parsed.count >= 3)
    .sort((a, b) => b.parsed.count - a.parsed.count)
    .slice(0, 5)

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#fff' }}>

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid #e5e5e5', padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: '1px' }}>THE EDGE • {today}</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1, letterSpacing: '-1px' }}>
            MLB<span style={{ color: '#f97316' }}>.</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { value: games.length, label: 'GAMES TODAY' },
            { value: games.filter(g => predictions.get(g.gamePk)?.edge_score != null).length, label: 'EDGES' },
            { value: games.filter(g => !predictions.get(g.gamePk)?.edge_score).length, label: 'PENDING' },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, letterSpacing: '0.5px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
        
      </div>

      {/* ══════════════════════════════════════════════════════
          PREVIEWS (3/4) + NEWS (1/4)
      ══════════════════════════════════════════════════════ */}
      <style>{`
        .top-section-grid {
          display: grid;
          grid-template-columns: 1fr;
          border-bottom: 1px solid #e5e5e5;
        }
        @media (min-width: 768px) {
          .top-section-grid { grid-template-columns: 3fr 1fr; }
        }
        .previews-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1px;
          background: #f4f4f5;
        }
        @media (min-width: 768px) {
          .previews-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
      <div className="top-section-grid">

        {/* PREVIEWS */}
        <div style={{ borderRight: '1px solid #e5e5e5' }}>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid #e5e5e5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#fafafa'
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>
              § PREVIEWS • {games.length} GAMES
            </span>
       <Link href="/mlb/scores" style={{ fontSize: 11, color: '#6b7280', textDecoration: 'none' }}>Full slate →</Link>
          </div>
          <div className="previews-grid">
            {sortedGames.map((game) => {
              const slug = slugifyGame(game)
              const pred = predictions.get(game.gamePk)
              const isLive = game.status.abstractGameState === 'Live'
              const isFinal = game.status.abstractGameState === 'Final'
              return (
                <Link key={game.gamePk} href={`/mlb/${slug}`} style={{
                  display: 'block', padding: '14px 18px',
                  background: '#fff', textDecoration: 'none', borderBottom: '1px solid #f4f4f5'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <img src={teamLogoUrl(game.teams.away.team.id)} alt="" width={18} height={18} />
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>@</span>
                    <img src={teamLogoUrl(game.teams.home.team.id)} alt="" width={18} height={18} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {game.teams.away.team.abbreviation} @ {game.teams.home.team.abbreviation}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: isLive ? '#f97316' : '#6b7280', fontWeight: isLive ? 600 : 400 }}>
                      {isLive ? 'LIVE' : isFinal ? 'Final' : formatGameTime(game.gameDate)}
                    </span>
                  </div>
                  {pred?.summary ? (
                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.45, margin: 0 }}>{pred.summary}</p>
                  ) : (
                    <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>Preview generating…</p>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* NEWS */}
        <div style={{ background: '#fafafa' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e5e5' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>§ AROUND THE LEAGUE</span>
          </div>
          <div style={{ padding: '4px 16px' }}>
            {news.slice(0, 8).map((item, index) => (
              <a key={index} href={item.link} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', gap: 10, padding: '11px 0',
                borderBottom: index < 7 ? '1px solid #f3f4f6' : 'none', textDecoration: 'none'
              }}>
                <div style={{ width: 52, height: 52, flexShrink: 0, background: '#FAF8F3', borderRadius: 6, overflow: 'hidden' }}>
                  {item.image && <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: '#111827', lineHeight: 1.35, marginBottom: 3 }}>{item.headline}</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>{timeAgo(item.published)}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          STATS + STANDINGS
      ══════════════════════════════════════════════════════ */}
      <style>{`
        .stats-standings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          padding: 28px 24px;
          background: #fff;
        }
        @media (min-width: 900px) {
          .stats-standings-grid { grid-template-columns: 3fr 2fr; }
        }
      `}</style>
      <div className="stats-standings-grid">

        {/* STATS */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>PITCHING LEADERS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', background: '#f4f4f5', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
            {MLB_STAT_CATEGORIES.filter(c => c.group === 'pitching').map((cat) => (
              <div key={cat.slug} style={{ background: '#fff', padding: '12px 14px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#f97316', marginBottom: 10, letterSpacing: '0.3px' }}>{cat.label}</div>
                {(statLeaders[cat.slug] ?? []).slice(0, 3).map((leader, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderTop: i > 0 ? '1px solid #f4f4f5' : 'none' }}>
                    <CircularHeadshot src={leader.headshot} size={26} alt={leader.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{leader.name}</div>
                      <div style={{ fontSize: 10.5, color: '#6b7280' }}>{leader.teamAbbr}</div>
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: i === 0 ? '#f97316' : '#111827', fontFeatureSettings: '"tnum"' }}>
                      {leader.statValue}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>BATTING LEADERS</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', background: '#f4f4f5', borderRadius: 10, overflow: 'hidden' }}>
            {MLB_STAT_CATEGORIES.filter(c => c.group === 'batting').map((cat) => (
              <div key={cat.slug} style={{ background: '#fff', padding: '12px 14px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#f97316', marginBottom: 10, letterSpacing: '0.3px' }}>{cat.label}</div>
                {(statLeaders[cat.slug] ?? []).slice(0, 3 ).map((leader, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderTop: i > 0 ? '1px solid #f4f4f5' : 'none' }}>
                    <CircularHeadshot src={leader.headshot} size={26} alt={leader.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{leader.name}</div>
                      <div style={{ fontSize: 10.5, color: '#6b7280' }}>{leader.teamAbbr}</div>
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: i === 0 ? '#f97316' : '#111827', fontFeatureSettings: '"tnum"' }}>
                      {leader.statValue}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* STANDINGS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>STANDINGS</span>
            <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: 999, padding: 3 }}>
              {(['AL', 'NL'] as const).map(l => (
                <button key={l} onClick={() => setActiveLeague(l)} style={{
                  fontSize: 11, padding: '5px 18px', border: 'none',
                  background: activeLeague === l ? '#111827' : 'transparent',
                  color: activeLeague === l ? '#fff' : '#6b7280',
                  borderRadius: 999, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s ease'
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
            {activeDivisions.length > 0 ? activeDivisions.map((div, idx) => (
              <div key={idx} style={{ borderBottom: idx < activeDivisions.length - 1 ? '1px solid #f4f4f5' : 'none' }}>
                <div style={{ padding: '10px 16px', background: '#fafafa', fontSize: 11.5, fontWeight: 700, color: '#374151' }}>
                  {div.division.replace(/^(AL|NL)\s+/, '')}
                </div>
                {div.teams.map((team, i) => {
                  const teamSlug = findTeamByName(team.name)?.slug ?? team.abbreviation.toLowerCase()
                  return (
                    <Link key={i} href={`/mlb/teams/${teamSlug}`} style={{
                      display: 'flex', alignItems: 'center', padding: '9px 16px',
                      textDecoration: 'none', borderTop: '1px solid #f4f4f5',
                      background: i === 0 ? '#fffbeb' : '#fff'
                    }}>
                      <div style={{ width: 22, fontSize: 12, color: i === 0 ? '#f97316' : '#9ca3af', fontWeight: 600 }}>{i + 1}</div>
                      <img src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`} alt="" width={18} height={18} style={{ marginRight: 10 }} />
                      <span style={{ flex: 1, fontSize: 13.5, color: '#111827', fontWeight: i === 0 ? 600 : 400 }}>
                        {team.name.split(' ').slice(-1)[0]}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', width: 28, textAlign: 'right' }}>{team.wins}</span>
                      <span style={{ fontSize: 13, color: '#6b7280', width: 28, textAlign: 'center' }}>{team.losses}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', width: 30, textAlign: 'right' }}>{team.gb}</span>
                    </Link>
                  )
                })}
              </div>
            )) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Standings unavailable</div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          THINGS YOU MAY HAVE MISSED
      ══════════════════════════════════════════════════════ */}
      <div style={{ borderTop: '3px solid #111827' }} />
      <style>{`
        .missed-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 640px) {
          .missed-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (min-width: 1024px) {
          .missed-grid { grid-template-columns: 1fr 1fr 1fr; }
        }
      `}</style>
      <div style={{ padding: '32px 24px 40px', background: '#fafafa' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: '1px', marginBottom: 4 }}>
            § THE EDGE
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.5px' }}>
            Things You May Have Missed
          </h2>
        </div>

        <div className="missed-grid">

          {/* INJURY REPORT */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px', marginBottom: 10 }}>
              INJURY REPORT
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
              {activeIL.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No active IL placements.</div>
              ) : activeIL.slice(0, 8).map((tx, i) => (
                <div key={tx.transaction_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderBottom: i < Math.min(activeIL.length, 8) - 1 ? '1px solid #f9f9f9' : 'none'
                }}>
                  {tx.team_id && (
                    <img src={`https://www.mlbstatic.com/team-logos/${tx.team_id}.svg`} alt="" width={20} height={20} style={{ flexShrink: 0 }} />
                  )}
                  <CircularHeadshot
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${tx.player_id}/headshot/67/current`}
                    size={28} alt={tx.player_name}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827' }}>{tx.player_name}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{tx.injury_reason ?? tx.team_name ?? '—'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                    {tx.il_days ? `IL-${tx.il_days}` : 'IL'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* TRANSACTIONS */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px' }}>TRANSACTIONS</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>Last 5 days</span>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
              {recentTransactions.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No recent transactions.</div>
              ) : recentTransactions.slice(0, 8).map((tx, i) => (
                <div key={tx.transaction_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderBottom: i < Math.min(recentTransactions.length, 8) - 1 ? '1px solid #f9f9f9' : 'none'
                }}>
                  {(tx.team_id ?? tx.to_team_id) && (
                    <img src={`https://www.mlbstatic.com/team-logos/${tx.team_id ?? tx.to_team_id}.svg`} alt="" width={20} height={20} style={{ flexShrink: 0 }} />
                  )}
                  <CircularHeadshot
                    src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${tx.player_id}/headshot/67/current`}
                    size={28} alt={tx.player_name}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827' }}>{tx.player_name}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{tx.team_name ?? tx.to_team_name ?? '—'}</div>
                  </div>
                  <TxBadge category={tx.category} />
                </div>
              ))}
            </div>
          </div>

          {/* STREAKS */}
          {(hotTeams.length > 0 || coldTeams.length > 0) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.5px', marginBottom: 10 }}>
                STREAKS
              </div>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
                {[...hotTeams, ...coldTeams].map((team, i) => {
                  const isHot = team.parsed.type === 'W'
                  const total = hotTeams.length + coldTeams.length
                  return (
                    <div key={team.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderBottom: i < total - 1 ? '1px solid #f9f9f9' : 'none'
                    }}>
                      <img src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`} alt="" width={20} height={20} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{team.name.split(' ').slice(-1)[0]}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{streakLabel(team.streak)}</div>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: isHot ? '#16a34a' : '#dc2626',
                        background: isHot ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${isHot ? '#bbf7d0' : '#fecaca'}`,
                        borderRadius: 6, padding: '2px 8px'
                      }}>
                        {isHot ? 'W' : 'L'}{team.parsed.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

          
    </div>
  )
}