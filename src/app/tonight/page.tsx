// src/app/tonight/page.tsx
//
// "/tonight" is now a smart redirect to the in-season sport hub.
// (It used to render the MLB slate; that lives at /mlb now.)
// This powers the "Today" tab — always lands on whatever's being played.

import { redirect } from 'next/navigation'
import { getActiveSport, SPORT_HUB_PATH } from '@/lib/active-sport'

// Must re-evaluate per request — the season changes underneath us.
export const dynamic = 'force-dynamic'

export default function TonightRedirect() {
  const { primary } = getActiveSport()
  redirect(SPORT_HUB_PATH[primary])
}