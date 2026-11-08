// src/app/api/mlb/pitch-shape/milb-vs-shape/route.ts
//
// A Triple-A or Florida State League pitcher's own results on one pitch against what pitches shaped like it have produced at the SAME level and season, and where that shape
// ranks among the level's shapes. Level-only: no major-league result is read. Same access rule as the other shape routes: four-seam and sweeper are free, every other pitch
// type is Pro and refused here, server-side. Reads pitch_shape_results_milb, pitch_shape_results_pitcher_milb and pitch_shape_pitcher_milb.
//   ?level=aaa|fsl&type=FF&hand=R&pitcher=<id>[&season=2026]

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getMilbVsShape } from '@/lib/pitch-shape/results'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'
import { isMilb, parseLevel } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const level = parseLevel(sp.get('level'))
  const type = sp.get('type') ?? '', hand = sp.get('hand'), pid = Number(sp.get('pitcher'))
  if (!isMilb(level) || !(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || !Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: 'Bad level, type, hand or pitcher' }, { status: 400 })
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  return NextResponse.json({ result: await getMilbVsShape(level, await resolveSeason(level, sp.get('season')), type, hand as Hand, pid) })
}
