/**
 * src/lib/fantasy-streamers.ts
 *
 * Fetches streamer picks across a date range for the /fantasy/streamers
 * deep page. Groups by date for the day-by-day board view.
 */

import { createAdminClient } from '@/lib/supabase'
import type { FantasyPick } from '@/lib/fantasy'

export type StreamerDay = {
  date: string          // 'YYYY-MM-DD'
  displayDate: string   // 'Mon 1 Jun'
  picks: FantasyPick[]
  isToday: boolean
}

/**
 * Get streamer picks for the last N days (default 7).
 * Returns days in reverse chronological order — today first.
 */
export async function getStreamersWeek(days: number = 7): Promise<StreamerDay[]> {
  const supa = createAdminClient()

  // Date window: today minus (days-1) through today
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))

  const startStr = start.toISOString().split('T')[0]
  const endStr = end.toISOString().split('T')[0]

  const { data: rows, error } = await supa
    .from('daily_fantasy_picks')
    .select('*')
    .eq('pick_type', 'streamer')
    .gte('game_date', startStr)
    .lte('game_date', endStr)
    .order('game_date', { ascending: false })
    .order('rank', { ascending: true })

  if (error) {
    console.error('getStreamersWeek error:', error)
    return []
  }

  // Group by date
  const today = new Date().toISOString().split('T')[0]
  const byDate = new Map<string, FantasyPick[]>()
  for (const r of rows ?? []) {
    const d = r.game_date
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(r as FantasyPick)
  }

  // Build day groups (include empty days so the UI can show "no picks this day")
  const result: StreamerDay[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const displayDate = d.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    result.push({
      date: dateStr,
      displayDate,
      picks: byDate.get(dateStr) ?? [],
      isToday: dateStr === today,
    })
  }

  return result
}