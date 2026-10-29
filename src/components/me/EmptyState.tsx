// src/components/me/EmptyState.tsx: with no follows the dashboard shows this one panel: "Build your dashboard", three real suggestions (each with one real stat) and the search link.
import Link from 'next/link'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { FREE_LIMITS } from '@/lib/follows/config'
import FollowPill from './FollowPill'
import { CARD, GREY, NUMS, SANS } from './ui'

export type Suggestion = { kind: 'team' | 'player'; refId: string; name: string; line: string; id: number; abbr: string }

export default function EmptyState({ items, isPro }: { items: Suggestion[]; isPro: boolean }) {
  return (
    <section style={{ ...CARD, padding: 'clamp(18px, 3vw, 32px)' }} aria-label="Build your dashboard">
      <h2 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: SANS }}>Build your dashboard</h2>
      <p style={{ margin: '8px 0 18px', fontSize: 15, color: GREY, maxWidth: 560, lineHeight: 1.5 }}>
        {isPro ? 'Follow players and teams.' : `Follow up to ${FREE_LIMITS.player} players and ${FREE_LIMITS.team} teams.`} Your cards, team tracker and recaps fill in here.
      </p>
      <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
        {items.map(s => (
          <div key={s.refId} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #e7e2d8', borderRadius: 12, padding: '10px 14px' }}>
            {s.kind === 'player' ? <Headshot id={s.id} name={s.name} size={40} /> : <TeamMark id={s.id} abbr={s.abbr} size={36} />}
            <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', fontSize: 16, fontFamily: SANS }}>{s.name}</b><span style={{ fontSize: 13, color: GREY, ...NUMS }}>{s.line}</span></span>
            <FollowPill kind={s.kind} refId={s.refId} name={s.name} />
          </div>
        ))}
      </div>
      <Link href="/mlb" style={{ display: 'inline-block', marginTop: 16, fontSize: 14, fontWeight: 800, color: '#FF5722', textDecoration: 'none' }}>Search any player or team →</Link>
    </section>
  )
}
