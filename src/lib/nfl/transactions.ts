// src/lib/nfl/transactions.ts
//
// Read-side queries against the nfl_transactions table populated by
// scripts/fetch_nfl_transactions.py. Mirrors team-transactions.ts's
// query shape for MLB — same idea (recent injury/status changes,
// filterable by team, ordered by recency), different schema since NFL
// injury status doesn't map to MLB's IL/ACTIVATION/CALLUP vocabulary.

import { createAdminClient } from '../supabase'

export type NFLTransaction = {
  espn_injury_id: string
  athlete_id: string
  player_name: string
  position: string | null
  team_id: string
  team_abbr: string
  team_name: string
  status: string
  status_abbr: string | null
  short_comment: string | null
  long_comment: string | null
  report_date: string
  last_seen_at: string
}

// ── League-wide recent reports (homepage Transactions panel) ──────────────────

// NOTE: getAllRecentNFLTransactions (below) returns EVERYTHING ESPN's
// injuries feed captures, which — confirmed via real data — includes a
// lot of generic camp-report chatter tagged status "Active" that isn't
// actually injury news (e.g. "coach said X is our WR2 now"). That's fine
// for a full injury-log view, but wrong for a homepage "Injury Report"
// panel, which should show genuinely injury-relevant statuses. Use this
// filtered version for the homepage; use the unfiltered one only where
// the full log (including practice-report color) is actually wanted.
const INJURY_RELEVANT_STATUSES = ['Out', 'Doubtful', 'Questionable', 'Injured Reserve']

export async function getHomepageInjuryReport(
  days: number = 7,
  limit: number = 15,
): Promise<NFLTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supa
    .from('nfl_transactions')
    .select('espn_injury_id, athlete_id, player_name, position, team_id, team_abbr, team_name, status, status_abbr, short_comment, long_comment, report_date, last_seen_at')
    .gte('report_date', since)
    .in('status', INJURY_RELEVANT_STATUSES)
    .order('report_date', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getHomepageInjuryReport error:', error.message)
    return []
  }

  return (data ?? []) as NFLTransaction[]
}

export async function getAllRecentNFLTransactions(
  days: number = 7,
  limit: number = 60,
): Promise<NFLTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supa
    .from('nfl_transactions')
    .select('espn_injury_id, athlete_id, player_name, position, team_id, team_abbr, team_name, status, status_abbr, short_comment, long_comment, report_date, last_seen_at')
    .gte('report_date', since)
    .order('report_date', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getAllRecentNFLTransactions error:', error.message)
    return []
  }

  return (data ?? []) as NFLTransaction[]
}

// ── Per-team (team pages) ──────────────────────────────────────────────────────

export async function getTeamNFLTransactions(
  teamId: string,
  days: number = 14,
): Promise<NFLTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supa
    .from('nfl_transactions')
    .select('espn_injury_id, athlete_id, player_name, position, team_id, team_abbr, team_name, status, status_abbr, short_comment, long_comment, report_date, last_seen_at')
    .eq('team_id', teamId)
    .gte('report_date', since)
    .order('report_date', { ascending: false })
    .limit(30)

  if (error) {
    console.error('getTeamNFLTransactions error:', error.message)
    return []
  }

  return (data ?? []) as NFLTransaction[]
}

// ── "Currently Out" list — the NFL equivalent of MLB's Active IL ──────────────
// NOTE: unlike MLB's IL (a discrete state with a clear start/end),
// "Out" here is just the most recent report per player. If a player's
// most recent report says "Out", they're out; there's no separate
// activation event to reconcile against like MLB's ACTIVATION category.
// This does ONE most-recent-report-per-player reduction client-side
// since Supabase's JS client doesn't have a clean DISTINCT ON here.

export async function getCurrentlyOutNFLPlayers(days: number = 10): Promise<NFLTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supa
    .from('nfl_transactions')
    .select('espn_injury_id, athlete_id, player_name, position, team_id, team_abbr, team_name, status, status_abbr, short_comment, long_comment, report_date, last_seen_at')
    .gte('report_date', since)
    .in('status', ['Out', 'Injured Reserve', 'Doubtful'])
    .order('report_date', { ascending: false })
    .limit(200)

  if (error) {
    console.error('getCurrentlyOutNFLPlayers error:', error.message)
    return []
  }

  // Reduce to most-recent report per athlete — a player can have
  // multiple reports in the window (status changes week to week).
  const seen = new Set<string>()
  const latest: NFLTransaction[] = []
  for (const row of (data ?? []) as NFLTransaction[]) {
    if (seen.has(row.athlete_id)) continue
    seen.add(row.athlete_id)
    latest.push(row)
  }
  return latest
}