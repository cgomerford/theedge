/**
 * src/lib/fantasy.ts
 *
 * Data access for the /fantasy page.
 * Reads from `daily_fantasy_picks` — a precomputed table populated
 * once per day by `scripts/compute_fantasy_picks.py`.
 *
 * The page never recomputes — it just SELECTs and renders.
 */

import { createAdminClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PickType = 'streamer' | 'mover' | 'faller' | 'sleeper'

export type FantasyPick = {
  id:             number
  game_date:      string
  pick_type:      PickType
  rank:           number
  player_id:      number | null
  player_name:    string
  team_name:      string | null
  opponent_name:  string | null
  game_pk:        number | null
  game_slug:      string | null
  game_time:      string | null
  details:        Record<string, any>
  headline:       string
  one_liner:      string
  signal_score:   number | null
  created_at:     string
}

export type FantasyPicksByType = {
  streamer: FantasyPick[]
  mover:    FantasyPick[]
  faller:   FantasyPick[]
  sleeper:  FantasyPick[]
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Get all of today's fantasy picks, grouped by pick_type.
 * Falls back to yesterday if today's picks haven't been computed yet
 * (the cron runs at 23:30 UTC — so an early UK morning visit might see yesterday).
 */
export async function getFantasyPicks(): Promise<{
  picks:    FantasyPicksByType
  forDate:  string         // ISO date of the picks shown (may be yesterday)
  isStale:  boolean        // true if showing yesterday
}> {
  const supa = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: todayData } = await supa
    .from('daily_fantasy_picks')
    .select('*')
    .eq('game_date', today)
    .order('rank', { ascending: true })

  if (todayData && todayData.length > 0) {
    return {
      picks:   groupByType(todayData as FantasyPick[]),
      forDate: today,
      isStale: false,
    }
  }

  // Fallback — show yesterday's if today not computed yet
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const ydayStr = yesterday.toISOString().split('T')[0]

  const { data: ydayData } = await supa
    .from('daily_fantasy_picks')
    .select('*')
    .eq('game_date', ydayStr)
    .order('rank', { ascending: true })

  return {
    picks:   groupByType((ydayData ?? []) as FantasyPick[]),
    forDate: ydayStr,
    isStale: true,
  }
}

function groupByType(rows: FantasyPick[]): FantasyPicksByType {
  const out: FantasyPicksByType = { streamer: [], mover: [], faller: [], sleeper: [] }
  for (const r of rows) {
    if (out[r.pick_type]) out[r.pick_type].push(r)
  }
  return out
}