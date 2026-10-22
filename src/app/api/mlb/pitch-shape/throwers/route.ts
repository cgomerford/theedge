// src/app/api/mlb/pitch-shape/throwers/route.ts
//
// "Who throws it here": pitchers who throw a pitch type into a chosen spot on the map (from the 60-pitch sample kept per pitcher).
// Free for the free sandbox types (four-seam, sweeper); every other type is Pro and refused here, server-side.
// Reads pitch_shape_pitcher; never Savant.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getThrowers } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? ''
  const hand = sp.get('hand')
  const hb = Number(sp.get('hb')), ivb = Number(sp.get('ivb')), radius = Number(sp.get('radius') ?? 1.5)
  const season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || ![hb, ivb, radius, season].every(Number.isFinite) || radius < 0.5 || radius > 4 || season < 2020 || season > new Date().getFullYear()) {
    return NextResponse.json({ error: 'Bad type, hand, hb, ivb, radius or season' }, { status: 400 })
  }
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) {
    return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  }
  const throwers = await getThrowers(type, hand as Hand, hb, ivb, radius, season)
  return NextResponse.json({ throwers })
}
