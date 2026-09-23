// src/lib/abs-challenges.ts
//
// ABS (Automated Ball-Strike) Challenge System record, per team, for the
// current season. Reads the precomputed abs_challenge_team_leaderboard
// table — populated daily by scripts/fetch_abs_challenge_leaderboard.py
// (that script is the single writer; see its header for the full story).
//
// This used to fetch Baseball Savant's abs-challenges leaderboard CSV
// live, at request time. That CSV export started returning HTTP 500 in
// Sept 2026 regardless of query params (curl-verified), which silently
// blanked the "Who's challenging" and "Leaderboards" boxes on /mlb/abs —
// and doing a live Savant fetch in the render path was already against
// this codebase's own rule (CLAUDE.md: precompute and store). Moved to
// the standard cron -> Python -> Supabase -> page pattern instead.

import { createAdminClient } from '@/lib/supabase'
import { MLB_TEAMS } from '@/lib/mlb-assets'

export type ABSChallengeRecord = {
  team_abbr: string
  season: number
  // Batter-initiated (challenging called strikes)
  batting_challenges: number
  batting_overturns: number
  batting_confirms: number
  batting_success_rate: number | null
  // Pitcher/catcher-initiated (challenging called balls)
  pitching_challenges: number
  pitching_overturns: number
  pitching_confirms: number
  pitching_success_rate: number | null
  // Combined, both directions
  total_challenges: number
  total_overturns: number
  total_success_rate: number | null
}

type Row = {
  team_id: number
  season: number
  batting_challenges: number | string
  batting_overturns: number | string
  batting_confirms: number | string
  batting_success_rate: number | string | null
  pitching_challenges: number | string
  pitching_overturns: number | string
  pitching_confirms: number | string
  pitching_success_rate: number | string | null
  total_challenges: number | string
  total_overturns: number | string
  total_success_rate: number | string | null
}

function toRecord(row: Row): ABSChallengeRecord | null {
  const teamAbbr = MLB_TEAMS[row.team_id]?.abbr
  if (!teamAbbr) return null // unrecognized team id — skip rather than mislabel

  const numOrNull = (v: number | string | null) => (v == null ? null : Number(v))

  return {
    team_abbr: teamAbbr,
    season: Number(row.season),
    batting_challenges: Number(row.batting_challenges) || 0,
    batting_overturns: Number(row.batting_overturns) || 0,
    batting_confirms: Number(row.batting_confirms) || 0,
    batting_success_rate: numOrNull(row.batting_success_rate),
    pitching_challenges: Number(row.pitching_challenges) || 0,
    pitching_overturns: Number(row.pitching_overturns) || 0,
    pitching_confirms: Number(row.pitching_confirms) || 0,
    pitching_success_rate: numOrNull(row.pitching_success_rate),
    total_challenges: Number(row.total_challenges) || 0,
    total_overturns: Number(row.total_overturns) || 0,
    total_success_rate: numOrNull(row.total_success_rate),
  }
}

export async function getABSChallengeRecord(teamAbbr: string): Promise<ABSChallengeRecord | null> {
  const teamId = Object.entries(MLB_TEAMS).find(([, t]) => t.abbr === teamAbbr)?.[0]
  if (!teamId) return null

  const supa = createAdminClient()
  const { data, error } = await supa
    .from('abs_challenge_team_leaderboard')
    .select('*')
    .eq('team_id', Number(teamId))
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code !== 'PGRST205') console.error('[getABSChallengeRecord] Supabase error:', error.message)
    return null
  }
  if (!data) return null

  return toRecord(data as unknown as Row)
}

// League-wide version for the homepage board and /mlb/abs deep dive —
// sorted by total challenges desc so the busiest challenge teams surface
// first. Only the latest season present in the table is returned, so a
// season rollover doesn't mix two years of counts together.
export async function getABSChallengeLeaderboard(): Promise<ABSChallengeRecord[]> {
  const supa = createAdminClient()

  const { data: latest, error: latestError } = await supa
    .from('abs_challenge_team_leaderboard')
    .select('season')
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    if (latestError.code !== 'PGRST205') console.error('[getABSChallengeLeaderboard] Supabase error:', latestError.message)
    return []
  }
  if (!latest) return []

  const { data, error } = await supa
    .from('abs_challenge_team_leaderboard')
    .select('*')
    .eq('season', latest.season)

  if (error) {
    console.error('[getABSChallengeLeaderboard] Supabase error:', error.message)
    return []
  }
  if (!data) return []

  const records = (data as unknown as Row[])
    .map(toRecord)
    .filter((r): r is ABSChallengeRecord => r !== null)

  return records.sort((a, b) => b.total_challenges - a.total_challenges)
}
