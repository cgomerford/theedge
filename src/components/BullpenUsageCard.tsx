'use client'

// src/components/BullpenUsageCard.tsx
//
// Per reliever (starters already filtered out before this component sees
// them — see filterOutStarters/getEligibleRelieverIds in
// lib/bullpen-usage.ts, applied in page.tsx): a condensed one-line summary
// (headshot, name, single best inning, blown-save badge) that expands on
// click into the full per-inning breakdown: FIP, avg runs allowed, and
// blown lead/save counts for that specific inning.
//
// 2026-08-17: condensed from a two-line row (name/appearances on one line,
// a long "most used X, sharpest Y" sentence on the other) down to a single
// line per reliever — this card now lives in a narrow sidebar-width column
// in the Scout Report's 4-column layout, not a wide 3-column card, and the
// old row width assumed much more horizontal room. Also capped the default
// list to the top 3 relievers by appearances with a "Show all N" toggle,
// since a full pitching staff's worth of rows no longer fits without the
// card dominating the whole column.

import { useState } from 'react'
import type { RelieverProfile, BullpenReport } from '@/lib/bullpen-usage'

const DEFAULT_VISIBLE = 3

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function RelieverRow({ p, isLast }: { p: RelieverProfile; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const lines = p?.lines ?? []
  const best = p.bestInning

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #f7f5ef' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          padding: '9px 14px',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        {/* Row 1: headshot, name, blown-save badge, chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <img
            src={headshotUrl(p.playerId)}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6', flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, color: '#1A1A1A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.playerName}
          </span>
          {p.totalBlownSaves > 0 && (
            <span style={{ fontSize: 8, fontWeight: 700, color: '#712B13', background: '#FAECE7', padding: '2px 5px', borderRadius: 5, flexShrink: 0 }}>
              {p.totalBlownSaves} BSv
            </span>
          )}
          <span style={{ fontSize: 10, color: '#c4bcac', flexShrink: 0 }}>{open ? '−' : '+'}</span>
        </div>
        {/* Row 2: most used + best inning detail — its own line, no longer
            fighting the name/badge for horizontal space */}
        <div style={{ fontSize: 10, color: '#5b5347', paddingLeft: 34 }}>
          {p.mostUsedInning != null && (
            <>Most used: <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{ordinal(p.mostUsedInning)}</span></>
          )}
          {p.mostUsedInning != null && ' · '}
          {best ? (
            <>Best: <span style={{ fontWeight: 700, color: '#085041' }}>{ordinal(best.inning)}</span> ({best.avgRunsAllowed} R/app)</>
          ) : (
            <span style={{ fontStyle: 'italic', color: '#a89e8c' }}>Sample too small to call</span>
          )}
        </div>
      </button>

      {open && lines.length > 0 && (
        <div style={{ padding: '0 14px 12px 48px' }}>
          <p style={{ fontSize: 9, color: '#8a8275', marginBottom: 6 }}>{p.appearances} appearances this season</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
            {lines.map(l => {
              const isMostUsed = l.inning === p.mostUsedInning
              const isBest = l.inning === p.bestInning?.inning
              return (
                <div
                  key={l.inning}
                  style={{
                    border: `1px solid ${isBest ? '#1D9E75' : '#f1eee6'}`,
                    background: isBest ? '#E1F5EE' : '#fff',
                    borderRadius: 8,
                    padding: '5px 7px',
                  }}
                >
                  <div style={{ fontSize: 8, color: '#8a8275', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inn {l.inning}</span>
                    {isMostUsed && <span style={{ color: '#EF9F27', fontWeight: 700 }}>●used</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isBest ? '#085041' : '#1A1A1A' }}>
                    {l.avgRunsAllowed} R/app
                  </div>
                  <div style={{ fontSize: 7, color: '#a89e8c' }}>{l.appearancesInInning} app · {l.battersFaced} BF</div>
                  {(l.blownLeads > 0 || l.blownSaves > 0) && (
                    <div style={{ fontSize: 7, color: '#B23A2E', marginTop: 2 }}>
                      {l.blownSaves > 0 ? `${l.blownSaves} blown save${l.blownSaves === 1 ? '' : 's'}` : `${l.blownLeads} blown lead${l.blownLeads === 1 ? '' : 's'}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 7, color: '#c4bcac', marginTop: 6 }}>
            "Runs allowed" counts all runs charged while on the mound (a close proxy for ER, not the official earned/unearned ruling). Blown save/lead counts are an approximation based on run-lead tracking, not the official save-situation rule.
          </p>
        </div>
      )}
    </div>
  )
}

type Props = {
  relievers?: RelieverProfile[]
  teamColor?: string
  gamesSampled?: number
  report?: BullpenReport | null
  homeAbbr?: string
  awayAbbr?: string
  homeColor?: string
  awayColor?: string
}

export default function BullpenUsageCard({
  relievers: relieversProp,
  teamColor,
  gamesSampled: gamesSampledProp,
  report,
  homeAbbr,
  awayAbbr,
  homeColor = '#1A1A1A',
  awayColor = '#FF5722',
}: Props) {
  const [showAll, setShowAll] = useState(false)

  const reportRelievers = report
    ? (report as any).relievers ??
      [...((report as any).awayRelievers ?? []), ...((report as any).homeRelievers ?? [])]
    : []

  const relievers: RelieverProfile[] = relieversProp ?? reportRelievers ?? []
  const gamesSampled = gamesSampledProp ?? (report as any)?.gamesSampled ?? 0

  const visible = showAll ? relievers : relievers.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = relievers.length - DEFAULT_VISIBLE

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1eee6' }}>
        <div style={{ fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: teamColor || awayColor || '#FF5722', fontWeight: 700 }}>
          Bullpen — best inning
        </div>
        <div style={{ fontSize: 8, color: '#a89e8c', marginTop: 2 }}>
          Full season · {gamesSampled} games · starters excluded · tap an arm for the full breakdown
        </div>
      </div>
      {relievers.length === 0 ? (
        <p style={{ padding: '16px', fontSize: 11, color: '#a89e8c', fontStyle: 'italic' }}>
          No bullpen data available for this sample.
        </p>
      ) : (
        <div>
          {visible.map((p, i) => (
            <RelieverRow key={p.playerId} p={p} isLast={i === visible.length - 1 && (showAll || hiddenCount <= 0)} />
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                width: '100%', padding: '8px', background: '#faf8f3', border: 'none',
                borderTop: '1px solid #f1eee6', cursor: 'pointer', font: 'inherit',
                fontSize: 10, fontWeight: 700, color: teamColor || awayColor || '#FF5722',
                textTransform: 'uppercase', letterSpacing: '.08em',
              }}
            >
              {showAll ? 'Show less' : `Show all ${relievers.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}