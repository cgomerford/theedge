// src/app/api/mlb/pitch-shape/cells/route.ts
//
// League pitches at 0.1 in resolution, for the movement maps. Two uses:
//   - a pitcher's Shape tab: centred on his average movement (hb, ivb given), Pro
//   - the Pitch Shape Lab page: centred on the league's own average (center=league), free for the free pitch types
//     (four-seam and sweeper) and Pro for every other type. Locked types are refused here: the UI lock is not the gate.
// Reads pitch_shape_cells; never Savant.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { allowDeepLookFor } from '@/lib/gate'
import { getMovementCells } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? ''
  const hand = sp.get('hand')
  const league = sp.get('center') === 'league'
  const half = Number(sp.get('half') ?? 8)
  const hb = league ? null : Number(sp.get('hb'))
  const ivb = league ? null : Number(sp.get('ivb'))
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || !Number.isFinite(half) || half < 3 || half > 15 || (!league && (!Number.isFinite(hb) || !Number.isFinite(ivb)))) {
    return NextResponse.json({ error: 'Bad type, hand, center, hb, ivb or half' }, { status: 400 })
  }
  // A pitcher's own tab is always Pro; the league-wide map is free only for the free sandbox types.
  const free = league && (FREE_SANDBOX_TYPES as readonly string[]).includes(type)
  if (!free && !(await isProViewer()) && !(await allowDeepLookFor('pitch_shape', type))) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const payload = await getMovementCells(type, hand as Hand, hb, ivb, half)
  return NextResponse.json({ payload })
}
