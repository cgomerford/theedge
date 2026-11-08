// src/app/api/mlb/pitch-shape/bins/route.ts
//
// League shape bins for one pitch type + hand, for the Shape Sandbox sliders. The free tier covers
// four-seam and sweeper; every other pitch type is Pro and is refused server-side here — the UI lock
// is not the gate.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getLeagueBins } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'
import { parseLevel, isMilb } from '@/lib/milb-shape/levels'
import { getCapabilities, resolveSeason } from '@/lib/milb-shape/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? ''
  const hand = searchParams.get('hand')
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L')) {
    return NextResponse.json({ error: 'Bad type or hand' }, { status: 400 })
  }
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) {
    return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  }
  // level and season: MLB (the default, unchanged) or a minor-league level. A minor-league cohort whose pitches carry no arm angle is read on three axes, and says so.
  const level = parseLevel(searchParams.get('level'))
  if (!isMilb(level)) return NextResponse.json({ bins: await getLeagueBins(type, hand as Hand) })
  const season = await resolveSeason(level, searchParams.get('season'))
  const caps = await getCapabilities(level, season)
  const armAngle = caps.types[type]?.armAngle ?? caps.axes.armAngle
  const bins = await getLeagueBins(type, hand as Hand, level, season, { arm: armAngle })
  return NextResponse.json({ bins, level, season, axes: { ...caps.axes, armAngle } })
}
