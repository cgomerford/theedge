// src/app/api/lab/team-card/route.ts
//
// Standalone team stats, only hit when the user explicitly picks a team —
// never bundled into a batter card by default. Percentile computed against
// all 30 teams for the season (cheap — small pool, one query).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { TEAM_CONTEXT_GROUPS } from '@/lib/player-stats'

type PercentileResult = { rank: number; poolSize: number; percentile: number }
type Row = { team_id: number; [k: string]: unknown }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  const season = searchParams.get('season')

  if (!teamId || Number.isNaN(Number(teamId))) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }
  const id = Number(teamId)
  const seasonNum = season ? Number(season) : new Date().getFullYear()

  try {
    const supa = createAdminClient()
    const { data, error } = await supa.from('team_stats').select('*').eq('season', seasonNum)
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as Row[]
    const team = rows.find(r => r.team_id === id)
    if (!team) return NextResponse.json({ error: 'No team_stats row for this team/season' }, { status: 404 })

    const percentiles: Record<string, PercentileResult | null> = {}
    for (const stat of TEAM_CONTEXT_GROUPS.flatMap(g => g.stats)) {
      const eligible = rows.filter(r => typeof r[stat.key] === 'number')
      const sorted = [...eligible].sort((a, b) => {
        const av = Number(a[stat.key]), bv = Number(b[stat.key])
        return stat.higherIsBetter ? bv - av : av - bv
      })
      const idx = sorted.findIndex(r => r.team_id === id)
      percentiles[stat.key] = idx === -1 || sorted.length < 2 ? null : {
        rank: idx + 1,
        poolSize: sorted.length,
        percentile: Math.round(((sorted.length - (idx + 1)) / (sorted.length - 1)) * 100),
      }
    }

    return NextResponse.json({ team, percentiles })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load team card', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}