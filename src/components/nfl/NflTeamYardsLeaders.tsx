// src/components/nfl/NflTeamYardsLeaders.tsx
//
// Tabbed team stats leaderboard: Offense (yards) / Defense (sacks+TFL+INTs)
// / FG (made-att, season%). Typography matches NflLeaders.tsx exactly --
// same Fraunces serif for names/values, JetBrains Mono for everything
// else, same rank/accent-on-#1 pattern, same 42px circular avatar
// treatment (logo instead of headshot).

'use client'

import { useState } from 'react'

export type TeamYardsRow = { teamId: string; logoUrl: string; totalYards: number; passYards: number; rushYards: number }
export type TeamDefenseRow = { teamId: string; logoUrl: string; sacks: number; tacklesForLoss: number; interceptions: number; defensivePlays: number }
export type TeamFgRow = { teamId: string; logoUrl: string; fgMade: number; fgAtt: number; fgPct: number | null }

const TABS = ['Offense', 'Defense', 'FG'] as const
type Tab = (typeof TABS)[number]

const ACCENT = '#FF5722'

function EmptyState() {
  return (
    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A3A3A3', fontStyle: 'italic', padding: '12px 0' }}>
      No data yet this season.
    </p>
  )
}

function Row({ rank, logoUrl, teamId, statLabel, value, sub }: { rank: number; logoUrl: string; teamId: string; statLabel: string; value: string; sub: string }) {
  const isFirst = rank === 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, width: 18, flexShrink: 0, textAlign: 'right', color: isFirst ? ACCENT : '#D4D0C8' }}>
        {rank}
      </span>
      <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0EBE0', border: `2px solid ${isFirst ? ACCENT : '#F0EBE0'}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" loading="lazy" style={{ width: '70%', height: '70%', objectFit: 'contain', display: 'block' }} />
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {teamId}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: isFirst ? ACCENT : '#1A1A1A', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
          {statLabel}
        </div>
      </div>
    </div>
  )
}

export default function NflTeamYardsLeaders({
  offense,
  defense,
  fieldGoals,
}: {
  offense: TeamYardsRow[]
  defense: TeamDefenseRow[]
  fieldGoals: TeamFgRow[]
}) {
  const [tab, setTab] = useState<Tab>('Offense')

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 4 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: tab === t ? 700 : 400,
              letterSpacing: '0.04em',
              padding: '6px 12px 8px',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: tab === t ? ACCENT : '#A3A3A3',
              borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Offense' && (
        offense.length === 0 ? <EmptyState /> : (
          <div>
            {offense.map((r, i) => (
              <Row
                key={r.teamId}
                rank={i + 1}
                logoUrl={r.logoUrl}
                teamId={r.teamId}
                value={r.totalYards.toLocaleString()}
                statLabel="Total Yds"
                sub={`${r.passYards.toLocaleString()} pass · ${r.rushYards.toLocaleString()} rush`}
              />
            ))}
          </div>
        )
      )}

      {tab === 'Defense' && (
        defense.length === 0 ? <EmptyState /> : (
          <div>
            {defense.map((r, i) => (
              <Row
                key={r.teamId}
                rank={i + 1}
                logoUrl={r.logoUrl}
                teamId={r.teamId}
                value={String(r.defensivePlays)}
                statLabel="Def Plays"
                sub={`${r.sacks} sk · ${r.tacklesForLoss} tfl · ${r.interceptions} int`}
              />
            ))}
          </div>
        )
      )}

      {tab === 'FG' && (
        fieldGoals.length === 0 ? <EmptyState /> : (
          <div>
            {fieldGoals.map((r, i) => (
              <Row
                key={r.teamId}
                rank={i + 1}
                logoUrl={r.logoUrl}
                teamId={r.teamId}
                value={`${r.fgMade}-${r.fgAtt}`}
                statLabel={r.fgPct != null ? `${r.fgPct}% FG` : 'FG'}
                sub=""
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}