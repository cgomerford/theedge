// The one player header for both labs: headshot, name, team logo and name, a short line of facts, and the actions on the right.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'

export default function LabPlayerHeader({ id, name, teamId, teamAbbr, teamName, facts, followSlot, changeHref, changeLabel }: {
  id: number; name: string; teamId?: number; teamAbbr?: string; teamName?: string; facts?: string
  followSlot?: ReactNode; changeHref: string; changeLabel: string
}) {
  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <Headshot id={id} name={name} size={72} />
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{name}</h1>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', fontSize: 14, color: '#57534E' }}>
          {teamId && teamAbbr ? <TeamMark id={teamId} abbr={teamAbbr} size={22} /> : null}
          {teamName ? <b style={{ color: '#1A1A1A' }}>{teamName}</b> : null}
          {facts ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{facts}</span> : null}
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {followSlot}
        <Link href={`/mlb/players/${id}`} style={{ color: '#FF5722', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>Player page →</Link>
        <Link href={changeHref} style={{ fontSize: 14, fontWeight: 600, color: '#57534E', textDecoration: 'none' }}>{changeLabel}</Link>
      </div>
    </div>
  )
}
