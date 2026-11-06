// src/app/api/mlb/pitch-shape/results/route.ts
//
// League outcomes at 0.1 in on the movement map (pitch_shape_results), for the Pitch Shape Lab's results heat map. Free for the free pitch types
// (four-seam and sweeper), Pro for every other type: the UI lock is not the gate, it is refused here.
import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getResultsPayload } from '@/lib/pitch-shape/results'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand'), half = Number(sp.get('half') ?? 12)
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || !Number.isFinite(half) || half < 3 || half > 15) return NextResponse.json({ error: 'Bad type, hand or half' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  return NextResponse.json({ payload: await getResultsPayload(type, hand as Hand, half) })
}
