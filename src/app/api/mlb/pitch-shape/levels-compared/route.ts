// src/app/api/mlb/pitch-shape/levels-compared/route.ts
//
// How one pitch type's shapes compare across MLB, Triple-A and the Florida State League: each level's average shape and spread, and the same pitchers at two levels
// (pitchers who threw 300+ of the pitch at both). Shape only, never one level's results applied to another. Same access rule as the other shape routes: four-seam and
// sweeper are free, every other pitch type is Pro and refused here, server-side. Reads pitch_shape_pitcher and pitch_shape_pitcher_milb; never Savant.
//   ?type=FF&hand=R

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getLevelsCompared } from '@/lib/milb-shape/compare-server'
import { FREE_SANDBOX_TYPES, PITCH_NAMES } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand')
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L')) return NextResponse.json({ error: 'Bad type or hand' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  return NextResponse.json(await getLevelsCompared(type, hand))
}
