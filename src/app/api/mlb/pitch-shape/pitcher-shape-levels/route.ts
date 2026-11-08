// src/app/api/mlb/pitch-shape/pitcher-shape-levels/route.ts
//
// One pitcher's shape at every level he has thrown at, for the "his shape in MLB against the minors" view: for each level and pitch type, his average velocity, ride, run and arm angle,
// the spread of his own pitches, the pitch count and a 60-pitch sample of movement points. Pitchers keep their MLB player id across levels. A viewer who is not Pro only receives the free
// pitch types (four-seam and sweeper); the rest are counted and never sent. Reads pitch_shape_pitcher and pitch_shape_pitcher_milb.
//   ?id=<MLBAM id>

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherPoints, getPitcherRepertoire } from '@/lib/pitch-shape/data'
import { latestMilbSeason } from '@/lib/milb-shape/server'
import { LEVELS } from '@/lib/milb-shape/levels'
import type { Hand } from '@/lib/pitch-shape/model'

export async function GET(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  const pro = await isProViewer()
  const levels = await Promise.all(LEVELS.map(async level => {
    const season = level === 'mlb' ? new Date().getFullYear() : await latestMilbSeason(level)
    const rep = season == null ? null : await getPitcherRepertoire(id, season, pro, level)
    if (!rep || rep.rows.length === 0) return null
    const types = await Promise.all(rep.rows.map(async r => ({
      pitchType: r.pitchType, n: r.nPitches, velo: r.velo, ivb: r.ivb, hb: r.hb, slot: r.slot, sdHb: r.diag.sdHb, sdIvb: r.diag.sdIvb,
      points: await getPitcherPoints(r.pitchType, rep.hand as Hand, season as number, id, level),
    })))
    return { level, season, name: rep.name, hand: rep.hand, types }
  }))
  return NextResponse.json({ levels: levels.filter(Boolean) })
}
