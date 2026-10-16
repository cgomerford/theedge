// src/app/admin/lab/chart-builder/page.tsx
//
// Lab experiment: Chart builder. Same data as Team make-up (cached per club
// via /api/admin/lab/team-makeup); runs allowed from the MLB Stats API.
// Behind admin basic-auth (src/proxy.ts covers /admin).

import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import ChartBuilder from '@/components/lab/ChartBuilder'
import { getTeamRuns } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export const metadata = { title: 'Dashboard - Lab', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ChartBuilderPage() {
  const season = new Date().getFullYear()
  const runs = await getTeamRuns(season)
  return (
    <main className="tp-root" style={{ background: C.cream, minHeight: '100vh', padding: '32px 24px 80px', fontFamily: SANS, color: C.ink }}>
      <style>{`
        .dash-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
        .dash-pane { position: sticky; top: 70px; max-height: calc(100vh - 90px); overflow-y: auto; }
        .dash-canvas { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: start; }
        .dash-s1 { grid-column: span 1; } .dash-s2 { grid-column: span 2; } .dash-s4 { grid-column: span 4; }
        @media (max-width: 1000px) { .dash-layout { grid-template-columns: 1fr; } .dash-pane { position: static; max-height: none; } }
        @media (max-width: 700px) { .dash-resize { display: none !important; } .dash-canvas { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dash-s2, .dash-s4 { grid-column: span 2; } }
        .tp-root b, .tp-root strong, .tp-root h1, .tp-root h2, .tp-root h3 { font-family: var(--font-outfit), system-ui, sans-serif; }
      `}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Link href="/admin/lab" style={{ fontFamily: SANS, fontSize: 11, color: C.orange, letterSpacing: '.16em', textDecoration: 'none' }}>⊕ LAB</Link>
        <h1 style={{ fontWeight: 800, fontSize: 'clamp(30px, 5vw, 46px)', letterSpacing: '-.02em', margin: '6px 0 8px', lineHeight: 1.05 }}>Dashboard</h1>
        <p style={{ fontSize: 15, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: 0 }}>
          Build your own view of the league with KPI cards, scatters, bars and tables; filter by league, division or starters vs bullpen; click any club to highlight it across every visual.
        </p>
        <ChartBuilder season={season} runs={runs} />
      </div>
    </main>
  )
}
