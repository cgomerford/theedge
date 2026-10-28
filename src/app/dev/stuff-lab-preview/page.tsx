// src/app/dev/stuff-lab-preview/page.tsx
//
// Dev-only preview of the x9Stuff Lab with INVENTED data (mock.ts), so the layout can be reviewed before the real grades are loaded.
// 404s in production. Not linked from anywhere. The real page is /mlb/lab/stuff and reads stored rows only.

import { notFound } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import StuffLab from '@/components/stuff-lab/StuffLab'
import { MOCK_BOARD, MOCK_DETAILS } from './mock'

export const dynamic = 'force-dynamic'

export default async function StuffLabPreview({ searchParams }: { searchParams: Promise<{ pitcher?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { pitcher } = await searchParams
  const id = MOCK_DETAILS[pitcher ?? ''] ? Number(pitcher) : 900002
  const selected = MOCK_BOARD.pitchers.find(p => p.id === id) ?? null
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 24px 100px' }}>
        <h1 style={{ margin: '4px 0 14px', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, letterSpacing: '-0.02em' }}>x9Stuff Lab (preview)</h1>
        <StuffLab board={MOCK_BOARD} selected={selected} detail={selected ? MOCK_DETAILS[String(id)] : null} season={2026} preview />
      </div>
    </main>
  )
}
