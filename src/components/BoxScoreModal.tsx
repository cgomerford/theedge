'use client'

import { useState, useEffect, useCallback } from 'react'

type Batter = {
  name: string; position: string; battingOrder: number
  ab: number; r: number; h: number; rbi: number; hr: number; bb: number; k: number
  avg: string | null; ops: string | null; note?: string
}
type Pitcher = {
  name: string; ip: string; h: number; r: number; er: number
  bb: number; k: number; hr: number; era: string | null
}
type Team = {
  teamName: string; abbr: string; score: number; hits: number; errors: number
  batters: Batter[]; pitchers: Pitcher[]
}
type BoxScore = { gamePk: number; away: Team; home: Team }

type Props = {
  gamePk: number
  gameLabel: string
  awayAbbr: string
  homeAbbr: string
  awayScore: number
  homeScore: number
  onClose: () => void
}

const S = {
  overlay: {
    position: 'fixed' as const, inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '32px', paddingBottom: '32px',
    overflowY: 'auto' as const,
  },
  modal: {
    background: '#1C1C1E',
    width: '100%', maxWidth: '720px',
    margin: '0 16px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
  },
  header: {
    background: '#2C2C2E',
    padding: '16px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  scoreRow: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: '#242426',
  },
  teamToggle: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  sectionToggle: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: '#242426',
    padding: '0 20px',
    gap: '0',
  },
}

function pctColor(val: number): string {
  if (val >= 100) return '#FF5722'
  if (val >= 80)  return '#F5A623'
  if (val >= 60)  return '#4CAF50'
  if (val >= 40)  return '#64B5F6'
  return '#9E9E9E'
}

function plusMinusColor(val: number): string {
  if (val > 0) return '#4CAF50'
  if (val < 0) return '#EF5350'
  return 'rgba(255,255,255,0.3)'
}

