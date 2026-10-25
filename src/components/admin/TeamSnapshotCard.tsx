'use client'

// src/components/admin/TeamSnapshotCard.tsx
//
// Team-only X graphic (1080x1350, 4:5): team-coloured header with the club logo
// and record, then Offense / Pitching / Bullpen rows, each a value plus the
// club's rank among the league with a green→red bar. No player headshots.
// Purely presentational — data comes from lib/admin-team-card.ts (one cached
// league table), and a missing value renders as "—", never a fabricated number.
//
// Fonts/colours follow DESIGN_SYSTEM.md (C/SANS/MONO from components/team/ui.tsx).

import { forwardRef } from 'react'
import { C, SANS, MONO, rankTone } from '@/components/team/ui'
import { ordinal } from '@/lib/ordinal'
import { teamLogoUrl } from '@/lib/mlb'
import type { TeamSnapshotData } from '@/lib/admin-team-card'
import { SITE_HOST } from '@/lib/site'

const W = 1080, H = 1350

const TeamSnapshotCard = forwardRef<HTMLDivElement, { team: TeamSnapshotData }>(function TeamSnapshotCard({ team }, ref) {
  const diffStr = team.diff > 0 ? `+${team.diff}` : String(team.diff)
  return (
    <div ref={ref} style={{ width: W, height: H, background: C.cream, fontFamily: SANS, color: C.ink, display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{ background: team.primary, color: team.text, padding: '56px 64px 48px', display: 'flex', alignItems: 'center', gap: 36 }}>
        <img src={teamLogoUrl(team.teamId)} alt="" style={{ width: 190, height: 190, objectFit: 'contain' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.8 }}>
            {team.season} {team.mode === 'postseason' ? 'postseason' : 'season'} · {team.division}
          </div>
          <div style={{ fontWeight: 800, fontSize: 68, letterSpacing: '-0.02em', lineHeight: 1.02, margin: '10px 0 14px' }}>{team.name}</div>
          <div style={{ display: 'flex', gap: 36, fontVariantNumeric: 'tabular-nums' }}>
            <Stat label="Record" value={`${team.w}-${team.l}`} />
            <Stat label="Run diff" value={diffStr} />
            {team.mode === 'postseason'
              ? <Stat label="Games" value={String(team.gp)} />
              : <Stat label="Div. finish" value={team.divRank > 0 ? ordinal(team.divRank) : '—'} />}
          </div>
        </div>
      </div>
      <div style={{ height: 8, background: team.secondary }} />

      {/* Groups */}
      <div style={{ flex: 1, padding: '34px 64px 0', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {team.groups.map(g => (
          <div key={g.title}>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, marginBottom: 10 }}>⊕ {g.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.metrics.map(m => {
                const t = rankTone(m.rank, m.of)
                const pct = m.rank == null || m.of < 2 ? 0 : ((m.of - m.rank) / (m.of - 1)) * 100
                return (
                  <div key={m.label} style={{ display: 'grid', gridTemplateColumns: '250px 150px 1fr 96px', alignItems: 'center', gap: 20 }}>
                    <span style={{ fontSize: 28, color: '#5b5347' }}>{m.label}</span>
                    <span style={{ fontWeight: 800, fontSize: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.display}</span>
                    <div style={{ height: 18, background: C.soft, borderRadius: 9 }}>
                      <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', background: t.bar, borderRadius: 9 }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 24, textAlign: 'center', padding: '4px 0', borderRadius: 10, color: t.fg, background: t.bg }}>
                      {m.rank == null ? '—' : ordinal(m.rank)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '0 64px 34px' }}>
        <div style={{ fontFamily: MONO, fontSize: 17, color: C.faint, marginBottom: 16 }}>
          Rank among {team.groups[0]?.metrics[0]?.of ?? 30} {team.mode === 'postseason' ? 'postseason clubs' : 'clubs'} · 1st = best · source: MLB Stats API, {team.season} {team.mode === 'postseason' ? 'postseason (small sample)' : 'regular season'}
        </div>
        <div style={{ borderTop: `2px solid ${C.line}`, paddingTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/brand/x9labs-mark.png" alt="" style={{ height: 44, width: 'auto' }} />
            <span style={{ fontWeight: 800, fontSize: 28 }}>x9Lab</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 20, color: C.mute }}>{SITE_HOST}</span>
        </div>
      </div>
    </div>
  )
})

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export default TeamSnapshotCard
