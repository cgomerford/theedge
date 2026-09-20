// src/app/api/mlb/pitch-splits/route.ts
//
// Real, player- and team-specific count/situation/inning/pitch-type splits
// ("Bryce Harper with 2 strikes off sliders, RISP, 2 outs, innings 7-9")
// for /mlb/stats' player mode. Fetches the real season pitch log (cached
// by Next's fetch layer per player/team+season, so switching filters for
// the same player/team doesn't re-hit Savant) and computes the requested
// slice from the real rows — see src/lib/pitch-splits.ts.
//
// mode=player (default): playerId required, returns { value, sampleSize }.
// mode=team: playerId (resolved to their real current team) OR teamAbbr
//   directly; returns { team: {value,sampleSize}, players: [...] } — every
//   qualifying real batter on that roster broken down individually, plus
//   the real team total.

import { NextRequest, NextResponse } from 'next/server'
import {
  getBatterPitchLog, getTeamPitchLog, getPlayerTeamAbbrev,
  computeSplitStat, computeTeamSplitBreakdown,
  type SplitStatKey, type CountSituationKey, type SituationKey, type InningKey, type PitchTypeCode, type RbiKey, type SplitFilters,
} from '@/lib/pitch-splits'

export const revalidate = 3600

function parseFilters(searchParams: URLSearchParams): SplitFilters {
  const pitchTypeParam = searchParams.get('pitchType')
  return {
    count: (searchParams.get('count') ?? 'any') as CountSituationKey,
    situation: (searchParams.get('situation') ?? 'any') as SituationKey,
    inning: (searchParams.get('inning') ?? 'any') as InningKey,
    pitchType: (pitchTypeParam && pitchTypeParam !== 'any' ? pitchTypeParam : 'any') as PitchTypeCode | 'any',
    rbi: (searchParams.get('rbi') ?? 'any') as RbiKey,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') === 'team' ? 'team' : 'player'
  const playerId = Number(searchParams.get('playerId'))
  const stat = (searchParams.get('stat') ?? 'hits') as SplitStatKey
  const filters = parseFilters(searchParams)

  if (mode === 'team') {
    let teamAbbr = searchParams.get('teamAbbr')
    let teamName: string | null = null
    if (!teamAbbr && playerId) {
      const resolved = await getPlayerTeamAbbrev(playerId)
      if (resolved) { teamAbbr = resolved.abbrev; teamName = resolved.name }
    }
    if (!teamAbbr) {
      return NextResponse.json({ error: 'Missing teamAbbr (or a playerId to resolve one)' }, { status: 400 })
    }
    const rows = await getTeamPitchLog(teamAbbr)
    if (rows.length === 0) {
      return NextResponse.json({ team: { value: 0, sampleSize: 0 }, players: [], teamAbbr, teamName, noData: true })
    }
    const breakdown = computeTeamSplitBreakdown(rows, stat, filters)
    return NextResponse.json({ ...breakdown, teamAbbr, teamName })
  }

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  }
  const rows = await getBatterPitchLog(playerId)
  if (rows.length === 0) {
    return NextResponse.json({ value: 0, sampleSize: 0, noData: true })
  }
  const result = computeSplitStat(rows, stat, filters)
  return NextResponse.json(result)
}
