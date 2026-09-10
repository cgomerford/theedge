// src/components/nfl/NflLeaders.tsx
//
// No CSS classes. Mirrors MLB's LeaderPanel values (row layout, avatar
// size, rank/value accent-on-#1-only pattern, font sizes) inline.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LeaderRow } from '@/lib/nfl/queries'

const TABS = [
  { key: 'pass', label: 'Passing', statLabel: 'Pass Yds' },
  { key: 'rush', label: 'Rushing', statLabel: 'Rush Yds' },
  { key: 'rec', label: 'Receiving', statLabel: 'Rec Yds' },
  { key: 'int', label: 'INT', statLabel: 'INT' },
  { key: 'tfl', label: 'Pass Rush', statLabel: 'TFL' },
  { key: 'fantasy', label: 'Fantasy', statLabel: 'PPR Pts' },
] as const

const ACCENT = '#FF5722'

export function NflLeaders({
  qbLeaders,
  rbLeaders,
  wrLeaders,
  intLeaders,
  tflLeaders,
  fantasyLeaders,
}: {
  qbLeaders: LeaderRow[]
  rbLeaders: LeaderRow[]
  wrLeaders: LeaderRow[]
  intLeaders: LeaderRow[]
  tflLeaders: LeaderRow[]
  fantasyLeaders: LeaderRow[]
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pass')

  const dataByTab: Record<string, LeaderRow[]> = {
    pass: qbLeaders,
    rush: rbLeaders,
    rec: wrLeaders,
    int: intLeaders,
    tfl: tflLeaders,
    fantasy: fantasyLeaders,
  }
  const decimalsByTab: Record<string, number> = { fantasy: 1 }

  const leaders = dataByTab[tab] ?? []
  const decimals = decimalsByTab[tab] ?? 0
  const activeTab = TABS.find((t) => t.key === tab)!

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: tab === t.key ? 700 : 400,
              letterSpacing: '0.04em',
              padding: '6px 12px 8px',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: tab === t.key ? ACCENT : '#A3A3A3',
              borderBottom: tab === t.key ? `2px solid ${ACCENT}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {leaders.length === 0 ? (
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', fontStyle: 'italic', padding: '12px 0' }}>No data yet this season.</p>
      ) : (
        <div>
           {leaders.slice(0, 10).map((l, i) => (
            <Link
              key={l.gsisId}
              href={`/nfl/players/${l.gsisId}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)', textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, width: 18, flexShrink: 0, textAlign: 'right', color: i === 0 ? ACCENT : '#D4D0C8' }}>
                {i + 1}
              </span>
              <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0EBE0', border: `2px solid ${i === 0 ? ACCENT : '#F0EBE0'}`, boxSizing: 'border-box' }}>
                {l.headshotUrl ? (
                  <img src={l.headshotUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.fullName}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', marginTop: 1 }}>{l.teamId}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: i === 0 ? ACCENT : '#1A1A1A', lineHeight: 1 }}>
                  {l.statValue.toFixed(decimals)}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                  {activeTab.statLabel}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}