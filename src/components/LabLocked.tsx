// src/components/LabLocked.tsx
//
// What a non-Pro visitor sees at /mlb/{batting,pitching}-lab/[playerId]/*. Rendered
// by the SERVER layout (which checked the subscriber session first), so none of the
// lab's client code or data requests ever run for them. Empty state over teaser:
// it lists what the lab contains and links to the free basic stats page.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'

const COPY = {
  batting: {
    name: 'Batting Lab',
    blurb: 'Pitch-by-pitch detail on how a hitter handles every pitch type, where he does damage, and how pitchers work him.',
    features: ['Results against every pitch type', 'Location lab and zone heat maps by pitch type', 'Hot-zone overlay against any pitcher', 'Sequencing: how pitchers attack him', 'Contact-quality trends and career head-to-head'],
  },
  pitching: {
    name: 'Pitching Lab',
    blurb: 'Every pitch in a pitcher\'s arsenal: velocity, movement, usage, where each one lands, and how he sequences hitters.',
    features: ['Arsenal with velocity, movement and results per pitch', 'Location lab and count tendencies', 'Hot-zone overlay against any lineup', 'Sequencing by count', 'Trends and career head-to-head'],
  },
} as const

export default function LabLocked({ lab, playerId }: { lab: 'batting' | 'pitching'; playerId: number }) {
  const c = COPY[lab]
  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div className="max-w-[760px] mx-auto px-6 py-16">
        <span style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', background: '#FDE047', color: '#1A1A1A', padding: '3px 7px', borderRadius: 5 }}>PRO</span>
        <h1 style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontWeight: 800, fontSize: 40, letterSpacing: '-.02em', margin: '14px 0 10px', color: '#1A1A1A' }}>{c.name} is a Pro feature</h1>
        <p style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontSize: 16, color: '#4A4740', lineHeight: 1.55, margin: '0 0 18px' }}>{c.blurb}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 8 }}>
          {c.features.map(f => (
            <li key={f} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-outfit), system-ui, sans-serif', fontSize: 14.5, color: '#3a352c' }}><span style={{ color: '#FF5722' }}>◆</span>{f}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <Link href="/pricing" style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', padding: '12px 18px', borderRadius: 8, textDecoration: 'none' }}>Unlock with Pro →</Link>
          {playerId > 0 && <Link href={`/mlb/players/${playerId}`} style={{ fontFamily: 'var(--font-jetbrains), monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>← Basic stats page (free)</Link>}
        </div>
      </div>
    </main>
  )
}
