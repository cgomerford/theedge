'use client'

// src/components/LineupCard.tsx
//
// Toggle card: Confirmed lineup (as posted by MLB, once available) vs.
// Optimized lineup — now built from each player's ACTUAL performance by
// lineup slot this season (see lib/lineup-optimizer.ts ->
// optimizeLineupBySlotHistory, sourced from lib/lineup-slot-stats.ts),
// not an abstract textbook heuristic. The `reason` string on each row
// tells you exactly why they're slotted where they are.

import { useState } from 'react'
import type { ConfirmedLineupEntry, OptimizedLineupEntry } from '@/lib/lineup-optimizer'

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

type Props = {
  teamColor: string
  confirmed: ConfirmedLineupEntry[] | null
  optimizedVsRHP: OptimizedLineupEntry[]
  optimizedVsLHP: OptimizedLineupEntry[]
}

export default function LineupCard({ teamColor, confirmed, optimizedVsRHP, optimizedVsLHP }: Props) {
  const [mode, setMode] = useState<'confirmed' | 'optimized'>(confirmed ? 'confirmed' : 'optimized')
  const [throwsHand, setThrowsHand] = useState<'R' | 'L'>('R')

  const optimizedRows = throwsHand === 'R' ? optimizedVsRHP : optimizedVsLHP

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Lineup</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMode('confirmed')}
            style={{
              fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 7,
              border: `1px solid ${mode === 'confirmed' ? teamColor : '#e7e2d8'}`,
              background: mode === 'confirmed' ? teamColor : '#fff',
              color: mode === 'confirmed' ? '#fff' : '#8a8275',
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            Confirmed
          </button>
          <button
            onClick={() => setMode('optimized')}
            style={{
              fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 7,
              border: `1px solid ${mode === 'optimized' ? teamColor : '#e7e2d8'}`,
              background: mode === 'optimized' ? teamColor : '#fff',
              color: mode === 'optimized' ? '#fff' : '#8a8275',
              cursor: 'pointer', fontWeight: 700,
            }}
          >
            Optimized
          </button>
        </div>
      </div>

      {mode === 'optimized' && (
        <div style={{ padding: '10px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#8a8275', textTransform: 'uppercase', letterSpacing: '.08em' }}>vs</span>
          <button
            onClick={() => setThrowsHand('R')}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
              border: `1px solid ${throwsHand === 'R' ? teamColor : '#e7e2d8'}`,
              background: throwsHand === 'R' ? `${teamColor}14` : '#fff',
              color: throwsHand === 'R' ? teamColor : '#8a8275', cursor: 'pointer',
            }}
          >
            RHP
          </button>
          <button
            onClick={() => setThrowsHand('L')}
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
              border: `1px solid ${throwsHand === 'L' ? teamColor : '#e7e2d8'}`,
              background: throwsHand === 'L' ? `${teamColor}14` : '#fff',
              color: throwsHand === 'L' ? teamColor : '#8a8275', cursor: 'pointer',
            }}
          >
            LHP
          </button>
        </div>
      )}

      <div style={{ padding: '10px 0' }}>
        {mode === 'confirmed' ? (
          confirmed && confirmed.length > 0 ? (
            confirmed.map(row => (
              <div key={row.playerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px' }}>
                <span style={{ width: 18, fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: '#a89e8c' }}>{row.battingOrder}</span>
                <img src={headshotUrl(row.playerId)} alt="" referrerPolicy="no-referrer" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6' }} />
                <span style={{ fontSize: 13, color: '#1A1A1A', flex: 1 }}>{row.playerName}</span>
                <span style={{ fontSize: 10, color: '#a89e8c', textTransform: 'uppercase' }}>{row.position}</span>
              </div>
            ))
          ) : (
            <p style={{ padding: '20px', fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>
              Lineup not posted yet — MLB typically confirms 60-90 minutes before first pitch. Check the Optimized view in the meantime.
            </p>
          )
        ) : (
          optimizedRows.length > 0 ? (
            optimizedRows.map(row => (
              <div key={row.playerId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 20px' }}>
                <span style={{ width: 18, fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: '#a89e8c' }}>{row.battingOrder}</span>
                <img src={headshotUrl(row.playerId)} alt="" referrerPolicy="no-referrer" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1A1A1A' }}>{row.playerName}</div>
                  <div style={{ fontSize: 9, color: '#a89e8c' }}>{row.reason}</div>
                </div>
              </div>
            ))
          ) : (
            <p style={{ padding: '20px', fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>Not enough slot history yet to build an optimized order.</p>
          )
        )}
      </div>

      {mode === 'optimized' && (
        <div style={{ padding: '0 20px 14px' }}>
          <p style={{ fontSize: 9, color: '#c4bcac' }}>
            Ordered by each player&apos;s own AVG/OBP/SLG/OPS in the slot they&apos;ve actually hit best in this season — not a textbook formula. Greedy assignment, not a guaranteed global optimum.
          </p>
        </div>
      )}
    </div>
  )
}