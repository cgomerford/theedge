// src/app/api/mlb/pitch-shape/pitcher-dots/route.ts
//
// The dots on the redesigned Pitch Shape Lab map: every pitcher with 300+ of one pitch type, at his average movement, with his own whiff counts and diagnostics.
//   ?type=FF&hand=R&season=2026                  all the pitchers
//   ?type=FF&hand=R&season=2026&pitcher=<id>     that one pitcher's sampled pitches ([hb, ivb] pairs, up to 60)
// Same access rule as the other shape routes: four-seam and sweeper are free; every other pitch type is Pro and is refused here, server-side. Reads
// pitch_shape_pitcher; never Savant.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherDots, getPitcherPoints } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand')
  const season = Number(sp.get('season') ?? new Date().getFullYear())
  const pitcher = sp.get('pitcher')
  const pid = pitcher == null ? null : Number(pitcher)
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || !Number.isFinite(season) || season < 2020 || season > new Date().getFullYear() + 1 || (pid != null && !Number.isInteger(pid))) {
    return NextResponse.json({ error: 'Bad type, hand, season or pitcher' }, { status: 400 })
  }
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) {
    return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  }
  if (pid != null) return NextResponse.json({ points: await getPitcherPoints(type, hand as Hand, season, pid) })
  return NextResponse.json(await getPitcherDots(type, hand as Hand, season))
}
