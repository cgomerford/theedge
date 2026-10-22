// src/app/dev/platoon-mockup/page.tsx
//
// Platoon Lab mockup (demo data only). A dev route: 404 in production, like the other /dev preview pages. Not indexed. The real routes will be
// /mlb/lab/batting-lab/[playerId]/platoon (a Batting Lab tab) and /mlb/lab/platoon (the league view), both behind the sign-up gate.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PlatoonMockup from '@/components/platoon-lab/PlatoonMockup'

export const metadata: Metadata = { title: 'Platoon Lab (mockup)', robots: { index: false, follow: false } }

// ?h=A|B|C|D (hitter), ?side=L|R (a switch hitter's batting side): open the mockup straight into a state, for review
export default async function PlatoonMockupPage({ searchParams }: { searchParams: Promise<{ h?: string; side?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const q = await searchParams
  const hid = ['A', 'B', 'C', 'D'].includes(q.h ?? '') ? (q.h as 'A' | 'B' | 'C' | 'D') : undefined
  return <PlatoonMockup initial={{ hid, side: q.side === 'R' ? 'R' : q.side === 'L' ? 'L' : undefined }} />
}
