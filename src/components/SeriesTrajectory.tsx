'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const BoxScoreModal = dynamic(() => import('./BoxScoreModal'), { ssr: false })

export type SeriesChip = {
  gameNumber: number
  gamePk: number
  date: string
  awayAbbr: string
  homeAbbr: string
  awayScore: number | null
  homeScore: number | null
  isFinal: boolean
  isTonight: boolean
}

type Props = {
  awayAbbr: string
  homeAbbr: string
  awaySeriesWins: number
  homeSeriesWins: number
  seriesGameNumber: number
  seriesTotalGames: number
  games: SeriesChip[]
  awayPrimaryColor?: string
  homePrimaryColor?: string
  gameTimeDisplay?: string
}

export default function SeriesTrajectory({
  awayAbbr, homeAbbr,
  awaySeriesWins, homeSeriesWins,
  seriesGameNumber, seriesTotalGames,
  games, awayPrimaryColor = '#1A1A1A', homePrimaryColor = '#1A1A1A',
  gameTimeDisplay,
}: Props) {
  const [openGame, setOpenGame] = useState<SeriesChip | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const seriesStatus =
    awaySeriesWins === homeSeriesWins ? 'Series tied'
    : awaySeriesWins > homeSeriesWins ? `${awayAbbr} lead`
    : `${homeAbbr} lead`

  const awayLeads = awaySeriesWins > homeSeriesWins
  const homeLeads = homeSeriesWins > awaySeriesWins

  return (
    <>
      <div style={{
        background: '#FAF8F3',
        borderBottom: '1px solid #E8E3D9',
        padding: '16px 0 18px',
      }}>
        <div style={{ maxWidth: '896px', margin: '0 auto', padding: '0 20px' }}>

          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#B5AFA4',
            }}>Series trajectory</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: '#B5AFA4',
            }}>Best of {seriesTotalGames}</span>
          </div>

          {/* Chips grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(games.length, 7)}, 1fr)`,
            gap: '8px',
          }}>
            {games.map((g) => {
              const awayWon = g.isFinal && g.awayScore !== null && g.homeScore !== null && g.awayScore > g.homeScore
              const homeWon = g.isFinal && g.awayScore !== null && g.homeScore !== null && g.homeScore > g.awayScore
              const clickable = g.isFinal && g.gamePk > 0
              const isHov = hovered === g.gameNumber

              let chipBg = '#EEEAE2'
              let chipBorder = '1px solid transparent'
              if (g.isTonight) { chipBg = '#FFFFFF'; chipBorder = '1.5px solid #FF5722' }
              else if (g.isFinal) { chipBg = '#FFFFFF'; chipBorder = '1px solid #E8E3D9' }
              else if (isHov) { chipBg = '#E8E3D9' }

              return (
                <div
                  key={g.gameNumber}
                  onClick={() => clickable ? setOpenGame(g) : undefined}
                  onMouseEnter={() => clickable && setHovered(g.gameNumber)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: chipBg,
                    border: chipBorder,
                    borderRadius: '10px',
                    padding: '12px 10px 10px',
                    opacity: !g.isFinal && !g.isTonight ? 0.4 : 1,
                    cursor: clickable ? 'pointer' : 'default',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {/* Label */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: g.isTonight ? '#FF5722' : '#B5AFA4',
                    fontWeight: g.isTonight ? 700 : 400,
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}>
                    {g.isTonight && (
                      <span style={{
                        display: 'inline-block',
                        width: '5px', height: '5px',
                        borderRadius: '50%',
                        background: '#FF5722',
                        flexShrink: 0,
                      }} />
                    )}
                    <span>Game {g.gameNumber}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{g.date}</span>
                  </div>

                  {/* Away row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      letterSpacing: '0.5px',
                      fontWeight: awayWon ? 700 : 400,
                      color: awayWon ? '#1A1A1A' : '#B5AFA4',
                    }}>{g.awayAbbr}</span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: g.awayScore !== null ? '15px' : '12px',
                      fontWeight: awayWon ? 700 : 400,
                      color: awayWon ? '#1A1A1A' : '#C8C2B8',
                    }}>{g.awayScore !== null ? g.awayScore : '—'}</span>
                  </div>

                  {/* Home row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      letterSpacing: '0.5px',
                      fontWeight: homeWon ? 700 : 400,
                      color: homeWon ? '#1A1A1A' : '#B5AFA4',
                    }}>{g.homeAbbr}</span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: g.homeScore !== null ? '15px' : '12px',
                      fontWeight: homeWon ? 700 : 400,
                      color: homeWon ? '#1A1A1A' : '#C8C2B8',
                    }}>{g.homeScore !== null ? g.homeScore : '—'}</span>
                  </div>

                  {/* Footer */}
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #EDE9E0',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                  }}>
                    {g.isTonight ? (
                      <span style={{ color: '#FF5722', fontWeight: 700 }}>{gameTimeDisplay ?? 'Tonight'}</span>
                    ) : g.isFinal ? (
                      <span style={{ color: isHov ? '#1A1A1A' : '#C8C2B8' }}>
                        {isHov ? 'Box score →' : 'Final'}
                      </span>
                    ) : (
                      <span style={{ color: '#C8C2B8' }}>Upcoming</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Series summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid #E8E3D9',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.8px',
              color: awayLeads ? '#1A1A1A' : '#B5AFA4',
              fontWeight: awayLeads ? 700 : 400,
            }}>{awayAbbr}</span>
            <span style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '22px',
              fontWeight: 700,
              color: awayLeads ? (awayPrimaryColor ?? '#1A1A1A') : '#C8C2B8',
              lineHeight: 1,
            }}>{awaySeriesWins}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#D4CFC8',
            }}>—</span>
            <span style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '22px',
              fontWeight: 700,
              color: homeLeads ? (homePrimaryColor ?? '#1A1A1A') : '#C8C2B8',
              lineHeight: 1,
            }}>{homeSeriesWins}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.8px',
              color: homeLeads ? '#1A1A1A' : '#B5AFA4',
              fontWeight: homeLeads ? 700 : 400,
            }}>{homeAbbr}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: '#B5AFA4',
              marginLeft: '2px',
            }}>· {seriesStatus}</span>
          </div>

        </div>
      </div>

      {openGame && (
        <BoxScoreModal
          gamePk={openGame.gamePk}
          gameLabel={`Game ${openGame.gameNumber}`}
          awayAbbr={openGame.awayAbbr}
          homeAbbr={openGame.homeAbbr}
          awayScore={openGame.awayScore ?? 0}
          homeScore={openGame.homeScore ?? 0}
          onClose={() => setOpenGame(null)}
        />
      )}
    </>
  )
}
