// src/lib/pitcher-similarity.ts
//
// "Who does this arsenal resemble league-wide?" — computed from real,
// already-collected data (pitch_arsenals: usage%, avg velocity, avg H/V
// break per pitch type per pitcher, league-wide, populated by
// fetch_pitch_arsenals.py + fetch_pitch_velocity_movement.py). This is a
// DERIVED similarity score, not a fetched external fact — documented
// formula below, same as netTilt() in pitcher-arsenal.ts. No proprietary
// "comp" model exists anywhere in this codebase, so this doesn't try to
// reproduce one.
//
// Method: for each of the target's real pitches (>=8% usage), find the
// SAME pitch_type in a candidate's arsenal (no partial credit for "close
// enough" pitch types — a slider only matches a slider) and compute a
// normalized physical distance over [velo, h_break, v_break]. Distances
// are usage-weighted and only candidates covering >=50% of the target's
// usage-weighted pitches (by matching pitch type) are considered — a
// one-pitch reliever should never "match" a 5-pitch starter's fastball
// alone. The resulting 0-100 score is for RANKING only, not a percentage
// of anything real.

import { createAdminClient } from './supabase'

export type SimilarPitcher = {
  playerId: number
  playerName: string
  teamAbbr: string | null
  score: number // 0-100, higher = more similar. Ranking aid, not a real-world percentage.
  matchCoverage: number // 0-1, share of the target's usage-weighted pitches matched by pitch type
  primaryPitch: { name: string; velo: number | null; usage: number } | null
  sharedPitchTypes: string[]
}

type ArsenalRow = {
  player_id: number
  player_name: string
  pitch_type: string
  pitch_name: string | null
  percentage: number | null
  avg_velocity: number | null
  avg_h_break: number | null
  avg_v_break: number | null
}

const VELO_SCALE = 3   // mph — how much velo difference counts as "1 unit"
const BREAK_SCALE = 4  // inches — same idea for H/V break
const MIN_TARGET_USAGE = 8 // % — only compare on pitches the target actually leans on
const MIN_COVERAGE = 0.5   // candidate must match pitch types covering >=50% of target's usage

export async function findSimilarPitchers(
  playerId: number,
  season: number,
  limit = 5,
): Promise<SimilarPitcher[]> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('player_id, player_name, pitch_type, pitch_name, percentage, avg_velocity, avg_h_break, avg_v_break')
    .eq('season', season)

  if (error || !data) return []

  const rows = data as ArsenalRow[]
  const byPlayer = new Map<number, ArsenalRow[]>()
  for (const r of rows) {
    if (r.avg_velocity == null || r.avg_h_break == null || r.avg_v_break == null) continue
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
    byPlayer.get(r.player_id)!.push(r)
  }

  const target = (byPlayer.get(playerId) ?? []).filter(r => (r.percentage ?? 0) >= MIN_TARGET_USAGE)
  if (target.length === 0) return []
  const totalTargetUsage = target.reduce((s, r) => s + (r.percentage ?? 0), 0)

  type Candidate = { playerId: number; playerName: string; score: number; matchCoverage: number; primaryPitch: ArsenalRow | null; sharedPitchTypes: string[] }
  const candidates: Candidate[] = []

  for (const [pid, arsenal] of byPlayer) {
    if (pid === playerId) continue
    const byType = new Map(arsenal.map(r => [r.pitch_type, r]))

    let matchedUsage = 0
    let distSum = 0
    const shared: string[] = []

    for (const t of target) {
      const c = byType.get(t.pitch_type)
      if (!c) continue
      const usage = t.percentage ?? 0
      const dVelo = ((t.avg_velocity! - c.avg_velocity!) / VELO_SCALE)
      const dH = ((t.avg_h_break! - c.avg_h_break!) / BREAK_SCALE)
      const dV = ((t.avg_v_break! - c.avg_v_break!) / BREAK_SCALE)
      const dist = Math.sqrt(dVelo * dVelo + dH * dH + dV * dV)
      matchedUsage += usage
      distSum += dist * usage
      shared.push(t.pitch_type)
    }

    const coverage = totalTargetUsage > 0 ? matchedUsage / totalTargetUsage : 0
    if (coverage < MIN_COVERAGE) continue

    const avgDist = matchedUsage > 0 ? distSum / matchedUsage : Infinity
    const score = Math.round(100 / (1 + avgDist))
    const primaryPitch = [...arsenal].sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0] ?? null

    candidates.push({
      playerId: pid,
      playerName: arsenal[0].player_name,
      score,
      matchCoverage: Math.round(coverage * 100) / 100,
      primaryPitch,
      sharedPitchTypes: shared,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, limit)
  if (top.length === 0) return []

  // One extra query for team abbreviations — pitch_arsenals has no
  // team_id, pitcher_stats does.
  const { data: teamRows } = await supa
    .from('pitcher_stats')
    .select('player_id, team_id')
    .eq('season', season)
    .in('player_id', top.map(c => c.playerId))
  const { MLB_TEAMS } = await import('./teams')
  const teamAbbrById = new Map<number, string>()
  for (const t of (teamRows ?? []) as { player_id: number; team_id: number | null }[]) {
    const team = MLB_TEAMS.find(x => x.id === t.team_id)
    if (team) teamAbbrById.set(t.player_id, team.abbrev)
  }

  return top.map(c => ({
    playerId: c.playerId,
    playerName: c.playerName,
    teamAbbr: teamAbbrById.get(c.playerId) ?? null,
    score: c.score,
    matchCoverage: c.matchCoverage,
    primaryPitch: c.primaryPitch
      ? { name: c.primaryPitch.pitch_name ?? c.primaryPitch.pitch_type, velo: c.primaryPitch.avg_velocity, usage: c.primaryPitch.percentage ?? 0 }
      : null,
    sharedPitchTypes: c.sharedPitchTypes,
  }))
}
