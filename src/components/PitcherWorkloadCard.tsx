'use client'

// src/components/PitcherWorkloadCard.tsx
//
// Grid: one row per pitcher, one column per day, cell = pitches thrown
// that day. Sorted by total pitches (heaviest workload first). Cell
// shading scales with pitch count so heavy days jump out without reading
// every number — same "quiet heatmap" language used elsewhere in the app.

import type { Last7DaysWorkload } from '@/lib/pitcher-workload'

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function formatDayLabel(dateStr: string): { weekday: string; day: string } {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
  }
}

function cellShade(pitches: number): { bg: string; color: string } {
  if (pitches === 0) return { bg: 'transparent', color: '#d8d2c4' }
  if (pitches <= 15) return { bg: '#FAEEDA', color: '#854F0B' }
  if (pitches <= 30) return { bg: '#F0997B', color: '#5c1f0e' }
  return { bg: '#B23A2E', color: '#fff' }
}

type Props = {
  workload?: Last7DaysWorkload | null
  teamColor?: string
  teamAbbr?: string
}

export default function PitcherWorkloadCard({ workload, teamColor = '#FF5722', teamAbbr }: Props) {
  const dates = workload?.dates ?? []
  const pitchers = workload?.pitchers ?? []

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 12, overflow: 'hidden', width: '100%', marginBottom: 16 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1eee6' }}>
        <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: teamColor, fontWeight: 700 }}>
          {teamAbbr ? `${teamAbbr} · Last 7 days workload` : 'Last 7 days — pitcher workload'}
        </div>
        <div style={{ fontSize: 8.5, color: '#a89e8c', marginTop: 2 }}>
          Pitches thrown per day · relievers only, current roster
        </div>
      </div>

      {pitchers.length === 0 ? (
        <p style={{ padding: '16px 12px', fontSize: 11, color: '#a89e8c', fontStyle: 'italic', textAlign: 'center' }}>
          No pitching activity in the last 7 days.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 8.5, color: '#a89e8c', textTransform: 'uppercase', fontWeight: 600 }}>
                  Pitcher
                </th>
                {dates.map(d => {
                  const { weekday, day } = formatDayLabel(d)
                  return (
                    <th key={d} style={{ textAlign: 'center', padding: '6px 2px', fontSize: 8.5, color: '#a89e8c', fontWeight: 600, minWidth: 40 }}>
                      <div style={{ textTransform: 'uppercase' }}>{weekday}</div>
                      <div style={{ fontSize: 8, color: '#c4bcac' }}>{day}</div>
                    </th>
                  )
                })}
                <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 8.5, color: '#a89e8c', textTransform: 'uppercase', fontWeight: 600 }}>
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              {pitchers.map((p, i) => (
                <tr key={p.playerId} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f5ef' }}>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img
                        src={headshotUrl(p.playerId)}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 11, color: '#1A1A1A', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {p.playerName}
                      </span>
                    </div>
                  </td>
                  {dates.map(d => {
                    const pitches = p.byDate?.[d] ?? 0
                    const { bg, color } = cellShade(pitches)
                    return (
                      <td key={d} style={{ textAlign: 'center', padding: '2px' }}>
                        <div style={{ background: bg, color, borderRadius: 5, padding: '4px 0', fontSize: 11, fontWeight: 700, minWidth: 32 }}>
                          {pitches > 0 ? pitches : '—'}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'center', padding: '4px 8px', fontSize: 11, fontWeight: 700, color: teamColor }}>
                    {p.totalPitches}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
} 