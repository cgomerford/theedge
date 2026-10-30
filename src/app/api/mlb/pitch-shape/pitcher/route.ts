// src/app/api/mlb/pitch-shape/pitcher/route.ts
//
// One pitcher's whole repertoire for the Pitch Shape Lab's pitcher tab: every pitch type he threw that season with his own results and diagnostics.
//   ?id=<pitcher id>&season=2026
// Also returns his season workload (innings, batters faced, strikeouts, ERA) from the MLB Stats API, or null. A viewer who is not Pro only receives the free pitch types (four-seam and sweeper); the rest are never sent, only counted (lockedTypes). Reads pitch_shape_pitcher.
import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { getPitcherRepertoire } from '@/lib/pitch-shape/data'
import { getWorkload } from '@/lib/pitch-shape/workload'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get('id')), season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(season) || season < 2020 || season > new Date().getFullYear() + 1) {
    return NextResponse.json({ error: 'Bad id or season' }, { status: 400 })
  }
  const [rep, workload] = await Promise.all([getPitcherRepertoire(id, season, await isProViewer()), getWorkload(id, season)])
  return NextResponse.json({ repertoire: rep, workload })
}
