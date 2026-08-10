'use client'

// src/components/BullpenUsageCard.tsx
//
// Per reliever (starters already filtered out before this component sees
// them — see filterOutStarters in lib/bullpen-usage.ts, applied in
// page.tsx): appearances, the "most used vs actually best" inning
// callout, and a season blown-save/blown-lead count. Expandable row
// reveals the full per-inning breakdown: FIP, avg runs allowed, and
// blown lead/save counts for that specific inning.

import { useState } from 'react'
import type { RelieverProfile, BullpenReport } from '@/lib/bullpen-usage'

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

function RelieverRow({ p, isLast }: { p: RelieverProfile; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const lines = p?.lines ?? []

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #f7f5ef' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <img
          src={headshotUrl(p.playerId)}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#1A1A1A' }}>{p.playerName}</div>
          <div style={{ fontSize: 9, color: '#a89e8c' }}>{p.appearances} appearances</div>
        </div>
        {p.totalBlownSaves > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#712B13', background: '#FAECE7', padding: '2px 6px', borderRadius: 5, flexShrink: 0 }}>
            {p.totalBlownSaves} BSv
          </span>
        )}
        <span style={{ fontSize: 10, color: '#5b5347', maxWidth: 240, textAlign: 'right' }}>{p.summary}</span>
        <span style={{ fontSize: 10, color: '#c4bcac', flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>

      {open && lines.length > 0 && (
        <div style={{ padding: '0 20px 14px 62px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
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
                    padding: '6px 8px',
                  }}
                >
                  <div style={{ fontSize: 9, color: '#8a8275', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inn {l.inning}</span>
                    {isMostUsed && <span style={{ color: '#EF9F27', fontWeight: 700 }}>●most used</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isBest ? '#085041' : '#1A1A1A' }}>
                    {l.avgRunsAllowed} R/app
                  </div>
                  <div style={{ fontSize: 8, color: '#a89e8c' }}>{l.appearancesInInning} app · {l.battersFaced} BF</div>
                  {(l.blownLeads > 0 || l.blownSaves > 0) && (
                    <div style={{ fontSize: 8, color: '#B23A2E', marginTop: 2 }}>
                      {l.blownSaves > 0 ? `${l.blownSaves} blown save${l.blownSaves === 1 ? '' : 's'}` : `${l.blownLeads} blown lead${l.blownLeads === 1 ? '' : 's'}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 8, color: '#c4bcac', marginTop: 8 }}>
            "Runs allowed" counts all runs charged while this pitcher was on the mound (a close proxy for ER, not the official earned/unearned scorer ruling). Blown save/lead counts are an approximation based on run-lead tracking, not the official save-situation rule.
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
  // Safely extract relievers from either relieversProp or report prop
  const reportRelievers = report
    ? (report as any).relievers ??
      [...((report as any).awayRelievers ?? []), ...((report as any).homeRelievers ?? [])]
    : []

  const relievers: RelieverProfile[] = relieversProp ?? reportRelievers ?? []
  const gamesSampled = gamesSampledProp ?? (report as any)?.gamesSampled ?? 0

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6' }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: awayColor || '#FF5722', fontWeight: 700 }}>
          Bullpen arms — where they work best
        </div>
        <div style={{ fontSize: 9, color: '#a89e8c', marginTop: 2 }}>
          Full season · {gamesSampled} games · starters excluded · min. 3 season appearances · current roster only · tap an arm for the inning-by-inning breakdown
        </div>
      </div>
      {relievers.length === 0 ? (
        <p style={{ padding: '20px', fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>
          No bullpen data available for this sample.
        </p>
      ) : (
        <div>
          {relievers.map((p, i) => (
            <RelieverRow key={p.playerId} p={p} isLast={i === relievers.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}