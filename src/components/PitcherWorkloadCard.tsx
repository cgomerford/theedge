'use client'

// src/components/PitcherWorkloadCard.tsx
//
// Two-line row per pitcher, same pattern as BullpenUsageCard's
// RelieverProfile rows:
//   Line 1 — headshot, name, most-used inning (season-wide, from
//            BullpenReport, same data BullpenUsageCard already
//            computes), total pitches (last 7 days)
//   Line 2 — 7-day colored strip, ONE CELL PER DAY, with the day label
//            and the actual pitch count shown directly inside the cell
//            (not hover-only) — same "quiet heatmap" shading language
//            as the bullpen card's per-inning breakdown cells.
//
// 2026-08-20: brought the day-by-day view back after the previous pass
// dropped it in favor of most-used-inning only — the calendar view and
// most-used inning aren't a replacement for each other, they're
// complementary (one shows recent workload pattern, the other shows
// season-long usage tendency), so both stay. The earlier hover-only
// tooltip version is gone — values now render directly inside each cell.

import { useState } from 'react'
import type { Last7DaysWorkload } from '@/lib/pitcher-workload'
import type { BullpenReport } from '@/lib/bullpen-usage'

const DEFAULT_VISIBLE = 3

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function cellShade(pitches: number): { bg: string; text: string } {
  if (pitches === 0) return { bg: '#F5F3EC', text: '#c4bcac' }
  if (pitches <= 15) return { bg: '#FAEEDA', text: '#854F0B' }
  if (pitches <= 30) return { bg: '#F0997B', text: '#5c1f0e' }
  return { bg: '#B23A2E', text: '#fff' }
}

type Props = {
  workload?: Last7DaysWorkload | null
  bullpenReport?: BullpenReport | null
  teamColor?: string
  teamAbbr?: string
}

export default function PitcherWorkloadCard({ workload, bullpenReport, teamColor = '#FF5722', teamAbbr }: Props) {
  const [showAll, setShowAll] = useState(false)
  const dates = workload?.dates ?? []
  const pitchers = workload?.pitchers ?? []

  const mostUsedByPlayer = new Map<number, number | null>(
    (bullpenReport?.relievers ?? []).map(r => [r.playerId, r.mostUsedInning]),
  )

  const visible = showAll ? pitchers : pitchers.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = pitchers.length - DEFAULT_VISIBLE

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 12, overflow: 'hidden', width: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1eee6' }}>
        <div style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: teamColor, fontWeight: 700 }}>
          {teamAbbr ? `${teamAbbr} · Workload` : 'Pitcher workload'}
        </div>
        <div style={{ fontSize: 8, color: '#a89e8c', marginTop: 2 }}>
          Most used inning (season) · pitches by day (last 7) · relievers only
        </div>
      </div>

      {pitchers.length === 0 ? (
        <p style={{ padding: '16px 12px', fontSize: 11, color: '#a89e8c', fontStyle: 'italic', textAlign: 'center' }}>
          No pitching activity in the last 7 days.
        </p>
      ) : (
        <div>
          {visible.map((p, i) => {
            const mostUsed = mostUsedByPlayer.get(p.playerId)
            return (
              <div
                key={p.playerId}
                style={{
                  padding: '9px 12px',
                  borderTop: i === 0 ? 'none' : '1px solid #f7f5ef',
                }}
              >
                {/* Line 1: headshot, name, most-used inning, total pitches */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <img
                    src={headshotUrl(p.playerId)}
                    alt=""
                    referrerPolicy="no-referrer"
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: '#1A1A1A', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.playerName}
                  </span>
                  <span style={{ fontSize: 9, color: '#5b5347', flexShrink: 0 }}>
                    {mostUsed != null ? (
                      <>Most used: <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{ordinal(mostUsed)}</span></>
                    ) : (
                      <span style={{ fontStyle: 'italic', color: '#a89e8c' }}>—</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: teamColor, flexShrink: 0 }}>
                    {p.totalPitches}p
                  </span>
                </div>

                {/* Line 2: 7-day strip, value shown directly inside each cell */}
                <div style={{ display: 'flex', gap: 3, paddingLeft: 32 }}>
                  {dates.map(d => {
                    const pitches = p.byDate?.[d] ?? 0
                    const { bg, text } = cellShade(pitches)
                    return (
                      <div
                        key={d}
                        style={{
                          flex: 1, minWidth: 0, background: bg, borderRadius: 5,
                          padding: '3px 2px', textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 7, color: text, opacity: 0.75, textTransform: 'uppercase', fontWeight: 600 }}>
                          {formatDayLabel(d)}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: text, lineHeight: 1.3 }}>
                          {pitches > 0 ? pitches : '–'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                width: '100%', padding: '8px', background: '#faf8f3', border: 'none',
                borderTop: '1px solid #f1eee6', cursor: 'pointer', font: 'inherit',
                fontSize: 10, fontWeight: 700, color: teamColor,
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}
            >
              {showAll ? 'Show less' : `Show all ${pitchers.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}