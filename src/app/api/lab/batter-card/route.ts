// src/app/api/lab/batter-card/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getBatterYearStats, getMetricPercentile, getCurrentTeamId, LEADER_METRICS, type YearMode } from '@/lib/lab'
import { getBatterStatcast } from '@/lib/batter-stats'
import { BATTER_STAT_GROUPS } from '@/lib/player-stats'

const PERCENTILE_KEYS = BATTER_STAT_GROUPS
  .flatMap(g => g.stats)
  .filter(s => s.percentileEligible && s.key in LEADER_METRICS)
  .map(s => s.key as keyof typeof LEADER_METRICS)

function formatStatcastRows(sc: Awaited<ReturnType<typeof getBatterStatcast>>) {
  if (!sc) return []
  const rows: { key: string; label: string; value: string }[] = []
  const push = (key: string, label: string, val: number | null, fmt: (v: number) => string) => {
    if (val !== null) rows.push({ key, label, value: fmt(val) })
  }
  push('xba', 'xBA', sc.xba, v => v.toFixed(3))
  push('xslg', 'xSLG', sc.xslg, v => v.toFixed(3))
  push('xwoba', 'xwOBA', sc.xwoba, v => v.toFixed(3))
  push('avg_exit_velocity', 'Avg EV', sc.avg_exit_velocity, v => `${v.toFixed(1)} mph`)
  push('max_exit_velocity', 'Max EV', sc.max_exit_velocity, v => `${v.toFixed(1)} mph`)
  push('hard_hit_pct', 'Hard-hit%', sc.hard_hit_pct, v => `${v.toFixed(1)}%`)
  push('barrel_pct', 'Barrel%', sc.barrel_pct, v => `${v.toFixed(1)}%`)
  push('sweet_spot_pct', 'Sweet spot%', sc.sweet_spot_pct, v => `${v.toFixed(1)}%`)
  push('sprint_speed', 'Sprint speed', sc.sprint_speed, v => `${v.toFixed(1)} ft/s`)
  push('k_pct', 'K% (Statcast)', sc.k_pct, v => `${v.toFixed(1)}%`)
  push('bb_pct', 'BB% (Statcast)', sc.bb_pct, v => `${v.toFixed(1)}%`)
  return rows
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const mode = (searchParams.get('mode') as YearMode) || 'single'
  const yearsParam = searchParams.get('years')
  const years = yearsParam ? yearsParam.split(',').map(Number).filter(n => !Number.isNaN(n)) : [new Date().getFullYear()]

  if (!id || Number.isNaN(Number(id))) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  const playerId = Number(id)

  try {
    const supa = createAdminClient()
    const [seasonRows, statcastRows, percentiles, formRes, teamId] = await Promise.all([
  getBatterYearStats(playerId, mode, years),
  mode === 'single' ? getBatterStatcast(playerId).then(formatStatcastRows) : Promise.resolve([]),
  mode === 'single'
    ? Promise.all(PERCENTILE_KEYS.map(async key => [key, await getMetricPercentile(key, years[0], playerId)] as const)).then(Object.fromEntries)
    : Promise.resolve({}),
  supa.from('player_form_signals').select('*').eq('player_id', playerId).order('computed_date', { ascending: false }).limit(1).maybeSingle(),
  getCurrentTeamId(playerId),
])

return NextResponse.json({
  season: [...seasonRows, ...statcastRows],
  percentiles,
  percentilesAvailable: mode === 'single',
  statcastAvailable: mode === 'single',
  formSignal: formRes.error ? null : formRes.data,
  teamId,
})
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to load batter card', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}