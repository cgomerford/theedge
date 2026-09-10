// src/lib/edge-coverage-stats.ts
//
// 2026-08-23: new. Computes a real "games analyzed this season" count
// for the homepage stat grid — total completed MLB games since reports
// started, via the same schedule endpoint pattern used throughout this
// codebase (see bullpen-usage.ts's getSeasonGamePks). Not a Supabase
// count of reports actually generated — that would be more precise but
// needs a real query against whatever table tracks that, which hasn't
// been confirmed yet. This is a defensible proxy: every completed game
// in the date range is a game The Edge would have covered.
//
// REPORTS_START_DATE below is a placeholder — confirm the actual date
// the first daily report went out and update it.

const MLB_API_V1 = 'https://statsapi.mlb.com/api/v1'

const REPORTS_START_DATE = '2026-05-01' // TODO: confirm actual launch date

export async function getGamesAnalyzedCount(season: number): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const url = `${MLB_API_V1}/schedule?sportId=1&season=${season}&gameType=R&startDate=${REPORTS_START_DATE}&endDate=${today}`
    const res = await fetch(url, { next: { revalidate: 21600 } }) // 6h — matches other season-wide schedule fetches
    if (!res.ok) return 0
    const data = await res.json()
    let count = 0
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        if (game.status?.abstractGameState === 'Final') count++
      }
    }
    return count
  } catch (err) {
    console.error('Games analyzed count fetch failed:', err)
    return 0
  }
}