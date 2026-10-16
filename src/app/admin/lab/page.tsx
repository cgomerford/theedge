// src/app/admin/lab/page.tsx
//
// The Lab: a private space to trial product ideas before they become real
// pages. Lives under /admin so it sits behind the existing admin basic-auth
// in src/proxy.ts (works in production too, unlike /dev). Not linked from the
// public site; noindex.
//
// To add an experiment: build it under src/app/admin/lab/<slug>/, then add one
// entry to EXPERIMENTS below.

import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'

export const metadata = { title: 'Lab - x9Lab', robots: { index: false, follow: false } }

const EXPERIMENTS = [
  {
    slug: 'team-makeup',
    title: 'Team make-up: pitching',
    status: 'Trial',
    blurb: 'Starters vs bullpen. Pitch mix, velocity variation, movement by pitch, arm-angle variation by club, and whether tighter release points line up with runs allowed.',
  },
  {
    slug: 'chart-builder',
    title: 'Dashboard builder',
    status: 'Trial',
    blurb: 'A Power BI-style canvas of KPI cards, scatters, bars and tables, with league and starters-vs-bullpen filters and cross-highlighting of clubs.',
  },
]

export default function LabHome() {
  return (
    <main style={{ background: C.cream, minHeight: '100vh', padding: '40px 24px 80px', fontFamily: SANS }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.orange, letterSpacing: '.16em' }}>⊕ LAB</div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.02em', margin: '6px 0 8px', color: C.ink }}>Product ideas, on trial.</h1>
        <p style={{ fontSize: 15, color: '#5b5347', maxWidth: 640, lineHeight: 1.5, margin: '0 0 28px' }}>
          A private space to try an analysis on real data before it earns a public page. Each experiment reads precomputed tables, so nothing here fetches live from Savant.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {EXPERIMENTS.map(e => (
            <Link key={e.slug} href={`/admin/lab/${e.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, height: '100%' }}>
                <div style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>{e.status}</div>
                <div style={{ fontWeight: 800, fontSize: 20, margin: '6px 0', color: C.ink }}>{e.title}</div>
                <div style={{ fontSize: 13, color: '#5b5347', lineHeight: 1.5 }}>{e.blurb}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
