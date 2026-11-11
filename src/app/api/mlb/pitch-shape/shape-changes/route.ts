// src/app/api/mlb/pitch-shape/shape-changes/route.ts
//
// What changed in the shape: pitches that moved during the season, pitches added or dropped, fastball gaps that opened or closed, and pitches that exist at one level and not another.
//   ?season=<year>               league-wide (default this year): the biggest in-season moves, every pitch added or dropped, the fastball gaps, and the cross-level drops
//   ?season=<year>&pitcher=<id>  one pitcher: every pitch's change, his added and dropped pitches, his fastball gaps
// Reads precomputed tables only (pitch_shape_monthly, pitch_shape_pitcher, pitch_shape_pitcher_milb); nothing is fetched from Savant. A viewer who is not Pro only receives the free pitch types
// (four-seam and sweeper); the rest are left out of the answer, not hidden in the page. Read only.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getLevelDrops, getPitcherChanges, getSeasonChanges } from '@/lib/pitch-shape/changes-server'
import { FREE_SANDBOX_TYPES } from '@/lib/pitch-shape/model'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const year = new Date().getFullYear()
  const season = Number(sp.get('season') ?? year)
  if (!Number.isInteger(season) || season < 2020 || season > year) return NextResponse.json({ error: 'Bad season' }, { status: 400 })
  const pro = await isProViewer()
  const ok = (t: string) => pro || (FREE_SANDBOX_TYPES as readonly string[]).includes(t)

  const pitcherParam = sp.get('pitcher')
  if (pitcherParam != null) {
    const id = Number(pitcherParam)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad pitcher' }, { status: 400 })
    const c = await getPitcherChanges(id, season)
    if (!c) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
    return NextResponse.json({
      season: c.season,
      changes: c.changes.filter(x => ok(x.pitchType)), usage: c.usage.filter(x => ok(x.pitchType)), separation: c.separation.filter(x => ok(x.pitchType)),
      lockedTypes: pro ? 0 : new Set([...c.changes, ...c.usage, ...c.separation].map(x => x.pitchType).filter(t => !ok(t))).size,
    })
  }

  const [changes, levels] = await Promise.all([getSeasonChanges(season), getLevelDrops(season)])
  if (!changes) return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  return NextResponse.json({
    season,
    changes: changes.changes.filter(x => ok(x.pitchType)).slice(0, 60),
    usage: changes.usage.filter(x => ok(x.pitchType)).slice(0, 60),
    separation: changes.separation.filter(x => ok(x.pitchType)).slice(0, 40),
    levels: levels ? levels.drops.filter(x => ok(x.pitchType)).slice(0, 80) : [],
    pro,
  })
}
