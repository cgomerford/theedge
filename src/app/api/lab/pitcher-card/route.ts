// src/app/api/lab/pitcher-card/route.ts
//
// One call, full pitcher card payload: the player's own pitcher_stats row,
// percentiles for every percentile-eligible metric (computed from a SINGLE
// pool fetch, not one query per metric — see loop below), pitch arsenal,
// and the latest form signal if one's fired for this player.
//
// Percentile pool: pulled once for the whole season, filtered to
// innings_pitched >= 20, then ranked in memory per metric. Cheaper than
// hitting Supabase once per stat and keeps the honesty rule (small-sample
// pitchers get `null`, not a fabricated rank) in one place.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { PITCHER_PERCENTILE_METRICS } from '@/lib/player-stats'

type PercentileResult = { rank: number; poolSize: number; percentile: number }
type PoolRow = { player_id: number; innings_pitched: number; [k: string]: unknown }

const MIN_INNINGS = 20

function computePercentiles(pool: PoolRow[], playerId: number): Record<string, PercentileResult | null> {
  const out: Record<string, PercentileResult | null> = {}
  for (const [metric, { higherIsBetter }] of Object.entries(PITCHER_PERCENTILE_METRICS)) {
    const eligible = pool.filter(r => r[metric] !== null && r[metric] !== undefined)
    const sorted = [...eligible].sort((a, b) => {
      const av = Number(a[metric]), bv = Number(b[metric])
      return higherIsBetter ? bv - av : av - bv
    })
    const idx = sorted.findIndex(r => r.player_id === playerId)
    if (idx === -1 || sorted.length < 2) { out[metric] = null; continue }
    const rank = idx + 1
    out[metric] = {
      rank,
      poolSize: sorted.length,
      percentile: Math.round(((sorted.length - rank) / (sorted.length - 1)) * 100),
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const season = searchParams.get('season')

  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  const playerId = Number(id)
  const seasonNum = season ? Number(season) : new Date().getFullYear()

  try {
    const supa = createAdminClient()
    const poolCols = ['player_id', 'innings_pitched', ...Object.keys(PITCHER_PERCENTILE_METRICS)].join(',')

    const [statsRes, poolRes, arsenalRes, formRes] = await Promise.all([
      supa.from('pitcher_stats').select('*').eq('player_id', playerId).eq('season', seasonNum).maybeSingle(),
      supa.from('pitcher_stats').select(poolCols).eq('season', seasonNum).not('innings_pitched', 'is', null).gte('innings_pitched', MIN_INNINGS),
      supa.from('pitch_arsenals').select('*').eq('pitcher_id', playerId).order('usage_pct', { ascending: false }),
      supa.from('player_form_signals').select('*').eq('player_id', playerId).order('computed_date', { ascending: false }).limit(1).maybeSingle(),
    ])

    if (statsRes.error) throw new Error(statsRes.error.message)
    if (poolRes.error) throw new Error(poolRes.error.message)

    const stats = statsRes.data
    if (!stats) {
      return NextResponse.json({ error: 'No pitcher_stats row for this player/season' }, { status: 404 })
    }

    const pool = (poolRes.data ?? []) as unknown as PoolRow[]
    const percentiles = computePercentiles(pool, playerId)
    const arsenal = arsenalRes.error ? [] : (arsenalRes.data ?? [])
    const formSignal = formRes.error ? null : formRes.data

   return NextResponse.json({ stats, percentiles, arsenal, formSignal, teamId: stats.team_id ?? null })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load pitcher card', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}