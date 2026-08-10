/**
 * src/lib/fantasy-wrap.ts
 *
 * Composes the Weekly Wrap: calendar-week (Mon–Sun) ownership movers,
 * this week's heating/cooling model signals, and the injury +
 * transaction log for the same window. One function, one shape, feeds
 * the /fantasy/wrap page.
 *
 * ⚠ Calendar-week caveat on ownership: getOwnershipTrend() (in
 * fantasy-ownership.ts) takes a rolling `daysAgo` window, not a
 * start/end date pair — I don't have that file's internals to confirm
 * it supports true calendar-aligned date ranges. This computes
 * daysAgo as "days since this Monday" so a Thursday request looks back
 * to Monday, which approximates the calendar week but isn't a strict
 * Mon-00:00 to Sun-23:59 diff the way the transactions log is. Fine
 * for a Thursday-through-Sunday read; worth revisiting if that file's
 * snapshot cadence doesn't line up cleanly.
 */

import { getFantasyPicks, type FantasyPick } from './fantasy'
import { getOwnershipTrend, type OwnershipChange } from './fantasy-ownership'
import { getWeeklyTransactionReport, type WeeklyTransactionReport } from './fantasy-transactions'

// ─── Calendar week window ────────────────────────────────────────────────────

export type WeekWindow = {
  start: string        // Monday, ISO date
  end: string           // Sunday, ISO date (may be in the future for the current week)
  fetchEnd: string      // Sunday, capped at today for the current week — safe to fetch with
  label: string         // "Jul 13–19"
  isCurrentWeek: boolean
}

function mondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0 = Sun ... 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diff)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}
function iso(d: Date): string {
  return d.toISOString().split('T')[0]
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** offsetWeeks = 0 is the current calendar week, -1 is last week, etc. */
export function getWeekWindow(offsetWeeks: number = 0): WeekWindow {
  const now = new Date()
  const monday = mondayOf(now)
  monday.setUTCDate(monday.getUTCDate() + offsetWeeks * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const isCurrentWeek = offsetWeeks === 0
  const fetchEndDate = isCurrentWeek && sunday.getTime() > today.getTime() ? today : sunday

  return {
    start: iso(monday),
    end: iso(sunday),
    fetchEnd: iso(fetchEndDate),
    label: `${fmtShort(monday)}–${fmtShort(sunday)}`,
    isCurrentWeek,
  }
}

function daysSince(startIso: string): number {
  const start = new Date(startIso + 'T00:00:00Z')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, diff)
}

// ─── Composed wrap data ──────────────────────────────────────────────────────

export type WeeklyWrapData = {
  window: WeekWindow
  ownership: {
    risers: OwnershipChange[]
    fallers: OwnershipChange[]
  }
  trending: {
    heating: FantasyPick[]
    cooling: FantasyPick[]
  }
  transactions: WeeklyTransactionReport
  picksForDate: string
  picksAreStale: boolean
}

export async function getWeeklyWrapData(offsetWeeks: number = 0): Promise<WeeklyWrapData> {
  const window = getWeekWindow(offsetWeeks)
  const daysAgo = daysSince(window.start)

  const [ownershipTrend, picksResult, transactions] = await Promise.all([
    getOwnershipTrend({ daysAgo, minDelta: 2, limit: 200 }).catch(() => ({ risers: [], fallers: [] })),
    getFantasyPicks().catch(() => null),
    getWeeklyTransactionReport(window.start, window.fetchEnd),
  ])

  return {
    window,
    ownership: {
      risers: ownershipTrend.risers.slice(0, 8),
      fallers: ownershipTrend.fallers.slice(0, 8),
    },
    trending: {
      heating: picksResult?.picks.riser.slice(0, 6) ?? [],
      cooling: picksResult?.picks.cooler.slice(0, 6) ?? [],
    },
    transactions,
    picksForDate: picksResult?.forDate ?? window.fetchEnd,
    picksAreStale: picksResult?.isStale ?? false,
  }
}
