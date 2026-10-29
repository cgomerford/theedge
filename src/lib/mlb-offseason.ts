// src/lib/mlb-offseason.ts
//
// The mini calendar on the MLB homepage once the season is over: the few dates that matter between now and Opening Day. Nothing is invented:
//   the World Series end             the last Final World Series game in the MLB schedule (read in getSeasonState)
//   free agency opens                five days after the World Series ends (the 2022 agreement's rule; checked against 2022, 2023 and 2024)
//   spring training, Opening Day,    the next season's dates from the MLB Stats API (/seasons/{year}), kept 24 hours
//   the All-Star Game
//   the labor agreement expires *    LABOR_DEAL_EXPIRES below, from the 2022 agreement, which runs to 1 December 2026. Edit it here if it changes.
// The asterisk marks a date with a possibility attached: when the agreement ends the league and the players' union either have a new one or they do not, and a lockout (owners
// stopping work) is possible. The page says only that it is possible; it does not say one will happen.

import type { SeasonState } from '@/lib/mlb-home-dashboard'

const API = 'https://statsapi.mlb.com/api/v1'
export const LABOR_DEAL_EXPIRES = '2026-12-01'

export type CalItem = { date: string; label: string; note?: string; star?: boolean }

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export async function getOffseasonCalendar(season: SeasonState): Promise<CalItem[]> {
  const items: CalItem[] = []
  const f = season.lastFinal
  if (f && /world series/i.test(f.note ?? '')) {
    items.push({ date: f.date, label: 'World Series ends', note: `${f.away} ${f.awayScore}, ${f.home} ${f.homeScore} in the last game` })
    items.push({ date: addDays(f.date, 5), label: 'Free agency opens', note: 'Five days after the World Series ends' })
  }
  if (season.today <= addDays(LABOR_DEAL_EXPIRES, 120)) {
    items.push({ date: LABOR_DEAL_EXPIRES, label: 'Labor agreement expires', star: true, note: 'The current collective bargaining agreement ends' })
  }
  const year = season.nextStart ? Number(season.nextStart.slice(0, 4)) : season.year + 1
  try {
    const res = await fetch(`${API}/seasons/${year}?sportId=1`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const s = (await res.json())?.seasons?.[0] as { springStartDate?: string; regularSeasonStartDate?: string; allStarDate?: string } | undefined
      if (s?.springStartDate) items.push({ date: s.springStartDate, label: 'Spring training games begin' })
      if (s?.regularSeasonStartDate) items.push({ date: s.regularSeasonStartDate, label: 'Opening Day' })
      if (s?.allStarDate) items.push({ date: s.allStarDate, label: 'All-Star Game' })
    } else console.error('[getOffseasonCalendar] season HTTP', res.status)
  } catch (err) { console.error('[getOffseasonCalendar] failed:', err instanceof Error ? err.message : err) }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}
