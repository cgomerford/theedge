// src/app/api/mlb/pitching-lab/route.ts
//
// v1 of the standalone Pitching Lab — search any real pitcher, get the
// exact same real data the per-game Pitching Lab tab uses (arsenal, pitch
// movement, count tendency, sequencing, hot zones, zone arsenal), just not
// tied to tonight's schedule. Reuses the SAME real fetchers already proven
// in PitchingSlotAsync.tsx / ScoutSlotAsync.tsx — no new data source.

import { NextRequest, NextResponse } from 'next/server'
import { getPitcherStatsFull, getPitchMovementFromDB } from '@/lib/pitcher-full-stats'
import { getPitcherCountTendency, getPitcherSequencing } from '@/lib/pitcher-sequencing'
import { getPitcherHotZones } from '@/lib/hot-zones'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { MLB_TEAMS } from '@/lib/teams'
import { isProViewer } from '@/lib/require-pro'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export const revalidate = 1800

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pitcherId = Number(searchParams.get('pitcherId'))
  if (!pitcherId) {
    return NextResponse.json({ error: 'Missing pitcherId' }, { status: 400 })
  }

  const seasonYear = new Date().getFullYear()

  // Overview fields (name, team, season line) are free. Movement, tendencies, sequencing, hot zones and the zone arsenal are
  // Pro-only and are neither fetched nor returned for anyone else: this check is the gate, the UI lock is not.
  const isPro = await isProViewer()
  const [personRes, fullStats, movementRows, countTendency, sequencing, hotZones, arsenal] = await Promise.all([
    fetch(`${MLB_API}/people/${pitcherId}?hydrate=currentTeam`, { next: { revalidate: 3600 } }),
    getPitcherStatsFull(pitcherId),
    isPro ? getPitchMovementFromDB(pitcherId, seasonYear) : Promise.resolve([]),
    isPro ? getPitcherCountTendency(pitcherId) : Promise.resolve({}),
    isPro ? getPitcherSequencing(pitcherId) : Promise.resolve({}),
    isPro ? getPitcherHotZones(pitcherId) : Promise.resolve({}),
    isPro ? getPitcherZoneArsenal(pitcherId) : Promise.resolve({}),
  ])

  let name = 'Pitcher'
  let abbr = 'MLB'
  let color = '#1A1A1A'
  if (personRes.ok) {
    const data = await personRes.json()
    const person = data.people?.[0]
    name = person?.fullName ?? name
    const teamId = person?.currentTeam?.id
    const team = MLB_TEAMS.find(t => t.id === teamId)
    if (team) { abbr = team.abbrev; color = team.primary_color }
  }

  return NextResponse.json({
    isPro,
    id: pitcherId,
    name,
    abbr,
    color,
    fullStats,
    movementRows,
    countTendency,
    sequencing,
    hotZones,
    arsenal,
  })
}
