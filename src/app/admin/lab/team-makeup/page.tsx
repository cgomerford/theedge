// src/app/admin/lab/team-makeup/page.tsx
//
// Lab experiment: Team make-up — pitching. The shell is server-rendered;
// the page body (TeamMakeupLab) loads each club from
// /api/admin/lab/team-makeup (Savant, aggregated + cached through
// withSavantCache). Runs allowed come from one MLB Stats API call. Behind
// admin basic-auth (src/proxy.ts covers /admin).

import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import TeamMakeupLab from '@/components/lab/TeamMakeupLab'
import { getTeamRuns } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export const metadata = { title: 'Team make-up: pitching - Lab', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function TeamMakeupPage() {
  const season = new Date().getFullYear()
  const runs = await getTeamRuns(season)

  return (
    <main className="tp-root" style={{ background: C.cream, minHeight: '100vh', padding: '32px 24px 80px', fontFamily: SANS, color: C.ink }}>
      <style>{`
        .lab-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 900px) { .lab-grid-2 { grid-template-columns: 1fr; } }
        .tp-root b, .tp-root strong, .tp-root h1, .tp-root h2, .tp-root h3 { font-family: var(--font-outfit), system-ui, sans-serif; }
      `}</style>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <Link href="/admin/lab" style={{ fontFamily: SANS, fontSize: 11, color: C.orange, letterSpacing: '.16em', textDecoration: 'none' }}>⊕ LAB</Link>
        <h1 style={{ fontWeight: 800, fontSize: 'clamp(30px, 5vw, 46px)', letterSpacing: '-.02em', margin: '6px 0 8px', lineHeight: 1.05 }}>Team make-up: pitching</h1>
        <p style={{ fontSize: 15, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: 0 }}>
          What each club&apos;s pitching staff is made of: what they throw, how hard, how it moves, and how much their arm slots and release points differ from pitcher to pitcher.
        </p>
        <TeamMakeupLab season={season} runs={runs} />
      </div>
    </main>
  )
}
