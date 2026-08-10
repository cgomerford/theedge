// src/app/admin/yesterday-stats/page.tsx
//
// Pulls every Final game from yesterday, prefers the cached report_data
// (written by the postgame-emails cron and by the game page itself once
// wired), and falls back to fetching + aggregating live for any game the
// cache missed — so this page works even before the cron has run.
//
// SUPABASE CLIENT: same note as the print route — self-contained
// createClient() call rather than an assumed shared-client import path.
// Swap for your real one if you have it.
import { createAdminClient } from '@/lib/supabase'
import { getGamesForDate, getLiveFeed } from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { compileYesterdayStats } from '@/lib/yesterday-stats'
import { YesterdayStatsView } from '@/components/admin/YesterdayStatsView'
import type { PostgameReport } from '@/types/postgame'
const supa = createAdminClient()

function yesterdayDate(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default async function YesterdayStatsPage() {
  const date = yesterdayDate()
  const slate = await getGamesForDate(date)
  const finalGames = slate.filter(g => g.status === 'Final')

  const { data: cached } = await supa
    .from('game_postgame_reports')
    .select('game_pk, report_data')
    .eq('game_date', date)

  const cachedByPk = new Map((cached ?? []).map(row => [row.game_pk, row.report_data as PostgameReport]))

  const reports: PostgameReport[] = []
  let missing = 0

  for (const g of finalGames) {
    const fromCache = cachedByPk.get(g.gamePk)
    if (fromCache) {
      reports.push(fromCache)
      continue
    }
    const feed = await getLiveFeed(g.gamePk)
    const aggregated = feed ? aggregateGameFeed(feed, `fallback-${g.gamePk}`) : null
    if (aggregated) reports.push(aggregated)
    else missing += 1
  }

  const payload = compileYesterdayStats(reports, date, missing)

  return <YesterdayStatsView payload={payload} />
}
