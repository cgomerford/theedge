// src/app/dev/scorecard/[gamePk]/page.tsx
//
// Dev-only preview of the hand-scored postgame scorecard for any final game
// (/dev/scorecard/824225). 404s in production. Not linked from anywhere.

import { notFound } from 'next/navigation'
import { getScorecard } from '@/lib/postgame/scorecard'
import ScorecardPair from '@/components/postgame/ScorecardSheet'

export const dynamic = 'force-dynamic'

export default async function ScorecardPreview({ params }: { params: Promise<{ gamePk: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { gamePk } = await params
  const pk = Number(gamePk)
  if (!Number.isInteger(pk)) notFound()
  const sc = await getScorecard(pk)
  if (!sc) return <p style={{ padding: 40 }}>No scorecard available for game {pk} (not final, or the feed failed).</p>
  return <main style={{ background: '#e9e5da', padding: '28px 16px 60px', minHeight: '100vh', overflowX: 'auto' }}><ScorecardPair sc={sc} /></main>
}
