// src/app/api/mlb/pitch-shape/board/route.ts
//
// The Shape Score board for one pitch type and hand: each pitcher's shape, what league pitches shaped like his have produced, and his own results.
// Triple-A and the Florida State League have their own board (level-only: shape, results and Shape Score are worked out from that level's pitches; ESPN ownership, the MLB season line and roster role are null).
// Same gate as the results map: free for four-seam and sweeper, Pro for every other type.
import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getMilbBoard, getShapeBoard } from '@/lib/pitch-shape/results'
import { isMilb, parseLevel } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand')
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L')) return NextResponse.json({ error: 'Bad type or hand' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const level = parseLevel(sp.get('level'))
  if (!isMilb(level)) return NextResponse.json({ board: await getShapeBoard(type, hand as Hand) })
  return NextResponse.json({ board: await getMilbBoard(level, await resolveSeason(level, sp.get('season')), type, hand as Hand) })
}
