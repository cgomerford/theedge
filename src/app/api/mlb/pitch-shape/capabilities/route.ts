// src/app/api/mlb/pitch-shape/capabilities/route.ts
//
// What a level and season can show in the Pitch Shape Lab: coverage (full, partial, none), the date range loaded, which sandbox axes exist (speed, ride, run, arm angle),
// which outcomes exist and how many pitches. Public: it is coverage metadata with no pitch values, so nothing here is Pro data. An unloaded level answers coverage 'none'.
//   ?level=mlb|aaa|fsl  &season=2026   (a minor-league season defaults to the newest one loaded)

import { NextRequest, NextResponse } from 'next/server'
import { parseLevel } from '@/lib/milb-shape/levels'
import { getCapabilities, resolveSeason } from '@/lib/milb-shape/server'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const level = parseLevel(sp.get('level'))
  const season = await resolveSeason(level, sp.get('season'))
  return NextResponse.json({ capabilities: await getCapabilities(level, season) })
}
