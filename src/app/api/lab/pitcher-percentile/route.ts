// src/app/api/lab/pitcher-percentile/route.ts
//
// Percentile rank for a pitcher_stats metric, computed against the real
// Supabase pool — NOT MLB's live "qualified leaders" endpoint, because TTO
// splits, contact-quality, and plate-discipline columns don't exist there.
//
// Sample-size honesty: pool is filtered to innings_pitched >= minInnings
// (default 20). If the requested player hasn't cleared that bar, we return
// `result: null` rather than a fabricated rank — same pattern as the
// existing MLB-API percentile route's "not enough playing time" note.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { PITCHER_PERCENTILE_METRICS } from '@/lib/player-stats'

type PercentileResult = { rank: number; poolSize: number; percentile: number }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric')
  const id = searchParams.get('id')
  const season = searchParams.get('season')
  const minInnings = searchParams.get('minInnings')

  if (!metric || !(metric in PITCHER_PERCENTILE_METRICS)) {
    return NextResponse.json(
      { error: `metric must be one of: ${Object.keys(PITCHER_PERCENTILE_METRICS).join(', ')}` },
      { status: 400 }
    )
  }
  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const seasonNum = season ? Number(season) : new Date().getFullYear()
  const playerId = Number(id)
  const ipFloor = minInnings ? Number(minInnings) : 20
  const { higherIsBetter } = PITCHER_PERCENTILE_METRICS[metric]

  try {
    const supa = createAdminClient()

    // Untyped client (no generated DB types yet — see admin-dashboard-cards.ts
    // for the full explanation). Route the result through `unknown` once,
    // here, rather than fighting GenericStringError at every call site.
    const { data, error } = await supa
      .from('pitcher_stats')
      .select(`player_id, ${metric}, innings_pitched`)
      .eq('season', seasonNum)
      .not(metric, 'is', null)
      .not('innings_pitched', 'is', null)
      .gte('innings_pitched', ipFloor)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as { player_id: number; innings_pitched: number; [k: string]: unknown }[]

    if (rows.length === 0) {
      return NextResponse.json({ result: null })
    }

    const sorted = [...rows].sort((a, b) => {
      const av = Number(a[metric])
      const bv = Number(b[metric])
      return higherIsBetter ? bv - av : av - bv // best first
    })

    const idx = sorted.findIndex(r => r.player_id === playerId)
    if (idx === -1) {
      // Player exists but didn't clear the innings floor — honest null,
      // not a fabricated low percentile.
      return NextResponse.json({ result: null })
    }

    const rank = idx + 1
    const percentile = Math.round(((sorted.length - rank) / Math.max(sorted.length - 1, 1)) * 100)
    const result: PercentileResult = { rank, poolSize: sorted.length, percentile }

    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to compute percentile', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}