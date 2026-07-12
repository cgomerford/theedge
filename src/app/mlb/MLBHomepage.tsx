'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { MLBDivisionStandings, MLBStatLeader, MLBNewsItem } from '@/lib/mlb-homepage'
import type { MLBGame } from '@/lib/mlb'
import { slugifyGame, shortName, teamLogoUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import type { EdgePrediction } from '@/lib/edge-fetch'
import type { FantasyPicksByType } from '@/lib/fantasy'
import type { TeamTransaction } from '@/lib/team-transactions'

/**
 * MLBHomepage — redesigned
 *
 * Brand tokens:
 *   Cream    #FAF8F3
 *   Orange   #FF5722
 *   Yellow   #FDE047
 *   Black    #1A1A1A
 *   Muted    #A3A3A3
 *   Border   rgba(26,26,26,0.08)
 *
 * Fonts (loaded globally):
 *   Fraunces     — serif display
 *   Bebas Neue   — display numbers
 *   JetBrains Mono — data / labels
 *
 * Layout: editorial broadsheet — full-bleed game cards as hero,
 *   standings + transactions as sidebar, news as thin strip.
 *   Stats/leaders removed to /mlb/stats.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
type Props = {
  standings: MLBDivisionStandings[]
  games: MLBGame[]
  predictions: Map<number, EdgePrediction>
  news: MLBNewsItem[]
  today: string
  isPro: boolean
  activeIL: TeamTransaction[]
  recentTransactions: TeamTransaction[]
  // kept for compatibility — not rendered on homepage any more
  statLeaders?: Record<string, MLBStatLeader[]>
  fantasyPicks?: FantasyPicksByType
  fantasyIsStale?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Factor count from edge score — mirrors EdgeIndicatorV6 logic
function factorCount(pred: EdgePrediction): { count: number; total: number; winner: string } | null {
  if (!pred?.components) return null
  const comps = pred.components as Record<string, number>
  const winner = pred.predicted_winner
  const total  = Object.keys(comps).length
  // Count any factor that leans toward the predicted winner (even marginally)
  const count  = Object.values(comps).filter(v =>
    winner === 'home' ? v > 0 : v < 0
  ).length
  return { count, total, winner }
}

function tierColor(tier: string | undefined): string {
  return { strong: '#27500A', moderate: '#633806', slight: '#0C447C', tossup: '#5F5E5A' }[tier ?? ''] ?? '#5F5E5A'
}
function tierBg(tier: string | undefined): string {
  return { strong: '#EAF3DE', moderate: '#FAEEDA', slight: '#E6F1FB', tossup: '#F1EFE8' }[tier ?? ''] ?? '#F1EFE8'
}
function tierLabel(tier: string | undefined): string {
  return { strong: 'Strong lean', moderate: 'Moderate lean', slight: 'Slight lean', tossup: 'Toss-up' }[tier ?? ''] ?? '—'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TxBadge({ category }: { category: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    IL:         { color: '#b45309', bg: '#fffbeb' },
    TRADE:      { color: '#1d4ed8', bg: '#eff6ff' },
    SIGNING:    { color: '#15803d', bg: '#f0fdf4' },
    CALLUP:     { color: '#7c3aed', bg: '#faf5ff' },
    ACTIVATION: { color: '#0369a1', bg: '#f0f9ff' },
    OPTION:     { color: '#6b7280', bg: '#f9fafb' },
    DFA:        { color: '#dc2626', bg: '#fef2f2' },
  }
  const s = map[category] ?? { color: '#374151', bg: '#f9fafb' }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      color: s.color, background: s.bg,
      borderRadius: 3, padding: '2px 5px',
      whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {category}
    </span>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────

function GameCard({ game, pred }: { game: MLBGame; pred: EdgePrediction | undefined }) {
  const slug    = slugifyGame(game)
  const isLive  = game.status.abstractGameState === 'Live'
  const isFinal = game.status.abstractGameState === 'Final'

  const awayName = shortName(game.teams.away.team.name)
  const homeName = shortName(game.teams.home.team.name)

  const factors = pred ? factorCount(pred) : null
  const winner  = pred?.predicted_winner === 'home' ? homeName : awayName

  // Team that the model leans toward
  const leanAbbr = pred?.predicted_winner === 'home'
    ? game.teams.home.team.abbreviation
    : game.teams.away.team.abbreviation

  return (
    <Link href={`/mlb/${slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article style={{
        background: '#FFFFFF',
        border: '1px solid rgba(26,26,26,0.08)',
        padding: '16px 18px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}>

        {/* Top row — teams + time/status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>

          {/* Away */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
            <img
              src={teamLogoUrl(game.teams.away.team.id)}
              alt={game.teams.away.team.abbreviation}
              width={24} height={24}
              style={{ flexShrink: 0 }}
            />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13, fontWeight: 700, color: '#1A1A1A',
              letterSpacing: '0.04em',
            }}>
              {game.teams.away.team.abbreviation}
            </span>
            {(isLive || isFinal) && (
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 18, color: '#1A1A1A', letterSpacing: '0.03em',
              }}>
                {(game as any).teams?.away?.score ?? 0}
              </span>
            )}
          </div>

          {/* Centre — time or score separator */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            {isLive ? (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, fontWeight: 700, color: '#FF5722',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                ● LIVE
              </span>
            ) : isFinal ? (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, color: '#A3A3A3', letterSpacing: '0.08em',
              }}>
                FINAL
              </span>
            ) : (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, fontWeight: 600, color: '#FF5722',
              }}>
                {formatGameTime(game.gameDate)}
              </span>
            )}
          </div>

          {/* Home */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
            {(isLive || isFinal) && (
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 18, color: '#1A1A1A', letterSpacing: '0.03em',
              }}>
                {(game as any).teams?.home?.score ?? 0}
              </span>
            )}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13, fontWeight: 700, color: '#1A1A1A',
              letterSpacing: '0.04em', textAlign: 'right',
            }}>
              {game.teams.home.team.abbreviation}
            </span>
            <img
              src={teamLogoUrl(game.teams.home.team.id)}
              alt={game.teams.home.team.abbreviation}
              width={24} height={24}
              style={{ flexShrink: 0 }}
            />
          </div>
        </div>

        {/* Summary line */}
        {pred?.summary ? (
          <p style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 13, color: '#3D3D3D', lineHeight: 1.5,
            margin: '0 0 10px',
            fontStyle: 'italic',
          }}>
            {pred.summary}
          </p>
        ) : (
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: '#A3A3A3', margin: '0 0 10px',
          }}>
            Preview generating…
          </p>
        )}

        {/* Factor lean pill */}
        {factors && pred?.confidence_tier && pred.confidence_tier !== 'tossup' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700,
              color: tierColor(pred.confidence_tier),
              background: tierBg(pred.confidence_tier),
              padding: '3px 8px', borderRadius: 3,
              letterSpacing: '0.02em',
            }}>
              {factors.count} of {factors.total} lean {leanAbbr}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: '#A3A3A3',
            }}>
              {tierLabel(pred.confidence_tier)}
            </span>
          </div>
        ) : pred?.confidence_tier === 'tossup' ? (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 700,
            color: '#5F5E5A', background: '#F1EFE8',
            padding: '3px 8px', borderRadius: 3,
          }}>
            Toss-up
          </span>
        ) : null}

      </article>
    </Link>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MLBHomepage({
  standings, games, predictions, news, today,
  isPro, activeIL, recentTransactions,
}: Props) {
  const [activeLeague, setActiveLeague] = useState<'AL' | 'NL'>('AL')

  const sortedGames = [...games].sort((a, b) =>
    new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()
  )

  const liveGames     = sortedGames.filter(g => g.status.abstractGameState === 'Live')
  const upcomingGames = sortedGames.filter(g => g.status.abstractGameState === 'Preview')
  const finalGames    = sortedGames.filter(g => g.status.abstractGameState === 'Final')

  const activeDivisions = standings.filter(d => d.league === activeLeague)
  const edgesReady = games.filter(g => predictions.get(g.gamePk)?.confidence_tier).length

  return (
    <div style={{ background: '#FAF8F3', minHeight: '100vh' }}>

      <style>{`
        .mlb-layout {
          display: grid;
          grid-template-columns: 1fr;
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 16px;
          gap: 0;
        }
        @media (min-width: 960px) {
          .mlb-layout {
            grid-template-columns: 1fr 320px;
            padding: 0 24px;
            gap: 0 32px;
          }
        }
        .game-card-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1px;
          background: rgba(26,26,26,0.06);
        }
        @media (min-width: 640px) {
          .game-card-grid { grid-template-columns: 1fr 1fr; }
        }
        article:hover {
          border-color: rgba(255,87,34,0.3) !important;
        }
      `}</style>

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid rgba(26,26,26,0.08)',
        background: '#FAF8F3',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>

            <div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#FF5722',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
              }}>
                § MLB · {today}
              </div>
              <h1 style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 28, fontWeight: 800, color: '#1A1A1A',
                margin: 0, lineHeight: 1.1, letterSpacing: '-0.5px',
              }}>
                Today's Games
              </h1>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
              {[
                { value: games.length,  label: 'games' },
                { value: edgesReady,    label: 'edges ready' },
                { value: liveGames.length, label: 'live now' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 26, color: s.label === 'live now' && s.value > 0 ? '#FF5722' : '#1A1A1A',
                    lineHeight: 1,
                  }}>
                    {s.value}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, color: '#A3A3A3', letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                  }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN LAYOUT ─────────────────────────────────────────────────────── */}
      <div className="mlb-layout" style={{ paddingTop: 24, paddingBottom: 48 }}>

        {/* LEFT — game cards */}
        <div>

          {/* Live games first */}
          {liveGames.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700, color: '#FF5722',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  ● Live
                </span>
              </div>
              <div className="game-card-grid">
                {liveGames.map(g => (
                  <GameCard key={g.gamePk} game={g} pred={predictions.get(g.gamePk)} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcomingGames.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#A3A3A3',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                § Upcoming — {upcomingGames.length} games
              </div>
              <div className="game-card-grid">
                {upcomingGames.map(g => (
                  <GameCard key={g.gamePk} game={g} pred={predictions.get(g.gamePk)} />
                ))}
              </div>
            </section>
          )}

          {/* Final */}
          {finalGames.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#A3A3A3',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                § Final
              </div>
              <div className="game-card-grid">
                {finalGames.map(g => (
                  <GameCard key={g.gamePk} game={g} pred={predictions.get(g.gamePk)} />
                ))}
              </div>
            </section>
          )}

          {games.length === 0 && (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              fontFamily: "'Fraunces', serif",
              color: '#A3A3A3', fontStyle: 'italic', fontSize: 16,
            }}>
              No games scheduled today.
            </div>
          )}

          {/* News strip */}
          {news.length > 0 && (
            <section style={{ marginTop: 8 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#A3A3A3',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                § Around the league
              </div>
              <div style={{
                background: '#FFFFFF',
                border: '1px solid rgba(26,26,26,0.08)',
              }}>
                {news.slice(0, 6).map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    borderBottom: i < 5 ? '1px solid rgba(26,26,26,0.05)' : 'none',
                    textDecoration: 'none',
                  }}>
                    {item.image && (
                      <div style={{
                        width: 44, height: 44, flexShrink: 0,
                        background: '#F5F1E8', overflow: 'hidden',
                      }}>
                        <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: 13, color: '#1A1A1A', lineHeight: 1.4, marginBottom: 3,
                      }}>
                        {item.headline}
                      </div>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {timeAgo(item.published)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT SIDEBAR ─────────────────────────────────────────────────── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Standings */}
          <section>
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 10,
            }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#A3A3A3',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                § Standings
              </span>
              <div style={{ display: 'flex', background: 'rgba(26,26,26,0.06)', borderRadius: 2, padding: 2 }}>
                {(['AL', 'NL'] as const).map(l => (
                  <button key={l} onClick={() => setActiveLeague(l)} style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, fontWeight: 700, padding: '4px 12px',
                    border: 'none', cursor: 'pointer', borderRadius: 2,
                    background: activeLeague === l ? '#1A1A1A' : 'transparent',
                    color: activeLeague === l ? '#FAF8F3' : '#A3A3A3',
                    letterSpacing: '0.06em',
                    transition: 'all 0.12s',
                  }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)' }}>
              {activeDivisions.map((div, dIdx) => (
                <div key={dIdx}>
                  {/* Division header */}
                  <div style={{
                    padding: '7px 12px',
                    background: '#F5F1E8',
                    borderBottom: '1px solid rgba(26,26,26,0.06)',
                    borderTop: dIdx > 0 ? '2px solid rgba(26,26,26,0.08)' : 'none',
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9, fontWeight: 700, color: '#A3A3A3',
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                      {div.division.replace(/^(AL|NL)\s+/, '')}
                    </span>
                  </div>
                  {div.teams.map((team, tIdx) => {
                    const teamSlug = findTeamByName(team.name)?.slug ?? team.abbreviation.toLowerCase()
                    const isFirst  = tIdx === 0
                    return (
                      <Link key={tIdx} href={`/mlb/teams/${teamSlug}`} style={{
                        display: 'flex', alignItems: 'center',
                        padding: '8px 12px', textDecoration: 'none',
                        borderBottom: '1px solid rgba(26,26,26,0.04)',
                        background: isFirst ? 'rgba(255,87,34,0.03)' : '#FFFFFF',
                      }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10, color: isFirst ? '#FF5722' : '#A3A3A3',
                          fontWeight: isFirst ? 700 : 400, width: 16, flexShrink: 0,
                        }}>
                          {tIdx + 1}
                        </span>
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${team.id}.svg`}
                          alt="" width={16} height={16}
                          style={{ marginRight: 8, flexShrink: 0 }}
                        />
                        <span style={{
                          fontFamily: "'Fraunces', serif",
                          flex: 1, fontSize: 13, color: '#1A1A1A',
                          fontWeight: isFirst ? 600 : 400,
                        }}>
                          {team.name.split(' ').slice(-1)[0]}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, fontWeight: 600, color: '#1A1A1A', width: 24, textAlign: 'right',
                        }}>
                          {team.wins}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, color: '#A3A3A3', width: 24, textAlign: 'center',
                        }}>
                          {team.losses}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10, color: '#A3A3A3', width: 28, textAlign: 'right',
                        }}>
                          {team.gb}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Link to stats hub */}
            <Link href="/mlb/stats" style={{
              display: 'block', marginTop: 8,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 700, color: '#FF5722',
              letterSpacing: '0.06em', textDecoration: 'none',
              textAlign: 'right',
            }}>
              League leaders & stats →
            </Link>
          </section>

          {/* Transactions */}
          {(activeIL.length > 0 || recentTransactions.length > 0) && (
            <section>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, fontWeight: 700, color: '#A3A3A3',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                § Transactions
              </div>
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(26,26,26,0.08)' }}>
                {[...activeIL.slice(0, 3), ...recentTransactions.slice(0, 5)].slice(0, 7).map((tx, i, arr) => (
                  <div key={tx.transaction_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px',
                    borderBottom: i < arr.length - 1 ? '1px solid rgba(26,26,26,0.04)' : 'none',
                  }}>
                    {(tx.team_id ?? tx.to_team_id) && (
                      <img
                        src={`https://www.mlbstatic.com/team-logos/${tx.team_id ?? tx.to_team_id}.svg`}
                        alt="" width={16} height={16} style={{ flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: 12, fontWeight: 600, color: '#1A1A1A',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {tx.player_name}
                      </div>
                      {tx.injury_reason && (
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, color: '#A3A3A3',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {tx.injury_reason}
                        </div>
                      )}
                    </div>
                    <TxBadge category={tx.category} />
                  </div>
                ))}
              </div>
            </section>
          )}

        </aside>
      </div>
    </div>
  )
}