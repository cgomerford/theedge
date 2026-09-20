// src/lib/pitch-type-percentiles.ts
//
// "How does THIS pitch grade?" — percentiles for one pitcher's one pitch
// type, computed against every OTHER pitcher's same pitch type league-wide
// (real pitch_arsenals rows, season-scoped, min 20 pitches to enter the
// comparison pool — same idea as getPitcherStatsTable's minIp guard).
// No proprietary Stuff+/proStuff+ model — same real-columns-only rule as
// pitcher-percentiles.ts.
//
// Also appends real spin rate + release extension percentiles (live from
// Savant's own aggregated leaderboard — see pitch-physical-percentiles.ts;
// pitch_arsenals doesn't carry those two columns) alongside the movement
// percentile below, same pattern: a real value, ranked against a real
// same-pitch-type league pool, appended as one more PitchGradeStat.

import { createAdminClient } from './supabase'
import { getPitchPhysicalPercentiles } from './pitch-physical-percentiles'

export type PitchGradeStat = {
  key: string
  label: string
  value: string
  percentile: number | null
}

type Row = {
  player_id: number
  avg_velocity: number | null
  whiff_percent: number | null
  put_away_percent: number | null
  k_percent: number | null
  hard_hit_percent: number | null
  est_woba: number | null
  ba_against: number | null
  avg_h_break: number | null
  avg_v_break: number | null
  count: number
}

const COLS: { key: keyof Row; label: string; higherIsBetter: boolean; fmt: (v: number) => string }[] = [
  { key: 'avg_velocity',     label: 'Velo',       higherIsBetter: true,  fmt: v => `${v.toFixed(1)} mph` },
  { key: 'whiff_percent',    label: 'Whiff%',     higherIsBetter: true,  fmt: v => `${v.toFixed(1)}%` },
  { key: 'put_away_percent', label: 'Put-Away%',  higherIsBetter: true,  fmt: v => `${v.toFixed(1)}%` },
  { key: 'k_percent',        label: 'K%',         higherIsBetter: true,  fmt: v => `${v.toFixed(1)}%` },
  { key: 'hard_hit_percent', label: 'Hard-Hit%',  higherIsBetter: false, fmt: v => `${v.toFixed(1)}%` },
  { key: 'est_woba',         label: 'xwOBA',      higherIsBetter: false, fmt: v => v.toFixed(3).replace(/^0\./, '.') },
  { key: 'ba_against',       label: 'BA',         higherIsBetter: false, fmt: v => v.toFixed(3).replace(/^0\./, '.') },
]

const MIN_POOL_PITCHES = 20

function movementMag(r: { avg_h_break: number | null; avg_v_break: number | null }): number | null {
  if (r.avg_h_break == null || r.avg_v_break == null) return null
  return Math.sqrt(r.avg_h_break ** 2 + r.avg_v_break ** 2)
}

export async function getPitchTypePercentiles(
  playerId: number,
  pitchType: string,
  season: number,
): Promise<{ stats: PitchGradeStat[]; poolSize: number }> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('player_id, avg_velocity, whiff_percent, put_away_percent, k_percent, hard_hit_percent, est_woba, ba_against, avg_h_break, avg_v_break, count')
    .eq('season', season)
    .eq('pitch_type', pitchType)
    .gte('count', MIN_POOL_PITCHES)

  if (error || !data) return { stats: [], poolSize: 0 }
  const rows = data as Row[]
  const self = rows.find(r => r.player_id === playerId)

  const stats: PitchGradeStat[] = COLS.map(col => {
    const rawValue = self?.[col.key]
    if (typeof rawValue !== 'number') {
      return { key: col.key as string, label: col.label, value: '—', percentile: null }
    }
    const vals = rows.map(r => r[col.key]).filter((v): v is number => typeof v === 'number')
    let percentile: number | null = null
    if (vals.length >= 5) {
      const sorted = [...vals].sort((a, b) => a - b)
      let rank = sorted.filter(v => v <= rawValue).length / sorted.length
      if (!col.higherIsBetter) rank = 1 - rank
      percentile = Math.round(rank * 100)
    }
    return { key: col.key as string, label: col.label, value: col.fmt(rawValue), percentile }
  })

  // Movement magnitude — total break (real avg_h_break/avg_v_break,
  // combined), percentile vs the same pitch-type pool. "More break = more
  // deceptive" is a simplifying real-world assumption, disclosed — not
  // every extra inch of break is unambiguously good for every pitch, but
  // it's a defensible single real signal, same spirit as the rest of
  // this file's percentile columns.
  const selfMag = self ? movementMag(self) : null
  if (selfMag != null) {
    const mags = rows.map(movementMag).filter((v): v is number => v != null)
    let percentile: number | null = null
    if (mags.length >= 5) {
      const sorted = [...mags].sort((a, b) => a - b)
      percentile = Math.round((sorted.filter(v => v <= selfMag).length / sorted.length) * 100)
    }
    stats.push({ key: 'movement', label: 'Movement', value: `${selfMag.toFixed(1)}"`, percentile })
  } else {
    stats.push({ key: 'movement', label: 'Movement', value: '—', percentile: null })
  }

  // Spin rate + release extension — real, live from Savant's own
  // aggregated leaderboard (not in pitch_arsenals), ranked against every
  // other pitcher who's thrown this same pitch type this season. More
  // extension means the ball leaves the pitcher's hand closer to the
  // plate, so the batter has real less reaction time — a genuine
  // scouting signal, not just velocity restated.
  const physical = await getPitchPhysicalPercentiles(playerId, pitchType, season)
  stats.push({
    key: 'spin_rate', label: 'Spin', percentile: physical.spin.percentile,
    value: physical.spin.value != null ? `${Math.round(physical.spin.value)} rpm` : '—',
  })
  stats.push({
    key: 'extension', label: 'Extension', percentile: physical.extension.percentile,
    value: physical.extension.value != null ? `${physical.extension.value.toFixed(2)} ft` : '—',
  })

  return { stats, poolSize: rows.length }
}
