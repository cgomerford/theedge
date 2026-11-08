// src/app/api/mlb/pitch-shape/closest-mlb/route.ts
//
// "Closest MLB shape" for a minor-league pitch: the three major-league pitchers whose average pitch of this type is nearest on physical shape (speed, ride, run, arm angle).
// Physical shape only: nothing about results is read or returned (see src/lib/milb-shape/closest.ts). Same access rule as the other shape routes: four-seam and sweeper are
// free, every other pitch type is Pro and refused here, server-side. Reads pitch_shape_pitcher (MLB); never Savant.
//   ?type=FF&hand=R&velo=94&ivb=16&hb=9&slot=45[&season=2026]

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherDots } from '@/lib/pitch-shape/data'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand } from '@/lib/pitch-shape/model'
import { closestShapes } from '@/lib/milb-shape/closest'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? '', hand = sp.get('hand')
  const velo = Number(sp.get('velo')), ivb = Number(sp.get('ivb')), hb = Number(sp.get('hb')), slot = Number(sp.get('slot'))
  const season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!(type in PITCH_NAMES) || (hand !== 'R' && hand !== 'L') || ![velo, ivb, hb, slot, season].every(Number.isFinite) || velo < 40 || velo > 110 || season < 2020 || season > new Date().getFullYear() + 1) {
    return NextResponse.json({ error: 'Bad type, hand, velo, ivb, hb, slot or season' }, { status: 400 })
  }
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) {
    return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  }
  const { dots } = await getPitcherDots(type, hand as Hand, season, 'mlb')
  const closest = closestShapes({ velo, ivb, hb, slot }, dots.map(d => ({ pitcherId: d.pitcherId, name: d.name, teamAbbr: d.teamAbbr, nPitches: d.nPitches, velo: d.velo, ivb: d.ivb, hb: d.hb, slot: d.slot })), 3)
  return NextResponse.json({ closest, season })
}
