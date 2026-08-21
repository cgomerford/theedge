// src/lib/postgame-trend.ts
//
// "Trends vs Season" — compares THIS outing's velocity/usage against the
// season baseline. NOT a multi-game trend line (no per-game historical
// table exists yet for velo/break — see pitch_velocity_range, which is
// one row per season, not per game — that gap is tracked separately for
// the Leaders Hub game-on-game work). This is a single before/after
// comparison: season baseline vs tonight, which is exactly what the
// wireframe's "Trends vs Season" box asks for.

import { createAdminClient } from '@/lib/supabase'
import type { PitcherSequenceSummary } from '@/lib/postgame-pitch-sequence'

type SeasonVeloRow = {
  pitch_type: string
  pitch_name: string
  velo_min: number
  velo_max: number
  velo_avg: number
}

type SeasonArsenalRow = {
  pitch_type: string
  pitch_name: string
  percentage: number
}

export type PitchTrendFlag = {
  pitchType: string
  pitchName: string
  kind: 'velo' | 'usage'
  detail: string          // e.g. "+2.3 mph above season avg"
  standout: boolean        // true if this crosses a "worth flagging" threshold
}

export type SeasonTrendResult = {
  pitcherId: number
  flags: PitchTrendFlag[]
  standoutFlags: PitchTrendFlag[]   // subset where standout === true
  gameBreakByPitch: Record<string, { breakVerticalInduced: number | null; breakHorizontal: number | null; spinRate: number | null }>
}

// Thresholds for "worth flagging" — matches the wireframe's own example
// ("Fastball usage up +5 points"). Velo threshold set slightly above
// normal start-to-start noise (~1-1.5mph) so this doesn't fire on
// nothing-days.
const VELO_STANDOUT_MPH = 1.5
const USAGE_STANDOUT_PCT = 5.0

export async function getPitcherSeasonTrend(
  season: number,
  pitcherId: number,
  gameSummary: PitcherSequenceSummary,
): Promise<SeasonTrendResult> {
  const supa = createAdminClient()

  const [veloRes, arsenalRes] = await Promise.all([
    supa.from('pitch_velocity_range')
      .select('pitch_type, pitch_name, velo_min, velo_max, velo_avg')
      .eq('player_id', pitcherId)
      .eq('season', season),
    supa.from('pitch_arsenals')
      .select('pitch_type, pitch_name, percentage')
      .eq('player_id', pitcherId)
      .eq('season', season),
  ])

  const veloByType = new Map<string, SeasonVeloRow>(
    (veloRes.data ?? []).map((r: SeasonVeloRow) => [r.pitch_type, r])
  )
  const usageByType = new Map<string, SeasonArsenalRow>(
    (arsenalRes.data ?? []).map((r: SeasonArsenalRow) => [r.pitch_type, r])
  )

  // Aggregate this game's pitches per type: avg velo, usage%, avg break
  const gameByType = new Map<string, { velos: number[]; count: number; vBreak: number[]; hBreak: number[]; spin: number[] }>()
  for (const p of gameSummary.pitches) {
    const key = p.pitchTypeCode
    if (!gameByType.has(key)) gameByType.set(key, { velos: [], count: 0, vBreak: [], hBreak: [], spin: [] })
    const bucket = gameByType.get(key)!
    bucket.count++
    if (p.velocity != null) bucket.velos.push(p.velocity)
    if (p.breakVerticalInduced != null) bucket.vBreak.push(p.breakVerticalInduced)
    if (p.breakHorizontal != null) bucket.hBreak.push(p.breakHorizontal)
    if (p.spinRate != null) bucket.spin.push(p.spinRate)
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  const flags: PitchTrendFlag[] = []
  const gameBreakByPitch: SeasonTrendResult['gameBreakByPitch'] = {}
  const totalGamePitches = gameSummary.totalPitches

  for (const [pitchType, bucket] of gameByType) {
    const seasonVelo = veloByType.get(pitchType)
    const seasonUsage = usageByType.get(pitchType)
    const gameAvgVelo = avg(bucket.velos)
    const gameUsagePct = totalGamePitches > 0 ? (bucket.count / totalGamePitches) * 100 : null
    const pitchName = seasonVelo?.pitch_name ?? seasonUsage?.pitch_name ?? pitchType

    gameBreakByPitch[pitchType] = {
      breakVerticalInduced: avg(bucket.vBreak),
      breakHorizontal: avg(bucket.hBreak),
      spinRate: avg(bucket.spin),
    }

    // Velo delta vs season avg
    if (seasonVelo && gameAvgVelo != null) {
      const delta = gameAvgVelo - seasonVelo.velo_avg
      const standout = Math.abs(delta) >= VELO_STANDOUT_MPH
      flags.push({
        pitchType, pitchName, kind: 'velo',
        detail: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} mph vs season avg (${seasonVelo.velo_avg.toFixed(1)})`,
        standout,
      })
    }

    // Usage delta vs season %
    if (seasonUsage && gameUsagePct != null) {
      const delta = gameUsagePct - seasonUsage.percentage
      const standout = Math.abs(delta) >= USAGE_STANDOUT_PCT
      flags.push({
        pitchType, pitchName, kind: 'usage',
        detail: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pts usage vs season (${seasonUsage.percentage.toFixed(1)}%)`,
        standout,
      })
    }
  }

  return {
    pitcherId,
    flags,
    standoutFlags: flags.filter(f => f.standout),
    gameBreakByPitch,
  }
}