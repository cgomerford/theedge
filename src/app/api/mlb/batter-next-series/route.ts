// src/app/api/mlb/batter-next-series/route.ts
//
// The H2H tab's schedule-driven data source: this batter's real next
// series (real MLB schedule), real H2H record (getBatterVsPitcher) against
// every real confirmed starter in that series, real H2H against every
// other real pitcher on the opponent's active roster ("bullpen arms" —
// see batter-next-series.ts for why no SP/RP role label is attached), a
// "faced most" flag. (The per-opponent-team record has its own
// season/career route: /api/mlb/batter-team-record.)

import { NextRequest, NextResponse } from 'next/server'
import { getNextSeries, getBullpenArms } from '@/lib/batter-next-series'
import { getBatterVsPitcher, type BatterVsPitcher } from '@/lib/batter-stats'
import { requirePro } from '@/lib/require-pro'

export const dynamic = 'force-dynamic'

type PitcherVs = { id: number; name: string; vs: BatterVsPitcher | null }

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  if (!batterId) return NextResponse.json({ error: 'batterId required' }, { status: 400 })

  const series = await getNextSeries(batterId)

  if (!series) {
    return NextResponse.json({ series: null, starters: [], bullpen: [], mostFaced: null })
  }

  const starterIds = [...new Set(series.games.map(g => g.probablePitcherId).filter((id): id is number => id != null))]
  const starterNameById = new Map(series.games.filter(g => g.probablePitcherId != null).map(g => [g.probablePitcherId as number, g.probablePitcherName as string]))

  const [starterVsList, bullpenArms] = await Promise.all([
    Promise.all(starterIds.map(async id => ({ id, name: starterNameById.get(id) ?? `#${id}`, vs: await getBatterVsPitcher(batterId, id) }))),
    getBullpenArms(series.opponentTeamId, starterIds),
  ])

  const bullpenVsList: PitcherVs[] = (await Promise.all(
    bullpenArms.map(async arm => ({ id: arm.id, name: arm.name, vs: await getBatterVsPitcher(batterId, arm.id) })),
  )).filter(p => p.vs && p.vs.ab > 0)
  bullpenVsList.sort((a, b) => (b.vs?.ab ?? 0) - (a.vs?.ab ?? 0))

  const everyone: PitcherVs[] = [...starterVsList, ...bullpenVsList]
  let mostFaced: { id: number; name: string; ab: number } | null = null
  for (const p of everyone) {
    if (p.vs && p.vs.ab > 0 && (mostFaced === null || p.vs.ab > mostFaced.ab)) {
      mostFaced = { id: p.id, name: p.name, ab: p.vs.ab }
    }
  }

  return NextResponse.json({
    series,
    starters: starterVsList,
    bullpen: bullpenVsList,
    mostFaced,
  })
}
