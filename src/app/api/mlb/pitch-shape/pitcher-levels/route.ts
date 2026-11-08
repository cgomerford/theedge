// src/app/api/mlb/pitch-shape/pitcher-levels/route.ts
//
// One pitcher's pitches at every level he has thrown at (MLB, Triple-A, Florida State League): per level, every pitch type with his average shape, usage, results at
// that level and the location and contact figures behind them. Pitchers keep their MLB player id across promotions, so this is one arm at several levels. A viewer who
// is not Pro only receives the free pitch types (four-seam and sweeper); the rest are counted and never sent. Reads pitch_shape_pitcher and pitch_shape_pitcher_milb.
//   ?id=<MLBAM id>

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherRepertoire } from '@/lib/pitch-shape/data'
import { latestMilbSeason } from '@/lib/milb-shape/server'
import { LEVELS } from '@/lib/milb-shape/levels'

export async function GET(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  const pro = await isProViewer()
  const levels = await Promise.all(LEVELS.map(async level => {
    const season = level === 'mlb' ? new Date().getFullYear() : await latestMilbSeason(level)
    const rep = season == null ? null : await getPitcherRepertoire(id, season, pro, level)
    return { level, season, repertoire: rep }
  }))
  return NextResponse.json({ levels: levels.filter(l => l.repertoire && l.repertoire.rows.length + l.repertoire.lockedTypes > 0) })
}
