// src/app/api/mlb/pitch-shape/pitchers/route.ts
//
// Pitcher search for the Shape Sandbox. Free viewers only receive four-seam and sweeper shapes; the
// other pitch types are Pro and are filtered out here, server-side — the UI is not the gate.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { searchPitchers } from '@/lib/pitch-shape/data'
import { parseLevel, isMilb } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const q = sp.get('q') ?? ''
  const level = parseLevel(sp.get('level'))
  const season = isMilb(level) ? await resolveSeason(level, sp.get('season')) : undefined
  const pitchers = await searchPitchers(q, await isProViewer(), level, season)
  return NextResponse.json({ pitchers })
}
