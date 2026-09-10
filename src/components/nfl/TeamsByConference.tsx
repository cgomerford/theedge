// src/components/nfl/TeamsByConference.tsx
//
// No CSS classes. Per-card hover state via useState/onMouseEnter/
// onMouseLeave, since the front/hover-reveal swap needs :hover-
// equivalent behavior and inline styles can't do CSS :hover directly.
//
// Data source and sourcing notes: src/lib/nfl-team-directory.ts

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { teamsByConferenceAndDivision, type NFLTeamDirectoryEntry } from '@/lib/nfl-team-directory'

function TeamCard({ team }: { team: NFLTeamDirectoryEntry }) {
  const [hover, setHover] = useState(false)

  return (
    <Link
      href={`/nfl/teams/${team.slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'block',
        textDecoration: 'none',
        overflow: 'hidden',
        width: '100%',
        height: 45,
        boxSizing: 'border-box',
        background: team.primaryColor,
        borderBottom: `5px solid ${team.secondaryColor}`,
      }}
    >
      <div style={{ position: 'relative', zIndex: 1, height: '100%', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, opacity: hover ? 0 : 1, transition: 'opacity .15s ease' }}>
        <img src={team.logoUrl} alt="" loading="lazy" style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, color: '#FFF', letterSpacing: '0.03em', lineHeight: 1, flexShrink: 0 }}>{team.abbr}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {team.headCoach}
          {team.headCoachIsNewFor2026 ? (
            <i style={{ fontFamily: "'JetBrains Mono', monospace", fontStyle: 'normal', fontSize: 6, background: 'rgba(255,255,255,0.9)', color: '#1A1A1A', padding: '0 3px', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>New</i>
          ) : null}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.65)', flexShrink: 0 }}>{team.lastSeasonRecord}</span>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 3,
          padding: '0 8px',
          background: team.primaryColor,
          opacity: hover ? 1 : 0,
          transform: hover ? 'none' : 'translateY(3px)',
          transition: 'opacity .15s ease, transform .15s ease',
        }}
      >
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 9, fontWeight: 700, color: '#FFF', lineHeight: 1.2 }}>{team.name}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6.5, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>View team page →</span>
      </div>
    </Link>
  )
}

function ConferenceBlock({
  conference,
  divisions,
}: {
  conference: 'AFC' | 'NFC'
  divisions: { division: string; teams: NFLTeamDirectoryEntry[] }[]
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.04em', margin: '0 0 6px', color: '#1A1A1A' }}>{conference}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
        {divisions.map((div, di) => (
          <div key={div.division} style={{ padding: '8px 10px', borderBottom: di < divisions.length - 1 ? '1px solid rgba(26,26,26,0.08)' : 'none' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#78716C', marginBottom: 6, display: 'block' }}>
              {conference} {div.division}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {div.teams.map((team) => (
                <TeamCard key={team.slug} team={team} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TeamsByConference() {
  const conferences = teamsByConferenceAndDivision()

  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#FF5722', letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0 }}>§ Every Team</p>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", margin: '4px 0 6px', fontSize: 22 }}>AFC &amp; NFC.</h2>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', margin: '0 0 16px', lineHeight: 1.5 }}>
          Head coach and {conferences[0]?.divisions[0]?.teams[0]?.lastSeasonYear ?? '2025'} record.
        </p>
      </div>

      {conferences.map((conf) => (
        <ConferenceBlock key={conf.conference} conference={conf.conference} divisions={conf.divisions} />
      ))}
    </section>
  )
}