export default function BoxScoreModal({
  gamePk, gameLabel, awayAbbr, homeAbbr, awayScore, homeScore, onClose,
}: Props) {
  const [data, setData] = useState<BoxScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTeam, setActiveTeam] = useState<'away' | 'home'>('away')
  const [activeSection, setActiveSection] = useState<'batting' | 'pitching'>('batting')

  useEffect(() => {
    fetch(`/api/mlb/boxscore?gamePk=${gamePk}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [gamePk])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const awayWon = awayScore > homeScore
  const team = data ? data[activeTeam] : null

  return (
    <div onClick={onClose} style={S.overlay}>
      <div onClick={e => e.stopPropagation()} style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '15px', fontWeight: 700, color: '#FAF8F3',
          }}>
            {gameLabel} Box Score
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '16px',
          }}>✕</button>
        </div>

        {/* Score strip */}
        <div style={S.scoreRow}>
          {/* Away */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
              color: 'rgba(255,255,255,0.5)',
            }}>{awayAbbr}</span>
            <span style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '32px', fontWeight: 700,
              color: awayWon ? '#FAF8F3' : 'rgba(255,255,255,0.3)',
              lineHeight: 1,
            }}>{awayScore}</span>
          </div>

          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px', color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase', letterSpacing: '1.5px',
          }}>Final</span>

          {/* Home */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
            <span style={{
              fontFamily: "'Fraunces', serif",
              fontSize: '32px', fontWeight: 700,
              color: !awayWon ? '#FAF8F3' : 'rgba(255,255,255,0.3)',
              lineHeight: 1,
            }}>{homeScore}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px', fontWeight: 700, letterSpacing: '1px',
              color: 'rgba(255,255,255,0.5)',
            }}>{homeAbbr}</span>
          </div>
        </div>

        {loading ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.5px',
          }}>Loading…</div>
        ) : !data ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
            color: 'rgba(255,255,255,0.3)',
          }}>Box score unavailable</div>
        ) : (
          <>
            {/* Team toggle */}
            <div style={S.teamToggle}>
              {(['away', 'home'] as const).map(side => (
                <button key={side} onClick={() => setActiveTeam(side)} style={{
                  flex: 1, padding: '12px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTeam === side ? '2px solid #FF5722' : '2px solid transparent',
                  color: activeTeam === side ? '#FAF8F3' : 'rgba(255,255,255,0.3)',
                  marginBottom: '-1px', transition: 'color 0.15s',
                }}>
                  {data[side].teamName}
                </button>
              ))}
            </div>

            {/* Batting / Pitching toggle */}
            <div style={S.sectionToggle}>
              {(['batting', 'pitching'] as const).map(s => (
                <button key={s} onClick={() => setActiveSection(s)} style={{
                  padding: '10px 16px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeSection === s ? '2px solid #FF5722' : '2px solid transparent',
                  color: activeSection === s ? '#FF5722' : 'rgba(255,255,255,0.3)',
                  marginBottom: '-1px',
                }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Table */}
            {team && activeSection === 'batting'
              ? <BattingTable batters={team.batters} score={team.score} hits={team.hits} />
              : team
                ? <PitchingTable pitchers={team.pitchers} />
                : null
            }
          </>
        )}
      </div>
    </div>
  )
}

function BattingTable({ batters, score, hits }: { batters: Batter[]; score: number; hits: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Player', 'AB', 'R', 'H', 'RBI', 'HR', 'BB', 'K', 'AVG', 'OPS'].map((col, i) => (
              <th key={col} style={{
                padding: '8px 10px',
                textAlign: i === 0 ? 'left' : 'right',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px',
                color: 'rgba(255,255,255,0.3)', fontWeight: 500, whiteSpace: 'nowrap',
                background: '#242426',
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batters.map((b, i) => (
            <tr key={i} style={{
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}>
              <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px', color: 'rgba(255,255,255,0.3)',
                  marginRight: '8px',
                }}>{b.position}</span>
                <span style={{ color: '#FAF8F3', fontWeight: b.h > 0 ? 600 : 400 }}>{b.name}</span>
              </td>
              {[b.ab, b.r, b.h, b.rbi, b.hr, b.bb, b.k].map((val, vi) => (
                <td key={vi} style={{
                  padding: '9px 10px', textAlign: 'right',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '13px',
                  color: vi === 2 && val > 0 ? '#FAF8F3'
                       : vi === 4 && val > 0 ? '#FF5722'
                       : val === 0 ? 'rgba(255,255,255,0.2)'
                       : 'rgba(255,255,255,0.7)',
                  fontWeight: (vi === 2 || vi === 4) && val > 0 ? 700 : 400,
                }}>{val}</td>
              ))}
              <td style={{
                padding: '9px 10px', textAlign: 'right',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                color: 'rgba(255,255,255,0.4)',
              }}>{b.avg ?? '—'}</td>
              <td style={{
                padding: '9px 10px', textAlign: 'right',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                color: 'rgba(255,255,255,0.4)',
              }}>{b.ops ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#242426' }}>
            <td style={{ padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Totals</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{batters.reduce((s, b) => s + b.ab, 0)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{score}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{hits}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{batters.reduce((s, b) => s + b.rbi, 0)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{batters.reduce((s, b) => s + b.hr, 0)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{batters.reduce((s, b) => s + b.bb, 0)}</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', fontWeight: 700, color: '#FAF8F3' }}>{batters.reduce((s, b) => s + b.k, 0)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PitchingTable({ pitchers }: { pitchers: Pitcher[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'ERA'].map((col, i) => (
              <th key={col} style={{
                padding: '8px 10px',
                textAlign: i === 0 ? 'left' : 'right',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px',
                color: 'rgba(255,255,255,0.3)', fontWeight: 500, whiteSpace: 'nowrap',
                background: '#242426',
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pitchers.map((p, i) => (
            <tr key={i} style={{
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}>
              <td style={{ padding: '9px 10px', color: '#FAF8F3', whiteSpace: 'nowrap', fontWeight: 500 }}>{p.name}</td>
            <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.6)' }}>{p.h}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: p.r > 3 ? '#EF5350' : 'rgba(255,255,255,0.6)' }}>{p.r}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: p.er > 3 ? '#EF5350' : 'rgba(255,255,255,0.6)', fontWeight: p.er > 3 ? 700 : 400 }}>{p.er}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.6)' }}>{p.bb}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: p.k >= 6 ? '#4CAF50' : 'rgba(255,255,255,0.6)', fontWeight: p.k >= 6 ? 700 : 400 }}>{p.k}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: p.hr > 0 ? '#FF5722' : 'rgba(255,255,255,0.6)' }}>{p.hr}</td>
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{p.era ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
