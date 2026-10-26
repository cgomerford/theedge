// src/app/api/mlb/pitch-shape/location/route.ts
//
// Where league pitches near a spot on the movement map cross the plate (the location panel beside the map). Same
// access rule as the movement-cell API: a pitcher's own Shape tab is Pro; the league-wide map on the lab page is free for
// the free sandbox types (four-seam, sweeper) and Pro for every other type (scope=league). Reads pitch_shape_locations;
// never Savant.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getLocationWindow } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? ''
  const hand = sp.get('hand')
  const hb = Number(sp.get('hb')), ivb = Number(sp.get('ivb')), radius = Number(sp.get('radius') ?? 1)
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || !Number.isFinite(hb) || !Number.isFinite(ivb) || !(radius >= 0.5 && radius <= 2)) {
    return NextResponse.json({ error: 'Bad type, hand, hb, ivb or radius' }, { status: 400 })
  }
  const free = sp.get('scope') === 'league' && (FREE_SANDBOX_TYPES as readonly string[]).includes(type)
  if (!free && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const payload = await getLocationWindow(type, hand as Hand, hb, ivb, radius)
  return NextResponse.json({ payload })
}
