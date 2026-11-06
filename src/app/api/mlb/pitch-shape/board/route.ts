// src/app/api/mlb/pitch-shape/board/route.ts
//
// The Shape Score board for one pitch type and hand: each pitcher's shape, what league pitches shaped like his have produced, and his own results.
// Same gate as the results map: free for four-seam and sweeper, Pro for every other type.
import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getShapeBoard } from '@/lib/pitch-shape/results'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand')
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L')) return NextResponse.json({ error: 'Bad type or hand' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  return NextResponse.json({ board: await getShapeBoard(type, hand as Hand) })
}
